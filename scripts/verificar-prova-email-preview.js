'use strict';
// Prova HTTP somente de leitura do cadastro na previa, sem enviar email,
// cadastrar pessoas, coletar CPF ou consultar PII.
const BASE='https://akitemm-escritorio-preview-homologacao.up.railway.app';
function erro(c){const e=new Error(c);e.codigo=c;throw e;}
async function verificarProvaEmailPreview({env=process.env,fetchImpl=globalThis.fetch}={}){
 if(env.NODE_ENV==='production'||env.LOOP_PREVIEW_EXCLUSIVO!=='SIM'||
    env.RAILWAY_PUBLIC_DOMAIN!=='akitemm-escritorio-preview-homologacao.up.railway.app')
  erro('PROVA_EMAIL_NAO_AUTORIZADA');
 if(typeof env.LOOP_PREVIEW_SENHA_ACESSO!=='string'||
    env.LOOP_PREVIEW_SENHA_ACESSO.length<24||
    !env.RESEND_API_KEY||!env.RESEND_FROM_EMAIL||
    typeof fetchImpl!=='function')erro('PROVA_EMAIL_CONFIG_INCOMPLETA');
 const auth='Basic '+Buffer.from('acesso:'+env.LOOP_PREVIEW_SENHA_ACESSO).toString('base64');
 const request=async(path,accept='application/json')=>{
  let res;
  try{res=await fetchImpl(BASE+path,{method:'GET',redirect:'error',
   headers:{Authorization:auth,Accept:accept},
   signal:AbortSignal.timeout(9000)})}
  catch{erro('PROVA_EMAIL_REDE_INCONCLUSIVA');}
  if(res.status!==200)erro('PROVA_EMAIL_HTTP_'+res.status);
  try{return accept==='application/json'?await res.json():await res.text();}
  catch{erro('PROVA_EMAIL_RESPOSTA_INCONCLUSIVA');}
 };
 const a=await request('/staging/escritorio-unificado');
 const js=await request('/staging/assets/cliente.js','text/javascript');
 if(a?.escritorioFonteUnica!==true||
    a?.verificacaoEmailDisponivel!==true||
    a?.recuperacaoSenhaEmailDisponivel!==true||
    typeof js!=='string'||!js.includes('/contas/email/enviar')||
    !js.includes('/contas/email/confirmar'))
  erro('PROVA_EMAIL_INTEGRACAO_INCOMPLETA');
 return {integracaoCadastroEmail:true,integracaoRecuperacaoEmail:true,
  interfaceLigada:true,operacoesDeEscrita:0,mensagensEnviadas:0,
  entregaRealDeMensagemComprovada:false,acessoComercialLiberado:false};
}
if(require.main===module)verificarProvaEmailPreview().then(v=>{
 process.stdout.write('LOOP_EMAIL_CADASTRO_CONECTADO='+JSON.stringify(v)+'\n');
}).catch(e=>{
 process.stderr.write('LOOP_EMAIL_CADASTRO_CONECTADO='+
  String(e.codigo||'INCONCLUSIVA').replace(/[^A-Z0-9_]/g,'').slice(0,90)+'\n');
 process.exitCode=1;
});
module.exports={verificarProvaEmailPreview};