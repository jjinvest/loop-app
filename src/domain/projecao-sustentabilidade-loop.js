'use strict';

// SIMULACAO MATEMATICA ISOLADA. NAO autoriza credito, saldo, saque,
// receita contabil ou promessa de contemplacao. Nenhum dado real.
const CENTAVOS_FILA_POR_VENDA = 10000;
const CENTAVOS_CENTRO_POR_CICLO = 30000;
const CENTAVOS_EMPRESA_POR_CICLO = 20000;
const VENDAS_POR_CICLO = 5;
const POSICOES_PARA_INICIAR = 6;
const MAX_PERIODOS = 240;

function inteiro(valor, campo, { minimo = 0, maximo = 10000000 } = {}) {
  if (!Number.isSafeInteger(valor) || valor < minimo || valor > maximo) {
    throw new Error(campo + ' deve ser inteiro no intervalo permitido');
  }
  return valor;
}
function seguro(valor, campo) {
  if (!Number.isSafeInteger(valor)) {
    throw new Error('Estouro numerico no calculo de ' + campo);
  }
  return valor;
}
function multiplicar(a, b, campo) { return seguro(a * b, campo); }
function somar(a, b, campo) { return seguro(a + b, campo); }

function camposDoPeriodo(periodo, indice) {
  if (!periodo || typeof periodo !== 'object' || Array.isArray(periodo)) {
    throw new Error('Periodo ' + indice + ' invalido');
  }
  const v = nome => inteiro(periodo[nome], 'periodos[' + indice + '].' + nome);
  const vendasValidas = v('vendasValidas');
  const vendasReembolsadas = v('vendasReembolsadas');
  const precoCentavos = v('precoCentavos');
  const custoFornecedorCentavos = v('custoFornecedorCentavos');
  const impostosCentavos = v('impostosCentavos');
  const tarifaPagamentoCentavos = v('tarifaPagamentoCentavos');
  const despesaOperacionalCentavos = v('despesaOperacionalCentavos');
  const custoEstornoNaoRecuperavelCentavos = v('custoEstornoNaoRecuperavelCentavos');
  if ((vendasValidas || vendasReembolsadas) && precoCentavos === 0) {
    throw new Error('Preco unitario deve ser positivo quando ha vendas');
  }
  if (vendasValidas > 0 && precoCentavos < CENTAVOS_FILA_POR_VENDA) {
    throw new Error('Preco menor que a parcela hipotetica de R$100 da fila');
  }
  return {
    periodo: typeof periodo.rotulo === 'string' && periodo.rotulo.length <= 70
      ? periodo.rotulo : 'Periodo ' + (indice + 1),
    vendasValidas, vendasReembolsadas, precoCentavos,
    custoFornecedorCentavos, impostosCentavos,
    tarifaPagamentoCentavos, despesaOperacionalCentavos,
    custoEstornoNaoRecuperavelCentavos
  };
}

function contarEventosPorDestino(totalEventos) {
  const ciclos = Math.floor(totalEventos / VENDAS_POR_CICLO);
  const restantes = totalEventos % VENDAS_POR_CICLO;
  return {
    ciclos,
    eventosCentro: seguro(ciclos * 3 + Math.ceil(restantes / 2), 'eventosCentro'),
    eventosEmpresa: seguro(ciclos * 2 + Math.floor(restantes / 2), 'eventosEmpresa')
  };
}

/**
 * Modelo agregado com periodos sequenciais. Cada venda valida cria UMA
 * posicao. As primeiras seis posicoes, caso nao existam, preenchem
 * centro + cinco vagas e NAO contam como eventos do primeiro ciclo.
 * Quando o tabuleiro ja esta preenchido, cada nova venda representa
 * um evento de ciclo. 'posicoesPendentes' inclui ate seis posicoes
 * no tabuleiro, nao somente a fila, e nao significa pessoas unicas.
 * Nao modela indicacoes, ordem A/B, saques ou
 * reversao de posicao por estorno tardio.
 */
