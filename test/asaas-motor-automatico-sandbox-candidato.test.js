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
  chaveCpfHmac:randomBytes(32),chaveCpfCifra:randomBytes(32),
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
 // Modo estrito de pre-cobranca barra o ROXO 250/5 antes de qualquer POST
 // ao PSP e sem deixar tentativa de criacao indeterminada.
 await assert.rejects(r.ponte.enviarUmaVez({
  titularId,prepedidoId:pedidoId,provedor,execucaoLiberada:true,
  exigirCoberturaBruta:true
 }),{codigo:'COBERTURA_BRUTA_INSUFICIENTE_PARA_COBRANCA'});
 assert.equal(posts,0);
 assert.equal(r.ponte.consultar({titularId,prepedidoId:pedidoId}).estado,'PREPARADA');
 // Operador pode executar simulacao NEGATIVA de laboratorio mesmo assim.
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
 // Auditoria do mesmo pedido: ROXO a R$ 250 com 5 posicoes eh
 // aritmeticamente inviavel antes de pagar fornecedor ou PSP.
 const auditoria=await call('/staging/escritorio-unificado/auditoria-cobertura',
  {admin:true});
 assert.equal(auditoria.status,200,JSON.stringify(auditoria.json));
 assert.equal(auditoria.json.resumo.brutoInsuficiente,1);
 assert.equal(auditoria.json.resumo.referenciaTotalCalculadaCentavos,125000);
 assert.equal(auditoria.json.pedidos[0].posicoesPlanejadas,5);
 assert.equal(auditoria.json.pedidos[0].saldoBrutoAposReservaCentavos,-100000);
 assert.equal(auditoria.json.pedidos[0].aptoParaLiberarReal,false);
 assert.equal(auditoria.json.marcoZeroFinanceiroAprovado,false);
 assert.equal(auditoria.json.somenteLeitura,true);
 assert.equal(JSON.stringify(auditoria.json).includes(titularId),false);
 assert.equal((await call('/staging/escritorio-unificado/auditoria-cobertura'))
  .status,401);
 assert.equal((await call('/staging/escritorio-unificado/auditoria-cobertura?limite=1000',
  {admin:true})).status,400);
 assert.equal(r.motorConta.consultar({titularId}).posicoesAtivasDoTitular,5);
 const primeiraPosicao=r.motorConta.consultar({titularId}).minhasPosicoes[0].numero;
 const versaoTermos='LAB-auto-conciliacao-2026';
 const bodyAceite={posicaoId:primeiraPosicao,versaoTermos,aceiteExplicito:true};
 const rotaAceite='/staging/motor/posicoes/confirmar-ensaio';
 assert.equal((await call(rotaAceite,{method:'POST',cookie,csrf,body:bodyAceite})).status,409,
  'sem CPF ainda nao ha aceite individual');
 assert.equal((await call(rotaAceite,{method:'POST',body:bodyAceite})).status,401);
 assert.equal((await call(rotaAceite,{method:'POST',cookie,body:bodyAceite})).status,403);
 const cpf=await call('/staging/contas/identidade',{method:'POST',cookie,csrf,body:{
  cpf:'52998224725',aceiteExplicito:true
 }});
 assert.equal(cpf.status,201,JSON.stringify(cpf.json));
 assert.equal((await call(rotaAceite,{method:'POST',cookie,csrf,body:{
  ...bodyAceite,aceiteExplicito:false
 }})).status,400);
 const aceite=await call(rotaAceite,{method:'POST',cookie,csrf,body:bodyAceite});
 assert.equal(aceite.status,201,JSON.stringify(aceite.json));
 assert.equal(aceite.json.aceiteIndividualRegistrado,true);
 assert.equal(aceite.json.identidadeExternaVerificada,false);
 assert.equal(aceite.json.criouDireitoReal,false);
 assert.equal((await call(rotaAceite,{method:'POST',cookie,csrf,body:bodyAceite})).status,200);
 const pos=r.motorConta.consultar({titularId});
 assert.equal(pos.pendentesDeEnsaio,4);
 assert.equal(pos.minhasPosicoes.filter(x=>x.aceiteIndividualRegistrado).length,1);
 assert.equal(pos.minhasPosicoes.filter(x=>x.pendente).length,4);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_aceites_posicao').get().n,1);
 // Outra conta nao ve nem consegue aceitar a posicao vinculada ao titular.
 const outro=await call('/staging/contas/cadastrar',{method:'POST',body:{
  nome:'Outro titular laboratorio',nick:'Outro',email:'outro@example.invalid',
  senha:'OutraSenhaLaboratorio2026#Forte',aceiteExplicito:true
 }});
 assert.equal(outro.status,201);
 const loginOutro=await call('/staging/contas/entrar',{method:'POST',body:{
  nick:'Outro',senha:'OutraSenhaLaboratorio2026#Forte'
 }});
 assert.equal(loginOutro.status,200);
 const cookieOutro=loginOutro.cookie.match(new RegExp(COOKIE+'=([a-f0-9]{64})'))[1];
 assert.equal((await call(rotaAceite,{method:'POST',cookie:cookieOutro,
  csrf:loginOutro.json.csrf,body:bodyAceite})).status,404);
 assert.equal(r.motorConta.consultar({titularId:outro.json.titularId}).posicoesAtivasDoTitular,0);
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
 assert.equal((await call(rotaAceite,{method:'POST',cookie,csrf,body:bodyAceite})).status,409);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_aceites_posicao').get().n,1,
  'reversao nao apaga aceite historico');
 assert.throws(()=>r.motorConta.vincularPedidoConferidoSandbox({prepedidoId:pedidoId}),
  /PSP_SANDBOX_NAO_CONCILIADO_PARA_LOTE/);
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
