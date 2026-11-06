'use strict';
// Prova externa de integracao do painel admin da previa com as contagens
// reais da mesma base SQLite utilizada por PSP, inbox e motor.
// Somente GET protegido; nao mostra CPF, posicoes individuais ou segredos.
const URL='https://akitemm-escritorio-preview-homologacao.up.railway.app';
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
async function verificarPainelAdmin({
 env=process.env,fetchImpl=globalThis.fetch
}={}){
 if(env.NODE_ENV==='production'||env.LOOP_PREVIEW_EXCLUSIVO!=='SIM'||
    env.LOOP_PREVIEW_ASAAS_HABILITADO!=='SIM'||
    env.RAILWAY_PUBLIC_DOMAIN!=='akitemm-escritorio-preview-homologacao.up.railway.app')
  falha('PAINEL_ADMIN_HOMOLOGACAO_NAO_AUTORIZADA');
 if(typeof env.LOOP_PREVIEW_SENHA_ACESSO!=='string'||
    env.LOOP_PREVIEW_SENHA_ACESSO.length<24||
    typeof fetchImpl!=='function')
  falha('PAINEL_ADMIN_ACESSO_INDISPONIVEL');
 const auth='Basic '+Buffer.from('acesso:'+env.LOOP_PREVIEW_SENHA_ACESSO).toString('base64');
 async function get(rota,expectJson=true){
  let r;
  try{
   r=await fetchImpl(URL+rota,{
    method:'GET',redirect:'error',headers:{
     Authorization:auth,Accept:expectJson?'application/json':'text/javascript'
    },signal:AbortSignal.timeout(9000)
   });
  }catch{falha('PAINEL_ADMIN_REDE_INCONCLUSIVA');}
  if(r.status!==200)falha('PAINEL_ADMIN_HTTP_'+r.status);
  try{return expectJson?await r.json():await r.text();}
  catch{falha('PAINEL_ADMIN_RESPOSTA_INVALIDA');}
 }
 const ui=await get('/staging/assets/admin.js',false);
 if(typeof ui!=='string'||
    !ui.includes('Reconsultas PSP em andamento')||
    !ui.includes('Interrupções PSP em recuperação')||
    !ui.includes('Reincidências — revisão humana')||
    !ui.includes('retomadasComProvaPSP'))
  falha('PAINEL_ADMIN_CODIGO_VISUAL_DIVERGENTE');
 const backend=await get('/staging/escritorio-unificado');
 const monitor=await get('/staging/escritorio-unificado/monitor-psp');
 if(backend.escritorioFonteUnica!==true||
    monitor.ambiente!=='ASAAS_SANDBOX_EXCLUSIVO'||
    monitor.somenteLaboratorio!==true||
    monitor.posicoesReais!==0||monitor.saquesReais!==0)
  falha('PAINEL_ADMIN_SERVICO_DIVERGENTE');
 function validarContagens(obj){
  if(!obj||!['processando','retomaveis','segundaFalha'].every(k=>
     Number.isSafeInteger(obj[k])&&obj[k]>=0))
   falha('PAINEL_ADMIN_RECUPERACAO_INDISPONIVEL');
 }
 validarContagens(backend.recuperacaoPSP);
 validarContagens(monitor.recuperacaoPSP);
 if(JSON.stringify(backend.recuperacaoPSP)!==
    JSON.stringify(monitor.recuperacaoPSP))
  falha('PAINEL_ADMIN_DOIS_ESTADOS_DIVERGENTES');
 return Object.freeze({
  ambiente:'HOMOLOGACAO_SANDBOX',
  painelExistenteLigadoAoBanco:true,
  recuperacaoVisivel:true,backendEJanelasCoerentes:true,
  operacoesDeEscrita:0,caixaReal:false,
  marcoZeroLiberado:false
 });
}
if(require.main===module)verificarPainelAdmin().then(x=>{
 process.stdout.write('LOOP_ADMIN_INTEGRADO='+JSON.stringify(x)+'\n');
}).catch(e=>{
 process.stderr.write('LOOP_ADMIN_INTEGRADO='+
  String(e.codigo||'INCONCLUSIVO').replace(/[^A-Z0-9_]/g,'').slice(0,85)+'\n');
 process.exitCode=1;
});
module.exports={verificarPainelAdmin};