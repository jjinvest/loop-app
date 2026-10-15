'use strict';

// Rota administrativa SOMENTE de leitura do cenario ficticio.
// Nao permite POST/PATCH/DELETE, retirada de recursos ou controle bancario.
const express=require('express');
const {criarAutorizacao}=require('./admin-catalogo-laboratorio');
const {criarVisaoFinanceiraAdminDemo,MODOS}=require('../domain/financeiro-admin-demo');

function criarRouterFinanceiroAdminDemo({segredo}={}){
  const router=express.Router();
  router.use(criarAutorizacao({segredo}));
  router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get('/financeiro-demo',(req,res)=>{
    const tipo=req.query.modo;
    if(typeof tipo!=='string' || !['split','reserva'].includes(tipo)){
      return res.status(400).json({erro:'MODO_DEMONSTRATIVO_INVALIDO'});
    }
    res.json(criarVisaoFinanceiraAdminDemo({
      modo:tipo==='split'?MODOS.SPLIT:MODOS.RESERVA
    }));
  });
  return router;
}
module.exports={criarRouterFinanceiroAdminDemo};
