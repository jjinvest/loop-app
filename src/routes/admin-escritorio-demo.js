'use strict';

// Painel de participantes FICTICIOS; rota exclusiva do servidor local
// protegido pelo mesmo segredo de laboratorio do painel administrativo.
const express = require('express');
const { criarAutorizacao } = require('./admin-catalogo-laboratorio');
const { criarVisaoEscritorioDemo, TITULARES_FICTICIOS } =
  require('../domain/visao-escritorio-demo');
const { criarCenarioEscritorioMotor, extrairVisaoDoMotor } =
  require('../laboratorio/cenario-escritorio-motor');

function criarRouterEscritorioDemo({segredo,publicacoes=null}={}) {
  const router=express.Router();
  router.use(criarAutorizacao({segredo}));
  router.use((_req,res,next)=>{
    res.set('Cache-Control','no-store');
    next();
  });
  router.get('/escritorio-demo/publicacoes',(_req,res)=>{
    if(!publicacoes)return res.status(501).json({erro:'PUBLICACOES_INDISPONIVEIS'});
    return res.json({modo:'ADMIN_LOCAL_TESTE',
      publicacoes:publicacoes.listar(),
      controleExclusivoAdmin:true,semPropagandasAutomaticas:true});
  });
  router.post('/escritorio-demo/publicacoes',(req,res)=>{
    if(!publicacoes)return res.status(501).json({erro:'PUBLICACOES_INDISPONIVEIS'});
    if(!req.is('application/json'))return res.status(415).json({erro:'JSON_OBRIGATORIO'});
    const corpo=req.body;
    if(!corpo||Array.isArray(corpo)||typeof corpo!=='object'||
      Object.keys(corpo).some(x=>![
        'tipo','titulo','descricao','linkDestino','imagemCaminho'].includes(x)))
      return res.status(400).json({erro:'PUBLICACAO_INVALIDA'});
    try{return res.status(201).json(publicacoes.publicar(corpo));}
    catch(e){if(e.codigo)return res.status(400).json({erro:e.codigo});throw e;}
  });
  router.post('/escritorio-demo/publicacoes/:id/arquivar',(req,res)=>{
    if(!publicacoes)return res.status(501).json({erro:'PUBLICACOES_INDISPONIVEIS'});
    if(!req.is('application/json'))return res.status(415).json({erro:'JSON_OBRIGATORIO'});
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
       Object.keys(req.body).length)
      return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
    try{return res.json(publicacoes.arquivar(req.params.id));}
    catch(e){if(e.codigo)return res.status(409).json({erro:e.codigo});throw e;}
  });
  router.get('/escritorio-demo',(_req,res)=>{
    res.json({
      modo:'ESCRITORIO_APENAS_DEMONSTRACAO',
      titulares:TITULARES_FICTICIOS.map(t=>({id:t.id,nome:t.nome})),
      semClientesReais:true,
      semPagamentosReais:true
    });
  });
  // Consulta alternativa ao MESMO motor de filas/tabuleiro, sobre um
  // cenario totalmente ficticio e imutavel por chamadas HTTP.
  // A rota especifica deve anteceder o segmento dinamico :id.
  const cenarioMotor=criarCenarioEscritorioMotor();
  router.get('/escritorio-demo/motor/:id',(req,res)=>{
    const resultado=extrairVisaoDoMotor({
      simulador:cenarioMotor,titularId:req.params.id
    });
    if(!resultado) return res.status(404).json({erro:'TITULAR_DEMO_NAO_ENCONTRADO'});
    res.json(resultado);
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
