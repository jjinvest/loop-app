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
      '; posicoes pendentes=' + linha.posicoesPendentes +
      '; margem apos reservar parcela da fila=' +
      reais(linha.margemComercialAposReservaFilaCentavos) + '\n'
    );
  }
  process.stdout.write(
    'Centros concluidos no total=' + resultado.resumo.ciclosConcluidos +
    '; posicoes ainda pendentes=' + resultado.resumo.posicoesPendentes +
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
  imprimirCenario('Fila inicial de 5 mil, vendas desacelerando',5000,[1000,800,500,0]);
  imprimirCenario('Fila inicial de 10 mil, vendas desacelerando',10000,[100,50,10,0]);
}

module.exports = { criarPeriodo, imprimirCenario };
