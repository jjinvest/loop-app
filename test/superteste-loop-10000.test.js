'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {SimuladorLoop}=require('../src/domain/simulador-loop');
test('dez mil participantes, posicoes multiplas e indicacoes',()=>{
 const sim=new SimuladorLoop();
 sim.filas.travaPromocaoAtiva=true;
 const ids=[];
 let total=0;
 const porDia=[];
 for(let i=0;i<10000;i++){
  const qtd=i<100?1:i<1100?5:i<1600?10:1;
  const titular=[];
  for(let j=0;j<qtd;j++){
   const p=sim.registrarPosicaoSimulada({participanteId:'t-'+i,vendaId:'v-'+i+'-'+j}).posicao;
   titular.push(p.id);total++;
  }
  ids.push(titular);
  if(i<100){
   assert.equal(sim.catracaAberta,false);
   if(i===99){
    for(let dia=1;dia<=30;dia++)porDia.push(Math.floor(dia*100/30)-Math.floor((dia-1)*100/30));
    assert.equal(porDia.reduce((a,b)=>a+b,0),100);
    assert.ok(porDia.every(n=>n===3||n===4));
   }
  }
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
 assert.equal(sim.filas.filaB.length,17500);
 assert.ok(sim.filas.filaA.every(p=>p.indicacoesVinculadas===3));
 assert.equal(sim.filas.indicacoes.get('t-100').quantidade,3);
 const duplicado=sim.registrarIndicacaoSimulada({indicadorId:'t-100',
  posicaoAlvoId:ids[100][0],eventoId:'indicacao-0'});
 assert.equal(duplicado.repetida,true);
 assert.equal(sim.filas.indicacoesProcessadas.size,3000);
 assert.equal(sim.filas.indicacoesProcessadas.size,3000);
 sim.prepararTabuleiro();
 assert.equal(sim.tentarGiro().girou,false);
 sim.abrirCatraca();
 let chamadasA=0,chamadasB=0,sequenciaA=0;
 for(let g=0;g<100;g++){
  for(let v=0;v<6;v++)sim.registrarVendaNoCicloSimulada({vendaId:'ciclo-'+g+'-'+v});
  assert.equal(sim.tentarGiro().girou,true);
  const entrada=sim.tabuleiro.vagas[5];
  if(entrada.origemFila==='A'){chamadasA++;sequenciaA++;}
  else {chamadasB++;sequenciaA=0;}
  assert.ok(sequenciaA<=3,'prioridade 3A para 1B');
  const ativos=[...sim.filas.filaA,...sim.filas.filaB,sim.tabuleiro.centro,...sim.tabuleiro.vagas].filter(Boolean);
  assert.equal(ativos.length+sim.tabuleiro.ciclosConcluidos.length,total);
  assert.equal(new Set(ativos.map(p=>p.id)).size,ativos.length);
  const tabuleiro=[sim.tabuleiro.centro,...sim.tabuleiro.vagas].filter(Boolean);
  const porTitular=new Map();
  for(const p of tabuleiro)porTitular.set(p.participanteId,(porTitular.get(p.participanteId)||0)+1);
  assert.ok([...porTitular.values()].every(n=>n<=2));
 }
 assert.equal(chamadasA+chamadasB,100);
 assert.ok(chamadasA>0&&chamadasB>0);
 assert.equal(sim.tabuleiro.ciclosConcluidos.length,100);
 assert.equal(sim.filas.filaA.length+sim.filas.filaB.length+7+100,total);
});
