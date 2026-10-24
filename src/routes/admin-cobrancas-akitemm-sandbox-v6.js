'use strict';
const express=require('express');
const {criarAutorizacao}=require('./admin-catalogo-laboratorio');
function criarRouterCobrancasAkitemmSandboxV6({segredo,servico=null}={}){
 const r=express.Router();
 r.use(criarAutorizacao({segredo}));
 r.use((_q,res,next)=>{res.set('Cache-Control','no-store');next();});
 r.get('/akitemm/sandbox/status',(_req,res)=>res.json({
  loja:'AKITEMM',plataforma:'LOOP',sandbox:!!servico,recebimentosReais:false
 }));
 r.get('/akitemm/sandbox/cobrancas/:id',(req,res)=>{
  if(!servico)return res.status(501).json({erro:'SANDBOX_DESATIVADO'});
  try{return res.json(servico.historico(req.params.id));}
  catch(e){return res.status(400).json({erro:e.codigo||'FALHA_SANDBOX'});}
 });
 r.post('/akitemm/sandbox/cobrancas',async(req,res)=>{
  if(!servico)return res.status(501).json({erro:'SANDBOX_DESATIVADO'});
  if(!req.is('application/json'))return res.sendStatus(415);
  const p=req.body;
  if(!p||Array.isArray(p)||typeof p!=='object'||
     Object.keys(p).sort().join(',')!=='clienteAsaasId,origem,pedidoId')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  try{return res.status(201).json(await servico.criar(p));}
  catch(e){return res.status(409).json({erro:e.codigo||'SANDBOX_FALHOU'});}
 });
 r.post('/akitemm/sandbox/cobrancas/:id/conferir',async(req,res)=>{
  if(!servico)return res.status(501).json({erro:'SANDBOX_DESATIVADO'});
  if(!req.is('application/json'))return res.sendStatus(415);
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
    Object.keys(req.body).length)return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  try{return res.json(await servico.conferir(req.params.id));}
  catch(e){return res.status(409).json({erro:e.codigo||'SANDBOX_FALHOU'});}
 });
 return r;
}
module.exports={criarRouterCobrancasAkitemmSandboxV6};
