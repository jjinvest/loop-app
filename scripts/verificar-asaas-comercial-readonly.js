'use strict';
// Executar manualmente SOMENTE em runtime financeiro separado.
// Nao instalar chave de producao na previa, front-end ou staging do Sandbox.
const {consultarAsaasProducaoReadOnly}=
 require('../src/producao/asaas-producao-readonly');
function bloquear(c){const e=new Error(c);e.codigo=c;throw e;}
async function verificarAsaasComercial({env=process.env,buscar=fetch}={}){
 if(env.LOOP_ASAAS_PRODUCAO_LEITURA_AUTORIZADA!=='SIM'||
    env.LOOP_PREVIEW_EXCLUSIVO==='SIM'||
    env.LOOP_RAILWAY_STAGING_AUTORIZADO==='SIM')
  bloquear('ASAAS_COMERCIAL_CONSULTA_NAO_AUTORIZADA');
 return consultarAsaasProducaoReadOnly({
  chave:env.LOOP_ASAAS_PROD_API_KEY,buscar
 });
}
if(require.main===module){
 verificarAsaasComercial().then(r=>{
  // Estritamente metadados, sem extrato bruto, saldos, nomes, tokens ou CPF.
  process.stdout.write('ASAAS_COMERCIAL_GET_DIAGNOSTICO='+JSON.stringify(r)+'\n');
 }).catch(e=>{
  const codigo=typeof e.codigo==='string'&&/^[A-Z0-9_]{5,80}$/.test(e.codigo)?
   e.codigo:'ASAAS_COMERCIAL_NAO_COMPROVADO';
  process.stderr.write('ASAAS_COMERCIAL_FALHOU='+codigo+'\n');
  process.exitCode=1;
 });
}
module.exports={verificarAsaasComercial};
