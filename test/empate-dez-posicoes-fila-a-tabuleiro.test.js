'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {SimuladorLoop}=require('../src/domain/simulador-loop');

test('dez posicoes do mesmo titular empatadas com trinta indicacoes aguardam sem perder prioridade ou violar duas no tabuleiro',()=>{
 const sim=new SimuladorLoop({relogio:()=> '2026-10-23T12:00:00.000Z'});
 for(let i=0;i<7;i++)sim.registrarPosicaoSimulada({participanteId:'base-'+i,vendaId:'base-'+i});
 sim.prepararTabuleiro();
 const ids=Array.from({length:10},(_,i)=>sim.registrarPosicaoSimulada({participanteId:'titular-empate',vendaId:'titular-'+i}).posicao.id);
 for(let i=0;i<10;i++)for(let j=0;j<30;j++)sim.registrarIndicacaoSimulada({indicadorId:'titular-empate',posicaoAlvoId:ids[i],eventoId:'convite-'+i+'-'+j,convidouEm:'2026-10-23T12:00:00.000Z'});
 assert.equal(sim.filas.filaA.filter(p=>p.participanteId==='titular-empate').length,10);
 assert.deepEqual(sim.filas.filaA.filter(p=>p.participanteId==='titular-empate').map(p=>p.id),ids);
 // Cem concorrentes, cada um com 0 a 29 indicacoes: nenhum supera as dez posicoes empatadas em 30.
 for(let i=0;i<100;i++){
  const id='concorrente-'+i;
  const p=sim.registrarPosicaoSimulada({participanteId:id,vendaId:id}).posicao;
  for(let n=0;n<i%30;n++)sim.registrarIndicacaoSimulada({indicadorId:id,posicaoAlvoId:p.id,eventoId:'concorrente-convite-'+i+'-'+n,convidouEm:'2026-10-23T12:00:00.000Z'});
 }
 assert.equal(sim.filas.filaA.filter(p=>p.participanteId==='titular-empate').length,10);
 assert.ok(sim.filas.filaA.filter(p=>p.participanteId!=='titular-empate').every(p=>p.indicacoesVinculadas<30));
 assert.ok(sim.filas.filaB.length>0,'fila B deve permanecer disponivel');
 const origens=[];
 for(let giro=1;giro<=20;giro++){
  for(let venda=1;venda<=6;venda++)sim.registrarVendaNoCicloSimulada({vendaId:'giro-'+giro+'-venda-'+venda});
  sim.abrirCatraca();const resultado=sim.tentarGiro();assert.equal(resultado.girou,true);sim.pausarCatraca();
  if(resultado.novaPosicao6)origens.push(resultado.novaPosicao6.origemFila);
  const ocupantes=[sim.tabuleiro.centro,...sim.tabuleiro.vagas].filter(Boolean);
  assert.ok(ocupantes.filter(p=>p.participanteId==='titular-empate').length<=2,'maximo duas posicoes do titular no tabuleiro');
  const rastreaveis=[...sim.filas.filaA,...sim.filas.filaB,...ocupantes,...sim.tabuleiro.ciclosConcluidos.map(c=>c.centro)].filter(Boolean);
  assert.ok(ids.every(id=>rastreaveis.some(p=>p.id===id)),'nenhuma posicao desaparece');
  assert.ok(sim.filas.filaA.filter(p=>p.participanteId==='titular-empate').every(p=>p.indicacoesVinculadas===30),'indicacoes preservadas');
 }
 assert.ok(origens.includes('A'),'fila A deve abastecer o tabuleiro');
 assert.ok(origens.includes('B'),'fila B deve abastecer o tabuleiro');
 assert.deepEqual(origens.slice(0,8),['A','A','A','B','A','A','A','B'],'alternancia 3A/1B nas oito primeiras entradas');
});
