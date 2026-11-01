'use strict';
const express=require('express');
const {criarAutorizacao}=require('./admin-catalogo-laboratorio');
function criarRouterMonitorCallbacksAsaasLab({segredo,obterWorker,obterConciliacaoAutomatica,obterIntegracao}={}){
 const r=express.Router();r.use(criarAutorizacao({segredo}));
 r.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 // Relatorio agregado para o Escritorio, sem IDs, valores pessoais nem mutacoes.
 r.get('/asaas-conciliacao-lab',(req,res)=>{
  if(Object.keys(req.query).length)
   return res.status(400).json({erro:'FILTRO_CONCILIACAO_INVALIDO'});
  const integracao=typeof obterIntegracao==='function'?obterIntegracao():null;
  if(!integracao?.resumoConvergencia)
   return res.status(501).json({erro:'CONCILIACAO_SANDBOX_NAO_CONFIGURADA'});
  return res.json(integracao.resumoConvergencia());
 });
 r.get('/asaas-callbacks-lab',(req,res)=>{
  const w=obterWorker();if(!w)return res.status(501).json({erro:'CALLBACK_SANDBOX_NAO_CONFIGURADO'});
  if(Object.keys(req.query).some(k=>!['limite','offset','estado'].includes(k))||
     ['limite','offset'].some(k=>req.query[k]!==undefined&&
      (typeof req.query[k]!=='string'||!/^\d{1,9}$/.test(req.query[k]))))
   return res.status(400).json({erro:'FILTRO_CALLBACK_INVALIDO'});
  try{
   const automatico=typeof obterConciliacaoAutomatica==='function'?obterConciliacaoAutomatica():null;
   const diagnostico=automatico?{
    falhasAgendador:Number.isSafeInteger(automatico.falhasAgendador)?automatico.falhasAgendador:0,
    ultimaFalhaAgendador:automatico.ultimaFalhaAgendador||null,
    telemetriaSomenteMemoria:true,
    movimentacaoFinanceiraReal:false
   }:null;
   return res.json({...w.listar({limite:Number(req.query.limite??50),offset:Number(req.query.offset??0),
    estado:req.query.estado??null}),resumo:w.resumo(),conciliacaoAutomatica:diagnostico});
  }
  catch(e){if(e.message==='FILTRO_CALLBACK_INVALIDO')return res.status(400).json({erro:e.message});throw e;}
 });
 r.get('/asaas-callbacks-lab/eventos/:id',(req,res)=>{
  const w=obterWorker();if(!w)return res.status(501).json({erro:'CALLBACK_SANDBOX_NAO_CONFIGURADO'});
  if(!/^[A-Za-z0-9_&-]{5,150}$/.test(req.params.id))return res.status(400).json({erro:'EVENTO_INVALIDO'});
  if(!w.caixaAvisos.buscar(req.params.id))return res.status(404).json({erro:'AVISO_NAO_ENCONTRADO'});
  return res.json({job:w.consultar(req.params.id),historico:w.historico(req.params.id),somenteLeitura:true});
 });return r;
}
module.exports={criarRouterMonitorCallbacksAsaasLab};
