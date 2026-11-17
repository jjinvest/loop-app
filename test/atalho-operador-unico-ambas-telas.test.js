'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {once}=require('node:events');
const fs=require('node:fs');
const path=require('node:path');
const {criarGateway}=require('../scripts/servidor-escritorio-preview-railway');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');

test('atalho + só é exibível ao operador autenticado; sessão cliente não autoriza edição',async t=>{
 const senha='SENHA_CLIENTE_TESTE_SEM_PRIVILEGIO_12345';
 const senhaAdmin='SENHA_OPERADOR_TESTE_EXCLUSIVA_123456789';
 const segredo='SEGREDO_OPERADOR_'+('O'.repeat(48));
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 const {app}=criarAppLojaEscritorioCandidato({
  banco:db,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  segredoOperador:segredo,termosVersao:'LAB-atalho-operador-test',
  termosTexto:'Ensaio de navegação protegida sem cadastros comerciais nem pagamentos.'
 });
 const backend=app.listen(0,'127.0.0.1');await once(backend,'listening');
 const gateway=criarGateway({portaInterna:backend.address().port,
  senhaAcesso:senha,senhaAdmin,segredoOperador:segredo});
 gateway.listen(0,'127.0.0.1');await once(gateway,'listening');
 t.after(async()=>{await new Promise(r=>gateway.close(r));
  await new Promise(r=>backend.close(r));db.close();});
 const base='http://127.0.0.1:'+gateway.address().port;
 const get=(route,headers={})=>fetch(base+route,{headers,redirect:'manual'});
 const probe=route=>get(route).then(async r=>({status:r.status,body:await r.json()}));
 const semLogin=await probe('/staging/operador/estado');
 assert.equal(semLogin.status,200);assert.equal(semLogin.body.operador,false);
 const cliente=await get('/minha-conta',{
  Authorization:'Basic '+Buffer.from('acesso:'+senha).toString('base64')
 });
 const cookieCliente=cliente.headers.get('set-cookie')?.split(';')[0];
 assert.match(cookieCliente,/^akitemm_preview_access=/);
 const estadoCliente=await get('/staging/operador/estado',{Cookie:cookieCliente});
 assert.deepEqual(await estadoCliente.json(),{operador:false});
 const admin=await get('/escritorio',{
  Authorization:'Basic '+Buffer.from('operador:'+senhaAdmin).toString('base64')
 });
 assert.equal(admin.status,200);
 const cookieAdmin=admin.headers.get('set-cookie')?.split(';')[0];
 assert.match(cookieAdmin,/^akitemm_preview_admin_v2=/);
 const novoProduto=await get('/operador?produtoEditar=novo',{Cookie:cookieAdmin});
 assert.equal(novoProduto.status,302);
 assert.equal(novoProduto.headers.get('location'),'/escritorio?produtoEditar=novo');
 const editarProduto=await get('/operador?produtoEditar=produto-123',{Cookie:cookieAdmin});
 assert.equal(editarProduto.status,302);
 assert.equal(editarProduto.headers.get('location'),'/escritorio?produtoEditar=produto-123');
 const estadoAdmin=await get('/staging/operador/estado',{Cookie:cookieAdmin});
 assert.equal(estadoAdmin.status,200);
 assert.deepEqual(await estadoAdmin.json(),{operador:true});
 assert.equal(estadoAdmin.headers.get('cache-control'),'no-store');
 const acessoAdmin=await get('/staging/assets/admin.js',{Cookie:cookieAdmin});
 assert.equal(acessoAdmin.status,200);
 assert.equal((await get('/staging/assets/admin.js',{Cookie:cookieCliente})).status,401);
 assert.equal((await get('/staging/operador/estado',
  {Cookie:'akitemm_preview_admin_v2=v2.0000000000000.'+'0'.repeat(64)}))
  .status,200);
 const metodo=await fetch(base+'/staging/operador/estado',{method:'POST'});
 assert.equal(metodo.status,405);
 for(const [arquivo,id] of [
  ['../src/laboratorio/loja-cliente-demo.html','akitemmOperadorMais'],
  ['../src/candidato/checkout-candidato-ui.html','loopOperadorMais']
 ]){
  const html=fs.readFileSync(path.join(__dirname,arquivo),'utf8');
  assert.match(html,new RegExp('id="'+id+'"[^>]*hidden'));
 }
 const loja=fs.readFileSync(path.join(__dirname,
  '../src/laboratorio/loja-cliente-demo.js'),'utf8');
 const escritorio=fs.readFileSync(path.join(__dirname,
  '../src/candidato/checkout-candidato-ui.js'),'utf8');
 assert.match(loja,/operador===true/);
 assert.match(escritorio,/operador===true/);
 assert.match(loja,/\/staging\/operador\/estado/);
 assert.match(escritorio,/\/staging\/operador\/estado/);
});
