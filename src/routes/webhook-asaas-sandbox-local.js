'use strict';
// ROTA OPT-IN LOCAL DO SANDBOX ASAAS: NUNCA EXPOR NO APP PUBLICO.
const express=require('express');
const {localSeguro}=require('./admin-catalogo-laboratorio');
const {CaixaAvisosAsaasSandboxSQLite}=
 require('../domain/caixa-avisos-asaas-sandbox-sqlite');
function criarRouterWebhookAsaasSandboxLocal({banco,token}={}){
 const inbox=new CaixaAvisosAsaasSandboxSQLite({banco,authToken:token});
 const r=express.Router();
 r.post('/webhook-asaas-sandbox',
  (req,res,next)=>{
   if(process.env.NODE_ENV==='production'||!localSeguro(req))
    return res.status(403).json({erro:'SOMENTE_SANDBOX_LOCAL'});
   res.set('Cache-Control','no-store');
   if(!req.is('application/json'))
    return res.status(415).json({erro:'CONTEUDO_NAO_JSON'});
   next();
  },
  express.raw({type:'application/json',limit:'16kb',inflate:false}),
  (req,res)=>{
   try{
    const resultado=inbox.registrar({
     cabecalhoToken:req.get('asaas-access-token'),corpoBruto:req.body
    });
    // Apenas CONFIRMA o armazenamento. Nenhuma operacao financeira automatica.
    return res.status(200).json({ambiente:'ASAAS_SANDBOX_LOCAL',
     registrado:resultado.registrado,repetido:resultado.repetido,
     pendenteDeReconsulta:true,recebimentoReal:false,
     posicaoCriada:false,saqueAutorizado:false});
   }catch(e){
    if(['TOKEN_WEBHOOK_INVALIDO','TOKEN_SANDBOX_NAO_CONFIGURADO'].includes(e.codigo))
     return res.status(401).json({erro:'AUTENTICACAO_SANDBOX_INVALIDA'});
    if(['CORPO_WEBHOOK_INVALIDO','EVENTO_ASAAS_SANDBOX_NAO_VALIDO',
     'VALOR_WEBHOOK_INVALIDO'].includes(e.codigo))
     return res.status(400).json({erro:'CORPO_SANDBOX_INVALIDO'});
    if(e.codigo==='ID_EVENTO_REUTILIZADO_COM_DADOS_DIVERGENTES')
     return res.status(409).json({erro:'EVENTO_SANDBOX_CONFLITANTE'});
    throw e;
   }
  }
 );
 r.use((err,_req,res,next)=>{
  if(err?.type==='entity.too.large')return res.status(413).json({erro:'CORPO_MUITO_GRANDE'});
  if(err?.type==='encoding.unsupported')return res.status(415).json({erro:'CODIFICACAO_NAO_SUPORTADA'});
  next(err);
 });
 return r;
}
module.exports={criarRouterWebhookAsaasSandboxLocal};
