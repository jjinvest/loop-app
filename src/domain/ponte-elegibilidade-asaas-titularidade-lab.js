'use strict';
// Ponte de auditoria somente leitura. Nao confirma CPF, nao aciona catraca.
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
class PonteElegibilidadeAsaasTitularidadeLab{
 constructor({cobrancas,titularidade}={}){
  if(typeof cobrancas?.auditarElegibilidadeLoop!=='function'||
     typeof titularidade?.buscar!=='function')throw new TypeError('Fontes de auditoria obrigatorias');
  this.cobrancas=cobrancas;this.titularidade=titularidade;
 }
 conferir(pedidoId){
  const pix=this.cobrancas.auditarElegibilidadeLoop(pedidoId);
  const titular=this.titularidade.buscar(pedidoId);
  const motivos=[...pix.motivos];
  if(!titular)motivos.push('TITULAR_NAO_FIXADO_ANTES_DO_PAGAMENTO');
  else if(titular.valorCentavos!==pix.valorCentavos)
   motivos.push('VALOR_PEDIDO_TITULAR_DIVERGENTE');
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
