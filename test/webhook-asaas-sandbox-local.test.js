'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const TOKEN='TOKEN_ASAAS_SANDBOX_APENAS_LOCAL_TESTE_2026_1234567';
const URL='/api/laboratorio/webhook-asaas-sandbox';
const evento={id:'evt_TesteLaboratorioLocal1000',event:'PAYMENT_RECEIVED',
 payment:{id:'pay_TesteLaboratorio1000',billingType:'PIX',status:'RECEIVED',
  externalReference:'LOOPLAB-pedido-lab-seguro',value:250.00,
  customer:'cus_NaoPersistirDadosPessoais',netValue:247.12}};
async function iniciar(t,{habilitado=false}={}){
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const app=criarAppAdminLaboratorio({repositorio:repo,
  segredo:'admin-falso-laboratorio-nao-real-123456',
  ...(habilitado?{webhookAsaasSandbox:{habilitado:true,token:TOKEN}}:{})
 });
 const servidor=app.listen(0,'127.0.0.1');await once(servidor,'listening');
 t.after(()=>new Promise(resolve=>servidor.close(resolve)));
 return {base:'http://127.0.0.1:'+servidor.address().port,db:repo.banco};
}
async function enviar(base,obj=evento,{token=TOKEN,contentType='application/json',body}={}){
 return fetch(base+URL,{method:'POST',headers:{
  'Content-Type':contentType,...(token?{'asaas-access-token':token}:{})
 },body:body===undefined?JSON.stringify(obj):body});
}
test('endpoint de webhook Asaas NAO existe por padrao no laboratorio',async t=>{
 const {base}=await iniciar(t);
 const res=await enviar(base);
 assert.equal(res.status,404);
});
test('webhook Asaas local autenticado persiste e retorna HTTP 200 sem autorizar dinheiro',async t=>{
 const {base,db}=await iniciar(t,{habilitado:true});
 const res=await enviar(base);
 assert.equal(res.status,200);
 const data=await res.json();
 assert.equal(data.registrado,true);
 assert.equal(data.recebimentoReal,false);
 assert.equal(data.posicaoCriada,false);
 assert.equal(data.saqueAutorizado,false);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM akitemm_asaas_sandbox_avisos").get().n,1);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n,0);
});
test('webhook Asaas local entregue duas vezes responde 200 e registra so uma vez',async t=>{
 const {base,db}=await iniciar(t,{habilitado:true});
 assert.equal((await enviar(base)).status,200);
 const again=await enviar(base);
 assert.equal(again.status,200);
 assert.equal((await again.json()).repetido,true);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_asaas_sandbox_avisos').get().n,1);
});
test('webhook Asaas local recusa token errado e ausente sem armazenar dados',async t=>{
 const {base,db}=await iniciar(t,{habilitado:true});
 for(const token of [null,'TOKEN_FALSO',TOKEN+'-x']){
  assert.equal((await enviar(base,evento,{token})).status,401);
 }
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_asaas_sandbox_avisos').get().n,0);
});
test('webhook Asaas local recusa ID reutilizado com valor diferente',async t=>{
 const {base,db}=await iniciar(t,{habilitado:true});
 assert.equal((await enviar(base)).status,200);
 const resposta=await enviar(base,{...evento,payment:{...evento.payment,value:300}});
 assert.equal(resposta.status,409);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_asaas_sandbox_avisos').get().n,1);
});
test('webhook Asaas local rejeita conteúdo incompleto, estranho ou muito grande',async t=>{
 const {base,db}=await iniciar(t,{habilitado:true});
 assert.equal((await enviar(base,evento,{contentType:'text/plain'})).status,415);
 assert.equal((await enviar(base,evento,{body:'{'})).status,400);
 assert.equal((await enviar(base,{...evento,event:'SAQUE_REAL'})).status,400);
 assert.equal((await enviar(base,evento,{body:' '.repeat(17000)})).status,413);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_asaas_sandbox_avisos').get().n,0);
});
test('webhook Asaas local jamais pode ser usado na aplicacao publica',async t=>{
 const publico=require('../src/server');
 const app=publico.listen(0,'127.0.0.1');await once(app,'listening');
 t.after(()=>new Promise(resolve=>app.close(resolve)));
 const res=await enviar('http://127.0.0.1:'+app.address().port);
 assert.equal(res.status,404);
});
