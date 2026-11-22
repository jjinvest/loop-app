'use strict';
const express=require('express');
const {createHash}=require('node:crypto');
const {validar:validarFotoOperador}=require('../domain/akitemm-midia-avaliacoes-demo');
const {COOKIE_ADMIN}=require('./sessao-admin-comercial-sqlite');
const {OperacaoCatracaAdminSQLite}=require('./operacao-catraca-admin-sqlite');
const {projetarAgendaTabuleiroCompartilhada}=
 require('./projecao-agenda-tabuleiro-compartilhada');
const {diagnosticarCadeiaPedidosFilas}=
 require('./diagnostico-cadeia-pedidos-filas');
const {analisarQualificacaoPedidosReal}=
 require('./avaliador-qualificacao-pedidos-real');
const {montarAdminComercialAprovado}=
 require('./interface-admin-comercial-aprovada');
const {montarRotasCatalogoMidiaOperador}=
 require('./rotas-catalogo-midia-operador');
function erro(c){const e=new Error(c);e.codigo=c;throw e;}
function montarGatewayAdminComercial(app,{
 sessoes,controle,catalogo,auditoria=null,manutencao=null,
 catalogoMidia=null,posicoesVitrine=null,anunciosManuais=null,
 bannersAkitemm=null,
 contas=null,atendimento=null,
 entregaLocal=null,
 pedidosComerciais=null,
 motorLoop=null,operacaoCatraca=null,
 integradorComercialEnsaio=null,jornadaComercialEnsaio=null,
 recuperacaoReservas=null,classificacaoLoop=null,origemHttps
}={}){
 if(typeof sessoes?.autenticar!=='function'||
    typeof sessoes?.sessao!=='function'||
    typeof sessoes?.sair!=='function'||
    !controle||!catalogo||typeof origemHttps!=='string'||
    (auditoria!==null&&typeof auditoria.verificar!=='function')||
    (process.env.NODE_ENV==='production'&&
     (auditoria===null||manutencao===null)))
  erro('ADMIN_REAL_SEM_CUSTODIA');
 let origem;
 try{
  const u=new URL(origemHttps);
  if(u.protocol!=='https:'||u.pathname!=='/'||u.search||u.hash)
   erro('ADMIN_REAL_ORIGEM_INVALIDA');
  origem=u.origin;
 }catch{erro('ADMIN_REAL_ORIGEM_INVALIDA');}
 const catraca=motorLoop===null?null:(operacaoCatraca||
  new OperacaoCatracaAdminSQLite({banco:motorLoop.banco,motor:motorLoop}));
 if(catraca&&catraca.motor!==motorLoop)erro('CATRACA_ADMIN_NAO_E_O_MESMO_MOTOR');
 if(integradorComercialEnsaio!==null&&(
   integradorComercialEnsaio.motor!==motorLoop||
   integradorComercialEnsaio.db!==motorLoop?.banco))
  erro('INTEGRACAO_ADMIN_NAO_E_O_MESMO_MOTOR');
 if(jornadaComercialEnsaio!==null&&(
   process.env.NODE_ENV==='production'||
   jornadaComercialEnsaio.db!==motorLoop?.banco||
   jornadaComercialEnsaio.integracao!==integradorComercialEnsaio||
   typeof jornadaComercialEnsaio.consultarStatus!=='function'||
   typeof jornadaComercialEnsaio.reprocessarRemessas!=='function'))
  erro('JORNADA_ADMIN_NAO_E_O_MESMO_MOTOR_DE_ENSAIO');
 if(recuperacaoReservas!==null&&(
   recuperacaoReservas.db!==motorLoop?.banco||
   typeof recuperacaoReservas.consultar!=='function'||
   typeof recuperacaoReservas.reconsultarVencidas!=='function'))
  erro('ADMIN_RECUPERACAO_RESERVAS_MOTOR_DIVERGENTE');
 const cookieValor=req=>{
  const raw=req.get('cookie')||'';
  if(raw.length>4096)return null;
  const encontrados=raw.split(';').map(x=>x.trim())
   .filter(x=>x.startsWith(COOKIE_ADMIN+'='));
  if(encontrados.length!==1)return null;
  const valor=encontrados[0].slice(COOKIE_ADMIN.length+1);
  return /^[a-f0-9]{64}$/.test(valor)?valor:null;
 };
 const cookie=(token,apagar=false)=>[
  COOKIE_ADMIN+'='+token,'HttpOnly','Secure','SameSite=Strict',
  'Path=/','Max-Age='+(apagar?'0':'7200')
 ].join('; ');
 const proteger=(req,res,next)=>{
  const token=cookieValor(req),sessao=sessoes.sessao(token);
  if(!sessao){
   if(req.method==='GET'&&req.path==='/administrador')
    return res.redirect(303,'/administrador/entrar');
   return res.status(401).json({erro:'OPERADOR_NAO_AUTENTICADO'});
  }
  req.operador=sessao;req.tokenOperador=token;
  next();
 };
 // A loja e o Escritorio consultam a MESMA sessao de operador real.
 // Nunca promove a sessao do cliente a privilegio administrativo.
 app.get('/api/operador/estado',(req,res)=>{
  res.set('Cache-Control','no-store');
  return res.json({operador:Boolean(sessoes.sessao(cookieValor(req)))});
 });
 // Entrada única: o login do escritório usa a mesma sessão administrativa
 // que /administrador/entrar; nunca cria operador numa conta de cliente.
 app.post('/api/operador/entrar',(req,res)=>{
  res.set('Cache-Control','no-store');
  if(req.get('origin')!==origem)
   return res.status(403).json({erro:'ORIGEM_ADMIN_INVALIDA'});
  if(!req.is('application/json')||
     !req.body||Array.isArray(req.body)||
     Object.keys(req.body).sort().join(',')!=='nick,senha'||
     typeof req.body.nick!=='string'||
     req.body.nick.trim().toLowerCase()!=='operador'||
     typeof req.body.senha!=='string')
   return res.status(400).json({erro:'CAMPOS_OPERADOR_INVALIDOS'});
  try{
   const sessao=sessoes.autenticar(req.body.senha);
   res.set('Set-Cookie',cookie(sessao.token));
   return res.json({operador:true});
  }catch(e){
   const bloqueado=e.codigo==='LOGIN_ADMIN_TEMPORARIAMENTE_BLOQUEADO';
   return res.status(bloqueado?429:401).json({
    erro:bloqueado?'LOGIN_ADMIN_TEMPORARIAMENTE_BLOQUEADO':
     'CREDENCIAIS_INVALIDAS'
   });
  }
 });
 // O cliente encerra sessão de operador de forma idempotente durante login
 // e logout. Exigir origem para impedir logout CSRF em navegador externo.
 app.post('/api/operador/sair',(req,res)=>{
  res.set('Cache-Control','no-store');
  if(req.get('origin')!==origem)
   return res.status(403).json({erro:'ORIGEM_ADMIN_INVALIDA'});
  const token=cookieValor(req);
  if(token&&sessoes.sessao(token))sessoes.sair(token);
  res.set('Set-Cookie',cookie('',true));
  return res.json({operador:false});
 });
 const validarCsrf=(req,res,next)=>{
  if(req.get('origin')!==origem||
     typeof req.operador?.csrf!=='string'||
     req.get('x-loop-admin-csrf')!==req.operador.csrf)
   return res.status(403).json({erro:'CSRF_ADMIN_INVALIDO'});
  next();
 };

 // As quatro imagens do banner usam a sessão e o CSRF do MESMO operador.
 // Todos os dados ficam no SQLite real; sem nova identidade ou PSP.
 if(bannersAkitemm!==null){
  if(typeof bannersAkitemm.listar!=='function'||
     typeof bannersAkitemm.salvar!=='function'||
     typeof bannersAkitemm.trocar!=='function')
   erro('BANNERS_AKITEMM_NAO_INTEGRADOS');
  const numero=str=>/^[1-4]$/.test(str)?Number(str):null;
  const revisao=req=>{
   const valor=req.get('x-banner-revisao-esperada');
   return typeof valor==='string'&&/^(0|[1-9][0-9]*)$/.test(valor)&&
    Number.isSafeInteger(Number(valor))?Number(valor):null;
  };
  const falhaBanner=(res,e)=>{
   const codigo=e?.codigo||'BANNER_INDISPONIVEL';
   const status=codigo.includes('CONFLITO')?409:
    codigo.includes('SEM_IMAGEM')?404:
    codigo.endsWith('_INVALIDO')||codigo.endsWith('_INVALIDA')?400:503;
   return res.status(status).set('Cache-Control','no-store')
    .json({erro:codigo});
  };
  app.get('/api/admin/akitemm/banners',proteger,(_req,res)=>
   res.set('Cache-Control','no-store').json(bannersAkitemm.listar()));
  app.put('/api/admin/akitemm/banners/:slot',proteger,validarCsrf,
   express.raw({type:['image/jpeg','image/png','image/webp'],limit:'3mb'}),
   (req,res)=>{
    const slot=numero(req.params.slot),rev=revisao(req);
    if(slot===null||rev===null)
     return res.status(400).json({erro:'BANNER_REVISAO_INVALIDA'});
    try{
     const out=bannersAkitemm.salvar({
      slot,revisaoEsperada:rev,mime:req.get('content-type'),
      dados:req.body,enquadramento:req.get('x-banner-enquadramento')||'INTEIRA'
     });
     return res.set('Cache-Control','no-store').json(out);
    }catch(e){return falhaBanner(res,e);}
   });
  app.delete('/api/admin/akitemm/banners/:slot',proteger,validarCsrf,
   (req,res)=>{
    const slot=numero(req.params.slot),rev=revisao(req);
    if(slot===null||rev===null)
     return res.status(400).json({erro:'BANNER_REVISAO_INVALIDA'});
    try{return res.set('Cache-Control','no-store').json(
     bannersAkitemm.remover({slot,revisaoEsperada:rev})
    );}catch(e){return falhaBanner(res,e);}
   });
  app.post('/api/admin/akitemm/banners/trocar',proteger,validarCsrf,
   (req,res)=>{
    if(!req.is('application/json')||!req.body||
      Array.isArray(req.body)||Object.keys(req.body).sort().join(',')!==
      'destino,origem,revisaoDestino,revisaoOrigem')
     return res.status(400).json({erro:'BANNER_TROCA_INVALIDA'});
    try{return res.set('Cache-Control','no-store').json(
     bannersAkitemm.trocar(req.body)
    );}catch(e){return falhaBanner(res,e);}
   });
 }
 // Caixa de entrada do atendimento AKITEMM, independente de marketplaces.
 if(atendimento){
  app.get('/api/admin/akitemm/atendimentos',proteger,(_req,res)=>{
   try{return res.json({atendimentos:atendimento.pendentes()});}
   catch{return res.status(503).json({
    erro:'ATENDIMENTO_OPERADOR_INDISPONIVEL'
   });}
  });
  app.post('/api/admin/akitemm/atendimentos/:protocolo/responder',
   proteger,validarCsrf,(req,res)=>{
    if(!req.is('application/json')||!req.body||
       Array.isArray(req.body)||Object.keys(req.body).join(',')!=='resposta')
     return res.status(400).json({erro:'ATENDIMENTO_RESPOSTA_INVALIDA'});
    try{return res.json(atendimento.responder({
     protocolo:req.params.protocolo,resposta:req.body.resposta
    }));}
    catch(e){
     const cod=e.codigo||'ATENDIMENTO_RESPOSTA_INDISPONIVEL';
     return res.status(cod==='ATENDIMENTO_NAO_ENCONTRADO'?404:
      cod==='ATENDIMENTO_JA_RESPONDIDO'?409:
      cod.includes('INVALID')?400:503).json({erro:cod});
    }
   });
 }
 // Gestão de cadastro: só a sessão autenticada como OPERADOR tem acesso.
 // Leitura exige nick exato; escrita exige CSRF, motivo e auditoria no SQLite.
 if(contas){
  app.get('/api/admin/contas/cadastro',proteger,(req,res)=>{
   res.set('Cache-Control','private, no-store');
   if(Object.keys(req.query).join(',')!=='nick'||
      typeof req.query.nick!=='string'||
      !/^[A-Za-z]{1,12}$/.test(req.query.nick))
    return res.status(400).json({erro:'NICK_INVALIDO'});
   try{return res.json({cadastro:contas.consultarCadastroOperador({
    nick:req.query.nick
   })});}
   catch(e){
    return res.status(e.codigo==='CADASTRO_NAO_LOCALIZADO'?404:503)
     .json({erro:e.codigo||'CONSULTA_CADASTRO_INDISPONIVEL'});
   }
  });
  app.post('/api/admin/contas/cadastro/corrigir',proteger,validarCsrf,(req,res)=>{
   res.set('Cache-Control','private, no-store');
   if(!req.is('application/json')||!req.body||
      Array.isArray(req.body)||
      Object.keys(req.body).sort().join(',')!=='motivo,nick,nome,telefone')
    return res.status(400).json({erro:'DADOS_CORRECAO_INVALIDOS'});
   try{return res.json(contas.corrigirCadastroOperador(req.body));}
   catch(e){
    const cod=e.codigo||'CORRECAO_CADASTRO_INDISPONIVEL';
    const invalido=['NOME_INVALIDO','TELEFONE_INVALIDO','NICK_INVALIDO',
     'MOTIVO_CORRECAO_OBRIGATORIO','TELEFONE_SEM_CADASTRO_ORIGINAL',
     'NENHUMA_ALTERACAO'].includes(cod);
    return res.status(invalido?400:cod==='CADASTRO_NAO_LOCALIZADO'?404:503)
     .json({erro:cod});
   }
  });
 }
 // Avatar exclusivo da sessao OPERADOR, guardado no mesmo SQLite real.
 // Nao le, escolhe, copia ou altera foto privada de qualquer titular.
 if(motorLoop){
  const db=motorLoop.banco;
  db.exec([
   'CREATE TABLE IF NOT EXISTS loop_real_operador_foto_perfil(',
   'id INTEGER PRIMARY KEY CHECK(id=1),',
   "mime TEXT NOT NULL CHECK(mime IN ('image/jpeg','image/png','image/webp')),",
   'dados BLOB NOT NULL CHECK(length(dados)>0 AND length(dados)<=3145728),',
   'sha256 TEXT NOT NULL CHECK(length(sha256)=64),',
   'atualizado_em INTEGER NOT NULL CHECK(atualizado_em>0));'
  ].join(' '));
  app.get('/api/admin/operador/foto-perfil',proteger,(_req,res)=>{
   try{
    const f=db.prepare('SELECT mime,dados,sha256 FROM loop_real_operador_foto_perfil WHERE id=1').get();
    if(!f)return res.status(404).json({erro:'FOTO_OPERADOR_AINDA_NAO_CADASTRADA'});
    const dados=Buffer.from(f.dados);
    if(dados.length<1||dados.length>3145728||
       createHash('sha256').update(dados).digest('hex')!==f.sha256)
     return res.status(503).json({erro:'FOTO_OPERADOR_INTEGRIDADE_INVALIDA'});
    return res.set('Cache-Control','private, no-store').type(f.mime).send(dados);
   }catch{return res.status(503).json({erro:'FOTO_OPERADOR_INDISPONIVEL'});}
  });
  app.post('/api/admin/operador/foto-perfil',proteger,validarCsrf,
   (req,res,next)=>{
    if(!['image/jpeg','image/png','image/webp'].includes(req.get('content-type')))
     return res.status(415).json({erro:'TIPO_FOTO_NAO_PERMITIDO'});
    next();
   },express.raw({type:['image/jpeg','image/png','image/webp'],limit:'3mb'}),
   (req,res)=>{
    try{
     if(!Buffer.isBuffer(req.body)||req.body.length===0||req.body.length>3145728)
      return res.status(400).json({erro:'FOTO_INVALIDA'});
     const limpa=validarFotoOperador({
      tipo:'FOTO',mime:req.get('content-type'),dados:req.body
     }).dados;
     if(!Buffer.isBuffer(limpa)||limpa.length<1||limpa.length>3145728)
      return res.status(400).json({erro:'FOTO_INVALIDA'});
     const hash=createHash('sha256').update(limpa).digest('hex');
     db.prepare([
      'INSERT INTO loop_real_operador_foto_perfil',
      '(id,mime,dados,sha256,atualizado_em) VALUES(1,?,?,?,?)',
      'ON CONFLICT(id) DO UPDATE SET mime=excluded.mime,',
      'dados=excluded.dados,sha256=excluded.sha256,',
      'atualizado_em=excluded.atualizado_em'
     ].join(' ')).run(req.get('content-type'),limpa,hash,Date.now());
     return res.status(201).json({fotoSalva:true});
    }catch(e){
     const ruim=['FOTO_INVALIDA','FOTO_DIMENSOES_INVALIDAS','FOTO_GRANDE_DEMAIS'].includes(e?.codigo);
     return res.status(ruim?400:503).json({
      erro:ruim?'FOTO_INVALIDA':'FOTO_OPERADOR_INDISPONIVEL'
     });
    }
   }
  );
 }
 // O mesmo login administrativo da loja e do escritorio grava fotos na
 // fonte comercial persistente, sem criar permissao paralela ou pagina nova.
 if(catalogoMidia!==null)montarRotasCatalogoMidiaOperador({
  app,catalogoMidia,catalogoPrincipal:catalogo,posicoesVitrine,
  anunciosManuais,entregaLocal,
  autorizarOperador:proteger,validarCsrf
 });
 app.get('/administrador/entrar',(req,res)=>{
  if(sessoes.sessao(cookieValor(req)))
   return res.redirect(303,'/administrador');
  res.set('Cache-Control','no-store');
  res.set('Content-Security-Policy',
   "default-src 'none'; style-src 'self'; form-action 'self'; "+
   "frame-ancestors 'none'; base-uri 'none'");
  const html=[
   '<!doctype html><html lang="pt-BR">',
   '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
   '<meta name="robots" content="noindex,nofollow"><title>AKITEMM · Administrador</title>',
   '<link rel="stylesheet" href="/identidade/assets/cliente.css"></head>',
   '<body><header class="cabecalho"><div><span class="marca">AKITEMM</span>',
   '<span class="submarca">LOOP 3.0 · Escritório Administrador</span></div></header>',
   '<main><h1>Acesso do administrador</h1>',
   '<section class="painel"><form method="post" action="/administrador/entrar">',
   '<label for="senhaAdmin">Credencial do administrador</label>',
   '<input id="senhaAdmin" name="senha" type="password" autocomplete="current-password" required minlength="24">',
   '<button class="primario" type="submit">Entrar no escritório</button>',
   '</form><p class="subtexto">Acesso privado. Não use sua senha de cliente.</p>',
   '</section></main></body></html>'
  ].join('\n');
  return res.type('html').send(html);
 });
 app.post('/administrador/entrar',express.urlencoded({
  extended:false,limit:'2kb',parameterLimit:2
 }), (req,res)=>{
  if(req.get('origin')!==origem||
     !req.is('application/x-www-form-urlencoded'))
   return res.status(403).json({erro:'ORIGEM_ADMIN_INVALIDA'});
  if(!req.body||Object.keys(req.body).join(',')!=='senha')
   return res.status(400).json({erro:'CAMPOS_ADMIN_INVALIDOS'});
  try{
   const s=sessoes.autenticar(req.body.senha);
   res.set('Cache-Control','no-store');
   res.set('Set-Cookie',cookie(s.token));
   return res.redirect(303,'/administrador');
  }catch(e){
   const limite=e.codigo==='LOGIN_ADMIN_TEMPORARIAMENTE_BLOQUEADO';
   res.set('Cache-Control','no-store');
   res.set('Content-Security-Policy',
    "default-src 'none'; style-src 'self'; form-action 'self'; "+
    "frame-ancestors 'none'; base-uri 'none'");
   return res.status(limite?429:401).type('html').send(
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta name="robots" content="noindex,nofollow">'+
    '<title>Acesso não autorizado · AKITEMM</title>'+
    '<link rel="stylesheet" href="/identidade/assets/cliente.css"></head>'+
    '<body><header class="cabecalho"><div><span class="marca">AKITEMM</span>'+
    '<span class="submarca">LOOP 3.0 · Escritório Administrador</span>'+
    '</div></header><main><h1>Acesso do administrador</h1>'+
    '<section class="painel"><p role="alert">'+
    'Credencial inválida ou acesso temporariamente bloqueado.</p>'+
    '<a href="/administrador/entrar">Voltar ao login</a>'+
    '</section></main></body></html>'
   );
  }
 });
 // Mesmo motor interno que a sessão do cliente; somente consulta agregada.
 app.get('/api/admin/loop/estado',proteger,(_req,res)=>{
  if(!motorLoop)return res.status(503).json({
   erro:'MOTOR_INTERNO_INDISPONIVEL'
  });
  try{return res.json(motorLoop.consultar());}
  catch{return res.status(503).json({erro:'MOTOR_INTERNO_INDISPONIVEL'});}
 });
 // Prova da ligação entre pedido, evento de pagamento, outbox e fila.
 // Somente leitura agregada; NÃO processa nem cria crédito ou posição.
 app.get('/api/admin/loop/cadeia-comercial',proteger,(_req,res)=>{
  res.set('Cache-Control','no-store');
  if(!motorLoop)return res.status(503).json({erro:'MOTOR_INTERNO_INDISPONIVEL'});
  try{return res.json(diagnosticarCadeiaPedidosFilas({
   banco:motorLoop.banco,motorLoop
  }));}
  catch{return res.status(503).json({erro:'CADEIA_COMERCIAL_CONSULTA_INDISPONIVEL'});}
 });
 // Qualificação de compras no banco REAL. O operador consulta a pendência,
 // mas esta API nunca transforma pedido em posição ou saldo.
 app.get('/api/admin/loop/qualificacao-pedidos',proteger,(_req,res)=>{
  res.set('Cache-Control','no-store');
  if(!motorLoop)return res.status(503).json({erro:'MOTOR_INTERNO_INDISPONIVEL'});
  try{return res.json(analisarQualificacaoPedidosReal({
   banco:motorLoop.banco,motorLoop,classificacaoLoop
  }));}
  catch{return res.status(503).json({erro:'QUALIFICACAO_REAL_CONSULTA_INDISPONIVEL'});}
 });
 // Controles de operacao da catraca: mesma sessao administrativa, motor e SQLite.
 // Nunca recebem titularId, pedidoId nem eventos inventados do navegador.
 app.get('/api/admin/loop/controle',proteger,(_req,res)=>{
  if(!catraca)return res.status(503).json({erro:'CATRACA_MOTOR_INDISPONIVEL'});
  try{
   const controle=catraca.consultar();
   return res.set('Cache-Control','private, no-store').json({
    ...controle,agenda:projetarAgendaTabuleiroCompartilhada(controle)
   });
  }catch{return res.status(503).json({erro:'CATRACA_CONSULTA_INDISPONIVEL'});}
 });
 app.post('/api/admin/loop/controle',proteger,validarCsrf,(req,res)=>{
  if(!catraca)return res.status(503).json({erro:'CATRACA_MOTOR_INDISPONIVEL'});
  if(!req.is('application/json')||!req.body||
     Array.isArray(req.body)||typeof req.body!=='object')
   return res.status(415).json({erro:'CATRACA_JSON_OBRIGATORIO'});
  const b=req.body;
  const permitidos=b.acao==='CONFIGURAR'?
   ['acao','modo','janelaInicio','janelaFim','limiteDiario',
    'metaCentrosDia','metaDataAlvo','revisaoEsperada','motivo']:
   b.acao==='GIRAR'?['acao']:null;
  if(!permitidos||Object.keys(b).some(k=>!permitidos.includes(k)))
   return res.status(400).json({erro:'CATRACA_ACAO_OU_CAMPOS_INVALIDOS'});
  try{
   const resultado=b.acao==='CONFIGURAR'?
    catraca.configurar({modo:b.modo,janelaInicio:b.janelaInicio,
     janelaFim:b.janelaFim,limiteDiario:b.limiteDiario,
     metaCentrosDia:b.metaCentrosDia,metaDataAlvo:b.metaDataAlvo,
     revisaoEsperada:b.revisaoEsperada,motivo:b.motivo}):
    catraca.executarGiro({origem:'OPERADOR'});
   const proximos=resultado.girou&&integradorComercialEnsaio?
    integradorComercialEnsaio.sincronizar():null;
   return res.json({...resultado,financeiroReal:false,
    ...(proximos?{eventosReabastecidos:proximos.novosEventos}:{})});
  }catch(e){
   const codigo=e.codigo||'CATRACA_OPERACAO_INDISPONIVEL';
   const http=codigo==='CATRACA_ADMIN_REVISAO_DESATUALIZADA'?409:
    codigo.includes('INVALID')?400:
    codigo==='CATRACA_MOTOR_PRODUTIVO_NAO_HOMOLOGADO'?423:503;
   return res.status(http).json({erro:codigo});
  }
 });
 // Projecao real do livro de vendas; comandos de ensaio so com sessao
 // administrativa, CSRF, e jamais em NODE_ENV=production.
 app.get('/api/admin/loop/integracao',proteger,(_req,res)=>{
  if(!integradorComercialEnsaio)
   return res.status(503).json({erro:'INTEGRACAO_AGUARDANDO_HOMOLOGACAO'});
  try{return res.json(integradorComercialEnsaio.consultar());}
  catch{return res.status(503).json({erro:'INTEGRACAO_INDISPONIVEL'});}
 });
 app.post('/api/admin/loop/integracao',proteger,validarCsrf,(req,res)=>{
  if(!integradorComercialEnsaio||process.env.NODE_ENV==='production')
   return res.status(423).json({erro:'INTEGRACAO_PRODUTIVA_NAO_HOMOLOGADA'});
  if(!req.is('application/json')||!req.body||
    Object.keys(req.body).length!==1||
    !['SINCRONIZAR','PREPARAR_TABULEIRO'].includes(req.body.acao))
   return res.status(400).json({erro:'INTEGRACAO_ADMIN_ACAO_INVALIDA'});
  try{
   const x=req.body.acao==='SINCRONIZAR'?
    integradorComercialEnsaio.sincronizar():
    integradorComercialEnsaio.prepararTabuleiro();
   return res.json(x);
  }catch(e){
   return res.status(503).json({erro:e.codigo||'INTEGRACAO_INDISPONIVEL'});
  }
 });
 // Status real do SQLite: nao inventa um PSP ou fornecedor homologado.
 app.get('/api/admin/comercial/jornada',proteger,(_req,res)=>{
  if(!jornadaComercialEnsaio)return res.status(503).json({
   erro:'JORNADA_COMERCIAL_AGUARDA_PROVEDORES'
  });
  try{return res.json(jornadaComercialEnsaio.consultarStatus());}
  catch{return res.status(503).json({erro:'JORNADA_COMERCIAL_INDISPONIVEL'});}
 });
 // Reprocessar exclusivamente a outbox de um pedido JA aprovado.
 // Nao gera cobranca, nao realiza giro e nao envia pedido ao fornecedor.
 app.post('/api/admin/comercial/jornada/reprocessar',
  proteger,validarCsrf,async(req,res)=>{
   if(!jornadaComercialEnsaio||process.env.NODE_ENV==='production')
    return res.status(423).json({erro:'JORNADA_PRODUTIVA_NAO_HOMOLOGADA'});
   if(!req.is('application/json')||!req.body||
      Object.keys(req.body).sort().join(',')!=='pedidoId'||
      typeof req.body.pedidoId!=='string'||
      !/^[A-Za-z0-9_-]{3,120}$/.test(req.body.pedidoId))
    return res.status(400).json({erro:'JORNADA_PEDIDO_INVALIDO'});
   try{return res.json(await jornadaComercialEnsaio.reprocessarRemessas({
    pedidoId:req.body.pedidoId
   }));}
   catch(e){return res.status(409).json({
    erro:e.codigo||'JORNADA_RECONCILIACAO_INDISPONIVEL'
   });}
  });
 // Reservas antigas sao visiveis no admin. A idade nao cancela PSP.
 app.get('/api/admin/comercial/reservas-vencidas',proteger,(_req,res)=>{
  if(!recuperacaoReservas)return res.status(503).json({
   erro:'RECUPERACAO_RESERVAS_NAO_CONFIGURADA'
  });
  try{return res.json(recuperacaoReservas.consultar());}
  catch{return res.status(503).json({erro:'RECUPERACAO_RESERVAS_INDISPONIVEL'});}
 });
 app.post('/api/admin/comercial/reservas-vencidas/reconsultar',
  proteger,validarCsrf,async(req,res)=>{
   if(!recuperacaoReservas||process.env.NODE_ENV==='production')
    return res.status(423).json({erro:'RECONSULTA_PSP_NAO_HOMOLOGADA'});
   if(!req.is('application/json')||!req.body||
      Object.keys(req.body).sort().join(',')!=='limite'||
      !Number.isSafeInteger(req.body.limite)||req.body.limite<1||
      req.body.limite>50)
    return res.status(400).json({erro:'RECONSULTA_RESERVAS_LIMITE_INVALIDO'});
   try{return res.json(await recuperacaoReservas.reconsultarVencidas({
    limite:req.body.limite,autorizadoEnsaio:true
   }));}
   catch(e){return res.status(503).json({
    erro:e.codigo||'RECONSULTA_RESERVAS_INDISPONIVEL'
   });}
  });
 app.post('/api/admin/sair',proteger,validarCsrf,(req,res)=>{
  sessoes.sair(req.tokenOperador);
  res.set('Set-Cookie',cookie('',true));
  return res.json({sessaoAdminEncerrada:true});
 });
 montarAdminComercialAprovado(app,{
  controle,catalogo,auditoria,manutencao,pedidosComerciais,classificacaoLoop,
  autorizarAdministrador:proteger,
  validarCsrfAdmin:validarCsrf,
  obterCsrfAdmin:req=>req.operador?.csrf,
  origemHttps
 });
 return {operadorProtegido:true,financeiroRealHabilitado:false};
}
module.exports={montarGatewayAdminComercial};
