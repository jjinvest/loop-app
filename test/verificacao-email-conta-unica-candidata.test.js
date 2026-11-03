'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {ContaUnicaCandidataSQLite,COOKIE}=
 require('../src/domain/conta-unica-candidata-sqlite');
const {VerificacaoEmailContaUnicaCandidata}=
 require('../src/domain/verificacao-email-conta-unica-candidata');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');

const TERMOS='Condições fictícias para verificar o e-mail do candidato sem cobrança, lucro ou posição real.';
const LOGIN='SenhaFicticiaLaboratorio2026!';
async function cadastrar(contas,nick,email){
 return contas.cadastrar({nome:nick+' Exemplo',nick,email,senha:LOGIN,
  termosVersao:'LAB-email-2026',termosTexto:TERMOS,aceiteExplicito:true});
}
test('email HMAC, provedor confirmado, código de uso único, bloqueio e expiração',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 const contas=new ContaUnicaCandidataSQLite({
  banco:db,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32)
 });
 const a=await cadastrar(contas,'Marta','marta@example.invalid');
 const b=await cadastrar(contas,'Lia','lia@example.invalid');
 let agora=2000000000000;
 const enviados=[];
 const provas=new VerificacaoEmailContaUnicaCandidata({
  banco:db,contas,segredo:randomBytes(32),agora:()=>agora,
  enviar:async({para,codigo,expiraEm})=>{
   enviados.push({para,codigo,expiraEm});return true;
  }
 });
 assert.equal(contas.perfil(a.titularId).emailVerificado,false);
 const solicitado=await provas.solicitar({titularId:a.titularId,autorizado:true});
 assert.equal(solicitado.envioDeclaradoPeloProvedor,true);
 assert.equal(enviados.length,1);
 assert.equal(enviados[0].para,'marta@example.invalid');
 assert.match(enviados[0].codigo,/^[0-9]{8}$/);
 assert.throws(()=>provas.confirmar({
  titularId:b.titularId,codigo:enviados[0].codigo,autorizado:true
 }),/PROVA_EMAIL_EXPIRADA_OU_INVALIDA/);
 assert.equal(provas.confirmar({
  titularId:a.titularId,codigo:'99999999'===enviados[0].codigo?'99999998':'99999999',
  autorizado:true
 }).tentativasRestantes,4);
 assert.equal(provas.confirmar({
  titularId:a.titularId,codigo:enviados[0].codigo,autorizado:true
 }).emailVerificado,true);
 assert.equal(provas.confirmar({
  titularId:a.titularId,codigo:enviados[0].codigo,autorizado:true
 }).repetido,true);
 assert.equal(contas.perfil(a.titularId).emailVerificado,true);
 const raw=JSON.stringify(db.prepare(
  'SELECT * FROM akitemm_candidato_email_desafios'
 ).all());
 assert.equal(raw.includes(enviados[0].codigo),false);
 assert.equal(raw.includes('marta@example.invalid'),false);
 assert.equal((await provas.solicitar({
  titularId:a.titularId,autorizado:true
 })).novoCodigoGerado,false);
 assert.equal(enviados.length,1);
 // Um novo desafio de outra conta expira e não é reaproveitado.
 await provas.solicitar({titularId:b.titularId,autorizado:true});
 const code=enviados[1].codigo;
 agora+=16*60*1000;
 assert.throws(()=>provas.confirmar({
  titularId:b.titularId,codigo:code,autorizado:true
 }),/PROVA_EMAIL_EXPIRADA_OU_INVALIDA/);
 await provas.solicitar({titularId:b.titularId,autorizado:true});
 const errado=enviados[2].codigo==='11111111'?'11111112':'11111111';
 for(let i=0;i<5;i++){
  const resp=provas.confirmar({titularId:b.titularId,
   codigo:errado,autorizado:true});
  assert.equal(resp.tentativasRestantes,4-i);
 }
 assert.throws(()=>provas.confirmar({
  titularId:b.titularId,codigo:enviados[2].codigo,autorizado:true
 }),/PROVA_EMAIL_EXPIRADA_OU_INVALIDA/);
 assert.equal(provas.verificado({titularId:b.titularId}),false);
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 db.close();
});
test('HTTP seguro exige sessão/CSRF; sem transportador nem monta rotas',async t=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 const entregas=[];
 const cfg={banco:db,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveProvaEmail:randomBytes(32),
  enviarEmailDeVerificacao:async x=>{entregas.push(x);return true;},
  segredoOperador:'operador-email-'+('x'.repeat(50)),
  termosVersao:'LAB-email-2026',termosTexto:TERMOS};
 const {app,contas}=criarAppLojaEscritorioCandidato(cfg);
 const a=await cadastrar(contas,'Carlos','carlos@example.invalid');
 const b=await cadastrar(contas,'Bruna','bruna@example.invalid');
 const loginA=await contas.entrar({nick:'Carlos',senha:LOGIN});
 const loginB=await contas.entrar({nick:'Bruna',senha:LOGIN});
 const srv=app.listen(0,'127.0.0.1');await once(srv,'listening');
 t.after(async()=>{await new Promise(done=>srv.close(done));db.close();});
 const base='http://127.0.0.1:'+srv.address().port;
 const request=async(route,{token,csrf,body}={})=>{
  const res=await fetch(base+route,{method:body?'POST':'GET',headers:{
   ...(token?{Cookie:COOKIE+'='+token}:{}),
   ...(csrf?{'X-Checkout-Csrf':csrf}:{}),
   ...(body?{'Content-Type':'application/json'}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  return {status:res.status,data:await res.json()};
 };
 assert.equal((await request('/staging/contas/email/enviar',{body:{}})).status,401);
 assert.equal((await request('/staging/contas/email/enviar',{
  token:loginA.token,body:{}
 })).status,403);
 const sent=await request('/staging/contas/email/enviar',{
  token:loginA.token,csrf:loginA.csrf,body:{}
 });
 assert.equal(sent.status,200,JSON.stringify(sent.data));
 assert.equal(entregas.length,1);
 assert.equal(entregas[0].para,'carlos@example.invalid');
 assert.equal((await request('/staging/contas/email/enviar',{
  token:loginA.token,csrf:loginA.csrf,body:{}
 })).status,429);
 assert.equal((await request('/staging/contas/email/confirmar',{
  token:loginB.token,csrf:loginB.csrf,body:{codigo:entregas[0].codigo}
 })).status,409);
 assert.equal((await request('/staging/contas/email/confirmar',{
  token:loginA.token,body:{codigo:entregas[0].codigo}
 })).status,403);
 const confirmed=await request('/staging/contas/email/confirmar',{
  token:loginA.token,csrf:loginA.csrf,body:{codigo:entregas[0].codigo}
 });
 assert.equal(confirmed.status,200);
 assert.equal(confirmed.data.emailVerificado,true);
 const meA=await request('/staging/contas/me',{token:loginA.token});
 const meB=await request('/staging/contas/me',{token:loginB.token});
 assert.equal(meA.data.emailVerificado,true);
 assert.equal(meB.data.emailVerificado,false);
 assert.equal(meA.data.confirmacaoEmailDisponivel,true);
 assert.equal(meA.data.pagamentosReaisPermitidos,false);
 const publicApp=require('../src/server');
 const pub=publicApp.listen(0,'127.0.0.1');await once(pub,'listening');
 t.after(()=>new Promise(done=>pub.close(done)));
 assert.equal((await fetch('http://127.0.0.1:'+pub.address().port+
  '/staging/contas/email/enviar',{method:'POST'})).status,404);
 assert.equal(a.titularId!==b.titularId,true);
});
test('sem provedor de e-mail, prova não é simulada como enviada',async()=>{
 const db=new DatabaseSync(':memory:');
 const contas=new ContaUnicaCandidataSQLite({
  banco:db,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32)
 });
 const a=await cadastrar(contas,'Nina','nina@example.invalid');
 const provas=new VerificacaoEmailContaUnicaCandidata({
  banco:db,contas,segredo:randomBytes(32),enviar:async()=>false
 });
 await assert.rejects(()=>provas.solicitar({
  titularId:a.titularId,autorizado:true
 }),/EMAIL_NAO_ENTREGUE/);
 assert.equal(provas.verificado({titularId:a.titularId}),false);
 db.close();
});
