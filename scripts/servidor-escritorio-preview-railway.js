'use strict';
// Acesso remoto EXCLUSIVO a uma previa protegida, sem expondo o candidato
// diretamente: o servidor do candidato permanece em loopback.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {createHash,createHmac,hkdfSync,timingSafeEqual}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');

function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function digerir(s){return createHash('sha256').update(s,'utf8').digest();}
function seguro(a,b){return timingSafeEqual(digerir(a),digerir(b));}
function validarSegredos({senhaAcesso,segredoRaiz}){
 if(typeof senhaAcesso!=='string'||senhaAcesso.length<24||
    typeof segredoRaiz!=='string'||segredoRaiz.length<56||
    senhaAcesso===segredoRaiz)
  falha('SEGREDOS_PREVIA_NAO_CONFIGURADOS');
}
function criarGateway({portaInterna,senhaAcesso,segredoOperador}={}){
 if(!Number.isSafeInteger(portaInterna)||portaInterna<1||portaInterna>65535||
    typeof senhaAcesso!=='string'||senhaAcesso.length<24||
    typeof segredoOperador!=='string'||segredoOperador.length<32)
  falha('GATEWAY_PREVIA_INVALIDO');
 const backend='127.0.0.1:'+portaInterna;
 const sessaoNome='akitemm_preview_access';
 const duracao=12*60*60*1000;
 const assinar=ts=>createHmac('sha256',senhaAcesso).update('preview:'+ts).digest('hex');
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
  .replace("credentials:'omit'","credentials:'same-origin'")+
  "\n// Na previa privada, o proxy autentica o operador no servidor.\n"+
  "auth='PREVIA_OPERADOR';\n"+
  "atualizar().then(()=>{$('acesso').hidden=true;"+
  "$('administracao').hidden=false;}).catch(e=>dizer(e.message));\n";
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
  if(url.pathname==='/healthz'&&req.method==='GET'){
   res.writeHead(200,{...cabecalhosBase,'Content-Type':'application/json'});
   return res.end(JSON.stringify({estado:'PREVIA_PROTEGIDA',financeiroReal:false}));
  }
  const auth=req.headers.authorization||'';
  let decodificado='';
  if(/^Basic [A-Za-z0-9+/=]+$/.test(auth)){
   try{decodificado=Buffer.from(auth.slice(6),'base64').toString('utf8');}
   catch{}
  }
  const basicaValida=seguro(decodificado,'acesso:'+senhaAcesso);
  const sessaoValida=lerSessao(req);
  if(!basicaValida&&!sessaoValida)
   return negar(401,'Acesso exclusivo para homologação',{
    'WWW-Authenticate':'Basic realm="AKITEMM - Acesso de teste", charset="UTF-8"'
   });
  const agora=String(Date.now());
  const novoCookie=basicaValida&&!sessaoValida?
   sessaoNome+'=v1.'+agora+'.'+assinar(agora)+
   '; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200':null;
  const origem=req.headers.origin;
  if(origem){
   let origemOk=false;
   try{
    const u=new URL(origem);
    origemOk=(u.protocol==='https:'&&u.host===req.headers.host);
   }catch{}
   if(!origemOk)return negar(403,'Origem não autorizada');
  }
  if(req.method==='OPTIONS'||!['GET','HEAD','POST','PATCH','PUT','DELETE'].includes(req.method))
   return negar(405,'Método não permitido');
  if(url.pathname==='/'){
   res.writeHead(302,{...cabecalhosBase,Location:'/escritorio',...(novoCookie?{'Set-Cookie':novoCookie}:{})});
   return res.end();
  }
  const atalhos={
   '/escritorio':'/staging/escritorio-admin',
   '/minha-conta':'/staging/cliente',
   '/loja':'/staging/loja'
  };
  if(!url.pathname.startsWith('/staging/')&&!Object.hasOwn(atalhos,url.pathname))
   return negar(404,'Página não encontrada');
  if(url.pathname==='/staging/assets/admin.js'){
   if(req.method!=='GET')return negar(405,'Método não permitido');
   res.writeHead(200,{...cabecalhosBase,
    'Content-Type':'text/javascript; charset=utf-8',
    ...(novoCookie?{'Set-Cookie':novoCookie}:{})});
   return res.end(corpoAdmin);
  }
  const destino=(atalhos[url.pathname]||url.pathname)+url.search;
  // O navegador só conhece o gateway HTTPS. O backend de homologação
  // conhece somente uma conexão de loopback com Host local.
  const headers={...req.headers,host:backend,origin:'http://'+backend};
  for(const k of Object.keys(headers))
   if(k.startsWith('x-forwarded-')||['forwarded','proxy-authorization',
      'connection','transfer-encoding'].includes(k))delete headers[k];
  delete headers.authorization;
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
   if(novoCookie){
    retorno['set-cookie']=[...(retorno['set-cookie']||[]),novoCookie];
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
 const c=criarAppLojaEscritorioCandidato({
  banco:db,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:derivar(segredoRaiz,'email'),chaveCifra:derivar(segredoRaiz,'cifra'),
  // CPF de ensaio desabilitado para não incentivar dados pessoais em prévia.
  segredoOperador:tokenOperador,termosVersao:'LAB-escritorio-preview-2026',
  termosTexto:'Este cadastro e apenas para experimentar as telas da AKITEMM. Use nome e email ficticios, sem CPF ou dados reais. Nenhuma compra ou participacao e ativada.'
 });
 const interno=c.app.listen(0,'127.0.0.1');
 await new Promise((ok,fail)=>{interno.once('listening',ok);interno.once('error',fail);});
 const gateway=criarGateway({portaInterna:interno.address().port,
  senhaAcesso,segredoOperador:tokenOperador});
 const port=Number(env.PORT||3000);
 if(!Number.isSafeInteger(port)||port<1||port>65535)
  falha('PORTA_PREVIA_INVALIDA');
 gateway.listen(port,'0.0.0.0',()=>{
  process.stdout.write('AKITEMM_PREVIA_PROTEGIDA=PRONTA_SEM_PAGAMENTOS_REAIS\n');
 });
 function encerrar(){gateway.close(()=>interno.close(()=>db.close()));}
 process.once('SIGTERM',encerrar);process.once('SIGINT',encerrar);
 return {gateway,interno,db};
}
if(require.main===module)iniciar().catch(e=>{
 process.stderr.write('AKITEMM_PREVIA_BLOQUEADA='+
  String(e.codigo||'ERRO_DE_INICIALIZACAO')+'\n');
 process.exitCode=1;
});
module.exports={criarGateway,iniciar};
