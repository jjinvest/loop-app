'use strict';
const express=require('express');
const {criarAutorizacao}=require('./admin-catalogo-laboratorio');
function criarRouterAdminAkitemmAvaliacoesDemo({segredo,avaliacoes}={}){
 if(!avaliacoes)throw TypeError('Avaliacao AKITEMM obrigatoria');
 const r=express.Router();
 r.use(criarAutorizacao({segredo}));
 r.get('/akitemm-avaliacoes-demo',(_req,res)=>
  res.json({pendentes:avaliacoes.pendentesAdmin(),laboratorio:true}));
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
