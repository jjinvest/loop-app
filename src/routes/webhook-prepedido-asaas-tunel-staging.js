'use strict';
// Entrada de HOMOLOGACAO Asaas Sandbox via TUNEL HTTPS autenticado.
// Endpoint isolado: somente persiste um aviso, NAO consulta o PSP,
// cria Pix, confirma pedido, posicao, bonus, cofre ou saque.
// O tunel deve terminar HTTPS e encaminhar apenas para 127.0.0.1.
// Nunca montar em src/server.js nem habilitar em NODE_ENV=production.
const express=require('express');
const {timingSafeEqual}=require('node:crypto');
function segredoValido(valor){
 return typeof valor==='string'&&valor.length>=32&&valor.length<=255&&
  !/\\s/.test(valor);
}
function conferirSegredoProxy(esperado,recebido){
 if(!segredoValido(recebido))return false;
 const a=Buffer.from(esperado),b=Buffer.from(recebido);
 return a.length===b.length&&timingSafeEqual(a,b);
}

function criarRouterWebhookAsaasSandboxTunelStaging({
 inbox,urlPublica,segredoProxy,habilitarTunel=false
}={}){
 if(habilitarTunel!==true||
    typeof inbox?.registrar!=='function'||
    typeof inbox?.consultarEvento!=='function')
  throw new TypeError('Homologacao exige habilitacao explicita e inbox SQLite');
 // Host e X-Forwarded-Proto podem ser forjados por clientes HTTP.
 // Um proxy HTTPS confiavel remove o header publico e injeta um segredo
 // PROPRIO no salto final para loopback. Nao substituir pelo authToken Asaas.
 if(!segredoValido(segredoProxy)||segredoProxy===inbox.token)
  throw new TypeError('Segredo exclusivo do proxy HTTPS obrigatorio');
 let url;
 try{url=new URL(urlPublica);}
 catch{throw new TypeError('URL HTTPS de homologacao obrigatoria');}
 if(url.protocol!=='https:'||url.username||url.password||
    url.pathname!=='/webhooks/asaas-sandbox'||url.search||url.hash||
    !/^[a-z0-9.-]+$/i.test(url.hostname)||
    ['localhost','127.0.0.1'].includes(url.hostname.toLowerCase())||
    url.port)
  throw new TypeError('URL publica HTTPS sem porta, credencial ou parametros obrigatoria');
 const hostExterno=url.host.toLowerCase();
 const r=express.Router();
 r.post('/asaas-sandbox',(req,res,next)=>{
  res.set('Cache-Control','no-store');
  res.set('Referrer-Policy','no-referrer');
  res.set('X-Content-Type-Options','nosniff');
  if(process.env.NODE_ENV==='production')
   return res.status(503).json({erro:'HOMOLOGACAO_NAO_DISPONIVEL'});
  // A conexao backend deve vir APENAS do processo local do tunel.
  // O hostname e X-Forwarded-Proto nao sao prova de TLS por si so:
  // a configuracao do tunel HTTPS deve ser homologada externamente.
  const ip=req.socket?.remoteAddress;
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip)||
     (req.get('host')||'').toLowerCase()!==hostExterno||
     req.get('x-forwarded-proto')!=='https'||req.get('origin')||
     !conferirSegredoProxy(segredoProxy,req.get('x-loop-tunel-secret')))
   return res.status(403).json({erro:'ORIGEM_HOMOLOGACAO_INVALIDA'});
  if(!req.is('application/json'))
   return res.status(415).json({erro:'JSON_OBRIGATORIO'});
  next();
 },express.raw({type:'application/json',limit:'16kb',inflate:false}),(req,res)=>{
  try{
   const resultado=inbox.registrar({
    cabecalhoToken:req.get('asaas-access-token'),corpoBruto:req.body
   });
   return res.status(200).json({
    registrado:resultado.registrado,repetido:resultado.repetido,
    pendenteReconsulta:true,pagamentoReal:false,posicoesCriadas:0
   });
  }catch(e){
   if(['TOKEN_SANDBOX_NAO_CONFIGURADO','TOKEN_WEBHOOK_INVALIDO'].includes(e?.codigo))
    return res.status(401).json({erro:'AUTENTICACAO_SANDBOX_INVALIDA'});
   if(['EVENTO_ASAAS_SANDBOX_NAO_VALIDO','CORPO_WEBHOOK_INVALIDO',
     'VALOR_WEBHOOK_INVALIDO'].includes(e?.codigo))
    return res.status(400).json({erro:'WEBHOOK_INVALIDO'});
   if(['REFERENCIA_DESCONHECIDA','WEBHOOK_PAGAMENTO_DIVERGENTE',
     'EVENTO_REUTILIZADO_DIVERGENTE'].includes(e?.codigo))
    return res.status(409).json({erro:'WEBHOOK_NAO_CONCILIADO'});
   return res.status(503).json({erro:'WEBHOOK_INDISPONIVEL'});
  }
 });
 r.use((err,_req,res,next)=>{
  if(err?.type==='entity.too.large')
   return res.status(413).json({erro:'CORPO_MUITO_GRANDE'});
  if(err?.type==='encoding.unsupported')
   return res.status(415).json({erro:'ENCODING_NAO_PERMITIDO'});
  next(err);
 });
 return r;
}
module.exports={criarRouterWebhookAsaasSandboxTunelStaging};
