'use strict';
// Somente GET externos, sem credenciais em logs e sem dados pessoais.
const {Buffer}=require('node:buffer');
const URL_PREVIA='https://akitemm-escritorio-preview-homologacao.up.railway.app';
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
async function provar({env=process.env,fetcher=globalThis.fetch}={}){
 if(env.NODE_ENV==='production'||env.LOOP_PREVIEW_EXCLUSIVO!=='SIM'||
    env.RAILWAY_PUBLIC_DOMAIN!=='akitemm-escritorio-preview-homologacao.up.railway.app'||
    typeof env.LOOP_PREVIEW_SENHA_ACESSO!=='string'||
    env.LOOP_PREVIEW_SENHA_ACESSO.length<24||
    typeof env.LOOP_PREVIEW_SENHA_ADMIN!=='string'||
    env.LOOP_PREVIEW_SENHA_ADMIN.length<24||
    env.LOOP_PREVIEW_SENHA_ADMIN===env.LOOP_PREVIEW_SENHA_ACESSO)
  falha('FRONTEIRA_SEM_CREDENCIAIS_INDEPENDENTES');
 const basic=(u,p)=>'Basic '+Buffer.from(u+':'+p).toString('base64');
 const cliente=basic('acesso',env.LOOP_PREVIEW_SENHA_ACESSO);
 const operador=basic('operador',env.LOOP_PREVIEW_SENHA_ADMIN);
 const get=async(path,auth,cookie)=>{
  let r;
  try{r=await fetcher(URL_PREVIA+path,{
   redirect:'manual',method:'GET',
   headers:{...(auth?{Authorization:auth}:{}),
    ...(cookie?{Cookie:cookie}:{})},
   signal:AbortSignal.timeout(12000)
  });}catch{falha('FRONTEIRA_HTTP_INDISPONIVEL');}
  return r;
 };
 const rCliente=await get('/minha-conta',cliente);
 if(rCliente.status!==200)falha('FRONTEIRA_CLIENTE_FALHOU');
 const cookieVisitante=(rCliente.headers.get('set-cookie')||'')
  .split(';')[0];
 if(!cookieVisitante.startsWith('akitemm_preview_access='))
  falha('FRONTEIRA_COOKIE_CLIENTE_AUSENTE');
 const tentativas=['/escritorio','/staging/assets/admin.js',
  '/staging/escritorio-unificado/motor/estado',
  '/staging/escritorio-unificado/motor/agenda',
  '/staging/escritorio-unificado/monitor-psp',
  '/STAGING/ESCRITORIO-ADMIN',
  '/STAGING/ESCRITORIO-UNIFICADO/MOTOR/ESTADO',
  '/staging/escritorio%2dunificado/motor/estado',
  '/staging/assets/%61dmin.js'];
 for(const rota of tentativas){
  const direct=await get(rota,cliente);
  if(direct.status!==401)falha('FRONTEIRA_CLIENTE_ACESSOU_ADMIN');
  const session=await get(rota,null,cookieVisitante);
  if(session.status!==401)falha('FRONTEIRA_COOKIE_ACESSOU_ADMIN');
 }
 const rAdmin=await get('/escritorio',operador);
 if(rAdmin.status!==200)falha('FRONTEIRA_OPERADOR_INVALIDO');
 const cookieAdmin=(rAdmin.headers.get('set-cookie')||'')
  .split(';')[0];
 if(!cookieAdmin.startsWith('akitemm_preview_admin_v2='))
  falha('FRONTEIRA_SESSAO_ADMIN_AUSENTE');
 const rPainel=await get('/staging/escritorio-unificado/motor/estado',
  null,cookieAdmin);
 if(rPainel.status!==200)falha('FRONTEIRA_API_ADMIN_AUSENTE');
 const rAsaas=await get('/staging/asaas/webhook-unificado',operador);
 if(rAsaas.status!==404)falha('FRONTEIRA_WEBHOOK_INTERNO_EXPOSTO');
 return {clientePaginaAcessivel:true,rotasAdminBloqueadasParaCliente:tentativas.length,
  sessaoAdminSeparada:true,adminV2:true,webhookInternoInacessivel:true,
  requestsSomenteGET:true,alteracoesEstado:0,financeiroReal:false};
}
if(require.main===module)provar().then(r=>{
 process.stdout.write('LOOP_FRONTEIRA_ADMIN_HTTP='+JSON.stringify(r)+'\n');
}).catch(e=>{
 process.stderr.write('LOOP_FRONTEIRA_ADMIN_HTTP='+
  String(e.codigo||'INCONCLUSIVO').replace(/[^A-Z0-9_]/g,'')+'\n');
 process.exitCode=1;
});
module.exports={provar};