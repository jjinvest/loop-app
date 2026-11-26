'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {avaliarExecucaoDistribuicao}=require('../src/domain/politica-execucao-distribuicao-loop');
const ms=s=>Date.parse(s+'-03:00');
const agenda={modo:'MANUAL',metaCentrosDia:0};
const avaliar=(hora,outros={})=>avaliarExecucaoDistribuicao({agenda,
 agoraMs:ms('2026-11-26T'+hora),ativa:true,...outros});
test('sem meta o livre respeita 09–18, sem intervalo fixo e sem ativação implícita',()=>{
 assert.equal(avaliar('08:59:59').podeExecutar,false);
 assert.equal(avaliar('09:00:00').podeExecutar,true);
 assert.equal(avaliar('09:00:01',{ultimoEventoEm:ms('2026-11-26T09:00:00')}).podeExecutar,true);
 assert.equal(avaliar('18:00:00').podeExecutar,false);
 assert.equal(avaliar('12:00:00',{ativa:false}).podeExecutar,false);
 assert.equal(avaliar('12:00:00').intervaloMs,null);
});
test('meta distribui seis eventos e reabrir no meio do turno não recupera marcos',()=>{
 const programada={modo:'AUTOMATICA',janelaInicio:'09:00',janelaFim:'10:00',metaCentrosDia:1};
 const x=hora=>avaliar(hora,{agenda:programada,marcoExecucaoEm:ms('2026-11-26T09:25:00')});
 assert.equal(x('09:25:01').podeExecutar,false);
 assert.equal(x('09:30:00').podeExecutar,true);
 assert.equal(x('09:30:00').intervaloMs,600000);
 assert.equal(avaliar('10:00:00',{agenda:programada,girosHoje:1}).motivo,'META_DIARIA_ATINGIDA');
 assert.equal(x('10:01:00').podeExecutar,false);
});
test('último marco admite atraso de processamento dentro do minuto de fechamento',()=>{
 const p={modo:'AUTOMATICA',janelaInicio:'09:00',janelaFim:'10:00',metaCentrosDia:1};
 assert.equal(avaliar('10:00:00.500',{agenda:p,ultimoEventoEm:ms('2026-11-26T09:50:00')}).podeExecutar,true);
});
test('programação noturna preserva a data de início após meia-noite',()=>{
 const p={modo:'AUTOMATICA',janelaInicio:'22:00',janelaFim:'02:00',metaCentrosDia:1,metaDataAlvo:'2026-11-26'};
 const x=avaliarExecucaoDistribuicao({agenda:p,agoraMs:ms('2026-11-27T00:01:00'),ativa:true});
 assert.equal(x.dia,'2026-11-26');
 assert.equal(x.podeExecutar,true);
 assert.equal(x.proximaLuzPrevistaEmMs,ms('2026-11-27T00:40:00'));
});
test('pausa, data e limite barram apenas a execução',()=>{
 assert.equal(avaliar('12:00:00',{agenda:{...agenda,modo:'PAUSADA'}}).podeExecutar,false);
 assert.equal(avaliar('12:00:00',{agenda:{...agenda,metaDataAlvo:'2026-11-27'}}).motivo,'FORA_DA_DATA');
 assert.equal(avaliar('12:00:00',{agenda:{...agenda,limiteDiario:1},girosHoje:1}).motivo,'LIMITE_DIARIO_ATINGIDO');
});
