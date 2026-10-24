'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {executar50GirosComTitularesRepetidos}=
 require('../scripts/simular-50-giros-posicoes-repetidas-v6');
test('50 giros: participantes com quatro e seis posicoes sem perder assentos',()=>{
 const r=executar50GirosComTitularesRepetidos();
 assert.equal(r.giroTotal,50);
 assert.equal(r.centrosConcluidos,50);
 assert.equal(r.posicoesTotais,400);
 assert.equal(r.titularesDistintos,75);
 assert.ok(r.titularesDistintosComCentroConcluido<50);
 assert.equal(r.maximoPosicoesPorPessoa,6);
 assert.equal(r.aguardando,343);
 assert.equal(r.filaA+r.filaB,343);
 assert.ok(r.promocoesDeTitularComQuatroPosicoes>=5);
 assert.equal(r.convites,30);
 assert.ok(r.entradasA>0);
 assert.ok(r.entradasB>0);
 assert.equal(r.saldoRealCentavos,0);
 assert.equal(r.pagamentosReais,0);
 assert.equal(r.saquesReais,0);
 console.log('RELATORIO_TITULARES_REPETIDOS='+JSON.stringify(r));
});
