'use strict';
// Adapter HTTP DE LABORATORIO: nao montado em src/server.js.
// Sera substituido por autenticacao real, antifraude e CSRF homologados.
// Protecao em profundidade contra montagem acidental em producao.
const express=require('express');
const {localSeguro}=require('./admin-catalogo-laboratorio');
const {cotarCheckoutPublico}=require('../domain/cotacao-checkout-publico');
function criarRouterRascunhosCheckoutStaging({
 repositorioCatalogo,intencoes,identificarTitular,autorizarMutacao
}={}){
 if(typeof repositorioCatalogo?.buscar!=='function'||
    typeof intencoes?.criar!=='function'||
    typeof intencoes?.consultarPorChave!=='function'||
    typeof intencoes?.consultarDoTitular!=='function'||
    typeof intencoes?.listarDoTitular!=='function'||
    typeof identificarTitular!=='function'||typeof autorizarMutacao!=='function')
  throw new TypeError('Catalogo, repositorio, autenticacao e CSRF obrigatorios');
 const r=express.Router();
 r.use((req,res,next)=>{
  res.set('Cache-Control','no-store');
  res.set('Referrer-Policy','no-referrer');
  if(process.env.NODE_ENV==='production')return res.status(503).json({
   erro:'CHECKOUT_PUBLICO_NAO_HOMOLOGADO'
  });
  if(!localSeguro(req))return res.status(403).json({erro:'SOMENTE_TESTE_LOCAL'});
  next();
 });
 async function identidade(req,res,next){
  try{
   const titularId=await identificarTitular(req);
   if(!titularId)return res.status(401).json({erro:'SESSAO_AUSENTE'});
   req.titularCheckoutStaging=titularId;
   next();
  }catch(e){next(e);}
 }
 r.use(identidade);
 function responder(e,res,next){
  if(['CAMPOS_COTACAO_INVALIDOS','ITENS_COTACAO_INVALIDOS',
   'ITEM_COTACAO_INVALIDO','PRODUTO_REPETIDO_NA_COTACAO',
   'CHAVE_IDEMPOTENCIA_INVALIDA','LIMITE_COTACAO_EXCEDIDO'].includes(e?.codigo))
   return res.status(400).json({erro:e.codigo});
  if(e?.codigo==='CHAVE_IDEMPOTENCIA_CONFLITANTE')
   return res.status(409).json({erro:e.codigo});
  if(e?.codigo==='PRODUTO_INDISPONIVEL_PARA_COTACAO')
   return res.status(404).json({erro:e.codigo});
  if(e?.codigo==='SESSAO_CHECKOUT_INVALIDA')
   return res.status(401).json({erro:'SESSAO_AUSENTE'});
  next(e);
 }
 r.post('/rascunhos',async(req,res,next)=>{
  try{
   if(!req.is('application/json'))
    return res.status(415).json({erro:'JSON_OBRIGATORIO'});
   // O componente de autenticacao deve validar sessao; o CSRF e origin
   // sao fornecidos por um adaptador independente e obrigatorio.
   if(await autorizarMutacao(req)!==true)
    return res.status(403).json({erro:'MUTACAO_NAO_AUTORIZADA'});
   const titularId=req.titularCheckoutStaging;
   const chaveIdempotencia=req.get('Idempotency-Key');
   const entrada=req.body;
   // O replay se resolve ANTES de recalcular preco do catalogo; a
   // fotografia gravada nao e reprecificada retroativamente.
   const anterior=intencoes.consultarPorChave({
    titularId,chaveIdempotencia,entrada
   });
   if(anterior)return res.status(200).json({repetido:true,intencao:anterior});
   const cotacao=await cotarCheckoutPublico({
    repositorio:repositorioCatalogo,entrada
   });
   const resultado=intencoes.criar({
    titularId,chaveIdempotencia,entrada,cotacao
   });
   return res.status(resultado.repetido?200:201).json(resultado);
  }catch(e){responder(e,res,next);}
 });
 r.get('/rascunhos',(req,res,next)=>{
  try{return res.json({intencoes:intencoes.listarDoTitular({
   titularId:req.titularCheckoutStaging
  }),semPagamentoReal:true});}
  catch(e){responder(e,res,next);}
 });
 r.get('/rascunhos/:pedidoId',(req,res,next)=>{
  try{
   const pedido=intencoes.consultarDoTitular({
    titularId:req.titularCheckoutStaging,pedidoId:req.params.pedidoId
   });
   return pedido?res.json({intencao:pedido}):
    res.status(404).json({erro:'INTENCAO_NAO_ENCONTRADA'});
  }catch(e){
   if(e?.codigo==='INTENCAO_NAO_ENCONTRADA')
    return res.status(404).json({erro:e.codigo});
   responder(e,res,next);
  }
 });
 return r;
}
module.exports={criarRouterRascunhosCheckoutStaging};
