'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {ContaUnicaCandidataSQLite}=
 require('../src/domain/conta-unica-candidata-sqlite');

async function ambiente(t){
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-recuperacao-duas-instancias-'));
 const arquivo=path.join(pasta,'identidade.sqlite');
 const b1=new DatabaseSync(arquivo);
 const b2=new DatabaseSync(arquivo);
 for(const banco of [b1,b2]){
  banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;');
 }
 t.after(()=>{
  b2.close();b1.close();fs.rmSync(pasta,{recursive:true,force:true});
 });
 const chaves={chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveRecuperacao:randomBytes(32)};
 const enviados=[];
 const enviarRecuperacao=async dados=>{enviados.push(dados);return true;};
 const a=new ContaUnicaCandidataSQLite({
  banco:b1,...chaves,enviarRecuperacao
 });
 const b=new ContaUnicaCandidataSQLite({
  banco:b2,...chaves,enviarRecuperacao
 });
 await a.cadastrar({
  nome:'Cliente Ensaio',nick:'Cliente',email:'cliente@example.invalid',
  senha:'SenhaInicial2026!',aceiteExplicito:true,
  termosVersao:'LAB-recuperacao-duas-instancias',
  termosTexto:'Apenas uma prova ficticia de seguranca de contas; nao permite pagamentos nem acesso comercial.'
 });
 await a.solicitarRecuperacao({email:'cliente@example.invalid'});
 assert.equal(enviados.length,1);
 const codigo=enviados[0].codigo;
 const errado=codigo==='12345678'?'12345679':'12345678';
 const entrada=(cod,novaSenha='SenhaNovaFicticia2026!')=>({
  email:'cliente@example.invalid',codigo:cod,novaSenha
 });
 return {a,b,b1,b2,codigo,errado,entrada};
}

test('duas instancias SQLite somam cinco erros e revogam codigo',async t=>{
 const x=await ambiente(t);
 const tentativas=Array.from({length:8},(_,i)=>
  (i%2===0?x.a:x.b).confirmarRecuperacao(x.entrada(x.errado))
 );
 const r=await Promise.allSettled(tentativas);
 assert.equal(r.filter(x=>x.status==='rejected').length,8);
 assert.ok(r.every(x=>x.reason.codigo==='RECUPERACAO_CODIGO_OU_SENHA_INVALIDOS'));
 for(const banco of [x.b1,x.b2]){
  const registro=banco.prepare([
   'SELECT estado,tentativas FROM akitemm_recuperacao_senha_candidata'
  ].join(' ')).get();
  assert.equal(registro.tentativas,5);
  assert.equal(registro.estado,'BLOQUEADO');
 }
 await assert.rejects(x.a.confirmarRecuperacao(x.entrada(x.codigo)),
  {codigo:'RECUPERACAO_CODIGO_OU_SENHA_INVALIDOS'});
 const login=await x.b.entrar({nick:'Cliente',senha:'SenhaInicial2026!'});
 assert.ok(login.token,'codigo revogado nao modifica a senha verdadeira');
});

test('codigo correto em hash pendente nao vence quinta falha em outra instancia',async t=>{
 const x=await ambiente(t);
 for(let i=0;i<4;i++)await assert.rejects(
  (i%2===0?x.a:x.b).confirmarRecuperacao(x.entrada(x.errado)),
  {codigo:'RECUPERACAO_CODIGO_OU_SENHA_INVALIDOS'});
 const tentativaCorreta=x.a.confirmarRecuperacao(x.entrada(x.codigo));
 // O hash de senha e assincrono; o outro processo pode bloquear o desafio
 // enquanto o reset valido ainda calcula o hash.
 await assert.rejects(x.b.confirmarRecuperacao(x.entrada(x.errado)),
  {codigo:'RECUPERACAO_CODIGO_OU_SENHA_INVALIDOS'});
 await assert.rejects(tentativaCorreta,
  {codigo:'RECUPERACAO_CODIGO_OU_SENHA_INVALIDOS'});
 const desafio=x.b2.prepare(
  'SELECT estado,tentativas FROM akitemm_recuperacao_senha_candidata'
 ).get();
 assert.equal(desafio.estado,'BLOQUEADO');
 assert.equal(desafio.tentativas,5);
 assert.ok((await x.a.entrar({
  nick:'Cliente',senha:'SenhaInicial2026!'
 })).token);
 assert.equal(x.b1.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(x.b2.prepare('PRAGMA foreign_key_check').all(),[]);
});
