'use strict';
// Testes do LIMITE DA MARGEM do calculador existente. Sao hipoteses,
// nao custo contábil conhecido, lucro apurado ou recebimento PSP.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {calcularPonteAkitemmLoop}=require('../src/domain/ponte-financeira-simples-akitemm-loop-v6');
const {politicaTarifaSaqueFuturaLab}=require('../src/domain/contrato-psp-futuro-loop-lab');
test('produto R$250 nao suporta custo positivo E separacao integral R$250 no mesmo caixa',()=>{
 const semCusto=calcularPonteAkitemmLoop({
  valorVendaCentavos:25000,custoProdutosCentavos:0});
 assert.equal(semCusto.posicaoFinanceiramenteCoberta,true);
 assert.equal(semCusto.restanteProprietarioCentavos,0);
 const comCusto=calcularPonteAkitemmLoop({
  valorVendaCentavos:25000,custoProdutosCentavos:1000});
 assert.equal(comCusto.situacao,'SEM_COBERTURA_PARA_LOOP');
 assert.equal(comCusto.posicaoFinanceiramenteCoberta,false);
 assert.equal(comCusto.insuficienciaCentavos,1000);
 assert.equal(comCusto.loopSeparavelCentavos,0);
 assert.equal(comCusto.separacaoRealExecutada,false);
});
test('carrinho 380, custo 100, separacao 250: sobra 30 ANTES de custos nao modelados',()=>{
 const r=calcularPonteAkitemmLoop({
  valorVendaCentavos:38000,custoProdutosCentavos:10000});
 assert.equal(r.loopSeparavelCentavos,25000);
 assert.equal(r.restanteProprietarioCentavos,3000);
 assert.equal(r.custoProdutosCentavos+r.loopSeparavelCentavos+
  r.restanteProprietarioCentavos,r.vendaCentavos);
 // Simulacoes HIPOTETICAS de tarifas, sem estimar a tarifa real:
 for(const custoPspHipoteticoCentavos of [0,150,300]){
  assert.equal(3000-custoPspHipoteticoCentavos,
   [3000,2850,2700][[0,150,300].indexOf(custoPspHipoteticoCentavos)]);
 }
 assert.equal(r.dinheiroRealRecebidoCentavos,0);
 assert.equal(r.separacaoRealExecutada,false);
});
test('produto comum R$190 jamais cria posicao pelo calculador de cobertura',()=>{
 const r=calcularPonteAkitemmLoop({
  valorVendaCentavos:19000,custoProdutosCentavos:5000});
 assert.equal(r.situacao,'VENDA_SOMENTE_AKITEMM');
 assert.equal(r.loopSeparavelCentavos,0);
 assert.equal(r.restanteProprietarioCentavos,14000);
 assert.equal(r.posicaoFinanceiramenteCoberta,false);
});
test('saque 0% e PSP a cargo da empresa; simular juros ou tarifa real e indevido',()=>{
 for(const solicitado of [2500,10000,30000]){
  const r=politicaTarifaSaqueFuturaLab({valorSolicitadoCentavos:solicitado});
  assert.equal(r.valorLiquidoParticipanteCentavos,solicitado);
  assert.equal(r.taxaParticipanteCentavos,0);
  assert.equal(r.tarifaDoBancoCentavos,null);
  assert.equal(r.pagadorDaTarifaBancaria,'EMPRESA');
  assert.equal(r.saldoRealVerificado,false);
 }
 console.log('LOOP_REVISAO_COBERTURA_FINANCEIRA='+JSON.stringify({
  vendaCentavos:25000,custoProdutoHipoteticoCentavos:1000,
  insuficienciaReferencialCentavos:1000,novoAporteRealInventado:false,
  exemploCarrinhoBrutoCentavos:38000,
  exemploCustoCentavos:10000,exemploSeparacaoLoopCentavos:25000,
  exemploSobraAntesDespesasCentavos:3000,
  taxasPspReaisConhecidas:false,tributosReaisConhecidos:false,
  lucroLiquidoAuditado:false,taxaDeSaqueAoParticipantePercentual:0}));
});
