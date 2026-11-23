'use strict';
// Entrada de cliente real. É um serviço NOVO e isolado, não utiliza
// src/candidato e nunca monta as rotas de laboratório ou dinheiro.
const express=require('express');
const {COOKIE}=require('./identidade-cliente-loop-sqlite');
const {consultarDivulgacao,consultarComissoesDivulgacao,
 verificarNickDivulgador}=
 require('./direitos-divulgacao-loop-sqlite');
const {COOKIE_ADMIN}=require('./sessao-admin-comercial-sqlite');
const {CaptchaCadastroSQLite}=require('../shared/captcha-cadastro-sqlite');
const {CaptchaLoginSQLite}=require('../shared/captcha-login-sqlite');
const {montarInterfaceAprovada}=require('./interface-aprovada-loop');
const {montarGatewayAdminComercial}=require('./gateway-admin-comercial');
const {montarBannersEscritorioReal}=require('./banners-escritorio-real');
const {VisaoEscritorioUnificadaSQLite}=
 require('./visao-escritorio-unificada-sqlite');
const {autorizarInterno,projetarTabuleiroOperacional}=
 require('./leitura-tabuleiro-operacional-real');
const {LivroFinanceiroRealSQLite}=
 require('./livro-financeiro-real-sqlite');
const {PosicoesVitrineRealSQLite}=
 require('./posicoes-vitrine-real-sqlite');
const {AnunciosManuaisAkitemmSQLite}=
 require('./anuncios-manuais-akitemm-sqlite');
const {EntregaLocalAkitemmSQLite}=
 require('./entrega-local-akitemm-sqlite');
const {localizarCepBrasil}=require('./consulta-cep-brasil');
const {AvaliacoesProdutoAkitemmSQLite}=
 require('./avaliacoes-produto-akitemm-sqlite');
const {FotoPerfilRealSQLite}=require('./foto-perfil-real-sqlite');
const {CarrinhoInternoRealSQLite}=require('./carrinho-interno-real-sqlite');
const {AtendimentoAkitemmSQLite}=require('./atendimento-akitemm-sqlite');
const {projetarAgendaTabuleiroCompartilhada}=
 require('./projecao-agenda-tabuleiro-compartilhada');
