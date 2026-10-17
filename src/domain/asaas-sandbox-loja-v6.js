'use strict';

// PRIMEIRO ADAPTADOR EXTERNO, SOMENTE SANDBOX ASAAS.
// NUNCA configurar URL de producao. NUNCA usar chave em frontend/logs.
const BASE='https://api-sandbox.asaas.com/v3';
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
const ID=/^[a-zA-Z0-9_-]{5,90}$/;
class AsaasSandboxLojaV6{
 constructor({apiKey,fetchImpl=globalThis.fetch}={}){
  if(typeof apiKey!=='string'||apiKey.length<12||/[\s\r\n]/.test(apiKey))
   throw falha('ASAAS_SANDBOX_CREDENCIAL_AUSENTE');
  if(typeof fetchImpl!=='function')throw new TypeError('fetch obrigatorio');
  this.apiKey=apiKey;this.fetchImpl=fetchImpl;
  this.ambiente='ASAAS_SANDBOX_EXCLUSIVO';
 }
 async _requisitar(metodo,caminho,corpo){
  // URL sempre fixa; nenhum endereco controlado por consumidor/operador.
  if(!/^\/(payments|payments\/[a-zA-Z0-9_-]{5,90}(?:\/pixQrCode)?)$/.test(caminho))
   throw falha('CAMINHO_ASAAS_INVALIDO');
  let resposta;
  try{
   resposta=await this.fetchImpl(BASE+caminho,{
    method:metodo,redirect:'error',
    headers:{'access_token':this.apiKey,'User-Agent':'LoopV6-Sandbox/1.0',
     Accept:'application/json',...(corpo?{'Content-Type':'application/json'}:{})},
    ...(corpo?{body:JSON.stringify(corpo)}:{}),
    signal:AbortSignal.timeout(8000)
   });
  }catch(_e){throw falha('ASAAS_SANDBOX_REDE_INCONCLUSIVA');}
  if(!resposta.ok)throw falha('ASAAS_SANDBOX_HTTP_'+resposta.status);
  try{return await resposta.json();}catch(_e){throw falha('ASAAS_SANDBOX_RESPOSTA_INVALIDA');}
 }
 async criarCobrancaPix({clienteAsaasId,valorCentavos,pedidoId}={}){
  if(typeof clienteAsaasId!=='string'||!ID.test(clienteAsaasId)||
    !Number.isSafeInteger(valorCentavos)||valorCentavos<1||valorCentavos>100000000||
    typeof pedidoId!=='string'||!/^[a-z0-9-]{3,70}$/.test(pedidoId))
    throw falha('COBRANCA_SANDBOX_INVALIDA');
  const vencimento=new Intl.DateTimeFormat('sv-SE',{
    timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'
  }).format(new Date());
  const data=await this._requisitar('POST','/payments',{
   customer:clienteAsaasId,billingType:'PIX',value:valorCentavos/100,
   dueDate:vencimento,externalReference:'LOOPLAB-'+pedidoId,
   description:'Loja Vilela - cobranca EXCLUSIVAMENTE SANDBOX'
  });
  if(!data||!ID.test(data.id||'')||data.billingType!=='PIX'||
     Math.round(Number(data.value)*100)!==valorCentavos||
     data.externalReference!=='LOOPLAB-'+pedidoId)
    throw falha('ASAAS_SANDBOX_COBRANCA_DIVERGENTE');
  return {pagamentoId:data.id,status:data.status||'PENDING',
   valorCentavos,ambiente:this.ambiente};
 }
 async consultarCobranca(pagamentoId){
  if(typeof pagamentoId!=='string'||!ID.test(pagamentoId))
   throw falha('PAGAMENTO_SANDBOX_ID_INVALIDO');
  const p=await this._requisitar('GET','/payments/'+pagamentoId);
  if(!p||p.id!==pagamentoId||typeof p.status!=='string'||
    !Number.isFinite(Number(p.value)))
    throw falha('ASAAS_SANDBOX_CONSULTA_DIVERGENTE');
  return {pagamentoId:p.id,status:p.status,
   valorCentavos:Math.round(Number(p.value)*100),
   externalReference:p.externalReference,billingType:p.billingType};
 }
 async obterPix(pagamentoId){
  if(typeof pagamentoId!=='string'||!ID.test(pagamentoId))
   throw falha('PAGAMENTO_SANDBOX_ID_INVALIDO');
  const p=await this._requisitar('GET','/payments/'+pagamentoId+'/pixQrCode');
  if(!p||typeof p.payload!=='string'||p.payload.length<20||p.payload.length>3000)
   throw falha('ASAAS_SANDBOX_QRCODE_INVALIDO');
  return {ambiente:this.ambiente,copiaEColaTeste:p.payload,
   aviso:'PIX EXCLUSIVAMENTE SANDBOX. NAO ENVIAR DINHEIRO REAL.'};
 }
}
module.exports={AsaasSandboxLojaV6,ASAAS_SANDBOX_BASE:BASE};
