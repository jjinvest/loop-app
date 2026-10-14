'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { MotorFilas } = require('../src/domain/motor-filas');

function motorNovo() {
  let instante = 0;
  return new MotorFilas({ relogio: () => new Date(Date.UTC(2026, 9, 14, 5, 0, ++instante)).toISOString() });
}

test('cada venda tem uma posicao propria e a mesma venda nao duplica posicoes', () => {
  const motor = motorNovo();
  const a = motor.registrarPosicao({ participanteId: 'cliente-1', nome: 'Ana', vendaId: 'pedido-A' });
  const b = motor.registrarPosicao({ participanteId: 'cliente-1', nome: 'Ana', vendaId: 'pedido-B' });
  const repetida = motor.registrarPosicao({ participanteId: 'cliente-1', vendaId: 'pedido-A' });
  assert.notEqual(a.posicao.id, b.posicao.id);
  assert.equal(a.posicao.participanteId, b.posicao.participanteId);
  assert.equal(repetida.repetida, true);
  assert.equal(repetida.posicao.id, a.posicao.id);
  assert.equal(motor.resumo().B.quantidade, 2);
});

test('proporcao 3A/1B respeita a fila branca e a prioridade amarela', () => {
  const motor = motorNovo();
  for (let i = 1; i <= 8; i++) {
    const pessoa = motor.registrarPosicao({
      participanteId: 'amarela-' + i, vendaId: 'venda-A-' + i
    }).posicao;
    motor.registrarIndicacaoValidada({ indicadorId: pessoa.participanteId, eventoId: 'indicacao-' + i });
  }
  for (let i = 1; i <= 3; i++) {
    motor.registrarPosicao({ participanteId: 'branca-' + i, vendaId: 'venda-B-' + i });
  }
  const origens = [];
  for (let i = 0; i < 11; i++) origens.push(motor.proximoDaFila().origem);
  assert.deepEqual(origens, ['A','A','A','B','A','A','A','B','A','A','B']);
  assert.equal(motor.proximoDaFila(), null);
});

test('se uma fila estiver vazia, a outra continua; B recupera vez depois de 3 A', () => {
  const motor = motorNovo();
  const a = motor.registrarPosicao({ participanteId:'a' }).posicao;
  motor.registrarIndicacaoValidada({ indicadorId:'a', eventoId:'ref-a' });
  assert.equal(motor.proximoDaFila().pessoa.id, a.id);
  motor.registrarPosicao({ participanteId:'b' });
  assert.equal(motor.proximoDaFila().origem, 'B');
});

test('indicacao validada move todas as posicoes B da mesma pessoa para A', () => {
  const motor = motorNovo();
  const a = motor.registrarPosicao({ participanteId:'x', vendaId:'x-1' }).posicao;
  const b = motor.registrarPosicao({ participanteId:'x', vendaId:'x-2' }).posicao;
  motor.registrarPosicao({ participanteId:'y' });
  const promovidas = motor.registrarIndicacaoValidada({ indicadorId:'x', eventoId:'indicacao-x-1' });
  assert.deepEqual(promovidas.promovidas.map(p => p.id), [a.id,b.id]);
  assert.equal(motor.resumo().A.quantidade, 2);
  assert.equal(motor.resumo().B.quantidade, 1);
  assert.equal(motor.registrarIndicacaoValidada({ indicadorId:'x', eventoId:'indicacao-x-1' }).repetida, true);
  assert.equal(motor.informacoesParticipante('x').quantidade, 1);
});

test('fila A prioriza quantidade e desempata pelo ultimo convite registrado', () => {
  const motor = motorNovo();
  const antigo = motor.registrarPosicao({ participanteId:'antigo' }).posicao;
  const novo = motor.registrarPosicao({ participanteId:'novo' }).posicao;
  const lider = motor.registrarPosicao({ participanteId:'lider' }).posicao;
  motor.registrarIndicacaoValidada({ indicadorId:'antigo', eventoId:'ref-1' });
  motor.registrarIndicacaoValidada({ indicadorId:'novo', eventoId:'ref-2' });
  motor.registrarIndicacaoValidada({ indicadorId:'lider', eventoId:'ref-3' });
  motor.registrarIndicacaoValidada({ indicadorId:'lider', eventoId:'ref-4' });
  assert.deepEqual(motor.resumo().A.pessoas.map(p => p.id), [lider.id, antigo.id, novo.id]);
});

