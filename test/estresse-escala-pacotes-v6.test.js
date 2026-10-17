'use strict';

// Ensaio de volume deterministico, sem PIX, bancos, CPF real ou promessa de ganho.
// Pacotes sao SEMEADOS como seis posicoes; os seis eventos de cada giro sao
// compras ficticias INDEPENDENTES, nunca deduzidas de um unico pagamento-pacote.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { SimuladorLoop } = require('../src/domain/simulador-loop');
const { projetarSustentabilidade } = require('../src/domain/projecao-sustentabilidade-loop');

test('V6 escala: 2.000 pacotes de seis, 12 mil posicoes, 100 giros, 3A/1B e snapshots', () => {
  let tick = 0;
  const relogio = () => new Date(Date.UTC(2026, 9, 17) + tick++ * 1000).toISOString();
  let sim = new SimuladorLoop({ relogio });
  const ids = new Set();
  const donos = new Map();
  let total = 0;
  const cadastrar = (dono, compra) => {
    const quantidade = donos.get(dono) || 0;
    assert.ok(quantidade < 6, 'nao criar setima posicao do mesmo titular');
    const r = sim.registrarPosicaoSimulada({
      participanteId: dono, nome: 'Titular de teste ' + dono, vendaId: compra
    });
    assert.equal(r.repetida, false);
    assert.ok(!ids.has(r.posicao.id), 'id exclusivo');
    ids.add(r.posicao.id);
    donos.set(dono, quantidade + 1);
    total++;
  };
  for (let cliente = 1; cliente <= 2000; cliente++) {
    for (let indice = 1; indice <= 6; indice++) {
      cadastrar('pacote-' + cliente, 'pacote-' + cliente + '-cadeira-' + indice);
    }
  }
  assert.equal(total, 12000);
  assert.equal(sim.tabuleiro.vendasProcessadas.size, 0,
    'seis cadeiras de um pacote NAO equivalem a seis eventos de venda');
  sim.prepararTabuleiro();
  assert.equal(sim.filas.filaB.length, 11993);
  for (let cliente = 501; cliente <= 600; cliente++) {
    const id = 'pacote-' + cliente;
    const r = sim.registrarIndicacaoSimulada({
      indicadorId: id, eventoId: 'indicacao-' + cliente, convidouEm: relogio()
    });
    assert.equal(r.promovidas.length, 6);
    if (cliente <= 525) {
      const extra = sim.registrarIndicacaoSimulada({
        indicadorId: id, eventoId: 'indicacao-extra-' + cliente,
        convidouEm: relogio()
      });
      assert.equal(extra.quantidade, 2);
      assert.equal(extra.promovidas.length, 0);
    }
  }
  assert.equal(sim.filas.filaA.length, 600);
  sim.abrirCatraca();
  const concluidos = new Set();
  let entradasA = 0, entradasB = 0, duplicacoes = 0, bloqueiosPausa = 0;
  for (let giro = 1; giro <= 100; giro++) {
    const centroAntes = sim.tabuleiro.centro.id;
    const vagasAntes = sim.tabuleiro.vagas.map(p => p.id);
    assert.equal(sim.tentarGiro().motivo, 'CICLO_INCOMPLETO');
    for (let evento = 1; evento <= 6; evento++) {
      cadastrar('comprador-' + giro + '-' + evento,
        'compra-autonoma-' + giro + '-' + evento);
      const vendaId = 'evento-autonomo-' + giro + '-' + evento;
      const r = sim.registrarVendaNoCicloSimulada({ vendaId });
      assert.equal(r.repetida, false);
      assert.equal(r.venda.posicaoCentroId, centroAntes);
      assert.equal(r.venda.ordem, evento);
      assert.equal(r.elegivelParaGiro, evento === 6);
      if (evento === 1 && giro % 10 === 0) {
        assert.equal(sim.registrarVendaNoCicloSimulada({ vendaId }).repetida, true);
        assert.equal(sim.tabuleiro.vendasDoCiclo.length, 1);
        duplicacoes++;
      }
    }
    if (giro % 25 === 0) {
      sim.pausarCatraca();
      assert.equal(sim.tentarGiro().motivo, 'CATRACA_PAUSADA');
      assert.equal(sim.tabuleiro.centro.id, centroAntes);
      assert.equal(sim.tabuleiro.vendasDoCiclo.length, 6);
      bloqueiosPausa++;
      sim.abrirCatraca();
    }
    const resultado = sim.tentarGiro();
    assert.equal(resultado.girou, true);
    assert.equal(resultado.centroConcluido.id, centroAntes);
    assert.ok(!concluidos.has(centroAntes));
    concluidos.add(centroAntes);
    assert.equal(sim.tabuleiro.centro.id, vagasAntes[0]);
    for (let i = 0; i < 5; i++) {
      assert.equal(sim.tabuleiro.vagas[i].id, vagasAntes[i + 1]);
    }
    const origem = sim.tabuleiro.vagas[5].origemFila;
    assert.equal(origem, giro % 4 === 0 ? 'B' : 'A');
    if (origem === 'A') entradasA++; else entradasB++;
    assert.equal(sim.tabuleiro.ciclosConcluidos.at(-1).vendas.length, 6);
    if (giro % 25 === 0) {
      const ativos = [...sim.filas.filaA, ...sim.filas.filaB,
        sim.tabuleiro.centro, ...sim.tabuleiro.vagas].filter(Boolean);
      const historicos = sim.tabuleiro.ciclosConcluidos.map(c => c.centro);
      assert.equal(ativos.length + historicos.length, total);
      assert.equal(new Set([...ativos, ...historicos].map(p => p.id)).size, total);
      assert.equal(sim.filas.filaA.length + sim.filas.filaB.length, total - giro - 7);
      const snapshot = sim.exportarSnapshot();
      sim = SimuladorLoop.restaurarSnapshot(snapshot, { relogio });
      assert.deepEqual(sim.exportarSnapshot(), snapshot);
    }
  }
  assert.equal(total, 12600);
  assert.equal(donos.size, 2600);
  assert.equal(concluidos.size, 100);
  assert.equal(sim.giros, 100);
  assert.equal(sim.filas.filaA.length + sim.filas.filaB.length, 12493);
  assert.equal(entradasA, 75);
  assert.equal(entradasB, 25);
  assert.equal(duplicacoes, 10);
  assert.equal(bloqueiosPausa, 4);
  assert.equal(sim.tabuleiro.vendasProcessadas.size, 600);
  const cofres = {
    LOOP_CENTRO: 0, LOOP_ESQUERDA: 0, LOOP_DIREITA: 0, LOOP_DOURADAS: 0
  };
  for (const ciclo of sim.tabuleiro.ciclosConcluidos) {
    for (const v of ciclo.vendas) {
      assert.ok(Object.hasOwn(cofres, v.destinoCofre));
      cofres[v.destinoCofre] += 25000;
    }
  }
  assert.deepEqual(cofres, {
    LOOP_CENTRO: 7500000, LOOP_ESQUERDA: 5000000,
    LOOP_DIREITA: 2500000, LOOP_DOURADAS: 0
  });
  console.log('ESTRESSE_V6=' + JSON.stringify({
    pacotes: 2000, posicoesCriadas: total, titulares: donos.size,
    giros: 100, eventosIndependentes: 600, aguardando: 12493,
    entradasA, entradasB, repeticoesBloqueadas: duplicacoes,
    pausasVerificadas: bloqueiosPausa,
    distribuicaoApenasReferencialCentavos: cofres,
    dinheiroRealMovimentadoCentavos: 0
  }));
});

