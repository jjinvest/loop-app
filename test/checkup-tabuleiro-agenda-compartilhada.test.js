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
 eventosNoCiclo:0,ciclosConcluidos:0,girosHoje:0,giros24h:0
};
function criarVisor(visao,agenda,instante=agora){
 const e={
  relogioTabuleiroIntegrado:{textContent:''},
  tituloRelogioTabuleiro:{textContent:''},
  estadoRelogioTabuleiro:{textContent:''},
  motorContadorEventos:{textContent:''},
  loop03NumeroIntegrado:{textContent:visao==='cliente'?'—':'0 / 6'},
  loop03Giros24Integrado:{textContent:'0'},
  loop03StatusPosicao:{textContent:''},
  conteudoTabuleiro:{hidden:false}
 };
 const DateFake=class extends Date{static now(){return instante;}};
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
 assert.equal(mesmaAgenda.ciclosReaisConcluidos,0);
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
  /luzes · \d+ ciclos completos · Sem pagamento real/);
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

test('21/11 17h até 22/11 00h20: 338 giros do relógio, 56 ciclos e 2/6; sem pagamentos',()=>{
 const instante=Date.parse('2026-11-22T00:20:00-03:00');
 const agenda=projetarAgendaTabuleiroCompartilhada({
  ...controle,agoraServidorMs:instante,girosHoje:0,giros24h:0,
  eventosNoCiclo:0,ciclosConcluidos:0
 });
 const operador=criarVisor('operador',agenda,instante);
 const cliente=criarVisor('cliente',agenda,instante);
 for(const painel of [operador,cliente]){
  assert.equal(painel.loop03Giros24Integrado.textContent,'338');
  assert.equal(painel.loop03NumeroIntegrado.textContent,'2 / 6');
  assert.match(painel.loop03StatusPosicao.textContent,
   /Relógio: 338\/600 luzes · 56 ciclos completos · Sem pagamento real/);
  assert.equal(agenda.girosReaisHoje,0);
  assert.equal(agenda.eventosReaisNoCiclo,0);
 }
});
test('ao fechar o turno da noite a contagem visual fica em 600 e não zera',()=>{
 const instante=Date.parse('2026-11-22T06:00:00-03:00');
 const agenda=projetarAgendaTabuleiroCompartilhada({
  ...controle,agoraServidorMs:instante
 });
 const painel=criarVisor('operador',agenda,instante);
 assert.equal(painel.loop03Giros24Integrado.textContent,'600');
 assert.equal(painel.loop03NumeroIntegrado.textContent,'6 / 6');
 assert.match(painel.loop03StatusPosicao.textContent,/100 ciclos completos/);
 assert.equal(painel.tituloRelogioTabuleiro.textContent,'TURNO ENCERRADO');
});
