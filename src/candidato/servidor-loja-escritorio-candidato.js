'use strict';
// CANDIDATO LOCAL para uma conta de loja e Escritorio: mesmo titular
// no SQLite, cadastro/login, rascunho e Meus Pedidos. Nada financeiro real.
// NUNCA montar em src/server.js; nao expor em Railway publico.
const express=require('express');
const path=require('node:path');
const {ContaUnicaCandidataSQLite,COOKIE,DURACAO_MS}=
 require('../domain/conta-unica-candidata-sqlite');
const {TitularidadeCpfTermosCandidato}=
 require('../domain/titularidade-cpf-termos-candidato');
const {VerificacaoEmailContaUnicaCandidata}=
 require('../domain/verificacao-email-conta-unica-candidata');
const {IntencoesCheckoutSQLite}=require('../domain/intencoes-checkout-sqlite');
const {PrePedidosCheckoutStagingSQLite}=require('../domain/prepedidos-checkout-staging-sqlite');
const {PontePrepedidoAsaasSandboxStaging}=require('../domain/ponte-prepedido-asaas-sandbox-staging');
const {EntregasPrePedidosAsaasSandboxStaging}=
 require('../domain/entregas-prepedidos-asaas-sandbox-staging');
const {InboxWebhookPrepedidoAsaasStaging}=
 require('../domain/inbox-webhook-prepedido-asaas-staging');
const {ReconsultaWebhookPrepedidoAsaasStaging}=
 require('../domain/reconsulta-webhook-prepedido-asaas-staging');
const {PosicoesPendentesCheckoutSandboxStaging}=
 require('../domain/posicoes-pendentes-checkout-sandbox-staging');
const {IntegridadeTitularCandidatoSQLite}=
 require('../domain/integridade-titular-candidato-sqlite');
const {auditarRelacoesPspCandidato}=
 require('../domain/auditoria-relacional-psp-candidato-sqlite');
