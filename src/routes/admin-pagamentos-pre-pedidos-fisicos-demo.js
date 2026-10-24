'use strict';

// Uso estritamente LOCAL, no painel administrativo do laboratorio.
const express=require('express');
const {criarAutorizacao}=require('./admin-catalogo-laboratorio');
const {auditarPrePedidosFisicosDemo}=require('../domain/auditoria-pre-pedidos-fisicos-demo');
function falhaHttp(e,res){
 if(e.codigo==='INVALIDO')return res.status(400).json({erro:'EVENTO_FINANCEIRO_FICTICIO_INVALIDO'});
 if(e.codigo==='CONFLITO')return res.status(409).json({erro:'PAGAMENTO_FICTICIO_EM_CONFLITO'});
 if(e.codigo==='NAO_ENCONTRADO')return res.status(404).json({erro:'PRE_PEDIDO_NAO_ENCONTRADO'});
 throw e;
}
function criarRouterPagamentosPrePedidosFisicosDemo({segredo,pagamentos}={}){
 const r=express.Router();
 r.use(criarAutorizacao({segredo}));
 r.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 r.get('/pagamentos-pre-pedidos-fisicos-demo',(_req,res)=>res.json(pagamentos.listar()));
 // Conferencia consolidada somente de leitura, sem expor auditoria ao cliente.
 r.get('/pagamentos-pre-pedidos-fisicos-demo/auditoria',(_req,res)=>{
  return res.json(auditarPrePedidosFisicosDemo({
   planejamento:pagamentos.planejamento,pagamentos
  }));
 });
 r.get('/pagamentos-pre-pedidos-fisicos-demo/:id/historico',(req,res)=>{
  try{
   const c=pagamentos.buscar(req.params.id);
   if(!c)return res.status(404).json({erro:'PRE_PEDIDO_NAO_ENCONTRADO'});
   return res.json({
    modo:'HISTORICO_PAGAMENTO_FICTICIO_SEM_LANCAMENTO_FINANCEIRO',
    pedidoId:c.pedidoId,pagamentoIntentoTesteId:c.pagamentoIntentoTesteId,
    eventos:pagamentos.historico(c.pedidoId),cofresMovimentados:false
   });
  }catch(e){return falhaHttp(e,res);}
 });
 r.get('/pagamentos-pre-pedidos-fisicos-demo/:id',(req,res)=>{
  try{
   const c=pagamentos.buscar(req.params.id);
   return c?res.json({modo:'CONFERENCIA_DE_PAGAMENTO_FICTICIO',conferencia:c}):
    res.status(404).json({erro:'PRE_PEDIDO_NAO_ENCONTRADO'});
  }catch(e){return falhaHttp(e,res);}
 });
 r.post('/pagamentos-pre-pedidos-fisicos-demo/:id/eventos',(req,res)=>{
  const b=req.body;
  if(!b||typeof b!=='object'||Array.isArray(b)||
     Object.keys(b).length!==3||
     Object.keys(b).some(k=>!['pagamentoIntentoTesteId','eventoId','tipo'].includes(k))){
   return res.status(400).json({erro:'CAMPOS_DE_EVENTO_FICTICIO_INVALIDOS'});
  }
  try{
   const resultado=pagamentos.registrarEvento({
    pedidoId:req.params.id,
    pagamentoIntentoTesteId:b.pagamentoIntentoTesteId,
    eventoId:b.eventoId,tipo:b.tipo
   });
   return res.json({
    modo:'CONFIRMACAO_OU_ESTORNO_FICTICIO_SEM_EFEITOS_OPERACIONAIS',
    ...resultado,
    webhookPSPReal:false,valorRecebidoReal:0,
    fornecedorAvisado:false,cofresMovimentados:false,
    filaMovimentada:false
   });
  }catch(e){return falhaHttp(e,res);}
 });
 return r;
}
module.exports={criarRouterPagamentosPrePedidosFisicosDemo};
