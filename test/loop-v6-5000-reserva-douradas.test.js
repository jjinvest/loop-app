'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {executarCenario5000,executarComparacao5000}=require('../scripts/simular-5000-compradores-reserva-loop-v6');

test('LOOP: 5000 compradores, 100 azuis-douradas + douradas financiadas por reserva com saldo auditavel',()=>{
 const cenarios=executarComparacao5000();
 assert.equal(cenarios.length,4);
 for(const r of cenarios){
  assert.equal(r.pessoasCompradoras,5000);
  assert.equal(r.comprasPDF,2500);
  assert.equal(r.comprasFisicas190,2500);
  assert.equal(r.comprasFisicasSemPosicao,2500);
  assert.equal(r.posicoesCriadasPDF,2500);
  assert.equal(r.conversoesAzulParaDourada+r.azulPendente,100);
  assert.ok(r.conversoesAzulParaDourada>=1);
  assert.equal(r.posicoesDouradasFinanciadasPelaReserva,100);
  assert.equal(r.contemplacoesComCicloConcluido,416);
  assert.equal(r.quantidadeA+r.quantidadeB,2501+100-416-7);
  assert.equal(r.noTabuleiro,7);
  assert.equal(r.girosEfetuados,416);
  assert.equal(r.proximoCicloCom4De6,4);
  assert.equal(r.financeiro.faturamentoBrutoSimuladoCentavos,110000000);
  assert.equal(r.financeiro.faturamentoFisico190Centavos,47500000);
  assert.equal(r.financeiro.faturamentoPDFCentavos,62500000);
  assert.equal(r.financeiro.pagamentoRealCentavos,0);
  assert.equal(r.contemplacoesFundador+r.contemplacoesOutrosClientes+
    r.contemplacoesPosicoesDouradas,416);
  assert.equal(r.ciclosDouradasPorAzul+
    r.ciclosDouradasFinanciadasPelaReserva,r.contemplacoesPosicoesDouradas);
  assert.equal(r.douradasConvertidasAoLongoDosGiros.length,r.conversoesAzulParaDourada);
  assert.ok(r.douradasConvertidasAoLongoDosGiros.every(x=>
    x.azulAntes&&x.douradaDepois&&x.giro>=1));
  assert.equal(r.financeiro.cofreReservaBrutoCentavos,416*25000);
  assert.equal(r.financeiro.compromissoDouradasFinanciadasCentavos,100*25000);
  assert.ok(r.financeiro.cofreReservaLivreDemonstrativoCentavos>=0);
  assert.equal(r.financeiro.extratoDouradasDaReserva.length,100);
  assert.ok(r.financeiro.extratoDouradasDaReserva.every(x=>
    x.cofreOrigem==='LOOP_DIREITA'&&x.livreAntesCentavos>=25000&&
    x.livreDepoisCentavos>=0));
  assert.equal(r.financeiro.valorAlocadoCiclosCompletosCentavos,2496*25000);
  assert.equal(r.financeiro.valorPendenteProximoCicloReferencialCentavos,4*25000);
  console.log('LOOP_5000_RESULTADO='+JSON.stringify({
   cenario:r.cenario,A:r.quantidadeA,B:r.quantidadeB,
   giros:r.girosEfetuados,centrosFundador:r.contemplacoesFundador,
   centrosClientes:r.contemplacoesOutrosClientes,
   centrosDouradasAzul:r.ciclosDouradasPorAzul,
   centrosDouradasReserva:r.ciclosDouradasFinanciadasPelaReserva,
   douradasDeAzul:r.conversoesAzulParaDourada,
   azulPendente:r.azulPendente,
   douradasCriadasComReserva:r.posicoesDouradasFinanciadasPelaReserva,
   douradasNoTabuleiro:r.douradasNoTabuleiroAgora,
   azuisRestantes:r.azulPendente,
   indicacoes:r.indicacoesValidadas,
   entradasA:r.entradasFilaA,entradasB:r.entradasFilaB,
   reservaBruta:r.financeiro.cofreReservaBrutoCentavos,
   reservaComprometidaBonus:r.financeiro.compromissosDeBonificacaoReservaCentavos,
   reservaComprometidaDouradas:r.financeiro.compromissoDouradasFinanciadasCentavos,
   reservaLivre:r.financeiro.cofreReservaLivreDemonstrativoCentavos,
   receitaBruta:r.financeiro.faturamentoBrutoSimuladoCentavos
  }));
 }
});
test('Controle negativo: sem credito da reserva, nenhuma dourada administrativa nasce por conta propria',()=>{
 const r=executarCenario5000({primeiraFila:'B',intensidade:'MODERADA',usarCofreReserva:false});
 assert.equal(r.posicoesDouradasFinanciadasPelaReserva,0);
 assert.equal(r.financeiro.compromissoDouradasFinanciadasCentavos,0);
 assert.equal(r.conversoesAzulParaDourada+r.azulPendente,100);
 assert.equal(r.financeiro.extratoDouradasDaReserva.length,0);
 assert.equal(r.quantidadeA+r.quantidadeB,2501-416-7);
 console.log('LOOP_5000_SEM_RESERVA='+JSON.stringify({
  A:r.quantidadeA,B:r.quantidadeB,
  reservasCriadas:r.posicoesDouradasFinanciadasPelaReserva,
  azuisDouradas:r.conversoesAzulParaDourada,
  azuisPendentes:r.azulPendente,
  contemplacoes:r.contemplacoesComCicloConcluido
 }));
});
