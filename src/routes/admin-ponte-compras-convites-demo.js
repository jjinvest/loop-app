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
