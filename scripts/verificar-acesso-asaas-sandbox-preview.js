'use strict';
// Prova somente de LEITURA no Asaas Sandbox, executada antes do deploy da previa.
// Nunca cria cobranca, webhook, saque ou operacao comercial.
const {AsaasSandboxLojaV6}=require('../src/domain/asaas-sandbox-loja-v6');
function falhar(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
async function verificarAcesso({
 env=process.env,criarPsp=apiKey=>new AsaasSandboxLojaV6({apiKey})
}={}){
 if(env.NODE_ENV==='production'||env.LOOP_PREVIEW_EXCLUSIVO!=='SIM'||
    env.LOOP_PREVIEW_ASAAS_HABILITADO!=='SIM')
  falhar('PREVIA_SANDBOX_NAO_AUTORIZADA');
 const chave=env.LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY;
 if(typeof chave!=='string'||!chave.startsWith('$aact_hmlg_')||
    chave.length<25||/\s/.test(chave))
  falhar('CHAVE_ASAAS_HOMOLOGACAO_INVALIDA');
 const psp=criarPsp(chave);
 const resposta=await psp.testarAcessoRemoto();
 if(!resposta||resposta.ambiente!=='ASAAS_SANDBOX_EXCLUSIVO'||
    resposta.pspRemotoRespondeu!==true||resposta.cobrancasCriadas!==0)
  falhar('PROVA_ASAAS_SANDBOX_INCONCLUSIVA');
 return {ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  acessoRemotoComprovado:true,cobrancasCriadas:0};
}
if(require.main===module){
 verificarAcesso().then(()=>{
  process.stdout.write('LOOP_ASAAS_SANDBOX_GET_REMOTO=CONFIRMADO_SEM_COBRANCA\n');
 }).catch(()=>{
  // Erro deliberadamente generico: nao imprimir token, ID, corpo PSP ou stack.
  process.stderr.write('LOOP_ASAAS_SANDBOX_GET_REMOTO=NAO_COMPROVADO\n');
  process.exitCode=1;
 });
}
module.exports={verificarAcesso};
