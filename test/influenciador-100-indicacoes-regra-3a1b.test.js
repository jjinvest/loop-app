'use strict';

// Regra aprovada: titular com varias posicoes pode concentrar indicacoes,
// mas nunca contorna a proporcao global tres A / uma B ao abastecer a vaga 6.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {SimuladorLoop}=require('../src/domain/simulador-loop');

function movimento(simulador,numero){
 for(let evento=1;evento<=6;evento++){
  simulador.registrarVendaNoCicloSimulada({
   vendaId:'evento-do-ciclo-'+numero+'-'+evento
  });
 }
 simulador.abrirCatraca();
 const resposta=simulador.tentarGiro();
 simulador.pausarCatraca();
 assert.equal(resposta.girou,true,'giro ficticio '+numero);
 return resposta.novaPosicao6;
}

test('100 indicacoes qualificam quatro posicoes A independentes sem ultrapassar duas no tabuleiro',()=>{
 const sim=new SimuladorLoop();
 for(let i=0;i<32;i++)sim.registrarPosicaoSimulada({participanteId:'base-'+i,vendaId:'base-'+i});
 sim.prepararTabuleiro();
 const ids=Array.from({length:6},(_,i)=>sim.registrarPosicaoSimulada({participanteId:'influenciador',vendaId:'pedido-'+i}).posicao.id);
 for(let p=0;p<4;p++)for(let i=0;i<25;i++)sim.registrarIndicacaoSimulada({indicadorId:'influenciador',eventoId:'indicacao-'+p+'-'+i,posicaoAlvoId:ids[p]});
 assert.deepEqual(sim.filas.filaA.filter(p=>p.participanteId==='influenciador').map(p=>p.id),ids.slice(0,4));
 assert.deepEqual(sim.filas.filaB.filter(p=>p.participanteId==='influenciador').map(p=>p.id),ids.slice(4));
 for(let giro=1;giro<=8;giro++){
  movimento(sim,giro);
  const ocupadas=[sim.tabuleiro.centro,...sim.tabuleiro.vagas].filter(p=>p?.participanteId==='influenciador');
  assert.ok(ocupadas.length<=2,'maximo duas posicoes do titular no tabuleiro');
  const todas=[...sim.filas.filaA,...sim.filas.filaB,sim.tabuleiro.centro,...sim.tabuleiro.vagas,...sim.tabuleiro.ciclosConcluidos.map(c=>c.centro)].filter(Boolean);
  assert.ok(ids.every(id=>todas.some(p=>p.id===id)),'nenhuma posicao desaparece');
 }
});

test('a proporcao global continua superior a prioridade individual apos snapshot',()=>{
 const sim=new SimuladorLoop();
 sim.filas.travaPromocaoAtiva=true;
 sim.filas.vagaLiberacao=5;
 for(let i=0;i<7;i++)sim.registrarPosicaoSimulada({
  participanteId:'base-'+i,vendaId:'base-'+i
 });
 sim.prepararTabuleiro();
 const candidatos=Array.from({length:4},(_,i)=>{
  const p=sim.registrarPosicaoSimulada({
   participanteId:'amarelo-'+i,vendaId:'amarelo-'+i
  }).posicao;
  sim.registrarIndicacaoSimulada({
   indicadorId:'amarelo-'+i,posicaoAlvoId:p.id,eventoId:'convite-'+i
  });
  return p.id;
 });
 const branco=sim.registrarPosicaoSimulada({participanteId:'branco',vendaId:'branco'}).posicao;
 assert.deepEqual([1,2].map(i=>movimento(sim,i).id),candidatos.slice(0,2));
 const estado=sim.exportarSnapshot();
 const restaurado=SimuladorLoop.restaurarSnapshot(estado);
 restaurado.filas.travaPromocaoAtiva=true;
 restaurado.filas.vagaLiberacao=5;
 assert.equal(restaurado.filas.contadorA,2);
 assert.equal(movimento(restaurado,3).id,candidatos[2]);
 const quarta=movimento(restaurado,4);
 assert.equal(quarta.id,branco.id);
 assert.equal(quarta.origemFila,'B','mesmo com amarelas aguardando, a quarta e branca');
 assert.equal(restaurado.filas.contadorA,0);
});
