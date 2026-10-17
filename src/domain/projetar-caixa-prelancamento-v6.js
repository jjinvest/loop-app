'use strict';

// Projecao simples PRE-LANCAMENTO, nunca concilia dinheiro nem autoriza saques.
// Pressupoe que o valor liquido informado esteja totalmente disponivel
// para ser alocado em proporcao 3:2:1 e nao tenha outros compromissos.
const REF=25000;
function projetarCaixaPrelancamentoV6({compras,liquidoPorCompraCentavos}={}){
 if(!Number.isSafeInteger(compras)||compras<0||compras>1_000_000)
  throw new TypeError('COMPRAS_INVALIDAS');
 if(!Number.isSafeInteger(liquidoPorCompraCentavos)||
    liquidoPorCompraCentavos<0||liquidoPorCompraCentavos>10_000_000)
  throw new TypeError('VALOR_INVALIDO');
 const disponivel=compras*liquidoPorCompraCentavos;
 if(!Number.isSafeInteger(disponivel))throw new RangeError('VALOR_TOTAL_INVALIDO');
 const centro=Math.floor(disponivel*3/6);
 const investimento=Math.floor(disponivel*2/6);
 const reserva=disponivel-centro-investimento;
 const girosPelasCompras=Math.floor(compras/6);
 const girosPeloCaixa=Math.min(
  Math.floor(centro/(3*REF)),Math.floor(investimento/(2*REF)),
  Math.floor(reserva/REF)
 );
 return {
  natureza:'CENARIO_MATEMATICO_NAO_CONCILIADO',
  comprasConfirmadasHipoteticas:compras,liquidoPorCompraCentavos,
  referenciaPadraoCentavos:REF,
  totalLiquidoHipoteticoCentavos:disponivel,
  alocacaoMatematicaCentavos:{
   centro,investimento,reserva
  },
  girosPelasCompras,comprasRestantesAposGirosPorEvento:compras%6,
  girosPeloCaixaMatematico:girosPeloCaixa,
  tetoHipoteticoDeGiros:Math.min(girosPelasCompras,girosPeloCaixa),
  girosSemCoberturaNoCenario:Math.max(0,girosPelasCompras-girosPeloCaixa),
  referenciaNecessariaParaTodasComprasCentavos:compras*REF,
  diferencaReferenciaMenosLiquidoCentavos:Math.max(0,compras*REF-disponivel),
  // Nao incorpora custos, chargebacks, reservas, fiscal, LGPD ou risco juridico.
  haProvaDeRecebimentoBancario:false,
  saldoReconciliadoCentavos:0,
  transferenciasHabilitadas:false,
  resultadoNaoAutorizaGiroOuPagamento:true
 };
}
module.exports={projetarCaixaPrelancamentoV6};
