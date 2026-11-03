'use strict';
// Primeiro servidor unico para a JORNADA DE PREPEDIDO em staging LOCAL.
// Reune conta, sessao, cotacao de prova, rascunho, prepedido e "Meus Pedidos".
// NAO e checkout comercial: nenhuma cobranca, cadastro aberto, bonus ou posicao.
// NAO montar no servidor publico src/server.js.
const express=require('express');
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {RepositorioCatalogoMemoria}=require('../domain/repositorio-catalogo-memoria');
const {cotarCheckoutPublico}=require('../domain/cotacao-checkout-publico');
const {AutenticacaoCheckoutStagingSQLite}=
 require('../domain/autenticacao-checkout-staging-sqlite');
const {IntencoesCheckoutSQLite}=require('../domain/intencoes-checkout-sqlite');
const {PrePedidosCheckoutStagingSQLite}=
 require('../domain/prepedidos-checkout-staging-sqlite');
const {PontePrepedidoAsaasSandboxStaging}=
 require('../domain/ponte-prepedido-asaas-sandbox-staging');
const {criarRouterAutenticacaoCheckoutStaging}=
 require('../routes/autenticacao-checkout-staging');
const {criarRouterRascunhosCheckoutStaging}=
 require('../routes/rascunhos-checkout-staging');
const {criarRouterPrePedidosCheckoutStaging}=
 require('../routes/prepedidos-checkout-staging');
const {consultarPosicaoPendenteSimulada}=
 require('../domain/posicoes-pendentes-checkout-sandbox-staging');
const {localSeguro,criarAutorizacao}=require('../routes/admin-catalogo-laboratorio');
const {consultarEscritorioHomologacao}=require('../domain/relatorio-homologacao-checkout-staging');
const {validarProduto}=require('../domain/catalogo');

