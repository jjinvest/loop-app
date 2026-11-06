'use strict';
// Aprovisionamento explicito APENAS no Asaas Sandbox.
// Idempotente por URL; nao altera/deleta Webhooks existentes nem imprime segredos.
const BASE='https://api-sandbox.asaas.com/v3/webhooks';
const DOMINIO='akitemm-escritorio-preview-homologacao.up.railway.app';
const DESTINO='https://'+DOMINIO+'/webhooks/asaas-sandbox-unificado';
const EVENTOS=[
 'PAYMENT_RECEIVED','PAYMENT_REFUNDED','PAYMENT_PARTIALLY_REFUNDED',
 'PAYMENT_REFUND_IN_PROGRESS','PAYMENT_CHARGEBACK_REQUESTED',
 'PAYMENT_CHARGEBACK_DISPUTE','PAYMENT_DELETED'
];
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
async function provisionarWebhookSandbox({env=process.env,fetchImpl=globalThis.fetch}={}){
 if(env.NODE_ENV==='production'||env.LOOP_PREVIEW_EXCLUSIVO!=='SIM'||
    env.LOOP_PREVIEW_ASAAS_HABILITADO!=='SIM'||
    env.LOOP_PREVIEW_ASAAS_WEBHOOK_PROVISIONAR!=='SIM')
  falha('PROVISIONAR_WEBHOOK_NAO_AUTORIZADO');
 const chave=env.LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY,
  token=env.LOOP_PREVIEW_ASAAS_WEBHOOK_TOKEN,
  email=env.LOOP_PREVIEW_ASAAS_WEBHOOK_EMAIL;
 if(typeof chave!=='string'||!chave.startsWith('$aact_hmlg_')||
    chave.length<25||/\s/.test(chave)||
    typeof token!=='string'||token.length<32||token.length>255||
    /\s/.test(token)||token===chave||
    typeof email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||
    env.RAILWAY_PUBLIC_DOMAIN!==DOMINIO||
    typeof fetchImpl!=='function')
  falha('PROVISIONAR_WEBHOOK_CONFIG_INVALIDA');
 const headers={access_token:chave,'User-Agent':'LoopV6-Sandbox/1.0',
  Accept:'application/json'};
 let resposta;
 try{
  resposta=await fetchImpl(BASE+'?limit=100',{method:'GET',headers,
   redirect:'error',signal:AbortSignal.timeout(8000)});
 }catch(_e){falha('PROVISIONAR_WEBHOOK_LISTA_INCONCLUSIVA');}
 if(!resposta.ok)falha('PROVISIONAR_WEBHOOK_LISTA_HTTP_'+resposta.status);
 let json;
 try{json=await resposta.json();}catch(_e){falha('PROVISIONAR_WEBHOOK_LISTA_INVALIDA');}
 const lista=Array.isArray(json)?json:Array.isArray(json?.data)?json.data:null;
 if(!lista||lista.length>100)falha('PROVISIONAR_WEBHOOK_LISTA_INVALIDA');
 const encontrados=lista.filter(x=>x&&x.url===DESTINO);
 if(encontrados.length>1)falha('PROVISIONAR_WEBHOOK_DUPLICADO_REVISAR');
 if(encontrados.length===1){
  const w=encontrados[0];
  if(w.enabled!==true||w.interrupted!==false||
     !Array.isArray(w.events)||EVENTOS.some(evento=>!w.events.includes(evento)))
   falha('PROVISIONAR_WEBHOOK_EXISTENTE_INCOMPLETO');
  return {configuracaoOperacional:true,criadoAgora:false,escritas:0,
   tokenComprovadoPorEntrega:false};
 }
 if(lista.length>=10||json?.hasMore===true)falha('PROVISIONAR_WEBHOOK_LIMITE_REVISAR');
 const payload={
  name:'LOOP 3.0 AKITEMM - Sandbox unificado',
  url:DESTINO,email,interrupted:false,enabled:true,
  authToken:token,events:EVENTOS,sendType:'SEQUENTIALLY',apiVersion:3
 };
 try{
  resposta=await fetchImpl(BASE,{
   method:'POST',redirect:'error',
   headers:{...headers,'Content-Type':'application/json'},
   body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)
  });
 }catch(_e){falha('PROVISIONAR_WEBHOOK_POST_INCONCLUSIVO_RECONSULTAR');}
 if(!resposta.ok)falha('PROVISIONAR_WEBHOOK_POST_HTTP_'+resposta.status);
 let criado;
 try{criado=await resposta.json();}catch(_e){falha('PROVISIONAR_WEBHOOK_POST_INCONCLUSIVO_RECONSULTAR');}
 if(criado?.url!==DESTINO||criado.enabled!==true)
  falha('PROVISIONAR_WEBHOOK_POST_INCONCLUSIVO_RECONSULTAR');
 return {configuracaoOperacional:true,criadoAgora:true,escritas:1,
  tokenComprovadoPorEntrega:false};
}
if(require.main===module)provisionarWebhookSandbox().then(r=>{
 process.stdout.write('LOOP_ASAAS_WEBHOOK_PROVISIONADO='+
  (r.criadoAgora?'CADASTRADO_NO_SANDBOX':'JA_EXISTIA_NO_SANDBOX')+'\n');
}).catch(e=>{
 // Nunca expor retorno do PSP, URLs alternativas, token ou identificadores.
 process.stderr.write('LOOP_ASAAS_WEBHOOK_PROVISIONAMENTO='+
  String(e.codigo||'INCONCLUSIVO').replace(/[^A-Z0-9_]/g,'').slice(0,90)+'\n');
 process.exitCode=1;
});
module.exports={provisionarWebhookSandbox};