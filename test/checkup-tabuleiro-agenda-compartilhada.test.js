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
 eventosNoCiclo:0,ciclosConcluidos:0,girosHoje:0,girosHora:0,giros24h:0,
 luzesRelogio24h:0,ciclosRelogio24h:0
};
function criarVisor(visao,agenda,instante=agora){
 const e={
  relogioTabuleiroIntegrado:{textContent:''},
  tituloRelogioTabuleiro:{textContent:''},
  estadoRelogioTabuleiro:{textContent:''},
  motorContadorEventos:{textContent:''},
  loop03NumeroIntegrado:{textContent:visao==='cliente'?'—':'0 / 6'},
  loop03Giros24Integrado:{textContent:'0'},
  loop03LuzesHoraIntegrado:{textContent:'—'},
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
test('operador e cliente recebem o mesmo cronômetro e ciclos representativos sem pagamentos',()=>{
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
  /Eventos: [0-6]\/6 luzes/);
 assert.equal(cliente.loop03StatusPosicao.textContent,'',
  'nenhuma informacao do relogio deve sobrescrever a posicao do cliente');
 assert.equal(op.loop03StatusPosicao.textContent,'');
 assert.equal(cliente.loop03Giros24Integrado.textContent,
  String(Math.floor(Number(cliente.loop03LuzesHoraIntegrado.textContent.split(' / ')[0])/6)));
 assert.match(cliente.loop03LuzesHoraIntegrado.textContent,/^\d+ \/ 600$/);
 assert.equal(cliente.motorContadorEventos.textContent,
  'RELÓGIO DE PARTICIPAÇÃO DE LUCRO — EM ANDAMENTO');
 assert.equal(mesmaAgenda.eventosReaisNoCiclo,0);
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

test('21/11 17h até 22/11 00h20: 338 luzes do relógio, 56 ciclos e 2/6; sem pagamentos',()=>{
 const instante=Date.parse('2026-11-22T00:20:00-03:00');
 const agenda=projetarAgendaTabuleiroCompartilhada({
  ...controle,agoraServidorMs:instante,girosHoje:0,giros24h:0,
  eventosNoCiclo:0,ciclosConcluidos:0,
  luzesRelogio24h:338,ciclosRelogio24h:56
 });
 const operador=criarVisor('operador',agenda,instante);
 const cliente=criarVisor('cliente',agenda,instante);
 assert.equal(operador.loop03Giros24Integrado.textContent,'56');
 assert.equal(operador.loop03LuzesHoraIntegrado.textContent,'338 / 600');
 assert.equal(operador.loop03NumeroIntegrado.textContent,'2 / 6');
 assert.equal(operador.loop03StatusPosicao.textContent,'');
 assert.equal(cliente.loop03Giros24Integrado.textContent,'56');
 assert.equal(cliente.loop03LuzesHoraIntegrado.textContent,'338 / 600');
 assert.equal(cliente.loop03NumeroIntegrado.textContent,'—');
 assert.equal(cliente.loop03StatusPosicao.textContent,'');
 assert.equal(agenda.girosReaisHoje,0);
 assert.equal(agenda.eventosReaisNoCiclo,0);
});
test('ao fechar o turno da noite a contagem visual fica em 600 e não zera',()=>{
 const instante=Date.parse('2026-11-22T06:00:00-03:00');
 const agenda=projetarAgendaTabuleiroCompartilhada({
  ...controle,agoraServidorMs:instante,
  luzesRelogio24h:600,ciclosRelogio24h:100
 });
 const painel=criarVisor('operador',agenda,instante);
 assert.equal(painel.loop03Giros24Integrado.textContent,'100');
 assert.equal(painel.loop03LuzesHoraIntegrado.textContent,'600 / 600');
 assert.equal(painel.loop03NumeroIntegrado.textContent,'6 / 6');
 assert.equal(painel.loop03StatusPosicao.textContent,'');
 assert.equal(painel.tituloRelogioTabuleiro.textContent,'TURNO ENCERRADO');
});

test('621 luzes antigas não contaminam os ciclos representativos da meta atual',()=>{
 const instante=Date.parse('2026-11-22T15:45:00-03:00');
 const agenda=projetarAgendaTabuleiroCompartilhada({
  ...controle,janelaInicio:'09:00',janelaFim:'18:00',
  metaCentrosDia:10,metaDataAlvo:'2026-11-22',
  agoraServidorMs:instante,giros24h:0,ciclosConcluidos:0,
  luzesRelogio24h:621,ciclosRelogio24h:103
 });
 const op=criarVisor('operador',agenda,instante);
 const cli=criarVisor('cliente',agenda,instante);
 assert.equal(op.loop03Giros24Integrado.textContent,'7',
  '45 luzes do turno fazem sete ciclos completos representativos');
 assert.equal(op.loop03LuzesHoraIntegrado.textContent,'45 / 60',
  'usar as 45 luzes do turno vigente, não 621 de outros turnos');
 assert.equal(op.loop03NumeroIntegrado.textContent,'3 / 6');
 assert.equal(op.loop03StatusPosicao.textContent,'');
 assert.equal(cli.loop03Giros24Integrado.textContent,'7');
 assert.equal(cli.loop03LuzesHoraIntegrado.textContent,'45 / 60');
 assert.equal(cli.loop03StatusPosicao.textContent,'');
 assert.equal(agenda.ciclosRelogio24h,103,
  'o histórico permanece disponível à auditoria, sem contaminar o visor');
 assert.equal(agenda.girosReais24h,0);
});
test('ciclos representativos não alteram giro real auditado',()=>{
 const instante=Date.parse('2026-11-22T15:45:00-03:00');
 const agenda=projetarAgendaTabuleiroCompartilhada({
  ...controle,janelaInicio:'09:00',janelaFim:'18:00',
  metaCentrosDia:10,metaDataAlvo:'2026-11-22',
  agoraServidorMs:instante,giros24h:2,ciclosConcluidos:2,
  luzesRelogio24h:621,ciclosRelogio24h:103
 });
 const op=criarVisor('operador',agenda,instante);
 const cli=criarVisor('cliente',agenda,instante);
 assert.equal(op.loop03Giros24Integrado.textContent,'7');
 assert.equal(cli.loop03Giros24Integrado.textContent,'7');
 assert.equal(agenda.girosReais24h,2);
 assert.equal(op.loop03LuzesHoraIntegrado.textContent,'45 / 60');
 assert.equal(op.loop03StatusPosicao.textContent,'');
});

test('48/60 luzes = 8 ciclos representativos nos dois perfis, sem contemplação',()=>{
 const instante=Date.parse('2026-11-22T16:12:00-03:00');
 const agenda=projetarAgendaTabuleiroCompartilhada({
  ...controle,janelaInicio:'09:00',janelaFim:'18:00',
  metaCentrosDia:10,metaDataAlvo:'2026-11-22',
  agoraServidorMs:instante,giros24h:0,ciclosConcluidos:0,
  luzesRelogio24h:621,ciclosRelogio24h:103
 });
 const op=criarVisor('operador',agenda,instante);
 const cli=criarVisor('cliente',agenda,instante);
 for(const painel of [op,cli]){
  assert.equal(painel.loop03Giros24Integrado.textContent,'8');
  assert.equal(painel.loop03LuzesHoraIntegrado.textContent,'48 / 60');
 }
 assert.equal(op.loop03NumeroIntegrado.textContent,'6 / 6');
 assert.equal(op.loop03StatusPosicao.textContent,'');
 assert.equal(cli.loop03StatusPosicao.textContent,'');
 assert.equal(agenda.girosReais24h,0,
  'o indicador visual nao gera giro financeiro');
 assert.equal(agenda.ciclosReaisConcluidos,0,
  'o indicador visual nao gera contemplacao');
 assert.equal(agenda.financeiroReal,false);
});

test('placar superior e inferior usam 48 luzes do dia, nao janela movel de 24h',()=>{
 const instante=Date.parse('2026-11-22T15:45:00-03:00');
 const agenda=projetarAgendaTabuleiroCompartilhada({
  ...controle,janelaInicio:'09:00',janelaFim:'18:00',
  metaCentrosDia:10,metaDataAlvo:'2026-11-22',
  agoraServidorMs:instante,giros24h:0,ciclosConcluidos:0,
  luzesRelogioHoje:48,ciclosRelogioHoje:8,
  luzesRelogio24h:42,ciclosRelogio24h:7,
  luzesRelogioAcumuladas:766,ciclosRelogioAcumulados:127
 });
 const operador=criarVisor('operador',agenda,instante);
 const cliente=criarVisor('cliente',agenda,instante);
 for(const painel of [operador,cliente]){
  assert.equal(painel.loop03Giros24Integrado.textContent,'8');
  assert.equal(painel.loop03LuzesHoraIntegrado.textContent,'48 / 60');
 }
 assert.equal(operador.loop03NumeroIntegrado.textContent,'6 / 6');
 assert.equal(agenda.luzesRelogioAcumuladas,766);
 assert.equal(agenda.ciclosRelogioAcumulados,127);
 assert.equal(agenda.girosReaisHoje,0);
 assert.equal(agenda.financeiroReal,false);
});

test('agenda salva no SQLite reaparece nos dois visores antes de abrir, durante e após meia-noite',t=>{
 const {DatabaseSync}=require('node:sqlite');
 const {OperacaoCatracaAdminSQLite}=require('../src/producao/operacao-catraca-admin-sqlite');
 const banco=new DatabaseSync(':memory:');
 t.after(()=>banco.close());
 let instante=Date.parse('2026-11-26T08:00:00-03:00');
 const motor={banco,_transacao:fn=>{
  banco.exec('BEGIN IMMEDIATE');
  try{const r=fn(null);banco.exec('COMMIT');return r;}
  catch(e){banco.exec('ROLLBACK');throw e;}
 },consultar:()=>({tabuleiro:{eventosNoCiclo:0,ciclosConcluidos:0},
  catraca:{giros:0},filaA:0,filaB:0})};
 const novo=()=>new OperacaoCatracaAdminSQLite({banco,motor,
  agora:()=>new Date(instante)});
 let c=novo();
 const salvar=(inicio,fim,data)=>c.configurar({modo:'AUTOMATICA',
  janelaInicio:inicio,janelaFim:fim,metaCentrosDia:5,
  metaDataAlvo:data,limiteDiario:null,revisaoEsperada:c.consultar().revisao,
  motivo:'VERIFICAR_PROGRAMACAO_SALVA'});
 const conferir=(esperado,horario)=>{
  // Nova instância relê a gravação; o visor não recebe o formulário.
  c=novo();
  const estado=c.consultar(),agenda=projetarAgendaTabuleiroCompartilhada(estado);
  for(const perfil of ['operador','cliente']){
   const painel=criarVisor(perfil,agenda,instante);
   assert.equal(painel.relogioTabuleiroIntegrado.textContent,esperado);
   assert.match(painel.estadoRelogioTabuleiro.textContent,/Eventos: [0-6]\/6 luzes.*\/30 luzes/);
   assert.doesNotMatch(painel.estadoRelogioTabuleiro.textContent,horario);
   assert.ok(horario.source.endsWith(estado.janelaInicio+'–'+estado.janelaFim),'horários persistidos permanecem na configuração');
   if(estado.metaDataAlvo)assert.match(painel.estadoRelogioTabuleiro.textContent,new RegExp(estado.metaDataAlvo));
  }
  assert.equal(estado.girosTotais,0);
  assert.equal(estado.eventosNoCiclo,0);
  assert.equal(estado.autorizacaoFinanceiraDosGiros,false);
  return estado;
 };
 salvar('09:00','18:00','2026-11-26');
 conferir('78:00',/09:00–18:00/); // primeira luz às 09:18
 instante=Date.parse('2026-11-26T09:05:00-03:00');
 const dia=conferir('13:00',/09:00–18:00/);
 assert.equal(dia.proximaLuzPrevistaEmMs,Date.parse('2026-11-26T09:18:00-03:00'));
 salvar('22:00','02:00','2026-11-26');
 instante=Date.parse('2026-11-27T00:01:00-03:00');
 const noite=conferir('07:00',/22:00–02:00/);
 assert.equal(noite.metaAplicavelHoje,true);
 assert.equal(noite.proximaLuzPrevistaEmMs,Date.parse('2026-11-27T00:08:00-03:00'));
 instante=Date.parse('2026-11-27T08:00:00-03:00');
 salvar('09:00','18:00','2026-11-28');
 conferir('1518:00',/2026-11-28 · 09:00–18:00/);
});
