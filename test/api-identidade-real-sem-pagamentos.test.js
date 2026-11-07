'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {once}=require('node:events');
const {DatabaseSync}=require('node:sqlite');
const {IdentidadeClienteLoopReal,COOKIE}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {criarAppIdentidadeLoop}=
 require('../src/producao/servidor-identidade-loop');
const ORIGIN='https://contas.example.invalid';
const doc='Este documento controlado para teste de cadastro apresenta a finalidade da conta '+
 'compartilhada entre Escritório LOOP e Loja AKITEMM e explicita que ainda não autoriza operações financeiras nem benefícios.';
test('API compartilha login entre paginas e rejeita compra, cookies falsos e CSRF',async t=>{
 const banco=new DatabaseSync(':memory:');
 const msgs=[];
 const contas=new IdentidadeClienteLoopReal({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-CONTRATO-2026-01',texto:doc},
  privacidade:{versao:'LOOP-PRIVACIDADE-2026-01',texto:doc},
  enviarEmail:async msg=>{msgs.push(msg);return true;}
 });
 const app=criarAppIdentidadeLoop({contas,origemHttps:ORIGIN,permitirCadastro:true});
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(async()=>{await new Promise(ok=>server.close(ok));banco.close()});
 const base='http://127.0.0.1:'+server.address().port;
 const req=(route,{method='GET',body,headers={}}={})=>fetch(base+route,{
  method,redirect:'manual',headers:{...(body?{'Content-Type':'application/json'}:{}),
   ...headers},...(body?{body:JSON.stringify(body)}:{})
 });
 const docs=(await (await req('/api/contas/documentos')).json());
 const data={nome:'Ana Exemplo',nick:'Ana',email:'ana@example.invalid',
  senha:'SenhaFicticia2026!',
  aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
  versaoPrivacidade:docs.privacidade.versao,
  hashPrivacidade:docs.privacidade.hash};
 const badOrigin=await req('/api/contas/cadastrar',{method:'POST',body:data});
 assert.equal(badOrigin.status,403);
 const created=await req('/api/contas/cadastrar',{method:'POST',body:data,
  headers:{Origin:ORIGIN}});
 assert.equal(created.status,201);
 const login=await req('/api/contas/entrar',{method:'POST',
  body:{nick:'Ana',senha:data.senha},headers:{Origin:ORIGIN}});
 assert.equal(login.status,200);
 const session=await login.json();
 const setCookie=login.headers.get('set-cookie');
 assert.match(setCookie,/HttpOnly;\s*Secure;\s*SameSite=Strict;\s*Path=\/api\/contas/);
 const cookie=setCookie.split(';')[0];
 assert.ok(cookie.startsWith(COOKIE+'='));
 assert.equal((await req('/api/contas/me')).status,401);
 const me=await req('/api/contas/me',{headers:{Cookie:cookie}});
 assert.equal(me.status,200);
 assert.equal((await me.json()).lojaEEscritorioMesmaConta,true);
 assert.equal((await req('/api/checkout/finalizar',{method:'POST'})).status,503);
 assert.equal((await req('/api/saques/solicitar',{method:'POST'})).status,503);
 assert.equal((await req('/api/contas/sair',{method:'POST',
  body:{},headers:{Cookie:cookie,Origin:ORIGIN}})).status,403);
 const logout=await req('/api/contas/sair',{method:'POST',body:{},
  headers:{Cookie:cookie,Origin:ORIGIN,'X-Loop-Csrf':session.csrf}});
 assert.equal(logout.status,200);
 assert.equal((await req('/api/contas/me',{headers:{Cookie:cookie}})).status,401);
 assert.equal((await req('/readyz')).status,200);
});
