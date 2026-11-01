'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {DatabaseSync}=require('node:sqlite');
const {criarAppCheckoutStagingLocal}=
 require('../src/laboratorio/servidor-checkout-staging-local');

test('HTML do cliente e abas acessiveis somente pelo servidor isolado; sem rota no publico',async t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON;');
 const {app}=criarAppCheckoutStagingLocal({banco});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(done=>server.close(done));banco.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const html=await fetch(base+'/staging/cliente');
 assert.equal(html.status,200);
 assert.match(html.headers.get('content-security-policy'),/script-src 'self'/);
 assert.match(html.headers.get('x-robots-tag'),/noindex/);
 const markup=await html.text();
 assert.match(markup,/role="tablist"/);
 assert.match(markup,/role="tabpanel"/);
 assert.match(markup,/Meus Pedidos/);
 assert.doesNotMatch(markup,/<dialog\b/i);
 assert.doesNotMatch(markup,/<form[^>]*action=['"]\/api\/checkout\/finalizar/i);
 const css=await fetch(base+'/staging/assets/cliente.css');
 assert.equal(css.status,200);assert.match(css.headers.get('content-type'),/text\/css/);
 const js=await fetch(base+'/staging/assets/cliente.js');
 assert.equal(js.status,200);assert.match(js.headers.get('content-type'),/javascript/);
 assert.equal((await fetch(base+'/staging/assets/segredo.js')).status,401,
  'rota nao autorizada exige sessao, nao serve arquivo arbitrario');
 const sessao=await fetch(base+'/staging/sessao');
 assert.equal(sessao.status,401);
 const meus=await fetch(base+'/staging/meus-pedidos');
 assert.equal(meus.status,401);
 const publicApp=require('../src/server');
 const publicServer=publicApp.listen(0,'127.0.0.1');
 await once(publicServer,'listening');
 t.after(()=>new Promise(done=>publicServer.close(done)));
 const publicBase='http://127.0.0.1:'+publicServer.address().port;
 assert.equal((await fetch(publicBase+'/staging/cliente')).status,404);
 assert.equal((await fetch(publicBase+'/staging/assets/cliente.js')).status,404);
 assert.equal((await fetch(publicBase+'/api/checkout/finalizar',{method:'POST'})).status,503);
 assert.equal((await fetch(publicBase+'/health/ready')).status,503);
});
