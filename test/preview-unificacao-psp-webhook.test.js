'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {once}=require('node:events'),{randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {criarGateway}=require('../scripts/servidor-escritorio-preview-railway');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {COOKIE}=require('../src/domain/conta-unica-candidata-sqlite');
const {criarAgendadorConciliacaoSandbox}=
 require('../src/domain/agendador-conciliacao-asaas-sandbox');
const senha='SenhaPreviaEnsaioFicticioForte2026';
const senhaAdmin='SenhaAdminExclusivaForteEnsaio2026!';
const operador='OperadorEnsaioFicticio_'+('X'.repeat(38));
const token='WebhookSandboxApenasEnsaioTestes2026';
const cliente='cus_EnsaioPixUnico',pagamento='pay_EnsaioPixUnico';

test('gateway unificado: Pix, aviso e motor usam o mesmo SQLite de laboratorio',async t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;');
 let envios=0,consultas=0,provas=0,prepedidoId='';
 let resolverPix,avisarPix;
 const pixAguardando=new Promise(resolve=>{resolverPix=resolve;});
 const pixIniciado=new Promise(resolve=>{avisarPix=resolve;});
 const psp={ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  async testarAcessoRemoto(){provas++;return {ambiente:this.ambiente,pspRemotoRespondeu:true};},
  async criarCobrancaPix({valorCentavos,pedidoId}){
   envios++;assert.equal(valorCentavos,25000);assert.equal(pedidoId,prepedidoId);
   avisarPix();
   await pixAguardando;
   return {ambiente:this.ambiente,pagamentoId:pagamento,valorCentavos,status:'PENDING'};
  },
  async consultarCobranca(id){
   consultas++;assert.equal(id,pagamento);
   return {pagamentoId:pagamento,status:'RECEIVED',
    valorCentavos:25000,billingType:'PIX',
    clienteAsaasId:cliente,externalReference:'LOOPLAB-'+prepedidoId};
  }
 };
 const r=criarAppLojaEscritorioCandidato({banco,
  repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  webhookHomologacaoToken:token,provedorReconsultaSandbox:psp,
  operacoesSandboxAutorizadas:true,segredoOperador:operador,
  termosVersao:'LAB-preview-unificado-2026',
  termosTexto:'Somente teste de sistema sem cobranca, lucro ou saque comercial.'
 });
 const interno=r.app.listen(0,'127.0.0.1');await once(interno,'listening');
 let gateway=null;
 // Limpeza garantida mesmo se a construcao do gateway falhar.
 t.after(async()=>{
  if(gateway?.listening)await new Promise(ok=>gateway.close(ok));
  if(interno.listening)await new Promise(ok=>interno.close(ok));
  banco.close();
 });
 gateway=criarGateway({portaInterna:interno.address().port,
  senhaAcesso:senha,senhaAdmin,segredoOperador:operador,
  permitirWebhookSandbox:true});
 gateway.listen(0,'127.0.0.1');await once(gateway,'listening');
 const base='http://127.0.0.1:'+gateway.address().port;
 const auth='Basic '+Buffer.from('acesso:'+senha).toString('base64');
 const authAdmin='Basic '+Buffer.from('operador:'+senhaAdmin).toString('base64');
 const pronto=await fetch(base+'/staging/escritorio-unificado/sandbox-pix/estado',{
  headers:{Authorization:authAdmin}});
 assert.equal(pronto.status,200);
 const status=await pronto.json();
 assert.equal(status.status,'INTEGRADO_SANDBOX_NO_MESMO_SQLITE');
 assert.equal(status.webhookIngressAtivo,true);
 assert.equal(status.usaSQLiteDaLoja,true);
 assert.equal(status.checkoutComercialHabilitado,false);
 const provaUrl=base+'/staging/escritorio-unificado/sandbox-pix/provar-acesso-remoto';
 assert.equal((await fetch(provaUrl)).status,401);
 const respostaProva=await fetch(provaUrl,{headers:{Authorization:authAdmin}});
 assert.equal(respostaProva.status,200);
 const prova=await respostaProva.json();
 assert.equal(prova.pspRemotoVerificado,true);
 assert.equal(prova.webhookExternoComprovado,false);
 assert.equal(prova.cobrancasCriadas,0);
 assert.equal(prova.marcoZeroAprovado,false);
 assert.equal(provas,1);
 assert.equal(envios,0);
 async function post(route,body,extra={}){
  const x=await fetch(base+route,{method:'POST',
   headers:{Authorization:route.startsWith('/staging/escritorio-unificado/')?
     authAdmin:auth,'Content-Type':'application/json',
    'X-LOOP-LAB':'participante',...extra},
   body:JSON.stringify(body)});
  return {status:x.status,body:await x.json(),cookie:x.headers.get('set-cookie')};
 }
 const cadastro=await post('/staging/contas/cadastrar',{
  nome:'Cliente Ficticio',nick:'Unico',email:'unico@example.invalid',
  senha:'SenhaForteSomenteTeste2026!',aceiteExplicito:true
 });
 assert.equal(cadastro.status,201,JSON.stringify(cadastro.body));
 const login=await post('/staging/contas/entrar',{
  nick:'Unico',senha:'SenhaForteSomenteTeste2026!'
 });
 assert.equal(login.status,200);
 const cookie=login.cookie.match(new RegExp(COOKIE+'=([a-f0-9]{64})'))[1];
 const csrf=login.body.csrf;
 const cor=await fetch(base+'/staging/escritorio-unificado/sinalizacao/curso-homologacao-250',{
  method:'PATCH',headers:{Authorization:authAdmin,'Content-Type':'application/json'},
  body:JSON.stringify({classificacao:'VERDE',quantidadeMinimaLoop:1,revisaoEsperada:0})
 });
 assert.equal(cor.status,200,await cor.text());
 const pedido=await post('/staging/vitrine/loja/pedidos',{
  itens:[{produtoId:'curso-homologacao-250',quantidade:1}]
 },{Cookie:COOKIE+'='+cookie,'X-Checkout-Csrf':csrf,
  'Idempotency-Key':'ensaiopreviewunificado2026'});
 assert.equal(pedido.status,201,JSON.stringify(pedido.body));
 prepedidoId=pedido.body.pedido.pedidoId;
 assert.equal(r.motorConta.consultar({titularId:cadastro.body.titularId})
  .posicoesAtivasDoTitular,0);
 const dados={prepedidoId,clienteAsaasId:cliente,aceiteEnsaio:true};
 const rota='/staging/escritorio-unificado/sandbox-pix/preparar';
 const invalido=await post(rota,{...dados,aceiteEnsaio:false});
 assert.equal(invalido.status,400);
 assert.equal(envios,0);
 // O webhook do Asaas chega ANTES de o POST de criacao responder:
 // primeiro fica em quarentena, depois o ciclo automatico o recupera.
 const emCriacao=post(rota,dados);
 await pixIniciado;
 const hook='/webhooks/asaas-sandbox-unificado';
 const aviso={id:'evt_PreviaUnificada2026Recebido',event:'PAYMENT_RECEIVED',
  payment:{id:pagamento,billingType:'PIX',status:'RECEIVED',
   value:250,externalReference:'LOOPLAB-'+prepedidoId}};
 const webhook=async valor=>fetch(base+hook,{method:'POST',headers:{
  'Content-Type':'application/json','asaas-access-token':valor
 },body:JSON.stringify(aviso)});
 let antecipado;
 try{antecipado=await webhook(token);}finally{resolverPix();}
 assert.equal(antecipado.status,200);
 assert.equal((await antecipado.json()).pendenteReconsulta,false);
 assert.equal(banco.prepare([
  'SELECT COUNT(*) AS n FROM akitemm_prepedido_webhook_antecipados_staging'
 ].join(' ')).get().n,1);
 const cobrado=await emCriacao;
 assert.equal(cobrado.status,201,JSON.stringify(cobrado.body));
 assert.equal(cobrado.body.ambiente,'ASAAS_SANDBOX_EXCLUSIVO');
 assert.equal(cobrado.body.posicoesReais,0);
 const repetido=await post(rota,dados);
 assert.equal(repetido.status,200);
 assert.equal(repetido.body.repetido,true);
 assert.equal(envios,1);
 assert.equal((await webhook('token-errado')).status,401);
 assert.equal((await fetch(base+hook)).status,405);
 const aceito=await webhook(token);
 assert.equal(aceito.status,200,await aceito.text());
 assert.equal((await webhook(token)).status,200);
 assert.equal(r.motorConta.consultar({titularId:cadastro.body.titularId})
  .posicoesAtivasDoTitular,0,'webhook bruto nao cria posicao');
 // Uma operacao processa todos os avisos novos, sem selecionar
 // evento por evento. O mesmo fluxo de reconsulta e motor e reutilizado.
 const conciliar=()=>post('/staging/escritorio-unificado/reconciliar-pendentes-sandbox',
  {limite:20});
 assert.equal((await post('/staging/escritorio-unificado/reconciliar-pendentes-sandbox',
  {limite:21})).status,400);
 assert.equal((await fetch(base+
  '/staging/escritorio-unificado/reconciliar-pendentes-sandbox',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({limite:20})
  })).status,401);
 // O mesmo worker funciona sem clique do operador: um tick do
 // agendador entrega o aviso confirmado ao motor no MESMO SQLite.
 const auto=criarAgendadorConciliacaoSandbox({
  executar:r.executarConciliacaoSandbox,limite:20
 });
 const rodada=await auto.executarUmaVez();
 assert.equal(rodada.estado,'CONCLUIDA');
 assert.equal(rodada.consultados,1);
 assert.equal(rodada.pendentesRestantes,0);
 assert.equal(banco.prepare([
  'SELECT COUNT(*) AS n FROM akitemm_prepedido_webhook_inbox_staging',
  'WHERE evento_id=?'
 ].join(' ')).get(aviso.id).n,1,
 'agendador promoveu o aviso antecipado da quarentena para inbox normal');
 assert.equal(banco.prepare([
  'SELECT COUNT(*) AS n FROM akitemm_prepedido_webhook_reconsulta_staging',
  'WHERE evento_id=?'
 ].join(' ')).get(aviso.id).n,1);
 await auto.encerrar();
 const conf=await conciliar();
 assert.equal(conf.status,200,JSON.stringify(conf.body));
 assert.equal(conf.body.consultados,0);
 assert.equal(conf.body.pendentesRestantes,0);
 assert.equal(conf.body.posicoesComerciais,0);
 const repetidoLote=await conciliar();
 assert.equal(repetidoLote.status,200);
 assert.equal(repetidoLote.body.consultados,0);
 assert.equal(consultas,1);
 assert.equal(r.motorConta.consultar({titularId:cadastro.body.titularId})
  .posicoesAtivasDoTitular,1);
 assert.equal((await post('/staging/escritorio-unificado/reconsultar-psp',{
  eventoId:aviso.id})).body.vinculoMotorEnsaio.estado,'JA_VINCULADO');
 assert.equal(envios,1);
 const audit=await fetch(base+'/staging/escritorio-unificado/auditoria-cobertura',{
  headers:{Authorization:authAdmin}});
 assert.equal(audit.status,200);
 const rel=await audit.json();
 assert.equal(rel.resumo.posicoesNoMotorEnsaio,1);
 assert.equal(rel.marcoZeroFinanceiroAprovado,false);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
