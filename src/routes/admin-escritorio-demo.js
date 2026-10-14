'use strict';

// Painel de participantes FICTICIOS; rota exclusiva do servidor local
// protegido pelo mesmo segredo de laboratorio do painel administrativo.
const express = require('express');
const { criarAutorizacao } = require('./admin-catalogo-laboratorio');
const { criarVisaoEscritorioDemo, TITULARES_FICTICIOS } =
  require('../domain/visao-escritorio-demo');

function criarRouterEscritorioDemo({segredo}={}) {
  const router=express.Router();
  router.use(criarAutorizacao({segredo}));
  router.use((_req,res,next)=>{
    res.set('Cache-Control','no-store');
    next();
  });
  router.get('/escritorio-demo',(_req,res)=>{
    res.json({
      modo:'ESCRITORIO_APENAS_DEMONSTRACAO',
      titulares:TITULARES_FICTICIOS.map(t=>({id:t.id,nome:t.nome})),
      semClientesReais:true,
      semPagamentosReais:true
    });
  });
  router.get('/escritorio-demo/:id',(req,res)=>{
    const resultado=criarVisaoEscritorioDemo({titularId:req.params.id});
    if(!resultado) return res.status(404).json({erro:'TITULAR_DEMO_NAO_ENCONTRADO'});
    res.json(resultado);
  });
  // Nao existe POST/PATCH/DELETE. Nenhuma funcao e operacional.
  return router;
}

module.exports={criarRouterEscritorioDemo};
