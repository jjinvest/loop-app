'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { MotorFilas } = require('../src/domain/motor-filas');
const { TabuleiroLoop, DESTINOS } = require('../src/domain/tabuleiro-loop');

function criarSimulador() {
  let instante = 0;
  const motor = new MotorFilas({
    relogio: () => new Date(Date.UTC(2026, 9, 14, 6, 0, ++instante)).toISOString()
  });
  const tabuleiro = new TabuleiroLoop({
    proximoDaFila: () => motor.proximoDaFila(),
    relogio: () => new Date(Date.UTC(2026, 9, 14, 8, 0, ++instante)).toISOString()
  });
  return { motor, tabuleiro };
}

function cadastrarPosicoes(motor, qtd, prefixo = 'cliente') {
  for (let i = 1; i <= qtd; i++) {
    motor.registrarPosicao({
      nome: prefixo + i,
      participanteId: prefixo + i,
      vendaId: prefixo + '-venda-' + i
    });
  }
}

function registrarCinco(tabuleiro, prefixo = 'ciclo-1') {
  for (let i = 1; i <= 5; i++) {
    tabuleiro.registrarVendaSimulada({ vendaId: prefixo + '-' + i });
  }
}

test('tabuleiro preenche centro e cinco vagas em ordem sem duplicar posicoes', () => {
  const { motor, tabuleiro } = criarSimulador();
  cadastrarPosicoes(motor, 8);
  const estado = tabuleiro.preencherInicial();
  assert.equal(estado.centro.id, 1);
  assert.deepEqual(estado.vagas.map(p => p.id), [2,3,4,5,6]);
  assert.equal(motor.resumo().B.quantidade, 2);
  assert.equal(estado.cicloAtual, 1);
  assert.equal(estado.vendasNoCiclo, 0);
  assert.equal(estado.ciclosConcluidos, 0);
});

test('cinco vendas usam PART-EMP-PART-EMP-PART sem mover posicoes antes do giro', () => {
  const { motor, tabuleiro } = criarSimulador();
  cadastrarPosicoes(motor, 7);
  const inicial = tabuleiro.preencherInicial();
  assert.deepEqual(DESTINOS, ['PARTICIPANTE','EMPRESA','PARTICIPANTE','EMPRESA','PARTICIPANTE']);
  for (let i = 1; i <= 5; i++) {
    const evento = tabuleiro.registrarVendaSimulada({ vendaId: 'ciclo-1-venda-' + i });
    assert.equal(evento.venda.ordem, i);
    assert.equal(evento.venda.destinoPrevisto, DESTINOS[i - 1]);
    assert.equal(evento.elegivelParaGiro, i === 5);
    assert.deepEqual(evento.estado.vagas.map(p => p.id), inicial.vagas.map(p => p.id));
    assert.equal(evento.estado.centro.id, inicial.centro.id);
  }
  assert.equal(tabuleiro.estado().vendasNoCiclo, 5);
  assert.throws(() => tabuleiro.registrarVendaSimulada({ vendaId: 'sexta' }), /aguarde a catraca/);
  assert.equal(tabuleiro.estado().elegivelParaGiro, true);
});

test('catraca pausada nao gira, mesmo com cinco vendas concluidas', () => {
  const { motor, tabuleiro } = criarSimulador();
  cadastrarPosicoes(motor, 7);
  const antes = tabuleiro.preencherInicial();
  registrarCinco(tabuleiro);
  const resultado = tabuleiro.girarSimulado({ catracaAberta: false });
  assert.equal(resultado.girou, false);
  assert.equal(resultado.motivo, 'CATRACA_PAUSADA');
  assert.equal(tabuleiro.estado().centro.id, antes.centro.id);
  assert.deepEqual(tabuleiro.estado().vagas.map(p => p.id), antes.vagas.map(p => p.id));
  assert.equal(tabuleiro.estado().vendasNoCiclo, 5);
  assert.equal(tabuleiro.estado().ciclosConcluidos, 0);
});

test('giro 1->centro, 2->1, 3->2, 4->3, 5->4, proximo->5', () => {
  const { motor, tabuleiro } = criarSimulador();
  cadastrarPosicoes(motor, 9);
  const antes = tabuleiro.preencherInicial();
  assert.equal(tabuleiro.girarSimulado({ catracaAberta: true }).motivo, 'CICLO_INCOMPLETO');
  registrarCinco(tabuleiro);
  const giro = tabuleiro.girarSimulado({ catracaAberta: true });
  assert.equal(giro.girou, true);
  assert.equal(giro.centroConcluido.id, antes.centro.id);
  assert.equal(giro.estado.centro.id, antes.vagas[0].id);
  assert.deepEqual(giro.estado.vagas.slice(0, 4).map(p => p.id),
    antes.vagas.slice(1, 5).map(p => p.id));
  assert.equal(giro.estado.vagas[4].id, 7);
  assert.equal(giro.estado.vendasNoCiclo, 0);
  assert.equal(giro.estado.ciclosConcluidos, 1);
  assert.equal(giro.estado.cicloAtual, 2);
  assert.equal(tabuleiro.ciclosConcluidos[0].vendas.length, 5);
});

