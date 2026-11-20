'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {OperacaoCatracaAdminSQLite}=
 require('../src/producao/operacao-catraca-admin-sqlite');

function preparar(){
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 const motor={
  banco,
  _transacao(fn){
   banco.exec('BEGIN IMMEDIATE');
   try{
    const r=fn({abrirCatraca(){},pausarCatraca(){}});
    banco.exec('COMMIT');return r;
   }catch(e){banco.exec('ROLLBACK');throw e;}
  },
  consultar(){return {tabuleiro:{eventosNoCiclo:0},
   catraca:{giros:0},filaA:4,filaB:3};}
 };
 let instante=Date.parse('2026-11-17T09:00:00-03:00');
 const agora=()=>new Date(instante);
 const controle=new OperacaoCatracaAdminSQLite({banco,motor,agora});
 return {banco,motor,agora,controle,
  avancar:hora=>{instante=Date.parse('2026-11-17T'+hora+'-03:00');}};
}

test('meta diaria define luzes pelo horario sem venda nova ou credito',()=>{
 const {banco,controle,motor,agora}=preparar();
 try{
  const c0=controle.consultar();
  assert.equal(c0.modo,'PAUSADA');
  assert.equal(c0.metaCentrosDia,0);
  assert.equal(c0.luzesPlanejadas,0);
  assert.equal(c0.caixaConciliadoParaMeta,false);
  assert.equal(c0.autorizacaoFinanceiraDosGiros,false);
  for(const [quantidade,luzes,segundos] of [
   [1,6,5400],[3,18,1800],[5,30,1080],[10,60,540]
  ]){
   const c=controle.consultar();
   const x=controle.configurar({modo:'PAUSADA',
    janelaInicio:'09:00',janelaFim:'18:00',
    limiteDiario:null,metaCentrosDia:quantidade,
    metaDataAlvo:null,revisaoEsperada:c.revisao,
    motivo:'PROGRAMACAO_DIARIA_DE_CAIXA'});
   assert.equal(x.metaCentrosDia,quantidade);
   assert.equal(x.luzesPlanejadas,luzes);
   assert.equal(x.intervaloLuzSegundos,segundos);
   assert.equal(x.duracaoTurnoMinutos,540);
   assert.equal(x.janelaInicio,'09:00');
   assert.equal(x.janelaFim,'18:00');
   assert.equal(x.modo,'PAUSADA');
   assert.equal(x.girosTotais,0);
   assert.equal(x.autorizacaoFinanceiraDosGiros,false);
  }
  assert.equal(banco.prepare(
   'SELECT COUNT(*) AS n FROM loop_real_catraca_admin_giros'
  ).get().n,0);
  assert.equal(banco.prepare(
   'SELECT COUNT(*) AS n FROM loop_real_catraca_admin_historico'
  ).get().n,4);
  const reiniciado=new OperacaoCatracaAdminSQLite({banco,motor,agora});
  assert.equal(reiniciado.consultar().metaCentrosDia,10);
  assert.equal(reiniciado.consultar().intervaloLuzSegundos,540);
  const antes=reiniciado.consultar();
  assert.throws(()=>reiniciado.configurar({modo:'PAUSADA',
   janelaInicio:'09:00',janelaFim:'18:00',
   limiteDiario:null,metaCentrosDia:1,
   metaDataAlvo:null,revisaoEsperada:1,motivo:'REVISAO_ANTIGA'}),
   /CATRACA_ADMIN_REVISAO_DESATUALIZADA/);
  assert.equal(reiniciado.consultar().metaCentrosDia,antes.metaCentrosDia);
  assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{banco.close();}
});

test('meta por dia opcional, zero desliga e fora da data nao habilita luzes',()=>{
 const {banco,controle}=preparar();
 try{
  let r=controle.configurar({modo:'AUTOMATICA',
   janelaInicio:'09:00',janelaFim:'18:00',
   limiteDiario:null,metaCentrosDia:5,metaDataAlvo:'2026-11-18',
   revisaoEsperada:1,motivo:'APENAS_DIA_SEGUINTE'});
  assert.equal(r.metaCentrosDia,5);
  assert.equal(r.metaAplicavelHoje,false);
  assert.equal(r.luzesPlanejadas,0);
  assert.equal(r.podeGirar,false);
  assert.equal(controle.processarAgenda().girou,false);
  r=controle.configurar({modo:'PAUSADA',
   janelaInicio:'09:00',janelaFim:'18:00',
   limiteDiario:null,metaCentrosDia:0,metaDataAlvo:null,
   revisaoEsperada:2,motivo:'SEM_CAIXA_SEM_META'});
  assert.equal(r.metaCentrosDia,0);
  assert.equal(r.intervaloLuzSegundos,null);
  assert.equal(r.luzesPlanejadas,0);
  assert.equal(r.caixaConciliadoParaMeta,false);
 }finally{banco.close();}
});

test('controles recusam datas falsas e metas negativas; transacao intacta',()=>{
 const {banco,controle}=preparar();
 try{
  for(const m of [-1,1.5,1000001,Number.NaN]){
   assert.throws(()=>controle.configurar({modo:'PAUSADA',
    janelaInicio:'09:00',janelaFim:'18:00',limiteDiario:null,
    metaCentrosDia:m,metaDataAlvo:null,revisaoEsperada:1,
    motivo:'META_INVALIDA'}),/CATRACA_ADMIN_CONFIGURACAO_INVALIDA/);
  }
  for(const dia of ['2026-02-30','2026-13-01','11/17/2026']){
   assert.throws(()=>controle.configurar({modo:'PAUSADA',
    janelaInicio:'09:00',janelaFim:'18:00',limiteDiario:null,
    metaCentrosDia:5,metaDataAlvo:dia,revisaoEsperada:1,
    motivo:'DATA_INVALIDA'}),/CATRACA_ADMIN_CONFIGURACAO_INVALIDA/);
  }
  assert.equal(controle.consultar().revisao,1);
  assert.equal(controle.consultar().metaCentrosDia,0);
  assert.equal(banco.prepare(
   'SELECT COUNT(*) AS n FROM loop_real_catraca_admin_historico'
  ).get().n,0);
 }finally{banco.close();}
});

test('relogio real usa a meta persistida com tempo do servidor e mantem caixa fechado',()=>{
 const {banco,controle,avancar}=preparar();
 try{
  let r=controle.configurar({modo:'AUTOMATICA',
   janelaInicio:'09:00',janelaFim:'18:00',limiteDiario:null,
   metaCentrosDia:1,metaDataAlvo:null,revisaoEsperada:1,
   motivo:'UM_CENTRO_DURANTE_TURNO'});
  const momento=h=>Date.parse('2026-11-17T'+h+'-03:00');
  assert.equal(r.intervaloLuzSegundos,5400);
  assert.equal(r.proximaLuzPrevistaEmMs,momento('10:30:00'));
  assert.equal(r.agoraServidorMs,momento('09:00:00'));
  assert.equal(r.autorizacaoFinanceiraDosGiros,false);
  assert.equal(r.luzesAutorizadasPorCaixa,0);
  avancar('10:29:59');
  assert.equal(controle.consultar().proximaLuzPrevistaEmMs,momento('10:30:00'));
  avancar('10:30:00');
  assert.equal(controle.consultar().proximaLuzPrevistaEmMs,momento('12:00:00'));
  avancar('17:59:00');
  assert.equal(controle.consultar().proximaLuzPrevistaEmMs,momento('18:00:00'));
  avancar('18:00:00');
  assert.equal(controle.consultar().proximaLuzPrevistaEmMs,null);
  r=controle.configurar({modo:'PAUSADA',
   janelaInicio:'09:00',janelaFim:'18:00',limiteDiario:null,
   metaCentrosDia:10,metaDataAlvo:null,revisaoEsperada:2,
   motivo:'PAUSA_DE_OPERADOR'});
  assert.equal(r.proximaLuzPrevistaEmMs,null);
  assert.equal(r.intervaloLuzSegundos,540);
  assert.equal(r.girosTotais,0);
  assert.equal(banco.prepare(
   'SELECT COUNT(*) AS n FROM loop_real_catraca_admin_giros'
  ).get().n,0);
  const reiniciado=new OperacaoCatracaAdminSQLite({banco,
   motor:controle.motor,agora:controle.agora});
  assert.equal(reiniciado.consultar().metaCentrosDia,10);
  assert.equal(reiniciado.consultar().proximaLuzPrevistaEmMs,null);
  assert.equal(banco.prepare('PRAGMA quick_check').get().quick_check,'ok');
 }finally{banco.close();}
});
