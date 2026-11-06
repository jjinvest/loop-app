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
function criarGateway({portaInterna,senhaAcesso,segredoOperador,
 validarNickIndicador=()=>false,permitirWebhookSandbox=false}={}){
 if(!Number.isSafeInteger(portaInterna)||portaInterna<1||portaInterna>65535||
    typeof senhaAcesso!=='string'||senhaAcesso.length<24||
    typeof segredoOperador!=='string'||segredoOperador.length<32)
  falha('GATEWAY_PREVIA_INVALIDO');
 const backend='127.0.0.1:'+portaInterna;
 const sessaoNome='akitemm_preview_access';
 const indicacaoCookie='akitemm_preview_ref';
 const duracao=12*60*60*1000;
 const prazoIndicacao=30*24*60*60*1000;
 const assinarIndicacao=(nick,ts)=>createHmac('sha256',segredoOperador)
  .update('AKITEMM-REF-LAB-V1:'+nick+':'+ts).digest('hex');
 const lerIndicacao=req=>{
  const p=(req.headers.cookie||'').split(';').map(x=>x.trim())
   .filter(x=>x.startsWith(indicacaoCookie+'='));
  if(p.length!==1)return null;
  const v=p[0].slice(indicacaoCookie.length+1);
  const m=v.match(/^v1\.([a-z]{1,9})\.(\d{13})\.([a-f0-9]{64})$/);
  if(!m)return null;
  const ts=Number(m[2]);
  if(ts>Date.now()||Date.now()-ts>prazoIndicacao||
     !seguro(m[3],assinarIndicacao(m[1],m[2])))return null;
  return m[1];
 };
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
  const auth=req.headers.authorization||'';
  let decodificado='';
  if(/^Basic [A-Za-z0-9+/=]+$/.test(auth)){
   try{decodificado=Buffer.from(auth.slice(6),'base64').toString('utf8');}
   catch{}
  }
  const basicaValida=seguro(decodificado,'acesso:'+senhaAcesso);
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
  if(!basicaValida&&!sessaoValida&&!webhookUnificado)
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
  const caminhoConvite=url.pathname.match(/^\/(loja|escritorio)\/([A-Za-z]{1,9})$/);
  if(caminhoConvite){
   if(req.method!=='GET')return negar(405,'Método não permitido');
   const nick=caminhoConvite[2].toLowerCase();
   if(!validarNickIndicador(nick))return negar(404,'Link de ensaio inexistente');
   const ts=String(Date.now());
   const refCookie=indicacaoCookie+'=v1.'+nick+'.'+ts+'.'+
    assinarIndicacao(nick,ts)+
    '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000';
   res.writeHead(302,{...cabecalhosBase,
    Location:caminhoConvite[1]==='loja'?'/loja':'/minha-conta',
    'Set-Cookie':[...(novoCookie?[novoCookie]:[]),refCookie]});
   return res.end();
  }
  const atalhos={
   '/escritorio':'/staging/escritorio-admin',
   '/minha-conta':'/staging/cliente',
   '/loja':'/staging/loja'
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
// Trava novas conexoes ANTES de aguardar backup/PSP. As conexoes ainda
// ativas drenam antes de encerrar o backend e fechar o mesmo SQLite.
function criarEncerramentoPreview({gateway,interno,banco,agendador=null,backupOffsite=null}={}){
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
  segredoOperador:tokenOperador,termosVersao:'LAB-escritorio-preview-2026',
  termosTexto:'Este cadastro e apenas para experimentar as telas da AKITEMM. Use nome e email ficticios, sem CPF ou dados reais. Nenhuma compra ou participacao e ativada.'
 });
 c.app.locals.backupOffsite=backupOffsite;
 const interno=c.app.listen(0,'127.0.0.1');
 await new Promise((ok,fail)=>{interno.once('listening',ok);interno.once('error',fail);});
 const gateway=criarGateway({portaInterna:interno.address().port,
  senhaAcesso,segredoOperador:tokenOperador,
  validarNickIndicador:nick=>c.equipe.existeNick(nick),
  permitirWebhookSandbox:sandboxAtivo});
 const agendador=autoAtivo?criarAgendadorConciliacaoSandbox({
  executar:c.executarConciliacaoSandbox,limite:20,intervaloMs:30000,
  onErro:codigo=>process.stderr.write('LOOP_CONCILIACAO_ENSAIO='+codigo+'\\n')
 }):null;
 gateway.listen(port,'0.0.0.0',()=>{
  process.stdout.write('AKITEMM_PREVIA_PROTEGIDA=PRONTA_SEM_PAGAMENTOS_REAIS\\n');
  if(agendador){
   agendador.iniciar();
   process.stdout.write('LOOP_CONCILIACAO_SANDBOX_AUTOMATICA=ATIVA_EM_ENSAIO\\n');
  }
  if(backupOffsite){
   backupOffsite.iniciar();
   process.stdout.write('LOOP_BACKUP_OFFSITE_AGENDADO=ATIVO_ENSAIO_SEM_PROVA_ANTECIPADA\\n');
  }
 });
 const encerrar=criarEncerramentoPreview({gateway,interno,banco:db,
  agendador,backupOffsite});
 process.once('SIGTERM',()=>{void encerrar();});
 process.once('SIGINT',()=>{void encerrar();});
 return {gateway,interno,db,agendador,backupOffsite,encerrar};
}
if(require.main===module)iniciar().catch(e=>{
 process.stderr.write('AKITEMM_PREVIA_BLOQUEADA='+
  String(e.codigo||'ERRO_DE_INICIALIZACAO')+'\n');
 process.exitCode=1;
});
module.exports={criarGateway,criarEncerramentoPreview,iniciar};
