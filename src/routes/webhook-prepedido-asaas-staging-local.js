'use strict';
// Receptor HTTP LOCAL de ensaio. Nao e endpoint de staging HTTPS remoto,
// nao e montado em src/server.js, nao gera dinheiro nem posicoes.
// Em homologacao externa real o controle de reverse proxy/TLS sera separado.
const express=require('express');
const {localSeguro}=require('./admin-catalogo-laboratorio');
function criarRouterWebhookPrepedidoAsaasStagingLocal({inbox}={}){
 if(typeof inbox?.registrar!=='function'||typeof inbox?.consultarEvento!=='function')
  throw new TypeError('Inbox staging autentica obrigatoria');
 const r=express.Router();
 r.post('/webhook-prepedido-asaas',
  (req,res,next)=>{
   res.set('Cache-Control','no-store');
   res.set('Referrer-Policy','no-referrer');
   if(process.env.NODE_ENV==='production')
    return res.status(503).json({erro:'WEBHOOK_STAGING_NAO_HOMOLOGADO'});
   if(!localSeguro(req))
    return res.status(403).json({erro:'WEBHOOK_SOMENTE_LOOPBACK'});
   if(!req.is('application/json'))
    return res.status(415).json({erro:'JSON_OBRIGATORIO'});
   next();
  },
  express.raw({type:'application/json',limit:'16kb',inflate:false}),
  (req,res)=>{
   try{
    const x=inbox.registrar({
     cabecalhoToken:req.get('asaas-access-token'),corpoBruto:req.body
    });
    return res.status(200).json({
     registrado:x.registrado,repetido:x.repetido,
     pendenteReconsulta:true,pagamentoReal:false,posicoesCriadas:0,
     saqueAutorizado:false
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
    return res.status(503).json({erro:'WEBHOOK_STAGING_INDISPONIVEL'});
   }
  }
 );
 r.use((err,_req,res,next)=>{
  if(err?.type==='entity.too.large')
   return res.status(413).json({erro:'CORPO_MUITO_GRANDE'});
  if(err?.type==='encoding.unsupported')
   return res.status(415).json({erro:'ENCODING_NAO_PERMITIDO'});
  next(err);
 });
 return r;
}
module.exports={criarRouterWebhookPrepedidoAsaasStagingLocal};
