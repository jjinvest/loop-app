'use strict';
// Asaas PRODUCAO: diagnostico estritamente GET, sem expor dados financeiros.
// A chave de API pode ter outros privilegios no Asaas: isolar este processo.
const BASE='https://api.asaas.com/v3';
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function validarChave(chave){
 if(typeof chave!=='string'||!chave.startsWith('$aact_prod_')||
    chave.length<25||/\s/.test(chave))
  falha('ASAAS_PRODUCAO_CHAVE_AUSENTE_OU_AMBIENTE_ERRADO');
 return chave;
}
async function consultarAsaasProducaoReadOnly({chave,buscar=fetch}={}){
 validarChave(chave);
 if(typeof buscar!=='function')falha('ASAAS_PRODUCAO_HTTP_AUSENTE');
 async function obter(caminho){
  if(caminho!=='/myAccount/status/'&&
     caminho!=='/financialTransactions?offset=0&limit=1')
   falha('ASAAS_PRODUCAO_ROTA_NAO_AUTORIZADA');
  let resposta;
  try{
   resposta=await buscar(BASE+caminho,{
    method:'GET',redirect:'error',
    headers:{access_token:chave,Accept:'application/json',
     'User-Agent':'AKITEMM-ConsultaFinanceira/1.0'},
    signal:AbortSignal.timeout(10000)
   });
  }catch{falha('ASAAS_PRODUCAO_CONEXAO_NAO_COMPROVADA');}
  if(resposta?.status===401)falha('ASAAS_PRODUCAO_CHAVE_NAO_AUTENTICADA');
  if(resposta?.status===403)falha('ASAAS_PRODUCAO_ACESSO_RESTRITO');
  if(resposta?.status!==200)falha('ASAAS_PRODUCAO_RESPOSTA_NAO_COMPROVADA');
  const tamanho=resposta.headers?.get?.('content-length');
  if(tamanho!==null&&tamanho!==undefined&&(!/^\d+$/.test(tamanho)||
     Number(tamanho)>65536))falha('ASAAS_PRODUCAO_RESPOSTA_EXCESSIVA');
  let bruto,obj;
  try{
   bruto=await resposta.text();
   if(bruto.length>65536)falha('ASAAS_PRODUCAO_RESPOSTA_EXCESSIVA');
   obj=JSON.parse(bruto);
  }catch(e){
   if(e.codigo)throw e;
   falha('ASAAS_PRODUCAO_RESPOSTA_INVALIDA');
  }
  if(!obj||typeof obj!=='object'||Array.isArray(obj))
   falha('ASAAS_PRODUCAO_RESPOSTA_INVALIDA');
  return obj;
 }
 const status=await obter('/myAccount/status/');
 const normalizar=x=>['APPROVED','PENDING','AWAITING_APPROVAL',
  'REJECTED'].includes(x)?x:'NAO_INFORMADO';
 const geral=normalizar(status.general);
 const resultado={
  ambiente:'ASAAS_PRODUCAO',metodo:'GET_SOMENTE',
  contaRespondeu:true,aprovacaoGeral:geral,
  dadosComerciais:normalizar(status.commercialInfo),
  dadosBancarios:normalizar(status.bankAccountInfo),
  documentacao:normalizar(status.documentation),
  extratoConsultado:false,extratoFormatoValido:false,
  transacoesRetornadasNaPagina:0,
  pagamentosReaisCriados:0,transferenciasCriadas:0,
  conciliacaoBancariaIndependenteComprovada:false,
  checkoutComercialHabilitado:false,
  semValoresIdentificadoresOuDadosPessoaisNoResultado:true
 };
 if(geral!=='APPROVED')return resultado;
 const extrato=await obter('/financialTransactions?offset=0&limit=1');
 if(!Array.isArray(extrato.data)||extrato.data.length>1)
  falha('ASAAS_PRODUCAO_EXTRATO_FORMATO_INVALIDO');
 return {...resultado,
  extratoConsultado:true,extratoFormatoValido:true,
  transacoesRetornadasNaPagina:extrato.data.length};
}
module.exports={consultarAsaasProducaoReadOnly,validarChave};
