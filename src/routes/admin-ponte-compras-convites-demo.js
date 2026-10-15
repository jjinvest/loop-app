'use strict';

// Visualizacao SOMENTE de leitura no computador de desenvolvimento.
// Nenhum endpoint aceita `pago`, comprovante ou cria posicao.
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
 return router;
}
module.exports={criarRouterPonteComprasConvitesDemo};
