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
     local.valorCentavos<25000)
   throw falha('COBRANCA_SANDBOX_NAO_CONFIRMADA');
  // A consulta atual deve ter retornado RECEIVED, nao apenas um estado antigo em cache.
  if(typeof this.cobrancas.historico==='function'){
   const historico=this.cobrancas.historico(pedidoId)?.conferencias;
   const ultima=Array.isArray(historico)?historico[historico.length-1]:null;
   if(!ultima||!['RECEIVED','RECEIVED_IN_CASH'].includes(ultima.statusAsaas))
    throw falha('ULTIMA_RECONSULTA_NAO_CONFIRMOU_RECEBIMENTO');
  }
  if(typeof this.cobrancas.auditarElegibilidadeLoop==='function'){
   const auditoria=this.cobrancas.auditarElegibilidadeLoop(pedidoId);
   if(auditoria?.elegivelParaSimulacao!==true)
    throw falha('AUDITORIA_SANDBOX_REPROVADA');
  }
  // A catraca verifica separadamente titularidade predefinida, valor,
  // elegibilidade e comprovante interno; nao confiar em webhook.
  const resultado=await this.catraca.processar(pedidoId);
  if(resultado?.pedidoId!==pedidoId||
     resultado?.posicoesNoPedido!==1||
     resultado?.confirmacaoIndividualObrigatoria!==true)
   throw falha('RESULTADO_CATRACA_INVALIDO');
  return Object.freeze({...resultado,reconsultaAsaasAntesDaCatraca:true});
 }
}
module.exports={ConciliadorPosicaoAsaasSandboxLab};
