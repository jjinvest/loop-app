'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {calcularPonteAkitemmLoop}=require('../src/domain/ponte-financeira-simples-akitemm-loop-v6');

test('dois produtos R$190, custo de produto R$100: LOOP R$250 e dono R$30',()=>{
 const r=calcularPonteAkitemmLoop({
  valorVendaCentavos:38000,custoProdutosCentavos:10000
 });
 assert.equal(r.situacao,'COBERTURA_CALCULADA_SEM_TRANSFERENCIA');
 assert.equal(r.custoProdutosCentavos,10000);
 assert.equal(r.loopSeparavelCentavos,25000);
 assert.equal(r.restanteProprietarioCentavos,3000);
 assert.equal(r.custoProdutosCentavos+r.loopSeparavelCentavos+
  r.restanteProprietarioCentavos,r.vendaCentavos);
 assert.equal(r.separacaoRealExecutada,false);
 assert.equal(r.dinheiroRealRecebidoCentavos,0);
});
test('dois produtos R$190, custo R$130: nao sobra valor do proprietario',()=>{
 const r=calcularPonteAkitemmLoop({valorVendaCentavos:38000,
  custoProdutosCentavos:13000});
 assert.equal(r.loopSeparavelCentavos,25000);
 assert.equal(r.restanteProprietarioCentavos,0);
});
test('custo maior do que o permitido pela venda nao gera aporte ficticio',()=>{
 const r=calcularPonteAkitemmLoop({valorVendaCentavos:38000,
  custoProdutosCentavos:15000});
 assert.equal(r.situacao,'SEM_COBERTURA_PARA_LOOP');
 assert.equal(r.loopSeparavelCentavos,0);
 assert.equal(r.insuficienciaCentavos,2000);
 assert.equal(r.posicaoFinanceiramenteCoberta,false);
 assert.equal(r.restanteProprietarioCentavos,0);
});
test('R$190 sozinho e venda da AKITEMM sem Loop',()=>{
 const r=calcularPonteAkitemmLoop({valorVendaCentavos:19000,
  custoProdutosCentavos:5000});
 assert.equal(r.situacao,'VENDA_SOMENTE_AKITEMM');
 assert.equal(r.loopSeparavelCentavos,0);
 assert.equal(r.restanteProprietarioCentavos,14000);
});
test('subtotal apenas de itens elegiveis controla a cobertura',()=>{
 const r=calcularPonteAkitemmLoop({valorVendaCentavos:38000,
  custoProdutosCentavos:10000,valorElegivelLoopCentavos:19000});
 assert.equal(r.situacao,'VENDA_SOMENTE_AKITEMM');
 assert.equal(r.loopSeparavelCentavos,0);
 assert.equal(r.restanteProprietarioCentavos,28000);
});
test('nao aceita custo ou valor manipulado e nunca transfere saldo ao LOOP',()=>{
 for(const p of [
  {valorVendaCentavos:-1,custoProdutosCentavos:0},
  {valorVendaCentavos:38000,custoProdutosCentavos:-1},
  {valorVendaCentavos:38000,custoProdutosCentavos:10.5},
  {valorVendaCentavos:38000,custoProdutosCentavos:10000,
   valorElegivelLoopCentavos:39000}
 ]){
  assert.throws(()=>calcularPonteAkitemmLoop(p),{codigo:/INVALIDO|VALOR_ELEGIVEL_SUPERA_VENDA/});
 }
 const r=calcularPonteAkitemmLoop({valorVendaCentavos:30000,
  custoProdutosCentavos:1000});
 assert.equal(r.separacaoRealExecutada,false);
 assert.equal(r.dinheiroRealRecebidoCentavos,0);
});
