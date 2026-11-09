'use strict';
// Conectores de observacao PSP: apenas GET de SANDBOX ASAAS.
// Nenhuma criacao de cobranca, split, transferencia ou PIX; nao montados
// automaticamente em producao nem usados para liberar fundos/posicoes.
const {verificarPortaCandidata}=require('./portas-financeiras-modulares');
const {provarAcessoCelcoinSandboxReadOnly}=
 require('../integracoes/celcoin-sandbox-prova-readonly');
const BASE='https://api-sandbox.asaas.com/v3';
const API_ID=/^[A-Za-z0-9_-]{5,100}$/;
function erro(c){const e=new Error(c);e.codigo=c;throw e;}
const identidade=x=>typeof x==='string'&&API_ID.test(x);
function centavos(valor){
 if(typeof valor!=='number'||!Number.isFinite(valor)||valor<0||
    valor>1e10)erro('PORTAS_SANDBOX_VALOR_INVALIDO');
 const inteiro=Math.round(valor*100);
 if(!Number.isSafeInteger(inteiro)||Math.abs(valor*100-inteiro)>1e-6)
  erro('PORTAS_SANDBOX_VALOR_INVALIDO');
 return inteiro;
}
const ESTADOS_TRANSPORTE=Object.freeze({
 DONE:'CONCLUIDO_NO_SANDBOX',
 PENDING:'PENDENTE',
 BANK_PROCESSING:'PENDENTE',
 PROCESSING:'PENDENTE',
 BLOCKED:'PENDENTE',
 FAILED:'FALHA_NO_SANDBOX',
 CANCELLED:'CANCELADO_NO_SANDBOX'
});
class AsaasSandboxPixOutReadOnly{
 constructor({chaveSandbox,fetchImpl=globalThis.fetch}={}){
  if(process.env.NODE_ENV==='production')
   erro('PORTAS_SANDBOX_PROIBIDA_EM_PRODUCAO');
  if(typeof chaveSandbox!=='string'||
     !chaveSandbox.startsWith('$aact_hmlg_')||
     chaveSandbox.length<25||chaveSandbox.length>1024||
     /[\s\r\n]/.test(chaveSandbox))
   erro('PORTAS_ASAAS_CHAVE_SANDBOX_OBRIGATORIA');
  if(typeof fetchImpl!=='function')
   erro('PORTAS_SANDBOX_TRANSPORTE_INVALIDO');
  this._chave=chaveSandbox;this._fetch=fetchImpl;
  Object.seal(this);
 }
 async _obter(recurso,id=null){
  if(process.env.NODE_ENV==='production')
   erro('PORTAS_SANDBOX_PROIBIDA_EM_PRODUCAO');
  if(!['payments','transfers','balance'].includes(recurso)||
     (recurso==='balance'&&id!==null)||
     (recurso!=='balance'&&!identidade(id)))
   erro('PORTAS_SANDBOX_RECURSO_NAO_AUTORIZADO');
  const caminho=recurso==='balance'?'/finance/balance':
   '/'+recurso+'/'+id;
  let resposta;
  try{
   resposta=await this._fetch(BASE+caminho,{
    method:'GET',redirect:'error',
    headers:{
     'access_token':this._chave,
     'User-Agent':'AKITEMM-PortasFinanceiras-Sandbox/1.0',
     Accept:'application/json'
    },
    signal:AbortSignal.timeout(10000)
   });
  }catch{erro('PORTAS_SANDBOX_REDE_INDETERMINADA');}
  if(!resposta||resposta.status===401||resposta.status===403)
   erro('PORTAS_SANDBOX_SEM_PERMISSAO');
  if(resposta.status===404)erro('PORTAS_SANDBOX_REFERENCIA_NAO_LOCALIZADA');
  if(resposta.status!==200)erro('PORTAS_SANDBOX_REQUISICAO_INDETERMINADA');
  const header=resposta.headers?.get?.('content-length');
  if(header!==undefined&&header!==null&&
     (!/^\d+$/.test(header)||Number(header)>65536))
   erro('PORTAS_SANDBOX_RESPOSTA_EXCESSIVA');
  let bruto,dados;
  try{
   bruto=await resposta.text();
   if(typeof bruto!=='string'||Buffer.byteLength(bruto,'utf8')>65536)
    erro('PORTAS_SANDBOX_RESPOSTA_EXCESSIVA');
   dados=JSON.parse(bruto);
  }catch(e){
   if(e.codigo)throw e;
   erro('PORTAS_SANDBOX_RESPOSTA_INVALIDA');
  }
  if(!dados||typeof dados!=='object'||Array.isArray(dados))
   erro('PORTAS_SANDBOX_RESPOSTA_INVALIDA');
  return dados;
 }
 async consultarSaldo(){
  const dados=await this._obter('balance');
  if(typeof dados.balance!=='number')
   erro('PORTAS_SANDBOX_SALDO_INVALIDO');
  return Object.freeze({
   origem:'ASAAS_SANDBOX',saldoFicticioCentavos:centavos(dados.balance),
   efetivamenteConciliadoNoBancoReal:false,habilitaPixReal:false
  });
 }
 async consultarPix(transferenciaId){
  const p=await this._obter('transfers',transferenciaId);
  if(p.id!==transferenciaId||
     typeof p.status!=='string'||!/^[A-Z_]{3,50}$/.test(p.status)||
     typeof p.value!=='number')
   erro('PORTAS_SANDBOX_TRANSFERENCIA_DIVERGENTE');
  const c=centavos(p.value);
  if(c===0)erro('PORTAS_SANDBOX_TRANSFERENCIA_DIVERGENTE');
  const estado=ESTADOS_TRANSPORTE[p.status]||'INDETERMINADO';
  return Object.freeze({
   origem:'ASAAS_SANDBOX',transferenciaId:p.id,
   estadoObservado:p.status,estado,
   valorFicticioCentavos:c,
   comprovanteRealConciliado:false,podeReenviarAutomaticamente:false,
   saqueRealPago:false
  });
 }
 async consultarCobranca(pagamentoId){
  const p=await this._obter('payments',pagamentoId);
  if(p.id!==pagamentoId||
     typeof p.status!=='string'||!/^[A-Z_]{3,50}$/.test(p.status)||
     typeof p.value!=='number')
   erro('PORTAS_SANDBOX_COBRANCA_DIVERGENTE');
  const c=centavos(p.value);
  if(!c)erro('PORTAS_SANDBOX_COBRANCA_DIVERGENTE');
  return Object.freeze({
   origem:'ASAAS_SANDBOX',pagamentoId:p.id,
   estadoObservado:p.status,valorFicticioCentavos:c,
   saldoBancarioRealConfirmado:false,
   autorizaPedidoReal:false,autorizaPosicao:false
  });
 }
 descreverPortas(){
  return Object.freeze({
   captacao:verificarPortaCandidata({
    papel:'CAPTACAO',provedor:'ASAAS',adaptador:this
   }),
   executor:verificarPortaCandidata({
    papel:'EXECUTOR_SAQUE',provedor:'ASAAS',adaptador:this
   }),
   semEscrita:true,semHomologacaoProdutiva:true,
   metodoDisponivel:'GET_SOMENTE_SANDBOX'
  });
 }
}
// Esta funcao REUTILIZA a integracao Celcoin read-only ja existente.
// Prova de login e GET participantes NAO prova cash-in, split nem cash-out.
async function diagnosticarCelcoinReadOnly({
 clientId,clientSecret,fetchImpl
}={}){
 if(process.env.NODE_ENV==='production')
  erro('PORTAS_SANDBOX_PROIBIDA_EM_PRODUCAO');
 const retorno=await provarAcessoCelcoinSandboxReadOnly({
  clientId,clientSecret,fetchImpl
 });
 return Object.freeze({
  ambiente:retorno.ambiente,
  autenticacaoSandbox:retorno.tokenSandboxAutenticado===true,
  participantesConsultados:retorno.listaParticipantesPixConsultada===true,
  splitBancosExternosContratado:false,
  custodiaBancosExternosComprovada:false,
  cashoutContratado:false,habilitaPagamentoReal:false
 });
}
function planoDeIntegracoesPSP(){
 return Object.freeze({
  captador:'A_ESCOLHER_CELCOIN_OU_ASAAS',
  distribuidor:'A_ESCOLHER',
  custodianteLoop:'INTER_CANDIDATO',
  custodianteLoja:'MERCADO_PAGO_CANDIDATO',
  executorPix:'ASAAS_CANDIDATO',
  celcoinSplitPixExternoAutomaticoComprovado:false,
  asaasSplitCarteiraExternaComprovado:false,
  moduloAsaasPixReadOnly:'SANDBOX_GET',
  moduloCelcoinReadOnly:'SANDBOX_OAUTH_E_GET_PARTICIPANTES',
  homologacaoContratualConcluida:false,
  movimentacaoRealPermitida:false
 });
}
module.exports={AsaasSandboxPixOutReadOnly,
 diagnosticarCelcoinReadOnly,planoDeIntegracoesPSP};
