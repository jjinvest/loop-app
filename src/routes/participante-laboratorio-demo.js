'use strict';

// API de acesso individual SOMENTE no servidor de laboratorio local.
// Nenhuma rota recebe contaId do usuario. A identidade vem da sessao.
const express=require('express');
const {localSeguro}=require('./admin-catalogo-laboratorio');
const {SessoesParticipanteDemo,DURACAO}=require('../domain/sessoes-participante-demo');
const {EscritorioIndividualDemo}=require('../domain/escritorio-individual-demo');
const COOKIE='loop_participante_demo';
const CAMINHO='/api/laboratorio/participante';
function lerCookie(req){
 const raw=req.get('cookie')||'';
 if(raw.length>4096)return null;
 const achados=raw.split(';').map(p=>p.trim())
  .filter(p=>p.startsWith(COOKIE+'='));
 if(achados.length!==1)return null;
 return achados[0].slice(COOKIE.length+1);
}
function setCookie(res,token,maxAge){
 // Prototipo em HTTP/localhost. Nao serve para deploy publico,
 // que exigira HTTPS e flag Secure.
 res.append('Set-Cookie',COOKIE+'='+token+'; HttpOnly; SameSite=Strict; Path='+CAMINHO+
  '; Max-Age='+maxAge);
}
function criarRouterParticipanteDemo({contas,ponte,sessoes=null}={}){
 if(!contas||!ponte)throw new TypeError('Cadastro e ponte do laboratorio obrigatorios');
 const gerenciador=sessoes||new SessoesParticipanteDemo({contas});
 const escritorio=new EscritorioIndividualDemo({contas,ponte});
 const router=express.Router();
 router.use((req,res,next)=>{
  if(process.env.NODE_ENV==='production'||!localSeguro(req)){
   return res.status(403).json({erro:'LABORATORIO_LOCAL_APENAS'});
  }
  res.set('Cache-Control','no-store');
  res.set('Pragma','no-cache');
  res.set('Referrer-Policy','no-referrer');
  res.set('X-Content-Type-Options','nosniff');
  next();
 });
 router.post('/entrar',(req,res)=>{
  if(!req.is('application/json')){
   return res.status(415).json({erro:'USE_APPLICATION_JSON'});
  }
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
    Object.keys(req.body).sort().join(',')!=='nome,senha'){
   return res.status(400).json({erro:'CAMPOS_LOGIN_INVALIDOS'});
  }
  try{
   const sessao=gerenciador.entrar({
    nome:req.body.nome,senha:req.body.senha,origem:req.socket?.remoteAddress
   });
   setCookie(res,sessao.token,sessao.duracaoSegundos);
   return res.json({modo:'SESSAO_FICTICIA_LOCAL',autenticadoNoTeste:true,
    expiraEmSegundos:DURACAO/1000,
    clienteReal:false,pagamentoReal:false});
  }catch(erro){
   return res.status(erro.codigo==='LIMITE_LOGIN_DE_TESTE'?429:401)
    .json({erro:erro.codigo==='LIMITE_LOGIN_DE_TESTE'?
      'LIMITE_LOGIN_DE_TESTE':'CREDENCIAIS_INVALIDAS'});
  }
 });
 router.post('/sair',(req,res)=>{
  if(!req.is('application/json')){
   return res.status(415).json({erro:'USE_APPLICATION_JSON'});
  }
  gerenciador.sair(lerCookie(req));
  setCookie(res,'',0);
  return res.json({sessaoEncerradaNoTeste:true});
 });
 router.get('/minha-conta',(req,res,next)=>{
  try{
   const contaId=gerenciador.identificar(lerCookie(req));
   if(!contaId)return res.status(401).json({erro:'SESSAO_AUSENTE_OU_EXPIRADA'});
   const visao=escritorio.consultar(contaId);
   if(!visao)return res.status(401).json({erro:'SESSAO_AUSENTE_OU_EXPIRADA'});
   return res.json(visao);
  }catch(erro){return next(erro);}
 });
 return router;
}
module.exports={criarRouterParticipanteDemo,COOKIE,CAMINHO,lerCookie};
