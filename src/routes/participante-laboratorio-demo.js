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
function criarRouterParticipanteDemo({contas,ponte,sessoes=null,adesoes=null}={}){
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
 router.use((req,res,next)=>{
  if(req.method!=='POST')return next();
  // Uma pagina externa nao pode enviar cabecalho customizado com
  // cookies sem preflight CORS, nao habilitado no laboratorio.
  // SameSite=Strict e verificacao de Origin sao protecoes adicionais.
  const fetchSite=req.get('sec-fetch-site');
  if(req.get('x-loop-lab')!=='participante'||
    (fetchSite&&!['same-origin','none'].includes(fetchSite))){
   return res.status(403).json({erro:'OPERACAO_LOCAL_INDEVIDA'});
  }
  next();
 });
 router.post('/entrar',(req,res,next)=>{
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
   const anterior=lerCookie(req);
   if(anterior&&anterior!==sessao.token){
    // Revoga a sessao anterior ao rotacionar login no mesmo navegador.
    gerenciador.sair(anterior,{motivo:'SESSAO_REVOGADA'});
   }
   setCookie(res,sessao.token,sessao.duracaoSegundos);
   return res.json({modo:'SESSAO_FICTICIA_LOCAL',autenticadoNoTeste:true,
    expiraEmSegundos:DURACAO/1000,
    clienteReal:false,pagamentoReal:false});
  }catch(erro){
   if(!['LIMITE_LOGIN_DE_TESTE','LOGIN_DE_TESTE_INVALIDO'].includes(erro.codigo)){
    return next(erro);
   }
   return res.status(erro.codigo==='LIMITE_LOGIN_DE_TESTE'?429:401)
    .json({erro:erro.codigo==='LIMITE_LOGIN_DE_TESTE'?
      'LIMITE_LOGIN_DE_TESTE':'CREDENCIAIS_INVALIDAS'});
  }
 });
 router.post('/sair',(req,res,next)=>{
  if(!req.is('application/json')){
   return res.status(415).json({erro:'USE_APPLICATION_JSON'});
  }
  try{
   gerenciador.sair(lerCookie(req));
   setCookie(res,'',0);
   return res.json({sessaoEncerradaNoTeste:true});
  }catch(erro){return next(erro);}
 });
 router.post('/ativar-posicoes',(req,res,next)=>{
  if(!adesoes)return res.status(501).json({erro:'ATIVACAO_NAO_CONFIGURADA'});
  if(!req.is('application/json'))return res.status(415).json({erro:'USE_APPLICATION_JSON'});
  const body=req.body;
  if(!body||typeof body!=='object'||Array.isArray(body)||
   Object.keys(body).sort().join(',')!=='aceitaTermos,cpfFicticio,versaoTermos'){
   return res.status(400).json({erro:'CAMPOS_ATIVACAO_INVALIDOS'});
  }
  try{
   const contaId=gerenciador.identificar(lerCookie(req));
   if(!contaId)return res.status(401).json({erro:'SESSAO_AUSENTE_OU_EXPIRADA'});
   return res.json(adesoes.ativar({...body,contaId}));
  }catch(err){
   if(['ACEITE_TERMOS_OBRIGATORIO','CPF_FICTICIO_INVALIDO','CONTA_INVALIDA'].includes(err.codigo))
    return res.status(400).json({erro:err.codigo});
   if(['CPF_JA_FIXADO_NA_CONTA','CPF_JA_ASSOCIADO','NENHUMA_POSICAO_AZUL_NA_FILA'].includes(err.codigo))
    return res.status(409).json({erro:err.codigo});
   return next(err);
  }
 });
  router.get('/minha-conta',(req,res,next)=>{
  try{
   const contaId=gerenciador.identificar(lerCookie(req));
   if(!contaId)return res.status(401).json({erro:'SESSAO_AUSENTE_OU_EXPIRADA'});
   const visao=escritorio.consultar(contaId);
   if(!visao)return res.status(401).json({erro:'SESSAO_AUSENTE_OU_EXPIRADA'});
   return res.json({...visao,adesao:adesoes?adesoes.consultarConta(contaId):null});
  }catch(erro){return next(erro);}
 });
 return router;
}
module.exports={criarRouterParticipanteDemo,COOKIE,CAMINHO,lerCookie};
