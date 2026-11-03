'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {DatabaseSync}=require('node:sqlite');
const {criarAppCheckoutStagingLocal,catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {cotarCheckoutPublico}=require('../src/domain/cotacao-checkout-publico');
const {COOKIE}=require('../src/domain/autenticacao-checkout-staging-sqlite');
const {InboxWebhookPrepedidoAsaasStaging}=
 require('../src/domain/inbox-webhook-prepedido-asaas-staging');
const {ReconsultaWebhookPrepedidoAsaasStaging}=
 require('../src/domain/reconsulta-webhook-prepedido-asaas-staging');
const {PosicoesPendentesCheckoutSandboxStaging}=
 require('../src/domain/posicoes-pendentes-checkout-sandbox-staging');
const ADMIN='admin-op-staging-'+('X'.repeat(48));
const TOKEN='t'.repeat(64);
test('Escritorio e Meus Pedidos compartilham um SQLite, leitura segregada sem vendas reais',async t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON;');
 const catalogo=catalogoFicticioCheckout();
 const {app,auth,intencoes,prePedidos,ponte}=criarAppCheckoutStagingLocal({
  banco,repositorioCatalogo:catalogo,segredoOperador:ADMIN
 });
 const c1=await auth.provisionarConta({nomeLogin:'comprador-staging-alpha',
  senha:'SenhaFicticiaAlpha2026!'});
 await auth.provisionarConta({nomeLogin:'comprador-staging-beta',
  senha:'SenhaFicticiaBeta2026!'});
 const s1=await auth.entrar({nomeLogin:'comprador-staging-alpha',
  senha:'SenhaFicticiaAlpha2026!'});
 const s2=await auth.entrar({nomeLogin:'comprador-staging-beta',
  senha:'SenhaFicticiaBeta2026!'});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(res=>server.close(res));banco.close();});
 const origin='http://127.0.0.1:'+server.address().port;
 const get=async(uri,headers={})=>{
  const r=await fetch(origin+uri,{headers});
  return {status:r.status,json:await r.json()};
 };
 const op=()=>get('/staging/escritorio-homologacao',{Authorization:'Bearer '+ADMIN});
 assert.equal((await get('/staging/escritorio-homologacao')).status,401);
 assert.equal((await get('/staging/escritorio-homologacao',{
  Cookie:COOKIE+'='+s1.token})).status,401);
 assert.equal((await get('/staging/escritorio-homologacao?limite=10',{
  Authorization:'Bearer '+ADMIN})).status,400);
 assert.equal((await op()).json.resumo.prepedidosStaging,0);
 const entrada={itens:[{produtoId:'curso-homologacao-250',quantidade:1}]};
 const cotacao=await cotarCheckoutPublico({repositorio:catalogo,entrada});
 const draft=intencoes.criar({titularId:c1.titularId,
  chaveIdempotencia:'staging-office-001',entrada,cotacao});
 const pedido=await prePedidos.preparar({titularId:c1.titularId,
  rascunhoId:draft.intencao.pedidoId,repositorioCatalogo:catalogo});
 const prepedidoId=pedido.prepedido.prepedidoId;
 const p1=await get('/staging/meus-pedidos',{Cookie:COOKIE+'='+s1.token});
 assert.equal(p1.status,200);
 assert.equal(p1.json.pedidos.length,1);
 assert.equal(p1.json.pedidos[0].conferenciaPSPConcluida,false);
 assert.equal((await get('/staging/meus-pedidos',{
  Cookie:COOKIE+'='+s2.token})).json.pedidos.length,0);
 assert.equal((await op()).json.resumo.prepedidosStaging,1);
 ponte.preparar({titularId:c1.titularId,prepedidoId,
  clienteAsaasId:'cus_SANDBOXOFFICE001'});
 const pay='pay_SANDBOXOFFICE001';
 const mock={ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  async criarCobrancaPix(){return {ambiente:this.ambiente,
   pagamentoId:pay,valorCentavos:25000,status:'PENDING'};},
  async consultarCobranca(){return {pagamentoId:pay,status:'RECEIVED',
   billingType:'PIX',valorCentavos:25000,
   externalReference:'LOOPLAB-'+prepedidoId,
   clienteAsaasId:'cus_SANDBOXOFFICE001'};}
 };
 await ponte.enviarUmaVez({titularId:c1.titularId,prepedidoId,
  provedor:mock,execucaoLiberada:true});
 const inbox=new InboxWebhookPrepedidoAsaasStaging({banco,token:TOKEN});
 const eventoId='evt_SANDBOXOFFICE001';
 inbox.registrar({cabecalhoToken:TOKEN,corpoBruto:Buffer.from(
  JSON.stringify({id:eventoId,event:'PAYMENT_RECEIVED',
   payment:{id:pay,billingType:'PIX',value:250,status:'RECEIVED'}})
 )});
 const aviso=await get('/staging/meus-pedidos',{Cookie:COOKIE+'='+s1.token});
 assert.equal(aviso.json.pedidos[0].conferenciaPSPConcluida,false,
  'webhook sem reconsulta nao confirma PSP');
 assert.equal(aviso.json.pedidos[0].situacaoOperacional,
  'WEBHOOK_RECEBIDO_AGUARDANDO_RECONSULTA');
 const worker=new ReconsultaWebhookPrepedidoAsaasStaging({banco,inbox,ponte});
 const result=await worker.processar({eventoId,provedor:mock,execucaoLiberada:true});
 assert.equal(result.estado,'CONCLUIDO');
 const recebido=await get('/staging/meus-pedidos',{Cookie:COOKIE+'='+s1.token});
 assert.equal(recebido.json.pedidos[0].conferenciaPSPConcluida,true);
 assert.equal(recebido.json.pedidos[0].statusInformadoPeloPSP,'RECEIVED');
 assert.equal(recebido.json.pedidos[0].posicoesFicticiasConferidas,0);
 const pos=new PosicoesPendentesCheckoutSandboxStaging({banco,ponte});
 const primeira=pos.projetar({titularId:c1.titularId,prepedidoId,eventoId,
  execucaoLiberada:true});
 assert.equal(primeira.repetido,false);
 const final=await get('/staging/meus-pedidos',{Cookie:COOKIE+'='+s1.token});
 assert.equal(final.json.pedidos[0].conferenciaPSPConcluida,true);
 assert.equal(final.json.pedidos[0].posicoesFicticiasConferidas,1);
 assert.equal(final.json.pedidos[0].posicoesCriadas,0);
 const office=await op();
 assert.equal(office.status,200);
 assert.equal(office.json.resumo.prepedidosStaging,1);
 assert.equal(office.json.resumo.cobrancasSandbox,1);
 assert.equal(office.json.resumo.eventosPersistidos,1);
 assert.equal(office.json.resumo.recebimentosPSPConciliados,1);
 assert.equal(office.json.resumo.posicoesPendentesSimuladas,1);
 assert.equal(office.json.resumo.posicoesReais,0);
 assert.equal(office.json.pedidos[0].estadoOperacional,'POSICAO_FICTICIA_PENDENTE');
 assert.equal(office.json.pedidos[0].conferenciaPSPConcluida,true);
 assert.equal(office.json.pedidos[0].titularId,c1.titularId);
 assert.equal(office.json.semDinheiroReal,true);
 assert.equal((await get('/staging/meus-pedidos',{
  Cookie:COOKIE+'='+s2.token})).json.pedidos.length,0);
 assert.equal((await get('/staging/escritorio-homologacao',{
  Authorization:'Bearer '+('Z'.repeat(64))})).status,401);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('Escritorio do staging nao existe sem chave do operador nem no publico',async t=>{
 const banco=new DatabaseSync(':memory:');
 const {app}=criarAppCheckoutStagingLocal({banco});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(done=>server.close(done));banco.close();});
 const base='http://127.0.0.1:'+server.address().port;
 assert.notEqual((await fetch(base+'/staging/escritorio-homologacao')).status,200);
 const publico=require('../src/server');
 const outro=publico.listen(0,'127.0.0.1');await once(outro,'listening');
 t.after(()=>new Promise(done=>outro.close(done)));
 assert.equal((await fetch('http://127.0.0.1:'+outro.address().port+
  '/staging/escritorio-homologacao')).status,404);
});
