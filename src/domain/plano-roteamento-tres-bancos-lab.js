'use strict';
// Plano puro de homologacao. NAO executa split, Pix, banco nem entrega.
// O valor do LOOP e provisionado apos pagamento LIQUIDADO; a parcela
// ao centro depende das LUZES, nao da compra isolada.
const {criarPlanoFinanceiro,validarPlanoFinanceiro}=
 require('../producao/portas-financeiras-modulares');
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
const valida=v=>Number.isSafeInteger(v)&&v>=0&&v<=100000000000;
function planejarRecebimentoTresBancos({
 fotografia,taxaRealPspCentavos=null,planoFinanceiro=null
}={}){
 const plano=planoFinanceiro===null?criarPlanoFinanceiro():
  validarPlanoFinanceiro(planoFinanceiro);
 if(!fotografia||typeof fotografia!=='object'||
    !valida(fotografia.totalBrutoCotadoCentavos)||
    !valida(fotografia.referenciaLoopPrevistaCentavos)||
    !Number.isSafeInteger(fotografia.quantidadePosicoesPlanejadas)||
    fotografia.quantidadePosicoesPlanejadas<0||
    fotografia.referenciaLoopPrevistaCentavos!==
     fotografia.quantidadePosicoesPlanejadas*25000)
  falha('ROTEAMENTO_FOTOGRAFIA_INVALIDA');
 if(taxaRealPspCentavos!==null&&!valida(taxaRealPspCentavos))
  falha('ROTEAMENTO_TAXA_PSP_INVALIDA');
 const bruto=fotografia.totalBrutoCotadoCentavos,
  compromissoLoop=fotografia.referenciaLoopPrevistaCentavos,
  taxaEstimada=fotografia.tarifaPspPrevistaCentavos,
  taxa=taxaRealPspCentavos===null?taxaEstimada:taxaRealPspCentavos;
 const custo=fotografia.custoFornecedorPrevistoCentavos,
  frete=fotografia.fretePrevistoCentavos,
  tributos=fotografia.reservaTributariaEstimadaCentavos;
 const limpo=taxa===null?null:bruto-taxa,
  loja=limpo===null?null:limpo-compromissoLoop,
  obrigaFornecedor=custo,
  margem=loja!==null&&custo!==null&&frete!==null&&tributos!==null?
   loja-custo-frete-tributos:null;
 const saldoInsuficiente=compromissoLoop>bruto||limpo!==null&&loja<0;
 const margemLiberavel=(!saldoInsuficiente&&margem!==null&&margem>=0)?margem:null;
 // O split Asaas para bancos externos nao existe. Sao possiveis
 // transferencias posteriores, quando houver liquidação e autorizações.
 const alerta=saldoInsuficiente?'LIQUIDO_INSUFICIENTE_PARA_SEPARAR_LOOP':
  !fotografia.custosCompletos?'CUSTOS_INCOMPLETOS':
  taxa===null?'TAXA_DESCONHECIDA':margem<0?
  'MARGEM_COMERCIAL_ESTIMADA_NEGATIVA':'PLANO_CONTABIL_CONSISTENTE';
 const receptores=[
  {destino:'LOOP_INTER',destinoLogico:'CUSTODIA_LOOP',
   bancoSugerido:plano.rotas.CUSTODIA_LOOP||'Banco do LOOP a definir',
   montantePrevistoCentavos:
    saldoInsuficiente?null:compromissoLoop,
    contaConectada:false,transferenciaExecutada:false},
  {destino:'LOJA_MERCADO_PAGO',bancoSugerido:
    plano.rotas.CUSTODIA_LOJA||'Conta da loja a definir',
   // O banco da loja recebe APENAS a margem, nunca as despesas do fornecedor.
   montantePrevistoCentavos:margemLiberavel,
   contaConectada:false,transferenciaExecutada:false},
  {destino:'COFRES_LATERAIS_TERCEIRO_BANCO',
   bancoSugerido:plano.rotas.CUSTODIA_COFRES||'Terceiro banco a definir',
   montantePrevistoCentavos:null,contaConectada:false,
   transferenciaExecutada:false,
   origemFutura:'SOMENTE_LUZES_PRETAS_E_CENTRO_DOURADO_APOS_CONCILIACAO'}
 ];
 return {roteamentoFinanceiroRevisao:plano.revisao,
  captadorPrevisto:plano.rotas.CAPTACAO,
  distribuidorPrevisto:plano.rotas.DISTRIBUICAO,
  executorSaquesPrevisto:plano.rotas.EXECUTOR_SAQUE,
  rotaCadastradaSomenteEmPlano:true,
  prepedidoId:fotografia.prepedidoId||null,
  produtoId:fotografia.itens?.[0]?.produtoId||null,
  valorBrutoCotadoCentavos:bruto,tarifaPspCentavosParaCalculo:taxa,
  taxaPspInformadaParaSimulacao:taxaRealPspCentavos!==null,
  taxaPspRealComprovada:false,
  valorLiquidoPrevistoCentavos:limpo,
  loopReservarCentavos:compromissoLoop,
  sobraComercialPrevistaCentavos:loja===null||loja<0?null:loja,
  fornecedorAPagarPrevistoCentavos:obrigaFornecedor,
  freteReservarPrevistoCentavos:frete,
  tributosReservarPrevistoCentavos:tributos,
  margemParaMercadoPagoPrevistaCentavos:margemLiberavel,
  obrigacoesComerciaisNaoPagas:[
   {tipo:'FORNECEDOR',valorPrevistoCentavos:obrigaFornecedor},
   {tipo:'FRETE',valorPrevistoCentavos:frete},
   {tipo:'TRIBUTOS',valorPrevistoCentavos:tributos}
  ],
  fornecedorPagoCentavos:0,margemComercialEstimadaCentavos:margem,
  receptores,alerta,
  liquidacaoPspRealComprovada:false,splitAsaasParaBancoExterno:false,
  transferenciaInterRealConfirmada:false,
  transferenciaMercadoPagoRealConfirmada:false,
  fornecedorPagamentoConfirmado:false,
  caixaCentroSacavelCentavos:0,
  cofreLateralSacavelCentavos:0,
  estado:'PREVISAO_NAO_EXECUTADA',
  nota:'Provedores configuraveis por finalidade, sem contrato ou dinheiro real. Recebimento, custodia e executor Pix sao responsabilidades independentes. O destino historico LOOP_INTER e apenas identificador logico legado, nao uma conta fixa. Custos e tributos reservados; cofres somente apos eventos e conciliacao.'};
}
module.exports={planejarRecebimentoTresBancos};
