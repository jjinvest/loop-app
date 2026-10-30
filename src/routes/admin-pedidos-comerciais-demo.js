'use strict';
const express=require('express');
const {criarAutorizacao}=require('./admin-catalogo-laboratorio');
function criarRouterPedidosComerciaisDemo({segredo,pedidos}={}){
 const r=express.Router();
 r.use(criarAutorizacao({segredo}));
 r.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 r.get('/pedidos-comerciais-demo',(_req,res)=>res.json(pedidos.listar()));
 r.get('/pedidos-comerciais-demo/opcoes',(_req,res)=>res.json(pedidos.opcoes()));
 r.get('/pedidos-comerciais-demo/cotacoes-teste',(_req,res)=>res.json(pedidos.cotacoesPrecosVariaveis()));
 r.get('/pedidos-comerciais-demo/:id',(req,res)=>{
  try{
   const p=pedidos.buscar(req.params.id);
   return p?res.json({modo:'PEDIDO_FICTICIO',pedido:p}):res.status(404).json({erro:'NAO_ENCONTRADO'});
  }catch(e){if(e.codigo==='INVALIDO')return res.status(400).json({erro:'ID_INVALIDO'});throw e;}
 });
 r.post('/pedidos-comerciais-demo',(req,res)=>{
  const b=req.body;
  if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).length!==3||
   Object.keys(b).some(k=>!['pedidoId','produtoId','pagamentoId'].includes(k))){
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  }
  try{return res.json({modo:'PEDIDO_FICTICIO',...pedidos.registrar(b),dinheiroReal:false,catracaMovimentada:false});}
  catch(e){
   if(e.codigo==='CONFLITO')return res.status(409).json({erro:'ID_EM_CONFLITO'});
   if(e.codigo==='NAO_ENCONTRADO')return res.status(404).json({erro:'REFERENCIA_INEXISTENTE'});
   if(e.codigo==='INVALIDO')return res.status(400).json({erro:'DADOS_INVALIDOS'});
   throw e;
  }
 });
 return r;
}
module.exports={criarRouterPedidosComerciaisDemo};
