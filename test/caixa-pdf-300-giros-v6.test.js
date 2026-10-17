'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { executarLancamento30Dias } =
  require('../scripts/simular-lancamento-30-dias-300-giros-v6');
const { executarRelatorioCaixaPdfV6, csvGiros } =
  require('../scripts/relatorio-caixa-pdf-300-giros-v6');
const { auditarCaixaPdfV6 } =
  require('../src/domain/relatorio-caixa-pdf-v6');

test('V6 PDFs: 300 giros com 1800 PDFs de 250; extrato dos quatro cofres sem lucro inventado', () => {
  const r = executarRelatorioCaixaPdfV6();
  assert.equal(r.modo, 'CAIXA_PDF_REFERENCIAL_SEM_DINHEIRO_REAL');
  assert.equal(r.precoPdfCentavos, 25000);
  assert.equal(r.quantidadePdfSimulada, 1800);
  assert.equal(r.posicoesCompradas, 1800);
  assert.equal(r.fundadorSemCompra, 1);
  assert.equal(r.giros, 300);
  assert.equal(r.centrosConcluidos, 300);
  assert.equal(r.totalEventos, 1800);
  assert.equal(r.faturamentoBrutoHipoteticoCentavos, 45000000);
  assert.equal(r.totalAlocadoCentavos, 45000000);
  assert.equal(r.diferencaNaoAlocadaCentavos, 0);
  assert.deepEqual(r.destinosReferenciaisCentavos, {
    LOOP_CENTRO: 22500000, LOOP_ESQUERDA: 15000000,
    LOOP_DIREITA: 7500000, LOOP_DOURADAS: 0
  });
  assert.equal(r.centroInicialFundadorCentavos, 75000);
  assert.equal(r.centrosDeClientesSemFundadorCentavos, 22425000);
  assert.equal(r.convitesValidados, 480);
  assert.equal(r.bonusUnitarioHipoteticoCentavos, 2500);
  assert.equal(r.bonusIndicacaoHipoteticoCentavos, 1200000);
  assert.equal(r.saldoReservaAposBonusHipoteticoCentavos, 6300000);
  assert.equal(r.posicoesNoTabuleiro, 7);
  assert.equal(r.aguardando, 1494);
  assert.equal(r.posicoesPendentes, 1501);
  assert.equal(r.beneficioTeoricoFuturoSeTodasConcluissemCentavos, 112575000);
  assert.equal(r.lucroLiquidoCalculado, false);
  assert.equal(r.caixaBancarioVerificado, false);
  assert.equal(r.pagamentosReais, 0);
  assert.equal(r.saquesReais, 0);
  assert.equal(r.registroGiros.length, 300);
  assert.equal(r.registroGiros.reduce((n, g) => n + g.comprasDistintas, 0), 1800);
  assert.deepEqual(
    r.registroGiros.map(x => x.posicaoCentroId).filter(x => x === 1),
    [1]
  );
  const uniqueEvents = new Set(r.registroGiros.flatMap(g =>
    g.eventos.map(v => v.compraId)));
  assert.equal(uniqueEvents.size, 1800);
  for (const g of r.registroGiros) {
    assert.equal(g.eventos.length, 6);
    assert.deepEqual(g.eventos.map(e => e.etapa), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(g.eventos.map(e => e.destino), [
      'LOOP_CENTRO', 'LOOP_ESQUERDA', 'LOOP_CENTRO',
      'LOOP_DIREITA', 'LOOP_CENTRO', 'LOOP_ESQUERDA'
    ]);
    assert.deepEqual(g.destinoNoGiroCentavos, {
      LOOP_CENTRO: 75000, LOOP_ESQUERDA: 50000,
      LOOP_DIREITA: 25000, LOOP_DOURADAS: 0
    });
    assert.equal(g.acumuladoCentavos.LOOP_CENTRO, g.giro * 75000);
    assert.equal(g.acumuladoCentavos.LOOP_ESQUERDA, g.giro * 50000);
    assert.equal(g.acumuladoCentavos.LOOP_DIREITA, g.giro * 25000);
  }
  const csv = csvGiros(r).trimEnd().split('\n');
  assert.equal(csv.length, 301);
  assert.match(csv[0], /^giro,posicao_centro_id,compras_pdf,/);
  assert.match(csv[1], /^1,1,6,75000,50000,25000,0,/);
  assert.match(csv.at(-1), /^300,\d+,6,75000,50000,25000,0,22500000,15000000,7500000,0$/);
  console.log('CAIXA_PDF_300_GIROS=' + JSON.stringify({
    pdfs: r.quantidadePdfSimulada, centros: r.giros,
    faturamentoHipotetico: r.faturamentoBrutoHipoteticoCentavos,
    destinos: r.destinosReferenciaisCentavos,
    bonusHipotetico: r.bonusIndicacaoHipoteticoCentavos,
    reservaAposBonusHipotetico: r.saldoReservaAposBonusHipoteticoCentavos,
    posicoesPendentes: r.posicoesPendentes,
    giro300: r.registroGiros.at(-1).acumuladoCentavos
  }));
});

test('V6 PDFs: somente 30 vendas iniciais geram cinco giros e caixa proporcional', () => {
  const r = executarRelatorioCaixaPdfV6({ ondasAdicionais: 0 });
  assert.equal(r.quantidadePdfSimulada, 30);
  assert.equal(r.giros, 5);
  assert.equal(r.faturamentoBrutoHipoteticoCentavos, 750000);
  assert.deepEqual(r.destinosReferenciaisCentavos, {
    LOOP_CENTRO: 375000, LOOP_ESQUERDA: 250000,
    LOOP_DIREITA: 125000, LOOP_DOURADAS: 0
  });
  assert.equal(r.convitesValidados, 8);
  assert.equal(r.bonusIndicacaoHipoteticoCentavos, 20000);
  assert.equal(r.saldoReservaAposBonusHipoteticoCentavos, 105000);
  assert.equal(r.posicoesPendentes, 26);
  assert.equal(r.registroGiros.length, 5);
});

test('V6 PDFs: recusar eventos duplicados, destino falsificado e resumo inconsistente', () => {
  const criar = () => executarLancamento30Dias({
    ondasAdicionais: 0, incluirHistoricoFinanceiro: true
  });
  const semHistorico = executarLancamento30Dias({ ondasAdicionais: 0 });
  assert.throws(() => auditarCaixaPdfV6({ lancamento: semHistorico }),
    /historico do proprio motor/);
  let v = criar();
  v.historicoFinanceiro[0].eventos[1].vendaId =
    v.historicoFinanceiro[0].eventos[0].vendaId;
  assert.throws(() => auditarCaixaPdfV6({ lancamento: v }),
    /repetido ou fora de ordem/);
  v = criar();
  v.historicoFinanceiro[0].eventos[2].destinoCofre = 'LOOP_DIREITA';
  assert.throws(() => auditarCaixaPdfV6({ lancamento: v }),
    /Destino do cofre divergente/);
  v = criar();
  v.aguardandoNaFila += 1;
  assert.throws(() => auditarCaixaPdfV6({ lancamento: v }),
    /conservacao de posicoes divergem/);
  v = criar();
  v.historicoFinanceiro.pop();
  assert.throws(() => auditarCaixaPdfV6({ lancamento: v }),
    /Ciclo|conservacao de posicoes/);
});
