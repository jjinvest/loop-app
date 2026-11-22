'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {projetarAgendaTabuleiroCompartilhada}=
 require('../src/producao/projecao-agenda-tabuleiro-compartilhada');
const {MotorFilas}=require('../src/domain/motor-filas');
const {SimuladorLoop}=require('../src/domain/simulador-loop');
const agora=Date.parse('2026-11-21T23:36:00-03:00');
const controle={
 modo:'AUTOMATICA',janelaInicio:'17:00',janelaFim:'06:00',
 agoraServidorMs:agora,proximaLuzPrevistaEmMs:agora+72000,
 metaCentrosDia:100,metaDataAlvo:'2026-11-21',
 intervaloLuzSegundos:78,horarioPermitido:true,
 eventosNoCiclo:0,girosHoje:0,giros24h:0
};
function criarVisor(visao,agenda){
 const e={
  relogioTabuleiroIntegrado:{textContent:''},
  tituloRelogioTabuleiro:{textContent:''},
  estadoRelogioTabuleiro:{textContent:''},
  motorContadorEventos:{textContent:''},
  loop03NumeroIntegrado:{textContent:visao==='cliente'?'—':'0 / 6'},
  loop03StatusPosicao:{textContent:''},
  conteudoTabuleiro:{hidden:false}
 };
 const DateFake=class extends Date{static now(){return agora;}};
 const corpo={classList:{contains:x=>visao==='operador'&&
  x==='loop03-modo-operador'}};
 const context={
  window:{setInterval:()=>1,matchMedia:()=>({matches:true})},
  document:{hidden:false,body:corpo},Date:DateFake,
  Intl,Math,Number,String,Object,setTimeout:()=>1,clearTimeout:()=>{}
 };
 const js=fs.readFileSync(path.resolve(__dirname,
  '../src/shared/visor-catraca.js'),'utf8');
 vm.runInNewContext(js,context);
 const visor=context.window.LoopVisorCatraca.criar({elemento:id=>e[id]});
 visor.registrarAgenda(agenda);
 return e;
}
test('operador e cliente recebem o mesmo cronômetro visual e os mesmos contadores reais',()=>{
 const mesmaAgenda=projetarAgendaTabuleiroCompartilhada(controle);
 assert.equal(mesmaAgenda.origem,'CATRACA_REAL_MESMO_SQLITE');
 assert.equal(mesmaAgenda.somenteLeitura,true);
 assert.equal(mesmaAgenda.financeiroReal,false);
 assert.equal(mesmaAgenda.eventosReaisNoCiclo,0);
 assert.equal(mesmaAgenda.girosReaisHoje,0);
 assert.equal(mesmaAgenda.girosReais24h,0);
 assert.equal(mesmaAgenda.metaLotes.quantidade,100);
 assert.equal(mesmaAgenda.luzesDoRelogioCompartilhado,true);
 const op=criarVisor('operador',mesmaAgenda);
 const cliente=criarVisor('cliente',mesmaAgenda);
 for(const k of [
  'relogioTabuleiroIntegrado','tituloRelogioTabuleiro',
  'estadoRelogioTabuleiro','motorContadorEventos'
 ])assert.equal(cliente[k].textContent,op[k].textContent,k);
 assert.match(cliente.estadoRelogioTabuleiro.textContent,
  /Relógio: [0-6]\/6 luzes/);
 assert.match(cliente.loop03StatusPosicao.textContent,
  /luzes previstas · Giros reais hoje: 0/);
 assert.equal(cliente.motorContadorEventos.textContent.match(
  /Eventos confirmados: 0 de 6/)?.[0],
  'Eventos confirmados: 0 de 6');
 // Mesma luz visível nunca é contabilizada como giro real.
 assert.equal(mesmaAgenda.girosReaisHoje,0);
});
test('pausa e meta encerrada aparecem do mesmo modo em ambas as sessões',()=>{
 const pausa=projetarAgendaTabuleiroCompartilhada({
  ...controle,modo:'PAUSADA'
 });
 const a=criarVisor('operador',pausa),b=criarVisor('cliente',pausa);
 assert.equal(a.relogioTabuleiroIntegrado.textContent,'--:--');
 assert.equal(b.relogioTabuleiroIntegrado.textContent,'--:--');
 assert.equal(a.tituloRelogioTabuleiro.textContent,'CATRACA PAUSADA');
 assert.equal(b.tituloRelogioTabuleiro.textContent,'CATRACA PAUSADA');
 assert.throws(()=>projetarAgendaTabuleiroCompartilhada({
  ...controle,eventosNoCiclo:7
 }),/TABULEIRO_AGENDA_PUBLICA_INVALIDA/);
});
test('checkup das filas: 3A:1B, fallback B, 6 vagas e máximo 2 por titular',()=>{
 const f=new MotorFilas();
 f.travaPromocaoAtiva=false;
 for(let i=1;i<=9;i++){
  f.registrarPosicao({participanteId:'a'+i,vendaId:'a'+i});
  f.registrarIndicacaoValidada({
   indicadorId:'a'+i,eventoId:'i'+i
  });
 }
 for(let i=1;i<=4;i++)
  f.registrarPosicao({participanteId:'b'+i,vendaId:'b'+i});
 const sequencia=[];
 for(let i=0;i<8;i++)sequencia.push(f.proximoDaFila().origem);
 assert.deepEqual(sequencia,['A','A','A','B','A','A','A','B']);
 // Cada fila continua se a outra acabar.
 while(f.filaA.length)f.proximoDaFila();
 assert.equal(f.proximoDaFila().origem,'B');
 const s=new SimuladorLoop();
 for(let i=1;i<=4;i++)
  s.registrarPosicaoSimulada({participanteId:'titular-repetido',vendaId:'r'+i});
 for(let i=1;i<=10;i++)
  s.registrarPosicaoSimulada({participanteId:'outro-'+i,vendaId:'o'+i});
 s.prepararTabuleiro();
 const tab=s.estado().tabuleiro;
 assert.equal(tab.vagas.length,6);
 const presentes=[tab.centro,...tab.vagas].filter(Boolean);
 assert.equal(presentes.filter(x=>x.participanteId==='titular-repetido').length,2);
 for(let i=1;i<=6;i++)
  s.registrarVendaNoCicloSimulada({vendaId:'simulado-'+i});
 assert.equal(s.estado().tabuleiro.vendasNoCiclo,6);
 assert.equal(s.estado().catraca.giros,0);
});
