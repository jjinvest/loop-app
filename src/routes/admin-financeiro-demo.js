'use strict';

// Financeiro ficticio: leitura dos exemplos e EDICAO SOMENTE de nomes/cores.
// Nao permite movimentar recursos, alterar destinatarios, ou controlar bancos.
const express=require('express');
const {criarAutorizacao}=require('./admin-catalogo-laboratorio');
const {criarVisaoFinanceiraAdminDemo,MODOS}=require('../domain/financeiro-admin-demo');
const {criarConciliacaoAdministrativaDemo}=require('../domain/conciliacao-cofres-demo');
const {compararParcelaAntigaComNova}=require('../domain/configuracao-valor-loop-demo-sqlite');

function criarRouterFinanceiroAdminDemo({segredo,configuracao,razaoPersistente,configuracaoValorLoop=null}={}){
  const router=express.Router();
  router.use(criarAutorizacao({segredo}));
  router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get('/valor-loop-demo',(_req,res)=>{
    if(!configuracaoValorLoop)return res.status(501).json({erro:'REFERENCIA_INDISPONIVEL'});
    return res.json(configuracaoValorLoop.resumo());
  });
  router.get('/valor-loop-demo/impacto',(req,res)=>{
    if(!configuracaoValorLoop)return res.status(501).json({erro:'REFERENCIA_INDISPONIVEL'});
    if(Object.keys(req.query).join(',')!=='novoValorCentavos'){
      return res.status(400).json({erro:'PARAMETROS_INVALIDOS'});
    }
    const valor=Number(req.query.novoValorCentavos);
    try{
      return res.json(configuracaoValorLoop.simularImpacto({novoValorCentavos:valor}));
    }catch(err){
      if(err.codigo==='VALOR_INVALIDO')
        return res.status(400).json({erro:'VALOR_INVALIDO'});
      throw err;
    }
  });
  router.patch('/valor-loop-demo',(req,res)=>{
    if(!configuracaoValorLoop)return res.status(501).json({erro:'REFERENCIA_INDISPONIVEL'});
    if(!req.is('application/json'))return res.status(415).json({erro:'JSON_OBRIGATORIO'});
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
      Object.keys(req.body).sort().join(',')!=='revisaoEsperada,valorCentavos'){
      return res.status(400).json({erro:'CAMPOS_NAO_PERMITIDOS'});
    }
    try{
      const atualizado=configuracaoValorLoop.alterar(req.body);
      return res.json({modo:'VALOR_ALTERADO_SOMENTE_LABORATORIO',
       alterado:atualizado.alterado,atual:configuracaoValorLoop.atual(),
       historico:configuracaoValorLoop.historico(),pagamentosReais:false});
    }catch(err){
      if(err.codigo==='CONFLITO_REVISAO')
       return res.status(409).json({erro:err.codigo});
      if(['REVISAO_INVALIDA','VALOR_INVALIDO','HORARIO_INVALIDO'].includes(err.codigo))
       return res.status(400).json({erro:err.codigo});
      throw err;
    }
  });
  router.get('/valor-loop-demo/comparacao',(req,res)=>{
    if(!configuracaoValorLoop)return res.status(501).json({erro:'REFERENCIA_INDISPONIVEL'});
    const original=Number(req.query.valorCentroOriginalCentavos);
    const novo=Number(req.query.valorNovaVendaLoopCentavos);
    const evento=req.query.evento;
    if(Object.keys(req.query).sort().join(',')!=='evento,valorCentroOriginalCentavos,valorNovaVendaLoopCentavos'){
      return res.status(400).json({erro:'PARAMETROS_INVALIDOS'});
    }
    try {
      return res.json(compararParcelaAntigaComNova({
       valorCentroOriginalCentavos:original,valorNovaVendaLoopCentavos:novo,evento
      }));
    }catch(err){return res.status(400).json({erro:'COMPARACAO_INVALIDA'});}
  });
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

  // Livro financeiro PERSISTENTE apenas no laboratorio. Toda entrada POST
  // representa uma simulacao explicitamente identificada, nunca dinheiro real.
  router.get('/livro-financeiro-demo',(_req,res)=>{
    if(!razaoPersistente)return res.status(501).json({erro:'LIVRO_DEMO_INDISPONIVEL'});
    res.json(razaoPersistente.consultar());
  });
  function camposExatos(obj,lista){
    return obj&&typeof obj==='object'&&!Array.isArray(obj)&&
      Object.keys(obj).length===lista.length&&
      Object.keys(obj).every(k=>lista.includes(k));
  }
  function respostaEscrita(res,executar){
    try {
      res.json({
        modo:'LANCAMENTO_APENAS_FICTICIO',
        resultado:executar(),
        movimentacaoBancariaReal:false
      });
    }catch(e){
      if(e.codigo==='CONFLITO_IDEMPOTENCIA'){
        return res.status(409).json({erro:'IDENTIFICADOR_JA_UTILIZADO'});
      }
      if(/invalido|invalida|desconhecido|obrigatori|repetid|nao suportado|referencia|Descricao|Referencia|Lancamento/.test(e.message)){
        return res.status(400).json({erro:'REGISTRO_FICTICIO_INVALIDO'});
      }
      throw e;
    }
  }
  router.post('/livro-financeiro-demo/ciclos',(req,res)=>{
    if(!razaoPersistente)return res.status(501).json({erro:'LIVRO_DEMO_INDISPONIVEL'});
    if(!camposExatos(req.body,['cicloId','modo'])||
       !['split','reserva'].includes(req.body.modo) ||
       typeof req.body.cicloId!=='string' ){
      return res.status(400).json({erro:'CICLO_DEMO_INVALIDO'});
    }
    return respostaEscrita(res,()=>razaoPersistente.registrarCicloFicticio({
      cicloId:req.body.cicloId,
      modo:req.body.modo==='split'?MODOS.SPLIT:MODOS.RESERVA
    }));
  });
  function gravarMovimento(req,res,ajuste=false){
    if(!razaoPersistente)return res.status(501).json({erro:'LIVRO_DEMO_INDISPONIVEL'});
    if(!camposExatos(req.body,['eventoId','cofreId','natureza','valorCentavos','referencia'])){
      return res.status(400).json({erro:'MOVIMENTO_DEMO_INVALIDO'});
    }
    return respostaEscrita(res,()=>(
      ajuste?razaoPersistente.registrarAjusteFicticio(req.body):
        razaoPersistente.registrarMovimentoFicticio(req.body)
    ));
  }
  router.post('/livro-financeiro-demo/movimentos',(req,res)=>gravarMovimento(req,res));
  router.post('/livro-financeiro-demo/ajustes',(req,res)=>gravarMovimento(req,res,true));

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
