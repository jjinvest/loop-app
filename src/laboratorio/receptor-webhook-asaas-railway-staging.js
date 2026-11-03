'use strict';
// Ingresso HTTPS Railway APENAS para Asaas Sandbox. Nao montar na loja publica.
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const {DatabaseSync}=require('node:sqlite');
const {IntencoesCheckoutSQLite}=require('../domain/intencoes-checkout-sqlite');
const {PrePedidosCheckoutStagingSQLite}=require('../domain/prepedidos-checkout-staging-sqlite');
const {PontePrepedidoAsaasSandboxStaging}=require('../domain/ponte-prepedido-asaas-sandbox-staging');
const {InboxWebhookPrepedidoAsaasStaging}=require('../domain/inbox-webhook-prepedido-asaas-staging');
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
function validarUrl(valor){
 let u;try{u=new URL(valor);}catch{throw falha('URL_HTTPS_SANDBOX_INVALIDA');}
 if(u.protocol!=='https:'||u.port||u.username||u.password||u.search||u.hash||
    u.pathname!=='/webhooks/asaas-sandbox'||
    !/^[a-z0-9.-]+$/i.test(u.hostname)||
    /^(localhost|127\.0\.0\.1)$/i.test(u.hostname)||!u.hostname.includes('.'))
  throw falha('URL_HTTPS_SANDBOX_INVALIDA');
 return u;
}
function criarAppWebhookRailwayStaging({banco,token,urlPublica}={}){
 if(process.env.NODE_ENV==='production')throw falha('LABORATORIO_PROIBIDO_EM_PRODUCAO');
 if(!banco||typeof banco.prepare!=='function')throw falha('BANCO_INEXISTENTE');
 const url=validarUrl(urlPublica);
 const inbox=new InboxWebhookPrepedidoAsaasStaging({banco,token});
 const app=express();app.disable('x-powered-by');app.disable('etag');
 app.set('trust proxy',false);
 app.use((_req,res,next)=>{
  res.set('Cache-Control','no-store');
  res.set('X-Content-Type-Options','nosniff');
  next();
 });
 app.post('/webhooks/asaas-sandbox',(req,res,next)=>{
  // TLS e garantido pelo ingresso Railway, NAO pelo header fornecido
  // pelo cliente. A autenticacao real e o token secreto do Asaas.
  if((req.get('host')||'').toLowerCase()!==url.host.toLowerCase()||
     req.get('x-forwarded-proto')!=='https'||req.get('origin')||
     !req.is('application/json'))
   return res.status(403).json({erro:'ORIGEM_INCOMPATIVEL'});
  next();
 },express.raw({type:'application/json',inflate:false,limit:'16kb'}),(req,res)=>{
  try{
   const r=inbox.registrar({
    cabecalhoToken:req.get('asaas-access-token'),corpoBruto:req.body
   });
   res.status(200).json({registrado:r.registrado,repetido:r.repetido,
    emQuarentena:r.emQuarentena===true,
    pendenteReconsulta:r.pendenteReconsulta===true,
    pagamentoReal:false,posicoesCriadas:0});
  }catch(e){
   if(['TOKEN_SANDBOX_NAO_CONFIGURADO','TOKEN_WEBHOOK_INVALIDO'].includes(e.codigo))
    return res.status(401).json({erro:'TOKEN_INVALIDO'});
   if(['EVENTO_ASAAS_SANDBOX_NAO_VALIDO','CORPO_WEBHOOK_INVALIDO',
     'VALOR_WEBHOOK_INVALIDO'].includes(e.codigo))
    return res.status(400).json({erro:'EVENTO_INVALIDO'});
   if(['REFERENCIA_DESCONHECIDA','WEBHOOK_PAGAMENTO_DIVERGENTE',
     'EVENTO_REUTILIZADO_DIVERGENTE'].includes(e.codigo))
    return res.status(409).json({erro:'EVENTO_NAO_VINCULADO'});
   return res.status(503).json({erro:'ERRO_PERSISTENCIA'});
  }
 });
 app.get('/healthz',(_req,res)=>{
  try{
   const ok=banco.prepare('SELECT 1 AS ok').get().ok===1;
   res.status(ok?200:503).json({
    ambiente:'ASAAS_SANDBOX',sqlitePronto:ok,checkoutPublico:false
   });
  }catch{res.status(503).json({erro:'BANCO_INDISPONIVEL'});}
 });
 app.use((err,_req,res,_next)=>{
  if(err?.type==='entity.too.large')
   return res.status(413).json({erro:'LIMITE_DE_CORPO'});
  if(err?.type==='encoding.unsupported')
   return res.status(415).json({erro:'ENCODING_NAO_SUPORTADO'});
  res.status(503).json({erro:'FALHA_DE_ENTRADA'});
 });
 app.use((_req,res)=>res.status(404).json({erro:'ROTA_INEXISTENTE'}));
 return {app,inbox};
}
function iniciarWebhookRailwayStaging({ambiente=process.env}={}){
 if(process.env.NODE_ENV==='production'||ambiente.NODE_ENV==='production'||
    ambiente.LOOP_RAILWAY_STAGING_AUTORIZADO!=='SIM')
  throw falha('STAGING_NAO_AUTORIZADO');
 const volume=ambiente.RAILWAY_VOLUME_MOUNT_PATH;
 const arquivo=ambiente.LOOP_RAILWAY_STAGING_SQLITE;
 const token=ambiente.LOOP_RAILWAY_WEBHOOK_TOKEN;
 const porta=Number(ambiente.PORT);
 if(!volume||!arquivo||!path.isAbsolute(volume)||!path.isAbsolute(arquivo)||
    !arquivo.endsWith('.sqlite')||!fs.existsSync(volume)||!fs.existsSync(arquivo)||
    !fs.statSync(volume).isDirectory()||fs.lstatSync(arquivo).isSymbolicLink()||
    !Number.isSafeInteger(porta)||porta<1024||porta>65535||
    typeof token!=='string'||token.length<32||token.length>255||
    /\s/.test(token)||token===ambiente.ASAAS_SANDBOX_API_KEY)
  throw falha('CONFIGURACAO_STAGING_INVALIDA');
 const rel=path.relative(fs.realpathSync(volume),fs.realpathSync(arquivo));
 if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||
    path.isAbsolute(rel)||!fs.statSync(arquivo).isFile())
  throw falha('SQLITE_FORA_DE_VOLUME_PERSISTENTE');
 const banco=new DatabaseSync(arquivo);
 try{
  banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;');
  if(!banco.prepare(
   "SELECT 1 FROM sqlite_master WHERE type='table' AND name='akitemm_checkout_prepedidos_staging'"
  ).get())throw falha('STAGING_SEM_PREPEDIDOS');
  new IntencoesCheckoutSQLite({banco});
  new PrePedidosCheckoutStagingSQLite({banco});
  new PontePrepedidoAsaasSandboxStaging({banco});
  const {app}=criarAppWebhookRailwayStaging({
   banco,token,urlPublica:ambiente.LOOP_RAILWAY_WEBHOOK_URL
  });
  const servidor=app.listen(porta,'0.0.0.0');
  servidor.requestTimeout=12000;
  servidor.headersTimeout=10000;
  servidor.maxRequestsPerSocket=50;
  return {servidor,banco,fechar:()=>new Promise(resolve=>{
   servidor.close(()=>{banco.close();resolve();});
  })};
 }catch(e){banco.close();throw e;}
}
if(require.main===module){
 try{
  const r=iniciarWebhookRailwayStaging();
  r.servidor.on('listening',()=>process.stdout.write(
   'LOOP_HOMOLOGACAO_RAILWAY_RECEPCAO_PRONTA_SEM_FINANCEIRO_REAL\n'));
  process.once('SIGINT',()=>r.fechar());
  process.once('SIGTERM',()=>r.fechar());
 }catch(e){
  process.stderr.write('LOOP_RAILWAY_STAGING_BLOQUEADO='+
   (e.codigo||'FALHA_DE_CONFIGURACAO')+'\n');
  process.exitCode=1;
 }
}
module.exports={criarAppWebhookRailwayStaging,iniciarWebhookRailwayStaging};
