'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {AuditoriaAcessoParticipanteDemoSQLite}=require('../src/domain/auditoria-acesso-participante-demo-sqlite');
const {SessoesParticipanteDemo,DURACAO}=require('../src/domain/sessoes-participante-demo');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const TOKEN='laboratorio-auditoria-participante-token-2026';
function preparar(t){
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-auditoria-sessoes-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const repo=new RepositorioCatalogoSQLite({caminho:path.join(pasta,'dados.sqlite')});
 t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const auditoria=new AuditoriaAcessoParticipanteDemoSQLite({banco:repo.banco});
 const ponte=new PonteComprasConvitesDemoSQLite({
  banco:repo.banco,contas,
  consultarPagamentoConfiavel:async()=>{throw new Error('pagamentos nao habilitados');}
 });
 return {repo,contas,auditoria,ponte};
}
function cadastrar(contas,nome,email){
 return contas.cadastrar({nome,email,senha:'senha-exclusiva-ficticia'});
}
async function servidor(t,repo){
 const app=criarAppAdminLaboratorio({repositorio:repo,segredo:TOKEN});
 const s=app.listen(0,'127.0.0.1');
 await once(s,'listening');
 t.after(()=>new Promise(resolve=>s.close(resolve)));
 return 'http://127.0.0.1:'+s.address().port;
}
async function login(base,nome,senha='senha-exclusiva-ficticia',headers={}){
 return fetch(base+'/api/laboratorio/participante/entrar',{
  method:'POST',headers:{
   'Content-Type':'application/json','X-LOOP-LAB':'participante',...headers
  },
  body:JSON.stringify({nome,senha})
 });
}

test('auditoria registra eventos sem nome, IP, senha ou token e impede alterar/apagar',t=>{
 const m=preparar(t);
 const a=cadastrar(m.contas,'Pessoa Demonstrativa A','pessoa-a@exemplo.invalid');
 let agora=1730000000000;
 const s=new SessoesParticipanteDemo({
  contas:m.contas,auditoria:m.auditoria,agoraMs:()=>agora
 });
 assert.throws(()=>s.entrar({
  nome:'Pessoa Demonstrativa A',senha:'senha-errada-da-tentativa',origem:'127.0.0.1'
 }),e=>e.codigo==='LOGIN_DE_TESTE_INVALIDO');
 const ok=s.entrar({nome:'Pessoa Demonstrativa A',senha:'senha-exclusiva-ficticia',origem:'127.0.0.1'});
 assert.equal(s.identificar(ok.token),a.contaId);
 assert.equal(s.sair(ok.token),true);
 assert.equal(s.identificar(ok.token),null);
 const relatorio=m.auditoria.consultar();
 assert.equal(relatorio.quantidades.LOGIN_INVALIDO,1);
 assert.equal(relatorio.quantidades.LOGIN_SUCESSO,1);
 assert.equal(relatorio.quantidades.SESSAO_ENCERRADA,1);
 assert.equal(relatorio.eventos.length,3);
 assert.equal(relatorio.semIdentificacaoDeUsuariosNoRelatorio,true);
 const json=JSON.stringify(relatorio);
 for(const segredo of ['senha-exclusiva-ficticia','senha-errada-da-tentativa',
  'pessoa-a@exemplo.invalid','Pessoa Demonstrativa A','127.0.0.1',ok.token,a.contaId]){
  assert.equal(json.includes(segredo),false);
 }
 assert.throws(()=>m.repo.banco.exec(
  'UPDATE admin_acessos_participante_demo SET tipo=\'LOGIN_INVALIDO\''
 ),/imutavel/);
 assert.throws(()=>m.repo.banco.exec('DELETE FROM admin_acessos_participante_demo'),/imutavel/);
 assert.throws(()=>m.auditoria.registrar({tipo:'TOKEN_EXPOSTO'}),/invalido/);
 assert.throws(()=>m.auditoria.consultar({limite:10000}),/invalido/);
});
test('bloqueio repetido registra um evento por janela, sem explodir o livro de auditoria',t=>{
 const m=preparar(t);
 cadastrar(m.contas,'Pessoa Demonstrativa A','pessoa-a@exemplo.invalid');
 let agora=1730000000000;
 const s=new SessoesParticipanteDemo({
  contas:m.contas,auditoria:m.auditoria,agoraMs:()=>agora
 });
 for(let i=0;i<5;i++){
  assert.throws(()=>s.entrar({
   nome:'Pessoa Demonstrativa A',senha:'senha-invalida-ficticia',origem:'127.0.0.1'
  }),e=>e.codigo==='LOGIN_DE_TESTE_INVALIDO');
 }
 for(let i=0;i<7;i++){
  assert.throws(()=>s.entrar({
   nome:'Pessoa Demonstrativa A',senha:'senha-exclusiva-ficticia',origem:'127.0.0.1'
  }),e=>e.codigo==='LIMITE_LOGIN_DE_TESTE');
 }
 let r=m.auditoria.consultar();
 assert.equal(r.quantidades.LOGIN_INVALIDO,5);
 assert.equal(r.quantidades.LOGIN_BLOQUEADO,1);
 agora+=15*60*1000+1;
 const nova=s.entrar({
  nome:'Pessoa Demonstrativa A',senha:'senha-exclusiva-ficticia',origem:'127.0.0.1'
 });
 assert.equal(s.identificar(nova.token)!==null,true);
 r=m.auditoria.consultar();
 assert.equal(r.quantidades.LOGIN_SUCESSO,1);
});
test('falha de auditoria bloqueia abertura de nova sessao, sem token fantasma',t=>{
 const m=preparar(t);
 cadastrar(m.contas,'Pessoa Demonstrativa A','pessoa-a@exemplo.invalid');
 const auditoria={registrar(){throw new Error('banco indisponivel');}};
 const s=new SessoesParticipanteDemo({contas:m.contas,auditoria});
 assert.throws(()=>s.entrar({
  nome:'Pessoa Demonstrativa A',senha:'senha-exclusiva-ficticia'
 }),/banco indisponivel/);
 assert.equal(s.sessoes.size,0);
});

