'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {executarComparacao1000}=require('../scripts/simular-1000-compradores-loop-v6');

test('LOOP V6: 1000 compradores, dois precos, A/B, 20 azuis viram douradas exclusivamente na vaga 6',()=>{
 const cenarios=executarComparacao1000();
 assert.equal(cenarios.length,4);
 for(const r of cenarios){
  assert.equal(r.pessoasCompradoras,1000);
  assert.equal(r.comprasPDF,500);
  assert.equal(r.comprasFisicas190,500);
  assert.equal(r.comprasFisicasSemPosicao,500);
  assert.equal(r.posicoesCriadasPDF,500);
  assert.equal(r.conversoesAzulParaDourada,20);
  assert.equal(r.contemplacoesComCicloConcluido,83);
  assert.equal(r.quantidadeA+r.quantidadeB,411);
  assert.equal(r.noTabuleiro,7);
  assert.equal(r.girosEfetuados,83);
  assert.equal(r.proximoCicloCom2De6,2);
  assert.equal(r.financeiro.faturamentoBrutoSimuladoCentavos,22000000);
  assert.equal(r.financeiro.faturamentoFisico190Centavos,9500000);
  assert.equal(r.financeiro.faturamentoPDFCentavos,12500000);
  assert.equal(r.financeiro.pagamentoRealCentavos,0);
  assert.equal(r.contemplacoesFundador+r.contemplacoesOutrosClientes+
    r.contemplacoesPosicoesDouradas,83);
  assert.equal(r.douradasConvertidasAoLongoDosGiros.length,20);
  assert.ok(r.douradasConvertidasAoLongoDosGiros.every(x=>
    x.azulAntes&&x.douradaDepois&&x.giro>=1));
  // Resultados completos no log dos testes, sem clientes reais.
  console.log('LOOP_RESULTADO_MIL='+JSON.stringify({
   cenario:r.cenario,filaA:r.quantidadeA,filaB:r.quantidadeB,
   ciclos:r.contemplacoesComCicloConcluido,
   contempladosFundador:r.contemplacoesFundador,
   contempladosClientes:r.contemplacoesOutrosClientes,
   contempladosDourados:r.contemplacoesPosicoesDouradas,
   douradasConvertidas:r.conversoesAzulParaDourada,
   douradasAgora:r.douradasNoTabuleiroAgora,azuisNaFila:r.azulPendente,
   entradasA:r.entradasFilaA,entradasB:r.entradasFilaB,
   indicacoes:r.indicacoesValidadas,
   brutoCentavos:r.financeiro.faturamentoBrutoSimuladoCentavos,
   caixaCiclo:r.financeiro.alocacaoReferencialPorDestinoCentavos,
   bonusIndicacoesHipotetico:r.financeiro.bonusIndicacaoHipotetico10PctPDFCentavos,
   restoProximoCiclo:r.proximoCicloCom2De6
  }));
 }
});
