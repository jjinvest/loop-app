'use strict';
// Homologacao externa CONTROLADA. Somente sandbox, execucao MANUAL com
// credenciais de ambiente seguro e CPF de TESTE autorizado. NUNCA CI por PR.
// Sem saques, creditos LOOP ou armazenamento de dados pessoais na saida.
const BASE='https://api-sandbox.asaas.com/v3';
const CUSTOMER_REF='AKITEMM-LOOP-SANDBOX-TESTE-01';
const PAYMENT_REF='LOOPLAB-akitemm-pix-teste-001';
const VALOR=25000;
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
function validoId(v,prefixo){return typeof v==='string'&&
  new RegExp('^'+prefixo+'[A-Za-z0-9_-]{5,90}$').test(v);}
async function homologar({
 apiKey,cpfTeste,execucaoLiberada=false,confirmarSimulacao=false,
 fetchImpl=globalThis.fetch,hoje=new Date()
}={}){
 if(execucaoLiberada!==true)throw erro('HOMOLOGACAO_MANUAL_NAO_AUTORIZADA');
 if(typeof apiKey!=='string'||!apiKey.startsWith('$aact_hmlg_')||
    apiKey.length<25||/[\s\r\n]/.test(apiKey))
  throw erro('CHAVE_SANDBOX_NAO_CONFIGURADA');
 if(typeof cpfTeste!=='string'||!/^\d{11}$/.test(cpfTeste)||
    /^(\d)\1{10}$/.test(cpfTeste))
  throw erro('CPF_EXCLUSIVAMENTE_TESTE_NAO_CONFIGURADO');
 if(typeof fetchImpl!=='function')throw erro('HTTP_CLIENT_INVALIDO');
 const chamadas=[];
 async function pedir(metodo,caminho,corpo){
  if(!/^\/(?:customers(?:\?externalReference=[A-Za-z0-9-]+&limit=10)?|payments(?:\?externalReference=[A-Za-z0-9-]+&limit=10|\/pay_[A-Za-z0-9_-]{5,90})?|sandbox\/payment\/pay_[A-Za-z0-9_-]{5,90}\/confirm)$/.test(caminho))
   throw erro('ROTA_SANDBOX_NAO_AUTORIZADA');
  chamadas.push({metodo,rota:caminho.split('?')[0]});
  let res;
  try{res=await fetchImpl(BASE+caminho,{method:metodo,redirect:'error',
    headers:{access_token:apiKey,Accept:'application/json',
      'User-Agent':'AKITEMM-LOOP-HomologacaoSandbox/1.0',
      ...(corpo?{'Content-Type':'application/json'}:{})},
    ...(corpo?{body:JSON.stringify(corpo)}:{}),
    signal:AbortSignal.timeout(10000)});
  }catch{throw erro('REDE_SANDBOX_INCONCLUSIVA_VERIFICAR_MANUALMENTE');}
  if(!res.ok)throw erro('ASAAS_SANDBOX_HTTP_'+res.status);
  try{return await res.json();}catch{throw erro('ASAAS_SANDBOX_JSON_INVALIDO');}
 }
 async function listagem(rota){
  const resposta=await pedir('GET',rota);
  if(!Array.isArray(resposta?.data))throw erro('LISTAGEM_SANDBOX_INVALIDA');
  return resposta.data;
 }
 let clientes=await listagem('/customers?externalReference='+CUSTOMER_REF+'&limit=10');
 if(clientes.length>1)throw erro('CLIENTES_SANDBOX_DUPLICADOS_REVISAR');
 let cliente=clientes[0];
 if(!cliente){
  // Em caso de timeout: parar e pesquisar pelo identificador antes de repetir.
  cliente=await pedir('POST','/customers',{
   name:'Cliente de Teste AKITEMM Sandbox',
   cpfCnpj:cpfTeste,externalReference:CUSTOMER_REF,
   notificationDisabled:true
  });
  if(!validoId(cliente?.id,'cus_')||cliente.externalReference!==CUSTOMER_REF)
   throw erro('CLIENTE_SANDBOX_DIVERGENTE_REVISAR');
 }
 if(!validoId(cliente.id,'cus_')||cliente.externalReference!==CUSTOMER_REF)
  throw erro('CLIENTE_SANDBOX_DIVERGENTE_REVISAR');
 let pagamentos=await listagem('/payments?externalReference='+PAYMENT_REF+'&limit=10');
 if(pagamentos.length>1)throw erro('COBRANCAS_SANDBOX_DUPLICADAS_REVISAR');
 let p=pagamentos[0];
 if(!p){
  const vencimento=new Intl.DateTimeFormat('sv-SE',{
   timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'
  }).format(hoje);
  p=await pedir('POST','/payments',{
   customer:cliente.id,billingType:'PIX',value:VALOR/100,
   dueDate:vencimento,externalReference:PAYMENT_REF,
   description:'AKITEMM LOOP - TESTE SANDBOX SEM DINHEIRO REAL'
  });
 }
 if(!validoId(p?.id,'pay_'))throw erro('COBRANCA_SANDBOX_ID_INVALIDO');
 // Exigir consulta independente apos a criacao e sempre na repeticao.
 async function consultar(){
  const d=await pedir('GET','/payments/'+p.id);
  if(d?.id!==p.id||d.customer!==cliente.id||d.billingType!=='PIX'||
     d.externalReference!==PAYMENT_REF||typeof d.value!=='number'||
     Math.abs(d.value*100-VALOR)>.000001)
   throw erro('CONCILIACAO_SANDBOX_DIVERGENTE');
  return d;
 }
 let remoto=await consultar();
 const antes=remoto.status;
 if(confirmarSimulacao===true&&!['RECEIVED','RECEIVED_IN_CASH'].includes(remoto.status)){
  if(!['PENDING','CONFIRMED','OVERDUE'].includes(remoto.status))
   throw erro('ESTADO_NAO_CONFIRMAVEL_NO_SANDBOX');
  await pedir('POST','/sandbox/payment/'+p.id+'/confirm',{});
  remoto=await consultar();
 }
 const confirmado=['RECEIVED','RECEIVED_IN_CASH'].includes(remoto.status);
 return Object.freeze({ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  clienteIdentificado:true,pedidoReferencia:PAYMENT_REF,
  cobrancaExistente:true,valorCentavos:VALOR,
  statusAntes:antes,statusDepois:remoto.status,
  recebidoInformadoNoSandbox:confirmado,
  simulacaoSolicitada:confirmarSimulacao===true,
  movimentosReais:0,liberacaoPosicoes:0,saques:0,
  consultaIndependenteRealizada:true,
  chamadasExecutadas:chamadas.map(x=>x.metodo+' '+x.rota)});
}
if(require.main===module){
 const confirm=process.env.ASAAS_SANDBOX_SIMULAR_PAGAMENTO==='SIM';
 homologar({apiKey:process.env.ASAAS_SANDBOX_API_KEY,
  cpfTeste:process.env.ASAAS_SANDBOX_CPF_FICTICIO,
  execucaoLiberada:process.env.ASAAS_SANDBOX_HOMOLOGACAO_MANUAL==='SIM',
  confirmarSimulacao:confirm
 }).then(x=>{
  // Apenas resumo estrutural; nenhum segredo, CPF, clienteId, paymentId ou Pix QR.
  process.stdout.write('ASAAS_TESTE_SANDBOX='+JSON.stringify(x)+'\n');
 },e=>{
  process.stderr.write('ASAAS_TESTE_FALHOU='+String(e.codigo||'INDETERMINADO')+'\n');
  process.exitCode=1;
 });
}
module.exports={homologar};