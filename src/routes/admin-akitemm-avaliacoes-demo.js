'use strict';
const express=require('express');
const {criarAutorizacao}=require('./admin-catalogo-laboratorio');
function criarRouterAdminAkitemmAvaliacoesDemo({segredo,avaliacoes}={}){
 if(!avaliacoes)throw TypeError('Avaliacao AKITEMM obrigatoria');
 const r=express.Router();
 r.use(criarAutorizacao({segredo}));
 r.get('/akitemm-avaliacoes-demo',(_req,res)=>
  res.json({pendentes:avaliacoes.pendentesAdmin(),laboratorio:true}));
 r.get('/akitemm-avaliacoes-demo/midias/:id',(req,res,next)=>{
  try{
   const media=avaliacoes.buscarMidia({id:Number(req.params.id),admin:true});
   res.set('Cache-Control','private, no-store');
   res.set('Content-Disposition','inline');
   res.set('Cross-Origin-Resource-Policy','same-origin');
   return res.type(media.mime).send(media.dados);
  }catch(e){
   if(['MIDIA_NAO_ENCONTRADA','MIDIA_INVALIDA'].includes(e.codigo))
    return res.status(404).json({erro:'MIDIA_NAO_ENCONTRADA'});
   return next(e);
  }
 });
 r.post('/akitemm-avaliacoes-demo/entregas',(req,res,next)=>{
  if(!req.body||Object.keys(req.body).sort().join(',')!=='pedidoId')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  try{return res.json(avaliacoes.entregue(req.body));}
  catch(e){
   if(['PAGAMENTO_OU_PRODUTO_INVALIDO','ENDERECO_NAO_REGISTRADO'].includes(e.codigo))
    return res.status(409).json({erro:e.codigo});
   if(e.codigo==='PEDIDO_NAO_ENCONTRADO')return res.status(404).json({erro:e.codigo});
   return next(e);
  }
 });
 r.post('/akitemm-avaliacoes-demo/moderar',(req,res,next)=>{
  if(!req.body||Object.keys(req.body).sort().join(',')!=='id,imagemCaminho,status')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  try{return res.json(avaliacoes.moderar(req.body));}
  catch(e){
   if(e.codigo==='MODERACAO_INVALIDA')return res.status(400).json({erro:e.codigo});
   if(e.codigo==='AVALIACAO_NAO_PENDENTE')return res.status(409).json({erro:e.codigo});
   return next(e);
  }
 });
 return r;
}
module.exports={criarRouterAdminAkitemmAvaliacoesDemo};
