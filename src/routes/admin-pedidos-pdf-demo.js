'use strict';

// API restrita ao administrador LOCAL, sem checkout, arquivo nem dinheiro real.
const express=require('express');
const {criarAutorizacao}=require('./admin-catalogo-laboratorio');
const {criarMaterialPDFTeste}=require('../domain/material-pdf-teste');
function criarRouterPedidosPDFDemo({segredo,pedidos}={}){
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
 r.post('/pedidos-pdf-demo/:id/eventos',(req,res)=>{
  const b=req.body;
  if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).length!==2||
     Object.keys(b).some(k=>!['eventoId','tipo'].includes(k))){
   return res.status(400).json({erro:'EVENTO_PDF_FICTICIO_INVALIDO'});
  }
  try{return res.json({modo:'EVENTO_PDF_APENAS_FICTICIO',...pedidos.registrarEvento({
   pedidoId:req.params.id,eventoId:b.eventoId,tipo:b.tipo
  }),arquivoEntregue:false,cobrancaReal:false,catracaMovimentada:false});}
  catch(e){
   if(e.codigo==='CONFLITO')return res.status(409).json({erro:'EVENTO_EM_CONFLITO'});
   if(e.codigo==='NAO_ENCONTRADO')return res.status(404).json({erro:'PEDIDO_NAO_ENCONTRADO'});
   if(e.codigo==='INVALIDO')return res.status(400).json({erro:'EVENTO_INVALIDO'});
   throw e;
  }
 });
 return r;
}
module.exports={criarRouterPedidosPDFDemo};
