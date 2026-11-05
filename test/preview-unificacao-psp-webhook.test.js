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
const senha='SenhaPreviaEnsaioFicticioForte2026';
const operador='OperadorEnsaioFicticio_'+('X'.repeat(38));
const token='WebhookSandboxApenasEnsaioTestes2026';
const cliente='cus_EnsaioPixUnico',pagamento='pay_EnsaioPixUnico';

test('gateway unificado: Pix, aviso e motor usam o mesmo SQLite de laboratorio',async t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;');
 let envios=0,consultas=0,prepedidoId='';
 const psp={ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  async criarCobrancaPix({valorCentavos,pedidoId}){
   envios++;assert.equal(valorCentavos,25000);assert.equal(pedidoId,prepedidoId);
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
 const gateway=criarGateway({portaInterna:interno.address().port,
  senhaAcesso:senha,segredoOperador:operador,permitirWebhookSandbox:true});
 gateway.listen(0,'127.0.0.1');await once(gateway,'listening');
 t.after(async()=>{await new Promise(ok=>gateway.close(ok));
  await new Promise(ok=>interno.close(ok));banco.close();});
 const base='http://127.0.0.1:'+gateway.address().port;
 const auth='Basic '+Buffer.from('acesso:'+senha).toString('base64');
 const pronto=await fetch(base+'/staging/escritorio-unificado/sandbox-pix/estado',{
  headers:{Authorization:auth}});
 assert.equal(pronto.status,200);
 const status=await pronto.json();
 assert.equal(status.status,'INTEGRADO_SANDBOX_NO_MESMO_SQLITE');
 assert.equal(status.webhookIngressAtivo,true);
 assert.equal(status.usaSQLiteDaLoja,true);
 assert.equal(status.checkoutComercialHabilitado,false);
 async function post(route,body,extra={}){
  const x=await fetch(base+route,{method:'POST',
   headers:{Authorization:auth,'Content-Type':'application/json',
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
  method:'PATCH',headers:{Authorization:auth,'Content-Type':'application/json'},
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
 const cobrado=await post(rota,dados);
 assert.equal(cobrado.status,201,JSON.stringify(cobrado.body));
 assert.equal(cobrado.body.ambiente,'ASAAS_SANDBOX_EXCLUSIVO');
 assert.equal(cobrado.body.posicoesReais,0);
 const repetido=await post(rota,dados);
 assert.equal(repetido.status,200);
 assert.equal(repetido.body.repetido,true);
 assert.equal(envios,1);
 const hook='/webhooks/asaas-sandbox-unificado';
 const aviso={id:'evt_PreviaUnificada2026Recebido',event:'PAYMENT_RECEIVED',
  payment:{id:pagamento}};
 const webhook=async valor=>fetch(base+hook,{method:'POST',headers:{
  'Content-Type':'application/json','asaas-access-token':valor
 },body:JSON.stringify(aviso)});
 assert.equal((await webhook('token-errado')).status,401);
 assert.equal((await fetch(base+hook)).status,405);
 const aceito=await webhook(token);
 assert.equal(aceito.status,200,await aceito.text());
 assert.equal((await webhook(token)).status,200);
 assert.equal(r.motorConta.consultar({titularId:cadastro.body.titularId})
  .posicoesAtivasDoTitular,0,'webhook bruto nao cria posicao');
 const conf=await post('/staging/escritorio-unificado/reconsultar-psp',{
  eventoId:aviso.id
 });
 assert.equal(conf.status,200,JSON.stringify(conf.body));
 assert.equal(conf.body.estado,'CONCLUIDO');
 assert.equal(conf.body.vinculoMotorEnsaio.estado,'PENDENTES_GERADAS');
 assert.equal(conf.body.vinculoMotorEnsaio.quantidade,1);
 assert.equal(consultas,1);
 assert.equal(r.motorConta.consultar({titularId:cadastro.body.titularId})
  .posicoesAtivasDoTitular,1);
 assert.equal((await post('/staging/escritorio-unificado/reconsultar-psp',{
  eventoId:aviso.id})).body.vinculoMotorEnsaio.estado,'JA_VINCULADO');
 assert.equal(envios,1);
 const audit=await fetch(base+'/staging/escritorio-unificado/auditoria-cobertura',{
  headers:{Authorization:auth}});
 assert.equal(audit.status,200);
 const rel=await audit.json();
 assert.equal(rel.resumo.posicoesNoMotorEnsaio,1);
 assert.equal(rel.marcoZeroFinanceiroAprovado,false);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
