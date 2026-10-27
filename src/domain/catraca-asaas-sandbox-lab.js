'use strict';
// Adaptador opt-in de LABORATORIO: nunca montar em rota publica.
// A fonte de pagamento da ponte deve ser interna e confiavel; este modulo
// nao transforma payload de webhook em comprovante.
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
class CatracaAsaasSandboxLab{
 constructor({elegibilidade,ponte}={}){
  if(typeof elegibilidade?.conferir!=='function'||typeof ponte?.processar!=='function'||
     ponte.atribuicaoManualPorPosicao!==true)
   throw new TypeError('Auditoria e ponte com adesao individual obrigatorias');
  this.elegibilidade=elegibilidade;
  this.ponte=ponte;
 }
 async processar(pedidoId){
  if(typeof pedidoId!=='string'||!pedidoId.trim())throw erro('PEDIDO_INVALIDO');
  const parecer=this.elegibilidade.conferir(pedidoId);
  if(!parecer.elegivelParaTesteDeCatraca||
     parecer.ambiente!=='LABORATORIO_ASAAS_SANDBOX'||
     !parecer.titularId||parecer.valorCentavos<25000||
     parecer.catracaAutorizada!==false||parecer.posicoesCriadas!==0)
   throw erro('PAGAMENTO_SANDBOX_NAO_ELEGIVEL');
  // Bloquear divergencia ANTES da escrita: nao basta comparar apos processar.
  // O verificador interno deve expor o mesmo comprovante que a ponte consumira.
  if(typeof this.ponte.verificador!=='function')
   throw erro('VERIFICADOR_INTERNO_INDISPONIVEL');
  const comprovante=await this.ponte.verificador(pedidoId);
  if(!comprovante||comprovante.pedidoId!==pedidoId||
     comprovante.contaId!==parecer.titularId||
     comprovante.valorCentavos!==parecer.valorCentavos)
   throw erro('COMPROVANTE_TITULAR_OU_VALOR_DIVERGENTE');
  // A ponte consulta SEPARADAMENTE seu verificador confiavel de pagamentos.
  // Ela valida titularidade previamente fixada e grava a posicao em SQLite
  // sob BEGIN IMMEDIATE; esta auditoria nao substitui essas garantias.
  const resultado=await this.ponte.processar({pedidoId,quantidadeEsperada:1,titularEsperado:parecer.titularId});
  if(resultado.contaId!==parecer.titularId)
   throw erro('TITULAR_DIVERGENTE_APOS_PROCESSAMENTO');
  if(resultado.compraElegivelLoop!==true||
     resultado.posicaoCriada!==true||
     !Array.isArray(resultado.posicaoIds)||resultado.posicaoIds.length!==1)
   throw erro('QUANTIDADE_POSICOES_INESPERADA');
  return Object.freeze({
   pedidoId,contaId:resultado.contaId,posicaoId:resultado.posicaoId,
   criada:resultado.criado===true,repetida:resultado.repetido===true,
   posicoesNoPedido:1,confirmacaoIndividualObrigatoria:true,
   cpfConfirmadoAutomaticamente:false,semMovimentacaoFinanceiraReal:true,
   ambiente:'LABORATORIO_ASAAS_SANDBOX'
  });
 }
}
module.exports={CatracaAsaasSandboxLab};