function projetarSustentabilidade({ posicoesIniciais = 0, periodos } = {}) {
  inteiro(posicoesIniciais, 'posicoesIniciais');
  if (!Array.isArray(periodos) || periodos.length === 0 || periodos.length > MAX_PERIODOS) {
    throw new Error('Informe de 1 a 240 periodos de simulacao');
  }
  let posicoesPendentes = posicoesIniciais;
  let eventosDeCiclo = 0;
  let vendasAcumuladas = 0;
  let reembolsosAcumulados = 0;
  let receitaLiquidaAcumulada = 0;
  let contribuicaoAcumulada = 0;
  let margemAposReservaFilaAcumulada = 0;
  let totalReservadoFila = 0;
  let eventosCentroAnterior = 0;
  let eventosEmpresaAnterior = 0;
  let centrosConcluidosAnterior = 0;
  const linhas = [];

  for (let i = 0; i < periodos.length; i++) {
    const p = camposDoPeriodo(periodos[i], i);
    const { vendasValidas:s, vendasReembolsadas:r, precoCentavos:preco } = p;
    const vendasTotais = somar(s, r, 'vendasTotais');
    const receitaBruta = multiplicar(vendasTotais, preco, 'receitaBruta');
    const reembolsosIntegrais = multiplicar(r, preco, 'reembolsosIntegrais');
    const receitaLiquida = seguro(receitaBruta - reembolsosIntegrais, 'receitaLiquida');
    const custoUnitario = seguro(
      p.custoFornecedorCentavos + p.impostosCentavos +
      p.tarifaPagamentoCentavos + p.despesaOperacionalCentavos,
      'custoUnitario'
    );
    const custosDeVendasValidas = multiplicar(s, custoUnitario, 'custosDeVendasValidas');
    const perdaDeEstornos = multiplicar(r, p.custoEstornoNaoRecuperavelCentavos, 'perdaDeEstornos');
    const custosTotais = somar(custosDeVendasValidas, perdaDeEstornos, 'custosTotais');
    const contribuicaoAntesDaFila = seguro(receitaLiquida - custosTotais, 'contribuicaoAntesDaFila');

    // Os pedidos ja reembolsados no proprio periodo nao geram posicoes.
    // Cancelamentos posteriores sao um problema separado, nao simulado.
    let usadasParaMontarTabuleiro = 0;
    if (posicoesPendentes < POSICOES_PARA_INICIAR) {
      usadasParaMontarTabuleiro = Math.min(
        s, POSICOES_PARA_INICIAR - posicoesPendentes
      );
    }
    const vendasContadasNoCiclo = s - usadasParaMontarTabuleiro;
    posicoesPendentes = somar(posicoesPendentes, s, 'posicoesPendentes');
    eventosDeCiclo = somar(eventosDeCiclo, vendasContadasNoCiclo, 'eventosDeCiclo');
    const destinos = contarEventosPorDestino(eventosDeCiclo);
    const concluidos = destinos.ciclos - centrosConcluidosAnterior;
    posicoesPendentes = seguro(posicoesPendentes - concluidos, 'posicoesPendentes');
    const eventosCentroNovos = destinos.eventosCentro - eventosCentroAnterior;
    const eventosEmpresaNovos = destinos.eventosEmpresa - eventosEmpresaAnterior;
    const parcelaFila = multiplicar(s, CENTAVOS_FILA_POR_VENDA, 'parcelaFila');
    const parcelasCentro = multiplicar(eventosCentroNovos, CENTAVOS_FILA_POR_VENDA, 'parcelasCentro');
    const parcelasEmpresa = multiplicar(eventosEmpresaNovos, CENTAVOS_FILA_POR_VENDA, 'parcelasEmpresa');
    const margemComercialAposReservaFila = seguro(
      contribuicaoAntesDaFila - parcelaFila,
      'margemComercialAposReservaFila'
    );

    totalReservadoFila = somar(totalReservadoFila, parcelaFila, 'totalReservadoFila');
    vendasAcumuladas = somar(vendasAcumuladas, s, 'vendasAcumuladas');
    reembolsosAcumulados = somar(reembolsosAcumulados, r, 'reembolsosAcumulados');
    receitaLiquidaAcumulada = somar(
      receitaLiquidaAcumulada, receitaLiquida, 'receitaLiquidaAcumulada'
    );
    contribuicaoAcumulada = somar(
      contribuicaoAcumulada, contribuicaoAntesDaFila, 'contribuicaoAcumulada'
    );
    margemAposReservaFilaAcumulada = somar(
      margemAposReservaFilaAcumulada, margemComercialAposReservaFila,
      'margemAposReservaFilaAcumulada'
    );

    const saldoFilaSemDestinacao = seguro(
      totalReservadoFila -
      (destinos.eventosCentro + destinos.eventosEmpresa) * CENTAVOS_FILA_POR_VENDA,
      'saldoFilaSemDestinacao'
    );
    linhas.push({
      periodo:p.periodo,
      vendasValidas:s,
      vendasReembolsadas:r,
      receitaBrutaCentavos:receitaBruta,
      reembolsosIntegraisCentavos:reembolsosIntegrais,
      receitaLiquidaCentavos:receitaLiquida,
      custosTotaisCentavos:custosTotais,
      contribuicaoAntesDaFilaCentavos:contribuicaoAntesDaFila,
      reservaFilaCentavos:parcelaFila,
      margemComercialAposReservaFilaCentavos:margemComercialAposReservaFila,
      parcelasCentroReferenciaisCentavos:parcelasCentro,
      parcelasEmpresaReferenciaisCentavos:parcelasEmpresa,
      novasPosicoes:s,
      usadasParaMontarTabuleiro,
      eventosDoCiclo:vendasContadasNoCiclo,
      ciclosConcluidos:concluidos,
      posicoesPendentes,
      // Cenarios agregados: estimativas de contagem, nao simulacao
      // da ordem real, de indicacoes nem da identidade de pessoas.
      posicoesNoTabuleiroEstimadas:Math.min(posicoesPendentes,POSICOES_PARA_INICIAR),
      posicoesAguardandoFilaEstimadas:Math.max(0,posicoesPendentes-POSICOES_PARA_INICIAR),
      saldoFilaSemDestinacaoCentavos:saldoFilaSemDestinacao,
      alertaMargemInsuficiente: margemComercialAposReservaFila < 0
    });
    centrosConcluidosAnterior = destinos.ciclos;
    eventosCentroAnterior = destinos.eventosCentro;
    eventosEmpresaAnterior = destinos.eventosEmpresa;
  }

  const finalDestinos = contarEventosPorDestino(eventosDeCiclo);
  return {
    modo:'PROJECAO_HIPOTETICA_SEM_PAGAMENTOS',
    hipotese:'Cinco vendas por ciclo, uma nova posicao por venda; seis posicoes para iniciar',
    premissas:{
      parcelaFilaPorVendaCentavos:CENTAVOS_FILA_POR_VENDA,
      referenciaCentroPorCicloCentavos:CENTAVOS_CENTRO_POR_CICLO,
      referenciaEmpresaPorCicloCentavos:CENTAVOS_EMPRESA_POR_CICLO,
      posicoesIniciais,
      posicoesIniciaisIncluemTabuleiro:true,
      compradoresRepetidosContamPorCompra:true,
      posicoesIniciaisSemCaixaModelado:true,
      estornosApenasDoMesmoPeriodo:true,
      taxasDeSaqueNaoModeladas:true,
      direitosAdquiridosENovaPosicaoAposEstornoNaoModelados:true,
      ciclosSempreElegiveisParaGiro:true
    },
    resumo:{
      vendasValidas:vendasAcumuladas,
      vendasReembolsadas:reembolsosAcumulados,
      receitaLiquidaCentavos:receitaLiquidaAcumulada,
      contribuicaoAntesDaFilaCentavos:contribuicaoAcumulada,
      reservaFilaCentavos:totalReservadoFila,
      margemComercialAposReservaFilaCentavos:margemAposReservaFilaAcumulada,
      parcelasCentroReferenciaisCentavos:multiplicar(finalDestinos.eventosCentro,
        CENTAVOS_FILA_POR_VENDA,'totalCentro'),
      parcelasEmpresaReferenciaisCentavos:multiplicar(finalDestinos.eventosEmpresa,
        CENTAVOS_FILA_POR_VENDA,'totalEmpresa'),
      saldoFilaSemDestinacaoCentavos:seguro(
        totalReservadoFila - eventosDeCiclo * CENTAVOS_FILA_POR_VENDA,
        'saldoFilaSemDestinacao'
      ),
      ciclosConcluidos:centrosConcluidosAnterior,
      posicoesCriadas:vendasAcumuladas,
      posicoesPendentes,
      posicoesNoTabuleiroEstimadas:Math.min(posicoesPendentes,POSICOES_PARA_INICIAR),
      posicoesAguardandoFilaEstimadas:Math.max(0,posicoesPendentes-POSICOES_PARA_INICIAR),
      eventosEmCicloIncompleto:eventosDeCiclo % VENDAS_POR_CICLO,
      exposicaoTeoricaSeTodasAsPosicoesRecebessemCentroCentavos:
        multiplicar(posicoesPendentes,CENTAVOS_CENTRO_POR_CICLO,'exposicaoTeorica')
    },
    periodos:linhas,
    alertas:[
      'Nao comprova lucro, liquidez, rentabilidade nem viabilidade juridica.',
      'Reservas e parcelas da empresa sao destinos do mesmo valor, nunca nova receita.',
      'Posicoes pendentes incluem tabuleiro e fila; nao equivalem a pessoas unicas nem automaticamente a dividas exigiveis.',
      'As posicoes iniciais sao um retrato hipotetico posterior a operacao, nunca 10 mil posicoes no lancamento.',
      'Saques, taxas de saque, reservas antigas, cancelamento tardio e obrigacoes legais nao foram simulados.',
      'Crescimento de filas depende de novas vendas; parar vendas paralisa novos ciclos nesta hipotese.'
    ]
  };
}

module.exports = {
  projetarSustentabilidade,
  CENTAVOS_FILA_POR_VENDA,
  CENTAVOS_CENTRO_POR_CICLO,
  CENTAVOS_EMPRESA_POR_CICLO
};
