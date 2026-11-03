'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {once}=require('node:events');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {cotarCheckoutPublico}=require('../src/domain/cotacao-checkout-publico');
const {InboxWebhookPrepedidoAsaasStaging}=
 require('../src/domain/inbox-webhook-prepedido-asaas-staging');
const {ReconsultaWebhookPrepedidoAsaasStaging}=
 require('../src/domain/reconsulta-webhook-prepedido-asaas-staging');
const {COOKIE}=require('../src/domain/conta-unica-candidata-sqlite');
const ADMIN='operador-entrega-sandbox-'+('x'.repeat(40));
const TOKEN='t'.repeat(64);
const TERMOS='Termos fictícios apenas para testar o status de entrega, sem cobrança ou benefício financeiro real.';
test('entrega só após RECEIVED reconsultado e bloqueia novamente após estorno',async t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 const catalogo=catalogoFicticioCheckout();
 const {app,contas,intencoes,prePedidos,ponte,entregas}=
  criarAppLojaEscritorioCandidato({
   banco,repositorioCatalogo:catalogo,chaveEmail:randomBytes(32),
   chaveCifra:randomBytes(32),segredoOperador:ADMIN,
   termosVersao:'LAB-entregas-2026',termosTexto:TERMOS
  });
 const alice=await contas.cadastrar({nome:'Alice Exemplo',nick:'Alice',
  email:'alice-entrega@example.invalid',senha:'SenhaFicticiaEntregas2026!',
  aceiteExplicito:true,termosVersao:'LAB-entregas-2026',termosTexto:TERMOS});
 await contas.cadastrar({nome:'Bruna Exemplo',nick:'Bruna',
  email:'bruna-entrega@example.invalid',senha:'SenhaFicticiaEntregas2026!',
  aceiteExplicito:true,termosVersao:'LAB-entregas-2026',termosTexto:TERMOS});
 const la=await contas.entrar({nick:'Alice',senha:'SenhaFicticiaEntregas2026!'});
 const lb=await contas.entrar({nick:'Bruna',senha:'SenhaFicticiaEntregas2026!'});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(done=>server.close(done));banco.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const enviar=async(route,{metodo='GET',token,operador=false,dados}={})=>{
  const r=await fetch(base+route,{method:metodo,headers:{
   ...(token?{Cookie:COOKIE+'='+token}:{}),
   ...(operador?{Authorization:'Bearer '+ADMIN}:{}),
   ...(dados?{'Content-Type':'application/json'}:{})
  },...(dados?{body:JSON.stringify(dados)}:{})});
  return {status:r.status,body:await r.json()};
 };
 const input={itens:[{produtoId:'curso-homologacao-250',quantidade:1}]};
 const cotacao=await cotarCheckoutPublico({repositorio:catalogo,entrada:input});
 const rascunho=intencoes.criar({titularId:alice.titularId,
  chaveIdempotencia:'entrega-ficticia-sandbox-2026',
  entrada:input,cotacao});
 const pedido=await prePedidos.preparar({titularId:alice.titularId,
  rascunhoId:rascunho.intencao.pedidoId,repositorioCatalogo:catalogo});
 const id=pedido.prepedido.prepedidoId;
 const url='/staging/escritorio-unificado/preparar-entrega';
 assert.equal((await enviar(url,{metodo:'POST',dados:{prepedidoId:id}})).status,401);
 assert.equal((await enviar(url,{metodo:'POST',operador:true,
  dados:{prepedidoId:id}})).status,409);
 const before=await enviar('/staging/meus-pedidos',{token:la.token});
 assert.equal(before.body.pedidos[0].entregaFicticia.preparacaoSimulada,false);
 assert.equal((await enviar('/staging/prepedidos/'+id+'/entrega',{
  token:lb.token
 })).status,404);
 const cliente='cus_ENTREGA001',payment='pay_ENTREGA001';
 ponte.preparar({titularId:alice.titularId,prepedidoId:id,
  clienteAsaasId:cliente});
 const pro={
  ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  async criarCobrancaPix(){return {ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
   pagamentoId:payment,valorCentavos:25000,status:'PENDING'};},
  async consultarCobranca(p){assert.equal(p,payment);
   return {pagamentoId:payment,status:'RECEIVED',valorCentavos:25000,
    externalReference:'LOOPLAB-'+id,clienteAsaasId:cliente,
    billingType:'PIX'};}
 };
 await ponte.enviarUmaVez({titularId:alice.titularId,
  prepedidoId:id,provedor:pro,execucaoLiberada:true});
 const inbox=new InboxWebhookPrepedidoAsaasStaging({banco,token:TOKEN});
 const evento='evt_ENTREGA001';
 inbox.registrar({cabecalhoToken:TOKEN,corpoBruto:Buffer.from(JSON.stringify({
  id:evento,event:'PAYMENT_RECEIVED',payment:{id:payment,value:250,
   status:'RECEIVED',billingType:'PIX',
   externalReference:'LOOPLAB-'+id}
 }))});
 assert.equal((await enviar(url,{metodo:'POST',operador:true,
  dados:{prepedidoId:id}})).status,409,
  'webhook isolado não libera entrega');
 const worker=new ReconsultaWebhookPrepedidoAsaasStaging({banco,inbox,ponte});
 const reconciliado=await worker.processar({eventoId:evento,provedor:pro,
  execucaoLiberada:true});
 assert.equal(reconciliado.estado,'CONCLUIDO');
 const first=await enviar(url,{metodo:'POST',operador:true,
  dados:{prepedidoId:id}});
 assert.equal(first.status,201,JSON.stringify(first.body));
 assert.equal(first.body.quantidadeLinhas,1);
 assert.equal(first.body.itens[0].tipo,'PDF');
 assert.equal(first.body.habilitadaParaEntregaReal,false);
 assert.equal(first.body.downloadRealHabilitado,false);
 const replay=await enviar(url,{metodo:'POST',operador:true,
  dados:{prepedidoId:id}});
 assert.equal(replay.status,200);
 assert.equal(replay.body.repetido,true);
 const meus=await enviar('/staging/meus-pedidos',{token:la.token});
 assert.equal(meus.body.pedidos[0].entregaFicticia.status,'APTA_SIMULADA_SEM_ENTREGA');
 const outros=await enviar('/staging/meus-pedidos',{token:lb.token});
 assert.equal(outros.body.pedidos.length,0);
 const office=await enviar('/staging/escritorio-unificado',{operador:true});
 assert.equal(office.status,200);
 assert.equal(office.body.entregasFicticias,1);
 assert.equal(office.body.pedidos[0].entregaFicticia.quantidadeLinhas,1);
 assert.equal(banco.prepare(
  'SELECT COUNT(*) AS n FROM akitemm_prepedido_entregas_sandbox_staging'
 ).get().n,1);
 await ponte.conferir({titularId:alice.titularId,prepedidoId:id,
  provedor:{ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
   async consultarCobranca(){return {pagamentoId:payment,status:'REFUNDED',
    valorCentavos:25000,externalReference:'LOOPLAB-'+id,
    clienteAsaasId:cliente,billingType:'PIX'};}}});
 const revertido=entregas.consultar({titularId:alice.titularId,prepedidoId:id});
 assert.equal(revertido.status,'BLOQUEADA_PARA_REVISAO_SANDBOX');
 assert.equal(revertido.downloadRealHabilitado,false);
 assert.equal((await enviar(url,{metodo:'POST',operador:true,
  dados:{prepedidoId:id}})).status,409);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