function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
function somenteEnsaio(){
 if(process.env.NODE_ENV==='production')throw falha('CHECKOUT_STAGING_PROIBIDO_EM_PRODUCAO');
}
function catalogoFicticioCheckout(){
 const produto=validarProduto({
  id:'curso-homologacao-250',
  nome:'Curso ficticio para homologacao - R$ 250',
  tipo:'PDF',estado:'PUBLICADO',
  descricao:'Produto de ensaio. Nao e uma oferta de venda.',
  precoCentavos:25000,entrega:'DOWNLOAD_APOS_CONFIRMACAO',
  fotos:[],detalhes:[],videoApresentacaoUrl:null
 });
 return new RepositorioCatalogoMemoria({produtos:[produto]});
}
function criarAppCheckoutStagingLocal({
 banco,repositorioCatalogo=catalogoFicticioCheckout(),
 segredoOperador=null
}={}){
 somenteEnsaio();
 if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
    typeof repositorioCatalogo?.buscar!=='function')
  throw new TypeError('SQLite e catalogo do ensaio obrigatorios');
 const auth=new AutenticacaoCheckoutStagingSQLite({banco});
 const intencoes=new IntencoesCheckoutSQLite({banco});
 const prePedidos=new PrePedidosCheckoutStagingSQLite({banco});
 const ponte=new PontePrepedidoAsaasSandboxStaging({banco});
 const identificarTitular=req=>auth.identificarTitular(req);
 const autorizarMutacao=req=>auth.autorizarMutacao(req);
 const app=express();
 app.disable('x-powered-by');
 app.use((req,res,next)=>{
  res.set('Cache-Control','no-store');
  res.set('Referrer-Policy','no-referrer');
  res.set('X-Content-Type-Options','nosniff');
  res.set('X-Frame-Options','DENY');
  next();
 });
 app.use(express.json({limit:'32kb',strict:true}));
 // UI local autenticada de ensaio: pagina/ativos nao sao servidos pelo
 // src/server.js, nao usam cadastro publico nem endpoint de venda.
 const ativos=new Map([
  ['/staging/cliente','checkout-staging-ui.html'],
  ['/staging/assets/cliente.css','checkout-staging-ui.css'],
  ['/staging/assets/cliente.js','checkout-staging-ui.js']
 ]);
 for(const [rota,arquivo] of ativos)app.get(rota,(req,res)=>{
  res.set('Cache-Control','no-store');
  res.set('X-Robots-Tag','noindex, nofollow');
  res.set('Content-Security-Policy',[
   "default-src 'none'","script-src 'self'","style-src 'self'",
   "connect-src 'self'","img-src 'self'","base-uri 'none'",
   "form-action 'self'","frame-ancestors 'none'"
  ].join('; '));
  if(!localSeguro(req)||process.env.NODE_ENV==='production')
   return res.status(403).json({erro:'UI_STAGING_APENAS_LOCAL'});
  return res.sendFile(path.join(__dirname,arquivo));
 });

 app.get('/staging/estado',(req,res)=>{
  if(!localSeguro(req)||process.env.NODE_ENV==='production')
   return res.status(403).json({erro:'SOMENTE_TESTE_LOCAL'});
  return res.json({
   ambiente:'HOMOLOGACAO_LOCAL',checkoutPublico:false,
   cadastroPublico:false,pagamentosReais:false,
   preparacaoDePedidos:true,meusPedidosDisponivel:true,
   posicoesCriadas:0,asaasRemotoHomologado:false
  });
 });
 app.post('/staging/cotacao',async(req,res,next)=>{
  if(!localSeguro(req)||process.env.NODE_ENV==='production')
   return res.status(403).json({erro:'SOMENTE_TESTE_LOCAL'});
  try{return res.json(await cotarCheckoutPublico({
   repositorio:repositorioCatalogo,entrada:req.body
  }));}catch(e){
   if(['CAMPOS_COTACAO_INVALIDOS','ITENS_COTACAO_INVALIDOS',
    'ITEM_COTACAO_INVALIDO','PRODUTO_REPETIDO_NA_COTACAO',
    'LIMITE_COTACAO_EXCEDIDO'].includes(e.codigo))
    return res.status(400).json({erro:e.codigo});
   if(e.codigo==='PRODUTO_INDISPONIVEL_PARA_COTACAO')
    return res.status(404).json({erro:e.codigo});
   next(e);
  }
 });
 // Escritório operacional de homologacao: mesma base SQLite do cliente,
 // segregado da sessão do comprador. Por padrao NAO existe nem no servidor
 // local, e nunca e montado no aplicativo comercial ou receptor Railway.
 if(segredoOperador!==null){
  const autorizar=criarAutorizacao({segredo:segredoOperador});
  app.get('/staging/escritorio-homologacao',autorizar,(req,res)=>{
   if(Object.keys(req.query).length)
    return res.status(400).json({erro:'FILTRO_OPERACIONAL_INVALIDO'});
   return res.json(consultarEscritorioHomologacao({banco,limite:30}));
  });
 }
 // Montar rotas que exigem sessao SOMENTE apos estado e cotacao:
 // o middleware de identidade de rascunhos intercepta rotas nao casadas.
 app.use('/staging',criarRouterAutenticacaoCheckoutStaging({autenticacao:auth}));
 app.use('/staging',criarRouterRascunhosCheckoutStaging({
  repositorioCatalogo,intencoes,identificarTitular,autorizarMutacao
 }));
 app.use('/staging',criarRouterPrePedidosCheckoutStaging({
  repositorioCatalogo,prePedidos,identificarTitular,autorizarMutacao,
  ponteAsaasSandbox:ponte,
  consultarPosicaoPendente:args=>consultarPosicaoPendenteSimulada({
   banco,ponte,...args
  })
 }));
 app.use((_req,res)=>res.status(404).json({erro:'ROTA_STAGING_INEXISTENTE'}));
 app.use((_err,_req,res,_next)=>res.status(503).json({
  erro:'OPERACAO_STAGING_INDISPONIVEL',checkoutPublico:false
 }));
 return {app,auth,intencoes,prePedidos,ponte};
}
function abrirBanco(arquivo){
 somenteEnsaio();
 if(typeof arquivo!=='string'||!path.isAbsolute(arquivo)||
    !arquivo.endsWith('.sqlite')||arquivo.includes('\0'))
  throw falha('ARQUIVO_SQLITE_STAGING_INVALIDO');
 if(fs.existsSync(arquivo)){
  const st=fs.lstatSync(arquivo);
  if(!st.isFile()||st.isSymbolicLink())
   throw falha('ARQUIVO_SQLITE_STAGING_INVALIDO');
 }
 const banco=new DatabaseSync(arquivo);
 banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;');
 return banco;
}
async function provisionarContaEnsaio({
 arquivo,nomeLogin,senha,autorizado=false
}={}){
 somenteEnsaio();
 if(autorizado!==true)throw falha('PROVISIONAMENTO_NAO_AUTORIZADO');
 const banco=abrirBanco(arquivo);
 try{
  const autenticacao=new AutenticacaoCheckoutStagingSQLite({banco});
  // Criar demais tabelas duraveis ANTES de disponibilizar o ensaio.
  new IntencoesCheckoutSQLite({banco});
  new PrePedidosCheckoutStagingSQLite({banco});
  new PontePrepedidoAsaasSandboxStaging({banco});
  const conta=await autenticacao.provisionarConta({nomeLogin,senha});
  return {estado:'CONTA_STAGING_CRIADA',login:conta.login,
   dadosPessoaisReais:false,cadastroPublico:false};
 }finally{banco.close();}
}
function iniciarCheckoutStagingLocal({
 arquivo,porta=3108,autorizado=false
}={}){
 somenteEnsaio();
 if(autorizado!==true)throw falha('STAGING_LOCAL_NAO_AUTORIZADO');
 if(!Number.isSafeInteger(porta)||porta<1024||porta>65535)
  throw falha('PORTA_STAGING_INVALIDA');
 if(typeof arquivo!=='string'||!fs.existsSync(arquivo))
  throw falha('BANCO_STAGING_NAO_PROVISIONADO');
 const banco=abrirBanco(arquivo);
 let servidor;
 try{
  const cliente=criarAppCheckoutStagingLocal({banco});
  servidor=cliente.app.listen(porta,'127.0.0.1');
  servidor.requestTimeout=15000;
  servidor.headersTimeout=10000;
  servidor.on('error',()=>{try{banco.close();}catch{}});
  return {servidor,banco,fechar:()=>new Promise(resolve=>{
   servidor.close(()=>{banco.close();resolve();});
  })};
 }catch(e){if(!servidor)banco.close();throw e;}
}
if(require.main===module){
 const ambiente=process.env;
 const arquivo=ambiente.LOOP_CHECKOUT_STAGING_SQLITE;
 const acao=ambiente.LOOP_CHECKOUT_STAGING_ACAO;
 if(acao==='PROVISIONAR'){
  provisionarContaEnsaio({arquivo,
   nomeLogin:ambiente.LOOP_CHECKOUT_STAGING_LOGIN,
   senha:ambiente.LOOP_CHECKOUT_STAGING_SENHA,
   autorizado:ambiente.LOOP_CHECKOUT_STAGING_PROVISIONAR==='SIM'
  }).then(x=>process.stdout.write(JSON.stringify(x)+'\n'),
   e=>{process.stderr.write('CHECKOUT_STAGING_ERRO='+
    String(e.codigo||'FALHA_INTERNA')+'\n');process.exitCode=1;});
 }else if(acao==='SERVIR'){
  try{
   const porta=Number(ambiente.LOOP_CHECKOUT_STAGING_PORTA||3108);
   const r=iniciarCheckoutStagingLocal({
    arquivo,porta,autorizado:ambiente.LOOP_CHECKOUT_STAGING_SERVIR==='SIM'
   });
   r.servidor.on('listening',()=>process.stdout.write(
    'CHECKOUT_STAGING_LOCAL=127.0.0.1:'+porta+';SEM_VENDAS_REAIS\n'));
   process.once('SIGINT',()=>{r.fechar().then(()=>process.exit(0));});
   process.once('SIGTERM',()=>{r.fechar().then(()=>process.exit(0));});
  }catch(e){
   process.stderr.write('CHECKOUT_STAGING_ERRO='+
    String(e.codigo||'FALHA_INTERNA')+'\n');
   process.exitCode=1;
  }
 }else{
  process.stderr.write('CHECKOUT_STAGING_ERRO=ACAO_INVALIDA\n');
  process.exitCode=1;
 }
}
module.exports={
 catalogoFicticioCheckout,criarAppCheckoutStagingLocal,
 provisionarContaEnsaio,iniciarCheckoutStagingLocal
};
