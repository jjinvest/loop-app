'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const http=require('node:http');
const {preparar}=require('../scripts/preparar-e-enviar-webhook-asaas-sandbox-staging');
const {IntencoesCheckoutSQLite}=require('../src/domain/intencoes-checkout-sqlite');
const {PrePedidosCheckoutStagingSQLite}=require('../src/domain/prepedidos-checkout-staging-sqlite');
const {PontePrepedidoAsaasSandboxStaging}=
 require('../src/domain/ponte-prepedido-asaas-sandbox-staging');
const {criarAppWebhookRailwayStaging,iniciarWebhookRailwayStaging,prepararVolumeInicial}=
 require('../src/laboratorio/receptor-webhook-asaas-railway-staging');
const TOKEN='TokenExclusivoWebhookSandboxRailwayTeste_2026_012345';
const DOMINIO='https://staging-loop-demo.up.railway.app/webhooks/asaas-sandbox';
const PAGAMENTO='pay_SandboxRailwayTeste0123456';
async function cenario(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-railway-receptor-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const arquivo=path.join(dir,'homologacao.sqlite');
 const seed=await preparar({
  arquivo,clienteAsaasId:'cus_ClienteTesteRailway001',
  execucaoLiberada:true
 });
 const banco=new DatabaseSync(arquivo);
 banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;');
 new IntencoesCheckoutSQLite({banco});
 new PrePedidosCheckoutStagingSQLite({banco});
 const ponte=new PontePrepedidoAsaasSandboxStaging({banco});
 const provider={
  ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  async criarCobrancaPix({valorCentavos}){
   assert.equal(valorCentavos,25000);
   return {ambiente:this.ambiente,pagamentoId:PAGAMENTO,
    valorCentavos:25000,status:'PENDING'};
  }
 };
 await ponte.enviarUmaVez({
  titularId:seed.titularId,prepedidoId:seed.prepedidoId,
  provedor:provider,execucaoLiberada:true
 });
 const {app}=criarAppWebhookRailwayStaging({
  banco,token:TOKEN,urlPublica:DOMINIO
 });
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(done=>server.close(done));banco.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const headers={
  Host:'staging-loop-demo.up.railway.app',
  'X-Forwarded-Proto':'https',
  'Content-Type':'application/json',
  'asaas-access-token':TOKEN
 };
 const evento={
  id:'evt_RailwayWebhookAsaasSandbox001',
  event:'PAYMENT_RECEIVED',
  payment:{
   id:PAGAMENTO,status:'RECEIVED',value:250,billingType:'PIX',
   externalReference:'LOOPLAB-'+seed.prepedidoId
  }
 };
 async function chamar({body=evento,headersExtra={}}={}){
  // fetch pode reescrever Host; http.request simula corretamente o
  // cabeçalho que o proxy HTTPS controlado encaminha ao container.
  const dados=JSON.stringify(body);
  return await new Promise((resolve,reject)=>{
   const req=http.request(base+'/webhooks/asaas-sandbox',{
    method:'POST',headers:{
     ...headers,...headersExtra,
     'Content-Length':Buffer.byteLength(dados)
    }
   },res=>{
    const partes=[];
    res.on('data',c=>partes.push(c));
    res.on('end',()=>{
     try{resolve({status:res.statusCode,
      data:JSON.parse(Buffer.concat(partes).toString('utf8'))});
     }catch(e){reject(e);}
    });
   });
   req.on('error',reject);
   req.end(dados);
  });
 }
 return {banco,arquivo,seed,base,chamar,evento};
}
test('Railway staging: POST autenticado persiste um unico webhook e replay e idempotente',async t=>{
 const s=await cenario(t);
 const health=await fetch(s.base+'/healthz');
 assert.equal(health.status,200);
 const x=await s.chamar();
 assert.equal(x.status,200,JSON.stringify(x.data));
 assert.equal(x.data.registrado,true);
 assert.equal(x.data.pendenteReconsulta,true);
 assert.equal(x.data.pagamentoReal,false);
 assert.equal(x.data.posicoesCriadas,0);
 const replay=await s.chamar();
 assert.equal(replay.status,200);
 assert.equal(replay.data.repetido,true);
 assert.equal(s.banco.prepare(
  'SELECT COUNT(*) AS n FROM akitemm_prepedido_webhook_inbox_staging'
 ).get().n,1);
 assert.equal(s.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(s.banco.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal((await fetch(s.base+'/api/checkout/finalizar',{
  method:'POST'
 })).status,404);
 assert.equal((await fetch(s.base+'/staging/cliente')).status,404);
});
test('Railway staging: recusa token errado, host falso, sem TLS anunciado e evento divergente',async t=>{
 const s=await cenario(t);
 assert.equal((await s.chamar({headersExtra:{
  'asaas-access-token':'TOKEN_INVALIDO'
 }})).status,401);
 assert.equal((await s.chamar({headersExtra:{
  Host:'site-malicioso.example'
 }})).status,403);
 assert.equal((await s.chamar({headersExtra:{
  'X-Forwarded-Proto':'http'
 }})).status,403);
 assert.equal((await s.chamar({headersExtra:{
  Origin:'https://site-malicioso.example'
 }})).status,403);
 assert.equal((await s.chamar({body:{...s.evento,payment:{
  ...s.evento.payment,id:'pay_InvalidoNaoVinculado001'
 }}})).status,409);
 assert.equal(s.banco.prepare(
  'SELECT COUNT(*) AS n FROM akitemm_prepedido_webhook_inbox_staging'
 ).get().n,0);
 assert.equal((await s.chamar()).status,200);
 assert.equal((await s.chamar({body:{...s.evento,payment:{
  ...s.evento.payment,value:249.99
 }}})).status,409);
 assert.equal(s.banco.prepare(
  'SELECT COUNT(*) AS n FROM akitemm_prepedido_webhook_inbox_staging'
 ).get().n,1);
});
test('Railway staging: proibido iniciar sem autorizacao explicita e volume com banco',()=>{
 assert.throws(()=>iniciarWebhookRailwayStaging({ambiente:{
  NODE_ENV:'staging',PORT:'3000'
 }}),{codigo:'STAGING_NAO_AUTORIZADO'});
 assert.throws(()=>iniciarWebhookRailwayStaging({ambiente:{
  NODE_ENV:'staging',PORT:'3000',
  LOOP_RAILWAY_STAGING_AUTORIZADO:'SIM'
 }}),{codigo:'CONFIGURACAO_STAGING_INVALIDA'});
 assert.throws(()=>criarAppWebhookRailwayStaging({
  banco:{prepare(){},exec(){}},token:TOKEN,urlPublica:'http://localhost/webhooks/asaas-sandbox'
 }),{codigo:'URL_HTTPS_SANDBOX_INVALIDA'});
});


test('Railway staging: prepara somente uma vez prepedido ficticio no volume e nao cobra Pix',async t=>{
 const volume=fs.mkdtempSync(path.join(os.tmpdir(),'loop-railway-bootstrap-'));
 t.after(()=>fs.rmSync(volume,{recursive:true,force:true}));
 const arquivo=path.join(volume,'staging.sqlite');
 const ambiente={
  NODE_ENV:'staging',LOOP_RAILWAY_STAGING_AUTORIZADO:'SIM',
  RAILWAY_VOLUME_MOUNT_PATH:volume,
  LOOP_RAILWAY_STAGING_SQLITE:arquivo,
  ASAAS_SANDBOX_CLIENTE_TESTE_ID:'cus_ClienteFicticioBootstrap001',
  LOOP_RAILWAY_PREPARAR_UMA_VEZ:'SIM'
 };
 await assert.rejects(prepararVolumeInicial({ambiente:{
  ...ambiente,LOOP_RAILWAY_PREPARAR_UMA_VEZ:'NAO'
 }}),{codigo:'VOLUME_SEM_SQLITE_REQUER_PREPARACAO_AUTORIZADA'});
 assert.equal(fs.existsSync(arquivo),false);
 const novo=await prepararVolumeInicial({ambiente});
 assert.equal(novo.preparado,true);
 assert.equal(novo.pagamentosReais,0);
 assert.equal(novo.posicoesReais,0);
 assert.match(novo.prepedidoId,/^hom-/);
 const segundo=await prepararVolumeInicial({ambiente});
 assert.equal(segundo.preparado,false);
 assert.equal(segundo.jaExistia,true);
 const db=new DatabaseSync(arquivo,{readOnly:true});
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_checkout_prepedidos_staging').get().n,1);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_prepedido_asaas_sandbox_staging').get().n,1);
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 db.close();
});
