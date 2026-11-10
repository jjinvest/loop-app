'use strict';
const express=require('express');
const {COOKIE_ADMIN}=require('./sessao-admin-comercial-sqlite');
const {OperacaoCatracaAdminSQLite}=require('./operacao-catraca-admin-sqlite');
const {montarAdminComercialAprovado}=
 require('./interface-admin-comercial-aprovada');
function erro(c){const e=new Error(c);e.codigo=c;throw e;}
function montarGatewayAdminComercial(app,{
 sessoes,controle,catalogo,auditoria=null,manutencao=null,
 pedidosComerciais=null,motorLoop=null,operacaoCatraca=null,
 classificacaoLoop=null,origemHttps
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
 const validarCsrf=(req,res,next)=>{
  if(req.get('origin')!==origem||
     typeof req.operador?.csrf!=='string'||
     req.get('x-loop-admin-csrf')!==req.operador.csrf)
   return res.status(403).json({erro:'CSRF_ADMIN_INVALIDO'});
  next();
 };
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
   return res.status(limite?429:401).type('html').send(
    '<!doctype html><html lang="pt-BR"><meta charset="utf-8">'+
    '<title>Acesso não autorizado</title><p>Credencial inválida ou acesso temporariamente bloqueado.</p>'+
    '<a href="/administrador/entrar">Voltar ao login</a></html>'
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
 // Controles de operacao da catraca: mesma sessao administrativa, motor e SQLite.
 // Nunca recebem titularId, pedidoId nem eventos inventados do navegador.
 app.get('/api/admin/loop/controle',proteger,(_req,res)=>{
  if(!catraca)return res.status(503).json({erro:'CATRACA_MOTOR_INDISPONIVEL'});
  try{return res.json(catraca.consultar());}
  catch{return res.status(503).json({erro:'CATRACA_CONSULTA_INDISPONIVEL'});}
 });
 app.post('/api/admin/loop/controle',proteger,validarCsrf,(req,res)=>{
  if(!catraca)return res.status(503).json({erro:'CATRACA_MOTOR_INDISPONIVEL'});
  if(!req.is('application/json')||!req.body||
     Array.isArray(req.body)||typeof req.body!=='object')
   return res.status(415).json({erro:'CATRACA_JSON_OBRIGATORIO'});
  const b=req.body;
  const permitidos=b.acao==='CONFIGURAR'?
   ['acao','modo','janelaInicio','janelaFim','limiteDiario',
    'revisaoEsperada','motivo']:
   b.acao==='GIRAR'?['acao']:null;
  if(!permitidos||Object.keys(b).some(k=>!permitidos.includes(k)))
   return res.status(400).json({erro:'CATRACA_ACAO_OU_CAMPOS_INVALIDOS'});
  try{
   const resultado=b.acao==='CONFIGURAR'?
    catraca.configurar({modo:b.modo,janelaInicio:b.janelaInicio,
     janelaFim:b.janelaFim,limiteDiario:b.limiteDiario,
     revisaoEsperada:b.revisaoEsperada,motivo:b.motivo}):
    catraca.executarGiro({origem:'OPERADOR'});
   return res.json({...resultado,financeiroReal:false});
  }catch(e){
   const codigo=e.codigo||'CATRACA_OPERACAO_INDISPONIVEL';
   const http=codigo==='CATRACA_ADMIN_REVISAO_DESATUALIZADA'?409:
    codigo.includes('INVALID')?400:
    codigo==='CATRACA_MOTOR_PRODUTIVO_NAO_HOMOLOGADO'?423:503;
   return res.status(http).json({erro:codigo});
  }
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
