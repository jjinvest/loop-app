'use strict';
// API ADMINISTRATIVA restrita ao laboratorio local, nunca no app publico.
const express=require('express');
const {criarAutorizacao}=require('./admin-catalogo-laboratorio');
const {auditarEntregasEstornosCarrinhoDemo}=require('../domain/auditoria-entregas-estornos-carrinho-demo');
function criarRouterCarrinhoLoopDemo({segredo,carrinhos}={}){
 if(!carrinhos||typeof carrinhos.criar!=='function')throw new TypeError('Carrinho laboratorio obrigatorio');
 const r=express.Router();
 r.use(criarAutorizacao({segredo}));
 r.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 const responder=(e,res,next)=>{
  if(e.codigo==='INVALIDO'||e.codigo==='VALOR_INVALIDO')return res.status(400).json({erro:e.codigo});
  if(e.codigo==='PRODUTO_INVALIDO'||e.codigo==='NAO_ENCONTRADO'||e.codigo==='TITULAR_INVALIDO')
   return res.status(404).json({erro:e.codigo});
  if(['CONFLITO','PEDIDO_IMUTAVEL','CONVITE_INVALIDO','LIMITE_ATIVO'].includes(e.codigo))
   return res.status(409).json({erro:e.codigo});
  return next(e);
 };
 r.get('/carrinho-loop-demo',(_req,res)=>res.json(carrinhos.listar()));
 // Campanhas excepcionalmente criadas e ENCERRADAS pelo operador local.
 r.get('/carrinho-loop-demo/eventos-especiais',(_req,res)=>
  res.json({eventos:carrinhos.eventosEspeciais.listar(),semPagamentoReal:true}));
 r.post('/carrinho-loop-demo/eventos-especiais',(req,res,next)=>{
  const b=req.body;
  if(!b||typeof b!=='object'||Array.isArray(b)||
   Object.keys(b).sort().join(',')!=='dataFim,dataInicio,descricao,eventoId,posicoesPorPedidoLoop,produtoId,quantidadeMinimaLoop,titulo')
   return res.status(400).json({erro:'CAMPOS_EVENTO_INVALIDOS'});
  try{return res.status(201).json({evento:carrinhos.eventosEspeciais.criar(b),
    bannerPublicado:true,semPagamentoReal:true});}
  catch(e){
   if(['EVENTO_INVALIDO','LASTRO_MINIMO_INSUFICIENTE'].includes(e.codigo))
    return res.status(400).json({erro:e.codigo});
   if(e.codigo==='PRODUTO_INDISPONIVEL')return res.status(404).json({erro:e.codigo});
   if(['EVENTO_JA_EXISTE','EVENTO_ATIVO_NO_PRODUTO'].includes(e.codigo))
    return res.status(409).json({erro:e.codigo});
   return next(e);
  }
 });
 r.post('/carrinho-loop-demo/eventos-especiais/:eventoId/encerrar',(req,res,next)=>{
  if(!req.is('application/json')||!req.body||Array.isArray(req.body)||
     typeof req.body!=='object'||Object.keys(req.body).length)
   return res.status(400).json({erro:'SEM_PARAMETROS'});
  try{return res.json({evento:carrinhos.eventosEspeciais.encerrar(req.params.eventoId),
   bannerArquivado:true,semPagamentoReal:true});}
  catch(e){
   if(e.codigo==='EVENTO_INVALIDO')return res.status(400).json({erro:e.codigo});
   if(e.codigo==='EVENTO_NAO_ENCONTRADO')return res.status(404).json({erro:e.codigo});
   if(e.codigo==='EVENTO_JA_ENCERRADO')return res.status(409).json({erro:e.codigo});
   return next(e);
  }
 });
 r.get('/carrinho-loop-demo/opcoes',(_req,res)=>res.json(carrinhos.opcoes()));
 // Controle por produto: todos começam autorizados; alterações
 // só afetam NOVOS pedidos, jamais mudam compras já registradas.
 r.get('/carrinho-loop-demo/elegibilidade',(_req,res,next)=>{
  try{return res.json(carrinhos.elegibilidade.listar());}
  catch(e){return next(e);}
 });
 r.post('/carrinho-loop-demo/elegibilidade',(req,res,next)=>{
  const b=req.body;
  if(!b||typeof b!=='object'||Array.isArray(b)||
   Object.keys(b).sort().join(',')!=='elegivelLoop,produtoId,revisaoEsperada')
   return res.status(400).json({erro:'CAMPOS_ELEGIBILIDADE_INVALIDOS'});
  try{return res.json({regra:carrinhos.elegibilidade.alterar(b),
   somenteNovosPedidos:true,semPagamentoReal:true});}
  catch(e){
   if(e.codigo==='DADOS_INVALIDOS')return res.status(400).json({erro:e.codigo});
   if(e.codigo==='PRODUTO_INEXISTENTE')return res.status(404).json({erro:e.codigo});
   if(e.codigo==='CONFLITO_REVISAO')return res.status(409).json({erro:e.codigo});
   return next(e);
  }
 });
 r.post('/carrinho-loop-demo/quantidade-minima',(req,res,next)=>{
  const b=req.body;
  if(!b||typeof b!=='object'||Array.isArray(b)||
   Object.keys(b).sort().join(',')!=='produtoId,quantidadeMinimaLoop,revisaoEsperada')
   return res.status(400).json({erro:'CAMPOS_QUANTIDADE_INVALIDOS'});
  try{return res.json({regra:carrinhos.elegibilidade.alterarQuantidadeMinima(b),
   somenteNovosPedidos:true,semPagamentoReal:true});}
  catch(e){
   if(e.codigo==='DADOS_INVALIDOS')return res.status(400).json({erro:e.codigo});
   if(e.codigo==='PRODUTO_INEXISTENTE')return res.status(404).json({erro:e.codigo});
   if(e.codigo==='CONFLITO_REVISAO')return res.status(409).json({erro:e.codigo});
   return next(e);
  }
 });
 // Endpoint antigo nao pode configurar pacote permanente em novos pedidos.
 r.post('/carrinho-loop-demo/pacote-posicoes',(_req,res)=>
  res.status(409).json({erro:'PACOTES_SOMENTE_POR_EVENTO_ESPECIAL'}));
 // Endpoint estritamente de leitura: detecta estorno apos criacao de vaga,
 // comissao e indicacao; nao exclui direitos e nao chama PSP/fornecedor.
 r.get('/carrinho-loop-demo/auditoria-entregas-estornos',(req,res,next)=>{
  if(Object.keys(req.query).length)
   return res.status(400).json({erro:'SEM_PARAMETROS'});
  try{return res.json(auditarEntregasEstornosCarrinhoDemo({carrinhos}));}
  catch(e){return next(e);}
 });
 r.get('/carrinho-loop-demo/:pedidoId',(req,res,next)=>{
  try{
   const c=carrinhos.buscar(req.params.pedidoId);
   return c?res.json({pedido:c}):res.status(404).json({erro:'NAO_ENCONTRADO'});
  }catch(e){return responder(e,res,next);}
 });
 r.post('/carrinho-loop-demo',(req,res,next)=>{
  const b=req.body;
  if(!b||typeof b!=='object'||Array.isArray(b)||
   Object.keys(b).sort().join(',')!=='contaId,itens,pedidoId'){
   return res.status(400).json({erro:'CAMPOS_CARRINHO_INVALIDOS'});
  }
  try{return res.status(201).json({pedido:carrinhos.criar(b),semPagamentoReal:true});}
  catch(e){return responder(e,res,next);}
 });
 r.post('/carrinho-loop-demo/:pedidoId/eventos',async(req,res,next)=>{
  const b=req.body;
  if(!b||typeof b!=='object'||Array.isArray(b)||
   Object.keys(b).sort().join(',')!=='eventoId,tipo'){
   return res.status(400).json({erro:'CAMPOS_EVENTO_INVALIDOS'});
  }
  let gravado;
  try{gravado=carrinhos.registrarEvento({...b,pedidoId:req.params.pedidoId});}
  catch(e){return responder(e,res,next);}
  let integracao;
  try{integracao=await carrinhos.sincronizar(req.params.pedidoId);}
  catch(e){
   integracao={situacao:'SINCRONIZACAO_PENDENTE',
    erro:e.codigo||'FALHA_INTERNA',semPagamentoReal:true};
  }
  return res.json({...gravado,integracao,
   semPagamentoReal:true,semEntregaReal:true});
 });
 r.post('/carrinho-loop-demo/:pedidoId/sincronizar',async(req,res,next)=>{
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
   Object.keys(req.body).length!==0)
   return res.status(400).json({erro:'SEM_PARAMETROS'});
  try{return res.json(await carrinhos.sincronizar(req.params.pedidoId));}
  catch(e){return responder(e,res,next);}
 });
 return r;
}
module.exports={criarRouterCarrinhoLoopDemo};
