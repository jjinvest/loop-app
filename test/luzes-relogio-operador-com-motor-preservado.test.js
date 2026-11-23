'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');
const code=readFileSync(join(__dirname,'../src/shared/visor-catraca.js'),'utf8');
const interfaceReal=readFileSync(
 join(__dirname,'../src/producao/interface-aprovada-contas.js'),'utf8');
const css=readFileSync(
 join(__dirname,'../src/candidato/escritorio-cliente-integrado.css'),'utf8');
const cssOperador=readFileSync(
 join(__dirname,'../src/producao/acabamento-botoes-real.css'),'utf8');

function ambiente(hora='2026-11-21T09:00:00-03:00'){
 let agora=Date.parse(hora),tick=null,agendas=0;
 const FakeDate=class extends Date{static now(){return agora;}};
 function elemento(){
  const classes=new Set();
  return {textContent:'',hidden:false,offsetWidth:17,
   classList:{
    toggle(nome,flag){if(flag)classes.add(nome);else classes.delete(nome);},
    add(nome){classes.add(nome);},remove(nome){classes.delete(nome);},
    contains(nome){return classes.has(nome);}
   }};
 }
 const elements={
  relogioTabuleiroIntegrado:elemento(),
  tituloRelogioTabuleiro:elemento(),
  estadoRelogioTabuleiro:elemento(),
  motorContadorEventos:elemento(),
  conteudoTabuleiro:elemento(),
  ...Object.fromEntries(Array.from({length:6},(_,i)=>
   ['motorBolinha'+(i+1),elemento()]))
 };
 const ctx={
  window:{setInterval(cb,ms){assert.equal(ms,1000);tick=cb;agendas++;return 1;},
   matchMedia:()=>({matches:true})},
  document:{hidden:false},Date:FakeDate,Intl,Math,Number,String,Object,
  setTimeout:()=>1,clearTimeout:()=>{}
 };
 vm.runInNewContext(code,ctx,{timeout:2000});
 const visor=ctx.window.LoopVisorCatraca.criar({
  elemento:id=>elements[id]||null
 });
 const agenda=({
  modoExecucao='AGENDADA',abertura='09:00',fechamento='18:00',
  meta=5,dataAlvo=null,luzesDoRelogioOperador=true,
  eventosReaisNoCiclo=0
 }={})=>({
  modoExecucao,pausaManual:modoExecucao==='STOP',
  dentroDoHorario:true,abertura,fechamento,
  agoraServidorMs:agora,
  luzesDoRelogioOperador,eventosReaisNoCiclo,
  metaLotes:meta>0?{
   ativa:true,quantidade:meta,dataAlvo,
   intervaloLuzSegundos:1080,
   exigeCaixaReal:true,proximaLuzPrevistaEmMs:agora+1080000
  }:null
 });
 const luzes=()=>Array.from({length:6},(_,i)=>
  elements['motorBolinha'+(i+1)].classList.contains(
   'loop03-relogio-luz-visual'));
 const pulsando=()=>Array.from({length:6},(_,i)=>
  elements['motorBolinha'+(i+1)].classList.contains(
   'loop03-relogio-luz-atual'));
 const reais=()=>Array.from({length:6},(_,i)=>
  elements['motorBolinha'+(i+1)].classList.contains(
   'loop03-marcador-aceso'));
 const mover=h=>{
  agora=Date.parse(h);assert.equal(typeof tick,'function');tick();
 };
 return {visor,elements,agenda,luzes,pulsando,reais,mover,
  iniciar(){visor.iniciar();visor.iniciar();assert.equal(agendas,1);}};
}

test('operador: 5 contemplados entre 9h e 18h acendem 6 LEDs a cada 18 minutos',()=>{
 const x=ambiente();
 x.iniciar();
 x.visor.registrarAgenda(x.agenda());
 assert.deepEqual(x.luzes(),[false,false,false,false,false,false]);
 assert.equal(x.elements.relogioTabuleiroIntegrado.textContent,'18:00');
 assert.match(x.elements.estadoRelogioTabuleiro.textContent,/18 min\/luz/);
 x.mover('2026-11-21T09:17:59-03:00');
 assert.deepEqual(x.luzes(),[false,false,false,false,false,false]);
 x.mover('2026-11-21T09:18:00-03:00');
 assert.deepEqual(x.luzes(),[true,false,false,false,false,false]);
 assert.equal(x.elements.relogioTabuleiroIntegrado.textContent,'18:00');
 x.mover('2026-11-21T09:36:00-03:00');
 assert.deepEqual(x.luzes(),[true,true,false,false,false,false]);
 x.mover('2026-11-21T10:48:00-03:00');
 assert.deepEqual(x.luzes(),[true,true,true,true,true,true]);
 x.mover('2026-11-21T11:06:00-03:00');
 assert.deepEqual(x.luzes(),[true,false,false,false,false,false]);
 assert.match(x.elements.motorContadorEventos.textContent,
  /RELÓGIO DE PARTICIPAÇÃO DE LUCRO — EM ANDAMENTO/);
 assert.deepEqual(x.reais(),[true,false,false,false,false,false],
  'brilho original acompanha a luz do relógio, sem alterar o evento confirmado');
 assert.match(x.elements.motorContadorEventos.textContent,
  /RELÓGIO DE PARTICIPAÇÃO DE LUCRO — EM ANDAMENTO/);
});