function criarAppIdentidadeLoop({contas,origemHttps,
 permitirCadastro=false,backupEstado=null,captchaCadastroObrigatorio=false,
 pedidosComerciais=null,remessasOutbox=null,catalogoVitrine=null,
 catalogoMidiaLeitura=null,adminComercial=null,
 motorLoop=null,eventosComerciais=null,tesourariaEnsaio=null,
 aceitePosicaoAzulEnsaio=null,preflightCapacidade=null}={}){
 if(!contas||typeof contas.entrar!=='function'||typeof contas.sessao!=='function')
  throw Error('IDENTIDADE_REAL_NAO_CONFIGURADA');
 if(process.env.NODE_ENV==='production'&&permitirCadastro&&
    typeof backupEstado!=='function')
  throw Error('BACKUP_OFFSITE_REAL_NAO_CONFIGURADO');
 if(motorLoop!==null&&(
    typeof motorLoop.consultar!=='function'||
    typeof motorLoop.verificar!=='function'||
    motorLoop.banco!==contas.banco))
  throw Error('LOOP_MOTOR_INTERNO_INVALIDO');
 if(eventosComerciais!==null&&(
    typeof eventosComerciais.verificar!=='function'||
    typeof eventosComerciais.consultarTitular!=='function'))
  throw Error('EVENTOS_COMERCIAIS_INTEGRACAO_INVALIDA');
 if(tesourariaEnsaio!==null&&(
  process.env.NODE_ENV==='production'||
  tesourariaEnsaio.db!==contas.banco||
  typeof tesourariaEnsaio.consultarTitularEnsaio!=='function'||
  typeof tesourariaEnsaio.solicitarSaqueEnsaio!=='function'||
  typeof tesourariaEnsaio.verificar!=='function'))
  throw Error('TESOURARIA_ENSAIO_NAO_PODE_SER_OPERACAO_REAL');
 if(aceitePosicaoAzulEnsaio!==null&&(
    process.env.NODE_ENV==='production'||motorLoop===null||
    aceitePosicaoAzulEnsaio.db!==contas.banco||
    typeof aceitePosicaoAzulEnsaio.confirmar!=='function'))
  throw Error('AZUL_ENSAIO_NAO_PODE_SER_CONFIRMACAO_REAL');
 if(preflightCapacidade!==null&&(
   motorLoop===null||preflightCapacidade.db!==contas.banco||
   preflightCapacidade.motor!==motorLoop||
   typeof preflightCapacidade.consultar!=='function'||
   typeof preflightCapacidade.verificar!=='function'))
  throw Error('CHECKOUT_CAPACIDADE_NAO_VINCULADA_AO_MOTOR');
 if((pedidosComerciais===null)!==(remessasOutbox===null))
  throw Error('PEDIDOS_REAIS_INTEGRACAO_INCOMPLETA');
 if(pedidosComerciais!==null&&(
    typeof pedidosComerciais.listarDoTitular!=='function'||
    typeof remessasOutbox.consultar!=='function'))
  throw Error('PEDIDOS_REAIS_INTEGRACAO_INVALIDA');
 if(catalogoVitrine!==null&&(
  catalogoVitrine.banco!==contas.banco||
  typeof catalogoVitrine.listarVitrinePreparacao!=='function'))
  throw Error('CATALOGO_LOJA_SQLITE_DIVERGENTE');
 // Catálogo de fotos/PDFs é um banco comercial separado no mesmo volume,
 // nunca outra fonte de identidade, pedido, posição ou sessão.
 if(catalogoMidiaLeitura!==null&&(
  typeof catalogoMidiaLeitura.banco?.prepare!=='function'||
  catalogoMidiaLeitura.banco===contas.banco||
  typeof catalogoMidiaLeitura.listarVitrinePreparacao!=='function'||
  typeof catalogoMidiaLeitura.listarFotosProdutoCompartilhado!=='function'||
  typeof catalogoMidiaLeitura.abrirFotoPublicada!=='function'))
  throw Error('CATALOGO_MIDIA_LEITURA_NAO_ISOLADA');
 const posicoesVitrine=(catalogoVitrine||catalogoMidiaLeitura)?
  new PosicoesVitrineRealSQLite({banco:contas.banco,
   auditoria:adminComercial?.auditoria||null}):null;
 const anunciosManuais=catalogoVitrine?
  new AnunciosManuaisAkitemmSQLite({banco:contas.banco,
   auditoria:adminComercial?.auditoria||null}):null;
 const entregaLocal=catalogoVitrine?
  new EntregaLocalAkitemmSQLite({banco:contas.banco,
   auditoria:adminComercial?.auditoria||null}):null;
 const avaliacoesProduto=catalogoVitrine?
  new AvaliacoesProdutoAkitemmSQLite({banco:contas.banco}):null;
 const catracaCompartilhada=adminComercial?.operacaoCatraca??null;
 if(catracaCompartilhada&&(
   catracaCompartilhada.db!==contas.banco||
   catracaCompartilhada.motor!==motorLoop||
   typeof catracaCompartilhada.consultar!=='function'))
  throw Error('CATRACA_CLIENTE_OPERADOR_MOTOR_DIVERGENTE');
 const visaoEscritorio=motorLoop===null?null:
  new VisaoEscritorioUnificadaSQLite({
   banco:contas.banco,motor:motorLoop,
   consultarTelefone:args=>contas.telefoneIndicadoVinculado(args),
   chaveCursor:contas.keyCodigo
  });
 const livroFinanceiro=motorLoop===null?null:
  new LivroFinanceiroRealSQLite({banco:contas.banco});
 // Mesmo banco real de contas; arquivo integra o backup externo da identidade.
 const fotosPerfil=new FotoPerfilRealSQLite({banco:contas.banco});
 const carrinhoInterno=new CarrinhoInternoRealSQLite({banco:contas.banco});
 const atendimento=new AtendimentoAkitemmSQLite({
  banco:contas.banco,chaveCifra:contas.keyCipher,
  auditoria:adminComercial?.auditoria||null
 });
 if(typeof captchaCadastroObrigatorio!=='boolean')
  throw Error('CAPTCHA_CONFIGURACAO_INVALIDA');
 const captcha=captchaCadastroObrigatorio?new CaptchaCadastroSQLite({
  banco:contas.banco,segredo:contas.keyCodigo,contexto:'REAL'
 }):null;
 const captchaLogin=new CaptchaLoginSQLite({
  banco:contas.banco,segredo:contas.keyCodigo,contexto:'REAL'
 });
 const backupAtual=()=>typeof backupEstado==='function'?
  backupEstado()?.backupAtualEmDia===true:true;
 const cadastroLiberado=()=>permitirCadastro&&backupAtual();
 let origem;
 try{
  const url=new URL(origemHttps);
  if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.hash)
   throw Error('ORIGEM_HTTPS_INVALIDA');
  origem=url.origin;
 }catch{throw Error('ORIGEM_HTTPS_INVALIDA');}
 const app=express();
 app.disable('x-powered-by');app.disable('etag');app.set('trust proxy',false);
 app.use((req,res,next)=>{
  res.set({
   'Cache-Control':'no-store',
   'Strict-Transport-Security':'max-age=31536000; includeSubDomains',
   'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
   'Referrer-Policy':'no-referrer',
   'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
  });
  next();
 });
 app.use(express.json({limit:'12kb',strict:true}));
 // A montagem visual ocorre depois de definir middleware de autenticação,
 // para que a vitrine mantenha a titularidade da mesma sessão.
 const cookieValor=req=>{
  const raw=req.get('cookie')||'';
  if(raw.length>4096)return null;
  const encontrados=raw.split(';').map(x=>x.trim())
   .filter(x=>x.startsWith(COOKIE+'='));
  if(encontrados.length!==1)return null;
  const token=encontrados[0].slice(COOKIE.length+1);
  return /^[a-f0-9]{64}$/.test(token)?token:null;
 };
 const sessao=req=>contas.sessao(cookieValor(req));
 const cookie=(token,apagar=false)=>[
  COOKIE+'='+token,'HttpOnly','Secure','SameSite=Strict','Path=/',
  'Max-Age='+(apagar?'0':'3600')
 ].join('; ');
 const origemOk=req=>req.get('origin')===origem;
 const protegido=(req,res,next)=>{
  const s=sessao(req);
  if(!s)return res.status(401).json({erro:'LOGIN_OBRIGATORIO'});
  req.conta=s;next();
 };
 // Operador tem SOMENTE a leitura da vitrine autenticada e o
 // middleware de edicao de midia separado, nunca acesso a dados do
 // cliente, pedidos, saques, compras ou sessao de um titular.
 const sessaoOperador=req=>{
  if(!adminComercial?.sessoes?.sessao)return null;
  const raw=req.get('cookie')||'';
  if(raw.length>4096)return null;
  const cookies=raw.split(';').map(x=>x.trim())
   .filter(x=>x.startsWith(COOKIE_ADMIN+'='));
  if(cookies.length!==1)return null;
  const valor=cookies[0].slice(COOKIE_ADMIN.length+1);
  return /^[a-f0-9]{64}$/.test(valor)?
   adminComercial.sessoes.sessao(valor):null;
 };
 const protegidoLoja=(req,res,next)=>{
  const titular=sessao(req);
  if(titular){req.conta=titular;return next();}
  const operador=sessaoOperador(req);
  if(operador?.role==='ADMIN_COMERCIAL'){
   req.lojaSomenteOperador=true;return next();
  }
  return res.status(401).json({erro:'LOGIN_OBRIGATORIO'});
 };
 // Mantem exatamente a interface aprovada, sem exigir cadastro extra
 // do operador para consultar o catalogo.
 montarInterfaceAprovada(app,{protegerLoja:protegidoLoja});
 // Quatro banners próprios do LOOP, no SQLite real e nas sessões reais.
 // Escrita exclusiva do operador com CSRF, leitura para conta autenticada.
 montarBannersEscritorioReal(app,{banco:contas.banco,protegidoLoja,
  sessaoOperador,origem});
 // Sessão de administrador é completamente separada do login de cliente.
 // Sem credencial e middleware de operador, rotas administrativas não existem.
 if(adminComercial!==null)
  montarGatewayAdminComercial(app,{...adminComercial,origemHttps,
   posicoesVitrine,anunciosManuais,entregaLocal,motorLoop,contas,atendimento});
 const mutation=(req,res,next)=>{
  if(!origemOk(req))return res.status(403).json({erro:'ORIGEM_INVALIDA'});
  if(!req.is('application/json'))
   return res.status(415).json({erro:'JSON_OBRIGATORIO'});
  next();
 };
 const csrf=(req,res,next)=>{
  if(req.get('x-loop-csrf')!==req.conta.csrf)
   return res.status(403).json({erro:'CSRF_INVALIDO'});
  next();
 };
 const falha=(res,e)=>{
  const code=e?.codigo||'OPERACAO_INDISPONIVEL';
  if(code==='AUTENTICACAO_OCUPADA'||code==='CONTA_BLOQUEADA'||
     code==='ACESSO_TEMPORARIAMENTE_LIMITADO')
   return res.status(429).json({erro:code});
  if(code==='CADASTRO_EXISTENTE')return res.status(409).json({erro:code});
  if(code==='DOCUMENTOS_ALTERADOS_RELER'||
     code==='CREDENCIAL_ALTERADA_CONCORRENTEMENTE'||
     code==='DESTINO_INDICACAO_JA_ESCOLHIDO'||
     code==='INDICACAO_AGUARDA_CONFIRMACAO'||
     code==='INDICACAO_AGUARDA_QUALIFICACAO')
   return res.status(409).json({erro:code});
  if(code==='POSICAO_INDICACAO_INVALIDA')
   return res.status(400).json({erro:code});
  if(code==='CADASTRO_INDICADO_NAO_PERTENCE')
   return res.status(404).json({erro:code});
  if(['NOME_INVALIDO','EMAIL_INVALIDO','NICK_INVALIDO','SENHA_INVALIDA',
   'CODIGO_INVALIDO','SENHA_NOVA_DEVE_SER_DIFERENTE',
   'INDICADOR_INVALIDO','AUTOINDICACAO_PROIBIDA',
   'INDICADOR_NAO_ENCONTRADO','CPF_INVALIDO','TELEFONE_INVALIDO',
   'CONTATO_CADASTRO_INCOMPLETO'].includes(code))
   return res.status(400).json({erro:code});
  if(code==='CREDENCIAIS_INVALIDAS'||code==='SENHA_ATUAL_INCORRETA')
   return res.status(401).json({erro:code});
  return res.status(503).json({erro:'OPERACAO_INDISPONIVEL'});
 };
 // Limites de operação são atômicos e compartilhados entre processos que
 // montam o mesmo volume SQLite. Nunca gravar IP, e-mail ou nick em claro.
 const limite=(res,acao,chave)=>{
  try{
   contas.limitar('global','*');
   contas.limitar(acao,String(chave??'-').slice(0,254));
   return true;
  }catch(e){falha(res,e);return false;}
 };
 app.get('/healthz',(_req,res)=>res.json({
  estado:'SERVICO_IDENTIDADE_SEPARADO',financeiroReal:false
 }));
 app.get('/readyz',(_req,res)=>{
  try{
   // Readiness é consultado repetidamente pelo Railway: quick_check
   // completo a cada GET custa O(tamanho do banco) e permite DoS.
   // Verificação integral do SQLite fica para o backup/auditoria.
   const check=contas.banco.prepare(
    'SELECT email_prova FROM loop_real_custodia WHERE id=1'
   ).get()?.email_prova;
   if(!check||!cadastroLiberado())return res.status(503).json({
    estado:'CADASTRO_REAL_INATIVO',financeiroReal:false
   });
   return res.json({estado:'CADASTRO_REAL_PRONTO_SEM_FINANCEIRO',
    financeiroReal:false,cadastroAtivo:true});
  }catch{return res.status(503).json({
   estado:'IDENTIDADE_NAO_PRONTA',financeiroReal:false
  });}
 });
 // Foto privada do cliente: nunca confundir sessão do operador com titular.
 app.get('/api/contas/foto-perfil',protegido,(req,res)=>{
  try{
   const foto=fotosPerfil.consultar(req.conta.titularId);
   if(!foto)return res.status(404).json({erro:'FOTO_AINDA_NAO_CADASTRADA'});
   return res.set('Cache-Control','private, no-store')
    .type(foto.mime).send(foto.dados);
  }catch{return res.status(503).json({erro:'FOTO_REAL_INDISPONIVEL'});}
 });
 app.post('/api/contas/foto-perfil',protegido,(req,res,next)=>{
  if(!origemOk(req))return res.status(403).json({erro:'ORIGEM_INVALIDA'});
  if(req.get('x-loop-csrf')!==req.conta.csrf)
   return res.status(403).json({erro:'CSRF_INVALIDO'});
  if(!['image/jpeg','image/png','image/webp'].includes(req.get('content-type')))
   return res.status(415).json({erro:'TIPO_FOTO_NAO_PERMITIDO'});
  next();
 },express.raw({type:['image/jpeg','image/png','image/webp'],limit:'3mb'}),
 (req,res)=>{
  try{
   const salvo=fotosPerfil.salvar(req.conta.titularId,{
    mime:req.get('content-type'),dados:req.body
   });
   return res.status(201).set('Cache-Control','no-store').json({
    fotoSalva:salvo.fotoSalva
   });
  }catch(e){
   const invalida=['FOTO_REAL_FORMATO_INVALIDO','FOTO_INVALIDA',
    'FOTO_DIMENSOES_INVALIDAS','FOTO_GRANDE_DEMAIS'].includes(e.codigo);
   return res.status(invalida?400:503).json({
    erro:invalida?'FOTO_INVALIDA':'FOTO_REAL_INDISPONIVEL'
   });
  }
 });
 // Cadastro novo e atualização documental de uma conta existente são
 // operações distintas: fechar o cadastro não deve bloquear o titular.
 // Quando fechado, documentos só saem para uma sessão real autenticada.
 // Consulta publica SOMENTE de leitura: mostra os 7+7 topicos reais,
 // mesmo quando o cadastro esta fechado. Nao autoriza aceite ou nova conta.
 app.get('/api/contas/documentos-leitura',(_req,res)=>
  res.set('Cache-Control','no-store').json({
   ...contas.documentos(),somenteLeitura:true,cadastroAtivo:cadastroLiberado(),
   financeiroReal:false
  })
 );
 app.get('/api/contas/documentos',(req,res)=>{
  // Mantém o 503 histórico para visitantes quando o cadastro é fechado.
  // Uma sessão EXISTENTE pode ler e aceitar a versão vigente sem cadastro novo.
  if(!cadastroLiberado()&&!sessao(req))
   return res.status(503).json({erro:'CADASTRO_INATIVO'});
  return res.set('Cache-Control','private, no-store').json({
   ...contas.documentos(),
   ...(cadastroLiberado()&&captcha?{captchaObrigatorio:true}:{})
  });
 });
 app.get('/api/contas/captcha-cadastro',(_req,res)=>{
  if(!cadastroLiberado()||!captcha)
   return res.status(503).json({erro:'CADASTRO_INATIVO'});
  try{return res.set('Cache-Control','no-store').json(captcha.emitir());}
  catch{return res.status(429).json({erro:'CAPTCHA_OCUPADO'});}
 });
 app.post('/api/contas/cadastrar',mutation,async(req,res)=>{
  if(!cadastroLiberado())return res.status(503).json({erro:'CADASTRO_INATIVO'});
  const b=req.body;
  if(!b||Array.isArray(b)||typeof b!=='object')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  const dadosCadastro=captcha?Object.fromEntries(Object.entries(b).filter(
   ([k])=>k!=='captchaId'&&k!=='captchaResposta')):b;
  if(![
    'aceitePrivacidade,aceiteTermos,email,hashPrivacidade,hashTermos,nick,nome,senha,versaoPrivacidade,versaoTermos',
    'aceitePrivacidade,aceiteTermos,email,hashPrivacidade,hashTermos,indicadorNick,nick,nome,senha,versaoPrivacidade,versaoTermos',
    'aceitePrivacidade,aceiteTermos,cpf,email,hashPrivacidade,hashTermos,nick,nome,senha,telefone,versaoPrivacidade,versaoTermos',
    'aceitePrivacidade,aceiteTermos,cpf,email,hashPrivacidade,hashTermos,indicadorNick,nick,nome,senha,telefone,versaoPrivacidade,versaoTermos'
   ].includes(Object.keys(dadosCadastro).sort().join(',')))
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  if(!limite(res,'cadastro',b.email))return;
  try{
   if(captcha)captcha.verificar({
    captchaId:b.captchaId,captchaResposta:b.captchaResposta
   });
   // A referencia exige compra habilitadora conciliada no historico comercial.
   if(dadosCadastro.indicadorNick&&!verificarNickDivulgador({
    banco:contas.banco,nick:dadosCadastro.indicadorNick
   }))return res.status(403).json({erro:'LINK_DIVULGACAO_NAO_LIBERADO'});
   const result=await contas.cadastrar(dadosCadastro);
   return res.status(201).json(result);
  }catch(e){return falha(res,e);}
 });
 // CAPTCHA é solicitado somente após a primeira credencial incorreta.
 app.get('/api/contas/captcha-login',(_req,res)=>{
  try{return res.set('Cache-Control','no-store').json(captchaLogin.emitir());}
  catch{return res.status(429).json({erro:'CAPTCHA_OCUPADO'});}
 });
 app.post('/api/contas/entrar',mutation,async(req,res)=>{
  const b=req.body;
  if(!b||Array.isArray(b)||!['nick,senha',
     'captchaId,captchaResposta,nick,senha'].includes(Object.keys(b).sort().join(',')))
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  if(!limite(res,'login',b.nick))return;
  try{
   captchaLogin.verificarAntes(b.nick,b);
  }catch(e){
   return res.status(403).json({erro:e.codigo||'CAPTCHA_INVALIDO',
    captchaObrigatorio:true});
  }
  try{
   const result=await contas.entrar({nick:b.nick,senha:b.senha});
   captchaLogin.concluirSucesso(b.nick);
   res.set('Set-Cookie',cookie(result.token));
   return res.json({
    titularId:result.titularId,nick:result.nick,csrf:result.csrf,
    expiraEm:result.expiraEm,emailVerificado:result.emailVerificado,
    aceiteDocumentosDefinitivosPendente:contas.documentosPendentes(result.titularId),
    pagamentoReal:false,motorLoopInterno:motorLoop!==null,
    tesourariaEnsaioAtiva:tesourariaEnsaio!==null
   });
  }catch(e){
   if(e.codigo==='CREDENCIAIS_INVALIDAS'){
    try{captchaLogin.registrarErro(b.nick);}catch{return res.status(429).json({erro:'CAPTCHA_OCUPADO'});}
    return res.status(401).json({erro:'CREDENCIAIS_INVALIDAS',captchaObrigatorio:true});
   }
   return falha(res,e);
  }
 });
 app.get('/api/contas/me',protegido,(req,res)=>res.json({
  titularId:req.conta.titularId,nick:req.conta.nick,
  emailVerificado:req.conta.emailVerificado,
  csrf:req.conta.csrf,expiraEm:req.conta.expiraEm,
  lojaEEscritorioMesmaConta:true,financeiroReal:false,
  aceiteDocumentosDefinitivosPendente:contas.documentosPendentes(req.conta.titularId),
  motorLoopInterno:motorLoop!==null,
  tesourariaEnsaioAtiva:tesourariaEnsaio!==null
 }));
 // Atendimento da própria AKITEMM: cliente só vê os seus protocolos.
 app.get('/api/loja/atendimentos',protegido,(req,res)=>{
  try{return res.json({atendimentos:atendimento.meus({
   titularId:req.conta.titularId
  })});}
  catch{return res.status(503).json({erro:'ATENDIMENTO_CONSULTA_INDISPONIVEL'});}
 });
 app.post('/api/loja/atendimentos',protegido,mutation,csrf,(req,res)=>{
  const b=req.body;
  if(!b||Array.isArray(b)||
     Object.keys(b).sort().join(',')!=='mensagem,tipo')
   return res.status(400).json({erro:'ATENDIMENTO_CAMPOS_INVALIDOS'});
  if(!limite(res,'atendimento',req.conta.titularId))return;
  try{
   return res.status(201).json(atendimento.abrir({
    titularId:req.conta.titularId,tipo:b.tipo,mensagem:b.mensagem
   }));
  }catch(err){
   const cod=err.codigo||'ATENDIMENTO_INDISPONIVEL';
   const status=cod==='ATENDIMENTO_LIMITE_ABERTOS'?429:
    cod.includes('INVALIDO')||cod.includes('INVALIDA')?400:503;
   return res.status(status).json({erro:cod});
  }
 });
 // Conta migrada: confirma a política vigente sem refazer cadastro.
 app.post('/api/contas/aceitar-documentos',protegido,mutation,csrf,(req,res)=>{
  const b=req.body;
  if(!b||Array.isArray(b)||
     Object.keys(b).sort().join(',')!==
      'aceitePrivacidade,aceiteTermos,hashPrivacidade,hashTermos,versaoPrivacidade,versaoTermos')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  try{return res.set('Cache-Control','private, no-store').json(
   contas.aceitarDocumentos({titularId:req.conta.titularId,...b})
  );}catch(e){return falha(res,e);}
 });
 // Aceite de cadastro do próprio titular: CPF já recebido e termos lidos.
 // Não é KYC financeiro nem ativa posição, indicação, pedido ou pagamento.
 app.post('/api/contas/confirmar-cadastro',protegido,mutation,csrf,
 (req,res)=>{
  const b=req.body;
  if(!b||Array.isArray(b)||
     Object.keys(b).sort().join(',')!==
      'aceiteExplicito,cpf,hashTermos,versaoTermos')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  if(!limite(res,'confirmar',req.conta.titularId+':CADASTRO'))return;
  try{
   return res.set('Cache-Control','private, no-store').json(
    contas.confirmarCadastro({titularId:req.conta.titularId,...b})
   );
  }catch(e){return falha(res,e);}
 });
 // Direito de acesso: o titular consulta somente os seus próprios dados
 // e a versão dos documentos aceitos. Sem IDs escolhidos pelo navegador.
 app.get('/api/contas/meus-dados',protegido,(req,res)=>{
  try{return res.json(contas.dadosTitular(req.conta.titularId));}
  catch{return res.status(503).json({erro:'DADOS_INDISPONIVEIS'});}
 });
 app.get('/api/contas/divulgacao',protegido,(req,res)=>{
  try{return res.set('Cache-Control','private, no-store').json(
   consultarDivulgacao({banco:contas.banco,titularId:req.conta.titularId})
  );}catch{return res.status(503).json({erro:'DIVULGACAO_INDISPONIVEL'});}
 });
 // Apuracao dos 10% para quem divulgou sem precisar aderir ao LOOP.
 // Resultado e apenas previsao auditavel, nao saldo nem autorizacao de saque.
 app.get('/api/contas/comissoes-divulgacao',protegido,(req,res)=>{
  try{return res.set('Cache-Control','private, no-store').json(
   consultarComissoesDivulgacao({
    banco:contas.banco,titularId:req.conta.titularId
   })
  );}catch{return res.status(503).json({erro:'COMISSOES_CONSULTA_INDISPONIVEL'});}
 });
 // Convite registra somente um cadastro, sem ativar comissão, dinheiro ou posição.
 app.get('/api/contas/minha-rede',protegido,(req,res)=>{
  const bruto=req.query?.offset,cursor=req.query?.cursor;
  if(Object.keys(req.query||{}).some(k=>!['offset','cursor'].includes(k))||
     (bruto!==undefined&&(
      typeof bruto!=='string'||!/^(0|[1-9][0-9]*)$/.test(bruto)||
      !Number.isSafeInteger(Number(bruto))))||
     (cursor!==undefined&&(typeof cursor!=='string'||
      cursor.length>512||cursor.length<1))||
     (cursor!==undefined&&bruto!==undefined))
   return res.status(400).json({erro:'PAGINACAO_INVALIDA'});
  const offset=bruto===undefined?0:Number(bruto);
  try{return res.set('Cache-Control','private, no-store').json(visaoEscritorio?
   visaoEscritorio.listarRede({titularId:req.conta.titularId,
    offset,cursor:cursor??null}):
   contas.listarIndicados(req.conta.titularId,{offset,cursor:cursor??null}));}
  catch(e){return res.status(e?.codigo==='REDE_CURSOR_INVALIDO'?400:503)
   .json({erro:e?.codigo==='REDE_CURSOR_INVALIDO'?
    'PAGINACAO_INVALIDA':'REDE_INDISPONIVEL'});}
 });
 // Sugestoes privadas: SEMPRE usa o titular da sessao; o navegador
 // nao informa o dono da rede e nao recebe contatos de outras redes.
 app.post('/api/contas/minha-rede/pesquisar',protegido,mutation,csrf,
 (req,res)=>{
  const b=req.body;
  if(!b||Array.isArray(b)||Object.keys(b).join(',')!=='termo'||
     typeof b.termo!=='string')
   return res.status(400).json({erro:'BUSCA_REDE_INVALIDA'});
  if(!limite(res,'carrinho',req.conta.titularId+':BUSCA_REDE'))return;
  try{
   return res.set('Cache-Control','private, no-store').json(
    contas.pesquisarIndicados({titularId:req.conta.titularId,termo:b.termo}));
  }catch(e){return res.status(e?.codigo==='BUSCA_REDE_INVALIDA'?400:503)
   .json({erro:e?.codigo||'BUSCA_REDE_INDISPONIVEL'});}
 });
 // Convite público definitivo com os mesmos links curtos do LOOP.
 // Não habilita cadastro nem benefício sem os gates oficiais do serviço.
 app.post('/api/contas/minha-rede/destino',protegido,mutation,csrf,
 (req,res)=>{
  const b=req.body;
  if(!b||Array.isArray(b)||
     Object.keys(b).sort().join(',')!=='numeroCadastro,posicao')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  if(!limite(res,'escolherDestino',req.conta.titularId))return;
  try{
   const registrado=contas.reservarDestinoIndicacao({
    indicadorId:req.conta.titularId,
    numeroCadastro:b.numeroCadastro,posicao:b.posicao
   });
   return res.set('Cache-Control','private, no-store').json(registrado);
  }catch(e){return falha(res,e);}
 });
 const redirecionarLinkDireto=origemLoja=>(req,res)=>{
  const raw=req.params.nick;
  if(typeof raw!=='string'||!/^[A-Za-z]{1,12}$/.test(raw))
   return res.status(404).type('text').send('Convite inválido');
  const nick=raw.toLowerCase();
  const existe=contas.banco.prepare(
   'SELECT 1 FROM loop_real_contas WHERE nick=?'
  ).get(nick);
  if(!existe)return res.status(404).type('text').send('Convite inexistente');
  if(!verificarNickDivulgador({banco:contas.banco,nick}))
   return res.status(403).type('text').send('Link ainda não habilitado');
  // Convite de loja abre a vitrine antes do login; convite do escritorio
  // permanece no formulario de nick. A referencia acompanha a rota.
  return res.set('Cache-Control','no-store').redirect(303,
   (origemLoja?'/loja?ref=':'/escritorio?ref=')+encodeURIComponent(nick));
 };
 app.get('/escritorio/:nick',redirecionarLinkDireto(false));
 app.get('/loja/:nick',redirecionarLinkDireto(true));
 app.get('/convite/loja',(req,res)=>{
  const nick=req.query?.ref;
  if(typeof nick!=='string'||!(/^[A-Za-z]{1,12}$/).test(nick))
   return res.status(400).type('text').send('Convite inválido');
  if(!verificarNickDivulgador({banco:contas.banco,nick}))
   return res.status(403).type('text').send('Link ainda não habilitado');
  return res.set('Cache-Control','no-store').redirect(303,
   '/loja?ref='+encodeURIComponent(nick));
 });
 app.post('/api/contas/sair',mutation,protegido,csrf,(req,res)=>{
  contas.sair(cookieValor(req));
  res.set('Set-Cookie',cookie('',true));
  return res.json({sessaoEncerrada:true});
 });
 app.post('/api/contas/email/solicitar',mutation,protegido,csrf,async(req,res)=>{
  if(!req.body||Array.isArray(req.body)||Object.keys(req.body).length!==0)
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  if(!limite(res,'solicitar',req.conta.titularId+':EMAIL'))return;
  try{
   return res.json(await contas.solicitarCodigo({
    titularId:req.conta.titularId,finalidade:'EMAIL'
   }));
  }catch(e){return falha(res,e);}
 });
 app.post('/api/contas/email/confirmar',mutation,protegido,csrf,async(req,res)=>{
  if(!req.body||Array.isArray(req.body)||Object.keys(req.body).join(',')!=='codigo')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  if(!limite(res,'confirmar',req.conta.titularId+':EMAIL'))return;
  try{
   return res.json(await contas.confirmarCodigo({
    titularId:req.conta.titularId,finalidade:'EMAIL',codigo:req.body.codigo
   }));
  }catch(e){return falha(res,e);}
 });
 // A troca dentro da sessão não usa o e-mail como identificador e
 // revoga todos os dispositivos do titular, sem afetar outras contas.
 app.post('/api/contas/senha/trocar',mutation,protegido,csrf,async(req,res)=>{
  const b=req.body;
  if(!b||Array.isArray(b)||
     Object.keys(b).sort().join(',')!=='novaSenha,senhaAtual')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  if(!limite(res,'trocar',req.conta.titularId))return;
  try{
   const resultado=await contas.trocarSenha({
    titularId:req.conta.titularId,
    senhaAtual:b.senhaAtual,novaSenha:b.novaSenha
   });
   res.set('Set-Cookie',cookie('',true));
   return res.json(resultado);
  }catch(e){return falha(res,e);}
 });
 app.post('/api/contas/senha/solicitar',mutation,async(req,res)=>{
  if(!req.body||Array.isArray(req.body)||Object.keys(req.body).join(',')!=='email')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  if(!limite(res,'solicitar',String(req.body.email)+':SENHA'))return;
  try{
   await contas.solicitarCodigo({email:req.body.email,finalidade:'SENHA'});
  }catch(e){
   // Não revelar se o e-mail existe nem se o provedor falhou.
   if(e.codigo==='EMAIL_INVALIDO')return res.status(400).json({erro:'EMAIL_INVALIDO'});
  }
  return res.status(202).json({solicitacaoRecebida:true,semRevelarCadastro:true});
 });
 app.post('/api/contas/senha/confirmar',mutation,async(req,res)=>{
  if(!req.body||Array.isArray(req.body)||
     Object.keys(req.body).sort().join(',')!=='codigo,email,novaSenha')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  if(!limite(res,'confirmar',String(req.body.email)+':SENHA'))return;
  try{return res.json(await contas.confirmarCodigo({
   email:req.body.email,codigo:req.body.codigo,
   novaSenha:req.body.novaSenha,finalidade:'SENHA'
  }));}catch(e){return falha(res,e);}
 });
 // Somente no laboratorio EXPLICITAMENTE montado: a propria sessao do
 // Escritorio consulta creditos ficticios e reserva saques de simulacao.
 // Sem rota para creditar saldo ou enviar dinheiro a provedores reais.
 app.get('/api/loop/tesouraria-ensaio',protegido,(req,res)=>{
  if(!tesourariaEnsaio)return res.status(503).json({
   erro:'TESOURARIA_ENSAIO_NAO_HABILITADA',financeiroReal:false
  });
  try{return res.json(tesourariaEnsaio.consultarTitularEnsaio({
   titularId:req.conta.titularId
  }));}catch{return res.status(503).json({erro:'ENSAIO_INDISPONIVEL'});}
 });
 app.post('/api/loop/tesouraria-ensaio/saques',mutation,protegido,csrf,
 (req,res)=>{
  if(!tesourariaEnsaio)return res.status(503).json({
   erro:'TESOURARIA_ENSAIO_NAO_HABILITADA',financeiroReal:false
  });
  const b=req.body;
  if(!b||Array.isArray(b)||
     Object.keys(b).sort().join(',')!==
     'chaveIdempotencia,saqueId,valorCentavos')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  try{
   return res.json(tesourariaEnsaio.solicitarSaqueEnsaio({
    titularId:req.conta.titularId,saqueId:b.saqueId,
    chaveIdempotencia:b.chaveIdempotencia,
    valorCentavos:b.valorCentavos
   }));
  }catch(e){
   const codigo=e.codigo||'ENSAIO_INDISPONIVEL';
   return res.status(
    codigo.includes('INVALIDO')?400:
    codigo.includes('INSUFICIENTE')||codigo.includes('REPLAY')?409:503
   ).json({erro:codigo});
  }
 });
 // Aceite individual da AZUL no mesmo SQLite, com titular da sessao e
 // documentos vigentes. Somente ensaio explicitamente conectado.
 // O cliente nunca pode escolher titular ou registrar movimentacao.
 app.post('/api/loop/posicoes/:posicaoId/confirmar-ensaio',
  mutation,protegido,csrf,(req,res)=>{
   if(!aceitePosicaoAzulEnsaio||process.env.NODE_ENV==='production')
    return res.status(404).json({erro:'CONFIRMACAO_AZUL_NAO_HOMOLOGADA'});
   const id=Number(req.params.posicaoId);
   if(!Number.isSafeInteger(id)||id<1||
      !req.body||Array.isArray(req.body)||
      Object.keys(req.body).sort().join(',')!==
       'aceiteExplicito,cpf,hashTermos,versaoTermos')
    return res.status(400).json({erro:'AZUL_CONFIRMACAO_INVALIDA'});
   try{
    const resultado=aceitePosicaoAzulEnsaio.confirmar({
     titularId:req.conta.titularId,posicaoId:id,
     cpf:req.body.cpf,aceiteExplicito:req.body.aceiteExplicito,
     versaoTermos:req.body.versaoTermos,
     hashTermos:req.body.hashTermos
    });
    return res.json({...resultado,confirmacaoSomenteEnsaio:true,
     identidadeExternaVerificada:false,financeiroReal:false});
   }catch(e){
    const codigo=e.codigo||'AZUL_CONFIRMACAO_INDISPONIVEL';
    const http=codigo==='AZUL_POSICAO_NAO_PERTENCE_A_CONTA'?404:
     codigo==='AZUL_PRAZO_DE_CONFIRMACAO_ENCERRADO'||
     codigo.includes('REPLAY')||codigo==='AZUL_PSP_EM_REVISAO'?409:
     codigo==='AZUL_CPF_OU_ACEITE_INVALIDO'||codigo==='AZUL_TERMOS_OU_EMAIL_INVALIDOS'?400:503;
    return res.status(http).json({erro:codigo});
   }
  });
 // Fonte operacional privada e auditavel, utilizada tambem pelo servidor
 // de preparacao. Sem consulta ao SQLite de homologacao e sem titular forjado.
 app.get('/internal/loop/tabuleiro',(req,res)=>{
  if(!autorizarInterno(req.get('x-loop-interservice-token'),
    process.env.LOOP_REAL_TABULEIRO_INTERSERVICE_TOKEN))
   return res.status(401).json({erro:'ACESSO_INTERNO_NEGADO'});
  try{return res.json(projetarTabuleiroOperacional({banco:contas.banco}));}
  catch(e){return res.status(503).json({erro:e.codigo||'FONTE_REAL_INDISPONIVEL'});}
 });
 // Estado interno do mesmo SQLite: somente leitura, titular da sessão.
 // Nunca receber titularId do navegador. Sem eventos ou posição de produção.
 // Contabilizacao operacional: somente livro real do titular autenticado.
 // Enquanto nao ha provas financeiras externas, saldo e movimento nunca
 // sao declarados DISPONIVEIS. Nenhuma rota HTTP posta creditos ou saques.
 app.get('/api/financeiro/me',protegido,(req,res)=>{
  if(!livroFinanceiro)return res.status(503).json({
   erro:'LIVRO_FINANCEIRO_NAO_CONECTADO'});
  const raw=req.query.posicaoId;
  if(Object.keys(req.query).some(x=>x!=='posicaoId')||
     (raw!==undefined&&(!/^[1-9][0-9]*$/.test(raw)||
      !Number.isSafeInteger(Number(raw)))))
   return res.status(400).json({erro:'POSICAO_INVALIDA'});
  try{
   const titularId=req.conta.titularId;
   const livro=livroFinanceiro.consultar({
    titularId,posicaoId:raw?Number(raw):null
   });
   // O mesmo contrato dos links apura o bonus; nunca soma uma previsao
   // ao saldo sacavel nem mistura beneficio com posicao do indicador.
   const bonus=consultarComissoesDivulgacao({banco:contas.banco,titularId});
   return res.json({...livro,
    ativacoesIndicadosEmConferencia:bonus.fonteCompleta?
     bonus.ativacoesValidas:null,
    bonusIndicacoesAConferirCentavos:bonus.fonteCompleta?
     bonus.comissaoAConferirCentavos:null,
    bonusIndicacoesEmConferenciaNaoSacavel:true
   });
  }catch(e){return res.status(
    e.codigo==='FIN_POSICAO_NAO_PERTENCE_A_TITULAR'?404:503
   ).json({erro:e.codigo||'LIVRO_FINANCEIRO_INDISPONIVEL'});}
 });
 app.get('/api/financeiro/historico',protegido,(req,res)=>{
  if(!livroFinanceiro)return res.status(503).json({
   erro:'LIVRO_FINANCEIRO_NAO_CONECTADO'});
  try{return res.json(livroFinanceiro.historico({
   titularId:req.conta.titularId
  }));}catch{return res.status(503).json({
   erro:'LIVRO_FINANCEIRO_INDISPONIVEL'});}
 });
 app.post('/api/financeiro/saques',mutation,protegido,csrf,(_req,res)=>
  res.status(503).json({erro:'SAQUE_REAL_NAO_HOMOLOGADO'}));
 app.get('/api/loop/estado',protegido,(req,res)=>{
  if(!motorLoop)return res.status(503).json({
   erro:'MOTOR_INTERNO_INDISPONIVEL',financeiroReal:false
  });
  try{
   const titular=visaoEscritorio.consultarEstado({
    titularId:req.conta.titularId
   });
   // A sessão cliente consulta a MESMA programação administrativa do
   // mesmo SQLite, mas nunca pode configurar a catraca nem executar giro.
   const controle=catracaCompartilhada?.consultar()??null;
   if(controle&&(
     controle.filaA!==titular.filaA||controle.filaB!==titular.filaB||
     controle.eventosNoCiclo!==titular.tabuleiro.eventosNoCiclo||
     controle.girosTotais!==titular.catraca.giros))
    throw Error('TABULEIRO_CLIENTE_OPERADOR_DIVERGENTE');
   return res.set('Cache-Control','private, no-store').json({
    ...titular,
    ...(controle?{
     agenda:projetarAgendaTabuleiroCompartilhada(controle),
     catraca:{...titular.catraca,giros24h:controle.giros24h}
    }:{}),
    confirmacaoAzulEnsaioDisponivel:aceitePosicaoAzulEnsaio!==null&&
     process.env.NODE_ENV!=='production'
   });
  }catch{return res.status(503).json({erro:'MOTOR_INTERNO_INDISPONIVEL'});}
 });

 // Fila paginada sem CPF, nick ou titulares de terceiros. A âncora é
 // comprovada pelo motor contra a sessão, nunca por um ID arbitrário.
 app.get('/api/loop/fila',protegido,(req,res)=>{
  if(!motorLoop)return res.status(503).json({erro:'MOTOR_INTERNO_INDISPONIVEL'});
  if(Object.keys(req.query).some(k=>!['fila','posicaoId','pagina','desdeInicio'].includes(k))||
     !['A','B'].includes(req.query.fila)||
     (req.query.posicaoId!==undefined&&
      (typeof req.query.posicaoId!=='string'||
       !/^[1-9][0-9]*$/.test(req.query.posicaoId)))||
     (req.query.pagina!==undefined&&
      (typeof req.query.pagina!=='string'||
       !/^(0|[1-9][0-9]*)$/.test(req.query.pagina)))||
     (req.query.desdeInicio!==undefined&&req.query.desdeInicio!=='1'))
   return res.status(400).json({erro:'PARAMETROS_FILA_INVALIDOS'});
  const posicaoId=req.query.posicaoId===undefined?null:Number(req.query.posicaoId);
  const pagina=req.query.pagina===undefined?0:Number(req.query.pagina);
  const desdeInicio=req.query.desdeInicio==='1';
  if((posicaoId!==null&&!Number.isSafeInteger(posicaoId))||
     !Number.isSafeInteger(pagina)||pagina>1000000)
   return res.status(400).json({erro:'PARAMETROS_FILA_INVALIDOS'});
  try{return res.set('Cache-Control','private, no-store').json(
   motorLoop.consultarFilaPaginada({
    titularId:req.conta.titularId,fila:req.query.fila,posicaoId,pagina,desdeInicio
   }));}
  catch(e){return res.status(
   e.codigo==='FILA_POSICAO_NAO_PERTENCE_A_TITULAR'?404:503
  ).json({erro:e.codigo||'FILA_INDISPONIVEL'});}
 });
 // Comprovantes comerciais estão no MESMO SQLite da conta e do pedido.
 // Apenas consulta por titular autenticado; sem criação de posições.
 app.get('/api/loop/eventos-comerciais',protegido,(req,res)=>{
  if(!eventosComerciais)return res.status(503).json({
   erro:'EVENTOS_COMERCIAIS_AINDA_NAO_CONFIGURADOS'
  });
  try{return res.json(eventosComerciais.consultarTitular({
   titularId:req.conta.titularId
  }));}catch{return res.status(503).json({erro:'EVENTOS_INDISPONIVEIS'});}
 });
 // Capacidade previa no mesmo SQLite do motor e do pedido. Apenas leitura.
 // Nunca recebe titularId da URL; nao autoriza cotacao, checkout ou Pix.
 app.get('/api/loja/capacidade',protegido,(req,res)=>{
  if(!preflightCapacidade)return res.status(503).json({
   erro:'CAPACIDADE_CHECKOUT_NAO_CONFIGURADA',checkoutReal:false
  });
  try{
   return res.json({...preflightCapacidade.consultar({
    titularId:req.conta.titularId
   }),checkoutReal:false,fonte:'MOTOR_E_RESERVAS_SQLITE'});
  }catch{return res.status(503).json({
   erro:'CAPACIDADE_CHECKOUT_INDISPONIVEL',checkoutReal:false
  });}
 });
 // Pré-vitrine de itens publicados: somente leitura; nenhum preço
 // estimado, carrinho ou estoque antes de fornecedor homologado.
 // A vitrine PUBLICADA e somente leitura: visitante pode explorar antes
 // de se cadastrar, mas pedidos, saques, checkout e rascunhos seguem privados.
 app.get('/api/loja/catalogo',(_req,res)=>{
  if(!catalogoVitrine&&!catalogoMidiaLeitura)return res.status(503).json({
   erro:'CATALOGO_NAO_CONECTADO',checkoutReal:false
  });
  try{
   const central=catalogoVitrine?
    catalogoVitrine.listarVitrinePreparacao({limite:400}):[];
   const principal=catalogoMidiaLeitura&&Array.isArray(central)?
    central.map(p=>Object.freeze({
     ...p,fotos:catalogoMidiaLeitura.listarFotosProdutoCompartilhado({
      produtoId:p.produtoId
     })
    })):central;
   const midia=catalogoMidiaLeitura?
    catalogoMidiaLeitura.listarVitrinePreparacao({limite:400}):[];
   if(!Array.isArray(principal)||!Array.isArray(midia))
    throw Error('CATALOGO_ORIGEM_NAO_CONFIAVEL');
   const produtos=[...principal,...midia];
   const ids=new Set(produtos.map(p=>p.produtoId));
   // Conflito entre bancos não pode ser mascarado por sobrescrita.
   if(ids.size!==produtos.length)throw Error('CATALOGO_IDS_DUPLICADOS');
   if(!Array.isArray(produtos)||produtos.length>400||
      produtos.some(p=>p.compravel!==false||
       p.checkoutReal!==false||p.precoCentavos!==null||
       typeof p.titulo!=='string'||p.titulo.length>150||
       typeof p.novidade!=='boolean'||
       !Number.isSafeInteger(p.criadoEm)||p.criadoEm<1||
       !Number.isSafeInteger(p.unidadesConfirmadas)||
       p.unidadesConfirmadas<0))
    throw Error('VITRINE_NAO_CONFIAVEL');
   const posicoes=posicoesVitrine?
    posicoesVitrine.projetar(produtos):produtos;
   const publicados=anunciosManuais?
    anunciosManuais.projetar(posicoes):posicoes;
   const layoutVazio=posicoesVitrine?
    posicoesVitrine.consultarLayoutVazio():null;
   return res.json({produtos:publicados,total:publicados.length,
    layoutVazio,
    origem:'CATALOGO_ADMINISTRATIVO_PUBLICADO',checkoutReal:false,
    estoqueConfirmado:false,precosNaoHomologados:true});
  }catch{
   return res.status(503).json({erro:'CATALOGO_INDISPONIVEL',
    checkoutReal:false});
  }
 });
 // Avaliações públicas vêm exclusivamente de pedidos verificados.
 // Nenhuma API publica avaliações de fantasia nem expõe dados pessoais.
 app.get('/api/loja/produtos/:produtoId/avaliacoes',(_req,res)=>{
  const produtoId=_req.params.produtoId;
  if(typeof produtoId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(produtoId))
   return res.status(404).json({erro:'PRODUTO_INVALIDO'});
  if(!catalogoVitrine||!avaliacoesProduto)
   return res.status(503).json({erro:'AVALIACOES_INDISPONIVEIS'});
  try{
   const publicado=catalogoVitrine.listarVitrinePreparacao({limite:400})
    .some(p=>p.produtoId===produtoId);
   if(!publicado)return res.status(404).json({erro:'PRODUTO_NAO_PUBLICADO'});
   return res.set('Cache-Control','public, max-age=60')
    .json(avaliacoesProduto.listar({produtoId,limite:25}));
  }catch{return res.status(503).json({erro:'AVALIACOES_INDISPONIVEIS'});}
 });
 // A foto de produto publicado usa a MESMA sessão cliente da loja.
 // Nunca encaminha cookies para o banco de imagens e não expõe rascunhos.
 app.get('/api/loja/produtos/:produtoId/foto/:posicao',(req,res)=>{
   const id=req.params.produtoId,indice=req.params.posicao;
   // Mesma regra de identificador do catalogo comercial definitivo:
   // IDs legados preservam maiusculas e _ sem publicar rascunhos.
   if(!/^[A-Za-z0-9_-]{1,80}$/.test(id)||
      !/^(?:10|[1-9])$/.test(indice))
    return res.status(404).json({erro:'FOTO_NAO_ENCONTRADA'});
   if(!catalogoMidiaLeitura)
    return res.status(503).json({erro:'CATALOGO_MIDIA_INDISPONIVEL'});
   try{
    const imagem=catalogoMidiaLeitura.abrirFotoPublicada({
     produtoId:id,posicao:Number(indice)
    });
    if(!Buffer.isBuffer(imagem?.dados)||
       !['image/jpeg','image/png','image/webp'].includes(imagem?.mime))
     throw Error('FOTO_INTEGRIDADE_INVALIDA');
    return res.set('Cache-Control','private, no-store')
     .type(imagem.mime).send(imagem.dados);
   }catch(e){
    if(['FOTO_NAO_ENCONTRADA','FOTO_NAO_PUBLICADA'].includes(e?.message))
     return res.status(404).json({erro:'FOTO_NAO_ENCONTRADA'});
    return res.status(503).json({erro:'FOTO_PUBLICA_INDISPONIVEL'});
   }
  });
 // Consulta de capacidade da loja vinculada à mesma conta. Sem produto
 // real aprovado ou integração de fornecedor, nenhum carrinho pode pagar.
 app.get('/api/loja/estado',protegido,(_req,res)=>res.json({
  titularAutenticado:true,loja:'AKITEMM',contaUnica:true,
  catalogoComercialDisponivel:false,fornecedoresAtivos:0,
  vitrinePreparacaoConectada:catalogoVitrine!==null||
   catalogoMidiaLeitura!==null,
  checkoutReal:false,financeiroReal:false,
  carrinhoInternoDisponivel:true
 }));
 // "Meus Pedidos" mostra somente registros comerciais existentes e
 // remessas do próprio titular, nunca catálogo fictício ou dados de outro
 // cliente. Sem PSP/fornecedores homologados, responde 503 (não inventa).
 app.get('/api/loja/pedidos',protegido,(req,res)=>{
  if(!pedidosComerciais||!remessasOutbox)
   return res.status(503).json({
    erro:'PEDIDOS_REAIS_AINDA_NAO_INTEGRADOS',checkoutReal:false
   });
  const paginaBruta=req.query?.pagina;
  if(paginaBruta!==undefined&&
     (typeof paginaBruta!=='string'||!/^(0|[1-9][0-9]*)$/.test(paginaBruta)||
      !Number.isSafeInteger(Number(paginaBruta))))
   return res.status(400).json({erro:'PAGINA_INVALIDA'});
  const pagina=paginaBruta===undefined?0:Number(paginaBruta);
  const tamanho=20,offset=pagina*tamanho;
  if(!Number.isSafeInteger(offset))
   return res.status(400).json({erro:'PAGINA_INVALIDA'});
  try{
   const titularId=req.conta.titularId;
   const total=pedidosComerciais.contarDoTitular({titularId});
   const base=pedidosComerciais.listarDoTitular({
    titularId,limite:tamanho,offset
   });
   if(!Number.isSafeInteger(total)||total<0||
      !Array.isArray(base)||base.length>tamanho)
    throw Error('PEDIDOS_PAGINACAO_INCONSISTENTE');
   const pedidos=base.map(pedido=>{
    const fornecedores=Array.isArray(pedido.fornecedores)?
     pedido.fornecedores:
     (pedido.fornecedorId?[pedido.fornecedorId]:[]);
    if(typeof pedido.pedidoId!=='string'||fornecedores.length>25)
     throw Error('PEDIDO_INVALIDO');
    const remessas=fornecedores.map(fornecedorId=>{
     const remessa=remessasOutbox.consultar({
      pedidoId:pedido.pedidoId,fornecedorId
     });
     return {fornecedorId,
      estado:remessa?.estado||'AGUARDANDO_SEPARACAO',
      pedidoParceiroId:remessa?.pedidoParceiroId||null};
    });
    return {pedidoId:pedido.pedidoId,status:pedido.status,
     criadoEm:pedido.criadoEm,valorTotalCentavos:pedido.valorTotalCentavos,
     quantidadeDistribuidores:fornecedores.length,remessas};
   });
   return res.json({pedidos,totalExibido:pedidos.length,
    paginacao:{pagina,tamanho,total,
     haAnterior:pagina>0,haMais:offset+pedidos.length<total},
    fonte:'PEDIDOS_COMERCIAIS_DO_TITULAR',
    checkoutRealHabilitadoPorEstaConsulta:false});
  }catch{return res.status(503).json({erro:'PEDIDOS_INDISPONIVEIS'});}
 });
 // Carrinho de itens interno: autenticação, CPF da sessão, CSRF e SQLite
 // do titular real. NÃO cria pedido, custo, cotação, bônus, posição ou Pix.
 function publicacoesCarrinho(){
  if(!catalogoVitrine&&!catalogoMidiaLeitura)
   throw Error('CARRINHO_CATALOGO_INDISPONIVEL');
  const a=catalogoVitrine?
   catalogoVitrine.listarVitrinePreparacao({limite:400}):[];
  const b=catalogoMidiaLeitura?
   catalogoMidiaLeitura.listarVitrinePreparacao({limite:400}):[];
  if(!Array.isArray(a)||!Array.isArray(b)||a.length+b.length>400)
   throw Error('CARRINHO_CATALOGO_INVALIDO');
  const produtos=new Map();
  for(const item of [...a,...b]){
   if(typeof item?.produtoId!=='string'||
      !/^[A-Za-z0-9_-]{1,80}$/.test(item.produtoId)||
      typeof item.titulo!=='string'||item.titulo.length<2||
      item.compravel!==false||item.checkoutReal!==false||
      produtos.has(item.produtoId))
    throw Error('CARRINHO_CATALOGO_INVALIDO');
   produtos.set(item.produtoId,item);
  }
  return produtos;
 }
 function projetarCarrinho(titularId){
  const c=carrinhoInterno.listar({titularId});
  let publicados=new Map(),catalogoDisponivel=false;
  try{publicados=publicacoesCarrinho();catalogoDisponivel=true;}
  catch{
   // Permitir remover um item mesmo quando o catálogo está indisponível.
  }
  return {...c,catalogoDisponivel,
   itens:c.itens.map(x=>{
    const produto=publicados.get(x.produtoId);
    return {...x,
     titulo:produto?.titulo||'Produto indisponível',
     publicado:!!produto,tipo:produto?.tipo||null,
     cor:produto?.cor||null,precoCentavos:null,
     compravel:false,estoqueConfirmado:false};
   })
  };
 }
 // Última etapa INTERNA antes da futura conexão de fornecedores e PSP.
 // Consolida apenas leituras do mesmo titular/banco: não faz cotação,
 // pedido, reserva, cobrança, comissão, saque ou giro do LOOP.
 app.get('/api/loja/preparacao-compra',protegido,(req,res)=>{
  try{
   const titularId=req.conta.titularId;
   const carrinho=projetarCarrinho(titularId);
   const pendentes=carrinho.itens.filter(item=>!item.publicado)
    .map(item=>item.produtoId);
   const internos=[];
   if(!carrinho.catalogoDisponivel)
    internos.push('CATALOGO_PUBLICADO_INDISPONIVEL');
   if(!pedidosComerciais||!remessasOutbox)
    internos.push('HISTORICO_PEDIDOS_NAO_CONECTADO');
   if(!preflightCapacidade)
    internos.push('CAPACIDADE_POSICOES_NAO_CONECTADA');
   const capacidade=preflightCapacidade?
    preflightCapacidade.consultar({titularId}):null;
   const quantidadePedidos=pedidosComerciais&&remessasOutbox?
    pedidosComerciais.contarDoTitular({titularId}):null;
   if(quantidadePedidos!==null&&
      (!Number.isSafeInteger(quantidadePedidos)||quantidadePedidos<0))
    throw Error('PEDIDOS_CONTAGEM_INCONSISTENTE');
   if(pendentes.length)internos.push('PRODUTOS_CARRINHO_NAO_PUBLICADOS');
   return res.set('Cache-Control','private, no-store').json({
    fonte:'AKITEMM_PREPARACAO_COMPRA_INTERNA_REAL',
    titularAutenticado:true,contaUnica:true,
    etapasInternas:{
     catalogo:carrinho.catalogoDisponivel,
     carrinhoPersistente:true,
     historicoPedidos:!!pedidosComerciais&&!!remessasOutbox,
     capacidadeLoop:!!preflightCapacidade
    },
    carrinho:{
     itensDistintos:carrinho.itensDistintos,
     quantidadeTotal:carrinho.quantidadeTotal,
     produtosNaoPublicados:pendentes,
     estado:carrinho.itensDistintos===0?'VAZIO':
      pendentes.length?'REVISAR_PRODUTOS':'PUBLICADOS'
    },
    pedidos:{total:quantidadePedidos},capacidade,
    caminhoInternoIntegrado:internos.length===0,
    pendenciasInternas:internos,
    dependeExterno:[
     'FORNECEDORES_HOMOLOGADOS',
     'PRECO_ESTOQUE_E_FRETE_CONFIAVEIS',
     'PSP_E_CONCILIACAO_FINANCEIRA',
     'EXPEDICAO_E_ENTREGA'
    ],
    precosConfirmados:false,checkoutReal:false,financeiroReal:false,
    criaPedido:false,criaPosicao:false,autorizaCobranca:false
   });
  }catch{
   return res.status(503).json({
    erro:'PREPARACAO_COMPRA_INTERNA_INDISPONIVEL',
    checkoutReal:false,financeiroReal:false
   });
  }
 });
 const erroCarrinho=(res,e)=>{
  const codigo=e?.codigo||'CARRINHO_INDISPONIVEL';
  return res.status(['CARRINHO_QUANTIDADE_INVALIDA',
   'CARRINHO_PRODUTO_INVALIDO','CARRINHO_TITULAR_INVALIDO'].includes(codigo)?400:
   codigo==='CARRINHO_LIMITE_ITENS'?409:503).json({
    erro:codigo,checkoutReal:false
   });
 };
 app.get('/api/loja/carrinho',protegido,(req,res)=>{
  try{return res.set('Cache-Control','private, no-store')
   .json(projetarCarrinho(req.conta.titularId));}
  catch(e){return erroCarrinho(res,e);}
 });
 app.post('/api/loja/carrinho/itens',protegido,mutation,csrf,(req,res)=>{
  const b=req.body;
  if(!b||Array.isArray(b)||
     Object.keys(b).sort().join(',')!=='produtoId,quantidade')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS',checkoutReal:false});
  if(!limite(res,'carrinho',req.conta.titularId))return;
  try{
   if(!Number.isSafeInteger(b.quantidade)||b.quantidade<0||
      b.quantidade>50||typeof b.produtoId!=='string'||
      !/^[A-Za-z0-9_-]{1,80}$/.test(b.produtoId))
    return res.status(400).json({erro:'CARRINHO_ITEM_INVALIDO',checkoutReal:false});
   if(b.quantidade>0&&!publicacoesCarrinho().has(b.produtoId))
    return res.status(404).json({erro:'PRODUTO_NAO_PUBLICADO',checkoutReal:false});
   carrinhoInterno.definir({
    titularId:req.conta.titularId,produtoId:b.produtoId,
    quantidade:b.quantidade
   });
   return res.set('Cache-Control','private, no-store')
    .json(projetarCarrinho(req.conta.titularId));
  }catch(e){return erroCarrinho(res,e);}
 });
 // A taxa nao aparece na vitrine: calculo so apos cliente informar CEP.
 // Consulta o municipio no servidor e confere todos os itens do carrinho.
 // Nao confirma frete nacional, nao habilita pagamento nem grava pedido.
 app.post('/api/loja/entrega/verificar-cep',
  protegido,mutation,csrf,async(req,res)=>{
   const b=req.body;
   if(!b||Array.isArray(b)||Object.keys(b).join(',')!=='cep'||
      typeof b.cep!=='string'||!/^\d{5}-?\d{3}$/.test(b.cep))
    return res.status(400).json({
     erro:'ENTREGA_CEP_INVALIDO',checkoutReal:false});
   if(!limite(res,'carrinho',req.conta.titularId))return;
   if(!entregaLocal)return res.status(503).json({
    erro:'ENTREGA_REGIONAL_INDISPONIVEL',checkoutReal:false});
   try{
    const carrinho=carrinhoInterno.listar({
     titularId:req.conta.titularId});
    if(!Array.isArray(carrinho.itens)||carrinho.itens.length===0)
     return res.status(409).json({
      erro:'ENTREGA_CARRINHO_VAZIO',checkoutReal:false});
    const publicos=publicacoesCarrinho();
    if(carrinho.itens.some(i=>!publicos.has(i.produtoId)))
     return res.status(409).json({
      erro:'ENTREGA_PRODUTO_NAO_PUBLICADO',checkoutReal:false});
    const local=await localizarCepBrasil(b.cep);
    const calculo=entregaLocal.validarCarrinho({
     produtos:carrinho.itens.map(i=>i.produtoId),
     uf:local.uf,cidade:local.cidade
    });
    return res.set('Cache-Control','private, no-store')
     .status(calculo.entregaDisponivel?200:422).json({
      ...calculo,uf:local.uf,cidade:local.cidade,
      consultaMunicipioConfiavel:true,
      taxaDefinitivaDePedido:false,
      checkoutReal:false,autorizaCobranca:false
     });
   }catch(e){
    const codigo=e?.codigo||'ENTREGA_CONSULTA_INDISPONIVEL';
    return res.status(codigo==='ENTREGA_CEP_INVALIDO'?400:
     codigo==='ENTREGA_CEP_NAO_LOCALIZADO'?404:503).json({
      erro:codigo,checkoutReal:false,autorizaCobranca:false
     });
   }
  });
 app.post('/api/loja/carrinho/limpar',protegido,mutation,csrf,(req,res)=>{
  if(!req.body||Array.isArray(req.body)||
     Object.keys(req.body).length!==0)
   return res.status(400).json({erro:'CAMPOS_INVALIDOS',checkoutReal:false});
  if(!limite(res,'carrinho',req.conta.titularId))return;
  try{
   carrinhoInterno.limpar({titularId:req.conta.titularId});
   return res.set('Cache-Control','private, no-store')
    .json(projetarCarrinho(req.conta.titularId));
  }catch(e){return erroCarrinho(res,e);}
 });
 app.all(new RegExp('^/api/loja(?:/|$)'),(_req,res)=>res.status(503).json({
  erro:'OPERACAO_COMERCIAL_NAO_HABILITADA',checkoutReal:false
 }));
 // As funcionalidades financeiras continuam fora deste serviço,
 // mesmo com a conta cadastrada e o e-mail confirmado.
 app.all(/^\/api\/(checkout|saques|posicoes|comissoes)(?:\/|$)/,(_req,res)=>
  res.status(503).json({erro:'OPERACAO_FINANCEIRA_NAO_HABILITADA'}));
 return app;
}
module.exports={criarAppIdentidadeLoop};
