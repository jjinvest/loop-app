'use strict';
// Autenticacao HTTP de ensaio LOCAL, sem rota publica e sem cadastro aberto.
// Nao transformar esta montagem em login de producao por flag.
const express=require('express');
const {localSeguro}=require('./admin-catalogo-laboratorio');
const {COOKIE,DURACAO_MS}=require('../domain/autenticacao-checkout-staging-sqlite');
function criarRouterAutenticacaoCheckoutStaging({autenticacao}={}){
 if(typeof autenticacao?.entrar!=='function'||
  typeof autenticacao?.sessao!=='function'||
  typeof autenticacao?.sair!=='function'||
  typeof autenticacao?.autorizarMutacao!=='function')
  throw new TypeError('Autenticacao persistente obrigatoria');
 const r=express.Router();
 r.use((req,res,next)=>{
  res.set('Cache-Control','no-store');
  res.set('Referrer-Policy','no-referrer');
  res.set('X-Content-Type-Options','nosniff');
  if(process.env.NODE_ENV==='production')return res.status(503).json({
   erro:'CHECKOUT_PUBLICO_NAO_HOMOLOGADO'
  });
  if(!localSeguro(req))return res.status(403).json({erro:'SOMENTE_TESTE_LOCAL'});
  next();
 });
 const cookie=(valor,expirado=false)=>[
  COOKIE+'='+valor,
  'Path=/staging','HttpOnly','SameSite=Strict',
  'Max-Age='+(expirado?0:Math.floor(DURACAO_MS/1000))
 ].join('; ');
 r.post('/entrar',async(req,res,next)=>{
  try{
   if(!req.is('application/json'))
    return res.status(415).json({erro:'JSON_OBRIGATORIO'});
   if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
      Object.keys(req.body).sort().join(',')!=='nomeLogin,senha')
    return res.status(400).json({erro:'CAMPOS_LOGIN_INVALIDOS'});
   const {titularId,token,csrf,expiraEm}=await autenticacao.entrar(req.body);
   res.set('Set-Cookie',cookie(token));
   return res.json({titularId,csrf,expiraEm,
    ambiente:'STAGING_LOCAL_SEM_COBRANCA',checkoutHabilitado:false});
  }catch(e){
   if(e?.codigo==='CREDENCIAIS_INVALIDAS')
    return res.status(401).json({erro:'CREDENCIAIS_INVALIDAS'});
   if(e?.codigo==='TENTATIVAS_TEMPORARIAMENTE_BLOQUEADAS')
    return res.status(429).json({erro:'TENTATIVAS_TEMPORARIAMENTE_BLOQUEADAS'});
   next(e);
  }
 });
 r.get('/sessao',(req,res)=>{
  const s=autenticacao.sessao(req);
  return s?res.json({titularId:s.titularId,csrf:s.csrf,expiraEm:s.expiraEm,
    ambiente:'STAGING_LOCAL_SEM_COBRANCA'}):
   res.status(401).json({erro:'SESSAO_AUSENTE'});
 });
 r.post('/sair',(req,res)=>{
  if(!autenticacao.sessao(req))return res.status(401).json({erro:'SESSAO_AUSENTE'});
  if(!autenticacao.autorizarMutacao(req))
   return res.status(403).json({erro:'MUTACAO_NAO_AUTORIZADA'});
  autenticacao.sair(req);
  res.set('Set-Cookie',cookie('',true));
  return res.json({sessaoEncerrada:true,semPagamentoReal:true});
 });
 return r;
}
module.exports={criarRouterAutenticacaoCheckoutStaging};