const {consultarEscritorioHomologacao}=require('../domain/relatorio-homologacao-checkout-staging');
const {criarRouterRascunhosCheckoutStaging}=require('../routes/rascunhos-checkout-staging');
const {criarRouterPrePedidosCheckoutStaging}=require('../routes/prepedidos-checkout-staging');
const {criarAutorizacao,localSeguro}=require('../routes/admin-catalogo-laboratorio');
const {cotarCheckoutPublico}=require('../domain/cotacao-checkout-publico');
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function criarAppLojaEscritorioCandidato({banco,repositorioCatalogo,
 chaveEmail,chaveCifra,chaveCpfHmac=null,chaveCpfCifra=null,
 chaveProvaEmail=null,enviarEmailDeVerificacao=null,
 webhookHomologacaoToken=null,provedorReconsultaSandbox=null,
 operacoesSandboxAutorizadas=false,
 segredoOperador,termosVersao,termosTexto}={}){
 if(process.env.NODE_ENV==='production')erro('CANDIDATO_NAO_HOMOLOGADO');
 if(typeof repositorioCatalogo?.buscar!=='function')
  throw new TypeError('Catalogo obrigatorio');
 if(typeof segredoOperador!=='string'||segredoOperador.length<32)
  erro('OPERADOR_NAO_CONFIGURADO');
 if(typeof termosVersao!=='string'||!/^LAB-/.test(termosVersao)||
    typeof termosTexto!=='string'||termosTexto.length<40)
  erro('TERMOS_LAB_INVALIDOS');
 const contas=new ContaUnicaCandidataSQLite({banco,chaveEmail,chaveCifra});
 if((chaveCpfHmac===null)!==(chaveCpfCifra===null))
  erro('CPF_CUSTODIA_INCOMPLETA');
 const cpf=chaveCpfHmac===null?null:new TitularidadeCpfTermosCandidato({
  banco,chaveHmac:chaveCpfHmac,chaveCifra:chaveCpfCifra,perfil:'unificada'
 });
 if((chaveProvaEmail===null)!==(enviarEmailDeVerificacao===null))
  erro('EMAIL_PROVEDOR_E_CUSTODIA_INCOMPLETOS');
 const provasEmail=chaveProvaEmail===null?null:
  new VerificacaoEmailContaUnicaCandidata({
   banco,contas,segredo:chaveProvaEmail,enviar:enviarEmailDeVerificacao
  });
 const intencoes=new IntencoesCheckoutSQLite({banco});
 const prePedidos=new PrePedidosCheckoutStagingSQLite({banco});
 const ponte=new PontePrepedidoAsaasSandboxStaging({banco});
 const integridade=new IntegridadeTitularCandidatoSQLite({banco});
 const entregas=new EntregasPrePedidosAsaasSandboxStaging({banco});
 // Operador usa o MESMO SQLite que o checkout e o Escritório: webhook
 // isolado jamais e prova de recebimento sem GET PSP autenticado.
 if((webhookHomologacaoToken===null)!==(provedorReconsultaSandbox===null))
  erro('RECONSULTA_SANDBOX_CONFIGURACAO_INCOMPLETA');
 if(operacoesSandboxAutorizadas===true&&
    (webhookHomologacaoToken===null||
     provedorReconsultaSandbox?.ambiente!=='ASAAS_SANDBOX_EXCLUSIVO'||
     typeof provedorReconsultaSandbox.consultarCobranca!=='function'))
  erro('RECONSULTA_SANDBOX_NAO_CONFIGURADA');
 const inbox=webhookHomologacaoToken===null?null:
  new InboxWebhookPrepedidoAsaasStaging({
   banco,token:webhookHomologacaoToken
  });
 const worker=inbox===null?null:
  new ReconsultaWebhookPrepedidoAsaasStaging({banco,inbox,ponte});
 const posicoes=worker===null?null:
  new PosicoesPendentesCheckoutSandboxStaging({banco,ponte});
 const app=express();
 app.disable('x-powered-by');app.disable('etag');app.set('trust proxy',false);
 app.use((req,res,next)=>{
  res.set({
   'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
   'Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',
   'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
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
 // Readiness separada de liveness. Nenhum healthcheck deve declarar
 // prontidão comercial por um SQLite apenas estruturalmente íntegro.
 app.get('/readyz',(_req,res)=>{
  try{
   const check=banco.prepare('PRAGMA quick_check').get();
   contas.verificarCustodia();
   const fks=banco.prepare('PRAGMA foreign_key_check').all().length;
   const titulares=integridade.auditar();
   const cadeia=auditarRelacoesPspCandidato({banco});
   if(check?.quick_check!=='ok'||fks>0||
      titulares.totalInconsistencias!==0||cadeia.totalInconsistencias!==0)
    return res.status(503).json({
     estado:'BANCO_LABORATORIO_INCONSISTENTE',
     laboratorioPronto:false,checkoutReal:false,marcoZeroLiberado:false
    });
   return res.json({
    estado:'APTO_SOMENTE_ENSAIO_LOCAL',
    laboratorioPronto:true,integridadeTitular:true,
    sqliteIntegro:true,segregacaoDeTitulares:true,
    checkoutReal:false,pagamentosReais:false,
    infraProducaoComprovada:false,marcoZeroLiberado:false
   });
  }catch(_e){
   return res.status(503).json({
    estado:'BANCO_LABORATORIO_INDISPONIVEL',
    laboratorioPronto:false,checkoutReal:false,
    marcoZeroLiberado:false
   });
  }
 });
 // Mesmas abas e paleta aprovadas no staging, com campo de cadastro
 // específico para identidade unificada, sem abrir checkout comercial.
 app.get('/staging/cliente',(_req,res)=>res.sendFile(
  path.join(__dirname,'checkout-candidato-ui.html')
 ));
 app.get('/staging/assets/cliente.js',(_req,res)=>res.type('js').sendFile(
  path.join(__dirname,'checkout-candidato-ui.js')
 ));
 app.get('/staging/assets/cliente.css',(_req,res)=>res.type('css').sendFile(
  path.join(__dirname,'../laboratorio/checkout-staging-ui.css')
 ));
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
  return res.json({...profile,csrf:s.csrf,expiraEm:s.expiraEm,
   confirmacaoEmailDisponivel:provasEmail!==null});
 });
 // A entrega de e-mail é opcional e só funciona com transportador real
 // injetado pelo operador. Sem ele estas rotas NEM são montadas.
 if(provasEmail){
  app.post('/staging/contas/email/enviar',async(req,res)=>{
   const s=contas.sessao(req);
   if(!s)return res.status(401).json({erro:'SESSAO_AUSENTE'});
   if(!contas.autorizarMutacao(req))
    return res.status(403).json({erro:'CSRF_INVALIDO'});
   if(!req.is('application/json')||!req.body||
     Array.isArray(req.body)||Object.keys(req.body).length!==0)
    return res.status(400).json({erro:'REQUISICAO_INVALIDA'});
   try{
    const r=await provasEmail.solicitar({
     titularId:s.titularId,autorizado:true
    });
    return res.json(r);
   }catch(e){
    if(e.codigo==='REENVIO_EMAIL_AGUARDAR')
     return res.status(429).json({erro:e.codigo});
    return res.status(503).json({erro:'VERIFICACAO_EMAIL_INDISPONIVEL'});
   }
  });
  app.post('/staging/contas/email/confirmar',(req,res)=>{
   const s=contas.sessao(req);
   if(!s)return res.status(401).json({erro:'SESSAO_AUSENTE'});
   if(!contas.autorizarMutacao(req))
    return res.status(403).json({erro:'CSRF_INVALIDO'});
   if(!req.is('application/json')||!req.body||
      Array.isArray(req.body)||
      Object.keys(req.body).join(',')!=='codigo')
    return res.status(400).json({erro:'REQUISICAO_INVALIDA'});
   try{
    const r=provasEmail.confirmar({
     titularId:s.titularId,codigo:req.body.codigo,autorizado:true
    });
    if(r.codigoIncorreto)return res.status(400).json({
     erro:'CODIGO_INCORRETO',tentativasRestantes:r.tentativasRestantes
    });
    return res.json(r);
   }catch(e){
    if(e.codigo==='CODIGO_EMAIL_INVALIDO')
     return res.status(400).json({erro:e.codigo});
    if(e.codigo==='PROVA_EMAIL_EXPIRADA_OU_INVALIDA')
     return res.status(409).json({erro:e.codigo});
    return res.status(503).json({erro:'VERIFICACAO_EMAIL_INDISPONIVEL'});
   }
  });
 }
 app.post('/staging/contas/senha',async(req,res)=>{
  if(!contas.sessao(req))
   return res.status(401).json({erro:'SESSAO_AUSENTE'});
  if(!contas.autorizarMutacao(req))
   return res.status(403).json({erro:'CSRF_INVALIDO'});
  if(!req.is('application/json'))
   return res.status(415).json({erro:'JSON_OBRIGATORIO'});
  if(!req.body||Array.isArray(req.body)||
     Object.keys(req.body).sort().join(',')!=='novaSenha,senhaAtual')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  try{
   const r=await contas.trocarSenha({
    req,senhaAtual:req.body.senhaAtual,novaSenha:req.body.novaSenha
   });
   res.set('Set-Cookie',cookie('',true));
   return res.json(r);
  }catch(e){
   if(e.codigo==='SENHA_ATUAL_INCORRETA')
    return res.status(401).json({erro:'SENHA_ATUAL_INCORRETA'});
   if(e.codigo==='CONTA_TEMPORARIAMENTE_BLOQUEADA')
    return res.status(429).json({erro:e.codigo});
   if(['SENHA_INVALIDA','NOVA_SENHA_DEVE_SER_DIFERENTE'].includes(e.codigo))
    return res.status(400).json({erro:e.codigo});
   return res.status(503).json({erro:'TROCA_SENHA_INDISPONIVEL'});
  }
 });
 app.post('/staging/contas/sair',(req,res)=>{
  if(!sessao(req))return res.status(401).json({erro:'SESSAO_AUSENTE'});
  if(!autorizacao(req))
   return res.status(403).json({erro:'CSRF_INVALIDO'});
  contas.sair(req);res.set('Set-Cookie',cookie('',true));
  return res.json({sessaoEncerrada:true,pagamentosReais:false});
 });
 // CPF de ensaio criptografado, mas sempre sem verificaçao externa.
 // Nunca usar este aceite isolado para habilitar posicoes ou saques.
 if(cpf){
  app.post('/staging/contas/identidade',(req,res)=>{
   const sessao=contas.sessao(req);
   if(!sessao)return res.status(401).json({erro:'SESSAO_AUSENTE'});
   if(!contas.autorizarMutacao(req))
    return res.status(403).json({erro:'CSRF_INVALIDO'});
   if(!req.is('application/json'))
    return res.status(415).json({erro:'JSON_OBRIGATORIO'});
   if(!req.body||Array.isArray(req.body)||
      Object.keys(req.body).sort().join(',')!=='aceiteExplicito,cpf')
    return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
   try{
    const r=cpf.registrar({titularId:sessao.titularId,
     cpf:req.body.cpf,termosVersao,termosTexto,
     aceiteExplicito:req.body.aceiteExplicito,autorizado:true});
    return res.status(r.repetido?200:201).json({
     ...r,identidadeExternaVerificada:false,pagamentosReais:false
    });
   }catch(e){
    if(e.codigo==='CPF_OU_TITULAR_JA_VINCULADO')
     return res.status(409).json({erro:e.codigo});
    if(['CPF_INVALIDO','TERMOS_NAO_ACEITOS_NO_ENSAIO'].includes(e.codigo))
     return res.status(400).json({erro:e.codigo});
    return res.status(503).json({erro:'IDENTIDADE_STAGING_INDISPONIVEL'});
   }
  });
  app.get('/staging/contas/identidade',(req,res)=>{
   const s=contas.sessao(req);
   if(!s)return res.status(401).json({erro:'SESSAO_AUSENTE'});
   try{
    const x=cpf.consultar({titularId:s.titularId});
    return res.json({
     registrado:Boolean(x),cpfFinal:x?.cpfFinal||null,
     identidadeExternaVerificada:false,permitidoSacar:false,
     permitidoCriarPosicoes:false
    });
   }catch{return res.status(503).json({erro:'IDENTIDADE_INDISPONIVEL'});}
  });
 }
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
 // Quadro de acompanhamento do PSP, habilitado apenas em homologação.
 // Apenas contagens e códigos operacionais, sem credenciais, CPF ou payload.
 if(worker){
  app.get('/staging/escritorio-unificado/monitor-psp',autorizarOperador,
   (_req,res)=>{
    if(!operacoesSandboxAutorizadas)return res.status(403)
     .json({erro:'OPERACAO_SANDBOX_DESATIVADA'});
    const resumo=worker.resumoPendencias();
    const fila=worker.pendencias({limite:30});
    return res.json({
     ambiente:'ASAAS_SANDBOX_EXCLUSIVO',somenteLaboratorio:true,
     resumo,fila,posicoesReais:0,pagamentosReais:0,
     saquesReais:0,consultaPSPExecutadaNestaLeitura:false
    });
   });
  app.post('/staging/escritorio-unificado/reconsultar-psp',autorizarOperador,
   async(req,res)=>{
    if(!operacoesSandboxAutorizadas)return res.status(403)
     .json({erro:'OPERACAO_SANDBOX_DESATIVADA'});
    if(!req.is('application/json')||!req.body||
       Array.isArray(req.body)||
       Object.keys(req.body).join(',')!=='eventoId'||
       typeof req.body.eventoId!=='string'||
       !/^[A-Za-z0-9_&-]{5,150}$/.test(req.body.eventoId))
     return res.status(400).json({erro:'EVENTO_INVALIDO'});
    try{
     const r=await worker.processar({
      eventoId:req.body.eventoId,provedor:provedorReconsultaSandbox,
      execucaoLiberada:true
     });
     return res.json(r);
    }catch(e){
     if(e.codigo==='EVENTO_NAO_ENCONTRADO')
      return res.status(404).json({erro:e.codigo});
     if(e.codigo==='VINCULO_SANDBOX_DIVERGENTE')
      return res.status(409).json({erro:e.codigo});
     return res.status(503).json({erro:'RECONSULTA_PSP_NAO_CONCLUIDA'});
    }
   });
  app.post('/staging/escritorio-unificado/projetar-posicao-ficticia',
   autorizarOperador,(req,res)=>{
    if(!operacoesSandboxAutorizadas)return res.status(403)
     .json({erro:'OPERACAO_SANDBOX_DESATIVADA'});
    if(!req.is('application/json')||!req.body||
       Array.isArray(req.body)||
       Object.keys(req.body).sort().join(',')!=='eventoId,prepedidoId'||
       typeof req.body.prepedidoId!=='string'||
       !/^hom-[a-f0-9-]{36}$/.test(req.body.prepedidoId)||
       typeof req.body.eventoId!=='string'||
       !/^[A-Za-z0-9_&-]{5,150}$/.test(req.body.eventoId))
     return res.status(400).json({erro:'PARAMETROS_INVALIDOS'});
    const row=banco.prepare([
     'SELECT titular_id AS titularId',
     'FROM akitemm_checkout_prepedidos_staging WHERE prepedido_id=?'
    ].join(' ')).get(req.body.prepedidoId);
    if(!row)return res.status(404).json({erro:'PREPEDIDO_NAO_ENCONTRADO'});
    try{
     const r=posicoes.projetar({
      titularId:row.titularId,prepedidoId:req.body.prepedidoId,
      eventoId:req.body.eventoId,execucaoLiberada:true
     });
     return res.status(r.repetido?200:201).json(r);
    }catch(e){
     if(['RECEBIMENTO_SANDBOX_NAO_VERIFICADO',
          'PSP_SANDBOX_NAO_CONCILIADO'].includes(e.codigo))
      return res.status(409).json({erro:e.codigo});
     return res.status(503).json({erro:'POSICAO_FICTICIA_INDISPONIVEL'});
    }
   });
 }
 // Somente operador do laboratório pode preparar espelho de entrega
 // após reconsulta independente ao PSP no mesmo SQLite. Sem arquivo/frete.
 app.post('/staging/escritorio-unificado/preparar-entrega',autorizarOperador,
  (req,res)=>{
   if(!req.is('application/json')||!req.body||
      Array.isArray(req.body)||Object.keys(req.body).join(',')!=='prepedidoId')
    return res.status(400).json({erro:'REQUISICAO_INVALIDA'});
   const id=req.body.prepedidoId;
   if(typeof id!=='string'||!/^hom-[a-f0-9-]{36}$/.test(id))
    return res.status(400).json({erro:'PREPEDIDO_INVALIDO'});
   const row=banco.prepare([
    'SELECT titular_id AS titularId FROM akitemm_checkout_prepedidos_staging',
    'WHERE prepedido_id=?'
   ].join(' ')).get(id);
   if(!row)return res.status(404).json({erro:'PREPEDIDO_NAO_ENCONTRADO'});
   try{
    const r=entregas.preparar({
     titularId:row.titularId,prepedidoId:id,autorizado:true
    });
    return res.status(r.repetido?200:201).json(r);
   }catch(e){
    if(e.codigo==='RECEBIMENTO_PSP_NAO_COMPROVADO')
     return res.status(409).json({erro:e.codigo});
    return res.status(503).json({erro:'ENTREGA_FICTICIA_INDISPONIVEL'});
   }
  });
 app.get('/staging/prepedidos/:id/entrega',(req,res)=>{
  const s=contas.sessao(req);
  if(!s)return res.status(401).json({erro:'SESSAO_AUSENTE'});
  try{
   const x=entregas.consultar({
    titularId:s.titularId,prepedidoId:req.params.id
   });
   return x?res.json(x):res.status(404).json({
    erro:'PREPEDIDO_NAO_ENCONTRADO'
   });
  }catch{return res.status(404).json({erro:'PREPEDIDO_NAO_ENCONTRADO'});}
 });
 app.get('/staging/escritorio-unificado',autorizarOperador,(_req,res)=>{
  try{
   const rel=consultarEscritorioHomologacao({banco});
   const pedidos=rel.pedidos.map(p=>({
    ...p,nick:contas.perfil(p.titularId)?.nick||null,
    entregaFicticia:entregas.consultar({
     titularId:p.titularId,prepedidoId:p.prepedidoId
    }),
    contaUnica:true,emailVerificadoNoEnsaio:contas.perfil(p.titularId)?.emailVerificado===true,
    identidadeExternaVerificada:false,
    cpfDeclaradoNoEnsaio:cpf?Boolean(cpf.consultar({titularId:p.titularId})):false
   }));
   return res.json({...rel,pedidos,
    entregasFicticias:banco.prepare([
     'SELECT COUNT(*) AS n FROM akitemm_prepedido_entregas_sandbox_staging'
    ].join(' ')).get().n,
    conciliacaoSandboxDisponivel:Boolean(worker&&operacoesSandboxAutorizadas),
    posicoesPendentesFicticias:posicoes?banco.prepare([
     'SELECT COUNT(*) AS n FROM',
     'akitemm_prepedido_posicoes_pendentes_sandbox_staging'
    ].join(' ')).get().n:0,
    integridadeTitular:integridade.auditar(),
    integridadePagamentosEntregas:auditarRelacoesPspCandidato({banco}),
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
  autorizarMutacao:autorizacao,ponteAsaasSandbox:ponte,
  consultarEntregaSimulada:args=>entregas.consultar(args),
  consultarPosicaoPendente:posicoes?args=>posicoes.consultar(args):null
 }));
 app.use((_req,res)=>res.status(404).json({erro:'ROTA_INEXISTENTE'}));
 app.use((_err,_req,res,_next)=>res.status(503).json({
  erro:'CANDIDATO_INDISPONIVEL',financeiroReal:false
 }));
 return {app,contas,cpf,provasEmail,intencoes,prePedidos,ponte,
  inbox,worker,posicoes,entregas,integridade,banco};
}
module.exports={criarAppLojaEscritorioCandidato};
