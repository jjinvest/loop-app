'use strict';
// CONTRATO DE PREPARACAO, SEM qualquer PSP conectado ou credenciais.
// A mera existencia de evento/campos validados NAO prova dinheiro liquidado.
// Nao usar como autorizacao de posicao, saque ou credito. Somente analise.
const ID=/^[A-Za-z0-9_-]{1,80}$/;
const TIPOS=new Set(['COBRANCA_SINALIZADA_FICTICIA','ESTORNO_SINALIZADO_FICTICIO']);
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
function planejarEventoPspFuturoLab({pedidoRegistrado,evento}={}){
 if(!pedidoRegistrado||typeof pedidoRegistrado!=='object'||
  !ID.test(pedidoRegistrado.pedidoId)||
  !ID.test(pedidoRegistrado.intentoPagamentoId)||
  !Number.isSafeInteger(pedidoRegistrado.valorCentavos)||
  pedidoRegistrado.valorCentavos<=0)
  throw erro('PEDIDO_CONGELADO_INVALIDO');
 if(!evento||typeof evento!=='object'||Array.isArray(evento)||
  !ID.test(evento.eventoId)||!ID.test(evento.pedidoId)||
  !ID.test(evento.intentoPagamentoId)||!TIPOS.has(evento.tipo)||
  evento.moeda!=='BRL'||!Number.isSafeInteger(evento.valorCentavos)||
  evento.valorCentavos<=0)
  throw erro('EVENTO_NAO_CORRESPONDE_AO_CONTRATO');
 if(evento.pedidoId!==pedidoRegistrado.pedidoId||
  evento.intentoPagamentoId!==pedidoRegistrado.intentoPagamentoId||
  evento.valorCentavos!==pedidoRegistrado.valorCentavos)
  throw erro('VINCULO_FINANCEIRO_DIVERGENTE');
 return Object.freeze({
  contrato:'PREPARACAO_PSP_FUTURO_SOMENTE_LAB',
  pedidoId:pedidoRegistrado.pedidoId,eventoId:evento.eventoId,tipo:evento.tipo,
  moeda:'BRL',valorReferencialCentavos:pedidoRegistrado.valorCentavos,
  passoNecessario:'RECONSULTAR_PROVEDOR_E_CONCILIAR_EXTRATO_LIQUIDADO',
  integracaoBancariaAtiva:false,autenticidadeDoProvedorComprovada:false,
  liquidacaoConfirmada:false,autorizacaoDePosicao:false,
  autorizacaoDeSaque:false,valorBancarioDisponivelConhecido:false,
  semTransferenciaReal:true
 });
}
function politicaTarifaSaqueFuturaLab({valorSolicitadoCentavos}={}){
 if(!Number.isSafeInteger(valorSolicitadoCentavos)||valorSolicitadoCentavos<2500)
  throw erro('SAQUE_MENOR_QUE_25_REAIS');
 return Object.freeze({
  valorSolicitadoCentavos,taxaParticipantePercentual:0,
  taxaParticipanteCentavos:0,
  valorLiquidoParticipanteCentavos:valorSolicitadoCentavos,
  tarifaDoBancoCentavos:null,
  pagadorDaTarifaBancaria:'EMPRESA',
  custoBancarioEfetivoAindaDesconhecido:true,
  saldoRealVerificado:false,liberacaoDePix:false
 });
}
module.exports={planejarEventoPspFuturoLab,politicaTarifaSaqueFuturaLab};