test('horário diferente, pausa e modo manual limpam LEDs agendados',()=>{
 const x=ambiente('2026-11-21T08:00:00-03:00');
 x.iniciar();
 x.visor.registrarAgenda(x.agenda({
  abertura:'08:00',fechamento:'16:00',meta:5
 }));
 x.mover('2026-11-21T08:16:00-03:00');
 assert.deepEqual(x.luzes(),[true,false,false,false,false,false],
  '5 centros em 8h = 16min por luz');
 x.visor.registrarAgenda(x.agenda({modoExecucao:'STOP'}));
 assert.deepEqual(x.luzes(),[false,false,false,false,false,false]);
 assert.equal(x.elements.tituloRelogioTabuleiro.textContent,'CATRACA PAUSADA');
 x.visor.registrarAgenda(x.agenda({modoExecucao:'NATURAL'}));
 assert.deepEqual(x.luzes(),[false,false,false,false,false,false]);
 assert.equal(x.elements.tituloRelogioTabuleiro.textContent,'MODO MANUAL');
 x.visor.registrarAgenda(x.agenda({meta:0}));
 assert.deepEqual(x.luzes(),[false,false,false,false,false,false]);
});

test('sem agenda autenticada não acende LEDs; com agenda compartilhada cliente e operador veem o mesmo relógio',()=>{
 const x=ambiente('2026-11-21T09:36:00-03:00');
 x.iniciar();
 x.visor.registrarAgenda(x.agenda({luzesDoRelogioOperador:false}));
 assert.deepEqual(x.luzes(),[false,false,false,false,false,false]);
 assert.deepEqual(x.reais(),[false,false,false,false,false,false]);
 assert.doesNotMatch(code,/fetch\(/);
 assert.doesNotMatch(code,/registrarCompra|executarGiro|criarPosicao/);
 assert.match(interfaceReal,/controle\.agenda\?\.origem!=='CATRACA_REAL_MESMO_SQLITE'/);
 assert.match(interfaceReal,/visorCatraca\.registrarAgenda\(controle\.agenda\)/);
 assert.match(interfaceReal,/visorCatraca\.registrarAgenda\(d\.agenda\)/);
 const agendaComum=x.agenda({luzesDoRelogioOperador:false});
 agendaComum.luzesDoRelogioCompartilhado=true;
 agendaComum.girosReaisHoje=0;
 agendaComum.ciclosReaisConcluidos=0;
 x.visor.registrarAgenda(agendaComum);
 assert.deepEqual(x.luzes(),[true,true,false,false,false,false]);
 assert.match(x.elements.motorContadorEventos.textContent,
  /RELÓGIO DE PARTICIPAÇÃO DE LUCRO — EM ANDAMENTO/);
 assert.equal((interfaceReal.match(/\$\('motorContadorEventos'\)\.textContent=/g)||[]).length,0,
  'a mensagem do relógio tem um único responsável, sem sobrescrita do motor');
 assert.match(interfaceReal,/visualTabuleiro\.preencherLuzes\(d\.tabuleiro\.eventosNoCiclo\)/);

 assert.doesNotMatch(interfaceReal,/const metaAtiva=controle\.metaAplicavelHoje===true/,
  'data alvo do turno noturno deve ser avaliada pelo relógio local do servidor');
 assert.match(css,/loop03-marcador-aceso/);
});

test('turno 22h–02h atravessa meia-noite e respeita data da programação',()=>{
 const x=ambiente('2026-11-22T00:00:00-03:00');
 x.iniciar();
 x.visor.registrarAgenda(x.agenda({
  abertura:'22:00',fechamento:'02:00',
  meta:2,dataAlvo:'2026-11-21'
 }));
 assert.deepEqual(x.luzes(),[true,true,true,true,true,true]);
 x.mover('2026-11-22T00:20:00-03:00');
 assert.deepEqual(x.luzes(),[true,false,false,false,false,false]);
 x.mover('2026-11-22T02:00:00-03:00');
 assert.deepEqual(x.luzes(),[false,false,false,false,false,false]);
 assert.equal(x.elements.tituloRelogioTabuleiro.textContent,'TURNO ENCERRADO');
 assert.match(x.elements.estadoRelogioTabuleiro.textContent,/12\/12 do dia/);
 x.visor.registrarAgenda(x.agenda({
  abertura:'22:00',fechamento:'02:00',
  meta:2,dataAlvo:'2026-11-20'
 }));
 assert.deepEqual(x.luzes(),[false,false,false,false,false,false]);
});

test('a cada consulta ao servidor recupera a posição temporal sem criar giro',()=>{
 const x=ambiente('2026-11-21T11:06:00-03:00');
 x.iniciar();
 x.visor.registrarAgenda(x.agenda({meta:5,eventosReaisNoCiclo:3}));
 assert.deepEqual(x.luzes(),[true,false,false,false,false,false]);
 assert.match(x.elements.motorContadorEventos.textContent,
  /RELÓGIO DE PARTICIPAÇÃO DE LUCRO — EM ANDAMENTO/);
 x.visor.observar(0,3);
 x.visor.registrarAgenda(x.agenda({
  modoExecucao:'STOP',meta:5,eventosReaisNoCiclo:3
 }));
 assert.deepEqual(x.luzes(),[false,false,false,false,false,false]);
 assert.deepEqual(x.reais(),[true,true,true,false,false,false],
  'pausa mantém apenas os 3 eventos efetivamente contabilizados');
});

test('agenda de amanha fica registrada no operador sem prometer pagamento',()=>{
 const ini=interfaceReal.indexOf(' function dataAgendaOperador(d){');
 const fim=interfaceReal.indexOf(' // Mesmo painel de configuracao do relogio aprovado:',ini);
 assert.ok(ini>0&&fim>ini);
 const escopo={};
 vm.runInNewContext(interfaceReal.slice(ini,fim),escopo,{timeout:2000});
 const texto=escopo.textoAgendaOperador({
  modo:'AUTOMATICA',janelaInicio:'09:00',janelaFim:'12:00',
  metaCentrosDia:5,metaDataAlvo:'2026-11-22',hoje:'2026-11-21',
  horarioPermitido:false,autorizacaoFinanceiraDosGiros:false
 });
 assert.match(texto,/AGENDADA — AGUARDANDO DATA/);
 assert.match(texto,/22\/11\/2026 · 09:00–12:00/);
 assert.match(texto,/5 centros · 30 luzes/);
 assert.match(texto,/pagamentos e giros financeiros ainda não autorizados/);
 assert.match(interfaceReal,/mostrarAgendaOperador\(controle\)/);
 assert.match(interfaceReal,/limparAgendaOperador\(\)/);
});


test('o mesmo relogio real acende e pulsa uma luz de cada vez sem antecipar eventos',()=>{
 const x=ambiente('2026-11-22T08:59:59-03:00');
 x.iniciar();
 x.visor.registrarAgenda(x.agenda({
  abertura:'09:00',fechamento:'12:00',
  dataAlvo:'2026-11-22',meta:5,eventosReaisNoCiclo:0
 }));
 assert.deepEqual(x.pulsando(),[false,false,false,false,false,false]);
 x.mover('2026-11-22T09:06:00-03:00');
 assert.deepEqual(x.luzes(),[true,false,false,false,false,false]);
 assert.deepEqual(x.pulsando(),[true,false,false,false,false,false]);
 assert.match(x.elements.motorContadorEventos.textContent,/RELÓGIO DE PARTICIPAÇÃO DE LUCRO — EM ANDAMENTO/);
 x.mover('2026-11-22T09:12:00-03:00');
 assert.deepEqual(x.luzes(),[true,true,false,false,false,false]);
 assert.deepEqual(x.pulsando(),[false,true,false,false,false,false]);
 x.mover('2026-11-22T09:36:00-03:00');
 assert.deepEqual(x.luzes(),[true,true,true,true,true,true]);
 assert.deepEqual(x.pulsando(),[false,false,false,false,false,true]);
 x.mover('2026-11-22T09:42:00-03:00');
 assert.deepEqual(x.luzes(),[true,false,false,false,false,false]);
 assert.deepEqual(x.pulsando(),[true,false,false,false,false,false]);
 x.mover('2026-11-22T12:00:00-03:00');
 assert.deepEqual(x.pulsando(),[false,false,false,false,false,false]);
 x.visor.registrarAgenda(x.agenda({
  abertura:'09:00',fechamento:'12:00',
  dataAlvo:'2026-11-23',meta:5
 }));
 assert.deepEqual(x.pulsando(),[false,false,false,false,false,false],
  'a programação de outro dia não acende as luzes');
 assert.match(cssOperador,/loop03-relogio-luz-ativa/);
 assert.doesNotMatch(css,/loop03-relogio-luz-ativa/,
  'as telas do cliente nao podem receber animacao do operador');
 assert.doesNotMatch(code,/executarGiro|registrarCompra|provisionar|creditarSaldo/);
});
