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
 async function post(route,body,extra={}){
  const x=await fetch(base+route,{method:'POST',
   headers:{Authorization:auth,'Content-Type':'application/json',...extra},
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
