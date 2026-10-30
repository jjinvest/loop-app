'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SimuladorLoop}=require('../src/domain/simulador-loop');
const {MotorFilas}=require('../src/domain/motor-filas');

test('dez posicoes com dez indicacoes individuais podem ocupar A',()=>{
 const loop=new SimuladorLoop();loop.filas.travaPromocaoAtiva=true;
 for(let i=0;i<10;i++){
  const p=loop.registrarPosicaoSimulada({participanteId:'titular',vendaId:'pedido-'+i}).posicao;
  loop.registrarIndicacaoSimulada({indicadorId:'titular',eventoId:'convite-'+i,posicaoAlvoId:p.id});
 }
 assert.equal(loop.filas.filaA.length,10);
 assert.equal(loop.filas.filaB.length,0);
});
test('tabuleiro nao admite terceira posicao do mesmo titular, inclusive centro',()=>{
 const loop=new SimuladorLoop();
 for(let i=0;i<5;i++)loop.registrarPosicaoSimulada({participanteId:'titular',vendaId:'p-'+i});
 for(let i=0;i<6;i++)loop.registrarPosicaoSimulada({participanteId:'outro-'+i,vendaId:'o-'+i});
 loop.prepararTabuleiro();
 const ocupantes=[loop.tabuleiro.centro,...loop.tabuleiro.vagas].filter(Boolean);
 assert.equal(ocupantes.filter(p=>p.participanteId==='titular').length,2);
 assert.equal(loop.filas.filaB.filter(p=>p.participanteId==='titular').length,3);
});
test('selecao nao consome candidato bloqueado nem perde ordem',()=>{
 const f=new MotorFilas();
 f.registrarPosicao({participanteId:'a',vendaId:'1'});
 f.registrarPosicao({participanteId:'a',vendaId:'2'});
 f.registrarPosicao({participanteId:'b',vendaId:'3'});
 assert.equal(f.proximoDaFila({titularesBloqueados:['a']}).pessoa.participanteId,'b');
 assert.deepEqual(f.filaB.map(p=>p.id),[1,2]);
});
