'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {ContaUnicaCandidataSQLite,COOKIE}=require('../src/domain/conta-unica-candidata-sqlite');
const TERMOS='Somente ensaio de autenticação sem dinheiro nem direitos comerciais.';

async function preparar(t){
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON;');
 t.after(()=>banco.close());
 const conta=new ContaUnicaCandidataSQLite({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32)
 });
 await conta.cadastrar({nome:'Teste Concorrente',nick:'Teste',
  email:'teste-concorrente@example.invalid',
  senha:'SenhaCorreta2026!Forte',termosVersao:'LAB-login-concorrente',
  termosTexto:TERMOS,aceiteExplicito:true});
 return {banco,conta};
}

test('oito erros concorrentes nao perdem incrementos e bloqueiam a conta',async t=>{
 const {banco,conta}=await preparar(t);
 const pedidos=Array.from({length:8},()=>conta.entrar({
  nick:'Teste',senha:'SenhaIncorretaCompletamente!'
 }));
 const saidas=await Promise.allSettled(pedidos);
 assert.ok(saidas.every(x=>x.status==='rejected'));
 const row=banco.prepare(
  'SELECT tentativas,bloqueado_ate FROM akitemm_conta_unica_candidata'
 ).get();
 assert.equal(row.tentativas,5);
 assert.ok(row.bloqueado_ate>Date.now());
 await assert.rejects(conta.entrar({
  nick:'Teste',senha:'SenhaCorreta2026!Forte'
 }),{codigo:'CONTA_TEMPORARIAMENTE_BLOQUEADA'});
 assert.equal(banco.prepare(
  'SELECT COUNT(*) AS n FROM akitemm_sessoes_candidatas'
 ).get().n,0);
});

test('login iniciado antes de alteracao da senha nao recria sessao revogada',async t=>{
 const {banco,conta}=await preparar(t);
 const anterior=conta.entrar({nick:'Teste',senha:'SenhaCorreta2026!Forte'});
 // O login ja leu o salt e esta aguardando scrypt. Simular a revogacao
 // efetivada por troca/redefinicao em outra requisicao nesse intervalo.
 banco.exec('BEGIN IMMEDIATE');
 try{
  banco.prepare([
   'UPDATE akitemm_conta_unica_candidata',
   'SET senha_hash=?'
  ].join(' ')).run('a'.repeat(128));
  banco.prepare('DELETE FROM akitemm_sessoes_candidatas').run();
  banco.exec('COMMIT');
 }catch(e){banco.exec('ROLLBACK');throw e;}
 await assert.rejects(anterior,{codigo:'CREDENCIAIS_INVALIDAS'});
 assert.equal(banco.prepare(
  'SELECT COUNT(*) AS n FROM akitemm_sessoes_candidatas'
 ).get().n,0,'hash antigo nao pode autorizar sessao nova');
 assert.equal(banco.prepare(
  'SELECT tentativas FROM akitemm_conta_unica_candidata'
 ).get().tentativas,0,'troca concorrente nao equivale a senha errada');
});

test('troca de senha: erros simultaneos preservam bloqueio e nao perdem tentativas',async t=>{
 const {banco,conta}=await preparar(t);
 const login=await conta.entrar({nick:'Teste',senha:'SenhaCorreta2026!Forte'});
 const req={get(campo){
  if(campo==='cookie')return COOKIE+'='+login.token;
  if(campo==='x-checkout-csrf')return login.csrf;
  return undefined;
 }};
 const trocas=await Promise.allSettled(Array.from({length:8},()=>
  conta.trocarSenha({
   req,senhaAtual:'SenhaIncorretaCompletamente!',
   novaSenha:'OutraSenhaDeLaboratorio2026!'
  })
 ));
 assert.ok(trocas.every(r=>r.status==='rejected'),
  'nenhuma senha incorreta pode trocar credencial');
 const erros=trocas.map(r=>r.reason.codigo);
 assert.equal(erros.filter(c=>c==='SENHA_ATUAL_INCORRETA').length,5);
 assert.equal(erros.filter(c=>c==='CONTA_TEMPORARIAMENTE_BLOQUEADA').length,3);
 const estado=banco.prepare(
  'SELECT tentativas,bloqueado_ate FROM akitemm_conta_unica_candidata'
 ).get();
 assert.equal(estado.tentativas,5);
 assert.ok(estado.bloqueado_ate>Date.now());
 await assert.rejects(conta.entrar({
  nick:'Teste',senha:'SenhaCorreta2026!Forte'
 }),{codigo:'CONTA_TEMPORARIAMENTE_BLOQUEADA'});
});

