'use strict';
// API ADMINISTRATIVA restrita ao laboratorio local, nunca no app publico.
const express=require('express');
const {criarAutorizacao}=require('./admin-catalogo-laboratorio');
function criarRouterCarrinhoLoopDemo({segredo,carrinhos}={}){
 if(!carrinhos||typeof carrinhos.criar!=='function')throw new TypeError('Carrinho laboratorio obrigatorio');
 const r=express.Router();
 r.use(criarAutorizacao({segredo}));
 r.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 const responder=(e,res,next)=>{
  if(e.codigo==='INVALIDO'||e.codigo==='VALOR_INVALIDO')return res.status(400).json({erro:e.codigo});
  if(e.codigo==='PRODUTO_INVALIDO'||e.codigo==='NAO_ENCONTRADO'||e.codigo==='TITULAR_INVALIDO')
   return res.status(404).json({erro:e.codigo});
  if(['CONFLITO','PEDIDO_IMUTAVEL','CONVITE_INVALIDO','LIMITE_ATIVO'].includes(e.codigo))
   return res.status(409).json({erro:e.codigo});
  return next(e);
 };
 r.get('/carrinho-loop-demo',(_req,res)=>res.json(carrinhos.listar()));
 r.get('/carrinho-loop-demo/opcoes',(_req,res)=>res.json(carrinhos.opcoes()));
 r.get('/carrinho-loop-demo/:pedidoId',(req,res,next)=>{
  try{
   const c=carrinhos.buscar(req.params.pedidoId);
   return c?res.json({pedido:c}):res.status(404).json({erro:'NAO_ENCONTRADO'});
  }catch(e){return responder(e,res,next);}
 });
 r.post('/carrinho-loop-demo',(req,res,next)=>{
  const b=req.body;
  if(!b||typeof b!=='object'||Array.isArray(b)||
   Object.keys(b).sort().join(',')!=='contaId,itens,pedidoId'){
   return res.status(400).json({erro:'CAMPOS_CARRINHO_INVALIDOS'});
  }
  try{return res.status(201).json({pedido:carrinhos.criar(b),semPagamentoReal:true});}
  catch(e){return responder(e,res,next);}
 });
 r.post('/carrinho-loop-demo/:pedidoId/eventos',async(req,res,next)=>{
  const b=req.body;
  if(!b||typeof b!=='object'||Array.isArray(b)||
   Object.keys(b).sort().join(',')!=='eventoId,tipo'){
   return res.status(400).json({erro:'CAMPOS_EVENTO_INVALIDOS'});
  }
  let gravado;
  try{gravado=carrinhos.registrarEvento({...b,pedidoId:req.params.pedidoId});}
  catch(e){return responder(e,res,next);}
  let integracao;
  try{integracao=await carrinhos.sincronizar(req.params.pedidoId);}
  catch(e){
   integracao={situacao:'SINCRONIZACAO_PENDENTE',
    erro:e.codigo||'FALHA_INTERNA',semPagamentoReal:true};
  }
  return res.json({...gravado,integracao,
   semPagamentoReal:true,semEntregaReal:true});
 });
 r.post('/carrinho-loop-demo/:pedidoId/sincronizar',async(req,res,next)=>{
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
   Object.keys(req.body).length!==0)
   return res.status(400).json({erro:'SEM_PARAMETROS'});
  try{return res.json(await carrinhos.sincronizar(req.params.pedidoId));}
  catch(e){return responder(e,res,next);}
 });
 return r;
}
module.exports={criarRouterCarrinhoLoopDemo};
