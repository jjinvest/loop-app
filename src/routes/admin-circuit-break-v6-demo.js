'use strict';
const express=require('express');
const {criarAutorizacao}=require('./admin-catalogo-laboratorio');

function criarRouterCircuitBreakV6Demo({segredo,controle}={}){
  const router=express.Router();
  router.use(criarAutorizacao({segredo}));
  router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get('/circuit-break-v6-demo',(_req,res)=>{
    if(!controle)return res.status(501).json({erro:'CONTROLE_INDISPONIVEL'});
    return res.json(controle.resumo());
  });
  router.get('/circuit-break-v6-demo/historico',(req,res)=>{
    if(!controle)return res.status(501).json({erro:'CONTROLE_INDISPONIVEL'});
    const limite=req.query.limite===undefined?25:Number(req.query.limite);
    if(Object.keys(req.query).some(k=>k!=='limite')||
      !Number.isSafeInteger(limite)||limite<1||limite>100)
      return res.status(400).json({erro:'LIMITE_INVALIDO'});
    return res.json({modo:'SOMENTE_LABORATORIO',historico:controle.historico({limite})});
  });
  router.post('/circuit-break-v6-demo/comandos',(req,res)=>{
    if(!controle)return res.status(501).json({erro:'CONTROLE_INDISPONIVEL'});
    const body=req.body;
    if(!body||typeof body!=='object'||Array.isArray(body)||
      Object.keys(body).some(k=>!['tipo','comandoId','revisaoEsperada','valor'].includes(k))||
      !['tipo','comandoId','revisaoEsperada'].every(k=>Object.hasOwn(body,k)))
      return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
    try{
      return res.json(controle.executar(body));
    }catch(e){
      if(e.codigo){
        const codigo=e.codigo;
        return res.status(['CONFLITO_REVISAO','CONFLITO_COMANDO_ID','CATRACA_PAUSADA',
          'LIMITE_DIARIO_ATINGIDO','COMPRAS_FICTICIAS_INSUFICIENTES','CENARIO_COMPLETO']
          .includes(codigo)?409:400).json({erro:codigo});
      }
      throw e;
    }
  });
  return router;
}
module.exports={criarRouterCircuitBreakV6Demo};
