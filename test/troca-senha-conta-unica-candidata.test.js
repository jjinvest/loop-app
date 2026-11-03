'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {COOKIE}=require('../src/domain/conta-unica-candidata-sqlite');
test('troca de senha invalida todas as sessoes mesmo em duas abas/usuarios do mesmo titular',async t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 const {app}=criarAppLojaEscritorioCandidato({
  banco,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  segredoOperador:'segredo-operador-'+('z'.repeat(48)),
  termosVersao:'LAB-senha-2026',
  termosTexto:'Termos exclusivamente de laboratório e demonstração, sem benefícios ou operações reais.'
 });
 const srv=app.listen(0,'127.0.0.1');await once(srv,'listening');
 t.after(async()=>{await new Promise(done=>srv.close(done));banco.close();});
 const base='http://127.0.0.1:'+srv.address().port;
 async function req(uri,{body,cookie,csrf}={}){
  const r=await fetch(base+uri,{
   method:body?'POST':'GET',headers:{
    ...(body?{'Content-Type':'application/json'}:{}),
    ...(cookie?{Cookie:COOKIE+'='+cookie}:{}),
    ...(csrf?{'X-Checkout-Csrf':csrf}:{})
   },...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json(),headers:r.headers};
 }
 const conta=await req('/staging/contas/cadastrar',{body:{
  nome:'Rui Exemplo',nick:'Rui',email:'rui@example.invalid',
  senha:'SenhaAnteriorFicticia2026!',aceiteExplicito:true
 }});
 assert.equal(conta.status,201);
 const login=()=>req('/staging/contas/entrar',{body:{
  nick:'Rui',senha:'SenhaAnteriorFicticia2026!'
 }});
 const a=await login(),b=await login();
 assert.equal(a.status,200);assert.equal(b.status,200);
 const cookieA=a.headers.get('set-cookie').match(
  new RegExp(COOKIE+'=([a-f0-9]{64})'))[1];
 const cookieB=b.headers.get('set-cookie').match(
  new RegExp(COOKIE+'=([a-f0-9]{64})'))[1];
 const body={senhaAtual:'SenhaAnteriorFicticia2026!',
  novaSenha:'NovaSenhaFicticia2026!MaisForte'};
 assert.equal((await req('/staging/contas/senha',{
  body,cookie:cookieA
 })).status,403);
 assert.equal((await req('/staging/contas/senha',{
  body:{...body,senhaAtual:'SenhaErradaQueNaoConfere'},
  cookie:cookieA,csrf:a.data.csrf
 })).status,401);
 assert.equal((await req('/staging/contas/me',{cookie:cookieB})).status,200);
 const troca=await req('/staging/contas/senha',{
  body,cookie:cookieA,csrf:a.data.csrf
 });
 assert.equal(troca.status,200,JSON.stringify(troca.data));
 assert.equal(troca.data.senhaAlterada,true);
 assert.equal(troca.data.todasSessoesRevogadas,true);
 assert.equal((await req('/staging/contas/me',{cookie:cookieA})).status,401);
 assert.equal((await req('/staging/contas/me',{cookie:cookieB})).status,401);
 assert.equal((await login()).status,401);
 const novo=await req('/staging/contas/entrar',{body:{
  nick:'Rui',senha:body.novaSenha
 }});
 assert.equal(novo.status,200);
 const raw=JSON.stringify(banco.prepare(
  'SELECT * FROM akitemm_conta_unica_candidata'
 ).all());
 assert.equal(raw.includes(body.novaSenha),false);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
