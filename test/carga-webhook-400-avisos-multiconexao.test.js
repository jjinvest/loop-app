'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Worker}=require('node:worker_threads');
const {DatabaseSync}=require('node:sqlite');
const {mkdtempSync,rmSync}=require('node:fs');
const path=require('node:path');
const {tmpdir}=require('node:os');
const {InboxWebhookPrepedidoAsaasStaging}=
 require('../src/domain/inbox-webhook-prepedido-asaas-staging');
const TOKEN='WebhookCargaConcorrenteEmLaboratorio_'+('X'.repeat(48));
const PRE='hom-carga-2026';
const PAY='pay_CargaLaboratorio2026';
const source=`
'use strict';
const {workerData,parentPort}=require('node:worker_threads');
const {DatabaseSync}=require('node:sqlite');
const {InboxWebhookPrepedidoAsaasStaging}=require(workerData.modulo);
const banco=new DatabaseSync(workerData.arquivo);
banco.exec('PRAGMA busy_timeout=5000;PRAGMA foreign_keys=ON');
const inbox=new InboxWebhookPrepedidoAsaasStaging({
 banco,token:workerData.token
});
parentPort.postMessage({pronto:true});
parentPort.once('message',()=>{
 let registrados=0,repetidos=0;
 try{
  for(const payload of workerData.payloads){
   const r=inbox.registrar({
    cabecalhoToken:workerData.token,corpoBruto:Buffer.from(payload)
   });
   if(r.registrado)registrados++;
   if(r.repetido)repetidos++;
   if(r.posicoesCriadas!==0||r.pagamentoReal!==false)
    throw Error('FINANCEIRO_INVENTADO_PELA_INBOX');
  }
  parentPort.postMessage({registrados,repetidos});
 }catch(e){
  parentPort.postMessage({erro:e.codigo||e.message});
 }finally{
  banco.close();parentPort.close();
 }
});
`;
function spawn(input){
 const worker=new Worker(source,{eval:true,workerData:input});
 let readyResolve,readyReject,doneResolve,doneReject;
 const ready=new Promise((a,b)=>{readyResolve=a;readyReject=b;});
 const done=new Promise((a,b)=>{doneResolve=a;doneReject=b;});
 const finished=new Promise((resolve,reject)=>{
  worker.on('exit',code=>code===0?resolve():reject(new Error('WORKER_SAIU_'+code)));
 });
 worker.on('message',d=>{
  if(d.pronto)readyResolve();
  else if(d.erro)doneReject(new Error(d.erro));
  else doneResolve(d);
 });
 worker.on('error',e=>{readyReject(e);doneReject(e);});
 worker.on('exit',code=>{
  if(code!==0){
   const e=new Error('WORKER_SAIU_'+code);
   readyReject(e);doneReject(e);
  }
 });
 return {worker,ready,done,finished};
}
test('400 entregas em quatro conexoes deixam exatamente 200 eventos, sem posicao extra',async t=>{
 const volume=mkdtempSync(path.join(tmpdir(),'loop-webhooks-carga-'));
 const arquivo=path.join(volume,'um-sqlite.sqlite');
 const banco=new DatabaseSync(arquivo);
 t.after(()=>{
  banco.close();rmSync(volume,{recursive:true,force:true});
 });
 banco.exec('PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000');
 banco.exec([
  'CREATE TABLE akitemm_prepedido_asaas_sandbox_staging(',
  'prepedido_id TEXT PRIMARY KEY,valor_centavos INTEGER,',
  'pagamento_id TEXT,external_ref TEXT,estado TEXT);'
 ].join(' '));
 banco.prepare([
  'INSERT INTO akitemm_prepedido_asaas_sandbox_staging',
  '(prepedido_id,valor_centavos,pagamento_id,external_ref,estado)',
  'VALUES(?,?,?,?,?)'
 ].join(' ')).run(PRE,25000,PAY,'LOOPLAB-'+PRE,'PENDENTE_SANDBOX');
 new InboxWebhookPrepedidoAsaasStaging({banco,token:TOKEN});
 const eventos=Array.from({length:200},(_,i)=>JSON.stringify({
  id:'evt_CargaConcorrente_'+String(i).padStart(4,'0'),
  event:'PAYMENT_RECEIVED',payment:{id:PAY,
   externalReference:'LOOPLAB-'+PRE,billingType:'PIX',value:250}
 }));
 const modulo=path.resolve(__dirname,
  '../src/domain/inbox-webhook-prepedido-asaas-staging.js');
 const workers=[
  eventos.slice(0,100),eventos.slice(100),
  eventos.slice(0,100).reverse(),eventos.slice(100).reverse()
 ].map(payloads=>spawn({modulo,arquivo,token:TOKEN,payloads}));
 t.after(async()=>{for(const w of workers)await w.worker.terminate();});
 await Promise.all(workers.map(x=>x.ready));
 const start=Date.now();
 for(const w of workers)w.worker.postMessage('go');
 const result=await Promise.all(workers.map(x=>x.done));
 await Promise.all(workers.map(x=>x.finished));
 const duracao=Date.now()-start;
 assert.equal(result.reduce((n,x)=>n+x.registrados,0),200);
 assert.equal(result.reduce((n,x)=>n+x.repetidos,0),200);
 assert.equal(banco.prepare([
  'SELECT COUNT(*) AS n FROM akitemm_prepedido_webhook_inbox_staging'
 ].join(' ')).get().n,200);
 assert.equal(banco.prepare([
  'SELECT COUNT(*) AS n FROM akitemm_prepedido_webhook_antecipados_staging'
 ].join(' ')).get().n,0);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.equal(banco.prepare('PRAGMA foreign_key_check').all().length,0);
 assert.ok(duracao>=0);
});
