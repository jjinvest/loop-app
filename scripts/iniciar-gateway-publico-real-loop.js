'use strict';
// Entrada publica definitiva: SOMENTE encaminha para a identidade REAL.
// Nunca abre banco, liga ensaios, motor ficticio ou PSP sandbox.
// A troca do startCommand do Railway exige prova de origem, sessao,
// fotos, backup e aprovacao; importar este modulo nao publica nada.
const http=require('node:http');
const {URL}=require('node:url');
const {provarLigacaoPrivada}=require('./provar-ligacao-privada-loop');
const MUTACOES=new Set(['POST','PATCH','PUT','DELETE']);
const METODOS=new Set(['GET','HEAD',...MUTACOES]);
const MAX_BODY=4*1024*1024;
const COOKIE_REAL=new Set(['loop_real_s','akitemm_real_admin_v1']);
const ORIGENS_PUBLICAS=Object.freeze([
 'https://akitemmloop.com.br',
 'https://akitemm-escritorio-preview-homologacao.up.railway.app'
]);
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function validarConfiguracao({urlIdentidadeReal,origemReal,
 origensPublicas=ORIGENS_PUBLICAS,testeLoopback=false}={}){
 const local=testeLoopback&&process.env.NODE_ENV!=='production';
 if(typeof urlIdentidadeReal!=='string'||
    !(new RegExp('^http://[a-z0-9-]+\\.railway\\.internal(?::[0-9]{2,5})?/?$').test(urlIdentidadeReal)||
      local&&/^http:\/\/127\.0\.0\.1:[0-9]{2,5}\/?$/.test(urlIdentidadeReal)))
   falha('GATEWAY_REAL_DESTINO_INTERNO_OBRIGATORIO');
 let real;
 try{real=new URL(origemReal);}catch{falha('GATEWAY_REAL_ORIGEM_INVALIDA');}
 if(real.protocol!=='https:'||real.pathname!=='/'||real.search||real.hash||
    !/^[a-z0-9.-]+$/.test(real.hostname))
  falha('GATEWAY_REAL_ORIGEM_INVALIDA');
 if(!Array.isArray(origensPublicas)||origensPublicas.length<1||
    origensPublicas.some(o=>{
     try{const u=new URL(o);return u.protocol!=='https:'||
      u.pathname!=='/'||u.search||u.hash||u.origin!==o;}
     catch{return true;}
    }))
  falha('GATEWAY_REAL_DOMINIOS_INVALIDOS');
 return {alvo:new URL(urlIdentidadeReal),origemReal:real.origin,
  origensPublicas:new Set(origensPublicas),local};
}
function caminhoSeguro(pathname){
 // Nunca entregar rotas internas nem reinterpretar escapes/percursos.
 if(typeof pathname!=='string'||pathname.length>1024||
    pathname.includes('%')||pathname.includes('\\')||
    pathname.includes('//')||pathname.includes('\0'))
  return {status:400};
 if(pathname.startsWith('/staging/')||pathname==='/staging'||
    pathname.startsWith('/laboratorio/')||pathname==='/laboratorio'||
    pathname==='/api/loop/tesouraria-ensaio'||
    pathname.startsWith('/api/loop/tesouraria-ensaio/')||
    /^\/api\/loop\/posicoes\/[^/]+\/confirmar-ensaio$/.test(pathname))
  return {status:410};
 if(pathname==='/')return {status:302,location:'/minha-conta'};
 if(pathname==='/cadastro-real')return {path:'/minha-conta'};
 if(['/minha-conta','/escritorio','/loja','/convite/loja',
    '/administrador','/administrador/entrar',
    '/healthz','/readyz'].includes(pathname))
  return {path:pathname};
 if(/^\/(?:loja|escritorio)\/[A-Za-z]{1,12}$/.test(pathname)||
    /^\/identidade\/assets\/[a-zA-Z0-9._-]{1,100}$/.test(pathname)||
    /^\/administrador\/[a-z0-9-]{1,80}$/.test(pathname))
  return {path:pathname};
 if(/^\/api\/(?:contas|operador|admin|loja|financeiro)(?:\/|$)/.test(pathname)||
    ['/api/loop/estado','/api/loop/fila',
     '/api/loop/eventos-comerciais'].includes(pathname))
  return {path:pathname};
 if(pathname.startsWith('/internal/')||
    pathname.startsWith('/api/checkout')||
    pathname.startsWith('/api/loop/tesouraria'))
  return {status:404};
 return {status:404};
}
function cookiesReais(raw){
 if(!raw)return null;
 if(typeof raw!=='string'||raw.length>4096)
  falha('GATEWAY_REAL_COOKIE_INVALIDO');
 const filtrados=[];
 for(const c of raw.split(';')){
  const t=c.trim(),i=t.indexOf('=');
  if(i<1)continue;
  const chave=t.slice(0,i);
  if(COOKIE_REAL.has(chave)){
   if(filtrados.some(x=>x.startsWith(chave+'='))||
      !/^[a-f0-9]{64}$/.test(t.slice(i+1)))
    falha('GATEWAY_REAL_COOKIE_INVALIDO');
   filtrados.push(t);
  }
 }
 return filtrados.length?filtrados.join('; '):null;
}
function criarGatewayPublicoReal(opcoes={}){
 const {alvo,origemReal,origensPublicas,local}=
  validarConfiguracao(opcoes);
 return http.createServer((req,res)=>{
  const base={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
   'Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',
   'Strict-Transport-Security':'max-age=31536000'};
  const responder=(status,body='',headers={})=>{
   if(res.headersSent)return;
   res.writeHead(status,{...base,...headers,
    'Content-Type':'text/plain; charset=utf-8'});
   res.end(body);
  };
  if(!METODOS.has(req.method))return responder(405,'Método não permitido');
  const host=req.headers.host;
  let origemPublica=host&&'https://'+host;
  const hostLocal=local&&typeof host==='string'&&
   /^127\.0\.0\.1:[0-9]{2,5}$/.test(host);
  const checkHealth=['/healthz','/readyz'].includes(req.url)&&
   (req.method==='GET'||req.method==='HEAD')&&!req.headers.origin;
  if(!hostLocal&&!origensPublicas.has(origemPublica)&&!checkHealth)
   return responder(421,'Domínio não autorizado');
  if(hostLocal)origemPublica='http://'+host;
  else if(checkHealth&&!origensPublicas.has(origemPublica))
   origemPublica=origensPublicas.values().next().value;
  if(typeof req.url!=='string'||req.url.length>3000)
   return responder(414,'URL muito longa');
  // Rejeitar segmentos perigosos ANTES de URL normalizar /../ e %2e.
  const rawPath=req.url.split('?')[0];
  if(!rawPath.startsWith('/')||rawPath.includes('%')||
     rawPath.includes('\\')||rawPath.includes('//')||
     /(?:^|\/)\.{1,2}(?:\/|$)/.test(rawPath))
   return responder(400,'Caminho não autorizado');
  if(rawPath==='/favicon.ico'){
   res.writeHead(204,base);return res.end();
  }
  let url;
  try{url=new URL(req.url,origemPublica);}
  catch{return responder(400,'URL inválida');}
  if(url.origin!==origemPublica)return responder(400,'URL não autorizada');
  const rota=caminhoSeguro(url.pathname);
  if(rota.status===302)
   return responder(302,'',{'Location':rota.location});
  if(!rota.path)return responder(rota.status||404,'Rota indisponível');
  if(req.method==='HEAD'&&rota.path.startsWith('/api/'))
   return responder(405,'Método não permitido');
  const mutacao=MUTACOES.has(req.method);
  // Chrome Android pode omitir Origin (ou enviar "null") em um POST
  // de formulário navegacional, sob Referrer-Policy: no-referrer.
  // A exceção exige metadados de navegação impostos pelo navegador e
  // vale APENAS para o formulário de entrada administrativa; JSON, APIs
  // e qualquer origem externa continuam estritamente bloqueados.
  const formularioAdminDoMesmoSite=mutacao&&
   req.method==='POST'&&url.pathname==='/administrador/entrar'&&
   (req.headers.origin===undefined||req.headers.origin==='null')&&
   req.headers['sec-fetch-site']==='same-origin'&&
   req.headers['sec-fetch-mode']==='navigate'&&
   req.headers['sec-fetch-dest']==='document'&&
   /^application\\/x-www-form-urlencoded(?:;|$)/i.test(
    req.headers['content-type']||'');
  if(mutacao&&req.headers.origin!==origemPublica&&
     !formularioAdminDoMesmoSite)
   return responder(403,'Origem não autorizada');
  if(!mutacao&&req.headers.origin&&
     req.headers.origin!==origemPublica)
   return responder(403,'Origem não autorizada');
  if(typeof req.headers['content-length']==='string'&&
     Number(req.headers['content-length'])>MAX_BODY)
   return responder(413,'Envio muito grande');
  let cookies;
  try{cookies=cookiesReais(req.headers.cookie);}
  catch{return responder(400,'Cookie inválido');}
  const headers={...req.headers,host:alvo.host};
  for(const k of Object.keys(headers)){
   if(k.startsWith('x-forwarded-')||
      ['forwarded','authorization','proxy-authorization','connection',
       'transfer-encoding','origin','referer','cookie','x-loop-interservice-token',
       'x-loop-catalogo-token','x-akitemm-preview-indicador'].includes(k))
    delete headers[k];
  }
  if(cookies)headers.cookie=cookies;
  if(mutacao)headers.origin=origemReal;
  const upstream=http.request({
   hostname:alvo.hostname,port:alvo.port||80,
   method:req.method,path:rota.path+url.search,headers,timeout:45000
  },reply=>{
   if(res.headersSent){reply.destroy();return;}
   const h={...reply.headers,...base};
   for(const k of ['connection','transfer-encoding','server','x-powered-by'])
    delete h[k];
   if(typeof h.location==='string'){
    try{
     const redirect=new URL(h.location,origemReal);
     if(redirect.origin===origemReal)
      h.location=redirect.pathname+redirect.search+redirect.hash;
     else{reply.destroy();return responder(502,'Redirecionamento externo bloqueado');}
    }catch{reply.destroy();return responder(502,'Redirecionamento inválido');}
   }
   if(h['set-cookie']){
    // Cookies reais host-only na origem AKITEMM, nunca cookies do LAB.
    const set=Array.isArray(h['set-cookie'])?
     h['set-cookie']:[h['set-cookie']];
    h['set-cookie']=set.filter(v=>COOKIE_REAL.has(v.split('=')[0]))
     .map(v=>v.replace(/;\s*Domain=[^;]*/gi,''));
   }
   res.writeHead(reply.statusCode||502,h);
   reply.pipe(res);
  });
  upstream.on('timeout',()=>upstream.destroy());
  upstream.on('error',()=>{
   if(!res.headersSent)responder(502,'Sistema real indisponível');
   else res.destroy();
  });
  req.on('aborted',()=>upstream.destroy());
  let recebidos=0,excesso=false;
  req.on('data',bloco=>{
   recebidos+=bloco.length;
   if(recebidos>MAX_BODY&&!excesso){
    excesso=true;req.unpipe(upstream);upstream.destroy();
    responder(413,'Envio muito grande');
   }
  });
  req.pipe(upstream);
 });
}
function iniciar(ambiente=process.env){
 if(ambiente.NODE_ENV!=='production'||
    ambiente.LOOP_PUBLICO_ENTRADA_REAL!=='SIM'||
    ambiente.LOOP_PUBLICO_CADASTRO_ANTIGO_FECHADO!=='SIM')
  falha('GATEWAY_PUBLICO_REAL_NAO_AUTORIZADO');
 const porta=Number(ambiente.PORT||8080);
 if(!Number.isSafeInteger(porta)||porta<1||porta>65535)
  falha('GATEWAY_PUBLICO_PORTA_INVALIDA');
 const opcoes={
  urlIdentidadeReal:ambiente.LOOP_PUBLICO_URL_IDENTIDADE_INTERNA,
  origemReal:ambiente.LOOP_PUBLICO_ORIGEM_IDENTIDADE_REAL
 };
 const ligacao=validarConfiguracao(opcoes);
 const servidor=criarGatewayPublicoReal(opcoes);
 // Nunca aceitar trafego publico antes de provar a origem REAL,
 // sessao isolada, loja fechada, tela aprovada e edição de fotos.
 // Falha impede nova instancia de subir (sem retorno ao SQLite antigo).
 return provarLigacaoPrivada(ligacao).then(()=>new Promise((resolve,reject)=>{
  servidor.once('error',reject);
  servidor.listen(porta,'0.0.0.0',()=>{
   servidor.off('error',reject);
   process.stdout.write('LOOP_GATEWAY_PUBLICO=REAL_SEM_LAB_SEM_FINANCEIRO\n');
   resolve(servidor);
  });
 }));
}
if(require.main===module){
 Promise.resolve().then(()=>iniciar()).catch(e=>{
  const bruto=e?.codigo||e?.message||'GATEWAY_PUBLICO_REAL_INDISPONIVEL';
  const codigo=/^[A-Z0-9_]{5,100}$/.test(bruto)?
   bruto:'GATEWAY_PUBLICO_REAL_INDISPONIVEL';
  process.stderr.write(codigo+'\n');
  process.exitCode=1;
 });
}
module.exports={validarConfiguracao,caminhoSeguro,cookiesReais,
 criarGatewayPublicoReal,iniciar};