test('limite de trabalho scrypt protege operacao contra rajada anonima',async t=>{
 const {banco,conta}=await preparar(t);
 const tentativas=Array.from({length:40},()=>conta.entrar({
  nick:'Fantasma',senha:'SenhaFicticiaTentativa2026!'
 }));
 const resultados=await Promise.allSettled(tentativas);
 assert.ok(resultados.every(x=>x.status==='rejected'));
 const codigos=resultados.map(x=>x.reason.codigo);
 assert.ok(codigos.filter(x=>x==='AUTENTICACAO_TEMPORARIAMENTE_OCUPADA').length>=24,
  'excesso de scrypt pendente deve ser rejeitado sem executar mais hashes');
 assert.ok(codigos.filter(x=>x==='CREDENCIAIS_INVALIDAS').length<=16);
 assert.equal(banco.prepare(
  'SELECT COUNT(*) AS n FROM akitemm_sessoes_candidatas'
 ).get().n,0,'rajada anonima nao cria sessao');
 const legitimo=await conta.entrar({nick:'Teste',senha:'SenhaCorreta2026!Forte'});
 assert.ok(legitimo.token,'apos drenar carga, login legitimo volta a funcionar');
});

test('sessao do cliente: no maximo cinco por titular, revogando a mais antiga',async t=>{
 const {banco,conta}=await preparar(t);
 const acessos=[];
 for(let i=0;i<7;i++){
  const s=await conta.entrar({nick:'Teste',senha:'SenhaCorreta2026!Forte'});
  acessos.push(s.token);
 }
 const ler=token=>conta.sessao({get(nome){
  return nome==='cookie'?COOKIE+'='+token:undefined;
 }});
 assert.equal(banco.prepare(
  'SELECT COUNT(*) AS total FROM akitemm_sessoes_candidatas'
 ).get().total,5);
 assert.equal(ler(acessos[0]),null,'sessao mais antiga nao pode continuar ativa');
 assert.equal(ler(acessos[1]),null,'segunda sessao mais antiga revogada');
 for(const token of acessos.slice(2))
  assert.ok(ler(token),'ultimas cinco sessoes permanecem validas');
});

test('sessao expirada e removida do SQLite no proximo login legitimo',async t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 t.after(()=>banco.close());
 let agora=1_800_000_000_000;
 const conta=new ContaUnicaCandidataSQLite({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  agora:()=>agora
 });
 await conta.cadastrar({nome:'Teste Expiracao',nick:'Expira',
  email:'expira@example.invalid',senha:'SenhaCorreta2026!Forte',
  termosVersao:'LAB-limpeza-sessoes-2026',termosTexto:TERMOS,
  aceiteExplicito:true});
 const anterior=await conta.entrar({nick:'Expira',senha:'SenhaCorreta2026!Forte'});
 assert.equal(banco.prepare(
  'SELECT COUNT(*) AS total FROM akitemm_sessoes_candidatas'
 ).get().total,1);
 agora=anterior.expiraEm+1;
 const novo=await conta.entrar({nick:'Expira',senha:'SenhaCorreta2026!Forte'});
 assert.ok(novo.token);
 assert.equal(banco.prepare(
  'SELECT COUNT(*) AS total FROM akitemm_sessoes_candidatas'
 ).get().total,1,'expurgo nao deve acumular cookies vencidos');
 assert.equal(conta.sessao({get:k=>k==='cookie'?COOKIE+'='+anterior.token:''}),null);
 assert.ok(conta.sessao({get:k=>k==='cookie'?COOKIE+'='+novo.token:''}));
});
