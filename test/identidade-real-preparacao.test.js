'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {once}=require('node:events');
const {conferirInfra,criarServidorPreparacao}=require('../scripts/iniciar-identidade-real-preparacao');
function setup(t){
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-real-setup-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const ambiente={
  NODE_ENV:'production',LOOP_REAL_PREPARACAO_INTERNA:'SIM',
  LOOP_REAL_CADASTRO_GO:'NAO',
  LOOP_REAL_APROVACAO_DOCUMENTOS:'NAO',
  LOOP_REAL_DADOS_SEPARADOS:'SIM',
  LOOP_REAL_SQLITE:path.join(pasta,'clientes.sqlite')
 };
 return {pasta,ambiente};
}
test('volume real isolado aceita prova de escrita e nao armazena dado pessoal',t=>{
 const {pasta,ambiente}=setup(t);
 assert.equal(conferirInfra(ambiente,{pasta}).volumeDedicado,true);
 assert.deepEqual(fs.readdirSync(pasta),[]);
 assert.equal(fs.existsSync(ambiente.LOOP_REAL_SQLITE),false);
});
test('preparacao recusa GO comercial, documentos aprovados e modos de laboratorio',t=>{
 const {pasta,ambiente}=setup(t);
 for(const alteracao of [
  {LOOP_REAL_CADASTRO_GO:'SIM'},
  {LOOP_REAL_APROVACAO_DOCUMENTOS:'SIM'},
  {LOOP_REAL_PREPARACAO_INTERNA:'NAO'},
  {LOOP_REAL_DADOS_SEPARADOS:'NAO'},
  {NODE_ENV:'development'},
  {LOOP_CLIENTES_LAB:'SIM'},
  {LOOP_MODO_SIMULACAO:'1'},
  {LOOP_PREVIEW_EXCLUSIVO:'SIM'}
 ]){
  assert.throws(()=>conferirInfra({...ambiente,...alteracao},{pasta}),
   /PREPARACAO_REAL_/);
 }
 assert.throws(()=>conferirInfra({
  ...ambiente,LOOP_REAL_SQLITE:'/tmp/laboratorio.sqlite'
 },{pasta}),/VOLUME_SEPARADO_AUSENTE/);
});
test('infra health 200; readiness, cadastro, login, checkout e admin 503',async t=>{
 const {pasta,ambiente}=setup(t);
 const server=criarServidorPreparacao({pasta,ambiente});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const get=async(rota,opts={})=>{
  const r=await fetch(base+rota,opts);
  return {status:r.status,body:await r.json(),headers:r.headers};
 };
 const health=await get('/healthz');
 assert.equal(health.status,200);
 assert.equal(health.body.volumeDedicado,true);
 assert.equal(health.body.cadastroReal,false);
 assert.equal((await get('/readyz')).status,503);
 for(const rota of [
  '/','/escritorio','/loja','/api/contas/documentos',
  '/api/contas/entrar','/api/loja/catalogo','/api/admin',
  '/api/checkout/finalizar','/api/saques/solicitar'
 ]){
  const resp=await get(rota);
  assert.equal(resp.status,503,rota);
  assert.equal(resp.body.financeiroReal,false);
  assert.equal(resp.headers.get('set-cookie'),null);
 }
 const cadastro=await get('/api/contas/cadastrar',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({nome:'Alguem',email:'email@example.invalid'})
 });
 assert.equal(cadastro.status,503);
 assert.equal(cadastro.body.cadastroReal,false);
 assert.deepEqual(fs.readdirSync(pasta),[]);
});
