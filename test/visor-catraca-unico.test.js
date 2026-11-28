'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {renderizarInterfaceAprovada}=
 require('../src/producao/interface-aprovada-loop');
const base=path.resolve(__dirname,'../src');
const ler=p=>fs.readFileSync(path.join(base,p),'utf8');
test('um visor JS serve preview e conta definitiva com a mesma fonte',()=>{
 const original=ler('candidato/checkout-candidato-ui.html');
 const real=renderizarInterfaceAprovada();
 assert.match(original,/src="\/staging\/assets\/catraca-visor.js" defer/);
 assert.match(real,/src="\/identidade\/assets\/catraca-visor.js" defer/);
 for(const [documento,rota] of [
  [original,'\/staging\/assets\/catraca-visor.js'],
  [real,'\/identidade\/assets\/catraca-visor.js']
 ]){
  assert.ok(documento.indexOf(rota)<documento.indexOf('cliente.js'),
   'visor carregado antes do cliente');
 }
 const preview=ler('candidato/checkout-candidato-ui.js');
 const definitive=ler('producao/interface-aprovada-contas.js');
 for(const fonte of [preview,definitive]){
  assert.match(fonte,/LoopVisorCatraca\.criar/);
  assert.match(fonte,/visorCatraca\.registrarAgenda/);
  assert.match(fonte,/visorCatraca\.observar/);
  assert.doesNotMatch(fonte,/function atualizarMarcadorCatraca\(/);
  assert.doesNotMatch(fonte,/function festejarGiroCatraca\(/);
 }
 const source=ler('shared/visor-catraca.js');
 assert.match(source,/function atualizarMarcadorCatraca\(/);
 assert.match(source,/function festejarGiroCatraca\(/);
 assert.doesNotMatch(source,/fetch\(/);
});
test('visor celebra somente os tres eventos novos do titular, sem inventar venda',()=>{
 const mensagens=[],area={children:[],
  replaceChildren(){this.children=[];},
  appendChild(p){this.children.push(p);}
 };
 const elements={
  relogioTabuleiroIntegrado:{textContent:''},
  tituloRelogioTabuleiro:{textContent:''},
  estadoRelogioTabuleiro:{textContent:''},
  celebracaoGiroCatraca:area,
  conteudoTabuleiro:{hidden:false}
 };
 let intervalos=0,encerrarFesta=null;
 const context={window:{matchMedia:()=>({matches:true}),
  setInterval:()=>{intervalos++;return 1;},
  setTimeout:()=>1,clearTimeout:()=>{}} ,
  document:{hidden:false,createElement:()=>({className:'',textContent:'',
   style:{setProperty(){}},classList:{add(){},remove(){}}})},
  setInterval:()=>{intervalos++;return 1;},
  setTimeout:(fn,ms)=>{if(ms===1450)encerrarFesta=fn;return 1;},clearTimeout:()=>{},Date,Math,
  Number,String,Object};
 vm.runInNewContext(ler('shared/visor-catraca.js'),context);
 const visor=context.window.LoopVisorCatraca.criar({
  elemento:id=>elements[id]
 });
 visor.iniciar();visor.iniciar();
 assert.equal(intervalos,1);
 const origem={centro:{numero:123,dourada:false},fonte:'OPERADOR'};
 visor.observar(5,0,origem);
 assert.equal(area.children.length,0);
 const agora=Date.now();
 visor.registrarAgenda({modoExecucao:'AGENDADA',
  dentroDoHorario:true,pausaManual:false,
  agoraServidorMs:agora,proximaLuzPrevistaEmMs:agora+540000,
  metaLotes:{ativa:true,quantidade:10,
   intervaloLuzSegundos:540,proximaLuzPrevistaEmMs:agora+540000}
 });
 assert.match(elements.relogioTabuleiroIntegrado.textContent,/^0[89]:[0-5][0-9]$/);
 assert.equal(elements.estadoRelogioTabuleiro.textContent,'Eventos: 0/6 luzes · 0/60 luzes');
 assert.equal(area.children.length,0);
 for(let i=1;i<=6;i++){
  visor.observar(5,i,origem);
  if(i%2===1){
   assert.equal(area.children.length,1);
   assert.match(area.children[0].textContent,new RegExp(((i+1)/2)+'º EVENTO DO TITULAR'));
   encerrarFesta();
   visor.observar(5,i,origem);
  }
  assert.equal(area.children.length,0);
 }
 visor.observar(6,0,origem);
 assert.equal(area.children.length,0,'giro sem nova contemplacao');
 const dourada={centro:{numero:321,dourada:true},fonte:'OPERADOR'};
 visor.observar(6,0,dourada);visor.observar(6,5,dourada);
 assert.equal(area.children.length,0);
 context.document.hidden=true;
 visor.observar(7,0,origem);assert.equal(area.children.length,0);
 visor.registrarAgenda({modoExecucao:'STOP'});
 assert.equal(elements.relogioTabuleiroIntegrado.textContent,'--:--');
 assert.equal(elements.tituloRelogioTabuleiro.textContent,'CATRACA PAUSADA');
 assert.equal(mensagens.length,0);
});

test('contador do OPERADOR renderiza 90 min por luz em um centro sem criar evento',()=>{
 const agora=Date.parse('2026-11-20T09:00:00-03:00');
 const FakeDate=class extends Date{static now(){return agora;}};
 const elementos={
  relogioTabuleiroIntegrado:{textContent:''},
  tituloRelogioTabuleiro:{textContent:''},
  estadoRelogioTabuleiro:{textContent:''},
  conteudoTabuleiro:{hidden:false}
 };
 const context={window:{setInterval:()=>1,matchMedia:()=>({matches:true})},
  document:{hidden:false},Date:FakeDate,Math,Number,String,Object};
 vm.runInNewContext(ler('shared/visor-catraca.js'),context);
 const visor=context.window.LoopVisorCatraca.criar({
  elemento:id=>elementos[id]
 });
 visor.registrarAgenda({
  modoExecucao:'AGENDADA',dentroDoHorario:true,pausaManual:false,
  agoraServidorMs:agora,
  abertura:'09:00',fechamento:'18:00',
  metaLotes:{ativa:true,quantidade:1,intervaloLuzSegundos:5400,
   proximaLuzPrevistaEmMs:agora+5400000,exigeCaixaReal:true}
 });
 assert.equal(elementos.relogioTabuleiroIntegrado.textContent,'90:00');
 assert.equal(elementos.estadoRelogioTabuleiro.textContent,'Eventos: 0/6 luzes · 0/6 luzes');
 assert.doesNotMatch(elementos.estadoRelogioTabuleiro.textContent,/depende de vendas/);
 visor.registrarAgenda({modoExecucao:'STOP',pausaManual:true});
 assert.equal(elementos.relogioTabuleiroIntegrado.textContent,'--:--');
 assert.equal(elementos.tituloRelogioTabuleiro.textContent,'CATRACA PAUSADA');
});

 test('visor do evento mantém os cálculos e usa os rótulos aprovados',()=>{
 const source=ler('shared/visor-catraca.js');
 assert.ok(source.includes("titulo.textContent='PRÓXIMA LUZ · EVENTO'"));
 assert.ok(source.includes("estado.textContent=legendaPublica(visual.luzes"));
 assert.ok(source.includes("meta?.quantidade>0?meta.quantidade*6:null"));
 });


test('visor do lote mostra 0/0 ao encerrar e preserva ciclos de hoje',()=>{
 const agora=Date.now();
 const elements=Object.fromEntries(['relogioTabuleiroIntegrado','tituloRelogioTabuleiro','estadoRelogioTabuleiro','loop03LuzesHoraIntegrado','loop03Giros24Integrado','loop03NumeroIntegrado'].map(id=>[id,{textContent:''}]));
 const context={window:{setInterval:()=>1},document:{hidden:false},Date,Math,Number,String,Object};
 vm.runInNewContext(ler('shared/visor-catraca.js'),context);
 const visor=context.window.LoopVisorCatraca.criar({elemento:id=>elements[id]});
 visor.registrarAgenda({fluxoControlado:{ativa:true,modo:'PROGRAMADO',eventos:2,total:8,metaCentrosDia:15,agoraServidorMs:agora,programacao:{encerrada:false,executadas:8,previstas:90},contadores:{eventosHoje:8,ciclosHoje:1}}});
 assert.equal(elements.loop03LuzesHoraIntegrado.textContent,'8 / 90');
 assert.equal(elements.loop03NumeroIntegrado.textContent,'2 / 6');
 visor.registrarAgenda({fluxoControlado:{ativa:true,modo:'PROGRAMADO',eventos:0,total:90,metaCentrosDia:15,agoraServidorMs:agora,programacao:{encerrada:true,executadas:0,previstas:0},contadores:{eventosHoje:90,ciclosHoje:15}}});
 assert.equal(elements.loop03LuzesHoraIntegrado.textContent,'0 / 0');
 assert.equal(elements.loop03Giros24Integrado.textContent,'15');
 assert.match(elements.estadoRelogioTabuleiro.textContent,/0\/0 luzes/);
 assert.equal(elements.tituloRelogioTabuleiro.textContent,'TURNO ENCERRADO');
});
