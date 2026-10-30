'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {executarCenario5000}=require('../scripts/simular-5000-compradores-reserva-loop-v6');
const C=25000;
test('5000 compradores: 20 douradas FINANCIADAS pela reserva + 5 azuis convertidas sem pagar duas vezes',()=>{
 for(const primeiraFila of ['A','B'])for(const intensidade of ['ALTA','MODERADA']){
  const r=executarCenario5000({primeiraFila,intensidade,
   usarCofreReserva:true,metaOuroReserva:20,quantidadeAzuis:5});
  const f=r.financeiro;
  assert.equal(r.pessoasCompradoras,5000);
  assert.equal(r.comprasPDF,2500);
  assert.equal(r.comprasFisicas190,2500);
  assert.equal(r.posicoesCriadasPDF,2500);
  assert.equal(r.contemplacoesComCicloConcluido,416);
  assert.equal(r.posicoesDouradasFinanciadasPelaReserva,20);
  assert.equal(r.conversoesAzulParaDourada+r.azulPendente,5);
  assert.equal(f.cofreReservaBrutoCentavos,10400000);
  assert.equal(f.compromissoDouradasFinanciadasCentavos,20*C);
  assert.equal(f.compromissosDeBonificacaoReservaCentavos,
   r.indicacoesValidadas*Math.round(C*0.1));
  assert.equal(f.cofreReservaLivreDemonstrativoCentavos,
   f.cofreReservaBrutoCentavos-f.compromissosDeBonificacaoReservaCentavos-
   f.compromissoDouradasFinanciadasCentavos);
  assert.ok(f.cofreReservaLivreDemonstrativoCentavos>=0);
  assert.equal(f.extratoDouradasDaReserva.length,20);
  assert.ok(f.extratoDouradasDaReserva.every(e=>
   e.cofreOrigem==='LOOP_DIREITA'&&
   e.valorAporteCentavos===C&&e.livreAntesCentavos>=C&&
   e.livreDepoisCentavos===e.livreAntesCentavos-C&&e.livreDepoisCentavos>=0));
  assert.equal(r.quantidadeA+r.quantidadeB+r.noTabuleiro+
   r.contemplacoesComCicloConcluido,2501+20);
  assert.equal(f.faturamentoBrutoSimuladoCentavos,110000000);
  assert.ok(f.evolucaoSaldoReserva.every(e=>e.livreCentavos>=0),
   'Reserva nao deve ficar negativa nos giros amostrados');
  assert.equal(f.pagamentoRealCentavos,0);
  console.log('LOOP_RESERVA_5000_20_DOURADAS='+JSON.stringify({
   cenario:r.cenario,filaA:r.quantidadeA,filaB:r.quantidadeB,
   indicacoes:r.indicacoesValidadas,ciclos:r.contemplacoesComCicloConcluido,
   azuisQueViraramDouradas:r.conversoesAzulParaDourada,
   douradasNovasFinanciadas:r.posicoesDouradasFinanciadasPelaReserva,
   reservaBrutaCentavos:f.cofreReservaBrutoCentavos,
   bonificacoesHipoteticasCentavos:f.compromissosDeBonificacaoReservaCentavos,
   aporte20DouradasCentavos:f.compromissoDouradasFinanciadasCentavos,
   reservaLivreHipoteticaCentavos:f.cofreReservaLivreDemonstrativoCentavos,
   origemDasDouradas:'LOOP_DIREITA; AZUIS SEM APORTE DUPLO',
   nenhumPagamentoReal:true
  }));
 }
});
