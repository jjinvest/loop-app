'use strict';
// Teste de 5.000 COMPRADORES com mesmo motor/caminho comercial da simulação 1.000.
// Testes de telas e transações SQLite são realizados em test/* e na suíte Playwright.
// Não cria 5.000 navegadores, não executa pagamentos ou saques.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {executarCenario1000}=require('../scripts/simular-1000-compradores-loop-v6');

test('LOOP V6 stress: 5000 compradores distintos, 2500 PDFs R$250 e 2500 físicos R$190, filas A/B, 20 douradas',()=>{
 for(const primeiraFila of ['A','B'])for(const intensidade of ['ALTA','MODERADA']){
  const r=executarCenario1000({primeiraFila,intensidade,totalCompradores:5000});
  const saldo=r.financeiro.alocacaoReferencialPorDestinoCentavos;
  assert.equal(r.pessoasCompradoras,5000);
  assert.equal(r.comprasPDF,2500);
  assert.equal(r.comprasFisicas190,2500);
  assert.equal(r.posicoesCriadasPDF,2500);
  assert.equal(r.comprasFisicasSemPosicao,2500);
  assert.equal(r.conversoesAzulParaDourada,20);
  assert.equal(r.contemplacoesComCicloConcluido,416);
  assert.equal(r.girosEfetuados,416);
  assert.equal(r.noTabuleiro,7);
  assert.equal(r.quantidadeA+r.quantidadeB,2078);
  assert.equal(r.proximoCicloCom2De6,4);
  assert.equal(r.douradasConvertidasAoLongoDosGiros.length,20);
  assert.equal(r.contemplacoesPosicoesDouradas,20);
  assert.equal(r.contemplacoesFundador,1);
  assert.equal(r.contemplacoesOutrosClientes,395);
  assert.equal(r.financeiro.faturamentoBrutoSimuladoCentavos,110000000);
  assert.equal(r.financeiro.faturamentoPDFCentavos,62500000);
  assert.equal(r.financeiro.faturamentoFisico190Centavos,47500000);
  assert.equal(r.financeiro.valorAlocadoCiclosCompletosCentavos,62400000);
  assert.equal(r.financeiro.valorPendenteProximoCicloReferencialCentavos,100000);
  assert.equal(saldo.LOOP_CENTRO,29700000);
  assert.equal(saldo.LOOP_DOURADAS,1500000);
  assert.equal(saldo.LOOP_ESQUERDA,20800000);
  assert.equal(saldo.LOOP_DIREITA,10400000);
  assert.equal(r.financeiro.pagamentoRealCentavos,0);
  assert.equal(r.financeiro.saquesReaisCentavos,0);
  assert.equal(r.financeiro.contemplacoesPagasCentavos,0);
  assert.equal(r.entradasFilaA+r.entradasFilaB,416);
  assert.equal(r.cenario,primeiraFila+'-'+intensidade);
  assert.equal(r.primeiraFila,primeiraFila);
  const primeiroAzul=r.douradasConvertidasAoLongoDosGiros[0];
  assert.equal(primeiroAzul.azulAntes,true);
  assert.equal(primeiroAzul.douradaDepois,true);
  const resumo={cenario:r.cenario,compradores:r.pessoasCompradoras,
   pdf250:r.comprasPDF,fisico190:r.comprasFisicas190,
   filaA:r.quantidadeA,filaB:r.quantidadeB,
   azuisRestantes:r.azulPendente,douradasConvertidas:r.conversoesAzulParaDourada,
   douradasNoTabuleiro:r.douradasNoTabuleiroAgora,
   ciclosConcluidos:r.contemplacoesComCicloConcluido,
   centrosFundador:r.contemplacoesFundador,
   centrosClientes:r.contemplacoesOutrosClientes,
   centrosDourados:r.contemplacoesPosicoesDouradas,
   indicacoes:r.indicacoesValidadas,entradasA:r.entradasFilaA,entradasB:r.entradasFilaB,
   referenciaCentavos:saldo,brutoCentavos:r.financeiro.faturamentoBrutoSimuladoCentavos,
   bonusReferencialCentavos:r.financeiro.bonusIndicacaoHipotetico10PctPDFCentavos,
   proximoCicloDeSeis:r.proximoCicloCom2De6};
  console.log('LOOP_RESULTADO_5000='+JSON.stringify(resumo));
 }
});
