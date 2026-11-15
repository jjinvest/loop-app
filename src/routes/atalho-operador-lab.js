'use strict';
// Sessao do mesmo administrador, somente localhost. Nao habilita producao.
const express=require('express');
const {randomBytes}=require('node:crypto');
const {criarAutorizacao,localSeguro}=require('./admin-catalogo-laboratorio');
const COOKIE='loop_operador_lab';
const DURACAO_MS=4*60*60*1000;
function criarRouterAtalhoOperadorLab({segredo}={}){
 const router=express.Router();
 const sessoes=new Map();
 const autorizarChave=criarAutorizacao({segredo});
 function encontrar(req){
  const linha=req.get('cookie')||'';
  const item=linha.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));
  const chave=item?.slice(COOKIE.length+1);
  if(!chave||!/^[A-Za-z0-9_-]{43}$/.test(chave))return null;
  const validade=sessoes.get(chave);
  if(!validade)return null;
  if(validade<=Date.now()){sessoes.delete(chave);return null;}
  return chave;
 }
 router.use((req,res,next)=>{
  if(process.env.NODE_ENV==='production'||!localSeguro(req))
   return res.status(403).json({erro:'OPERADOR_LOCAL_APENAS'});
  res.set('Cache-Control','no-store');
  if(encontrar(req))req.operadorAutenticadoLab=true;
  next();
 });
 router.get('/operador-sessao',(req,res)=>{
  res.json({operador:req.operadorAutenticadoLab===true});
 });
 router.post('/operador-sessao',(req,res,next)=>{
  // Mesmo com cookie valido, renovar exige chave administrativa.
  req.operadorAutenticadoLab=false;
  autorizarChave(req,res,next);
 },(_req,res)=>{
  const chave=randomBytes(32).toString('base64url');
  sessoes.set(chave,Date.now()+DURACAO_MS);
  res.cookie(COOKIE,chave,{
   httpOnly:true,sameSite:'strict',secure:false,path:'/',maxAge:DURACAO_MS
  });
  res.json({operador:true});
 });
 router.delete('/operador-sessao',(req,res)=>{
  if(req.get('X-LOOP-OPERADOR')!=='1')
   return res.status(403).json({erro:'OPERACAO_NAO_AUTORIZADA'});
  const chave=encontrar(req);
  if(chave)sessoes.delete(chave);
  res.clearCookie(COOKIE,{httpOnly:true,sameSite:'strict',secure:false,path:'/'});
  res.status(204).end();
 });
 return router;
}
module.exports={criarRouterAtalhoOperadorLab};