test('segundo giro respeita a catraca e mantem cinco vendas por ciclo', () => {
  const { motor, tabuleiro } = criarSimulador();
  cadastrarPosicoes(motor, 10);
  tabuleiro.preencherInicial();
  registrarCinco(tabuleiro,'primeiro');
  tabuleiro.girarSimulado({ catracaAberta: true });
  registrarCinco(tabuleiro,'segundo');
  const segundo = tabuleiro.girarSimulado({ catracaAberta: true });
  assert.equal(segundo.estado.centro.id, 3);
  assert.equal(segundo.estado.vagas[4].id, 8);
  assert.equal(segundo.estado.ciclosConcluidos, 2);
  assert.equal(tabuleiro.ciclosConcluidos[0].vendas[0].destinoPrevisto, 'PARTICIPANTE');
  assert.equal(tabuleiro.ciclosConcluidos[1].vendas[0].destinoPrevisto, 'PARTICIPANTE');
});

test('id de venda duplicado nao incrementa ciclo nem permite giro antecipado', () => {
  const { motor, tabuleiro } = criarSimulador();
  cadastrarPosicoes(motor, 6);
  tabuleiro.preencherInicial();
  const primeira = tabuleiro.registrarVendaSimulada({ vendaId:'idempotente-1' });
  const repetida = tabuleiro.registrarVendaSimulada({ vendaId:'idempotente-1' });
  assert.equal(primeira.repetida, false);
  assert.equal(repetida.repetida, true);
  assert.equal(tabuleiro.estado().vendasNoCiclo, 1);
  assert.equal(tabuleiro.girarSimulado({ catracaAberta:true }).girou, false);
});

test('regra 3A/1B das filas determina quem entra no tabuleiro', () => {
  const { motor, tabuleiro } = criarSimulador();
  for (let i = 1; i <= 8; i++) {
    const chave = 'prioritario-' + i;
    motor.registrarPosicao({ participanteId: chave, vendaId: 'compra-' + chave });
    motor.registrarIndicacaoValidada({ indicadorId: chave, eventoId: 'convite-' + chave });
  }
  cadastrarPosicoes(motor, 3, 'branca');
  const estado = tabuleiro.preencherInicial();
  const origens = [estado.centro, ...estado.vagas].map(p => p.origemFila);
  assert.deepEqual(origens, ['A','A','A','B','A','A']);
  registrarCinco(tabuleiro);
  const giro = tabuleiro.girarSimulado({ catracaAberta:true });
  assert.equal(giro.novaPosicao5.origemFila, 'A');
  registrarCinco(tabuleiro, 'ciclo-2');
  const giro2 = tabuleiro.girarSimulado({ catracaAberta:true });
  assert.equal(giro2.novaPosicao5.origemFila, 'B');
});

test('sem nova entrada a posicao 5 fica vazia, sem inventar participante', () => {
  const { motor, tabuleiro } = criarSimulador();
  cadastrarPosicoes(motor, 6);
  tabuleiro.preencherInicial();
  registrarCinco(tabuleiro);
  const giro = tabuleiro.girarSimulado({ catracaAberta:true });
  assert.equal(giro.girou, true);
  assert.equal(giro.estado.vagas[4], null);
  assert.equal(giro.estado.centro.id, 2);
});

test('tabuleiro pode aguardar novas entradas para completar a montagem inicial', () => {
  const { motor, tabuleiro } = criarSimulador();
  cadastrarPosicoes(motor, 2);
  tabuleiro.preencherInicial();
  assert.equal(tabuleiro.estado().centro.id, 1);
  assert.equal(tabuleiro.estado().vagas[0].id, 2);
  assert.equal(tabuleiro.estado().vagas[1], null);
  cadastrarPosicoes(motor, 4, 'novos');
  tabuleiro.preencherInicial();
  assert.equal(tabuleiro.estado().vagas[0].id, 2);
  assert.equal(tabuleiro.estado().vagas[4].id, 6);
});

test('nao aceita venda simulada sem ID ou sem participante no centro', () => {
  const { tabuleiro } = criarSimulador();
  assert.throws(() => tabuleiro.registrarVendaSimulada({ vendaId:'x' }), /Nao ha participante/);
  assert.throws(() => tabuleiro.registrarVendaSimulada({}), /vendaId obrigatorio/);
});
