'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const codigo=fs.readFileSync(path.join(__dirname,
 '../src/producao/interface-aprovada-contas.js'),'utf8');
const inicio=codigo.indexOf(' let placarClienteConsultando=false;');
const fim=codigo.indexOf(' function prepararAbasMotor(){',inicio);
assert.ok(inicio>=0&&fim>inicio,'encontrar rotinas reais de placar');
const rotinas=codigo.slice(inicio,fim);

function cenario(){
 const elementos=Object.fromEntries([
  'painelConta','loop03TotalIntegrado','loop03Giros24Integrado',
  'loop03NumeroIntegrado'
 ].map(id=>[id,{hidden:id==='painelConta'?false:null,textContent:'—'}]));
 const agenda={
  origem:'CATRACA_REAL_MESMO_SQLITE',somenteLeitura:true,
  luzesDoRelogioCompartilhado:true,girosReaisHora:2,
  luzesRelogio24h:6,ciclosRelogio24h:1,
  girosReaisHoje:2,girosReais24h:2,eventosReaisNoCiclo:3,
  luzesRelogio24h:8,ciclosRelogio24h:1,
  ciclosReaisConcluidos:0
 };
 const motor={
  fonte:'IDENTIDADE_E_MOTOR_MESMO_SQLITE',financeiroReal:false,
  filaA:1,filaB:1,tabuleiro:{eventosNoCiclo:3,ciclosConcluidos:0},
  catraca:{giros:2}
 };
 const controle={
  financeiroReal:false,agenda,girosHoje:2,giros24h:2,
  girosTotais:2,filaA:1,filaB:1,
  luzesRelogio24h:8,ciclosRelogio24h:1
 };
 const cliente={
  ...motor,somenteLeitura:true,financeiroReal:false,
  minhasPosicoes:[],limitePosicoesAtivas:10,agenda
 };
 const chamadas=[],visores=[];
 const contexto={
  modoOperadorAtual:false,
  popupPosicoesRealAberto:false,
  posicoesResumoReal:[],posicaoSelecionada:'',
  posicaoResumoEscolhidaManualmente:false,
  '$':id=>elementos[id],
  atualizarTopoPosicaoReal:()=>{},
  preencherPopupReal:()=>{},
  fetch:async url=>{
   chamadas.push(url);
   const retorno={
    '/api/loop/estado':cliente,
    '/api/admin/loop/estado':motor,
    '/api/admin/loop/controle':controle
   }[url];
   return {ok:!!retorno,json:async()=>retorno};
  },
  visorCatraca:{
   registrarAgenda:x=>visores.push(['agenda',x]),
   observar:(g,e)=>visores.push(['eventos',g,e])
  }
 };
 vm.runInNewContext(rotinas+'\nthis.atualizarCliente=atualizarPlacarCliente;'+
  '\nthis.atualizarOperador=atualizarPlacarOperador;',contexto);
 return {contexto,elementos,agenda,cliente,motor,controle,chamadas,visores};
}

test('cliente e operador mostram os mesmos ciclos visuais em 24h, sem inventar giro',async()=>{
 const x=cenario();
 await x.contexto.atualizarCliente();
 assert.equal(x.elementos.loop03Giros24Integrado.textContent,'1');
 assert.equal(x.elementos.loop03TotalIntegrado.textContent,'0 / 10');
 x.contexto.modoOperadorAtual=true;
 await x.contexto.atualizarOperador();
 assert.equal(x.elementos.loop03Giros24Integrado.textContent,'1');
 assert.equal(x.elementos.loop03TotalIntegrado.textContent,'2');
 assert.equal(x.elementos.loop03NumeroIntegrado.textContent,'3 / 6');
 assert.deepEqual(x.chamadas,[
  '/api/loop/estado','/api/admin/loop/estado','/api/admin/loop/controle'
 ]);
 assert.ok(x.visores.some(v=>v[0]==='eventos'&&v[1]===2&&v[2]===3));
 assert.equal(x.agenda.girosReaisHora,2);
});

test('atualizacao do relogio chega aos dois perfis sem recriar tela',async()=>{
 const x=cenario();
 await x.contexto.atualizarCliente();
 x.agenda.luzesRelogio24h=12;x.agenda.ciclosRelogio24h=2;
 x.agenda.girosReaisHora=4;x.agenda.girosReaisHoje=4;
 x.agenda.girosReais24h=4;x.cliente.catraca.giros=4;
 x.motor.catraca.giros=4;x.controle.girosTotais=4;
 x.controle.girosHoje=4;x.controle.giros24h=4;
 await x.contexto.atualizarCliente();
 assert.equal(x.elementos.loop03Giros24Integrado.textContent,'1');
 x.contexto.modoOperadorAtual=true;
 await x.contexto.atualizarOperador();
 assert.equal(x.elementos.loop03Giros24Integrado.textContent,'1');
 assert.equal(x.elementos.loop03NumeroIntegrado.textContent,'3 / 6');
 assert.equal(x.visores.every(v=>v[0]==='eventos'||v[1]===x.agenda),true);
});

test('fonte divergente nao sobrescreve placar, e os perfis atualizam no temporizador',async()=>{
 const x=cenario();
 x.contexto.modoOperadorAtual=true;
 x.controle.filaB=15;
 await x.contexto.atualizarOperador();
 assert.equal(x.elementos.loop03Giros24Integrado.textContent,'—');
 assert.equal(x.visores.length,0);
 const inicioTemporizador=codigo.indexOf('window.setInterval(()=>{');
 const fimTemporizador=codigo.indexOf('},15000);',inicioTemporizador);
 assert.ok(inicioTemporizador>=0&&fimTemporizador>inicioTemporizador);
 const tick=codigo.slice(inicioTemporizador,fimTemporizador);
 assert.match(tick,/void atualizarPlacarOperador\(\)/);
 assert.match(tick,/void atualizarPlacarCliente\(\)/);
 assert.doesNotMatch(rotinas,/method:'POST'|executarGiro\(|registrarCompra\(/);
});
