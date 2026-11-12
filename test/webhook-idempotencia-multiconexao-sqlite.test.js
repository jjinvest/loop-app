'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Worker}=require('node:worker_threads');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {cotarCheckoutPublico}=require('../src/domain/cotacao-checkout-publico');
const TOKEN='MultiConexaoWebhookSandboxToken'+('T'.repeat(50));
const OPERADOR='MultiConexaoWebhookOperador'+('O'.repeat(50));
const PAYMENT='pay_MultiConexaoEvento2026';
const workerSource=`
'use strict';
const {workerData,parentPort}=require('node:worker_threads');
const {DatabaseSync}=require('node:sqlite');
const {InboxWebhookPrepedidoAsaasStaging}=require(workerData.mod);
let banco;
try{
 banco=new DatabaseSync(workerData.file);
 banco.exec('PRAGMA busy_timeout=5000;PRAGMA foreign_keys=ON;');
 const inbox=new InboxWebhookPrepedidoAsaasStaging({
  banco,token:workerData.token
 });
 parentPort.postMessage({type:'ready'});
 parentPort.on('message',m=>{
  if(m!=='run')return;
  try{
   const resultado=inbox.registrar({cabecalhoToken:workerData.token,
    corpoBruto:Buffer.from(workerData.body)});
   parentPort.postMessage({type:'done',resultado});
  }catch(e){
   parentPort.postMessage({type:'done',erro:e.codigo||'ERRO_CONCORRENTE'});
  }finally{
   banco.close();parentPort.close();
  }
 });
}catch(e){
 parentPort.postMessage({type:'done',erro:e.codigo||e.message});
 banco?.close();parentPort.close();
}
`;
function iniciarWorker(input){
 const w=new Worker(workerSource,{eval:true,workerData:input});
 let resolveReady,rejectReady,resolveDone,rejectDone;
 const ready=new Promise((resolve,reject)=>{
  resolveReady=resolve;rejectReady=reject;
 });
 const done=new Promise((resolve,reject)=>{
  resolveDone=resolve;rejectDone=reject;
 });
 w.on('message',m=>{
  if(m.type==='ready')resolveReady();
  if(m.type==='done'){
   rejectReady(new Error(m.erro||'FINALIZADO_ANTES_DO_INICIO'));
   resolveDone(m);
  }
 });
 w.on('error',e=>{rejectReady(e);rejectDone(e);});
 w.on('exit',code=>{
  if(code!==0){
   const erro=new Error('WORKER_SQLITE_ENCERROU_'+code);
   rejectReady(erro);rejectDone(erro);
  }
 });
 return {worker:w,ready,done};
}
test('dois processos recebem callback igual e gravam apenas um evento mesmo apos restart',async t=>{
 const pasta=mkdtempSync(path.join(tmpdir(),'loop-multi-sqlite-'));
 const arquivo=path.join(pasta,'unico.sqlite');
 const banco=new DatabaseSync(arquivo);
 banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;');
 const instancias=[];
 t.after(async()=>{
  for(const x of instancias)await x.worker.terminate();
  banco.close();rmSync(pasta,{recursive:true,force:true});
 });
 let totalPosts=0;
 const provedor={
  ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  async criarCobrancaPix({valorCentavos}){
   totalPosts++;assert.equal(valorCentavos,25000);
   return {ambiente:this.ambiente,pagamentoId:PAYMENT,
    valorCentavos,status:'PENDING'};
  },
  async consultarCobranca(){throw Error('Nao efetuar GET nesta prova');}
 };
 const app=criarAppLojaEscritorioCandidato({
  banco,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  webhookHomologacaoToken:TOKEN,provedorReconsultaSandbox:provedor,
  operacoesSandboxAutorizadas:true,segredoOperador:OPERADOR,
  termosVersao:'LAB-multiconexao-2026',
  termosTexto:'Ensaio local ficticio, sem saldo, saque ou dinheiro real.'
 });
 const titular=await app.contas.cadastrar({
  nome:'Cliente Teste Concorrente',nick:'Concorr',
  email:'concorrente@example.invalid',senha:'SenhaConcorrente2026#',
  termosVersao:'LAB-multiconexao-2026',
  termosTexto:'Ensaio local ficticio, sem saldo, saque ou dinheiro real.',
  aceiteExplicito:true
 });
 const catalogo=catalogoFicticioCheckout();
 const entrada={itens:[{produtoId:'curso-homologacao-250',quantidade:1}]};
 const cotacao=await cotarCheckoutPublico({repositorio:catalogo,entrada});
 const intencao=app.intencoes.criar({
  titularId:titular.titularId,chaveIdempotencia:'corrida-replay-2026',
  entrada,cotacao
 });
 const pre=await app.prePedidos.preparar({
  titularId:titular.titularId,rascunhoId:intencao.intencao.pedidoId,
  repositorioCatalogo:catalogo
 });
 const prepedidoId=pre.prepedido.prepedidoId;
 app.ponte.preparar({titularId:titular.titularId,prepedidoId,
  clienteAsaasId:'cus_Concorrente2026'});
 await app.ponte.enviarUmaVez({
  titularId:titular.titularId,prepedidoId,
  provedor,execucaoLiberada:true
 });
 const aviso=JSON.stringify({id:'evt_MultiConexaoWebhook2026',
  event:'PAYMENT_RECEIVED',payment:{id:PAYMENT,
   externalReference:'LOOPLAB-'+prepedidoId,billingType:'PIX',value:250}});
 const input={file:arquivo,token:TOKEN,
  mod:path.resolve(__dirname,
   '../src/domain/inbox-webhook-prepedido-asaas-staging.js'),body:aviso};
 const a=iniciarWorker(input),b=iniciarWorker(input);
 instancias.push(a,b);
 await Promise.all([a.ready,b.ready]);
 a.worker.postMessage('run');b.worker.postMessage('run');
 const resultados=await Promise.all([a.done,b.done]);
 assert.ok(resultados.every(x=>!x.erro),JSON.stringify(resultados));
 assert.equal(resultados.filter(x=>x.resultado.registrado===true).length,1);
 assert.equal(resultados.filter(x=>x.resultado.repetido===true).length,1);
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM akitemm_prepedido_webhook_inbox_staging').get().n,1);
 assert.equal(totalPosts,1);
 assert.equal(app.motorConta.consultar().tabuleiro.eventosNoCiclo,0);
 // Reinicio do leitor: mesmo id reenvia sem inserir, payload divergente falha.
 const outra=new DatabaseSync(arquivo);
 outra.exec('PRAGMA busy_timeout=5000');
 const {InboxWebhookPrepedidoAsaasStaging}=require(
  '../src/domain/inbox-webhook-prepedido-asaas-staging');
 const leitor=new InboxWebhookPrepedidoAsaasStaging({banco:outra,token:TOKEN});
 assert.equal(leitor.registrar({cabecalhoToken:TOKEN,
  corpoBruto:Buffer.from(aviso)}).repetido,true);
 const conflitante=JSON.stringify({id:'evt_MultiConexaoWebhook2026',
  event:'PAYMENT_REFUNDED',payment:{id:PAYMENT,
   externalReference:'LOOPLAB-'+prepedidoId}});
 assert.throws(()=>leitor.registrar({cabecalhoToken:TOKEN,
  corpoBruto:Buffer.from(conflitante)}),/EVENTO_REUTILIZADO_DIVERGENTE/);
 outra.close();
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
