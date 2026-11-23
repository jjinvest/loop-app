'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {OperacaoCatracaAdminSQLite}=
 require('../src/producao/operacao-catraca-admin-sqlite');
const {projetarAgendaTabuleiroCompartilhada}=
 require('../src/producao/projecao-agenda-tabuleiro-compartilhada');

const ms=s=>Date.parse(s);
function preparar(t,instante='2026-11-22T08:50:00-03:00'){
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 t.after(()=>banco.close());
 let agora=ms(instante);
 const motor={banco,
  _transacao:fn=>{
   banco.exec('BEGIN IMMEDIATE');
   try{const r=fn(null);banco.exec('COMMIT');return r;}
   catch(e){banco.exec('ROLLBACK');throw e;}
  },
  consultar:()=>({
   tabuleiro:{eventosNoCiclo:0,ciclosConcluidos:0},
   catraca:{giros:0},filaA:0,filaB:0
  })
 };
 const catraca=new OperacaoCatracaAdminSQLite({
  banco,motor,agora:()=>new Date(agora)
 });
 const mover=s=>{agora=ms(s);return catraca.consultar();};
 const ajustar=(modo,horario='09:00',fim='12:00',data='2026-11-22')=>{
  const anterior=catraca.consultar();
  return catraca.configurar({
   modo,janelaInicio:horario,janelaFim:fim,
   limiteDiario:null,revisaoEsperada:anterior.revisao,
   metaCentrosDia:5,metaDataAlvo:data,motivo:'TESTE_INTERNO_ISOLADO'
  });
 };
 return {banco,catraca,mover,ajustar};
}

test('relógio registra 30 luzes visuais e cinco ciclos até as 12h, sem girar nem pagar',t=>{
 const x=preparar(t);
 x.ajustar('AUTOMATICA');
 let d=x.mover('2026-11-22T09:36:00-03:00');
 assert.equal(d.luzesRelogio24h,6);
 assert.equal(d.ciclosRelogio24h,1);
 assert.equal(d.giros24h,0);
 assert.equal(d.autorizacaoFinanceiraDosGiros,false);
 d=x.mover('2026-11-22T12:00:00-03:00');
 assert.equal(d.luzesRelogio24h,30);
 assert.equal(d.ciclosRelogio24h,5);
 assert.equal(d.giros24h,0);
 d=x.mover('2026-11-22T21:00:00-03:00');
 assert.deepEqual([d.luzesRelogio24h,d.ciclosRelogio24h],[30,5],
  'encerrar o turno não elimina o histórico das últimas 24h');
 const agenda=projetarAgendaTabuleiroCompartilhada(d);
 assert.equal(agenda.luzesRelogio24h,30);
 assert.equal(agenda.ciclosRelogio24h,5);
 assert.equal(agenda.girosReais24h,0);
 assert.equal(agenda.financeiroReal,false);
});

test('uma janela móvel de 24h perde os eventos antigos sem avançar após fechar',t=>{
 const x=preparar(t);
 x.ajustar('AUTOMATICA');
 let d=x.mover('2026-11-23T08:59:00-03:00');
 assert.equal(d.luzesRelogio24h,30);
 d=x.mover('2026-11-23T09:07:00-03:00');
 assert.equal(d.luzesRelogio24h,29);
 assert.equal(d.ciclosRelogio24h,4);
 d=x.mover('2026-11-23T12:01:00-03:00');
 assert.equal(d.luzesRelogio24h,0);
 assert.equal(d.ciclosRelogio24h,0);
});

test('pausa e retomada não contam luzes perdidas nem fabricam ciclos',t=>{
 const x=preparar(t);
 x.ajustar('AUTOMATICA');
 let d=x.mover('2026-11-22T09:37:00-03:00');
 assert.equal(d.luzesRelogio24h,6);
 x.ajustar('PAUSADA');
 d=x.mover('2026-11-22T10:00:00-03:00');
 assert.deepEqual([d.luzesRelogio24h,d.ciclosRelogio24h],[6,1]);
 x.ajustar('AUTOMATICA');
 d=x.mover('2026-11-22T10:06:00-03:00');
 assert.deepEqual([d.luzesRelogio24h,d.ciclosRelogio24h],[7,1]);
 d=x.mover('2026-11-22T12:00:00-03:00');
 assert.deepEqual([d.luzesRelogio24h,d.ciclosRelogio24h],[26,4]);
 assert.equal(x.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.equal(x.banco.prepare(
  'SELECT COUNT(*) AS n FROM loop_real_catraca_admin_giros').get().n,0);
});

test('troca de meta e horário não altera os pulsos já registrados na história',t=>{
 const x=preparar(t);
 x.ajustar('AUTOMATICA');
 let d=x.mover('2026-11-22T09:36:00-03:00');
 assert.equal(d.luzesRelogio24h,6);
 x.ajustar('AUTOMATICA','09:00','21:00');
 d=x.mover('2026-11-22T10:00:00-03:00');
 assert.equal(d.luzesRelogio24h,7);
 assert.equal(d.ciclosRelogio24h,1);
 assert.equal(d.giros24h,0);
});

test('histórico continuo não zera após 24h: 4 turnos são 120 luzes e 20 ciclos',t=>{
 const x=preparar(t);
 x.ajustar('AUTOMATICA','09:00','12:00',null);
 let d=x.mover('2026-11-25T12:00:00-03:00');
 assert.equal(d.luzesRelogio24h,30);
 assert.equal(d.ciclosRelogio24h,5);
 assert.equal(d.luzesRelogioHoje,30);
 assert.equal(d.ciclosRelogioHoje,5);
 assert.equal(d.luzesRelogioAcumuladas,120);
 assert.equal(d.ciclosRelogioAcumulados,20);
 assert.equal(d.girosTotais,0);
 assert.equal(d.autorizacaoFinanceiraDosGiros,false);
 const agenda=projetarAgendaTabuleiroCompartilhada(d);
 assert.deepEqual([
  agenda.luzesRelogioHoje,agenda.ciclosRelogioHoje,
  agenda.luzesRelogioAcumuladas,agenda.ciclosRelogioAcumulados
 ],[30,5,120,20]);
 d=x.mover('2026-11-26T08:00:00-03:00');
 assert.equal(d.luzesRelogioHoje,0);
 assert.equal(d.ciclosRelogioHoje,0);
 assert.equal(d.luzesRelogioAcumuladas,120);
 assert.equal(d.ciclosRelogioAcumulados,20);
});
test('pausa conserva acumulado e retomada não reconta período parado',t=>{
 const x=preparar(t);
 x.ajustar('AUTOMATICA');
 let d=x.mover('2026-11-22T09:37:00-03:00');
 assert.equal(d.luzesRelogioAcumuladas,6);
 x.ajustar('PAUSADA');
 d=x.mover('2026-11-22T10:00:00-03:00');
 assert.equal(d.luzesRelogioAcumuladas,6);
 x.ajustar('AUTOMATICA');
 d=x.mover('2026-11-22T10:06:00-03:00');
 assert.equal(d.luzesRelogioAcumuladas,7);
 assert.equal(d.ciclosRelogioAcumulados,1);
 assert.equal(d.luzesRelogioHoje,7);
 d=x.mover('2026-11-23T10:10:00-03:00');
 assert.equal(d.luzesRelogioAcumuladas,26);
 assert.equal(d.luzesRelogioHoje,0);
 assert.equal(d.ciclosRelogioAcumulados,4);
});
