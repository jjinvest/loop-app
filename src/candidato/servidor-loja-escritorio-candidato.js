'use strict';
// CANDIDATO LOCAL para uma conta de loja e Escritorio: mesmo titular
// no SQLite, cadastro/login, rascunho e Meus Pedidos. Nada financeiro real.
// NUNCA montar em src/server.js; nao expor em Railway publico.
const express=require('express');
const path=require('node:path');
const {createHash}=require('node:crypto');
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
const {auditarIntegridadeMotorCandidato}=
 require('../domain/auditoria-integridade-motor-candidato-sqlite');
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
const {auditarCarteiraDePedidosAkitemmLab}=require('../domain/auditoria-cobertura-lotes-akitemm');
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
 operacoesSandboxAutorizadas=false,conciliacaoAutomaticaConfigurada=false,
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
 // Entrada autentica de webhook no MESMO banco do pedido e do motor.
 // Declarada ANTES do parser JSON para verificar bytes originais do Asaas.
 // Nenhum aviso bruto gera posicoes, comissao, giro ou saldo.
 app.post('/staging/asaas/webhook-unificado',
  express.raw({type:'application/json',inflate:false,limit:'16kb'}),
  (req,res)=>{
   if(!operacoesSandboxAutorizadas||!inbox)
    return res.status(404).json({erro:'WEBHOOK_SANDBOX_INATIVO'});
   if(!req.is('application/json')||!Buffer.isBuffer(req.body))
    return res.status(415).json({erro:'WEBHOOK_JSON_OBRIGATORIO'});
   try{
    const r=inbox.registrar({
     cabecalhoToken:req.get('asaas-access-token'),corpoBruto:req.body
    });
    return res.json({eventoRegistrado:r.registrado===true,
     repetido:r.repetido===true,pendenteReconsulta:r.pendenteReconsulta===true,
     precisaConciliarNoMesmoBanco:true,financasReais:false,
     posicoesCriadas:0});
   }catch(e){
    const codigo=e.codigo||'WEBHOOK_INDETERMINADO';
    return res.status(['TOKEN_WEBHOOK_INVALIDO',
     'TOKEN_SANDBOX_NAO_CONFIGURADO'].includes(codigo)?401:
     ['CORPO_WEBHOOK_INVALIDO','EVENTO_ASAAS_SANDBOX_NAO_VALIDO',
      'VALOR_WEBHOOK_INVALIDO'].includes(codigo)?400:409)
     .json({erro:codigo==='TOKEN_WEBHOOK_INVALIDO'?'TOKEN_INVALIDO':
      codigo==='TOKEN_SANDBOX_NAO_CONFIGURADO'?'TOKEN_INVALIDO':
      codigo==='WEBHOOK_INDETERMINADO'?'WEBHOOK_REQUER_REVISAO':codigo});
   }
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
   const motor=auditarIntegridadeMotorCandidato({
    banco,exigirMotor:true
   });
   if(check?.quick_check!=='ok'||fks>0||
      motor.totalInconsistencias!==0||
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
 // Publico sob o gateway de homologacao; uma conta nova ve o texto
 // exato e a impressao SHA-256 que o backend guardara no cadastro.
 const termosHashCadastro=createHash('sha256')
  .update(termosTexto,'utf8').digest('hex');
 app.get('/staging/contas/termos-cadastro',(_req,res)=>res.json({
  termosVersao,termosTexto,termosHash:termosHashCadastro,
  somenteEnsaio:true,cadastroRealHabilitado:false
 }));
 app.post('/staging/contas/cadastrar',async(req,res)=>{
  if(!req.is('application/json'))
   return res.status(415).json({erro:'JSON_OBRIGATORIO'});
  const body=req.body;
  if(!body||Array.isArray(body)||typeof body!=='object')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  // Compatibilidade exclusiva com os ensaios legados sem snapshot.
  // A interface nova envia ambas as evidencias de leitura e aceita
  // somente a versao exata apresentada antes de preencher o formulario.
  const chaves=Object.keys(body).sort().join(',');
  const antiga='aceiteExplicito,email,nick,nome,senha';
  const atual='aceiteExplicito,email,nick,nome,senha,termosHashAceito,termosVersaoAceita';
  if(chaves!==antiga&&chaves!==atual)
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  if(chaves===atual&&(body.termosVersaoAceita!==termosVersao||
     body.termosHashAceito!==termosHashCadastro))
   return res.status(409).json({erro:'TERMOS_ALTERADOS_RELER'});
  try{
   // Recebida apenas do gateway assinado. Criacao da conta + vinculo
   // de indicacao ocorrem no MESMO COMMIT, nunca apos confirmar cadastro.
   const indicadorNick=req.get('x-akitemm-preview-indicador');
   const conta=await contas.cadastrar({
    nome:body.nome,nick:body.nick,email:body.email,
    senha:body.senha,aceiteExplicito:body.aceiteExplicito,
    termosVersao,termosTexto,
    onCriada:indicadorNick?({titularId})=>{
     const vinculo=equipe.registrarCadastro({
      indicadoId:titularId,indicadorNick
     });
     if(vinculo.registrado!==true){
      const e=new Error('INDICACAO_ORIGEM_NAO_CONFIRMADA');
      e.codigo='INDICACAO_ORIGEM_NAO_CONFIRMADA';
      throw e;
     }
    }:null
   });
   return res.status(201).json(conta);
  }catch(e){
   if(e.codigo==='CADASTRO_JA_EXISTENTE')
    return res.status(409).json({erro:'CADASTRO_JA_EXISTENTE'});
   if(e.codigo==='INDICACAO_ORIGEM_NAO_CONFIRMADA')
    return res.status(409).json({erro:e.codigo});
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
   if(e.codigo==='AUTENTICACAO_TEMPORARIAMENTE_OCUPADA')
    return res.status(429).json({erro:e.codigo});
   if(e.codigo==='CONTA_TEMPORARIAMENTE_BLOQUEADA')
    return res.status(429).json({erro:e.codigo});
   return res.status(401).json({erro:'CREDENCIAIS_INVALIDAS'});
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
   if(e.codigo==='AUTENTICACAO_TEMPORARIAMENTE_OCUPADA')
    return res.status(429).json({erro:e.codigo});
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
 // Qualificacao de ensaio: somente o titular logado aloca a uma posicao
 // propria confirmada. Compra do indicado exige PSP Sandbox reconsultado.
 // Nenhuma comissao ou saldo real decorre da operacao.
 app.post('/staging/minha-equipe/indicacoes/qualificar-ensaio',(req,res)=>{
  const s=contas.sessao(req);
  if(!s)return res.status(401).json({erro:'SESSAO_AUSENTE'});
  if(!contas.autorizarMutacao(req))
   return res.status(403).json({erro:'CSRF_INVALIDO'});
  if(!operacoesSandboxAutorizadas)
   return res.status(403).json({erro:'OPERACAO_SANDBOX_DESATIVADA'});
  if(!req.is('application/json')||!req.body||Array.isArray(req.body)||
     Object.keys(req.body).sort().join(',')!=='indicadoId,posicaoAlvoId')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  try{
   const r=motorConta.qualificarIndicacaoEnsaio({
    indicadorId:s.titularId,indicadoId:req.body.indicadoId,
    posicaoAlvoId:req.body.posicaoAlvoId
   });
   return res.status(r.repetido?200:201).json(r);
  }catch(e){
   const codigo=e.codigo||'INDICACAO_NAO_QUALIFICADA';
   return res.status(codigo==='INDICACAO_DADOS_INVALIDOS'?400:409)
    .json({erro:codigo});
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
 const motorConta=new MotorContaUnicaEnsaioSQLite({
  banco,sinalizacao:sinalizacaoVitrine,ponte,cpf,termosVersao
 });
 // Checkpoint duravel da aplicacao de estornos no motor: o GET PSP pode
 // concluir antes de a catraca/posicao ser suspensa. Reinicio retoma.
 if(worker)banco.exec([
  'CREATE TABLE IF NOT EXISTS akitemm_motor_reversoes_psp_checkpoint(',
  'evento_id TEXT PRIMARY KEY REFERENCES',
  'akitemm_prepedido_webhook_inbox_staging(evento_id) ON DELETE RESTRICT,',
  "estado TEXT NOT NULL CHECK(estado IN ('PENDENTE','CONCLUIDO','EXIGE_REVISAO')),",
  'atualizado_em TEXT NOT NULL);'
 ].join(' '));
 // Indica exatamente a capacidade operacional: testes do motor nao
 // significam que credenciais Asaas estejam presentes na previa Railway.
 app.get('/staging/escritorio-unificado/sandbox-pix/estado',
  autorizarOperador,(_req,res)=>res.json({
   status:operacoesSandboxAutorizadas&&Boolean(worker)?
    'INTEGRADO_SANDBOX_NO_MESMO_SQLITE':'AGUARDANDO_CREDENCIAIS_SANDBOX_NA_PREVIA',
   servicosExigemBancoCompartilhado:false,
   usaSQLiteDaLoja:ponte.banco===banco,
   webhookIngressAtivo:Boolean(inbox)&&operacoesSandboxAutorizadas,
   consultarPSPDisponivel:Boolean(worker)&&operacoesSandboxAutorizadas,
   conciliacaoAutomaticaConfigurada:operacoesSandboxAutorizadas&&
    Boolean(worker)&&conciliacaoAutomaticaConfigurada===true,
   saquesReaisHabilitados:false,checkoutComercialHabilitado:false
  }));

 app.get('/staging/motor/estado',(req,res)=>{
  const s=contas.sessao(req);
  if(!s)return res.status(401).json({erro:'SESSAO_AUSENTE'});
  try{return res.json(motorConta.consultar({titularId:s.titularId}));}
  catch(e){return res.status(503).json({erro:e.codigo||'MOTOR_ENSAIO_INDISPONIVEL'});}
 });
 // Aceite explícito, INDIVIDUAL e autenticado do próprio titular.
 // Nunca há CPF no corpo/retorno: o cadastro cifrado da conta é reutilizado.
 app.post('/staging/motor/posicoes/confirmar-ensaio',(req,res)=>{
  const s=contas.sessao(req);
  if(!s)return res.status(401).json({erro:'SESSAO_AUSENTE'});
  if(!contas.autorizarMutacao(req))
   return res.status(403).json({erro:'CSRF_INVALIDO'});
  if(!req.is('application/json')||!req.body||Array.isArray(req.body)||
     Object.keys(req.body).sort().join(',')!=='aceiteExplicito,posicaoId,versaoTermos')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  try{
   const resultado=motorConta.registrarAceitePosicaoEnsaio({
    titularId:s.titularId,posicaoId:req.body.posicaoId,
    aceiteExplicito:req.body.aceiteExplicito,
    versaoTermos:req.body.versaoTermos
   });
   return res.status(resultado.repetido?200:201).json(resultado);
  }catch(e){
   const codigo=e.codigo||'ACEITE_POSICAO_ENSAIO_INDISPONIVEL';
   return res.status(codigo==='POSICAO_NAO_PERTENCE_A_CONTA'?404:
    codigo==='ACEITE_POSICAO_DADOS_INVALIDOS'?400:409).json({erro:codigo});
  }
 });
 // Prova REMOTA independente de credencial: apenas GET de uma pagina vazia/limitada.
 // Nenhum POST de cobranca, nenhuma exposicao de pagamento ou API key.
 app.get('/staging/escritorio-unificado/sandbox-pix/provar-acesso-remoto',
  autorizarOperador,async(_req,res)=>{
   if(!operacoesSandboxAutorizadas||
      typeof provedorReconsultaSandbox?.testarAcessoRemoto!=='function')
    return res.status(503).json({erro:'PROVA_REMOTA_SANDBOX_INDISPONIVEL'});
   try{
    const prova=await provedorReconsultaSandbox.testarAcessoRemoto();
    if(prova?.pspRemotoRespondeu!==true||
       prova?.ambiente!=='ASAAS_SANDBOX_EXCLUSIVO')
     return res.status(503).json({erro:'PROVA_REMOTA_SANDBOX_INCONCLUSIVA'});
    return res.json({status:'ASAAS_SANDBOX_GET_REMOTO_COMPROVADO',
     pspRemotoVerificado:true,webhookExternoComprovado:false,
     cobrancasCriadas:0,financeiroReal:false,marcoZeroAprovado:false});
   }catch(e){
    const codigo=typeof e?.codigo==='string'&&
     /^ASAAS_SANDBOX_(?:HTTP_[0-9]{3}|REDE_INCONCLUSIVA|RESPOSTA_INVALIDA|PROVA_RESPOSTA_INVALIDA)$/.test(e.codigo)?
     e.codigo:'PROVA_REMOTA_SANDBOX_INCONCLUSIVA';
    return res.status(503).json({erro:codigo});
   }
  });
 // Evidencia objetiva de cobertura BRUTA por lote, sem jamais declarar
 // custos como conferidos ou dinheiro de Sandbox como banco liquidado.
 // O estado do backup é prova de verificação do objeto externo,
 // não de existência de um bucket, e não expõe chaves ou identificadores.
 app.get('/staging/escritorio-unificado/backup-offsite/estado',
  autorizarOperador,(_req,res)=>{
   const backup=app.locals.backupOffsite||null;
   return res.json(backup?{
    ...backup.estado(),componente:'SQLITE_UNICO_LOJA_ASAAS_MOTOR',
    bucketConfigurado:true,backupRailwayComprovado:
     backup.estado().copiasVerificadasNoProcesso>0
   }:{
    estado:'BACKUP_OFFSITE_NAO_HABILITADO_NESTE_SERVICO',
    componente:'SQLITE_UNICO_LOJA_ASAAS_MOTOR',
    bucketConfigurado:false,backupRailwayComprovado:false,
    recuperacaoExternaComprovada:false,
    marcoZeroAprovado:false
   });
  });
 app.get('/staging/escritorio-unificado/auditoria-cobertura',
  autorizarOperador,(req,res)=>{
   if(Object.keys(req.query).some(k=>!['limite','offset'].includes(k))||
      ['limite','offset'].some(k=>
       req.query[k]!==undefined&&
       (typeof req.query[k]!=='string'||!/^(0|[1-9][0-9]*)$/.test(req.query[k]))))
    return res.status(400).json({erro:'FILTRO_AUDITORIA_INVALIDO'});
   const limite=req.query.limite===undefined?50:Number(req.query.limite);
   const offset=req.query.offset===undefined?0:Number(req.query.offset);
   try{
    return res.json(auditarCarteiraDePedidosAkitemmLab({
     banco,sinalizacao:sinalizacaoVitrine,limite,offset
    }));
   }catch(e){
    return res.status(['LIMITE_AUDITORIA_INVALIDO','PAGINA_AUDITORIA_INVALIDA'].includes(e.codigo)?400:503)
     .json({erro:e.codigo||'AUDITORIA_INDISPONIVEL'});
   }
  });
 app.get('/staging/escritorio-unificado/motor/estado',autorizarOperador,(_req,res)=>{
  try{return res.json(motorConta.consultar());}
  catch(e){return res.status(503).json({erro:e.codigo||'MOTOR_ENSAIO_INDISPONIVEL'});}
 });
 // Apenas operador: editar tinta/texto de dourada, NUNCA a identidade no motor.
 app.post('/staging/escritorio-unificado/motor/douradas/visual',autorizarOperador,(req,res)=>{
  res.set('Cache-Control','no-store');
  if(!req.is('application/json')||!req.body||
     typeof req.body!=='object'||Array.isArray(req.body)||
     Object.keys(req.body).sort().join(',')!=='nomeVisual,numeroVisual,posicaoId')
   return res.status(400).json({erro:'DOURADA_VISUAL_DADOS_INVALIDOS'});
  try{return res.json(motorConta.definirVisualDourada(req.body));}
  catch(e){
   const codigo=e.codigo||'DOURADA_VISUAL_INDISPONIVEL';
   return res.status(codigo==='DOURADA_VISUAL_DADOS_INVALIDOS'?400:
    codigo==='DOURADA_VISUAL_POSICAO_NAO_ELEGIVEL'?409:503)
    .json({erro:codigo});
  }
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
 // Recuperação idempotente após PSP confirmado e eventual falha temporária
 // do vínculo. Nunca cria posição sem reconsulta RECEIVED válida.
 app.post('/staging/escritorio-unificado/motor/conciliar-pedido-sandbox',
  autorizarOperador,(req,res)=>{
   if(!operacoesSandboxAutorizadas)
    return res.status(403).json({erro:'OPERACAO_SANDBOX_DESATIVADA'});
   if(!req.is('application/json')||!req.body||Array.isArray(req.body)||
      Object.keys(req.body).join(',')!=='prepedidoId')
    return res.status(400).json({erro:'PREPEDIDO_INVALIDO'});
   try{
    const m=motorConta.vincularPedidoConferidoSandbox(req.body);
    return res.status(m.repetido?200:201).json(m);
   }catch(e){
    return res.status(e.codigo==='LIMITE_DEZ_POSICOES_MOTOR_ENSAIO'?409:400)
     .json({erro:e.codigo||'CONCILIACAO_MOTOR_NAO_CONCLUIDA'});
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
 // Agenda usa o MESMO motor de ensaio. Configuracao padrao 09h-18h
 // America/Sao_Paulo, 10 min, excecao ate 21h opcional por data.
 // Nenhum timer gera compra: ele so contabiliza PSP ja confirmado.
 app.get('/staging/escritorio-unificado/motor/agenda',autorizarOperador,(_req,res)=>{
  try{return res.json(motorConta.consultarAgenda());}
  catch(e){return res.status(503).json({erro:e.codigo||'AGENDA_INDISPONIVEL'});}
 });
 app.post('/staging/escritorio-unificado/motor/agenda',autorizarOperador,(req,res)=>{
  if(!req.is('application/json')||!req.body||Array.isArray(req.body)||
     Object.keys(req.body).sort().join(',')!==
     'abertura,ativo,excecaoData,excecaoFechamento,fechamento,intervaloMinutos,metaDataAlvo,metaQuantidade,modoExecucao')
   return res.status(400).json({erro:'AGENDA_CAMPOS_INVALIDOS'});
  try{
   const r=motorConta.configurarAgenda(req.body);
   return res.json(r);
  }catch(e){return res.status(409).json({
   erro:e.codigo||'AGENDA_CONFIG_INVALIDA'
  });}
 });
 // Liberacao voluntaria de N posicoes centrais de ENSAIO:
 // cada uma so conclui com 6 compras PSP confirmadas/reconsultadas.
 // A fila e a loja nao sao afetadas se nao existir estoque suficiente.
 app.post('/staging/escritorio-unificado/motor/liberar-lote',autorizarOperador,(req,res)=>{
  if(!req.is('application/json')||!req.body||Array.isArray(req.body)||
     Object.keys(req.body).join(',')!=='quantidade')
   return res.status(400).json({erro:'LOTE_CATRACA_CAMPOS_INVALIDOS'});
  try{return res.json(motorConta.liberarLoteEnsaio(req.body));}
  catch(e){return res.status(409).json({erro:e.codigo||'LOTE_CATRACA_BLOQUEADO'});}
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
 // Defasagem observavel: PSP confirmado e persistido, mas o lote
 // ainda nao tem operacao de vinculo no motor do mesmo SQLite.
 function contarVinculosMotorAusentes(){
  if(!worker)return 0;
  return banco.prepare([
   'SELECT COUNT(*) AS n',
   'FROM akitemm_prepedido_webhook_inbox_staging i',
   'JOIN akitemm_prepedido_webhook_reconsulta_staging r',
   'ON r.evento_id=i.evento_id',
   "WHERE r.estado='CONCLUIDO' AND r.codigo='PSP_RECONSULTADO'",
   "AND i.tipo='PAYMENT_RECEIVED'",
   'AND NOT EXISTS (SELECT 1 FROM akitemm_prepedido_asaas_reserva_posicoes_staging v',
   'WHERE v.prepedido_id=i.prepedido_id AND v.posicoes_reservadas=0)',
   'AND EXISTS (SELECT 1 FROM akitemm_prepedido_asaas_sandbox_staging p',
   "WHERE p.prepedido_id=i.prepedido_id AND p.estado='RECEBIMENTO_INFORMADO_SANDBOX')",
   'AND NOT EXISTS (SELECT 1 FROM akitemm_motor_conta_ensaio_operacoes m',
   "WHERE m.prepedido_id=i.prepedido_id AND m.tipo='VINCULAR_PEDIDO')"
  ].join(' ')).get().n;
 }
 function contarReversoesMotorPendentes(){
  if(!worker)return 0;
  return banco.prepare([
   'SELECT COUNT(*) AS n',
   'FROM akitemm_prepedido_webhook_inbox_staging i',
   'JOIN akitemm_prepedido_webhook_reconsulta_staging r',
   'ON r.evento_id=i.evento_id',
   'JOIN akitemm_prepedido_asaas_sandbox_staging p',
   'ON p.prepedido_id=i.prepedido_id',
   'LEFT JOIN akitemm_motor_reversoes_psp_checkpoint c',
   'ON c.evento_id=i.evento_id',
   "WHERE r.estado IN ('CONCLUIDO','EXIGE_REVISAO')",
   "AND i.tipo IN ('PAYMENT_REFUNDED','PAYMENT_PARTIALLY_REFUNDED',",
   "'PAYMENT_REFUND_IN_PROGRESS','PAYMENT_CHARGEBACK_REQUESTED',",
   "'PAYMENT_CHARGEBACK_DISPUTE','PAYMENT_DELETED')",
   "AND p.estado='REVERSAO_INFORMADA_SANDBOX'",
   "AND (c.estado IS NULL OR c.estado<>'CONCLUIDO')"
  ].join(' ')).get().n;
 }
 // Indicadores operacionais de recuperacao, sem dados pessoais,
 // valores, payloads ou IDs do PSP. Alimentam o painel real do admin.
 function statusRecuperacaoPSP(){
  if(!worker)return {processando:0,retomaveis:0,segundaFalha:0};
  const n=banco.prepare([
   'SELECT',
   "SUM(CASE WHEN estado='PROCESSANDO' THEN 1 ELSE 0 END) AS processando,",
   "SUM(CASE WHEN estado='EXIGE_REVISAO'",
   "AND codigo='PROCESSAMENTO_INTERROMPIDO_REVISAR'",
   "THEN 1 ELSE 0 END) AS retomaveis,",
   "SUM(CASE WHEN estado='EXIGE_REVISAO'",
   "AND codigo='RETOMADA_REINTERROMPIDA_EXIGE_REVISAO'",
   'THEN 1 ELSE 0 END) AS segundaFalha',
   'FROM akitemm_prepedido_webhook_reconsulta_staging'
  ].join(' ')).get();
  return {processando:n?.processando||0,
   retomaveis:n?.retomaveis||0,segundaFalha:n?.segundaFalha||0};
 }
 function atualizarCheckpointReversao(eventoId,estado){
  banco.prepare([
   'INSERT INTO akitemm_motor_reversoes_psp_checkpoint',
   '(evento_id,estado,atualizado_em) VALUES(?,?,?)',
   'ON CONFLICT(evento_id) DO UPDATE SET',
   'estado=excluded.estado,atualizado_em=excluded.atualizado_em',
   "WHERE akitemm_motor_reversoes_psp_checkpoint.estado<>'CONCLUIDO'"
  ].join(' ')).run(eventoId,estado,new Date().toISOString());
 }
 let executarConciliacaoSandbox=null;
if(worker){
  // Uma cobranca PIX do SANDBOX precisa usar o MESMO prepedido e titular
  // do Escritorio, fotografia historica, cobertura bruta e limite atual.
  // Nao se gera QR Pix real ou creditos comercialmente sacaveis.
  app.post('/staging/escritorio-unificado/sandbox-pix/preparar',
   autorizarOperador,async(req,res)=>{
    if(!operacoesSandboxAutorizadas)
     return res.status(403).json({erro:'SANDBOX_NAO_CONFIGURADO'});
    const b=req.body;
    if(!req.is('application/json')||!b||Array.isArray(b)||
       !['aceiteEnsaio,clienteAsaasId,prepedidoId',
         'aceiteEnsaio,aceiteSemPosicao,clienteAsaasId,prepedidoId']
        .includes(Object.keys(b).sort().join(','))||
       (b.aceiteSemPosicao!==undefined&&typeof b.aceiteSemPosicao!=='boolean')||
       b.aceiteEnsaio!==true||
       typeof b.prepedidoId!=='string'||!/^hom-[0-9a-f-]{36}$/.test(b.prepedidoId)||
       typeof b.clienteAsaasId!=='string'||!/^cus_[A-Za-z0-9_-]{5,80}$/.test(b.clienteAsaasId))
     return res.status(400).json({erro:'PARAMETROS_ENSAIO_INVALIDOS'});
    const row=banco.prepare([
     'SELECT titular_id AS titularId,total_centavos AS centavos',
     'FROM akitemm_checkout_prepedidos_staging WHERE prepedido_id=?'
    ].join(' ')).get(b.prepedidoId);
    if(!row)return res.status(404).json({erro:'PREPEDIDO_INEXISTENTE'});
    try{
     const foto=sinalizacaoVitrine.consultarFotografiaPrepedido({
      prepedidoId:b.prepedidoId,titularId:row.titularId
     });
     const {auditarCoberturaDePedido}=require('../domain/auditoria-cobertura-lotes-akitemm');
     const audit=auditarCoberturaDePedido({
      fotografia:foto,valorPedidoCentavos:row.centavos
     });
     // Comprar na loja NAO depende de ter vaga no LOOP. Apenas a
     // promessa de posicoes exige plano qualificado, cobertura e limite.
     // Cinza, verde abaixo de R$250 e cliente com dez posicoes seguem
     // como compra de produto, sem geracao automatica de novas posicoes.
     const plano=foto?.planejamentoPosicoes;
     if(!plano||audit.alertas.includes('EVENTO_ROXO_NAO_CONFIGURADO'))
      return res.status(409).json({erro:'PRECOBRANCA_CLASSIFICACAO_INDETERMINADA'});
     const prev=plano.quantidadePosicoesPrevistas;
     if(!Number.isSafeInteger(prev)||prev<0)
      return res.status(409).json({erro:'PLANEJAMENTO_POSICOES_INVALIDO'});
     // Se o pedido se qualifica, a cobertura bruta por SEGMENTO
     // ainda precisa ser validada; nao usar o valor cinza para financiar
     // posicoes prometidas em verde/dourado/roxo.
     if(prev>0&&plano.podeVincularEnsaio&&
        (audit.segmentosInsuficientes?.length||
         audit.diferencaBrutaAposReferenciaCentavos<0))
      return res.status(409).json({erro:'PRECOBRANCA_SEM_COBERTURA_MINIMA'});
     const preparado=ponte.preparar({
      titularId:row.titularId,prepedidoId:b.prepedidoId,
      clienteAsaasId:b.clienteAsaasId,
      capacidade:{quantidadePosicoes:prev,
       cienteSemPosicao:b.aceiteSemPosicao===true,
       consultarAtivas:()=>motorConta.consultar({
        titularId:row.titularId
       }).posicoesAtivasDoTitular}
     });
     const r=await ponte.enviarUmaVez({titularId:row.titularId,
      prepedidoId:b.prepedidoId,provedor:provedorReconsultaSandbox,
      execucaoLiberada:true,
      exigirCoberturaBruta:(preparado.registro.posicoesReservadas??prev)>0});
     return res.status(r.repetido?200:201).json({
      ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
      prepedidoId:b.prepedidoId,estado:r.registro?.estado,
      repetido:r.repetido===true,consultaPSPRecebido:false,
      posicoesPrevistas:preparado.registro.posicoesPrevistas,
      posicoesReservadas:preparado.registro.posicoesReservadas,
      modalidadeDeParticipacao:preparado.registro.modalidadeDeParticipacao,
      compraSemNovaPosicao:preparado.registro.compraSemNovaPosicao,
      posicoesReais:0,saquesReais:0
     });
    }catch(e){
     return res.status(409).json({erro:e.codigo||'COBRANCA_SANDBOX_REQUER_REVISAO'});
    }
   });
  // Consulta read-only EXCLUSIVA do ensaio de replay. Retorna apenas o ID
  // da unica cobranca sandbox ja ligada a uma posicao no MESMO SQLite.
  // Rota invisivel fora da autorizacao explicita temporaria de laboratorio.
  app.get('/staging/escritorio-unificado/webhook-replay-fixture',
   autorizarOperador,(_req,res)=>{
    if(!operacoesSandboxAutorizadas||
       process.env.LOOP_PREVIEW_EXCLUSIVO!=='SIM'||
       process.env.LOOP_PREVIEW_WEBHOOK_REPLAY_EXECUTAR!=='SIM')
     return res.status(404).json({erro:'ENSAIO_REPLAY_INATIVO'});
    const provas=banco.prepare([
     'SELECT DISTINCT p.prepedido_id AS prepedidoId,',
     'p.pagamento_id AS pagamentoId,p.external_ref AS externalReference,',
     'p.valor_centavos AS valorCentavos',
     'FROM akitemm_prepedido_asaas_sandbox_staging p',
     'JOIN akitemm_motor_ensaio_lotes_pedido m',
     'ON m.prepedido_id=p.prepedido_id',
     'JOIN akitemm_prepedido_webhook_inbox_staging i',
     'ON i.prepedido_id=p.prepedido_id',
     'JOIN akitemm_prepedido_webhook_reconsulta_staging r',
     'ON r.evento_id=i.evento_id',
     "WHERE p.estado='RECEBIMENTO_INFORMADO_SANDBOX'",
     "AND i.tipo='PAYMENT_RECEIVED'",
     "AND r.estado='CONCLUIDO' AND r.codigo='PSP_RECONSULTADO'",
     'ORDER BY p.prepedido_id LIMIT 2'
    ].join(' ')).all();
    if(provas.length!==1||provas[0].valorCentavos!==25000||
       !/^LOOPLAB-hom-[0-9a-f-]{36}$/.test(provas[0].externalReference||'')||
       !/^[A-Za-z0-9_-]{5,90}$/.test(provas[0].pagamentoId||''))
     return res.status(409).json({erro:'ENSAIO_REPLAY_FONTE_NAO_UNICA'});
    return res.json({ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
     pagamentoId:provas[0].pagamentoId,
     externalReference:provas[0].externalReference,
     valorCentavos:provas[0].valorCentavos,
     consultaSomenteLeitura:true,financeiroReal:false});
   });
  app.get('/staging/escritorio-unificado/monitor-psp',autorizarOperador,
   (_req,res)=>{
    if(!operacoesSandboxAutorizadas)return res.status(403)
     .json({erro:'OPERACAO_SANDBOX_DESATIVADA'});
    const resumo={...worker.resumoPendencias(),
     vinculosMotorAusentes:contarVinculosMotorAusentes(),
     reversoesMotorPendentes:contarReversoesMotorPendentes()};
    const recuperacaoPSP=statusRecuperacaoPSP();
    const fila=worker.pendencias({limite:30});
    return res.json({
     ambiente:'ASAAS_SANDBOX_EXCLUSIVO',somenteLaboratorio:true,
     resumo,recuperacaoPSP,fila,posicoesReais:0,pagamentosReais:0,
     saquesReais:0,consultaPSPExecutadaNestaLeitura:false
    });
   });
  // Um único procedimento de conciliação é utilizado pelo operador
  // individual e pelo fechamento em lote. Nunca confia apenas no webhook.
  async function reconciliarEventoSandbox(eventoId,{retomadaSegura=false}={}){
   const r=await worker.processar({
    eventoId,provedor:provedorReconsultaSandbox,execucaoLiberada:true,
    retomadaSegura
   });
   const aviso=inbox.consultarEvento(eventoId);
   if(['PAYMENT_REFUNDED','PAYMENT_PARTIALLY_REFUNDED',
    'PAYMENT_REFUND_IN_PROGRESS','PAYMENT_CHARGEBACK_REQUESTED',
    'PAYMENT_CHARGEBACK_DISPUTE','PAYMENT_DELETED'].includes(aviso?.tipo)){
    // Reversao comprovada pelo PSP permanece EXIGE_REVISAO no worker,
    // por exigir acompanhamento humano. Isso NAO elimina a obrigacao
    // de suspender o motor e registrar checkpoint duravel.
    const pspConcluido=Boolean(banco.prepare([
     'SELECT 1 FROM akitemm_prepedido_asaas_sandbox_staging',
     "WHERE prepedido_id=? AND estado='REVERSAO_INFORMADA_SANDBOX'"
    ].join(' ')).get(aviso.prepedidoId));
    // O checkpoint e gravado ANTES da mutacao do motor. Se cair agora,
    // a reconciliacao automatica volta a percorrer este mesmo evento.
    if(pspConcluido)atualizarCheckpointReversao(eventoId,'PENDENTE');
    try{
     const suspenso=motorConta.suspenderLoteRevertidoSandbox({
      prepedidoId:aviso.prepedidoId
     });
     if(pspConcluido)atualizarCheckpointReversao(eventoId,'CONCLUIDO');
     return {...r,vinculoMotorEnsaio:{
      estado:'SUSPENSO_POR_REVERSAO_PSP',
      quantidadeSuspensa:suspenso.suspensas,apenasEnsaio:true,
      catracaPausada:suspenso.catracaPausada||false
     }};
    }catch(e){
     if(pspConcluido)atualizarCheckpointReversao(eventoId,'EXIGE_REVISAO');
     return {...r,vinculoMotorEnsaio:{
      estado:'REVERSAO_EXIGE_REVISAO',codigo:e.codigo||'REVISAO_MANUAL',
      apenasEnsaio:true
     }};
    }
   }
   if(r.estado==='CONCLUIDO'&&r.codigo==='PSP_RECONSULTADO'&&
      aviso?.tipo==='PAYMENT_RECEIVED'){
    // Compra normal ou limite completo: valor pago pode seguir com produto,
    // mas nao deve gerar nem repetir qualquer tarefa de criacao de posicao.
    const reserva=banco.prepare([
     'SELECT posicoes_reservadas AS n,modalidade',
     'FROM akitemm_prepedido_asaas_reserva_posicoes_staging',
     'WHERE prepedido_id=?'
    ].join(' ')).get(aviso.prepedidoId);
    if(reserva?.n===0)return {...r,vinculoMotorEnsaio:{
     estado:'COMPRA_SOMENTE_PRODUTOS',quantidade:0,
     modalidade:reserva.modalidade,apenasEnsaio:true,posicoesComerciais:0
    }};
    try{
     const m=motorConta.vincularPedidoConferidoSandbox({
      prepedidoId:aviso.prepedidoId
     });
     return {...r,vinculoMotorEnsaio:{
      estado:m.repetido?'JA_VINCULADO':'PENDENTES_GERADAS',
      quantidade:m.quantidadePosicoes,apenasEnsaio:true,
      posicoesComerciais:0,cpfETermosConfirmados:false
     }};
    }catch(e){
     return {...r,vinculoMotorEnsaio:{
      estado:'BLOQUEADO',codigo:e.codigo||'LOTE_REQUER_REVISAO',
      apenasEnsaio:true,posicoesComerciais:0
     }};
    }
   }
   return r;
  }
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
     return res.json(await reconciliarEventoSandbox(req.body.eventoId));
    }catch(e){
     if(e.codigo==='EVENTO_NAO_ENCONTRADO')
      return res.status(404).json({erro:e.codigo});
     if(e.codigo==='VINCULO_SANDBOX_DIVERGENTE')
      return res.status(409).json({erro:e.codigo});
     return res.status(503).json({erro:'RECONSULTA_PSP_NAO_CONCLUIDA'});
    }
   });
  // Uma ação de fechamento verifica TODOS os avisos novos de uma amostra
  // limitada, com GET independente no Sandbox e vínculo do lote no motor.
  // Falhas ficam sinalizadas e podem ser reprocessadas manualmente.
  // API e agendador usam a MESMA rotina, com registro duravel no SQLite.
  // Falhas por evento nao interrompem o restante, nem produzem saldos.
  async function executarLoteSandbox(limite){
   if(!operacoesSandboxAutorizadas||!worker)
    throw erro('OPERACAO_SANDBOX_DESATIVADA');
   if(!Number.isSafeInteger(limite)||limite<1||limite>20)
    throw erro('LOTE_CONCILIACAO_INVALIDO');
   // Quando a resposta da criacao Pix chega depois do webhook, reunir
   // o sinal antecipado ao MESMO SQLite antes da reconsulta independente.
   // Nenhum aviso bruto gera direitos financeiros ou posicoes.
   const quarentena=inbox.reconciliarAntecipados({
    execucaoLiberada:true,limite
   });
   // Quando o servidor anterior caiu apos gravar PROCESSANDO, a tentativa
   // em SQLite ficou orfa. Marcar checkpoints velhos sem executar PSP nesta
   // etapa. O lote retomara com uma NOVA consulta independente ao Asaas.
   // Nao reviver divergencias PSP, chargebacks ou erros de rede.
   const interrupcoes=worker.recuperarTravados({
    execucaoLiberada:true,idadeMinimaMs:120000,limite
   });
    // GET PSP concluido nao prova que o lote chegou ao motor: a escrita
    // do motor pode falhar DEPOIS do worker marcar o evento concluido.
    // Reconciliacoes novas primeiro, depois reparo de vinculos ausentes.
    // O motor revalida PSP, titularidade e limites em transacao idempotente.
    const vinculoMotorAusente=[
     "r.estado='CONCLUIDO' AND r.codigo='PSP_RECONSULTADO'",
     "AND i.tipo='PAYMENT_RECEIVED'",
     'AND NOT EXISTS (SELECT 1 FROM akitemm_prepedido_asaas_reserva_posicoes_staging v',
     'WHERE v.prepedido_id=i.prepedido_id AND v.posicoes_reservadas=0)',
     'AND EXISTS (SELECT 1 FROM akitemm_prepedido_asaas_sandbox_staging p',
     "WHERE p.prepedido_id=i.prepedido_id AND p.estado='RECEBIMENTO_INFORMADO_SANDBOX')",
     'AND NOT EXISTS(SELECT 1 FROM akitemm_motor_conta_ensaio_operacoes m',
     "WHERE m.prepedido_id=i.prepedido_id AND m.tipo='VINCULAR_PEDIDO')"
    ].join(' ');
    const reversaoMotorPendente=[
     "r.estado IN ('CONCLUIDO','EXIGE_REVISAO')",
     "AND i.tipo IN ('PAYMENT_REFUNDED','PAYMENT_PARTIALLY_REFUNDED',",
     "'PAYMENT_REFUND_IN_PROGRESS','PAYMENT_CHARGEBACK_REQUESTED',",
     "'PAYMENT_CHARGEBACK_DISPUTE','PAYMENT_DELETED')",
     'AND EXISTS (SELECT 1 FROM akitemm_prepedido_asaas_sandbox_staging p',
     "WHERE p.prepedido_id=i.prepedido_id AND p.estado='REVERSAO_INFORMADA_SANDBOX')",
     'AND NOT EXISTS (SELECT 1 FROM akitemm_motor_reversoes_psp_checkpoint c',
     "WHERE c.evento_id=i.evento_id AND c.estado='CONCLUIDO')"
    ].join(' ');
    const retomadaInterrompida=
     "r.estado='EXIGE_REVISAO' AND "+
     "r.codigo='PROCESSAMENTO_INTERROMPIDO_REVISAR'";
    const pendenteOuSemMotor=
     '(r.evento_id IS NULL OR ('+retomadaInterrompida+') OR ('+
      vinculoMotorAusente+') OR ('+reversaoMotorPendente+'))';
    const baseFila=[
     'FROM akitemm_prepedido_webhook_inbox_staging i',
     'LEFT JOIN akitemm_prepedido_webhook_reconsulta_staging r',
     'ON r.evento_id=i.evento_id'
    ].join(' ');
    const eventos=banco.prepare([
     'SELECT i.evento_id AS eventoId',baseFila,
     'WHERE '+pendenteOuSemMotor,
     'ORDER BY CASE WHEN r.evento_id IS NULL THEN 0 ELSE 1 END,',
     'i.recebido_em,i.evento_id LIMIT ?'
    ].join(' ')).all(limite);
    const resultado={consultados:0,conciliados:0,
     quarentenaRecuperada:quarentena.vinculados,
     quarentenaAguardandoVinculo:quarentena.aguardandoVinculo,
     quarentenaDivergente:quarentena.divergentes,
     interrupcoesDetectadas:interrupcoes.recuperados,
     interrupcoesReinterrompidas:interrupcoes.reinterrompidos,
     retomadasComProvaPSP:0,
     revisaoNecessaria:0,lotesPendentesCriados:0,
     lotesSuspensos:0,errosDeProcessamento:0,
     ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
     caixaRealComprovado:false,saquesReais:0,posicoesComerciais:0,
     somenteLaboratorio:true};
    for(const evento of eventos){
     try{
      const r=await reconciliarEventoSandbox(evento.eventoId,{
       retomadaSegura:true
      });
      resultado.consultados++;
      if(r.retomadaDeInterrupcao===true&&r.estado==='CONCLUIDO')
       resultado.retomadasComProvaPSP++;
      if(r.estado==='CONCLUIDO')resultado.conciliados++;
      else resultado.revisaoNecessaria++;
      if(r.vinculoMotorEnsaio?.estado==='PENDENTES_GERADAS')
       resultado.lotesPendentesCriados++;
      if(r.vinculoMotorEnsaio?.estado==='SUSPENSO_POR_REVERSAO_PSP')
       resultado.lotesSuspensos++;
      if(['BLOQUEADO','REVERSAO_EXIGE_REVISAO'].includes(
       r.vinculoMotorEnsaio?.estado))resultado.revisaoNecessaria++;
     }catch(_e){
      resultado.errosDeProcessamento++;
      // Nao interromper os demais pedidos nem expor dados pessoais
      // ou detalhes do PSP. Evento problemático segue na caixa de avisos.
     }
    }
    resultado.pendentesRestantes=banco.prepare([
     'SELECT COUNT(*) AS n',baseFila,
     'WHERE '+pendenteOuSemMotor
    ].join(' ')).get().n;
    resultado.vinculosMotorAusentes=contarVinculosMotorAusentes();
    resultado.reversoesMotorPendentes=contarReversoesMotorPendentes();
    resultado.alertasRevisao=worker.resumoPendencias().exigeRevisao;
    return resultado;
  }
  // Evita reconsultas simultâneas quando o botão manual encontra o
  // ciclo automático. Uma operação em andamento é compartilhada.
  let loteEmExecucao=null;
  async function executarLoteSandboxUnico(limite){
   if(loteEmExecucao!==null)return loteEmExecucao;
   const operacao=executarLoteSandbox(limite);
   loteEmExecucao=operacao;
   try{return await operacao;}finally{
    if(loteEmExecucao===operacao)loteEmExecucao=null;
   }
  }
  executarConciliacaoSandbox=executarLoteSandboxUnico;
  app.post('/staging/escritorio-unificado/reconciliar-pendentes-sandbox',
   autorizarOperador,async(req,res)=>{
    if(!operacoesSandboxAutorizadas)
     return res.status(403).json({erro:'OPERACAO_SANDBOX_DESATIVADA'});
    if(!req.is('application/json')||!req.body||Array.isArray(req.body)||
       Object.keys(req.body).join(',')!=='limite'||
       !Number.isSafeInteger(req.body.limite)||
       req.body.limite<1||req.body.limite>20)
     return res.status(400).json({erro:'LOTE_CONCILIACAO_INVALIDO'});
    try{
     return res.json(await executarLoteSandboxUnico(req.body.limite));
    }catch(_e){
     return res.status(503).json({erro:'LOTE_CONCILIACAO_NAO_CONCLUIDO'});
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
    verificacaoEmailDisponivel:provasEmail!==null,
    recuperacaoSenhaEmailDisponivel:typeof enviarRecuperacao==='function',
    posicoesPendentesFicticias:posicoes?banco.prepare([
     'SELECT COUNT(*) AS n FROM',
     'akitemm_prepedido_posicoes_pendentes_sandbox_staging'
    ].join(' ')).get().n:0,
    integridadeTitular:integridade.auditar(),
    integridadePagamentosEntregas:auditarRelacoesPspCandidato({banco}),
    vinculosMotorAusentes:contarVinculosMotorAusentes(),
    reversoesMotorPendentes:contarReversoesMotorPendentes(),
    recuperacaoPSP:statusRecuperacaoPSP(),
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
  inbox,worker,executarConciliacaoSandbox,posicoes,projecaoFilas,preAdesao,diagnosticoAtivacao,entregas,integridade,missoes,catalogo,sinalizacaoVitrine,departamentosAdmin,equipe,motorConta,banco};
}
module.exports={criarAppLojaEscritorioCandidato};
