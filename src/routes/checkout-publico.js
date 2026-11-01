'use strict';
// Superfície pública de orçamento apenas. Sem credenciais/identidade,
// criação de pedidos, Pix, saques ou ponte com motor de laboratório.
const express=require('express');
const {cotarCheckoutPublico}=require('../domain/cotacao-checkout-publico');
function criarRouterCheckoutPublico({repositorio}={}){
 if(typeof repositorio?.buscar!=='function')throw new TypeError('Catalogo obrigatorio');
 const router=express.Router();
 router.use((_req,res,next)=>{
  res.set('Cache-Control','no-store');
  res.set('X-Robots-Tag','noindex, nofollow');
  next();
 });
 router.get('/estado',(_req,res)=>res.json({
  modulo:'CHECKOUT_PUBLICO_EM_PREPARACAO',
  cotacaoInformativaDisponivel:true,checkoutHabilitado:false,
  pedidosHabilitados:false,pagamentosHabilitados:false,
  asaasRemotoHomologado:false,
  motivo:'MARCO_ZERO_NAO_HOMOLOGADO'
 }));
 router.post('/cotacao',async(req,res,next)=>{
  try{
   const cotacao=await cotarCheckoutPublico({repositorio,entrada:req.body});
   res.json(cotacao);
  }catch(e){
   if(['CAMPOS_COTACAO_INVALIDOS','ITENS_COTACAO_INVALIDOS',
    'ITEM_COTACAO_INVALIDO','PRODUTO_REPETIDO_NA_COTACAO',
    'LIMITE_COTACAO_EXCEDIDO'].includes(e?.codigo))
    return res.status(400).json({erro:e.codigo});
   if(e?.codigo==='PRODUTO_INDISPONIVEL_PARA_COTACAO')
    return res.status(404).json({erro:e.codigo});
   next(e);
  }
 });
 // Falha fechada: nenhuma flag ambiental pode ativar o checkout.
 // Rotas nao previstas, inclusive GET /pedidos e POST /pagar, nao
 // chegam ao Asaas nem a lojas/servicos financeiros de teste.
 router.use((_req,res)=>res.status(503).set('Retry-After','86400').json({
  erro:'CHECKOUT_PUBLICO_NAO_HOMOLOGADO',
  pedidoCriado:false,pagamentoIniciado:false
 }));
 return router;
}
module.exports={criarRouterCheckoutPublico};
