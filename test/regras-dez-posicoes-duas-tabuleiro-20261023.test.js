'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SimuladorLoop}=require('../src/domain/simulador-loop');
const {criarVisaoEscritorioDemo}=require('../src/domain/visao-escritorio-demo');

test('dez posicoes do mesmo titular podem entrar na A por dez indicacoes individuais',()=>{
 const s=new SimuladorLoop();s.filas.travaPromocaoAtiva=true;
 for(let i=0;i<10;i++){
  const p=s.registrarPosicaoSimulada({participanteId:'titular',vendaId:'pedido-'+i}).posicao;
  s.registrarIndicacaoSimulada({indicadorId:'titular',eventoId:'indicacao-'+i,posicaoAlvoId:p.id});
 }
 assert.equal(s.filas.filaA.filter(p=>p.participanteId==='titular').length,10);
 assert.equal(s.filas.filaB.length,0);
});

test('tabuleiro limita a duas posicoes por titular incluindo o centro',()=>{
 const s=new SimuladorLoop();
 for(let i=0;i<6;i++)s.registrarPosicaoSimulada({participanteId:'titular',vendaId:'t-'+i});
 for(let i=0;i<8;i++)s.registrarPosicaoSimulada({participanteId:'outro-'+i,vendaId:'o-'+i});
 const t=s.prepararTabuleiro();
 const ocupadas=[t.centro,...t.vagas].filter(Boolean);
 assert.equal(ocupadas.filter(p=>p.participanteId==='titular').length,2);
 assert.equal(s.filas.filaB.filter(p=>p.participanteId==='titular').length,4);
 assert.equal(ocupadas.length,7);
});

test('capacidade da visao demonstrativa agora e dez',()=>{
 const v=criarVisaoEscritorioDemo({titularId:'conta-demo-a'});
 assert.equal(v.limitePosicoesAtivas,10);
 assert.equal(v.vagasDisponiveis,10-v.posicoesAtivas);
});
