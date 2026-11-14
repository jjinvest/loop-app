'use strict';
// Entrada de cliente real. É um serviço NOVO e isolado, não utiliza
// src/candidato e nunca monta as rotas de laboratório ou dinheiro.
const express=require('express');
const {COOKIE}=require('./identidade-cliente-loop-sqlite');
const {montarInterfaceAprovada}=require('./interface-aprovada-loop');
const {montarGatewayAdminComercial}=require('./gateway-admin-comercial');
const {VisaoEscritorioUnificadaSQLite}=
 require('./visao-escritorio-unificada-sqlite');
const {autorizarInterno,projetarTabuleiroOperacional}=
 require('./leitura-tabuleiro-operacional-real');
function criarAppIdentidadeLoop({contas,origemHttps,
 permitirCadastro=false,backupEstado=null,
 pedidosComerciais=null,remessasOutbox=null,catalogoVitrine=null,
 adminComercial=null,
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
 const visaoEscritorio=motorLoop===null?null:
  new VisaoEscritorioUnificadaSQLite({banco:contas.banco,motor:motorLoop});
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
 // HTML/CSS já aprovados; loja requer a mesma sessão da conta.
 montarInterfaceAprovada(app,{protegerLoja:protegido});
 // Sessão de administrador é completamente separada do login de cliente.
 // Sem credencial e middleware de operador, rotas administrativas não existem.
 if(adminComercial!==null)
  montarGatewayAdminComercial(app,{...adminComercial,origemHttps,motorLoop});
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
     code==='CREDENCIAL_ALTERADA_CONCORRENTEMENTE')
   return res.status(409).json({erro:code});
  if(['NOME_INVALIDO','EMAIL_INVALIDO','NICK_INVALIDO','SENHA_INVALIDA',
   'CODIGO_INVALIDO','SENHA_NOVA_DEVE_SER_DIFERENTE',
   'INDICADOR_INVALIDO','AUTOINDICACAO_PROIBIDA',
   'INDICADOR_NAO_ENCONTRADO'].includes(code))
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
 app.get('/api/contas/documentos',(_req,res)=>{
  if(!cadastroLiberado())return res.status(503).json({erro:'CADASTRO_INATIVO'});
  res.json(contas.documentos());
 });
 app.post('/api/contas/cadastrar',mutation,async(req,res)=>{
  if(!cadastroLiberado())return res.status(503).json({erro:'CADASTRO_INATIVO'});
  const b=req.body;
  if(!b||Array.isArray(b)||![
    'aceitePrivacidade,aceiteTermos,email,hashPrivacidade,hashTermos,nick,nome,senha,versaoPrivacidade,versaoTermos',
    'aceitePrivacidade,aceiteTermos,email,hashPrivacidade,hashTermos,indicadorNick,nick,nome,senha,versaoPrivacidade,versaoTermos'
   ].includes(Object.keys(b).sort().join(',')))
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  if(!limite(res,'cadastro',b.email))return;
  try{
   const result=await contas.cadastrar(b);
   return res.status(201).json(result);
  }catch(e){return falha(res,e);}
 });
 app.post('/api/contas/entrar',mutation,async(req,res)=>{
  const b=req.body;
  if(!b||Array.isArray(b)||Object.keys(b).sort().join(',')!=='nick,senha')
   return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
  if(!limite(res,'login',b.nick))return;
  try{
   const result=await contas.entrar(b);
   res.set('Set-Cookie',cookie(result.token));
   return res.json({
    titularId:result.titularId,nick:result.nick,csrf:result.csrf,
    expiraEm:result.expiraEm,emailVerificado:result.emailVerificado,
    pagamentoReal:false,motorLoopInterno:motorLoop!==null,
    tesourariaEnsaioAtiva:tesourariaEnsaio!==null
   });
  }catch(e){return falha(res,e);}
 });
 app.get('/api/contas/me',protegido,(req,res)=>res.json({
  titularId:req.conta.titularId,nick:req.conta.nick,
  emailVerificado:req.conta.emailVerificado,
  csrf:req.conta.csrf,expiraEm:req.conta.expiraEm,
  lojaEEscritorioMesmaConta:true,financeiroReal:false,
  motorLoopInterno:motorLoop!==null,
  tesourariaEnsaioAtiva:tesourariaEnsaio!==null
 }));
 // Direito de acesso: o titular consulta somente os seus próprios dados
 // e a versão dos documentos aceitos. Sem IDs escolhidos pelo navegador.
 app.get('/api/contas/meus-dados',protegido,(req,res)=>{
  try{return res.json(contas.dadosTitular(req.conta.titularId));}
  catch{return res.status(503).json({erro:'DADOS_INDISPONIVEIS'});}
 });
 // Convite registra somente um cadastro, sem ativar comissão, dinheiro ou posição.
 app.get('/api/contas/minha-rede',protegido,(req,res)=>{
  const bruto=req.query?.offset;
  if(bruto!==undefined&&(
     typeof bruto!=='string'||!/^(0|[1-9][0-9]*)$/.test(bruto)||
     !Number.isSafeInteger(Number(bruto))))
   return res.status(400).json({erro:'PAGINACAO_INVALIDA'});
  const offset=bruto===undefined?0:Number(bruto);
  try{return res.json(visaoEscritorio?
   visaoEscritorio.listarRede({titularId:req.conta.titularId,offset}):
   contas.listarIndicados(req.conta.titularId,{offset}));}
  catch{return res.status(503).json({erro:'REDE_INDISPONIVEL'});}
 });
 app.get('/convite/loja',(req,res)=>{
  const nick=req.query?.ref;
  if(typeof nick!=='string'||!(/^[A-Za-z]{1,12}$/).test(nick))
   return res.status(400).type('text').send('Convite inválido');
  return res.redirect(303,'/escritorio?ref='+encodeURIComponent(nick)+'&origem=loja');
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
 app.get('/api/loop/estado',protegido,(req,res)=>{
  if(!motorLoop)return res.status(503).json({
   erro:'MOTOR_INTERNO_INDISPONIVEL',financeiroReal:false
  });
  try{return res.json({
   ...visaoEscritorio.consultarEstado({titularId:req.conta.titularId}),
   confirmacaoAzulEnsaioDisponivel:aceitePosicaoAzulEnsaio!==null&&
    process.env.NODE_ENV!=='production'
  });}
  catch{return res.status(503).json({erro:'MOTOR_INTERNO_INDISPONIVEL'});}
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
 app.get('/api/loja/catalogo',protegido,(_req,res)=>{
  if(!catalogoVitrine)return res.status(503).json({
   erro:'CATALOGO_NAO_CONECTADO',checkoutReal:false
  });
  try{
   const produtos=catalogoVitrine.listarVitrinePreparacao({limite:100});
   if(!Array.isArray(produtos)||produtos.length>100||
      produtos.some(p=>p.compravel!==false||
       p.checkoutReal!==false||p.precoCentavos!==null||
       typeof p.titulo!=='string'||p.titulo.length>150||
       typeof p.novidade!=='boolean'||
       !Number.isSafeInteger(p.criadoEm)||p.criadoEm<1||
       !Number.isSafeInteger(p.unidadesConfirmadas)||
       p.unidadesConfirmadas<0))
    throw Error('VITRINE_NAO_CONFIAVEL');
   return res.json({produtos,total:produtos.length,
    origem:'CATALOGO_ADMINISTRATIVO_PUBLICADO',checkoutReal:false,
    estoqueConfirmado:false,precosNaoHomologados:true});
  }catch{
   return res.status(503).json({erro:'CATALOGO_INDISPONIVEL',
    checkoutReal:false});
  }
 });
 // Consulta de capacidade da loja vinculada à mesma conta. Sem produto
 // real aprovado ou integração de fornecedor, nenhum carrinho pode pagar.
 app.get('/api/loja/estado',protegido,(_req,res)=>res.json({
  titularAutenticado:true,loja:'AKITEMM',contaUnica:true,
  catalogoComercialDisponivel:false,fornecedoresAtivos:0,
  vitrinePreparacaoConectada:catalogoVitrine!==null,
  checkoutReal:false,financeiroReal:false
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