function periodo(vendasValidas, precoCentavos, vendasReembolsadas = 0) {
  return {
    vendasValidas, vendasReembolsadas, precoCentavos,
    custoFornecedorCentavos: 30000, impostosCentavos: 5000,
    tarifaPagamentoCentavos: 1500, despesaOperacionalCentavos: 2500,
    custoEstornoNaoRecuperavelCentavos: 3500
  };
}

test('V6 sustentabilidade: 12 mil cadeiras antigas nao geram caixa; pausa e estornos aumentam risco', () => {
  const deficit = projetarSustentabilidade({
    posicoesIniciais: 12000,
    periodos: [periodo(600, 60000, 20), periodo(0, 60000)]
  });
  assert.equal(deficit.resumo.ciclosConcluidos, 100);
  assert.equal(deficit.resumo.posicoesPendentes, 12500);
  assert.equal(deficit.resumo.posicoesAguardandoFilaEstimadas, 12493);
  assert.equal(deficit.resumo.reservaFilaCentavos, 15000000);
  assert.equal(deficit.resumo.parcelasCentroReferenciaisCentavos, 7500000);
  assert.equal(deficit.resumo.parcelasEmpresaReferenciaisCentavos, 7500000);
  assert.equal(deficit.resumo.margemComercialAposReservaFilaCentavos, -2470000);
  assert.equal(deficit.periodos[1].ciclosConcluidos, 0);
  assert.equal(deficit.periodos[1].posicoesPendentes, 12500);
  const outroPreco = projetarSustentabilidade({
    posicoesIniciais: 12000, periodos: [periodo(600, 80000, 20)]
  });
  assert.equal(outroPreco.resumo.margemComercialAposReservaFilaCentavos, 9530000);
  assert.equal(outroPreco.resumo.posicoesPendentes, 12500);
  assert.equal(outroPreco.resumo.parcelasCentroReferenciaisCentavos,
    deficit.resumo.parcelasCentroReferenciaisCentavos);
  assert.equal(deficit.premissas.posicoesIniciaisSemCaixaModelado, true);
  assert.equal(deficit.premissas.direitosAdquiridosENovaPosicaoAposEstornoNaoModelados, true);
  assert.equal('saldoDisponivelParaSaque' in deficit.resumo, false);
});
