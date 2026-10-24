'use strict';
const express=require('express');
const {criarAutorizacao}=require('./admin-catalogo-laboratorio');
function erroHttp(e,res){
 if(e.codigo==='CONFLITO')return res.status(409).json({erro:'REVISAO_OU_PEDIDO_EM_CONFLITO'});
 if(e.codigo==='NAO_ENCONTRADO')return res.status(404).json({erro:'PRODUTO_NAO_ENCONTRADO'});
 if(e.codigo==='INVALIDO')return res.status(400).json({erro:'DADOS_DE_LABORATORIO_INVALIDOS'});
 throw e;
}
function valido(body,chaves){
 return !!body&&typeof body==='object'&&!Array.isArray(body)&&
  Object.keys(body).length===chaves.length&&
  Object.keys(body).every(x=>chaves.includes(x));
}
function criarRouterPlanejamentoFisicoDemo({segredo,planejamento}={}){
 const r=express.Router();
 r.use(criarAutorizacao({segredo}));
 r.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 r.get('/planejamento-fisico-demo',(_req,res)=>res.json(planejamento.listarProdutos()));
 r.get('/planejamento-fisico-demo/pre-pedidos',(_req,res)=>res.json(planejamento.listarPrePedidos()));
 r.get('/planejamento-fisico-demo/:produtoId/custos-historico',(req,res)=>{
  try{
   return res.json({modo:'HISTORICO_CUSTOS_INFORMADOS_FICTICIOS',
    historico:planejamento.historicoCustos(req.params.produtoId)});
  }catch(e){return erroHttp(e,res);}
 });
 r.get('/planejamento-fisico-demo/:produtoId',(req,res)=>{
  try{
   const d=planejamento.diagnostico(req.params.produtoId);
   return d?res.json({modo:'PRECO_E_MARGEM_FICTICIOS',diagnostico:d}):
    res.status(404).json({erro:'PRODUTO_NAO_ENCONTRADO'});
  }catch(e){return erroHttp(e,res);}
 });
 r.post('/planejamento-fisico-demo/custos',(req,res)=>{
  if(!valido(req.body,['produtoId','custoCentavos','revisaoEsperada'])){
   return res.status(400).json({erro:'SOMENTE_PRODUTO_CUSTO_E_REVISAO_FICTICIOS'});
  }
  try{
   return res.json({modo:'CUSTO_FORNECEDOR_INFORMADO_APENAS_PARA_TESTE',
    ...planejamento.registrarCusto(req.body),cotacaoReal:false});
  }catch(e){return erroHttp(e,res);}
 });
 r.post('/planejamento-fisico-demo/pre-pedidos',(req,res)=>{
  if(!valido(req.body,['pedidoId','produtoId','revisaoProduto','revisaoCustoTeste'])){
   return res.status(400).json({erro:'SOMENTE_IDS_E_REVISOES_DA_PRE_COMPRA_FICTICIA'});
  }
  try{
   return res.json({modo:'PRE_PEDIDO_FISICO_SEM_COBRANCA',
    ...planejamento.criarPrePedido(req.body),pagamentoReal:false,distribuidorAcionado:false});
  }catch(e){return erroHttp(e,res);}
 });
 return r;
}
module.exports={criarRouterPlanejamentoFisicoDemo};
