'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { SimuladorLoop } = require('../src/domain/simulador-loop');

test('fluxo integrado: fila gera tabuleiro, cinco vendas autorizam giro, catraca controla movimento', () => {
  const loop = new SimuladorLoop();
  for (let i = 1; i <= 9; i++) {
    loop.registrarPosicaoSimulada({
      participanteId:'participante-' + i,
      vendaId:'venda-inicial-' + i
    });
  }
  const inicio = loop.prepararTabuleiro();
  assert.equal(inicio.centro.id, 1);
  assert.deepEqual(inicio.vagas.map(p => p.id), [2,3,4,5,6]);
  assert.equal(loop.estado().filas.B.quantidade, 3);
  assert.equal(loop.estado().catraca.status, 'PAUSADA');

  loop.registrarVendaNoCicloSimulada({ vendaId:'ciclo-1-1' });
  assert.equal(loop.tentarGiro().motivo, 'CATRACA_PAUSADA');
  loop.abrirCatraca();
  assert.equal(loop.tentarGiro().motivo, 'CICLO_INCOMPLETO');
  loop.pausarCatraca();
  for (let i = 2; i <= 5; i++) {
    loop.registrarVendaNoCicloSimulada({ vendaId:'ciclo-1-' + i });
  }

  assert.equal(loop.estado().tabuleiro.elegivelParaGiro, true);
  assert.equal(loop.tentarGiro().motivo, 'CATRACA_PAUSADA');
  assert.equal(loop.estado().tabuleiro.centro.id, 1);

  // Enquanto pausada, novas posicoes continuam entrando nas filas.
  loop.registrarPosicaoSimulada({ participanteId:'participante-10', vendaId:'venda-inicial-10' });
  assert.equal(loop.estado().filas.B.quantidade, 4);
  assert.equal(loop.estado().tabuleiro.vagas[4].id, 6);

  loop.abrirCatraca();
  const giro = loop.tentarGiro();
  assert.equal(giro.girou, true);
  assert.equal(giro.centroConcluido.id, 1);
  assert.equal(giro.estado.centro.id, 2);
  assert.deepEqual(giro.estado.vagas.map(p => p.id), [3,4,5,6,7]);
  assert.equal(loop.estado().catraca.giros, 1);
  assert.equal(loop.estado().tabuleiro.vendasNoCiclo, 0);

  // Um mesmo ciclo nao gira duas vezes.
  assert.equal(loop.tentarGiro().motivo, 'CICLO_INCOMPLETO');
  assert.equal(loop.estado().catraca.giros, 1);
});

test('indicacao prioriza nova vaga; ocupantes atuais nao mudam', () => {
  const loop = new SimuladorLoop();
  for (let i = 1; i <= 7; i++) {
    loop.registrarPosicaoSimulada({ participanteId:'p' + i, vendaId:'compra-' + i });
  }
  const montado = loop.prepararTabuleiro();
  assert.equal(montado.centro.id, 1);
  assert.deepEqual(montado.vagas.map(p => p.id), [2,3,4,5,6]);
  loop.registrarIndicacaoSimulada({ indicadorId:'p7', eventoId:'convite-p7' });
  assert.deepEqual(loop.estado().tabuleiro.vagas.map(p => p.id), [2,3,4,5,6]);
  assert.equal(loop.estado().filas.A.quantidade, 1);
  for (let i=1; i<=5; i++) {
    loop.registrarVendaNoCicloSimulada({ vendaId:'produto-ciclo-' + i });
  }
  loop.abrirCatraca();
  const giro = loop.tentarGiro();
  assert.equal(giro.novaPosicao5.id, 7);
  assert.equal(giro.novaPosicao5.origemFila, 'A');
});

test('venda inicial repetida nao cria outra posicao', () => {
  const loop = new SimuladorLoop();
  const primeira = loop.registrarPosicaoSimulada({participanteId:'x',vendaId:'v1'});
  const repetida = loop.registrarPosicaoSimulada({participanteId:'x',vendaId:'v1'});
  assert.equal(primeira.repetida,false);
  assert.equal(repetida.repetida,true);
  assert.equal(loop.estado().filas.B.quantidade,1);
});
