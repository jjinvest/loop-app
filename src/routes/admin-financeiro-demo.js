'use strict';

// Financeiro ficticio: leitura dos exemplos e EDICAO SOMENTE de nomes/cores.
// Nao permite movimentar recursos, alterar destinatarios, ou controlar bancos.
const express=require('express');
const {criarAutorizacao}=require('./admin-catalogo-laboratorio');
const {criarVisaoFinanceiraAdminDemo,MODOS}=require('../domain/financeiro-admin-demo');
const {criarConciliacaoAdministrativaDemo}=require('../domain/conciliacao-cofres-demo');

function criarRouterFinanceiroAdminDemo({segredo,configuracao}={}){
  const router=express.Router();
  router.use(criarAutorizacao({segredo}));
  router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get('/financeiro-demo',(req,res)=>{
    const tipo=req.query.modo;
    if(typeof tipo!=='string' || !['split','reserva'].includes(tipo)){
      return res.status(400).json({erro:'MODO_DEMONSTRATIVO_INVALIDO'});
    }
    const demonstracao=criarVisaoFinanceiraAdminDemo({
      modo:tipo==='split'?MODOS.SPLIT:MODOS.RESERVA
    });
    const mapa=new Map((configuracao?configuracao.listar():[]).map(c=>[c.id,c]));
    res.json({
      ...demonstracao,
      caixas:demonstracao.caixas.map(c=>({
        ...c,
        nomeExibicao:mapa.get(c.id)?.nome||c.nomeProvisorio,
        corExibicao:mapa.get(c.id)?.cor||'#64748B',
        revisaoAparencia:mapa.get(c.id)?.revisao||0
      }))
    });
  });
  router.get('/conciliacao-cofres-demo',async(req,res)=>{
    const {modo,fluxo,extrato}=req.query;
    if(!['split','reserva'].includes(modo)||
       !['sem-movimentos','com-movimentos'].includes(fluxo)||
       !['conferido','divergente'].includes(extrato)){
      return res.status(400).json({erro:'CENARIO_DE_CONCILIACAO_INVALIDO'});
    }
    const resultado=await criarConciliacaoAdministrativaDemo({
      modo:modo==='split'?MODOS.SPLIT:MODOS.RESERVA,
      comMovimentos:fluxo==='com-movimentos',
      divergenciaFicticia:extrato==='divergente'
    });
    // Dados financeiros e mesmo o extrato falso sao exclusivos da rota admin.
    const nomes=new Map((configuracao?configuracao.listar():[]).map(c=>[c.id,c.nome]));
    res.json({
      ...resultado,
      conciliacao:{
        ...resultado.conciliacao,
        linhas:resultado.conciliacao.linhas.map(l=>({
          ...l,nomeExibicao:nomes.get(l.cofreId)||l.cofreId
        }))
      }
    });
  });

  // Apenas campos de APARENCIA, nunca valores, finalidades ou contas.
  router.get('/cofres-demo/configuracoes',(_req,res)=>{
    if(!configuracao)return res.status(501).json({erro:'CONFIGURACAO_DEMO_INDISPONIVEL'});
    res.json({modo:'COFRES_SOMENTE_APARENCIA',cofres:configuracao.listar()});
  });
  router.get('/cofres-demo/:id/historico',(req,res)=>{
    if(!configuracao)return res.status(501).json({erro:'CONFIGURACAO_DEMO_INDISPONIVEL'});
    try {
      res.json({modo:'HISTORICO_APARENCIA_FICTICIA',eventos:configuracao.historico(req.params.id)});
    }catch(e){
      if(/desconhecido/.test(e.message))return res.status(404).json({erro:'COFRE_DESCONHECIDO'});
      throw e;
    }
  });
  router.patch('/cofres-demo/:id',(req,res)=>{
    if(!configuracao)return res.status(501).json({erro:'CONFIGURACAO_DEMO_INDISPONIVEL'});
    const body=req.body;
    if(!body || typeof body!=='object' || Array.isArray(body) ||
       Object.keys(body).length!==3 ||
       Object.keys(body).some(k=>!['nome','cor','revisaoEsperada'].includes(k))){
      return res.status(400).json({erro:'SOMENTE_NOME_COR_E_REVISAO'});
    }
    try {
      res.json({modo:'CONFIGURACAO_LOCAL_SALVA',cofre:configuracao.salvar({
        id:req.params.id,nome:body.nome,cor:body.cor,revisaoEsperada:body.revisaoEsperada
      })});
    }catch(e){
      if(e.codigo==='CONFLITO_DE_REVISAO')return res.status(409).json({erro:'RECARREGAR_CONFIGURACAO'});
      if(/desconhecido/.test(e.message))return res.status(404).json({erro:'COFRE_DESCONHECIDO'});
      if(/Nome|Cor|Revisao/.test(e.message))return res.status(400).json({erro:'CONFIGURACAO_INVALIDA'});
      throw e;
    }
  });
  return router;
}
module.exports={criarRouterFinanceiroAdminDemo};
