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
const {criarTransporteEmailVerificacaoResend}=
 require('../adapters/email-verificacao-resend');
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
const {MissoesOperacionaisCandidatoSQLite}=require('../domain/missoes-operacionais-candidato-sqlite');
const {DepartamentosAdministradorCandidato}=require('../domain/escritorio-admin-departamentos-candidato');
const {CatalogoAdminCandidatoSQLite}=require('../domain/catalogo-admin-candidato-sqlite');
const {createVitrineCandidata}=require('./vitrine-aprovada-candidato');
const {ProjecaoFilasCandidatoSandbox}=require('../domain/projecao-filas-candidato-sandbox');
const {PreAdesaoSandboxCandidatoSQLite}=require('../domain/pre-adesao-sandbox-candidato-sqlite');
const {DiagnosticoAtivacaoCandidato}=require('../domain/diagnostico-ativacao-candidato');
const {EquipeCandidataSQLite}=require('../domain/equipe-candidata-sqlite');
const {MotorContaUnicaEnsaioSQLite}=require('../domain/motor-conta-unica-ensaio-sqlite');
const {criarRouterRascunhosCheckoutStaging}=require('../routes/rascunhos-checkout-staging');
const {criarRouterPrePedidosCheckoutStaging}=require('../routes/prepedidos-checkout-staging');
const {criarAutorizacao,localSeguro}=require('../routes/admin-catalogo-laboratorio');
const {cotarCheckoutPublico}=require('../domain/cotacao-checkout-publico');
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function criarAppLojaEscritorioCandidato({banco,repositorioCatalogo,
 chaveEmail,chaveCifra,chaveCpfHmac=null,chaveCpfCifra=null,
 chaveProvaEmail=null,enviarEmailDeVerificacao=null,
 chaveRecuperacao=null,enviarRecuperacao=null,
 transporteResend=null,
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
 const contas=new ContaUnicaCandidataSQLite({
  banco,chaveEmail,chaveCifra,chaveRecuperacao,enviarRecuperacao
 });
 const equipe=new EquipeCandidataSQLite({banco});
 if((chaveCpfHmac===null)!==(chaveCpfCifra===null))
  erro('CPF_CUSTODIA_INCOMPLETA');
 const cpf=chaveCpfHmac===null?null:new TitularidadeCpfTermosCandidato({
  banco,chaveHmac:chaveCpfHmac,chaveCifra:chaveCpfCifra,perfil:'unificada'
 });
 // A conta candidata jamais envia e-mails sem credenciais e domínio
 // explícitos, e não aceita dois transportadores concorrentes.
 if(transporteResend!==null&&enviarEmailDeVerificacao!==null)
  erro('EMAIL_TRANSPORTADORES_DUPLICADOS');
 const enviarEmail=transporteResend!==null?
  criarTransporteEmailVerificacaoResend(transporteResend):
  enviarEmailDeVerificacao;
 if((chaveProvaEmail===null)!==(enviarEmail===null))
  erro('EMAIL_PROVEDOR_E_CUSTODIA_INCOMPLETOS');
 const provasEmail=chaveProvaEmail===null?null:
  new VerificacaoEmailContaUnicaCandidata({
   banco,contas,segredo:chaveProvaEmail,enviar:enviarEmail
  });
 const intencoes=new IntencoesCheckoutSQLite({banco});
 const prePedidos=new PrePedidosCheckoutStagingSQLite({banco});
 const ponte=new PontePrepedidoAsaasSandboxStaging({banco});
 const integridade=new IntegridadeTitularCandidatoSQLite({banco});
 const missoes=new MissoesOperacionaisCandidatoSQLite({banco});
 const catalogo=new CatalogoAdminCandidatoSQLite({banco,repositorioBase:repositorioCatalogo});
 const departamentosAdmin=new DepartamentosAdministradorCandidato({banco,missoes,catalogo});
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
 // Fonte visual unica: CSS da interface anterior aprovada, compartilhado.
 app.get('/staging/assets/loop03-aprovado.css',(_req,res)=>res.type('css').sendFile(
  path.join(__dirname,'../laboratorio/loop-03-shell.css')
 ));
 app.get('/staging/assets/cliente-integrado.css',(_req,res)=>res.type('css').sendFile(
  path.join(__dirname,'escritorio-cliente-integrado.css')
 ));
 app.get('/staging/escritorio-admin',(_req,res)=>res.sendFile(path.join(__dirname,'escritorio-admin-candidato-ui.html')));
 app.get('/staging/assets/admin.js',(_req,res)=>res.type('js').sendFile(path.join(__dirname,'escritorio-admin-candidato-ui.js')));
 app.get('/staging/assets/admin.css',(_req,res)=>res.type('css').sendFile(path.join(__dirname,'escritorio-admin-candidato-ui.css')));
 app.post('/staging/contas/cadastrar',async(req,res)=>{
  if(!req.is('application/json'))
   return res.status(415).json({erro:'JSON_OBRIGATORIO'});
  const body=req.body;
  if(!body||Array.isArray(body)||typeof body!=='object'||
     Object.keys(body).sort().join(',')!=='aceiteExplicito,email,nick,nome,senha')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  try{
   const conta=await contas.cadastrar({...body,termosVersao,termosTexto});
   // Atribuicao de ensaio recebida somente do gateway confiavel, nunca
   // do formulario do cliente. Sem direito financeiro ou indicacao valida.
   const indicadorNick=req.get('x-akitemm-preview-indicador');
   if(indicadorNick)equipe.registrarCadastro({
    indicadoId:conta.titularId,indicadorNick
   });
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
 // Solicitação anônima: nunca revela se o e-mail pertence a uma conta.
 // Sem provedor configurado, responde indisponível sem simular envio.
 app.post('/staging/contas/recuperar-senha',async(req,res)=>{
  if(!req.is('application/json'))
   return res.status(415).json({erro:'JSON_OBRIGATORIO'});
  if(!req.body||Array.isArray(req.body)||
     Object.keys(req.body).join(',')!=='email')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  try{
   await contas.solicitarRecuperacao({email:req.body.email});
   return res.status(202).json({solicitacaoRecebida:true,
    seEmailExistirCodigoSeraEnviado:true});
  }catch(e){
   if(e.codigo==='RECUPERACAO_EMAIL_INDISPONIVEL')
    return res.status(503).json({erro:e.codigo});
   if(e.codigo==='EMAIL_INVALIDO')
    return res.status(400).json({erro:'EMAIL_INVALIDO'});
   return res.status(503).json({erro:'RECUPERACAO_EMAIL_INDISPONIVEL'});
  }
 });
 app.post('/staging/contas/redefinir-senha',async(req,res)=>{
  if(!req.is('application/json'))
   return res.status(415).json({erro:'JSON_OBRIGATORIO'});
  if(!req.body||Array.isArray(req.body)||
     Object.keys(req.body).sort().join(',')!=='codigo,email,novaSenha')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  try{
   const r=await contas.confirmarRecuperacao(req.body);
   return res.json({...r,pagamentosReais:false});
  }catch(e){
   if(e.codigo==='RECUPERACAO_EMAIL_INDISPONIVEL')
    return res.status(503).json({erro:e.codigo});
   return res.status(400).json({erro:'RECUPERACAO_CODIGO_OU_SENHA_INVALIDOS'});
  }
 });
 app.get('/staging/minha-equipe',(req,res)=>{
  const s=contas.sessao(req);
  if(!s)return res.status(401).json({erro:'SESSAO_AUSENTE'});
  if(Object.keys(req.query).some(k=>k!=='pagina')||
     typeof req.query.pagina==='object')
   return res.status(400).json({erro:'PAGINACAO_INVALIDA'});
  const pagina=req.query.pagina===undefined?0:Number(req.query.pagina);
  try{return res.json(equipe.listar({titularId:s.titularId,pagina}));}
  catch{return res.status(400).json({erro:'PAGINACAO_INVALIDA'});}
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
  app.get('/staging/contas/termos-identidade',(req,res)=>{
   if(!contas.sessao(req))return res.status(401).json({erro:'SESSAO_AUSENTE'});
   res.set('Cache-Control','no-store');
   return res.json({disponivel:true,termosVersao,termosTexto});
  });
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
    repositorio:catalogo,entrada:req.body
   });
   return res.json({...x,apenasEstimativa:true});
  }catch(e){return res.status(400).json({erro:e.codigo||'COTACAO_INVALIDA'});}
 });
 const autorizarOperador=criarAutorizacao({segredo:segredoOperador});
 app.get('/staging/escritorio-unificado/posicoes-historico',autorizarOperador,(req,res)=>{
  res.set('Cache-Control','no-store');
  try{return res.json(projecaoFilas.consultarPagina({cursor:req.query.cursor??null}));}
  catch(e){return res.status(e.codigo==='CURSOR_POSICOES_INVALIDO'?400:503)
   .json({erro:e.codigo||'HISTORICO_POSICOES_INDISPONIVEL'});}
 });
 // Consulta isolada, sem novo evento PSP nem movimento de motor.
 app.get('/staging/escritorio-unificado/projecao-filas',autorizarOperador,(_req,res)=>{
  try{return res.json(projecaoFilas.consultar());}
  catch(e){return res.status(503).json({erro:e.codigo||'PROJECAO_INDISPONIVEL'});}
 });
 app.get('/staging/minha-previa-filas',(req,res)=>{
  const s=contas.sessao(req);
  if(!s)return res.status(401).json({erro:'SESSAO_AUSENTE'});
  try{return res.json(projecaoFilas.consultar({titularId:s.titularId}));}
  catch(e){return res.status(503).json({erro:e.codigo||'PROJECAO_INDISPONIVEL'});}
 });
 const sinalizacaoVitrine=createVitrineCandidata({app,banco,catalogo,contas,intencoes,prePedidos,autorizarOperador});
 const preAdesao=new PreAdesaoSandboxCandidatoSQLite({
  banco,posicoes,sinalizacao:sinalizacaoVitrine,cpf,termosVersao
 });
 const diagnosticoAtivacao=new DiagnosticoAtivacaoCandidato({banco,preAdesao,cpf,contas});
 const projecaoFilas=new ProjecaoFilasCandidatoSandbox({
  banco,posicoes,sinalizacao:sinalizacaoVitrine,preAdesao
 });
 // O MESMO SQLITE guarda identidade, pre-pedidos e snapshot do motor V6.
 // A sessao autentica so pode ler sua parte do tabuleiro.
 // Escritas manuais de ENSAIO exigem operador: webhook bruto ou pre-pedido
 // nao constituem evento ou ativacao comercial.
 const motorConta=new MotorContaUnicaEnsaioSQLite({banco,sinalizacao:sinalizacaoVitrine});
 app.get('/staging/motor/estado',(req,res)=>{
  const s=contas.sessao(req);
  if(!s)return res.status(401).json({erro:'SESSAO_AUSENTE'});
  try{return res.json(motorConta.consultar({titularId:s.titularId}));}
  catch(e){return res.status(503).json({erro:e.codigo||'MOTOR_ENSAIO_INDISPONIVEL'});}
 });
 app.get('/staging/escritorio-unificado/motor/estado',autorizarOperador,(_req,res)=>{
  try{return res.json(motorConta.consultar());}
  catch(e){return res.status(503).json({erro:e.codigo||'MOTOR_ENSAIO_INDISPONIVEL'});}
 });
 app.post('/staging/escritorio-unificado/motor/vincular-pedido',autorizarOperador,(req,res)=>{
  if(!req.is('application/json')||!req.body||Array.isArray(req.body)||
     Object.keys(req.body).sort().join(',')!=='aceiteEnsaio,prepedidoId')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  try{
   const r=motorConta.vincularPedido(req.body);
   return res.status(r.repetido?200:201).json(r);
  }catch(e){
   const codigo=e.codigo||'MOTOR_ENSAIO_INDISPONIVEL';
   return res.status(codigo==='LIMITE_DEZ_POSICOES_MOTOR_ENSAIO'?409:400)
    .json({erro:codigo});
  }
 });
 app.post('/staging/escritorio-unificado/motor/preparar',autorizarOperador,(req,res)=>{
  if(!req.is('application/json')||!req.body||Array.isArray(req.body)||
     Object.keys(req.body).length!==0)
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  try{return res.json(motorConta.prepararTabuleiro());}
  catch(e){return res.status(409).json({erro:e.codigo||'MOTOR_ENSAIO_INDISPONIVEL'});}
 });
 app.post('/staging/escritorio-unificado/motor/evento',autorizarOperador,(req,res)=>{
  if(!req.is('application/json')||!req.body||Array.isArray(req.body)||
     Object.keys(req.body).join(',')!=='prepedidoId')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  try{return res.json(motorConta.registrarEvento(req.body));}
  catch(e){return res.status(409).json({erro:e.codigo||'MOTOR_ENSAIO_INDISPONIVEL'});}
 });
 app.post('/staging/escritorio-unificado/motor/catraca',autorizarOperador,(req,res)=>{
  if(!req.is('application/json')||!req.body||Array.isArray(req.body)||
     Object.keys(req.body).join(',')!=='acao')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  try{return res.json(motorConta.controlarCatraca(req.body.acao));}
  catch(e){return res.status(409).json({erro:e.codigo||'MOTOR_ENSAIO_INDISPONIVEL'});}
 });

 // Porta única de leitura para o check-list de ativação definitiva.
 // Nenhum dos dois endpoints chama um motor de escrita.
 app.get('/staging/escritorio-unificado/diagnostico-ativacao/:id',
  autorizarOperador,(req,res)=>{
   try{
    const d=diagnosticoAtivacao.avaliar({prepedidoId:req.params.id});
    res.set('Cache-Control','no-store');
    return d?res.json(d):res.status(404).json({erro:'PREPEDIDO_NAO_ENCONTRADO'});
   }catch(e){return res.status(400).json({erro:e.codigo||'DIAGNOSTICO_INVALIDO'});}
  });
 app.get('/staging/meu-diagnostico-ativacao/:id',(req,res)=>{
  const s=contas.sessao(req);
  if(!s)return res.status(401).json({erro:'SESSAO_AUSENTE'});
  try{
   const d=diagnosticoAtivacao.avaliar({
    prepedidoId:req.params.id,titularId:s.titularId
   });
   res.set('Cache-Control','no-store');
   return d?res.json(d):res.status(404).json({erro:'PREPEDIDO_NAO_ENCONTRADO'});
  }catch(e){return res.status(400).json({erro:e.codigo||'DIAGNOSTICO_INVALIDO'});}
 });
 // Pré-adesão de ensaio NÃO ativa posições, apenas registra um checkpoint
 // persistido, verificando de novo PSP, oferta histórica, CPF e termos LAB.
 app.get('/staging/escritorio-unificado/pre-adesao/:id',
  autorizarOperador,(req,res)=>{
   if(!operacoesSandboxAutorizadas)
    return res.status(403).json({erro:'OPERACAO_SANDBOX_DESATIVADA'});
   try{
    const r=preAdesao.avaliar({prepedidoId:req.params.id});
    return r?res.json(r):res.status(404).json({erro:'PREPEDIDO_NAO_ENCONTRADO'});
   }catch(e){
    return res.status(400).json({erro:e.codigo||'PRE_ADESAO_INDISPONIVEL'});
   }
  });
 app.post('/staging/escritorio-unificado/preparar-pre-adesao',
  autorizarOperador,(req,res)=>{
   if(!operacoesSandboxAutorizadas)
    return res.status(403).json({erro:'OPERACAO_SANDBOX_DESATIVADA'});
   if(!req.is('application/json')||!req.body||Array.isArray(req.body)||
      Object.keys(req.body).join(',')!=='prepedidoId')
    return res.status(400).json({erro:'PREPEDIDO_INVALIDO'});
   try{
    const r=preAdesao.registrar({prepedidoId:req.body.prepedidoId,
     autorizado:true});
    return res.status(r.repetido?200:201).json(r);
   }catch(e){
    if(e.codigo==='PREPEDIDO_NAO_ENCONTRADO')return res.status(404)
     .json({erro:e.codigo});
    if(e.codigo?.startsWith('PRE_ADESAO_BLOQUEADA_'))
     return res.status(409).json({erro:e.codigo});
    return res.status(400).json({erro:e.codigo||'PRE_ADESAO_INDISPONIVEL'});
   }
  });
 app.get('/staging/minhas-pre-adesoes',(req,res)=>{
  const s=contas.sessao(req);
  if(!s)return res.status(401).json({erro:'SESSAO_AUSENTE'});
  try{return res.json(preAdesao.listarTitular(s.titularId));}
  catch(e){return res.status(503).json({erro:e.codigo||'CONSULTA_INDISPONIVEL'});}
 });
 // O catálogo do cliente usa EXATAMENTE a mesma fonte da cotação.
 app.get('/staging/catalogo',async(_req,res)=>{
  try{return res.json(await catalogo.publicos());}
  catch{return res.status(503).json({erro:'CATALOGO_INDISPONIVEL'});}
 });
 // Campos de catálogo aplicam-se apenas às próximas cotações e rascunhos.
 // Pedidos anteriores preservam a fotografia; produção não é montada.
 app.get('/staging/escritorio-unificado/produtos',autorizarOperador,async(req,res)=>{
  try{
   if(Object.keys(req.query).some(k=>k!=='pagina')||
      Object.values(req.query).some(v=>typeof v!=='string'))
    return res.status(400).json({erro:'PAGINACAO_INVALIDA'});
   const pagina=req.query.pagina===undefined?0:Number(req.query.pagina);
   return res.json(await catalogo.listarRegistros({pagina}));
  }catch(e){return res.status(400).json({erro:e.codigo||'CONSULTA_CATALOGO_INVALIDA'});}
 });
 app.get('/staging/escritorio-unificado/produtos/:id',autorizarOperador,async(req,res)=>{
  try{
   const p=await catalogo.buscarRegistro(req.params.id);
   return p?res.json(p):res.status(404).json({erro:'PRODUTO_NAO_ENCONTRADO'});
  }catch(e){return res.status(400).json({erro:e.codigo||'ID_PRODUTO_INVALIDO'});}
 });
 app.post('/staging/escritorio-unificado/produtos',autorizarOperador,async(req,res)=>{
  if(!req.body||Array.isArray(req.body)||
     Object.keys(req.body).join(',')!=='produto')
   return res.status(400).json({erro:'PRODUTO_INVALIDO'});
  try{
   const p=await catalogo.criar({
    produto:req.body.produto,chaveIdempotencia:req.get('idempotency-key')
   });
   return res.status(p.repetida?200:201).json(p);
  }catch(e){
   return res.status(['PRODUTO_JA_EXISTE','CONFLITO_IDEMPOTENCIA'].includes(e.codigo)?409:400)
    .json({erro:e.codigo||'PRODUTO_INVALIDO'});
  }
 });
 app.patch('/staging/escritorio-unificado/produtos/:id',autorizarOperador,async(req,res)=>{
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
     Object.keys(req.body).sort().join(',')!=='alteracoes,revisaoEsperada')
   return res.status(400).json({erro:'CAMPOS_PRODUTO_INVALIDOS'});
  try{
   const p=await catalogo.alterar({id:req.params.id,...req.body});
   return res.json(p);
  }catch(e){
   return res.status(e.codigo==='CONFLITO_REVISAO'?409:
    e.codigo==='PRODUTO_NAO_ENCONTRADO'?404:400)
    .json({erro:e.codigo||'PRODUTO_INVALIDO'});
  }
 });
 app.get('/staging/escritorio-unificado/produtos/:id/historico',autorizarOperador,(req,res)=>{
  try{return res.json({historico:catalogo.historico(req.params.id)});}
  catch(e){return res.status(400).json({erro:e.codigo||'HISTORICO_INVALIDO'});}
 });
 // Missões manuais nunca alteram pagamentos, saldos ou tabuleiros.
 app.get('/staging/escritorio-unificado/missoes',autorizarOperador,(req,res)=>{
  try{
   const q=req.query;
   if(Object.keys(q).some(k=>!['departamento','situacao','pagina'].includes(k))||
      Object.values(q).some(v=>typeof v!=='string'))
    return res.status(400).json({erro:'FILTRO_INVALIDO'});
   return res.json(missoes.listar({departamento:q.departamento||null,
    situacao:q.situacao||null,pagina:q.pagina===undefined?0:Number(q.pagina)}));
  }catch(e){return res.status(400).json({erro:e.codigo||'FILTRO_INVALIDO'});}
 });
 app.get('/staging/escritorio-unificado/departamentos',autorizarOperador,async(_req,res)=>{
  try{return res.json(await departamentosAdmin.painel());}
  catch{return res.status(503).json({erro:'PAINEL_DEPARTAMENTOS_INDISPONIVEL'});}
 });
 app.get('/staging/escritorio-unificado/alertas',autorizarOperador,(req,res)=>{
  try{
   const q=req.query;
   if(Object.keys(q).some(k=>k!=='pagina')||
      Object.values(q).some(v=>typeof v!=='string'))
    return res.status(400).json({erro:'PAGINACAO_INVALIDA'});
   return res.json(departamentosAdmin.revisar({
    pagina:q.pagina===undefined?0:Number(q.pagina)}));
  }catch(e){return res.status(400).json({erro:e.codigo||'PAGINACAO_INVALIDA'});}
 });
 app.post('/staging/escritorio-unificado/alertas/:prepedidoId/abrir-missao',
  autorizarOperador,(req,res)=>{
   if(!req.body||Array.isArray(req.body)||
      Object.keys(req.body).length!==0)
    return res.status(400).json({erro:'CORPO_INVALIDO'});
   try{
    const m=departamentosAdmin.abrirRevisao({
     prepedidoId:req.params.prepedidoId});
    return res.status(m.repetida?200:201).json(m);
   }catch(e){
    return res.status(e.codigo==='PEDIDO_INEXISTENTE'?404:
     e.codigo==='SEM_ALERTA_PSP'||e.codigo==='CONFLITO_IDEMPOTENCIA'?409:400)
     .json({erro:e.codigo||'MISSAO_ALERTA_INVALIDA'});
   }
  });
 app.post('/staging/escritorio-unificado/missoes',autorizarOperador,(req,res)=>{
  try{const m=missoes.criar(req.body,req.get('idempotency-key'));
   return res.status(m.repetida?200:201).json(m);
  }catch(e){return res.status(e.codigo==='CONFLITO_IDEMPOTENCIA'?409:
   e.codigo==='PEDIDO_INEXISTENTE'?404:400).json({erro:e.codigo||'MISSAO_INVALIDA'});}
 });
 app.patch('/staging/escritorio-unificado/missoes/:id',autorizarOperador,(req,res)=>{
  try{return res.json(missoes.atualizar(req.params.id,req.body));}
  catch(e){return res.status(e.codigo==='MISSAO_INEXISTENTE'?404:
    ['CONFLITO_REVISAO','TRANSICAO_PROIBIDA'].includes(e.codigo)?409:400)
    .json({erro:e.codigo||'MISSAO_INVALIDA'});}
 });
 app.get('/staging/escritorio-unificado/missoes/:id/historico',autorizarOperador,(req,res)=>{
  try{return res.json({historico:missoes.historico(req.params.id)});}
  catch(e){return res.status(e.codigo==='MISSAO_INEXISTENTE'?404:400)
   .json({erro:e.codigo||'MISSAO_INVALIDA'});}
 });
 app.get('/staging/meus-comunicados',(req,res)=>{
  const s=sessao(req);
  if(!s)return res.status(401).json({erro:'SESSAO_AUSENTE'});
  try{return res.json({comunicados:missoes.comunicados(s.titularId),
   laboratorio:true,pagamentosReais:false});}
  catch{return res.status(503).json({erro:'COMUNICADOS_INDISPONIVEIS'});}
 });
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
  repositorioCatalogo:catalogo,intencoes,identificarTitular:titular,
  autorizarMutacao:autorizacao
 }));
 app.use('/staging',criarRouterPrePedidosCheckoutStaging({
  repositorioCatalogo:catalogo,prePedidos,identificarTitular:titular,
  autorizarMutacao:autorizacao,ponteAsaasSandbox:ponte,
  consultarEntregaSimulada:args=>entregas.consultar(args),
  consultarPosicaoPendente:posicoes?args=>posicoes.consultar(args):null
 }));
 app.use((_req,res)=>res.status(404).json({erro:'ROTA_INEXISTENTE'}));
 app.use((_err,_req,res,_next)=>res.status(503).json({
  erro:'CANDIDATO_INDISPONIVEL',financeiroReal:false
 }));
 return {app,contas,cpf,provasEmail,intencoes,prePedidos,ponte,
  inbox,worker,posicoes,projecaoFilas,preAdesao,diagnosticoAtivacao,entregas,integridade,missoes,catalogo,sinalizacaoVitrine,departamentosAdmin,equipe,motorConta,banco};
}
module.exports={criarAppLojaEscritorioCandidato};
