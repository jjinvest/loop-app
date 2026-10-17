'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {prazoDaSolicitacao,PRAZO_SAQUE_CALENDARIO_MS}=
 require('../src/domain/solicitacoes-saque-demo-sqlite');

test('saque: 24 horas corridas desde o pedido, inclusive sabado e domingo',()=>{
 assert.equal(PRAZO_SAQUE_CALENDARIO_MS,86400000);
 const sexta='2026-10-16T20:00:00.000Z'; // sexta-feira 17h Brasil
 const antes=prazoDaSolicitacao(sexta,'2026-10-17T19:59:59.000Z');
 assert.equal(antes.prazoMaximoAnaliseEm,'2026-10-17T20:00:00.000Z');
 assert.equal(antes.prazoUltrapassadoNoTeste,false);
 assert.equal(antes.consideraSabadosDomingosFeriados,true);
 assert.equal(antes.permiteLiberacaoAntecipadaSomenteAposConciliacao,true);
 assert.equal(antes.liberacaoRealHabilitada,false);
 assert.equal(prazoDaSolicitacao(sexta,'2026-10-17T20:00:00.000Z')
  .prazoUltrapassadoNoTeste,false);
 assert.equal(prazoDaSolicitacao(sexta,'2026-10-17T20:00:01.000Z')
  .prazoUltrapassadoNoTeste,true);
 const domingo='2026-10-18T13:00:00.000Z';
 assert.equal(prazoDaSolicitacao(domingo,'2026-10-19T12:59:00.000Z')
  .prazoMaximoAnaliseEm,'2026-10-19T13:00:00.000Z');
 assert.throws(()=>prazoDaSolicitacao('data-invalida',domingo),/Relogio/);
});
