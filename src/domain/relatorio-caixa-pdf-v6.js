'use strict';

// Somente auditoria MATEMATICA de compras PDF hipoteticas: nunca dinheiro,
// credito, lucro, extrato bancario ou autorizacao de saque.
const { cofreDoEvento } = require('./destino-financeiro-centro-loop');

function inteiro(valor, campo, minimo = 0) {
  if (!Number.isSafeInteger(valor) || valor < minimo)
    throw new TypeError(campo + ' precisa ser um inteiro seguro');
  return valor;
}
function adicionar(a, b, campo) {
  const total = a + b;
  if (!Number.isSafeInteger(total)) throw new RangeError('Estouro em ' + campo);
  return total;
}
function multiplicar(a, b, campo) {
  const total = a * b;
  if (!Number.isSafeInteger(total)) throw new RangeError('Estouro em ' + campo);
  return total;
}

// Recebe O HISTORICO PRODUZIDO PELO MOTOR, nao somente 300*6.
// Conferencia 1:1 entre compras e eventos; historico nao pode conter 2 vezes a
// mesma compra. O preço do PDF e ficticio e igual para todas as compras.
function auditarCaixaPdfV6({
  lancamento,
  precoPdfCentavos = 25000,
  percentualComissaoIndicacao = 10
} = {}) {
  inteiro(precoPdfCentavos, 'precoPdfCentavos', 1);
  inteiro(percentualComissaoIndicacao, 'percentualComissaoIndicacao');
  if (percentualComissaoIndicacao > 100)
    throw new RangeError('Percentual de comissao invalido');
  if (!lancamento || lancamento.modo !==
      'SIMULACAO_DE_LANCAMENTO_CONDICIONAL_SEM_DINHEIRO' ||
      !Array.isArray(lancamento.historicoFinanceiro))
    throw new TypeError('Exige historico do proprio motor LOOP V6');
  const historico = lancamento.historicoFinanceiro;
  const compras = inteiro(lancamento.comprasQualificadas, 'comprasQualificadas');
  const giros = inteiro(lancamento.giros, 'giros');
  const indicacoes = inteiro(lancamento.convitesTotais, 'convitesTotais');
  const aguardando = inteiro(lancamento.aguardandoNaFila, 'aguardandoNaFila');
  const posicoes = inteiro(lancamento.posicoesTotaisIncluindoFundador,
    'posicoesTotaisIncluindoFundador');
  if (giros !== historico.length ||
      compras !== lancamento.eventosValidos ||
      indicacoes > compras || posicoes !== compras + 1 ||
      aguardando + lancamento.noTabuleiro + giros !== posicoes)
    throw new Error('Resumo do lancamento e conservacao de posicoes divergem');

  const destinos = {
    LOOP_CENTRO: 0, LOOP_ESQUERDA: 0,
    LOOP_DIREITA: 0, LOOP_DOURADAS: 0
  };
  const vistos = new Set();
  const centros = new Set();
  const acumulado = { ...destinos };
  const registroGiros = [];
  let valorFundadorCentavos = 0;
  for (const [i, ciclo] of historico.entries()) {
    if (!ciclo || ciclo.giro !== i + 1 ||
        !Number.isSafeInteger(ciclo.posicaoCentroId) ||
        centros.has(ciclo.posicaoCentroId) ||
        !Array.isArray(ciclo.eventos) || ciclo.eventos.length !== 6 ||
        typeof ciclo.centroEmpresa !== 'boolean')
      throw new Error('Ciclo invalido, repetido ou incompleto');
    centros.add(ciclo.posicaoCentroId);
    const porGiro = { ...destinos };
    const eventos = [];
    for (const [j, evento] of ciclo.eventos.entries()) {
      if (!evento || typeof evento.vendaId !== 'string' ||
          !evento.vendaId.trim() || vistos.has(evento.vendaId) ||
          evento.ordem !== j + 1)
        throw new Error('Evento repetido ou fora de ordem');
      vistos.add(evento.vendaId);
      const correto = cofreDoEvento({
        posicaoCentro: { empresa: ciclo.centroEmpresa },
        ordem: evento.ordem
      });
      if (evento.destinoCofre !== correto ||
          !Object.hasOwn(destinos, correto))
        throw new Error('Destino do cofre divergente do motor');
      porGiro[correto] = adicionar(
        porGiro[correto], precoPdfCentavos, 'destino por giro'
      );
      acumulado[correto] = adicionar(
        acumulado[correto], precoPdfCentavos, 'destino acumulado'
      );
      eventos.push({
        compraId: evento.vendaId, etapa: evento.ordem,
        destino: correto, valorReferencialCentavos: precoPdfCentavos
      });
    }
    if (i === 0) {
      if (ciclo.posicaoCentroId !== 1)
        throw new Error('Fundador deveria ocupar o primeiro centro do teste');
      valorFundadorCentavos = porGiro.LOOP_CENTRO;
    }
    registroGiros.push({
      giro: ciclo.giro,
      posicaoCentroId: ciclo.posicaoCentroId,
      centroEmpresa: ciclo.centroEmpresa,
      comprasDistintas: eventos.length,
      eventos,
      destinoNoGiroCentavos: porGiro,
      acumuladoCentavos: { ...acumulado }
    });
  }
  if (vistos.size !== compras || vistos.size !== giros * 6)
    throw new Error('Quantidade de compras e eventos nao coincide 1:1');
  for (const k of Object.keys(destinos)) destinos[k] = acumulado[k];

  const faturamentoBrutoHipoteticoCentavos =
    multiplicar(compras, precoPdfCentavos, 'faturamento bruto');
  const totalAlocadoCentavos = Object.values(destinos)
    .reduce((n, v) => adicionar(n, v, 'total destinos'), 0);
  if (totalAlocadoCentavos !== faturamentoBrutoHipoteticoCentavos)
    throw new Error('Distribuicao ficticia nao confere com as compras');
  const bonusUnitarioHipoteticoCentavos =
    Math.round(precoPdfCentavos * percentualComissaoIndicacao / 100);
  const bonusIndicacaoHipoteticoCentavos = multiplicar(
    indicacoes, bonusUnitarioHipoteticoCentavos, 'bonus de indicacao'
  );
  const saldoReservaAposBonusHipoteticoCentavos =
    destinos.LOOP_DIREITA - bonusIndicacaoHipoteticoCentavos;
  const posicoesPendentes = posicoes - giros;
  const beneficioTeoricoFuturoSeTodasConcluissemCentavos =
    multiplicar(posicoesPendentes,
      multiplicar(precoPdfCentavos, 3, 'tres parcelas de centro'),
      'exposicao teorica de fila');

  return {
    modo: 'CAIXA_PDF_REFERENCIAL_SEM_DINHEIRO_REAL',
    premissa: 'Todas as compras qualificadas sao PDF a R$250: uma compra, uma posicao, um evento.',
    precoPdfCentavos, quantidadePdfSimulada: compras,
    giros, centrosConcluidos: giros, totalEventos: vistos.size,
    posicoesCompradas: compras, fundadorSemCompra: 1,
    posicoesNoTabuleiro: lancamento.noTabuleiro,
    aguardando, posicoesPendentes,
    faturamentoBrutoHipoteticoCentavos,
    destinosReferenciaisCentavos: destinos,
    totalAlocadoCentavos,
    diferencaNaoAlocadaCentavos:
      faturamentoBrutoHipoteticoCentavos - totalAlocadoCentavos,
    centrosDeClientesSemFundadorCentavos:
      destinos.LOOP_CENTRO - valorFundadorCentavos,
    centroInicialFundadorCentavos: valorFundadorCentavos,
    convitesValidados: indicacoes,
    bonusUnitarioHipoteticoCentavos,
    bonusIndicacaoHipoteticoCentavos,
    saldoReservaAposBonusHipoteticoCentavos,
    beneficioTeoricoFuturoSeTodasConcluissemCentavos,
    // Nao supor taxas de saque, tributos, custo da plataforma, repasses nem estornos.
    lucroLiquidoCalculado: false,
    custosOperacionaisIncluidos: false,
    impostosIncluidos: false,
    custosDoPdfIncluidos: false,
    taxasGatewayIncluidas: false,
    taxasDeSaqueIncluidas: false,
    estornosIncluidos: false,
    pagamentosReais: 0, saquesReais: 0,
    caixaBancarioVerificado: false,
    registroGiros
  };
}
module.exports = { auditarCaixaPdfV6 };
