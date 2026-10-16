'use strict';

// API restrita ao administrador LOCAL, sem checkout, arquivo nem dinheiro real.
const express=require('express');
const {criarAutorizacao}=require('./admin-catalogo-laboratorio');
const {criarMaterialPDFTeste}=require('../domain/material-pdf-teste');
function criarRouterPedidosPDFDemo({segredo,pedidos,integracaoLoop=null}={}){
 const r=express.Router();
 r.use(criarAutorizacao({segredo}));
 r.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 r.get('/pedidos-pdf-demo',(_req,res)=>res.json(pedidos.listar()));
 r.get('/pedidos-pdf-demo/opcoes',(_req,res)=>res.json(pedidos.opcoes()));
 // O arquivo retorna SOMENTE apos confirmacao ficticia do pedido,
 // e apenas para administrador local com bearer de laboratorio.
 r.get('/pedidos-pdf-demo/:id/material-teste.pdf',(req,res)=>{
  try{
   // Criar primeiro o material: nenhum evento de download se a fixture falhar.
   const material=criarMaterialPDFTeste();
   pedidos.registrarSolicitacaoMaterialTeste(req.params.id);
   res.set({
    'Content-Type':'application/pdf',
    'Content-Disposition':'attachment; filename="loop-material-de-teste.pdf"',
    'X-Content-Type-Options':'nosniff'
   });
   return res.send(material);
  }catch(e){
   if(e.codigo==='SEM_DIREITO')return res.status(403).json({erro:'MATERIAL_TESTE_SEM_PAGAMENTO_CONFIRMADO'});
   if(e.codigo==='NAO_ENCONTRADO')return res.status(404).json({erro:'PEDIDO_PDF_DEMO_NAO_ENCONTRADO'});
   if(e.codigo==='INVALIDO')return res.status(400).json({erro:'ID_INVALIDO'});
   throw e;
  }
 });
 r.get('/pedidos-pdf-demo/:id/solicitacoes-material-teste',(req,res)=>{
  try{
   return res.json({
    modo:'AUDITORIA_DE_SOLICITACOES_DE_PDF_FICTICIO',
    materialReal:false,
    solicitacoes:pedidos.historicoSolicitacoesMaterialTeste(req.params.id)
   });
  }catch(e){
   if(e.codigo==='NAO_ENCONTRADO')return res.status(404).json({erro:'PEDIDO_PDF_DEMO_NAO_ENCONTRADO'});
   if(e.codigo==='INVALIDO')return res.status(400).json({erro:'ID_INVALIDO'});
   throw e;
  }
 });
 // Identificacao ADMIN antes do pagamento; nunca aceitar pedido pago no POST.
 r.get('/pedidos-pdf-demo/:id/estado-loop',(req,res)=>{
  if(!integracaoLoop)return res.status(501).json({erro:'INTEGRACAO_INDISPONIVEL'});
  try{return res.json(integracaoLoop.consultarEstado(req.params.id));}
  catch(e){
   if(e.codigo==='PDF_INEXISTENTE')return res.status(404).json({erro:e.codigo});
   if(e.codigo==='INVALIDO')return res.status(400).json({erro:e.codigo});
   throw e;
  }
 });
 r.post('/pedidos-pdf-demo/:id/vincular-loop',(req,res)=>{
  if(!integracaoLoop)return res.status(501).json({erro:'INTEGRACAO_INDISPONIVEL'});
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
    Object.keys(req.body).join(',')!=='contaId'){
   return res.status(400).json({erro:'TITULAR_INVALIDO'});
  }
  try{return res.json(integracaoLoop.vincular({
   pedidoId:req.params.id,contaId:req.body.contaId
  }));}
  catch(e){
   if(['PEDIDO_IMUTAVEL','PAGAMENTO_JA_DECIDIDO','CONFLITO'].includes(e.codigo))
    return res.status(409).json({erro:e.codigo});
   if(e.codigo==='PDF_INEXISTENTE'||e.codigo==='TITULAR_DESCONHECIDO')
    return res.status(404).json({erro:e.codigo});
   if(['PEDIDO_INVALIDO','INVALIDO'].includes(e.codigo))
    return res.status(400).json({erro:e.codigo});
   throw e;
  }
 });
 r.post('/pedidos-pdf-demo/:id/sincronizar-loop',async(req,res,next)=>{
  if(!integracaoLoop)return res.status(501).json({erro:'INTEGRACAO_INDISPONIVEL'});
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
    Object.keys(req.body).length!==0)return res.status(400).json({erro:'SEM_PARAMETROS'});
  try{return res.json(await integracaoLoop.sincronizar({pedidoId:req.params.id}));}
  catch(e){
   if(e.codigo==='PDF_INEXISTENTE')return res.status(404).json({erro:e.codigo});
   if(e.codigo==='INVALIDO')return res.status(400).json({erro:e.codigo});
   return next(e);
  }
 });
  r.get('/pedidos-pdf-demo/:id',(req,res)=>{
  try{
   const p=pedidos.buscar(req.params.id);
   return p?res.json({modo:'PEDIDO_PDF_APENAS_FICTICIO',pedido:p}):
    res.status(404).json({erro:'PEDIDO_PDF_DEMO_NAO_ENCONTRADO'});
  }catch(e){
   if(e.codigo==='INVALIDO')return res.status(400).json({erro:'ID_INVALIDO'});
   throw e;
  }
 });
 r.get('/pedidos-pdf-demo/:id/historico',(req,res)=>{
  try{
   if(!pedidos.buscar(req.params.id))return res.status(404).json({erro:'PEDIDO_PDF_DEMO_NAO_ENCONTRADO'});
   res.json({modo:'HISTORICO_PAGAMENTO_PDF_FICTICIO',eventos:pedidos.historico(req.params.id)});
  }catch(e){
   if(e.codigo==='INVALIDO')return res.status(400).json({erro:'ID_INVALIDO'});
   throw e;
  }
 });
 r.post('/pedidos-pdf-demo',(req,res)=>{
  const b=req.body;
  if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).length!==2||
     Object.keys(b).some(k=>!['pedidoId','produtoId'].includes(k))){
   return res.status(400).json({erro:'SOMENTE_PEDIDO_E_CURSO_FICTICIOS'});
  }
  try{return res.json({modo:'PEDIDO_PDF_FICTICIO',...pedidos.criar(b),cobrancaReal:false});}
  catch(e){
   if(e.codigo==='CONFLITO')return res.status(409).json({erro:'ID_EM_CONFLITO'});
   if(e.codigo==='NAO_ENCONTRADO')return res.status(404).json({erro:'PDF_NAO_ENCONTRADO'});
   if(e.codigo==='INVALIDO')return res.status(400).json({erro:'PEDIDO_PDF_INVALIDO'});
   throw e;
  }
 });
 r.post('/pedidos-pdf-demo/:id/eventos',async(req,res,next)=>{
  const b=req.body;
  if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).length!==2||
     Object.keys(b).some(k=>!['eventoId','tipo'].includes(k))){
   return res.status(400).json({erro:'EVENTO_PDF_FICTICIO_INVALIDO'});
  }
  let evento;
  try{
   evento=pedidos.registrarEvento({
    pedidoId:req.params.id,eventoId:b.eventoId,tipo:b.tipo
   });
  }catch(e){
   if(e.codigo==='CONFLITO')return res.status(409).json({erro:'EVENTO_EM_CONFLITO'});
   if(e.codigo==='NAO_ENCONTRADO')return res.status(404).json({erro:'PEDIDO_NAO_ENCONTRADO'});
   if(e.codigo==='INVALIDO')return res.status(400).json({erro:'EVENTO_INVALIDO'});
   return next(e);
  }
  let integracao=null;
  if(integracaoLoop){
   try{
    integracao=await integracaoLoop.sincronizar({pedidoId:req.params.id});
   }catch(e){
    // O evento de pagamento ficticio JA foi salvo. Nao simular rollback
    // invisivel: exibir alerta e permitir nova sincronizacao idempotente.
    integracao={situacao:'SINCRONIZACAO_PENDENTE',
     erro:e.codigo||'ERRO_INTERNO',posicaoCriada:false};
   }
  }
  return res.json({modo:'EVENTO_PDF_APENAS_FICTICIO',...evento,
   arquivoEntregue:false,cobrancaReal:false,catracaMovimentada:false,
   ...(integracao?{integracaoLoop:integracao}:{})});
 });
 return r;
}
module.exports={criarRouterPedidosPDFDemo};
