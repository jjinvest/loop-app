'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {cotarCheckoutPublico}=require('../src/domain/cotacao-checkout-publico');
const TOKEN='WebhookQuarentenaAntecipada2026TokenSeguro'+('T'.repeat(35));
const OPERADOR='WebhookQuarentenaOperador2026'+('O'.repeat(40));
const CLIENTE='cus_WebhookQuarentena2026';
const PAGAMENTO='pay_WebhookQuarentena2026';
test('webhook antecipado aparece como pendente e some apenas quando chega ao livro',async t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 let chamadas=0,resolver;
 const fornecedor={
  ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  async criarCobrancaPix({valorCentavos}){
   chamadas++;assert.equal(valorCentavos,25000);
   return new Promise(ok=>{resolver=ok;});
  },
  async consultarCobranca(){throw Error('Nao consultar PSP em diagnostico');}
 };
 const app=criarAppLojaEscritorioCandidato({
  banco,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  webhookHomologacaoToken:TOKEN,provedorReconsultaSandbox:fornecedor,
  operacoesSandboxAutorizadas:true,
  segredoOperador:OPERADOR,termosVersao:'LAB-quarentena-2026',
  termosTexto:'Apenas teste interno ficticio, sem dinheiro, pagamentos reais ou saque.'
 });
 const server=app.app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(async()=>{
  await new Promise(ok=>server.close(ok));
  banco.close();
 });
 const titular=await app.contas.cadastrar({
  nome:'Cliente Teste Quarentena',nick:'Quarent',
  email:'quarentena@example.invalid',senha:'SenhaTesteQuarentena2026#',
  termosVersao:'LAB-quarentena-2026',
  termosTexto:'Apenas teste interno ficticio, sem dinheiro, pagamentos reais ou saque.',
  aceiteExplicito:true
 });
 const catalogo=catalogoFicticioCheckout();
 const entrada={itens:[{produtoId:'curso-homologacao-250',quantidade:1}]};
 const cotacao=await cotarCheckoutPublico({repositorio:catalogo,entrada});
 const intencao=app.intencoes.criar({
  titularId:titular.titularId,chaveIdempotencia:'quarentena-venda-2026',
  entrada,cotacao
 });
 const pedido=await app.prePedidos.preparar({
  titularId:titular.titularId,rascunhoId:intencao.intencao.pedidoId,
  repositorioCatalogo:catalogo
 });
 const prepedidoId=pedido.prepedido.prepedidoId;
 app.ponte.preparar({titularId:titular.titularId,prepedidoId,
  clienteAsaasId:CLIENTE});
 const pedidoPsp=app.ponte.enviarUmaVez({
  titularId:titular.titularId,prepedidoId,
  provedor:fornecedor,execucaoLiberada:true
 });
 assert.equal(chamadas,1);
 assert.equal(typeof resolver,'function');
 const registro=app.inbox.registrar({
  cabecalhoToken:TOKEN,
  corpoBruto:Buffer.from(JSON.stringify({
   id:'evt_WebhookAntecipado2026',event:'PAYMENT_RECEIVED',
   payment:{id:PAGAMENTO,externalReference:'LOOPLAB-'+prepedidoId,
    billingType:'PIX',value:250}
  }))
 });
 assert.equal(registro.emQuarentena,true);
 assert.equal(registro.posicoesCriadas,0);
 const base='http://127.0.0.1:'+server.address().port;
 const lerMonitor=async()=>{
  const r=await fetch(base+'/staging/escritorio-unificado/monitor-psp',{
   headers:{Authorization:'Bearer '+OPERADOR}
  });
  assert.equal(r.status,200);
  return r.json();
 };
 const antes=await lerMonitor();
 assert.equal(antes.resumo.total,0,'sem inbox nao mascarar quarentena');
 assert.equal(antes.resumo.quarentenaAguardandoVinculo,1);
 const respostaAdmin=await fetch(
  base+'/staging/escritorio-unificado',{
   headers:{Authorization:'Bearer '+OPERADOR}
  });
 assert.equal(respostaAdmin.status,200);
 const quadro=await respostaAdmin.json();
 assert.equal(quadro.quarentenaAguardandoVinculo,1);
 assert.equal(quadro.quarentenaDivergente,0);
 assert.equal(antes.resumo.quarentenaDivergente,0);
 assert.equal(antes.pagamentosReais,0);
 assert.equal(app.inbox.resumoAntecipados().aguardandoVinculo,1);
 // Resolver rede não dispara novo POST e não cria posição.
 resolver({ambiente:'ASAAS_SANDBOX_EXCLUSIVO',pagamentoId:PAGAMENTO,
  valorCentavos:25000,status:'PENDING'});
 await pedidoPsp;
 assert.equal(chamadas,1);
 assert.equal((await lerMonitor()).resumo.quarentenaAguardandoVinculo,1);
 const resultado=app.inbox.reconciliarAntecipados({
  execucaoLiberada:true,limite:20
 });
 assert.equal(resultado.vinculados,1);
 assert.equal(resultado.aguardandoVinculo,0);
 const depois=await lerMonitor();
 assert.equal(depois.resumo.quarentenaAguardandoVinculo,0);
 const quadroDepois=await fetch(base+'/staging/escritorio-unificado',{
  headers:{Authorization:'Bearer '+OPERADOR}
 });
 assert.equal((await quadroDepois.json()).quarentenaAguardandoVinculo,0);
 assert.equal(depois.resumo.pendentes,1,
  'evento aguarda GET PSP; nao declarar tudo conciliado');
 assert.equal(depois.resumo.total,1);
 assert.equal(app.motorConta.consultar().posicoesAtivasDoTitular??0,0);
 assert.equal(chamadas,1);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