test('desempate com tres indicacoes usa o terceiro convite, mesmo quando o primeiro foi mais cedo', () => {
  const motor = motorNovo();
  const joao = motor.registrarPosicao({ participanteId:'joao' }).posicao;
  const pedro = motor.registrarPosicao({ participanteId:'pedro' }).posicao;
  motor.registrarIndicacaoValidada({ indicadorId:'pedro', eventoId:'p1', convidouEm:'2026-10-14T10:15:35-03:00' });
  motor.registrarIndicacaoValidada({ indicadorId:'joao', eventoId:'j1', convidouEm:'2026-10-14T10:15:20-03:00' });
  motor.registrarIndicacaoValidada({ indicadorId:'joao', eventoId:'j2', convidouEm:'2026-10-14T10:16:20-03:00' });
  motor.registrarIndicacaoValidada({ indicadorId:'pedro', eventoId:'p2', convidouEm:'2026-10-14T10:16:10-03:00' });
  motor.registrarIndicacaoValidada({ indicadorId:'pedro', eventoId:'p3', convidouEm:'2026-10-14T10:17:00-03:00' });
  motor.registrarIndicacaoValidada({ indicadorId:'joao', eventoId:'j3', convidouEm:'2026-10-14T10:18:00-03:00' });
  assert.deepEqual(motor.resumo().A.pessoas.map(p => p.id), [pedro.id, joao.id]);
  assert.equal(motor.informacoesParticipante('joao').ultimoConviteEm, '2026-10-14T13:18:00.000Z');
  assert.equal(motor.informacoesParticipante('pedro').ultimoConviteEm, '2026-10-14T13:17:00.000Z');
});

test('eventos validados fora de ordem conservam o ultimo horario cronologico', () => {
  const motor = motorNovo();
  const ana = motor.registrarPosicao({ participanteId: 'ana' }).posicao;
  const bia = motor.registrarPosicao({ participanteId: 'bia' }).posicao;
  motor.registrarIndicacaoValidada({ indicadorId:'ana', eventoId:'a2', convidouEm:'2026-10-14T15:00:00Z' });
  motor.registrarIndicacaoValidada({ indicadorId:'bia', eventoId:'b1', convidouEm:'2026-10-14T14:00:00Z' });
  assert.deepEqual(motor.resumo().A.pessoas.map(p => p.id), [bia.id,ana.id]);
  motor.registrarIndicacaoValidada({ indicadorId:'ana', eventoId:'a1', convidouEm:'2026-10-14T13:00:00Z' });
  motor.registrarIndicacaoValidada({ indicadorId:'bia', eventoId:'b2', convidouEm:'2026-10-14T16:00:00Z' });
  assert.deepEqual(motor.resumo().A.pessoas.map(p => p.id), [ana.id,bia.id]);
});

test('convites com milissegundos iguais usam ordem de processamento como desempate residual', () => {
  const motor = motorNovo();
  const primeiro = motor.registrarPosicao({ participanteId:'primeiro' }).posicao;
  const segundo = motor.registrarPosicao({ participanteId:'segundo' }).posicao;
  motor.registrarIndicacaoValidada({ indicadorId:'segundo', eventoId:'s1', convidouEm:'2026-10-14T10:00:00.000Z' });
  motor.registrarIndicacaoValidada({ indicadorId:'primeiro', eventoId:'p1', convidouEm:'2026-10-14T10:00:00.000Z' });
  assert.deepEqual(motor.resumo().A.pessoas.map(p => p.id), [segundo.id,primeiro.id]);
});

test('um convite com horario invalido nao e contabilizado', () => {
  const motor = motorNovo();
  motor.registrarPosicao({ participanteId:'p' });
  assert.throws(() => motor.registrarIndicacaoValidada({
    indicadorId:'p', eventoId:'ev1', convidouEm:'hoje 10h'
  }), /Horario do convite invalido/);
  assert.equal(motor.resumo().B.quantidade, 1);
  assert.equal(motor.informacoesParticipante('p').quantidade, 0);
});

test('promocao simulada por posicao preserva identidade e nao promove terceiros', () => {
  const motor = motorNovo();
  const p = motor.registrarPosicao({ participanteId:'p', nome:'Participante P' }).posicao;
  motor.registrarPosicao({ participanteId:'p' });
  motor.registrarPosicao({ participanteId:'q' });
  const promocao = motor.promoverPosicaoSimulada(p.id);
  assert.equal(promocao.promovidas.length, 2);
  assert.equal(motor.resumo().B.quantidade, 1);
  assert.equal(motor.promoverPosicaoSimulada(p.id), null);
});

test('validacoes nao alteram o estado quando os eventos sao invalidos', () => {
  const motor = motorNovo();
  assert.throws(() => motor.registrarPosicao({}), /Informe nome/);
  assert.throws(() => motor.registrarIndicacaoValidada({ indicadorId:'inexistente', eventoId:'x' }), /desconhecido/);
  motor.registrarPosicao({ participanteId:'p' });
  assert.throws(() => motor.registrarIndicacaoValidada({ indicadorId:'p' }), /obrigatorio/);
  assert.equal(motor.resumo().B.quantidade, 1);
  assert.equal(motor.resumo().A.quantidade, 0);
});
