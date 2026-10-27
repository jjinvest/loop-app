'use strict';
// Fonte interna para a ponte: somente dados persistidos e reconsultados no Asaas.
// Nunca receber status, titular ou valor de um webhook/cliente HTTP.
const {STATUS_CONFIRMADO}=require('./processador-pedidos-simulados');
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
class ComprovanteAsaasSandboxPonteLab{
 constructor({cobrancas,titularidade}={}){
  if(typeof cobrancas?.consultar!=='function'||
     typeof titularidade?.buscar!=='function')
   throw new TypeError('Cobrancas e titularidade locais obrigatorias');
  this.cobrancas=cobrancas;this.titularidade=titularidade;
 }
 async consultar(pedidoId){
  const cobranca=this.cobrancas.consultar(pedidoId);
  const titular=this.titularidade.buscar(pedidoId);
  if(!cobranca?.encontrado||cobranca.status!=='RECEBIMENTO_INFORMADO_SANDBOX'||
     !cobranca.pagamentoId||!titular?.contaId||
     titular.valorCentavos!==cobranca.valorCentavos||
     !['PDF','CARRINHO'].includes(cobranca.origem))
   throw falha('COMPROVANTE_ASAAS_SANDBOX_INELEGIVEL');
  const criado=Date.parse(cobranca.criadoEm),fixado=Date.parse(titular.criadoEm);
  if(!Number.isFinite(criado)||!Number.isFinite(fixado)||fixado>criado)
   throw falha('TITULAR_NAO_FIXADO_ANTES_COBRANCA');
  if(typeof titular.produtoId!=='string'||!titular.produtoId||!titular.intentoPagamentoId)
   throw falha('PEDIDO_IDENTIFICADO_INCOMPLETO');
  if(cobranca.pedidoId!==pedidoId||cobranca.valorCentavos<25000)
   throw falha('COBRANCA_SANDBOX_INELEGIVEL');
  const produtoId=titular.produtoId;
  if(typeof cobranca.atualizadoEm!=='string'||!Number.isFinite(Date.parse(cobranca.atualizadoEm))||
     Date.parse(cobranca.atualizadoEm)<criado)
   throw falha('CONFIRMACAO_SEM_HORARIO_CONFIAVEL');
  return Object.freeze({pedidoId,contaId:titular.contaId,produtoId,
   valorCentavos:cobranca.valorCentavos,status:STATUS_CONFIRMADO,
   confirmadoEm:cobranca.atualizadoEm,intentoPagamentoId:titular.intentoPagamentoId});
 }
}
module.exports={ComprovanteAsaasSandboxPonteLab};
