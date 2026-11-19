'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {once}=require('node:events');
const {IdentidadeClienteLoopReal}=require('../src/producao/identidade-cliente-loop-sqlite');
const {criarAppIdentidadeLoop}=require('../src/producao/servidor-identidade-loop');

const ORIGEM='https://contas.example.invalid';
const TERMOS_ANTERIORES='Texto anterior de direitos e deveres para ensaio isolado, sem direitos comerciais, com informações sobre acesso e armazenamento dos dados da conta. '.repeat(2);
const TERMOS_NOVOS='Texto atualizado exclusivamente para ensaio de alteração documental do titular já cadastrado, sem criar outra conta nem movimentar dinheiro real. '.repeat(2);
const versao=(texto,rev)=>({
 versao:'LOOP-DOCUMENTOS-2026-'+rev,texto
});
function criarContas(banco,chaves,rev){
 return new IdentidadeClienteLoopReal({
  banco,chaveEmail:chaves.email,chaveCifra:chaves.cifra,
  chaveCodigo:chaves.codigo,
  termos:versao(rev===1?TERMOS_ANTERIORES:TERMOS_NOVOS,rev),
  privacidade:versao(rev===1?TERMOS_ANTERIORES:TERMOS_NOVOS,rev),
  enviarEmail:async()=>true
 });
}
async function setup(t,{backupAtualEmDia=true}={}){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 t.after(()=>db.close());
 const chaves={email:randomBytes(32),cifra:randomBytes(32),codigo:randomBytes(32)};
 const original=criarContas(db,chaves,1);
 const docsAntigos=original.documentos();
 await original.cadastrar({
  nome:'Titular Reconhecido',nick:'Titular',
  email:'titular@example.invalid',senha:'SenhaSeguraDeEnsaio2026!',
  aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:docsAntigos.termos.versao,hashTermos:docsAntigos.termos.hash,
  versaoPrivacidade:docsAntigos.privacidade.versao,
  hashPrivacidade:docsAntigos.privacidade.hash
 });
 const contas=criarContas(db,chaves,2);
 const app=criarAppIdentidadeLoop({
  contas,origemHttps:ORIGEM,
  permitirCadastro:backupAtualEmDia?false:true,
  ...(backupAtualEmDia?{}:{backupEstado:()=>({backupAtualEmDia:false})})
 });
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const req=(rota,{method='GET',cookie,csrf,body}={})=>fetch(base+rota,{
  method,headers:{
   ...(cookie?{Cookie:cookie}:{}),
   ...(body?{'Content-Type':'application/json',Origin:ORIGEM}:{}),
   ...(csrf?{'X-Loop-Csrf':csrf}:{})
  },...(body?{body:JSON.stringify(body)}:{})
 });
 const login=await req('/api/contas/entrar',{
  method:'POST',body:{nick:'Titular',senha:'SenhaSeguraDeEnsaio2026!'}
 });
 assert.equal(login.status,200);
 const session=await login.json();
 assert.equal(session.aceiteDocumentosDefinitivosPendente,true);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 return {db,contas,req,cookie,session};
}
for(const cenario of [
 {nome:'cadastro explicitamente fechado',backupAtualEmDia:true},
 {nome:'backup vencido também suspende cadastro',backupAtualEmDia:false}
]){
 test('documentos da conta antiga continuam acessíveis com '+cenario.nome,async t=>{
  const x=await setup(t,cenario);
  assert.equal((await x.req('/api/contas/documentos')).status,503);
  assert.equal((await x.req('/api/contas/documentos',{cookie:'loop_real_s='+'0'.repeat(64)})).status,503);
  const rsp=await x.req('/api/contas/documentos',{cookie:x.cookie});
  assert.equal(rsp.status,200);
  assert.equal(rsp.headers.get('cache-control'),'private, no-store');
  const docs=await rsp.json();
  assert.equal(docs.termos.versao,x.contas.documentos().termos.versao);
  assert.equal(docs.privacidade.hash,x.contas.documentos().privacidade.hash);
  assert.equal(docs.financeiroReal,false);
  const aprovacao=await x.req('/api/contas/aceitar-documentos',{
   method:'POST',cookie:x.cookie,csrf:x.session.csrf,
   body:{aceiteTermos:true,aceitePrivacidade:true,
    versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
    versaoPrivacidade:docs.privacidade.versao,
    hashPrivacidade:docs.privacidade.hash}
  });
  assert.equal(aprovacao.status,200);
  assert.equal((await aprovacao.json()).documentosConfirmados,true);
  const me=await x.req('/api/contas/me',{cookie:x.cookie});
  assert.equal(me.status,200);
  assert.equal((await me.json()).aceiteDocumentosDefinitivosPendente,false);
  assert.equal((await x.req('/api/contas/cadastrar',{
   method:'POST',body:{nome:'Novo Cliente'}
  })).status,503);
  assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM loop_real_contas').get().n,1);
  assert.equal((await x.req('/api/contas/documentos')).status,503);
  assert.equal(x.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 });
}
