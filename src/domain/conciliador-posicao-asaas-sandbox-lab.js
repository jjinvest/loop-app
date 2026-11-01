'use strict';
// Orquestracao opt-in de laboratorio. Nao expor em HTTP publico.
// A reconsulta remota e obrigatoria ANTES de qualquer tentativa de escrita.
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
class ConciliadorPosicaoAsaasSandboxLab{
 constructor({cobrancas,catraca}={}){
  if(typeof cobrancas?.conferir!=='function'||
     typeof cobrancas?.consultar!=='function'||
     typeof catraca?.processar!=='function')
   throw new TypeError('Reconsulta Asaas e catraca de laboratorio obrigatorias');
  this.cobrancas=cobrancas;this.catraca=catraca;
 }
 async processar(pedidoId){
  if(typeof pedidoId!=='string'||!/^[a-z0-9][a-z0-9-]{2,69}$/.test(pedidoId))
   throw falha('PEDIDO_INVALIDO');
  const confirmado=await this.cobrancas.conferir(pedidoId);
  const local=this.cobrancas.consultar(pedidoId);
  if(confirmado?.status!=='RECEBIMENTO_INFORMADO_SANDBOX'||
     local?.encontrado!==true||
     local.status!=='RECEBIMENTO_INFORMADO_SANDBOX'||
     local.pedidoId!==pedidoId||
     !local.pagamentoId||
     !Number.isSafeInteger(local.valorCentavos)||
     local.valorCentavos<1)
   throw falha('COBRANCA_SANDBOX_NAO_CONFIRMADA');
  // A consulta atual deve ter retornado RECEIVED, nao apenas um estado antigo em cache.
  if(typeof this.cobrancas.historico==='function'){
   const historico=this.cobrancas.historico(pedidoId)?.conferencias;
   const ultima=Array.isArray(historico)?historico[historico.length-1]:null;
   if(!ultima||!['RECEIVED','RECEIVED_IN_CASH'].includes(ultima.statusAsaas))
    throw falha('ULTIMA_RECONSULTA_NAO_CONFIRMOU_RECEBIMENTO');
  }
  // Uma venda somente AKITEMM tambem precisa ser conciliada. Nao passar
  // pela catraca nem criar posicao quando o subtotal congelado e insuficiente.
  const ponte=this.catraca.ponte;
  if(ponte?.fonteComprovante==='ASAAS_SANDBOX_EXCLUSIVO'){
   const comprovante=await ponte.verificador(pedidoId);
   const referencia=ponte.configuracaoValor.vigenteEm(comprovante.confirmadoEm).valorCentavos;
   if(comprovante.valorElegivelLoopCentavos<referencia){
    const venda=await ponte.processar({pedidoId,titularEsperado:comprovante.contaId,
     valorEsperadoCentavos:local.valorCentavos});
    if(venda.posicaoCriada||venda.compraElegivelLoop!==false)
     throw falha('VENDA_SOMENTE_LOJA_INVALIDA');
    return Object.freeze({pedidoId,contaId:venda.contaId,posicoesNoPedido:0,
     vendaSomenteLoja:true,repetida:venda.repetido===true,
     confirmacaoIndividualObrigatoria:false,reconsultaAsaasAntesDaCatraca:true,
     semMovimentacaoFinanceiraReal:true});
   }
  }
  if(local.valorCentavos<25000)throw falha('COBRANCA_SANDBOX_NAO_CONFIRMADA');
  if(typeof this.cobrancas.auditarElegibilidadeLoop==='function'){
   const auditoria=this.cobrancas.auditarElegibilidadeLoop(pedidoId);
   if(auditoria?.elegivelParaSimulacao!==true)
    throw falha('AUDITORIA_SANDBOX_REPROVADA');
  }
  // A catraca verifica separadamente titularidade predefinida, valor,
  // elegibilidade e comprovante interno; nao confiar em webhook.
  const resultado=await this.catraca.processar(pedidoId);
  if(resultado?.pedidoId!==pedidoId||
     !Number.isSafeInteger(resultado?.posicoesNoPedido)||
     resultado.posicoesNoPedido<1||resultado.posicoesNoPedido>10||
     resultado?.confirmacaoIndividualObrigatoria!==true)
   throw falha('RESULTADO_CATRACA_INVALIDO');
  return Object.freeze({...resultado,reconsultaAsaasAntesDaCatraca:true});
 }
}
module.exports={ConciliadorPosicaoAsaasSandboxLab};
