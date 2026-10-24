'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { executarLancamento30Dias } =
  require('../scripts/simular-lancamento-30-dias-300-giros-v6');

test('30 dias, 30 compradores, cinco indicadores 3-2-1-1-1: sem novos compradores, so cinco giros', () => {
  const r = executarLancamento30Dias({ ondasAdicionais: 0 });
  assert.equal(r.diasPreLancamento, 30);
  assert.equal(r.dias.length, 30);
  assert.deepEqual(r.dias.map(d => d.entradasAcumuladas),
    Array.from({ length: 30 }, (_, i) => i + 1));
  assert.ok(r.dias.every(d => d.giros === 0));
  assert.deepEqual(r.convitesPorIndicadorPorGrupo, [3, 2, 1, 1, 1]);
  assert.equal(r.compradoresIniciais, 30);
  assert.equal(r.marcoDia30.indicadores, 5);
  assert.equal(r.marcoDia30.indicadosIncluidosNos30, 8);
  assert.equal(r.marcoDia30.novosCompradoresSemIndicacao, 22);
  assert.equal(r.comprasQualificadas, 30);
  assert.equal(r.convitesTotais, 8);
  assert.equal(r.giros, 5);
  assert.equal(r.centrosConcluidos, 5);
  assert.equal(r.primeiroDaFilaANaVaga1, 'onda-0-pessoa-1');
  assert.deepEqual(r.seisVagasNaAbertura.map(x => x.origemFila),
    ['A', 'A', 'A', 'B', 'A', 'A']);
  assert.deepEqual(r.seisVagasNaAbertura.map(x => x.vaga), [1, 2, 3, 4, 5, 6]);
  assert.equal(r.aguardandoNaFila, 19);
  assert.equal(r.noTabuleiro, 7);
  assert.equal(r.posicoesTotaisIncluindoFundador, 31);
  assert.equal(r.aguardandoNaFila + 7 + r.giros,
    r.posicoesTotaisIncluindoFundador);
  assert.equal(r.recebimentosReais, 0);
  assert.equal(r.saquesReais, 0);
});

test('300 giros condicionais: 30 iniciais + 1770 vendas posteriores, sem dupla contagem dos convidados', () => {
  const r = executarLancamento30Dias();
  assert.equal(r.gruposDe30, 60);
  assert.equal(r.comprasQualificadas, 1800);
  assert.equal(r.participantesCompradores, 1800);
  assert.equal(r.indicadoresUnicos, 300);
  assert.equal(r.convitesTotais, 480);
  assert.equal(r.eventosValidos, 1800);
  assert.equal(r.giros, 300);
  assert.equal(r.centrosConcluidos, 300);
  assert.equal(r.posicoesTotaisIncluindoFundador, 1801);
  assert.equal(r.noTabuleiro, 7);
  assert.equal(r.aguardandoNaFila, 1494);
  assert.equal(r.aguardandoNaFila, r.filaA + r.filaB);
  assert.equal(r.entradasPelaVaga6A + r.entradasPelaVaga6B, 300);
  assert.equal(r.aguardandoNaFila + r.noTabuleiro + r.centrosConcluidos,
    r.posicoesTotaisIncluindoFundador);
  assert.equal(r.marcoDia30.girosPossiveis, 5);
  assert.equal(r.recebimentosReais, 0);
  assert.equal(r.saquesReais, 0);
  console.log('LANCAMENTO_PROPORCIONAL_V6=' + JSON.stringify({
    compradoresPrimeiros30Dias: r.compradoresIniciais,
    comprasNovasAposLancamento: r.comprasQualificadas - r.compradoresIniciais,
    convidadosContadosUmaVez: r.convitesTotais,
    indicadores: r.indicadoresUnicos,
    giros: r.giros, concluidos: r.centrosConcluidos,
    aguardando: r.aguardandoNaFila,
    filaA: r.filaA, filaB: r.filaB,
    chamadasA: r.entradasPelaVaga6A,
    chamadasB: r.entradasPelaVaga6B,
    primeirosAssentos: r.seisVagasNaAbertura,
    evolucao: r.evolucao,
    dinheiroReal: 0
  }));
});

test('nao ha 300 giros automagicos nem com apenas 30 compras e oito indicacoes', () => {
  const r = executarLancamento30Dias({ ondasAdicionais: 0 });
  assert.equal(r.giros, 30 / 6);
  assert.equal(r.eventosValidos, r.comprasQualificadas);
  assert.notEqual(r.giros, 300);
  assert.throws(() => executarLancamento30Dias({ ondasAdicionais: 60 }),
    /ondas invalidas/);
});
