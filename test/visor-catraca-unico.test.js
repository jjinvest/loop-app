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
test('visor nao celebra sem giro confirmado nem inventa venda',()=>{
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
 let intervalos=0;
 const context={window:{matchMedia:()=>({matches:true}),
  setInterval:()=>{intervalos++;return 1;},
  setTimeout:()=>1,clearTimeout:()=>{}} ,
  document:{hidden:false,createElement:()=>({className:'',textContent:'',
   style:{setProperty(){}},classList:{add(){},remove(){}}})},
  setInterval:()=>{intervalos++;return 1;},
  setTimeout:()=>1,clearTimeout:()=>{},Date,Math,
  Number,String,Object};
 vm.runInNewContext(ler('shared/visor-catraca.js'),context);
 const visor=context.window.LoopVisorCatraca.criar({
  elemento:id=>elements[id]
 });
 visor.iniciar();visor.iniciar();
 assert.equal(intervalos,1);
 visor.observar(5,0);
 assert.equal(area.children.length,0);
 const agora=Date.now();
 visor.registrarAgenda({modoExecucao:'AGENDADA',
  dentroDoHorario:true,pausaManual:false,
  agoraServidorMs:agora,proximaLuzPrevistaEmMs:agora+540000,
  metaLotes:{ativa:true,quantidade:10,
   intervaloLuzSegundos:540,proximaLuzPrevistaEmMs:agora+540000}
 });
 assert.match(elements.relogioTabuleiroIntegrado.textContent,/^0[89]:[0-5][0-9]$/);
 assert.match(elements.estadoRelogioTabuleiro.textContent,/depende de vendas/);
 assert.equal(area.children.length,0);
 visor.observar(6,0);
 assert.equal(area.children.length,1,'somente selo, sem confete para reduzir movimento');
 assert.match(area.children[0].textContent,/CICLO CONCLUÍDO/);
 visor.observar(6,0);assert.equal(area.children.length,1);
 context.document.hidden=true;
 visor.observar(7,0);assert.equal(area.children.length,1);
 visor.registrarAgenda({modoExecucao:'STOP'});
 assert.equal(elements.relogioTabuleiroIntegrado.textContent,'--:--');
 assert.equal(elements.tituloRelogioTabuleiro.textContent,'CATRACA PAUSADA');
 assert.equal(mensagens.length,0);
});
