'use strict';
// Smoke EXTERNO de carga de leitura sobre a previa de homologacao.
// Nao cria contas, pedidos, Pix, webhooks, posicoes, saldo ou saques.
const BASE='https://akitemm-escritorio-preview-homologacao.up.railway.app';
const DOMAIN='akitemm-escritorio-preview-homologacao.up.railway.app';
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function percentile(values,p){
 const ordenada=[...values].sort((a,b)=>a-b);
 return Math.round(ordenada[Math.max(0,Math.ceil(ordenada.length*p)-1)]);
}
async function medirCargaLeitura({env=process.env,fetchImpl=globalThis.fetch,
 agora=()=>performance.now(),total=160,concorrencia=8,prontidoes=6}={}){
 if(env.NODE_ENV==='production'||env.LOOP_PREVIEW_EXCLUSIVO!=='SIM'||
    env.LOOP_PREVIEW_CARGA_LEITURA_EXECUTAR!=='SIM'||
    env.RAILWAY_PUBLIC_DOMAIN!==DOMAIN)
  falha('CARGA_PREVIA_NAO_AUTORIZADA');
 if(!Number.isSafeInteger(total)||total<1||total>250||
    !Number.isSafeInteger(concorrencia)||concorrencia<1||concorrencia>10||
    !Number.isSafeInteger(prontidoes)||prontidoes<1||prontidoes>10||
    typeof fetchImpl!=='function'||typeof agora!=='function'||
    typeof env.LOOP_PREVIEW_SENHA_ACESSO!=='string'||
    env.LOOP_PREVIEW_SENHA_ACESSO.length<24)
  falha('CARGA_PARAMETROS_INVALIDOS');
 const duracoes=[],falhas={liveness:0,readiness:0};
 async function consultar(rota,auth=false){
  const inicio=agora();
  let status,body;
  try{
   const resposta=await fetchImpl(BASE+rota,{
    method:'GET',redirect:'error',
    headers:{Accept:'application/json','Cache-Control':'no-store',
     ...(auth?{Authorization:'Basic '+Buffer.from('acesso:'+
       env.LOOP_PREVIEW_SENHA_ACESSO).toString('base64')}: {})},
    signal:AbortSignal.timeout(6500)
   });
   status=resposta.status;
   body=await resposta.json();
  }catch(_e){return {ok:false,duracao:Math.round(agora()-inicio)};}
  return {ok:status===200&&body?.financeiroReal===false&&
    body?.marcoZeroLiberado===false&&
    body?.estado===(auth?'BANCO_DE_ENSAIO_APTO':'PREVIA_PROTEGIDA'),
   duracao:Math.round(agora()-inicio)};
 }
 let indice=0;
 await Promise.all(Array.from({length:Math.min(total,concorrencia)},async()=>{
  while(indice<total){
   indice++;
   const r=await consultar('/healthz');
   duracoes.push(r.duracao);
   if(!r.ok)falhas.liveness++;
  }
 }));
 // Readiness profunda e mais custosa: sequencial e com Basic apenas no GET protegido.
 for(let i=0;i<prontidoes;i++){
  const r=await consultar('/readyz',true);
  duracoes.push(r.duracao);
  if(!r.ok)falhas.readiness++;
 }
 const resultado=Object.freeze({
  ambiente:'HOMOLOGACAO_SOMENTE_LEITURA',
  totalRequisicoes:total+prontidoes,
  concorrenciaMaxima:concorrencia,
  totalHealthz:total,totalReadyz:prontidoes,
  erros:falhas.liveness+falhas.readiness,
  errosHealthz:falhas.liveness,errosReadyz:falhas.readiness,
  p50Ms:percentile(duracoes,.5),
  p95Ms:percentile(duracoes,.95),
  maxMs:Math.max(...duracoes),
  operacoesDeEscrita:0,financeiroReal:false,marcoZeroAprovado:false
 });
 if(resultado.erros>0)falha('CARGA_PREVIA_RESPOSTAS_INVALIDAS');
 return resultado;
}
if(require.main===module){
 medirCargaLeitura().then(r=>{
  process.stdout.write('LOOP_PREVIA_SMOKE_CARGA_GET='+JSON.stringify(r)+'\n');
 }).catch(e=>{
  process.stderr.write('LOOP_PREVIA_SMOKE_CARGA_GET='+
   String(e.codigo||'INCONCLUSIVA').replace(/[^A-Z0-9_]/g,'').slice(0,90)+'\n');
  process.exitCode=1;
 });
}
module.exports={medirCargaLeitura};