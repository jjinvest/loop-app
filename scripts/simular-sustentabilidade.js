'use strict';

// Executar em terminal: npm run simular:sustentabilidade
// Cenarios sao inteiramente ficticios; nao le dados de clientes.
const { projetarSustentabilidade } =
  require('../src/domain/projecao-sustentabilidade-loop');

function criarPeriodo(rotulo, vendasValidas, precoCentavos = 25000) {
  return {
    rotulo, vendasValidas, vendasReembolsadas:0,
    precoCentavos, custoFornecedorCentavos:9000,
    impostosCentavos:2000, tarifaPagamentoCentavos:800,
    despesaOperacionalCentavos:700,
    custoEstornoNaoRecuperavelCentavos:2500
  };
}
function reais(centavos) {
  return 'R$ ' + (centavos / 100).toFixed(2).replace('.', ',');
}
function imprimirCenario(nome, posicoesIniciais, quantidades, precoCentavos = 25000) {
  const periodos = quantidades.map((q,i)=>criarPeriodo('Mes ' + (i+1),q,precoCentavos));
  const resultado = projetarSustentabilidade({ posicoesIniciais, periodos });
  process.stdout.write('\n=== ' + nome + ' (HIPOTESE, NAO PREVISAO) ===\n');
  for(const linha of resultado.periodos) {
    process.stdout.write(
      linha.periodo + ': vendas validas=' + linha.vendasValidas +
      '; centros concluidos=' + linha.ciclosConcluidos +
      '; posicoes ativas (fila + tabuleiro)=' + linha.posicoesPendentes +
      '; aguardando na fila=' + linha.posicoesAguardandoFilaEstimadas +
      '; margem apos reservar parcela da fila=' +
      reais(linha.margemComercialAposReservaFilaCentavos) + '\n'
    );
  }
  process.stdout.write(
    'Centros concluidos no total=' + resultado.resumo.ciclosConcluidos +
    '; posicoes ativas nao concluidas=' + resultado.resumo.posicoesPendentes +
    '; na fila=' + resultado.resumo.posicoesAguardandoFilaEstimadas +
    '; parcela referencial centro=' +
    reais(resultado.resumo.parcelasCentroReferenciaisCentavos) +
    '; parcela referencial empresa=' +
    reais(resultado.resumo.parcelasEmpresaReferenciaisCentavos) +
    '; reserva da fila=' + reais(resultado.resumo.reservaFilaCentavos) +
    '; margem comercial residual hipotetica=' +
    reais(resultado.resumo.margemComercialAposReservaFilaCentavos) + '\n'
  );
  return resultado;
}

if (require.main === module) {
  process.stdout.write(
    'LOOP — LABORATORIO: nenhum saldo, rendimento, saque, lucro ou pagamento real.\n' +
    'As taxas sao exemplos ficticios; nao incluem obrigações legais futuras, saques, estornos tardios ou custos fixos.\n'
  );
  imprimirCenario('Lancamento partindo de ZERO posicoes',0,[10,20,50,100]);
  imprimirCenario('Crescimento partindo de 10 posicoes ja ativas',10,[100,50,20,0]);
  // Stress: 5 mil e 10 mil sao retratos HIPOTETICOS de estagios futuros.
  imprimirCenario('Estagio futuro hipotetico de 5 mil posicoes ativas',5000,[1000,800,500,0]);
  imprimirCenario('Estagio futuro hipotetico de 10 mil posicoes ativas',10000,[100,50,10,0]);
  const produtoExemplo=criarPeriodo('Produto a R$250, fornecedor R$50',5);
  produtoExemplo.custoFornecedorCentavos=5000;
  // ZERO significa que os demais custos NAO foram considerados, nao que haja isencao.
  produtoExemplo.impostosCentavos=0;
  produtoExemplo.tarifaPagamentoCentavos=0;
  produtoExemplo.despesaOperacionalCentavos=0;
  const hipotese = projetarSustentabilidade({posicoesIniciais:6,periodos:[produtoExemplo]});
  process.stdout.write('\n=== PRODUTO R$250 E CUSTO FORNECEDOR R$50 (EXEMPLO BRUTO) ===\n' +
    'Por venda: R$250 recebidos - R$50 ao parceiro - R$100 de referencia da fila = R$100 antes de outros custos e obrigacoes.\n' +
    'Em 5 vendas: ' + reais(hipotese.resumo.margemComercialAposReservaFilaCentavos) +
    ' de diferenca BRUTA hipotetica, sem impostos, operadoras, suporte, perdas e outras obrigacoes modelados.\n');
}

module.exports = { criarPeriodo, imprimirCenario };
