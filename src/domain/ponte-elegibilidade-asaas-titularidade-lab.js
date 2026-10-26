'use strict';
// Ponte de auditoria somente leitura. Nao confirma CPF, nao aciona catraca.
class PonteElegibilidadeAsaasTitularidadeLab{
 constructor({cobrancas,titularidade}={}){
  if(typeof cobrancas?.auditarElegibilidadeLoop!=='function'||
     typeof titularidade?.buscar!=='function')throw new TypeError('Fontes de auditoria obrigatorias');
  this.cobrancas=cobrancas;this.titularidade=titularidade;
 }
 conferir(pedidoId){
  const pix=this.cobrancas.auditarElegibilidadeLoop(pedidoId);
  const cobranca=this.cobrancas.consultar?.(pedidoId);
  const motivos=[...pix.motivos];
  if(!cobranca?.encontrado)motivos.push('COBRANCA_LOCAL_NAO_AUDITAVEL');
  const titular=this.titularidade.buscar(pedidoId);
  if(!titular)motivos.push('TITULAR_NAO_FIXADO_ANTES_DO_PAGAMENTO');
  else if(titular.valorCentavos!==pix.valorCentavos)
   motivos.push('VALOR_PEDIDO_TITULAR_DIVERGENTE');
  if(cobranca){
   const dataCobranca=Date.parse(cobranca.criadoEm);
   const dataTitular=Date.parse(titular?.criadoEm);
   if(!Number.isFinite(dataCobranca)||!Number.isFinite(dataTitular))
    motivos.push('DATAS_TITULARIDADE_NAO_AUDITAVEIS');
   else if(dataTitular>dataCobranca)
    motivos.push('TITULAR_FIXADO_APOS_COBRANCA');
   if(cobranca.pedidoId&&cobranca.pedidoId!==pedidoId)
    motivos.push('COBRANCA_DE_OUTRO_PEDIDO');
  }
  if(cobranca?.origem&&cobranca.origem!=='CARRINHO'&&cobranca.origem!=='PDF')
   motivos.push('ORIGEM_COBRANCA_INVALIDA');
  const apto=motivos.length===0;
  return {pedidoId,ambiente:'LABORATORIO_ASAAS_SANDBOX',
   titularId:titular?.contaId||null,
   titularidadePredefinida:Boolean(titular),
   valorCentavos:pix.valorCentavos,
   elegivelParaTesteDeCatraca:apto,motivos,
   cpfConfirmado:false,catracaAutorizada:false,
   posicoesCriadas:0,dinheiroRealMovimentadoCentavos:0,
   aviso:'Apto apenas para teste de catraca. Nao autoriza posicao nem pagamento real.'};
 }
}
module.exports={PonteElegibilidadeAsaasTitularidadeLab};
