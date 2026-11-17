'use strict';
// Acesso remoto EXCLUSIVO a uma previa protegida, sem expondo o candidato
// diretamente: o servidor do candidato permanece em loopback.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {exportarPreview,empacotar}=
 require('../src/producao/migracao-cadastros-preview-real');
const {createHash,createHmac,hkdfSync,timingSafeEqual}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {AsaasSandboxLojaV6}=require('../src/domain/asaas-sandbox-loja-v6');
const {criarAgendadorConciliacaoSandbox}=
 require('../src/domain/agendador-conciliacao-asaas-sandbox');
const {criarAgendadorBackupOffsiteLab}=
 require('../src/domain/agendador-backup-offsite-railway-lab');
const {criarTransporteRecuperacaoResend}=
 require('../src/adapters/email-recuperacao-resend');
const {criarTransporteEmailVerificacaoResend}=
 require('../src/adapters/email-verificacao-resend');

function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function digerir(s){return createHash('sha256').update(s,'utf8').digest();}
function seguro(a,b){return timingSafeEqual(digerir(a),digerir(b));}
function validarSegredos({senhaAcesso,segredoRaiz}){
 if(typeof senhaAcesso!=='string'||senhaAcesso.length<24||
    typeof segredoRaiz!=='string'||segredoRaiz.length<56||
    senhaAcesso===segredoRaiz)
  falha('SEGREDOS_PREVIA_NAO_CONFIGURADOS');
}
function criarGateway({portaInterna,senhaAcesso,senhaAdmin,segredoOperador,
 validarNickIndicador=()=>false,permitirWebhookSandbox=false,
 permitirOrigemHttpLoopback=false,
 publicarCadastroReal=false,urlIdentidadeReal=null}={}){
 if(!Number.isSafeInteger(portaInterna)||portaInterna<1||portaInterna>65535||
    typeof senhaAcesso!=='string'||senhaAcesso.length<24||
    typeof segredoOperador!=='string'||segredoOperador.length<32||
    typeof senhaAdmin!=='string'||senhaAdmin.length<24||
    senhaAdmin===senhaAcesso)
  falha('GATEWAY_PREVIA_INVALIDO');
 if(publicarCadastroReal===true){
  const railway=typeof urlIdentidadeReal==='string'&&
   /^http:\/\/[a-z0-9-]+\.railway\.internal(?::[0-9]{2,5})?\/internal\/loop\/tabuleiro$/.test(urlIdentidadeReal);
  const somenteTeste=permitirOrigemHttpLoopback===true&&
   process.env.NODE_ENV!=='production'&&
   typeof urlIdentidadeReal==='string'&&
   /^http:\/\/127\.0\.0\.1:[0-9]{2,5}\/internal\/loop\/tabuleiro$/.test(urlIdentidadeReal);
  if(!railway&&!somenteTeste)
   falha('IDENTIDADE_REAL_PRIVADA_NAO_CONFIGURADA');
 }
 const realAlvo=publicarCadastroReal?new URL(urlIdentidadeReal):null;
 const backend='127.0.0.1:'+portaInterna;
 const sessaoNome='akitemm_preview_access';
 const indicacaoCookie='akitemm_preview_ref';
 const adminCookie='akitemm_preview_admin_v2';
 const revogadosOperador=new Map();
 const tentativasOperador=new Map();
 const duracao=12*60*60*1000;
 const prazoIndicacao=30*24*60*60*1000;
 const assinarIndicacao=(nick,ts)=>createHmac('sha256',segredoOperador)
  .update('AKITEMM-REF-LAB-V1:'+nick+':'+ts).digest('hex');
 const lerIndicacao=req=>{
  const p=(req.headers.cookie||'').split(';').map(x=>x.trim())
   .filter(x=>x.startsWith(indicacaoCookie+'='));
  if(p.length!==1)return null;
  const v=p[0].slice(indicacaoCookie.length+1);
  const m=v.match(/^v1\.([A-Za-z0-9%]{1,128})\.(\d{13})\.([a-f0-9]{64})$/);
  if(!m)return null;
  let nick;
  try{nick=decodeURIComponent(m[1]);}catch{return null;}
  if(encodeURIComponent(nick)!==m[1])return null;
  const ts=Number(m[2]);
  if(ts>Date.now()||Date.now()-ts>prazoIndicacao||
     !seguro(m[3],assinarIndicacao(nick,m[2])))return null;
  return nick;
 };
 const assinar=ts=>createHmac('sha256',senhaAcesso).update('preview:'+ts).digest('hex');
 const assinarAdmin=ts=>createHmac('sha256',segredoOperador)
  .update('AKITEMM-ADMIN-ISOLADO-V2:'+senhaAdmin+':'+ts).digest('hex');
 const lerAdmin=req=>{
  const matches=(req.headers.cookie||'').split(';').map(x=>x.trim())
   .filter(x=>x.startsWith(adminCookie+'='));
  if(matches.length!==1)return false;
  const token=matches[0].slice(adminCookie.length+1);
  if(revogadosOperador.has(token))return false;
  const m=token.match(/^v2\.(\d{13})\.([a-f0-9]{64})$/);
  if(!m)return false;
  const ts=Number(m[1]);
  return ts<=Date.now()&&Date.now()-ts<duracao&&
   seguro(m[2],assinarAdmin(m[1]));
 };
 const rotaAdmin=path=>{
  // Express aceita rotas sem diferenciar maiusculas. O gateway nao pode
  // deixar a verificacao de permissao ser mais restritiva que o backend.
  // Tambem trata codificacao de caracteres sem transformar a URL encaminhada.
  let p;
  try{p=decodeURIComponent(path).toLowerCase().replace(/\/+$/,'');}
  catch{return true;}
  // Express aceita a barra final nas rotas fixas. Sem a mesma
  // normalizacao, um visitante poderia obter HTML/assets administrativos.
  return p==='/operador'||p==='/escritorio'||p==='/staging/escritorio-admin'||
   p==='/staging/escritorio-unificado'||
   p.startsWith('/staging/escritorio-unificado/')||
   p==='/staging/assets/admin.js'||
   p==='/staging/assets/admin.css';
 };
 const lerSessao=req=>{
  const cookies=(req.headers.cookie||'').split(';').map(x=>x.trim());
  const p=cookies.find(x=>x.startsWith(sessaoNome+'='));
  const m=p?.slice(sessaoNome.length+1).match(/^v1\.(\d{13})\.([a-f0-9]{64})$/);
  if(!m)return false;
  const ts=Number(m[1]);
  return ts<=Date.now()&&Date.now()-ts<duracao&&
   seguro(m[2],assinar(m[1]));
 };
 const corpoAdmin=fs.readFileSync(path.join(__dirname,
  '../src/candidato/escritorio-admin-candidato-ui.js'),'utf8')
  .replaceAll("credentials:'omit'","credentials:'same-origin'");
 return http.createServer((req,res)=>{
  const cabecalhosBase={
   'Cache-Control':'no-store',
   'X-Content-Type-Options':'nosniff',
   'Referrer-Policy':'no-referrer',
   'X-Frame-Options':'DENY',
   'Strict-Transport-Security':'max-age=31536000',
  };
  const negar=(codigo,body,extras={})=>{
   res.writeHead(codigo,{...cabecalhosBase,...extras,'Content-Type':'text/plain; charset=utf-8'});
   res.end(body);
  };
  let url;
  try{url=new URL(req.url,'http://gateway.invalid');}
  catch{return negar(400,'Requisição inválida');}
  // Controle do operador: uma rota pública de leitura, sem acesso ao
  // SQLite real e sem credenciais no navegador. Mesmo nome nas duas UIs.
  // Sempre no gateway, antes de qualquer proxy /api/ para a identidade.
  // Nick e senha de operador entram pela MESMA caixa do cliente.
  // A senha administrativa e verificada somente neste gateway.
  if(url.pathname==='/api/operador/entrar'){
   if(req.method!=='POST')return negar(405,'Método não permitido');
   let origemOk=false;
   if(typeof req.headers.origin==='string'){
    try{
     const u=new URL(req.headers.origin);
     origemOk=(u.protocol==='https:'&&u.host===req.headers.host)||
      (permitirOrigemHttpLoopback===true&&process.env.NODE_ENV!=='production'&&
       u.protocol==='http:'&&u.hostname==='127.0.0.1'&&u.host===req.headers.host);
    }catch{}
   }else origemOk=req.headers['sec-fetch-site']==='same-origin';
   if(!origemOk)return negar(403,'Origem não autorizada');
   if(!/^application\/json(?:\s*;.*)?$/i.test(req.headers['content-type']||''))
    return negar(415,'JSON obrigatório');
   const chave=req.socket.remoteAddress||'desconhecido';
   const agora=Date.now();
   for(const [k,registro] of tentativasOperador)
    if(registro.ate<=agora)tentativasOperador.delete(k);
   const tentativa=tentativasOperador.get(chave);
   if(tentativa&&tentativa.erros>=20&&tentativa.ate>agora)
    return negar(429,'Muitas tentativas. Tente novamente mais tarde.',{
     'Retry-After':String(Math.ceil((tentativa.ate-agora)/1000))});
   let blocos=[],total=0,excedeu=false;
   req.on('data',bloco=>{
    total+=bloco.length;
    if(total>2048){excedeu=true;blocos=[];}
    else if(!excedeu)blocos.push(bloco);
   });
   req.on('end',()=>{
    if(excedeu)return negar(413,'Dados de acesso muito extensos');
    let dados;
    try{dados=JSON.parse(Buffer.concat(blocos).toString('utf8'));}catch{
     return negar(400,'Dados de acesso inválidos');
    }
    if(!dados||typeof dados!=='object'||Array.isArray(dados)||
       Object.keys(dados).sort().join(',')!=='nick,senha'||
       typeof dados.nick!=='string'||typeof dados.senha!=='string'||
       dados.nick.length>12||dados.senha.length>256)
     return negar(400,'Dados de acesso inválidos');
    const valido=seguro(dados.nick.toLowerCase(),'operador')&&
     seguro(dados.senha,senhaAdmin);
    if(!valido){
     const antigo=tentativasOperador.get(chave);
     tentativasOperador.set(chave,{erros:(antigo?.erros||0)+1,
      ate:agora+15*60*1000});
     return negar(401,'Usuário ou senha incorretos');
    }
    tentativasOperador.delete(chave);
    const ts=String(Date.now());
    const valor='v2.'+ts+'.'+assinarAdmin(ts);
    revogadosOperador.delete(valor);
    res.writeHead(200,{...cabecalhosBase,
     'Content-Type':'application/json; charset=utf-8',
     'Set-Cookie':adminCookie+'='+valor+
      '; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200'});
    return res.end(JSON.stringify({operador:true}));
   });
   req.on('error',()=>{if(!res.headersSent)negar(400,'Requisição inválida');});
   return;
  }
  if(url.pathname==='/api/operador/estado'){
   if(req.method!=='GET')return negar(405,'Método não permitido');
   res.writeHead(200,{...cabecalhosBase,
    'Content-Type':'application/json; charset=utf-8'});
   return res.end(JSON.stringify({operador:lerAdmin(req)}));
  }
  // Logout administrativo: cliente e operador sao papeis separados.
  if(url.pathname==='/staging/operador/sair'||url.pathname==='/api/operador/sair'){
   if(req.method!=='POST')return negar(405,'Método não permitido');
   let origemOk=false;
   if(typeof req.headers.origin==='string'){
    try{
     const u=new URL(req.headers.origin);
     origemOk=(u.protocol==='https:'&&u.host===req.headers.host)||
      (permitirOrigemHttpLoopback===true&&process.env.NODE_ENV!=='production'&&
       u.protocol==='http:'&&u.hostname==='127.0.0.1'&&u.host===req.headers.host);
    }catch{}
   }else origemOk=req.headers['sec-fetch-site']==='same-origin';
   if(!origemOk)return negar(403,'Origem não autorizada');
   if(lerAdmin(req)){
    const token=(req.headers.cookie||'').split(';').map(x=>x.trim())
     .find(x=>x.startsWith(adminCookie+'='))?.slice(adminCookie.length+1);
    if(token)revogadosOperador.set(token,Number(token.split('.')[1])+duracao);
   }
   for(const [token,expira] of revogadosOperador)
    if(expira<=Date.now())revogadosOperador.delete(token);
   res.writeHead(200,{...cabecalhosBase,'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store',
    'Set-Cookie':adminCookie+'=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'});
   return res.end(JSON.stringify({operador:false}));
  }
  // O site público continua no mesmo domínio. Somente os caminhos
  // de IDENTIDADE e seus assets são proxied ao serviço real com volume
  // independente. A loja anterior permanece intacta para usuários antigos.
  if(publicarCadastroReal){
   const redirect=req.method==='GET'&&url.pathname.match(
    /^\/(escritorio|loja)\/([A-Za-z]{1,12})$/
   );
   if(redirect){
    const nick=redirect[2];
    // Validar o indicador no banco REAL, e não na antiga prévia.
    const check=http.get({
     hostname:realAlvo.hostname,port:Number(realAlvo.port||80),
     path:'/escritorio/'+encodeURIComponent(nick),timeout:7000
    },resp=>{
     resp.resume();
     if(res.headersSent)return;
     if(resp.statusCode!==303){
      return negar(resp.statusCode===404?404:503,
       resp.statusCode===404?'Link de indicação inexistente':
        'Validação do link indisponível');
     }
     res.writeHead(303,{...cabecalhosBase,
      Location:'/cadastro-real?ref='+encodeURIComponent(nick)+
       (redirect[1]==='loja'?'&origem=loja':'')});
     res.end();
    });
    check.on('timeout',()=>check.destroy());
    check.on('error',()=>negar(503,'Validação do link indisponível'));
    req.on('aborted',()=>check.destroy());
    return;
   }
   const temSessaoReal=/(?:^|;\s*)loop_real_s=[a-f0-9]{64}(?:;|$)/
    .test(req.headers.cookie||'');
   const realPath=url.pathname==='/cadastro-real'||
    url.pathname.startsWith('/identidade/assets/')||
    url.pathname.startsWith('/api/')||
    url.pathname==='/convite/loja'||
    (url.pathname==='/loja'&&temSessaoReal);
   if(realPath){
    // O proxy não aceita redirecionamentos arbitrários, nem URLs
    // externas. Port/hostname resultam apenas da rede privada Railway.
    const rota=url.pathname==='/cadastro-real'?
     '/minha-conta'+url.search:req.url;
    const headers={...req.headers,
     host:realAlvo.host};
    for(const k of Object.keys(headers))
     if(k.startsWith('x-forwarded-')||['forwarded','proxy-authorization',
      'connection','transfer-encoding','authorization'].includes(k))
      delete headers[k];
    const upstream=http.request({
     hostname:realAlvo.hostname,port:Number(realAlvo.port||80),
     method:req.method,path:rota,headers,timeout:45000
    },resp=>{
     const h={...resp.headers,...cabecalhosBase};
     delete h['transfer-encoding'];
     delete h['connection'];
     res.writeHead(resp.statusCode||502,h);
     resp.pipe(res);
    });
    upstream.on('timeout',()=>upstream.destroy());
    upstream.on('error',()=>{
     if(!res.headersSent)negar(502,'Identidade real temporariamente indisponível');
     else res.destroy();
    });
    req.on('aborted',()=>upstream.destroy());
    req.pipe(upstream);
    return;
   }
  }
  // Navegadores consultam o favicon da loja automaticamente;
  // um desafio Basic neste recurso provoca janela de senha extra.
  if((req.method==='GET'||req.method==='HEAD')&&url.pathname==='/favicon.ico'){
   res.writeHead(204,{...cabecalhosBase,'Content-Length':'0'});
   return res.end();
  }
  const auth=req.headers.authorization||'';
  let decodificado='';
  if(/^Basic [A-Za-z0-9+/=]+$/.test(auth)){
   try{decodificado=Buffer.from(auth.slice(6),'base64').toString('utf8');}
   catch{}
  }
  const basicaValida=seguro(decodificado,'acesso:'+senhaAcesso);
  // A credencial da operacao pode ser separada do acesso de cliente.
  const operadorBasicoValido=seguro(decodificado,'operador:'+senhaAdmin);
  const sessaoValida=lerSessao(req);
  // Liveness nao pode declarar o gateway saudavel se o backend caiu.
  // Readiness confere as invariantes reais do SQLite pelo backend isolado.
  // Nao encaminhar dados internos ou segredos a quem consulta o probe.
  if(req.method==='GET'&&
    (url.pathname==='/healthz'||url.pathname==='/readyz')){
   const profunda=url.pathname==='/readyz';
   // A auditoria profunda do SQLite percorre varias tabelas: nao oferecer
   // esse trabalho custoso a visitantes anonimos da previa protegida.
   if(profunda&&!basicaValida&&!sessaoValida)
    return negar(401,'Acesso exclusivo para homologação',{
     'WWW-Authenticate':'Basic realm="AKITEMM - Acesso de teste"'
    });
   let respondido=false;
   const concluir=(ok)=>{
    if(respondido||res.destroyed)return;
    respondido=true;
    res.writeHead(ok?200:503,{...cabecalhosBase,
     'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify({
     estado:ok?(profunda?'BANCO_DE_ENSAIO_APTO':'PREVIA_PROTEGIDA'):
      (profunda?'PRONTIDAO_INDISPONIVEL':'PREVIA_INDISPONIVEL'),
     financeiroReal:false,marcoZeroLiberado:false
    }));
   };
   const probe=http.get({hostname:'127.0.0.1',port:portaInterna,
    path:profunda?'/readyz':'/healthz',timeout:2500},resposta=>{
    resposta.resume();
    concluir(resposta.statusCode===200);
   });
   probe.on('timeout',()=>probe.destroy());
   probe.on('error',()=>concluir(false));
   req.on('aborted',()=>probe.destroy());
   return;
  }
  const webhookUnificado=url.pathname==='/webhooks/asaas-sandbox-unificado';
  if(webhookUnificado){
   if(!permitirWebhookSandbox)return negar(404,'Webhook de ensaio desativado');
   if(req.method!=='POST')return negar(405,'Método não permitido');
   if(req.headers.origin)return negar(403,'Origem não autorizada');
   if(!/^application\/json(?:\s*;.*)?$/i.test(req.headers['content-type']||''))
    return negar(415,'JSON obrigatório');
   if(typeof req.headers['asaas-access-token']!=='string')
    return negar(401,'Token obrigatório');
  }
  // Um cookie do VISITANTE nao permite abrir painel ou APIs do operador.
  // O Basic do operador e convertido em cookie de administrador distinto.
  const exigeOperador=rotaAdmin(url.pathname);
  const adminValido=operadorBasicoValido||lerAdmin(req);
  // Consulta de presença do operador. Só o cookie assinado e válido conta;
  // Basic não autentica silenciosamente nem gera prompt para cliente.
  // A resposta não fornece token, identificação nem permissões de escrita.
  if(url.pathname==='/staging/operador/estado'){
   if(req.method!=='GET')return negar(405,'Método não permitido');
   res.writeHead(200,{...cabecalhosBase,
    'Content-Type':'application/json; charset=utf-8'});
   return res.end(JSON.stringify({operador:lerAdmin(req)}));
  }
  if(exigeOperador&&!adminValido)
   return negar(401,'Operador autorizado necessário',{
    'WWW-Authenticate':'Basic realm="AKITEMM - Administrador", charset="UTF-8"'
   });
  const leitura=req.method==='GET'||req.method==='HEAD';
  const publico=leitura&&(
   /^\/(?:|minha-conta|loja|staging\/cliente|staging\/loja)$/.test(url.pathname)||
   /^\/(?:loja|escritorio)\/[A-Za-z]{1,12}$/.test(url.pathname)||
   /^\/staging\/assets\/(?:cliente\.js|cliente\.css|cliente-integrado\.css|loop03-aprovado\.css|catraca-visor\.js|tabuleiro-visual\.js|operador-em-tela\.js|acabamento-loop\.js|vitrine-horizontal\.css|loja-aprovada\.js|loja-aprovada\.css|educacao-carrinho\.js)$/.test(url.pathname)||
   /^\/staging\/vitrine\/(?:loja\/(?:catalogo|config|comunicados|banner-arquivo\/[a-f0-9]{32}|produtos\/[a-zA-Z0-9-]+\/(?:foto\/(?:10|[1-9])|video))|novidades(?:\/[0-9]+\/imagem)?)$/.test(url.pathname)||
   url.pathname==='/staging/contas/termos-cadastro'||
   url.pathname==='/staging/contas/captcha-login'||
   url.pathname==='/staging/contas/captcha-cadastro'||
   url.pathname==='/staging/contas/me'||
   url.pathname==='/staging/indicacao/atual');
  const acessoConta= req.method==='POST'&&[
   '/staging/contas/cadastrar','/staging/contas/entrar',
   '/staging/contas/recuperar-senha','/staging/contas/redefinir-senha'
  ].includes(url.pathname);
  // O cookie de conta nao concede poder administrativo. O backend verifica
  // assinatura e titularidade a cada operacao; a regra de admin acima vence.
  const cookieConta=/(?:^|;\s*)loop_candidato_s=[a-f0-9]{64}(?:;|$)/.test(req.headers.cookie||'');
  const acessoTitular=cookieConta&&url.pathname.startsWith('/staging/')&&
   !rotaAdmin(url.pathname)&&!url.pathname.startsWith('/staging/asaas/');
  if(!basicaValida&&!sessaoValida&&!webhookUnificado&&!adminValido&&
     !publico&&!acessoConta&&!acessoTitular)
   // APIs e recursos restritos mantem 401, SEM desafiar o browser a abrir
   // a janela de senha da homologacao (admin continua Basic separado).
   return negar(401,'Acesso exclusivo para homologação');
  if(url.pathname==='/staging/indicacao/atual'){
   if(req.method!=='GET'&&req.method!=='HEAD')return negar(405,'Método não permitido');
   const nick=lerIndicacao(req);
   res.writeHead(200,{...cabecalhosBase,'Content-Type':'application/json; charset=utf-8'});
   return res.end(JSON.stringify({nick:nick||null}));
  }
  const agora=String(Date.now());
  const novoAdminCookie=exigeOperador&&operadorBasicoValido&&!lerAdmin(req)?
   adminCookie+'=v2.'+agora+'.'+assinarAdmin(agora)+
   '; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200':null;
  const novoCookie=basicaValida&&!sessaoValida?
   sessaoNome+'=v1.'+agora+'.'+assinar(agora)+
   '; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200':null;
  const origem=req.headers.origin;
  if(origem){
   let origemOk=false;
   try{
    const u=new URL(origem);
    origemOk=(u.protocol==='https:'&&u.host===req.headers.host)||
      // Apenas no ensaio HTTP local: nunca na previa HTTPS publica.
      (permitirOrigemHttpLoopback===true&&process.env.NODE_ENV!=='production'&&
       u.protocol==='http:'&&u.hostname==='127.0.0.1'&&
       u.host===req.headers.host&&
       req.socket.localAddress==='127.0.0.1'&&
       req.socket.remoteAddress==='127.0.0.1');
   }catch{}
   if(!origemOk)return negar(403,'Origem não autorizada');
  }
  if(req.method==='OPTIONS'||!['GET','HEAD','POST','PATCH','PUT','DELETE'].includes(req.method))
   return negar(405,'Método não permitido');
  // O webhook remoto e exclusivo; jamais oferecer a rota interna ao browser.
  if(url.pathname.startsWith('/staging/asaas/'))
   return negar(404,'Rota interna não disponível');
  if(url.pathname==='/operador'){
   if(req.method!=='GET')return negar(405,'Método não permitido');
   // Operador autenticado entra no painel administrativo existente,
   // sem criar uma segunda central nem cair na conta de cliente.
   res.writeHead(302,{...cabecalhosBase,Location:url.searchParams.get('destino')==='loop'?'/staging/cliente?modo=operador':'/escritorio'+url.search,
    ...(novoAdminCookie?{'Set-Cookie':novoAdminCookie}:{})});
   return res.end();
  }
  if(url.pathname==='/'){
   res.writeHead(302,{...cabecalhosBase,Location:'/minha-conta',...(novoCookie?{'Set-Cookie':novoCookie}:{})});
   return res.end();
  }
  const caminhoConvite=url.pathname.match(/^\/(loja|escritorio)\/([^/]{1,128})$/);
  if(caminhoConvite){
   if(req.method!=='GET')return negar(405,'Método não permitido');
   let nick;
   try{nick=decodeURIComponent(caminhoConvite[2]);}
   catch{return negar(404,'Link de ensaio inexistente');}
   if(encodeURIComponent(nick)!==caminhoConvite[2]||
      !validarNickIndicador(nick))return negar(404,'Link de ensaio inexistente');
   const ts=String(Date.now());
   const refCookie=indicacaoCookie+'=v1.'+encodeURIComponent(nick)+'.'+ts+'.'+
    assinarIndicacao(nick,ts)+
    '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000';
   res.writeHead(302,{...cabecalhosBase,
    Location:caminhoConvite[1]==='loja'?'/loja':'/minha-conta?cadastro=1',
    'Set-Cookie':[...(novoCookie?[novoCookie]:[]),refCookie]});
   return res.end();
  }
  // O cookie do cliente tem Path=/staging (menor escopo possivel).
  // Redirecionar /loja para a rota canonica ANTES do backend: se a
  // requisicao chegar como /loja, o navegador nao envia o cookie e o
  // servidor confundiria um titular ja autenticado com visitante.
  // /staging/loja continua exigindo sessao valida no proprio backend.
  if(url.pathname==='/loja'){
   if(req.method!=='GET'&&req.method!=='HEAD')
    return negar(405,'Método não permitido');
   res.writeHead(302,{...cabecalhosBase,
    Location:'/staging/loja'+url.search,
    ...(novoCookie?{'Set-Cookie':novoCookie}:{})});
   return res.end();
  }
  const atalhos={
   '/escritorio':'/staging/escritorio-admin',
   '/minha-conta':'/staging/cliente'
  };
  if(!url.pathname.startsWith('/staging/')&&
     !Object.hasOwn(atalhos,url.pathname)&&!webhookUnificado)
   return negar(404,'Página não encontrada');
  if(url.pathname==='/staging/assets/admin.js'){
   if(req.method!=='GET')return negar(405,'Método não permitido');
   res.writeHead(200,{...cabecalhosBase,
    'Content-Type':'text/javascript; charset=utf-8',
    ...(novoCookie?{'Set-Cookie':novoCookie}:{})});
   return res.end(corpoAdmin);
  }
  const destino=webhookUnificado?'/staging/asaas/webhook-unificado':
   (atalhos[url.pathname]||url.pathname)+url.search;
  // O navegador só conhece o gateway HTTPS. O backend de homologação
  // conhece somente uma conexão de loopback com Host local.
  const headers={...req.headers,host:backend,origin:'http://'+backend};
  for(const k of Object.keys(headers))
   if(k.startsWith('x-forwarded-')||['forwarded','proxy-authorization',
      'connection','transfer-encoding'].includes(k))delete headers[k];
  delete headers.authorization;
  // Nunca confiar em headers de indicacao enviados pelo navegador:
  // somente um cookie de convite autenticado pelo gateway e aceito.
  delete headers['x-akitemm-preview-indicador'];
  if(destino==='/staging/contas/cadastrar'&&req.method==='POST'){
   const nick=lerIndicacao(req);
   if(nick)headers['x-akitemm-preview-indicador']=nick;
  }
  if(destino.startsWith('/staging/escritorio-unificado'))
   headers.authorization='Bearer '+segredoOperador;
  // Transfer-encoding e recomputado pelo HTTP client, sem ambiguidade CL/TE.
  const upstream=http.request({
   hostname:'127.0.0.1',port:portaInterna,path:destino,
   method:req.method,headers
  },resp=>{
   const retorno={...resp.headers,...cabecalhosBase};
   if(retorno['set-cookie']){
    retorno['set-cookie']=retorno['set-cookie'].map(x=>
     /;\s*Secure(?:;|$)/i.test(x)?x:x+'; Secure');
   }
   if(novoCookie||novoAdminCookie){
    retorno['set-cookie']=[...(retorno['set-cookie']||[]),
     ...(novoCookie?[novoCookie]:[]),
     ...(novoAdminCookie?[novoAdminCookie]:[])];
   }
   delete retorno['transfer-encoding'];
   res.writeHead(resp.statusCode||502,retorno);
   resp.pipe(res);
  });
  upstream.on('error',()=>{
   if(!res.headersSent)negar(502,'Serviço de prévia indisponível');
   else res.destroy();
  });
  req.on('aborted',()=>upstream.destroy());
  req.pipe(upstream);
 });
}
// Trava novas conexoes ANTES de aguardar backup/PSP. As conexoes ainda
// ativas drenam antes de encerrar o backend e fechar o mesmo SQLite.
function criarEncerramentoPreview({gateway,interno,banco,agendador=null,
 backupOffsite=null,pararTemporizadorCatraca=null}={}){
 if(!gateway||typeof gateway.close!=='function'||
    !interno||typeof interno.close!=='function'||
    !banco||typeof banco.close!=='function')
  falha('ENCERRAMENTO_PREVIA_INVALIDO');
 let operacao=null;
 return function encerrar(){
  if(operacao!==null)return operacao;
  operacao=(async()=>{
   // A resolucao guarda o erro para nao criar uma rejeicao sem handler
   // durante o aguardo das operacoes financeiras de laboratorio.
   const drenagemGateway=new Promise(resolve=>{
    try{
     gateway.close(erro=>resolve(erro||null));
     gateway.closeIdleConnections?.();
    }catch(e){resolve(e);}
   });
   // O temporizador e criado somente quando gateway entra em escuta.
   // Encerrar por callback garante limpar o timer real, nao uma copia null.
   if(pararTemporizadorCatraca)pararTemporizadorCatraca();
   if(agendador)await agendador.encerrar();
   if(backupOffsite)await backupOffsite.encerrar();
   const erroGateway=await drenagemGateway;
   if(erroGateway)throw erroGateway;
   await new Promise((resolve,reject)=>{
    interno.close(erro=>erro?reject(erro):resolve());
    interno.closeIdleConnections?.();
   });
   banco.close();
  })();
  return operacao;
 };
}
function derivar(raiz,rotulo){
 return Buffer.from(hkdfSync('sha256',Buffer.from(raiz,'utf8'),
  Buffer.from('AKITEMM_PREVIA_NAO_COMERCIAL_2026'),
  Buffer.from(rotulo),32));
}
async function iniciar({env=process.env}={}){
 if(env.NODE_ENV==='production'||env.LOOP_PREVIEW_EXCLUSIVO!=='SIM')
  falha('PREVIA_NAO_AUTORIZADA');
 const senhaAcesso=env.LOOP_PREVIEW_SENHA_ACESSO,
  segredoRaiz=env.LOOP_PREVIEW_SEGREDO_RAIZ;
 validarSegredos({senhaAcesso,segredoRaiz});
 // Sem senha isolada de operador, a prévia não inicia.
 if(typeof env.LOOP_PREVIEW_SENHA_ADMIN!=='string'||
    env.LOOP_PREVIEW_SENHA_ADMIN.length<24||
    env.LOOP_PREVIEW_SENHA_ADMIN===senhaAcesso)
  falha('ADMIN_CREDENCIAL_SEPARADA_OBRIGATORIA');
 // Falhar antes de abrir volume SQLite ou servidor interno: configurar uma
 // porta invalida nao pode deixar o processo vivo com listener fantasma.
 const port=Number(env.PORT||3000);
 if(!Number.isSafeInteger(port)||port<1||port>65535)
  falha('PORTA_PREVIA_INVALIDA');
 const pasta='/dados-preview';
 const dbPath=env.LOOP_PREVIEW_SQLITE||pasta+'/escritorio.sqlite';
 if(!path.isAbsolute(dbPath)||!path.resolve(dbPath).startsWith(pasta+'/'))
  falha('BANCO_PREVIA_FORA_DO_VOLUME');
 fs.mkdirSync(pasta,{recursive:true,mode:0o700});
 const montado=fs.readFileSync('/proc/self/mountinfo','utf8').split('\n')
  .some(linha=>linha.split(' ')[4]===pasta);
 if(!montado)falha('VOLUME_PREVIA_NAO_MONTADO');
 const db=new DatabaseSync(dbPath);
 db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;');
 const tokenOperador=derivar(segredoRaiz,'operador').toString('hex');
 // Sem as duas credenciais, nenhuma mensagem de recuperação é enviada.
 // Segredos nunca são adicionados ao HTML, logs ou GitHub.
 const temEnvio=Boolean(env.RESEND_API_KEY||env.RESEND_FROM_EMAIL);
 if(temEnvio&&(!env.RESEND_API_KEY||!env.RESEND_FROM_EMAIL))
  falha('RECUPERACAO_EMAIL_CONFIG_INCOMPLETA');
 const enviarRecuperacao=temEnvio?criarTransporteRecuperacaoResend({
  apiKey:env.RESEND_API_KEY,remetente:env.RESEND_FROM_EMAIL
 }):null;
 // Reutiliza o provedor ja configurado para prova de posse de email.
 // O cadastro, por si so, nao dispara mensagem: requer sessao e CSRF.
 const enviarVerificacao=temEnvio?criarTransporteEmailVerificacaoResend({
  apiKey:env.RESEND_API_KEY,remetente:env.RESEND_FROM_EMAIL
 }):null;
 // Um serviço + UM volume SQLite para compra, webhook, reconsulta e motor.
 // Exige opt-in explícito e credenciais do SANDBOX nesta PRÉVIA privada.
 // As credenciais de outro serviço/volume Railway NÃO se compartilham.
 const sandboxAtivo=env.LOOP_PREVIEW_ASAAS_HABILITADO==='SIM';
 if(sandboxAtivo&&(
    typeof env.LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY!=='string'||
    !env.LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY.startsWith('$aact_hmlg_')||
    env.LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY.length<25||
    typeof env.LOOP_PREVIEW_ASAAS_WEBHOOK_TOKEN!=='string'||
    env.LOOP_PREVIEW_ASAAS_WEBHOOK_TOKEN.length<32))
  falha('ASAAS_SANDBOX_PREVIA_CONFIG_INCOMPLETA');
 // Fail closed: o operador deve habilitar o PSP Sandbox primeiro,
 // com chave e token próprios da mesma prévia. Nenhum cron em produção.
 const autoAtivo=env.LOOP_PREVIEW_ASAAS_CONCILIACAO_AUTO==='SIM';
 if(autoAtivo&&!sandboxAtivo)
  falha('CONCILIACAO_AUTO_EXIGE_SANDBOX_ATIVO');
 const psp=sandboxAtivo?new AsaasSandboxLojaV6({
  apiKey:env.LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY
 }):null;
 const backupAtivo=env.LOOP_PREVIEW_BACKUP_OFFSITE_AUTO==='SIM';
 // Sem bucket S3 de homologação configurado, o backup permanece
 // DESLIGADO e o status informa a lacuna. Nunca usar o volume Asaas.
 const backupOffsite=backupAtivo?criarAgendadorBackupOffsiteLab({
  fonteSqlite:dbPath,raizVolume:pasta,
  senha:derivar(segredoRaiz,'backup-s3-gcm').toString('hex'),
  config:{
   endpoint:env.LOOP_BACKUP_S3_ENDPOINT,
   bucket:env.LOOP_BACKUP_S3_BUCKET,
   accessKeyId:env.LOOP_BACKUP_S3_ACCESS_KEY_ID,
   secretAccessKey:env.LOOP_BACKUP_S3_SECRET_ACCESS_KEY,
   region:env.LOOP_BACKUP_S3_REGION||'auto'
  },
  intervaloMs:24*60*60*1000,
  onErro:codigo=>process.stderr.write('LOOP_BACKUP_OFFSITE='+codigo+'\\n'),
  onSucesso:codigo=>process.stdout.write('LOOP_BACKUP_OFFSITE='+codigo+'\\n')
 }):null;
 const c=criarAppLojaEscritorioCandidato({
  banco:db,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:derivar(segredoRaiz,'email'),chaveCifra:derivar(segredoRaiz,'cifra'),
  ...(sandboxAtivo?{chaveCpfHmac:derivar(segredoRaiz,'cpf-hmac'),
   chaveCpfCifra:derivar(segredoRaiz,'cpf-cifra')}:{}),
  webhookHomologacaoToken:sandboxAtivo?env.LOOP_PREVIEW_ASAAS_WEBHOOK_TOKEN:null,
  provedorReconsultaSandbox:psp,operacoesSandboxAutorizadas:sandboxAtivo,
  conciliacaoAutomaticaConfigurada:autoAtivo,
  chaveRecuperacao:temEnvio?derivar(segredoRaiz,'senha-recuperacao'):null,
  enviarRecuperacao,
  chaveProvaEmail:temEnvio?derivar(segredoRaiz,'prova-posse-email'):null,
  enviarEmailDeVerificacao:enviarVerificacao,
  // CPF de ensaio desabilitado para não incentivar dados pessoais em prévia.
  captchaCadastroObrigatorio:true,
  captchaSegredo:derivar(segredoRaiz,'captcha-cadastro'),
  segredoOperador:tokenOperador,termosVersao:'LAB-escritorio-contato-nov2026',
  termosTexto:'Ao criar uma conta, você escolhe um nick exclusivo e senha de acesso ao Escritório Virtual LOOP e à Loja AKITEMM. Nome, e-mail e telefone são informados para comunicação, verificação cadastral e suporte. Se você acessar o cadastro por um link de indicação, seu telefone ficará visível somente para o titular daquele link, na área Minha Equipe, para contato sobre o LOOP. Pessoas sem vínculo de indicação não terão acesso a esse telefone. CPF, e-mail, senha e nome civil não serão exibidos na ficha de indicações.'
 });
 c.app.locals.backupOffsite=backupOffsite;
 const interno=c.app.listen(0,'127.0.0.1');
 await new Promise((ok,fail)=>{interno.once('listening',ok);interno.once('error',fail);});
 const gateway=criarGateway({portaInterna:interno.address().port,
  senhaAcesso,senhaAdmin:env.LOOP_PREVIEW_SENHA_ADMIN,
  segredoOperador:tokenOperador,
  validarNickIndicador:nick=>c.equipe.existeNick(nick),
  permitirWebhookSandbox:sandboxAtivo,
  publicarCadastroReal:env.LOOP_PREVIEW_PUBLICO_CADASTRO_REAL==='SIM',
  urlIdentidadeReal:env.LOOP_PREVIEW_PUBLICO_CADASTRO_REAL==='SIM'?
   env.LOOP_PREVIEW_URL_TABULEIRO_REAL:null
 });
 const agendador=autoAtivo?criarAgendadorConciliacaoSandbox({
  executar:c.executarConciliacaoSandbox,limite:20,intervaloMs:30000,
  onErro:codigo=>process.stderr.write('LOOP_CONCILIACAO_ENSAIO='+codigo+'\\n')
 }):null;
 let temporizadorCatraca=null,temporizadorMigracao=null;
 let migracaoEmCurso=false,ultimaMigracaoComprovada=null;
 async function sincronizarContasLegitimas(){
  if(migracaoEmCurso)return;
  migracaoEmCurso=true;
  try{
   const url=env.LOOP_PREVIEW_URL_TABULEIRO_REAL;
   const token=env.LOOP_PREVIEW_TOKEN_TABULEIRO_REAL;
   if(typeof url!=='string'||!/^http:\/\/[a-z0-9-]+\.railway\.internal(?::[0-9]{2,5})?\/internal\/loop\/tabuleiro$/.test(url)||
      typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))
    throw Error('MIGRACAO_REDE_PRIVADA_NAO_CONFIGURADA');
   const dados=exportarPreview({banco:db,contas:c.contas});
   const revisao=dados.conferencias.provaIds+':'+
    dados.conferencias.provaVinculos;
   if(revisao===ultimaMigracaoComprovada)return;
   const pacote=empacotar(dados,token);
   const res=await fetch(url.replace('/internal/loop/tabuleiro',
    '/internal/loop/migracao-identidade'),{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(pacote),signal:AbortSignal.timeout(180000)
   });
   const retorno=await res.json().catch(()=>({}));
   if(res.status!==200||retorno.estado!=='MIGRACAO_REAL_BACKUP_COMPROVADO'||
      retorno.contasImportadas!==dados.contas.length||
      retorno.vinculosImportados!==dados.vinculos.length)
    throw Error(typeof retorno.erro==='string'&&/^[A-Z_]{5,100}$/.test(retorno.erro)?
     retorno.erro:'MIGRACAO_DESTINO_NAO_CONFIRMADO');
   ultimaMigracaoComprovada=revisao;
   process.stdout.write('LOOP_MIGRACAO_IDENTIDADES=COMPROVADA;CONTAS='+
    retorno.contasImportadas+';VINCULOS='+retorno.vinculosImportados+
    ';PRIMEIRA_INDICACAO_VILELA='+String(retorno.primeiraIndicacaoVilelaConferida)+
    ';BACKUP_REAL_RESTAURADO=SIM\\n');
  }catch(e){
   const cod=typeof e?.message==='string'&&/^[A-Z_]{5,100}$/.test(e.message)?
    e.message:'MIGRACAO_REQUER_REPETICAO_SEGURA';
   process.stderr.write('LOOP_MIGRACAO_IDENTIDADES=INCONCLUSIVA;CODIGO='+cod+'\\n');
  }finally{migracaoEmCurso=false;}
 }
 gateway.listen(port,'0.0.0.0',()=>{
  process.stdout.write('AKITEMM_PREVIA_PROTEGIDA=PRONTA_SEM_PAGAMENTOS_REAIS\\n');
  // Prova de rede entre servicos REAL no ambiente publicado, não no
  // predeploy isolado. Consulta somente GET com token privado.
  void (async()=>{
   let resultado='SEM_CONFIGURACAO';
   try{
    const url=env.LOOP_PREVIEW_URL_TABULEIRO_REAL;
    const token=env.LOOP_PREVIEW_TOKEN_TABULEIRO_REAL;
    if(typeof url==='string'&&/^http:\/\/[a-z0-9-]+\.railway\.internal(?::[0-9]{2,5})?\/internal\/loop\/tabuleiro$/.test(url)&&
       typeof token==='string'&&/^[a-f0-9]{64}$/.test(token)){
     const resposta=await fetch(url,{method:'GET',
      signal:AbortSignal.timeout(3500),
      headers:{'x-loop-interservice-token':token}});
     const dados=await resposta.json().catch(()=>({}));
     resultado=resposta.status===200&&
       dados.origem==='MOTOR_REAL_SQLITE_DA_IDENTIDADE'?
       'OPERACIONAL_RECONHECIDO':
       resposta.status===503&&dados.erro==='MOTOR_REAL_NAO_ATIVO'?
       'REDE_OK_MOTOR_NAO_INICIADO':'HTTP_'+resposta.status;
    }
   }catch{resultado='REDE_NAO_COMPROVADA';}
   process.stdout.write('LOOP_TABULEIRO_REAL_CONEXAO='+resultado+'\\n');
   // Verificacao privada de ponta a ponta: a loja publicada e o banco
   // comercial persistente real devem compartilhar a custodia interservicos.
   if(env.LOOP_PREVIEW_CATALOGO_REAL==='SIM'){
    let estadoCatalogo='NAO_COMPROVADO';
    try{
     const alvo=env.LOOP_PREVIEW_URL_TABULEIRO_REAL;
     const raiz=env.LOOP_PREVIEW_TOKEN_TABULEIRO_REAL;
     if(typeof alvo==='string'&&
       /^http:\/\/[a-z0-9-]+\.railway\.internal(?::[0-9]{2,5})?\/internal\/loop\/tabuleiro$/.test(alvo)&&
       typeof raiz==='string'&&/^[a-f0-9]{64}$/.test(raiz)){
      const tokenCat=createHmac('sha256',Buffer.from(raiz,'hex'))
       .update('AKITEMM_CATALOGO_REAL_V1','utf8').digest('hex');
      const resposta=await fetch(alvo.replace('/internal/loop/tabuleiro',
       '/internal/catalogo/status'),{
       method:'GET',signal:AbortSignal.timeout(3500),
       headers:{'x-loop-catalogo-token':tokenCat}
      });
      const dados=await resposta.json().catch(()=>({}));
      estadoCatalogo=resposta.status===200&&
       dados.estado==='CATALOGO_REAL_PERSISTENTE'&&
       dados.sqliteIntegro===true&&dados.checkoutReal===false?
       'PERSISTENTE_VERIFICADO_SEM_CHECKOUT':'HTTP_'+resposta.status;
     }
    }catch{estadoCatalogo='INACESSIVEL';}
    process.stdout.write('AKITEMM_CATALOGO_REAL_STATUS='+estadoCatalogo+'\n');
   }
  })();
  if(agendador){
   agendador.iniciar();
   process.stdout.write('LOOP_CONCILIACAO_SANDBOX_AUTOMATICA=ATIVA_EM_ENSAIO\\n');
  }
  // A agenda comeca DESATIVADA no SQLite e nao altera compras ou filas.
  // Em janela ativa, no maximo uma compra REAL do Sandbox e contabilizada
  // por intervalo; nenhum PSP ou pagamento novo e criado por este relogio.
  temporizadorCatraca=setInterval(()=>{
   try{
    const r=c.motorConta.processarPulsoAgenda();
    if(['LUZ_DO_CICLO','GIRO_AGENDADO',
      'BLOQUEADA_PSP_EXIGE_REVISAO'].includes(r.acao))
     process.stdout.write('LOOP_CATRACA_AGENDA='+r.acao+'\n');
   }catch(e){
    process.stderr.write('LOOP_CATRACA_AGENDA='+
     String(e.codigo||'PULSO_BLOQUEADO')+'\n');
   }
  },15000);
  temporizadorCatraca.unref?.();
  if(env.LOOP_PREVIEW_MIGRAR_REAL==='SIM'){
   void sincronizarContasLegitimas();
   temporizadorMigracao=setInterval(()=>void sincronizarContasLegitimas(),90000);
   temporizadorMigracao.unref?.();
  }
  if(backupOffsite){
   backupOffsite.iniciar();
   process.stdout.write('LOOP_BACKUP_OFFSITE_AGENDADO=ATIVO_ENSAIO_SEM_PROVA_ANTECIPADA\\n');
  }
 });
 const encerrar=criarEncerramentoPreview({gateway,interno,banco:db,
  agendador,backupOffsite,
  pararTemporizadorCatraca:()=>{
   if(temporizadorCatraca!==null)clearInterval(temporizadorCatraca);
   if(temporizadorMigracao!==null)clearInterval(temporizadorMigracao);
  }
 });
 process.once('SIGTERM',()=>{void encerrar();});
 process.once('SIGINT',()=>{void encerrar();});
 return {gateway,interno,db,agendador,backupOffsite,encerrar};
}
if(require.main===module)iniciar().catch(e=>{
 // Diagnostico restrito: local do erro e categoria SQL, sem dados de clientes.
 const origem=String(e.stack||'').split('\n').slice(1,3)
  .map(x=>x.trim().replace(/\/app\//g,'')).join(' | ');
 const msg=String(e.message||'');
 const categoria=msg.match(/(?:no such (?:table|column)|foreign key mismatch|database is locked|cannot start a transaction|already exists|syntax error|trigger|constraint failed|malformed database schema|SQL logic error|readonly|not an error)/i)?.[0]||'OUTRO';
 process.stderr.write('AKITEMM_INIT_TIPO='+String(e.name||'ERRO').slice(0,48)+'\n');
 process.stderr.write('AKITEMM_INIT_CATEGORIA='+categoria+'\n');
 process.stderr.write('AKITEMM_INIT_ORIGEM='+origem.slice(0,180)+'\n');
 process.stderr.write('AKITEMM_PREVIA_BLOQUEADA='+
  String(e.codigo||'ERRO_DE_INICIALIZACAO')+'\n');
 process.exitCode=1;
});
module.exports={criarGateway,criarEncerramentoPreview,iniciar};
