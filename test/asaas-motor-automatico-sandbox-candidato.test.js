'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {once}=require('node:events'),{randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {COOKIE}=require('../src/domain/conta-unica-candidata-sqlite');
const TOKEN='EnsaioWebhookConfirmacaoAsaas2026TokenFortissimo';
const OP='OperadorSomenteLocalConfirmacaoPagamento_'+('R'.repeat(50));
const CUSTOMER='cus_TestadorPagamentoSandbox2026';
const PAYMENT='pay_TestadorPagamentoSandbox2026';
test('webhook bruto nao gera posicoes; PSP reconsultado cria lote ROXO pendente unico, sem direito',async t=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 let gets=0,posts=0,estadoPSP='RECEIVED';
 const provedor={
  ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  async criarCobrancaPix({valorCentavos}){
   posts++;
   assert.equal(valorCentavos,25000);
   return {ambiente:this.ambiente,pagamentoId:PAYMENT,
    valorCentavos,status:'PENDING'};
  },
  async consultarCobranca(id){
   gets++;assert.equal(id,PAYMENT);
   return {pagamentoId:PAYMENT,status:estadoPSP,valorCentavos:25000,
    billingType:'PIX',clienteAsaasId:CUSTOMER,
    externalReference:'LOOPLAB-'+pedidoId};
  }
 };
 const r=criarAppLojaEscritorioCandidato({
  banco:db,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  webhookHomologacaoToken:TOKEN,provedorReconsultaSandbox:provedor,
  operacoesSandboxAutorizadas:true,
  segredoOperador:OP,termosVersao:'LAB-auto-conciliacao-2026',
  termosTexto:'Termos de homologacao sem dinheiro, saques, premios, saldos nem creditos reais.'
 });
 const server=r.app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(ok=>server.close(ok));db.close()});
 const base='http://127.0.0.1:'+server.address().port;
 async function call(route,{method='GET',cookie,csrf,key,admin=false,body}={}){
  const x=await fetch(base+route,{method,headers:{
   ...(cookie?{Cookie:COOKIE+'='+cookie}:{}),
   ...(csrf?{'X-Checkout-Csrf':csrf}:{}),
   ...(key?{'Idempotency-Key':key}:{}),
   ...(admin?{Authorization:'Bearer '+OP}:{}),
   ...(body?{'Content-Type':'application/json','X-LOOP-LAB':'participante'}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  return {status:x.status,json:await x.json(),cookie:x.headers.get('set-cookie')};
 }
 const cadastro=await call('/staging/contas/cadastrar',{method:'POST',body:{
  nome:'Cliente Laboratorio',nick:'Labor',email:'labor@example.invalid',
  senha:'SenhaLaboratorio2026#Forte',aceiteExplicito:true
 }});
 assert.equal(cadastro.status,201,JSON.stringify(cadastro.json));
 const login=await call('/staging/contas/entrar',{method:'POST',body:{
  nick:'Labor',senha:'SenhaLaboratorio2026#Forte'
 }});
 assert.equal(login.status,200);
 const titularId=cadastro.json.titularId;
 const cookie=login.cookie.match(new RegExp(COOKIE+'=([a-f0-9]{64})'))[1],csrf=login.json.csrf;
 const cor=await call('/staging/escritorio-unificado/sinalizacao/curso-homologacao-250',{
  method:'PATCH',admin:true,body:{classificacao:'ROXO',quantidadeMinimaLoop:1,
   revisaoEsperada:0,posicoesPorUnidadeRoxo:5}
 });
 assert.equal(cor.status,200,JSON.stringify(cor.json));
 const pedir=await call('/staging/vitrine/loja/pedidos',{method:'POST',cookie,csrf,
  key:'auto-sandbox-posicoes-roxas-0001',
  body:{itens:[{produtoId:'curso-homologacao-250',quantidade:1}]}
 });
 assert.equal(pedir.status,201,JSON.stringify(pedir.json));
 const pedidoId=pedir.json.pedido.pedidoId;
 const snap=r.sinalizacaoVitrine.consultarFotografiaPrepedido({prepedidoId:pedidoId});
 assert.equal(snap.planejamentoPosicoes.quantidadePosicoesPrevistas,5);
 const preparo=r.ponte.preparar({titularId,prepedidoId:pedidoId,clienteAsaasId:CUSTOMER});
 assert.equal(preparo.repetido,false);
 await r.ponte.enviarUmaVez({titularId,prepedidoId:pedidoId,provedor,
  execucaoLiberada:true});
 assert.equal(posts,1);
 assert.throws(()=>r.motorConta.vincularPedidoConferidoSandbox({prepedidoId:pedidoId}),
  /PSP_SANDBOX_NAO_CONCILIADO_PARA_LOTE/);
 assert.equal(r.motorConta.consultar({titularId}).posicoesAtivasDoTitular,0);
 const evt='evt_AutoMotorPaymentReceived2026';
 r.inbox.registrar({cabecalhoToken:TOKEN,corpoBruto:Buffer.from(JSON.stringify({
  id:evt,event:'PAYMENT_RECEIVED',payment:{id:PAYMENT}
 }))});
 assert.equal(r.motorConta.consultar({titularId}).posicoesAtivasDoTitular,0);
 assert.equal((await call('/staging/escritorio-unificado/motor/conciliar-pedido-sandbox',
  {method:'POST',admin:true,body:{prepedidoId:pedidoId}})).status,400);
 assert.equal((await call('/staging/escritorio-unificado/motor/conciliar-pedido-sandbox',
  {method:'POST',body:{prepedidoId:pedidoId}})).status,401);
 const conf=await call('/staging/escritorio-unificado/reconsultar-psp',{
  method:'POST',admin:true,body:{eventoId:evt}
 });
 assert.equal(conf.status,200,JSON.stringify(conf.json));
 assert.equal(conf.json.estado,'CONCLUIDO');
 assert.equal(conf.json.vinculoMotorEnsaio.estado,'PENDENTES_GERADAS');
 assert.equal(conf.json.vinculoMotorEnsaio.quantidade,5);
 assert.equal(gets,1);
 assert.equal(r.motorConta.consultar({titularId}).posicoesAtivasDoTitular,5);
 assert.equal(r.motorConta.consultar({titularId}).pendentesDeEnsaio,5);
 const replay=await call('/staging/escritorio-unificado/reconsultar-psp',{
  method:'POST',admin:true,body:{eventoId:evt}
 });
 assert.equal(replay.status,200);
 assert.equal(replay.json.vinculoMotorEnsaio.estado,'JA_VINCULADO');
 assert.equal(r.motorConta.consultar({titularId}).posicoesAtivasDoTitular,5);
 assert.equal(gets,1,'repetir webhook nao faz GET ao PSP novamente');
 assert.equal(posts,1,'replay nao gera nova cobranca');
 assert.equal(r.motorConta.consultar({titularId}).posicoesReais,0);
 assert.equal(r.motorConta.consultar({titularId}).dinheiroReal,false);
 // Reversão reconsultada não apaga o histórico, mas tira as posições
 // da elegibilidade de fila/catraca e impede reativação por replay.
 estadoPSP='REFUNDED';
 const reversaoId='evt_AutoMotorRefund2026';
 r.inbox.registrar({cabecalhoToken:TOKEN,corpoBruto:Buffer.from(JSON.stringify({
  id:reversaoId,event:'PAYMENT_REFUNDED',payment:{id:PAYMENT}
 }))});
 const devolucao=await call('/staging/escritorio-unificado/reconsultar-psp',{
  method:'POST',admin:true,body:{eventoId:reversaoId}
 });
 assert.equal(devolucao.status,200,JSON.stringify(devolucao.json));
 assert.equal(devolucao.json.vinculoMotorEnsaio.estado,'SUSPENSO_POR_REVERSAO_PSP');
 assert.equal(devolucao.json.vinculoMotorEnsaio.quantidadeSuspensa,5);
 const suspensas=r.motorConta.consultar({titularId});
 assert.equal(suspensas.posicoesAtivasDoTitular,5);
 assert.equal(suspensas.pendentesDeEnsaio,0);
 assert.ok(suspensas.minhasPosicoes.every(x=>x.estado==='ENSAIO_EM_REVISAO_PSP'));
 assert.throws(()=>r.motorConta.vincularPedidoConferidoSandbox({prepedidoId:pedidoId}),
  /PSP_SANDBOX_NAO_CONCILIADO_PARA_LOTE/);
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
