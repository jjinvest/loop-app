'use strict';
// Consulta somente de leitura das configuracoes de webhook Asaas Sandbox.
// O token de webhook, a API key, os IDs dos eventos e o JSON remoto nunca entram no log.
const BASE='https://api-sandbox.asaas.com/v3/webhooks?limit=100';
const DOMINIO='akitemm-escritorio-preview-homologacao.up.railway.app';
const DESTINO='https://'+DOMINIO+'/webhooks/asaas-sandbox-unificado';
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
async function auditarWebhooksSandbox({env=process.env,fetchImpl=globalThis.fetch}={}){
 if(env.NODE_ENV==='production'||env.LOOP_PREVIEW_EXCLUSIVO!=='SIM'||
    env.LOOP_PREVIEW_ASAAS_HABILITADO!=='SIM')falha('AUDITORIA_WEBHOOK_PREVIA_NAO_AUTORIZADA');
 const chave=env.LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY;
 if(typeof chave!=='string'||!chave.startsWith('$aact_hmlg_')||
    chave.length<25||/\s/.test(chave))falha('AUDITORIA_WEBHOOK_CHAVE_INVALIDA');
 if(env.RAILWAY_PUBLIC_DOMAIN&&env.RAILWAY_PUBLIC_DOMAIN!==DOMINIO)
  falha('AUDITORIA_WEBHOOK_DOMINIO_DIVERGENTE');
 if(typeof fetchImpl!=='function')falha('AUDITORIA_WEBHOOK_TRANSPORTE_INVALIDO');
 let resposta;
 try {
  resposta=await fetchImpl(BASE,{
   method:'GET',redirect:'error',headers:{
    access_token:chave,'User-Agent':'LoopV6-Sandbox/1.0',Accept:'application/json'
   },signal:AbortSignal.timeout(8000)
  });
 }catch(_erro){falha('AUDITORIA_WEBHOOK_REDE_INCONCLUSIVA');}
 if(!resposta.ok)falha('AUDITORIA_WEBHOOK_HTTP_'+resposta.status);
 let dados;
 try{dados=await resposta.json();}catch(_erro){falha('AUDITORIA_WEBHOOK_RESPOSTA_INVALIDA');}
 const lista=Array.isArray(dados)?dados:Array.isArray(dados?.data)?dados.data:null;
 if(!lista||lista.length>100)falha('AUDITORIA_WEBHOOK_RESPOSTA_INVALIDA');
 const relativos=lista.filter(x=>x&&x.url===DESTINO);
 // Duplicatas e fila interrompida exigem intervencao, nao autoajuste silencioso.
 const correto=relativos.length===1&&relativos[0].enabled===true&&
  relativos[0].interrupted===false&&
  Array.isArray(relativos[0].events)&&relativos[0].events.includes('PAYMENT_RECEIVED');
 return Object.freeze({
  ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  configuracaoEncontrada:relativos.length>0,
  configuracaoOperacional:correto,
  configuracoesDuplicadas:relativos.length>1,
  // Evidencia de configuração, nao de entrega. Apenas evento real comprova token.
  entregaExternaComprovada:false,
  tokenDeWebhookValidadoPorEntrega:false,
  chamadasDeEscrita:0
 });
}
if(require.main===module)auditarWebhooksSandbox().then(r=>{
 process.stdout.write('LOOP_ASAAS_WEBHOOK_CONFIG='+
  (r.configuracaoOperacional?'CONFIGURADA_SEM_ENTREGA_COMPROVADA':
   r.configuracoesDuplicadas?'DUPLICADA_EXIGE_REVISAO':
    r.configuracaoEncontrada?'INCOMPLETA_EXIGE_REVISAO':'AUSENTE_EXIGE_CADASTRO')+'\n');
}).catch(e=>{
 process.stderr.write('LOOP_ASAAS_WEBHOOK_AUDITORIA='+
  (String(e.codigo||'INCONCLUSIVA').replace(/[^A-Z0-9_]/g,'').slice(0,80))+'\n');
 process.exitCode=1;
});
module.exports={auditarWebhooksSandbox};