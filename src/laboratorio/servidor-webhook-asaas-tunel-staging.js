'use strict';
// Receptor externo isolado APENAS para homologacao de webhook Asaas Sandbox.
// A URL HTTPS pertence a um tunel operado fora deste processo;
// o backend aceita conexoes SOMENTE em 127.0.0.1. Nenhuma API de pagamento,
// nenhuma rota comercial e nenhum mecanismo financeiro sao expostos.
const {existsSync,statSync}=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const express=require('express');
const {IntencoesCheckoutSQLite}=require('../domain/intencoes-checkout-sqlite');
const {PrePedidosCheckoutStagingSQLite}=require('../domain/prepedidos-checkout-staging-sqlite');
const {PontePrepedidoAsaasSandboxStaging}=require('../domain/ponte-prepedido-asaas-sandbox-staging');
const {InboxWebhookPrepedidoAsaasStaging}=require('../domain/inbox-webhook-prepedido-asaas-staging');
const {criarRouterWebhookAsaasSandboxTunelStaging}=
 require('../routes/webhook-prepedido-asaas-tunel-staging');

function iniciarReceptorTunelStaging({ambiente=process.env}={}){
 if(process.env.NODE_ENV==='production'||ambiente.NODE_ENV==='production'||
    ambiente.LOOP_WEBHOOK_TUNEL_SANDBOX_AUTORIZADO!=='SIM')
  throw new Error('RECEPTOR_STAGING_NAO_AUTORIZADO');
 const arquivo=ambiente.LOOP_WEBHOOK_TUNEL_SQLITE;
 const token=ambiente.LOOP_WEBHOOK_TUNEL_TOKEN;
 const urlPublica=ambiente.LOOP_WEBHOOK_TUNEL_URL_PUBLICA;
 const porta=Number(ambiente.LOOP_WEBHOOK_TUNEL_PORTA||3107);
 if(typeof arquivo!=='string'||!arquivo.trim()||arquivo===':memory:'||
    !existsSync(arquivo)||!statSync(arquivo).isFile())
  throw new Error('SQLITE_STAGING_PERSISTENTE_EXISTENTE_OBRIGATORIO');
 if(typeof token!=='string'||token.length<32||token.length>255||
    /\s/.test(token)||token===ambiente.ASAAS_SANDBOX_API_KEY)
  throw new Error('TOKEN_WEBHOOK_SANDBOX_SEGREGADO_OBRIGATORIO');
 if(!Number.isSafeInteger(porta)||porta<1024||porta>65535)
  throw new Error('PORTA_TUNEL_STAGING_INVALIDA');
 const banco=new DatabaseSync(arquivo);
 try{
  banco.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;PRAGMA journal_mode=WAL;');
  new IntencoesCheckoutSQLite({banco});
  new PrePedidosCheckoutStagingSQLite({banco});
  new PontePrepedidoAsaasSandboxStaging({banco});
  const inbox=new InboxWebhookPrepedidoAsaasStaging({banco,token});
  const app=express();
  app.disable('x-powered-by');
  app.use('/webhooks',criarRouterWebhookAsaasSandboxTunelStaging({
   inbox,urlPublica,habilitarTunel:true
  }));
  app.use((_req,res)=>res.status(404).json({erro:'ROTA_INEXISTENTE'}));
  const servidor=app.listen(porta,'127.0.0.1');
  servidor.requestTimeout=15000;
  servidor.headersTimeout=10000;
  servidor.maxRequestsPerSocket=50;
  servidor.on('error',()=>{try{banco.close();}catch{}});
  const encerrar=()=>{
   servidor.close(()=>{banco.close();});
  };
  return {servidor,encerrar};
 }catch(e){banco.close();throw e;}
}
if(require.main===module){
 try{
  const instancia=iniciarReceptorTunelStaging();
  instancia.servidor.on('listening',()=>{
   // Log sem tokens, IDs de cliente, pagamentos ou dados bancarios.
   process.stdout.write('Receptor Asaas Sandbox homologacao: loopback ativo; aguardando tunel HTTPS autorizado\\n');
  });
  process.once('SIGTERM',()=>instancia.encerrar());
  process.once('SIGINT',()=>instancia.encerrar());
 }catch(e){
  process.stderr.write('Receptor de homologacao indisponivel: '+e.message+'\\n');
  process.exitCode=1;
 }
}
module.exports={iniciarReceptorTunelStaging};
