'use strict';

// LOOP V6: simula 30 entradas durante 30 dias e 300 giros CONDICIONAIS.
// 1 compra valida = 1 posicao e 1 evento de venda, sem duplicar indicados.
// O fundador ocupa o centro como premissa especial, sem registrar compra ficticia.
// Nao sao pagamentos reais; vendas pre-lancamento so sao consideradas validas
// no laboratorio. Nao e uma previsao de demanda nem de tempo de espera.
const assert = require('node:assert/strict');
const { SimuladorLoop } = require('../src/domain/simulador-loop');

const CONVITES_POR_INDICADOR = Object.freeze([3, 2, 1, 1, 1]);
const INDICADOR_DO_CONVIDADO = new Map([
  [6, 1], [7, 1], [8, 1], [9, 2], [10, 2],
  [11, 3], [12, 4], [13, 5]
]);

function executarLancamento30Dias({ ondasAdicionais = 59 } = {}) {
  assert.ok(Number.isSafeInteger(ondasAdicionais) &&
    ondasAdicionais >= 0 && ondasAdicionais <= 59, 'ondas invalidas');
  let tick = 0;
  const relogio = () =>
    new Date(Date.UTC(2026, 10, 1) + tick++ * 1000).toISOString();
  const sim = new SimuladorLoop({ relogio });
  const founder = sim.registrarPosicaoSimulada({
    participanteId: 'fundador', nome: 'Fundador no centro'
  });
  assert.equal(founder.repetida, false);
  sim.prepararTabuleiro();
  assert.equal(sim.tabuleiro.centro.participanteId, 'fundador');
  assert.ok(sim.tabuleiro.vagas.every(p => p === null));

  let compradores = 0;
  let indicacoes = 0;
  let giros = 0;
  let entradasA = 0;
  let entradasB = 0;
  const perfilDaCompra = new Map();
  const indicacoesPorOnda = new Map();
  const evolucao = [];
  let primeiroA = null;
  let seisPrimeirasVagas = [];
  let marcoDia30 = null;

  function comprar(onda, indice, registrarEventoImediatamente) {
    const id = 'onda-' + onda + '-pessoa-' + indice;
    const compraId = 'compra-' + onda + '-' + indice;
    const venda = sim.registrarPosicaoSimulada({
      participanteId: id, nome: 'Comprador simulado ' + id, vendaId: compraId
    });
    assert.equal(venda.repetida, false);
    assert.ok(!perfilDaCompra.has(compraId), 'compra duplicada');
    perfilDaCompra.set(compraId, id);
    compradores++;
    const indicador = INDICADOR_DO_CONVIDADO.get(indice);
    if (indicador !== undefined) {
      const indicadorId = 'onda-' + onda + '-pessoa-' + indicador;
      assert.ok(indicador < indice, 'indicador deve existir antes do convite');
      const r = sim.registrarIndicacaoSimulada({
        indicadorId, eventoId: 'convite-' + onda + '-' + indice,
        convidouEm: relogio()
      });
      assert.equal(r.repetida, false);
      indicacoes++;
      indicacoesPorOnda.set(onda, (indicacoesPorOnda.get(onda) || 0) + 1);
    }
    if (registrarEventoImediatamente) {
      registrarEvento(compraId);
    }
    return venda.posicao;
  }

  function validarConservacao() {
    const ativas = [
      ...sim.filas.filaA, ...sim.filas.filaB,
      sim.tabuleiro.centro, ...sim.tabuleiro.vagas
    ].filter(Boolean);
    const concluidas = sim.tabuleiro.ciclosConcluidos.map(c => c.centro);
    const todas = [...ativas, ...concluidas];
    assert.equal(todas.length, compradores + 1,
      'fundador + compradores, sem perda de posicoes');
    assert.equal(new Set(todas.map(p => p.id)).size, todas.length,
      'nenhuma posicao duplicada');
    assert.equal(concluidas.length, giros,
      'uma saida de centro por giro completo');
    assert.equal(ativas.length, compradores + 1 - giros);
    assert.equal(ativas.length - 7,
      sim.filas.filaA.length + sim.filas.filaB.length);
  }

  function registrarEvento(compraId) {
    assert.ok(perfilDaCompra.has(compraId),
      'evento sem compra ficticia distinta previamente registrada');
    const r = sim.registrarVendaNoCicloSimulada({ vendaId: compraId });
    assert.equal(r.repetida, false);
    if (r.elegivelParaGiro) {
      sim.pausarCatraca();
      assert.equal(sim.tentarGiro().motivo, 'CATRACA_PAUSADA');
      sim.abrirCatraca();
      const giro = sim.tentarGiro();
      assert.equal(giro.girou, true);
      assert.ok(giro.centroConcluido);
      assert.equal(sim.tabuleiro.vendasDoCiclo.length, 0);
      giros++;
      const entrada = sim.tabuleiro.vagas[5];
      assert.ok(entrada);
      if (entrada.origemFila === 'A') entradasA++;
      else if (entrada.origemFila === 'B') entradasB++;
      else assert.fail('origem A/B ausente');
      if ([1, 5, 10, 50, 100, 200, 300].includes(giros)) {
        evolucao.push({
          giro: giros, compradores, concluidas: giros,
          filaA: sim.filas.filaA.length, filaB: sim.filas.filaB.length,
          aguardando: sim.filas.filaA.length + sim.filas.filaB.length,
          noTabuleiro: 7
        });
      }
    }
  }

  // Dia 1..30: exatamente UMA compra de um NOVO titular por dia.
  // O convite vinculado a cada compra e registrado APENAS se houver.
  // Nao ocorre giro enquanto a campanha de pre-lancamento esta em andamento.
  const dias = [];
  for (let dia = 1; dia <= 30; dia++) {
    comprar(0, dia, false);
    dias.push({
      dia, entradasAcumuladas: compradores, convitesAcumulados: indicacoes,
      giros: 0
    });
    assert.equal(sim.giros, 0);
  }
  assert.equal(compradores, 30);
  assert.equal(indicacoes, 8);
  assert.deepEqual(CONVITES_POR_INDICADOR, [3, 2, 1, 1, 1]);
  assert.equal(sim.filas.filaA.length, 5);
  assert.equal(sim.filas.filaB.length, 25);
  assert.equal(sim.tabuleiro.vendasDoCiclo.length, 0);

  // O fundador ja foi reservado no centro; no dia 30, a primeira pessoa
  // elegivel na A ocupa a vaga 1. A entrada fisica sempre passa pela vaga 6.
  sim.prepararTabuleiro();
  primeiroA = sim.tabuleiro.vagas[0].participanteId;
  seisPrimeirasVagas = sim.tabuleiro.vagas.map((p, i) => ({
    vaga: i + 1, titular: p.participanteId,
    origemFila: p.origemFila
  }));
  // A(3 convites), A(2), A(1 mais antigo), B, A(1), A(1).
  assert.equal(primeiroA, 'onda-0-pessoa-1');
  assert.deepEqual(
    sim.tabuleiro.vagas.map(p => p.participanteId),
    ['onda-0-pessoa-1', 'onda-0-pessoa-2',
      'onda-0-pessoa-3', 'onda-0-pessoa-6',
      'onda-0-pessoa-4', 'onda-0-pessoa-5']
  );
  assert.deepEqual(
    sim.tabuleiro.vagas.map(p => p.origemFila),
    ['A', 'A', 'A', 'B', 'A', 'A']
  );
  assert.equal(sim.filas.filaA.length, 0);
  assert.equal(sim.filas.filaB.length, 24);

  // Apenas no start, as 30 compras pre-lancamento entram como eventos
  // hipoteticamente ja validados, UMA vez por compra. Cinco ciclos.
  for (let n = 1; n <= 30; n++) {
    registrarEvento('compra-0-' + n);
  }
  assert.equal(giros, 5);
  assert.equal(sim.tabuleiro.ciclosConcluidos[0].centro.participanteId,
    'fundador');
  assert.equal(sim.filas.filaA.length + sim.filas.filaB.length, 19);
  assert.equal(sim.tentarGiro().motivo, 'CICLO_INCOMPLETO');
  validarConservacao();
  marcoDia30 = {
    compradores: 30, indicadores: 5, indicadosIncluidosNos30: 8,
    novosCompradoresSemIndicacao: 22, girosPossiveis: 5,
    concluidas: 5, noTabuleiro: 7, aguardando: 19,
    filaA: sim.filas.filaA.length, filaB: sim.filas.filaB.length
  };

  // Ondas de 30 NOVOS compradores sem prazos presumidos. Em cada onda,
  // cinco entre os 30 indicam 3,2,1,1,1; os oito convidados JA SAO
  // compradores da propria onda. Sao 59 ondas condicionais apos o start
  // para completar 300 giros no total. Nao e crescimento previsto.
  for (let onda = 1; onda <= ondasAdicionais; onda++) {
    for (let pessoa = 1; pessoa <= 30; pessoa++) {
      comprar(onda, pessoa, true);
    }
    assert.equal(indicacoesPorOnda.get(onda), 8);
    assert.equal(giros, (onda + 1) * 5);
    assert.equal(sim.tabuleiro.vendasProcessadas.size, compradores);
    validarConservacao();
  }
  const aguardando = sim.filas.filaA.length + sim.filas.filaB.length;
  const totalPosicoes = compradores + 1; // fundador reservado separadamente
  const resposta = {
    modo: 'SIMULACAO_DE_LANCAMENTO_CONDICIONAL_SEM_DINHEIRO',
    diasPreLancamento: 30, compradoresIniciais: 30,
    fundadorReservaCentroSemCompra: true,
    primeiroDaFilaANaVaga1: primeiroA,
    seisVagasNaAbertura: seisPrimeirasVagas,
    convitesPorIndicadorPorGrupo: [...CONVITES_POR_INDICADOR],
    gruposDe30: 1 + ondasAdicionais,
    convitesTotais: indicacoes,
    indicadoresUnicos: 5 * (1 + ondasAdicionais),
    comprasQualificadas: compradores,
    participantesCompradores: compradores,
    posicoesTotaisIncluindoFundador: totalPosicoes,
    giros, centrosConcluidos: giros,
    eventosValidos: sim.tabuleiro.vendasProcessadas.size,
    filaA: sim.filas.filaA.length,
    filaB: sim.filas.filaB.length,
    aguardandoNaFila: aguardando,
    noTabuleiro: 7,
    entradasPelaVaga6A: entradasA, entradasPelaVaga6B: entradasB,
    marcoDia30, evolucao, dias,
    recebimentosReais: 0, saquesReais: 0,
    hipoteseEssencial: 'Cada compra e uma posicao e um evento; 300 giros so ocorrem se houver 1800 compras validas, incluidas as 30 iniciais.'
  };
  assert.equal(aguardando + 7 + giros, totalPosicoes);
  return resposta;
}

if (require.main === module) {
  try {
    const resultado = executarLancamento30Dias();
    process.stdout.write(JSON.stringify(resultado, null, 2) + '\n');
  } catch (erro) {
    process.stderr.write(erro.stack + '\n');
    process.exitCode = 1;
  }
}
module.exports = { executarLancamento30Dias };