test('API recusa CSRF e rotaciona cookie ao alternar a conta na mesma maquina',async t=>{
 const m=preparar(t);
 const a=cadastrar(m.contas,'Titular Local Um','um@exemplo.invalid');
 const b=cadastrar(m.contas,'Titular Local Dois','dois@exemplo.invalid');
 const base=await servidor(t,m.repo);
 const url=base+'/api/laboratorio/participante/entrar';
 const payload=JSON.stringify({nome:a.nome,senha:'senha-exclusiva-ficticia'});
 assert.equal((await fetch(url,{
  method:'POST',headers:{'Content-Type':'application/json'},body:payload
 })).status,403);
 assert.equal((await fetch(url,{
  method:'POST',headers:{
   'Content-Type':'application/json','X-LOOP-LAB':'participante',
   'Sec-Fetch-Site':'cross-site'
  },body:payload
 })).status,403);
 assert.equal((await fetch(url,{
  method:'POST',headers:{
   'Content-Type':'application/json','X-LOOP-LAB':'participante',
   'Sec-Fetch-Site':'same-site'
  },body:payload
 })).status,403);
 const primeira=await login(base,a.nome);
 assert.equal(primeira.status,200);
 const cookieA=primeira.headers.get('set-cookie').split(';')[0];
 const minha=base+'/api/laboratorio/participante/minha-conta';
 const antes=await fetch(minha,{headers:{Cookie:cookieA}});
 assert.equal((await antes.json()).conta.nome,a.nome);
 const segunda=await login(base,b.nome,undefined,{Cookie:cookieA});
 assert.equal(segunda.status,200);
 const cookieB=segunda.headers.get('set-cookie').split(';')[0];
 assert.notEqual(cookieA,cookieB);
 assert.equal((await fetch(minha,{headers:{Cookie:cookieA}})).status,401);
 const estadoB=await fetch(minha,{headers:{Cookie:cookieB}});
 assert.equal(estadoB.status,200);
 assert.equal((await estadoB.json()).conta.nome,b.nome);
 const resumo=await fetch(base+'/api/admin/auditoria-acessos-participante-demo',{
  headers:{Authorization:'Bearer '+TOKEN}
 });
 assert.equal(resumo.status,200);
 const auditoria=await resumo.json();
 assert.equal(auditoria.quantidades.LOGIN_SUCESSO,2);
 assert.equal(auditoria.quantidades.SESSAO_REVOGADA,1);
 assert.equal(auditoria.eventos.length,3);
 assert.equal(JSON.stringify(auditoria).includes(a.contaId),false);
 assert.equal(JSON.stringify(auditoria).includes(b.contaId),false);
 assert.equal(JSON.stringify(auditoria).includes(cookieA),false);
});
test('relatorio de acesso exige token admin, nao aceita consulta arbitraria e nao e publico',async t=>{
 const m=preparar(t);
 const base=await servidor(t,m.repo);
 const url=base+'/api/admin/auditoria-acessos-participante-demo';
 assert.equal((await fetch(url)).status,401);
 assert.equal((await fetch(url,{
  headers:{Authorization:'Bearer '+TOKEN,Origin:'https://fora.invalid'}
 })).status,403);
 assert.equal((await fetch(url+'?limite=0',{headers:{Authorization:'Bearer '+TOKEN}})).status,400);
 assert.equal((await fetch(url+'?limite=999',{headers:{Authorization:'Bearer '+TOKEN}})).status,400);
 assert.equal((await fetch(url+'?contaId=abc',{headers:{Authorization:'Bearer '+TOKEN}})).status,400);
 const valido=await fetch(url+'?limite=2',{headers:{Authorization:'Bearer '+TOKEN}});
 assert.equal(valido.status,200);
 assert.equal(valido.headers.get('cache-control'),'no-store');
 assert.equal((await valido.json()).eventos.length,0);
 assert.equal((await fetch(url,{method:'POST',headers:{
  Authorization:'Bearer '+TOKEN,'Content-Type':'application/json'
 },body:'{}'})).status,404);
 const app=require('../src/server');
 const publico=app.listen(0,'127.0.0.1');
 await once(publico,'listening');
 t.after(()=>new Promise(resolve=>publico.close(resolve)));
 assert.equal((await fetch('http://127.0.0.1:'+publico.address().port+
  '/api/admin/auditoria-acessos-participante-demo')).status,404);
});
