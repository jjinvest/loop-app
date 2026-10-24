'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {SimuladorLoop}=require('../src/domain/simulador-loop');
test('dez mil participantes, posicoes multiplas e indicacoes',()=>{
 const sim=new SimuladorLoop();
 sim.filas.travaPromocaoAtiva=true;
 const ids=[];
 let total=0;
 for(let i=0;i<10000;i++){
  const qtd=i<100?1:i<1100?5:i<1600?10:1;
  const titular=[];
  for(let j=0;j<qtd;j++){
   const p=sim.registrarPosicaoSimulada({participanteId:'t-'+i,vendaId:'v-'+i+'-'+j}).posicao;
   titular.push(p.id);total++;
  }
  ids.push(titular);
  if(i<100)assert.equal(sim.catracaAberta,false);
 }
 assert.equal(total,18500);
 assert.equal(sim.filas.filaB.length,total);
 assert.equal(sim.tentarGiro().girou,false);
 for(let i=0;i<3000;i++){
  const n=100+i%1000;
  const r=sim.registrarIndicacaoSimulada({indicadorId:'t-'+n,
   posicaoAlvoId:ids[n][0],eventoId:'indicacao-'+i});
  assert.equal(r.repetida,false);
 }
 assert.equal(sim.filas.filaA.length,1000);
 assert.equal(sim.filas.indicacoesProcessadas.size,3000);
 sim.prepararTabuleiro();
 assert.equal(sim.tentarGiro().girou,false);
 sim.abrirCatraca();
 for(let g=0;g<100;g++){
  for(let v=0;v<6;v++)sim.registrarVendaNoCicloSimulada({vendaId:'ciclo-'+g+'-'+v});
  assert.equal(sim.tentarGiro().girou,true);
 }
 assert.equal(sim.tabuleiro.ciclosConcluidos.length,100);
 assert.equal(sim.filas.filaA.length+sim.filas.filaB.length+7+100,total);
});
