'use strict';
// Amarra uma observacao GET autenticada ao compromisso interno congelado.
// Nao tem escrita, webhook receptor ou executor; nunca converte observacao
// SANDBOX em liquidacao real, credito, posicao ou pagamento bancario.
const ID=/^[A-Za-z0-9_-]{5,120}$/;
const valor=n=>Number.isSafeInteger(n)&&n>0&&n<=1e12;
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
function esperado(x,campo){
 if(!x||typeof x!=='object'||Array.isArray(x)||
    !ID.test(x[campo]||'')||!valor(x.valorCentavos))
  falha('CONFERENCIA_PSP_COMPROMISSO_INVALIDO');
}
function conferirCobrancaSandbox({compromisso,observado}={}){
 esperado(compromisso,'pagamentoId');
 if(!observado||observado.origem!=='ASAAS_SANDBOX'||
    observado.autorizaPosicao!==false||
    observado.autorizaPedidoReal!==false||
    observado.pagamentoId!==compromisso.pagamentoId||
    observado.valorFicticioCentavos!==compromisso.valorCentavos)
  falha('CONFERENCIA_PSP_COBRANCA_DIVERGENTE');
 const quitados=new Set(['RECEIVED','CONFIRMED']);
 const estornos=new Set(['REFUNDED','REFUND_REQUESTED',
  'PARTIALLY_REFUNDED','CHARGEBACK_REQUESTED']);
 let estado='AGUARDANDO_CONCILIACAO';
 if(quitados.has(observado.estadoObservado))
  estado='PSP_SANDBOX_SINALIZOU_RECEBIMENTO';
 if(estornos.has(observado.estadoObservado))
  estado='ESTORNO_SANDBOX_EXIGE_REVISAO';
 return Object.freeze({
  referencia:compromisso.pagamentoId,estado,
  pagamentoSandboxConsultado:true,
  comprovanteDeLiquidacaoBancariaReal:false,
  novaPosicaoLiberada:false,pedidoRealAprovado:false,
  obrigatorioConciliarBancoCustodiante:true
 });
}
function conferirSaqueSandbox({compromisso,observado}={}){
 esperado(compromisso,'transferenciaId');
 if(!observado||observado.origem!=='ASAAS_SANDBOX'||
    observado.comprovanteRealConciliado!==false||
    observado.saqueRealPago!==false||
    observado.podeReenviarAutomaticamente!==false||
    observado.transferenciaId!==compromisso.transferenciaId||
    observado.valorFicticioCentavos!==compromisso.valorCentavos)
  falha('CONFERENCIA_PSP_PIX_DIVERGENTE');
 const estados={
  CONCLUIDO_NO_SANDBOX:'CONFIRMACAO_SOMENTE_SANDBOX',
  FALHA_NO_SANDBOX:'FALHA_SOMENTE_SANDBOX',
  CANCELADO_NO_SANDBOX:'CANCELAMENTO_SOMENTE_SANDBOX',
  PENDENTE:'AGUARDAR_CONSULTA',
  INDETERMINADO:'STATUS_DESCONHECIDO_NAO_REENVIAR'
 };
 return Object.freeze({
  referencia:compromisso.transferenciaId,
  estado:estados[observado.estado]||
   'STATUS_DESCONHECIDO_NAO_REENVIAR',
  saqueRealPago:false,comprovanteDestinoReal:false,
  podeReenviarAutomaticamente:false,
  requerConfirmacaoDeOrigemEDestino:true
 });
}
async function reconsultarCompromissosAsaasSandbox({
 adaptador,cobranca,transferencia
}={}){
 if(!adaptador||typeof adaptador.consultarCobranca!=='function'||
    typeof adaptador.consultarPix!=='function')
  falha('CONFERENCIA_PSP_ADAPTADOR_INVALIDO');
 if(!cobranca&&!transferencia)
  falha('CONFERENCIA_PSP_NENHUMA_OPERACAO');
 if(cobranca)esperado(cobranca,'pagamentoId');
 if(transferencia)esperado(transferencia,'transferenciaId');
 // Chamada GET jamais e repetida automaticamente depois de timeout.
 // Retorno fora do contrato e erro duro (fail closed).
 const relatorio={origem:'ASAAS_SANDBOX',mudancasReais:0,
  dinheiroRealMovimentado:false};
 if(cobranca)relatorio.cobranca=conferirCobrancaSandbox({
  compromisso:cobranca,
  observado:await adaptador.consultarCobranca(cobranca.pagamentoId)
 });
 if(transferencia)relatorio.transferencia=conferirSaqueSandbox({
  compromisso:transferencia,
  observado:await adaptador.consultarPix(transferencia.transferenciaId)
 });
 return Object.freeze(relatorio);
}
module.exports={conferirCobrancaSandbox,conferirSaqueSandbox,
 reconsultarCompromissosAsaasSandbox};
