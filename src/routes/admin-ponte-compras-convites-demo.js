'use strict';

// Leitura e preenchimento manual de tabuleiro, somente laboratorio local.
// Nenhum endpoint aceita pagamento ou cria posicao a partir do navegador.
const express=require('express');
const {criarAutorizacao}=require('./admin-catalogo-laboratorio');
function criarRouterPonteComprasConvitesDemo({segredo,ponte}={}){
 if(!ponte||typeof ponte.consultar!=='function'){
  throw new TypeError('Ponte de laboratorio obrigatoria');
 }
 const router=express.Router();
 router.use(criarAutorizacao({segredo}));
 router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 router.get('/ponte-compras-convites-demo',(_req,res,next)=>{
  try{return res.json(ponte.consultar());}
  catch(erro){return next(erro);}
 });
 router.get('/ponte-compras-convites-demo/auditoria-integridade',(req,res,next)=>{
  if(Object.keys(req.query).length)return res.status(400).json({erro:'SEM_PARAMETROS'});
  try{return res.json(ponte.auditarIntegridadeOperacionalDemo());}
  catch(e){return next(e);}
 });
 router.get('/ponte-compras-convites-demo/auditoria-ciclo',(req,res,next)=>{
  if(Object.keys(req.query).join(',')!=='ciclo')
   return res.status(400).json({erro:'INFORME_CICLO'});
  const cicloNumero=Number(req.query.ciclo);
  try{return res.json(ponte.auditarCicloFinanceiroDemo({cicloNumero}));}
  catch(e){
   if(e.codigo==='CICLO_INVALIDO')return res.status(400).json({erro:e.codigo});
   if(['CICLO_INEXISTENTE','CENTRO_AUSENTE'].includes(e.codigo))
    return res.status(404).json({erro:e.codigo});
   return next(e);
  }
 });
 router.post('/ponte-compras-convites-demo/douradas',(req,res,next)=>{
  if(!req.is('application/json'))return res.status(415).json({erro:'JSON_OBRIGATORIO'});
  const b=req.body;
  if(!b||typeof b!=='object'||Array.isArray(b)||
   Object.keys(b).join(',')!=='eventoId')
   return res.status(400).json({erro:'SOMENTE_EVENTO_DOURADA'});
  try{return res.json({resultado:ponte.criarDouradaManualDemo(b),
   pagamentosReais:false,receitaRegistrada:false,semCPF:true});}
  catch(e){
   if(e.codigo==='EVENTO_DOURADA_INVALIDO')
    return res.status(400).json({erro:e.codigo});
   return next(e);
  }
 });
 router.post('/ponte-compras-convites-demo/preparar-tabuleiro',(req,res,next)=>{
  if(!req.is('application/json'))return res.status(415).json({erro:'JSON_OBRIGATORIO'});
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
    Object.keys(req.body).length!==0)return res.status(400).json({erro:'SEM_PARAMETROS'});
  try{return res.json(ponte.prepararTabuleiroDemo());}
  catch(err){return next(err);}
 });
 return router;
}
module.exports={criarRouterPonteComprasConvitesDemo};
