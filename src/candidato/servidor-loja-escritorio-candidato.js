'use strict';
// CANDIDATO LOCAL para uma conta de loja e Escritorio: mesmo titular
// no SQLite, cadastro/login, rascunho e Meus Pedidos. Nada financeiro real.
// NUNCA montar em src/server.js; nao expor em Railway publico.
const express=require('express');
const {ContaUnicaCandidataSQLite,COOKIE,DURACAO_MS}=
 require('../domain/conta-unica-candidata-sqlite');
const {IntencoesCheckoutSQLite}=require('../domain/intencoes-checkout-sqlite');
const {PrePedidosCheckoutStagingSQLite}=require('../domain/prepedidos-checkout-staging-sqlite');
const {PontePrepedidoAsaasSandboxStaging}=require('../domain/ponte-prepedido-asaas-sandbox-staging');
const {consultarEscritorioHomologacao}=require('../domain/relatorio-homologacao-checkout-staging');
const {criarRouterRascunhosCheckoutStaging}=require('../routes/rascunhos-checkout-staging');
const {criarRouterPrePedidosCheckoutStaging}=require('../routes/prepedidos-checkout-staging');
const {criarAutorizacao,localSeguro}=require('../routes/admin-catalogo-laboratorio');
const {cotarCheckoutPublico}=require('../domain/cotacao-checkout-publico');
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function criarAppLojaEscritorioCandidato({banco,repositorioCatalogo,
 chaveEmail,chaveCifra,segredoOperador,termosVersao,termosTexto}={}){
 if(process.env.NODE_ENV==='production')erro('CANDIDATO_NAO_HOMOLOGADO');
 if(typeof repositorioCatalogo?.buscar!=='function')
  throw new TypeError('Catalogo obrigatorio');
 if(typeof segredoOperador!=='string'||segredoOperador.length<32)
  erro('OPERADOR_NAO_CONFIGURADO');
 if(typeof termosVersao!=='string'||!/^LAB-/.test(termosVersao)||
    typeof termosTexto!=='string'||termosTexto.length<40)
  erro('TERMOS_LAB_INVALIDOS');
 const contas=new ContaUnicaCandidataSQLite({banco,chaveEmail,chaveCifra});
 const intencoes=new IntencoesCheckoutSQLite({banco});
 const prePedidos=new PrePedidosCheckoutStagingSQLite({banco});
 const ponte=new PontePrepedidoAsaasSandboxStaging({banco});
 const app=express();
 app.disable('x-powered-by');app.disable('etag');app.set('trust proxy',false);
 app.use((req,res,next)=>{
  res.set({
   'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
   'Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',
   'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
  });
  if(process.env.NODE_ENV==='production')
   return res.status(503).json({erro:'CANDIDATO_NAO_HOMOLOGADO'});
  if(!localSeguro(req))return res.status(403).json({erro:'SOMENTE_LOOPBACK'});
  next();
 });
 app.use(express.json({limit:'12kb',strict:true}));
 const sessao=req=>contas.sessao(req);
 const autorizacao=req=>contas.autorizarMutacao(req);
 const titular=req=>contas.identificarTitular(req);
 const cookie=(valor,expirado=false)=>[
  COOKIE+'='+valor,'HttpOnly','SameSite=Strict','Path=/staging',
  'Max-Age='+(expirado?'0':String(Math.floor(DURACAO_MS/1000)))
 ].join('; ');
 app.get('/healthz',(_req,res)=>res.json({
  ambiente:'CANDIDATO_LOCAL',checkoutReal:false,
  identidadesCompartilhadas:true,servicoRealNaoImplantado:true
 }));
 app.post('/staging/contas/cadastrar',async(req,res)=>{
  if(!req.is('application/json'))
   return res.status(415).json({erro:'JSON_OBRIGATORIO'});
  const body=req.body;
  if(!body||Array.isArray(body)||typeof body!=='object'||
     Object.keys(body).sort().join(',')!=='aceiteExplicito,email,nick,nome,senha')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  try{
   const conta=await contas.cadastrar({...body,termosVersao,termosTexto});
   return res.status(201).json(conta);
  }catch(e){
   if(e.codigo==='CADASTRO_JA_EXISTENTE')
    return res.status(409).json({erro:'CADASTRO_JA_EXISTENTE'});
   if(['NICK_INVALIDO','NOME_INVALIDO','EMAIL_INVALIDO','SENHA_INVALIDA',
      'TERMOS_LAB_NAO_ACEITOS'].includes(e.codigo))
    return res.status(400).json({erro:e.codigo});
   return res.status(503).json({erro:'CADASTRO_INDISPONIVEL'});
  }
 });
 app.post('/staging/contas/entrar',async(req,res)=>{
  if(!req.is('application/json'))
   return res.status(415).json({erro:'JSON_OBRIGATORIO'});
  const body=req.body;
  if(!body||Array.isArray(body)||typeof body!=='object'||
     Object.keys(body).sort().join(',')!=='nick,senha')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  try{
   const x=await contas.entrar(body);
   res.set('Set-Cookie',cookie(x.token));
   return res.json({titularId:x.titularId,nick:x.nick,
    csrf:x.csrf,expiraEm:x.expiraEm,
    emailVerificado:false,pagamentosReais:false});
  }catch(e){
   return res.status(e.codigo==='CONTA_TEMPORARIAMENTE_BLOQUEADA'?429:401)
    .json({erro:'CREDENCIAIS_INVALIDAS'});
  }
 });
 app.get('/staging/contas/me',(req,res)=>{
  const s=sessao(req);
  if(!s)return res.status(401).json({erro:'SESSAO_AUSENTE'});
  const profile=contas.perfil(s.titularId);
  return res.json({...profile,csrf:s.csrf,expiraEm:s.expiraEm});
 });
 app.post('/staging/contas/sair',(req,res)=>{
  if(!sessao(req))return res.status(401).json({erro:'SESSAO_AUSENTE'});
  if(!autorizacao(req))
   return res.status(403).json({erro:'CSRF_INVALIDO'});
  contas.sair(req);res.set('Set-Cookie',cookie('',true));
  return res.json({sessaoEncerrada:true,pagamentosReais:false});
 });
 app.post('/staging/cotacao',async(req,res)=>{
  if(!req.is('application/json'))
   return res.status(415).json({erro:'JSON_OBRIGATORIO'});
  try{
   const x=await cotarCheckoutPublico({
    repositorio:repositorioCatalogo,entrada:req.body
   });
   return res.json({...x,apenasEstimativa:true});
  }catch(e){return res.status(400).json({erro:e.codigo||'COTACAO_INVALIDA'});}
 });
 const autorizarOperador=criarAutorizacao({segredo:segredoOperador});
 app.get('/staging/escritorio-unificado',autorizarOperador,(_req,res)=>{
  try{
   const rel=consultarEscritorioHomologacao({banco});
   const pedidos=rel.pedidos.map(p=>({
    ...p,nick:contas.perfil(p.titularId)?.nick||null,
    contaUnica:true
   }));
   return res.json({...rel,pedidos,
    escritorioFonteUnica:true,
    contasCandidatas:banco.prepare(
     'SELECT COUNT(*) AS n FROM akitemm_conta_unica_candidata'
    ).get().n,administracaoRealNaoHabilitada:true});
  }catch{return res.status(503).json({erro:'ESCRITORIO_INDISPONIVEL'});}
 });
 // Nem uma chamada a Pix e liberada. O backend prepara somente prepedidos.
 app.all(['/staging/checkout/finalizar','/staging/pagar',
  '/staging/saques','/staging/ativar-posicao'],(_req,res)=>
  res.status(503).json({erro:'FINANCEIRO_REAL_NAO_HOMOLOGADO'}));
 app.use('/staging',criarRouterRascunhosCheckoutStaging({
  repositorioCatalogo,intencoes,identificarTitular:titular,
  autorizarMutacao:autorizacao
 }));
 app.use('/staging',criarRouterPrePedidosCheckoutStaging({
  repositorioCatalogo,prePedidos,identificarTitular:titular,
  autorizarMutacao:autorizacao,ponteAsaasSandbox:ponte
 }));
 app.use((_req,res)=>res.status(404).json({erro:'ROTA_INEXISTENTE'}));
 app.use((_err,_req,res,_next)=>res.status(503).json({
  erro:'CANDIDATO_INDISPONIVEL',financeiroReal:false
 }));
 return {app,contas,intencoes,prePedidos,ponte,banco};
}
module.exports={criarAppLojaEscritorioCandidato};
