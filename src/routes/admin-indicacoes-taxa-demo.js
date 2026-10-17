'use strict';
const express=require('express');
const {criarAutorizacao}=require('./admin-catalogo-laboratorio');
function criarRouterIndicacoesAdminDemo({segredo,links}={}){
 if(!links?.taxas?.alterar)throw new TypeError('Configuracao de indicacao ausente');
 const r=express.Router();
 r.use(criarAutorizacao({segredo}));
 r.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 r.get('/indicacoes-taxa-demo',(_req,res)=>{
  res.json({atual:links.taxas.atual(),historico:links.taxas.historico(),
   origemExclusiva:'LOOP_DIREITA',minimoSaqueCentavos:10000,
   somenteNovasPosicoes:true,semPagamentosReais:true});
 });
 r.post('/indicacoes-taxa-demo',(req,res,next)=>{
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
   Object.keys(req.body).sort().join(',')!=='percentual,revisaoEsperada')
   return res.status(400).json({erro:'PARAMETROS_INVALIDOS'});
  try{
   return res.json({atual:links.taxas.alterar(req.body),
    origemExclusiva:'LOOP_DIREITA',historicoImutavel:true,semPagamentosReais:true});
  }catch(e){
   if(['PORCENTAGEM_INVALIDA','REVISAO_INVALIDA','HORARIO_INVALIDO'].includes(e.codigo))
    return res.status(400).json({erro:e.codigo});
   if(e.codigo==='CONFLITO_REVISAO')
    return res.status(409).json({erro:e.codigo});
   return next(e);
  }
 });
 return r;
}
module.exports={criarRouterIndicacoesAdminDemo};
