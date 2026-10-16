'use strict';
const express=require('express');
const {localSeguro}=require('./admin-catalogo-laboratorio');
function criarRouterConviteCadastroDemo({contas,links}={}){
 if(!contas||!links)throw new TypeError('Cadastro e links de laboratorio obrigatorios');
 const r=express.Router();
 r.use((req,res,next)=>{
  if(process.env.NODE_ENV==='production'||!localSeguro(req))
   return res.status(403).json({erro:'SOMENTE_LABORATORIO'});
  res.set('Cache-Control','no-store');
  res.set('Referrer-Policy','no-referrer');
  next();
 });
 r.get('/estado',(req,res)=>{
  if(typeof req.query.link!=='string')
   return res.status(400).json({erro:'LINK_INVALIDO'});
  try{
   const verificado=links.resolver(req.query.link);
   return res.json({ativo:verificado.ativo,
    nomeIndicador:verificado.ativo?verificado.nomeIndicador:null,
    cadastroPermitido:verificado.ativo,ambienteFicticio:true});
  }catch(e){return res.status(404).json({erro:'LINK_INVALIDO'});}
 });
 r.post('/cadastrar',(req,res,next)=>{
  if(!req.is('application/json'))return res.status(415).json({erro:'USE_APPLICATION_JSON'});
  const site=req.get('sec-fetch-site');
  if(req.get('x-loop-lab')!=='convite'||(site&&!['none','same-origin'].includes(site)))
   return res.status(403).json({erro:'CADASTRO_LOCAL_INDEVIDO'});
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
   Object.keys(req.body).sort().join(',')!=='email,link,nome,senha,telefone'||
   typeof req.body.telefone!=='string'||!req.body.telefone.trim())
   return res.status(400).json({erro:'CADASTRO_INVALIDO'});
  let verificado;
  try{verificado=links.resolver(req.body.link);}
  catch(e){return res.status(404).json({erro:'LINK_INVALIDO'});}
  if(!verificado.ativo)return res.status(403).json({erro:'LINK_AINDA_INATIVO'});
  try{
   const conta=contas.cadastrar({
    nome:req.body.nome,email:req.body.email,telefone:req.body.telefone,
    senha:req.body.senha,codigoIndicador:verificado.token
   });
   return res.status(201).json({
    cadastradoNoTeste:true,contaId:conta.contaId,
    linkDoNovoCliente:links.linkDaConta(conta.contaId),
    posicaoCriada:false,semPagamentoReal:true
   });
  }catch(e){
   if(e.codigo==='INVALIDO')return res.status(400).json({erro:'CADASTRO_INVALIDO'});
   if(e.codigo==='CONFLITO')return res.status(409).json({erro:'CADASTRO_DUPLICADO'});
   if(e.codigo==='CONVITE_INVALIDO')return res.status(404).json({erro:e.codigo});
   return next(e);
  }
 });
 return r;
}
module.exports={criarRouterConviteCadastroDemo};
