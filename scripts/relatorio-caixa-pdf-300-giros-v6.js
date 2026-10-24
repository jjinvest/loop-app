'use strict';

const { executarLancamento30Dias } =
  require('./simular-lancamento-30-dias-300-giros-v6');
const { auditarCaixaPdfV6 } =
  require('../src/domain/relatorio-caixa-pdf-v6');

function executarRelatorioCaixaPdfV6({ ondasAdicionais = 59 } = {}) {
  const lancamento = executarLancamento30Dias({
    ondasAdicionais, incluirHistoricoFinanceiro: true
  });
  return auditarCaixaPdfV6({ lancamento });
}
function csvGiros(relatorio) {
  const campos = ['giro', 'posicao_centro_id', 'compras_pdf',
    'destino_centro_centavos', 'destino_investimento_centavos',
    'destino_reserva_centavos', 'destino_douradas_centavos',
    'acumulado_centro_centavos', 'acumulado_investimento_centavos',
    'acumulado_reserva_centavos', 'acumulado_douradas_centavos'];
  const linhas = [campos.join(',')];
  for (const g of relatorio.registroGiros) {
    const d = g.destinoNoGiroCentavos;
    const a = g.acumuladoCentavos;
    linhas.push([
      g.giro, g.posicaoCentroId, g.comprasDistintas,
      d.LOOP_CENTRO, d.LOOP_ESQUERDA, d.LOOP_DIREITA, d.LOOP_DOURADAS,
      a.LOOP_CENTRO, a.LOOP_ESQUERDA, a.LOOP_DIREITA, a.LOOP_DOURADAS
    ].join(','));
  }
  return linhas.join('\n') + '\n';
}

if (require.main === module) {
  try {
    const relatorio = executarRelatorioCaixaPdfV6();
    if (process.argv.includes('--csv')) {
      process.stdout.write(csvGiros(relatorio));
    } else {
      const { registroGiros, ...resumo } = relatorio;
      process.stdout.write(JSON.stringify({
        ...resumo,
        marcos: registroGiros.filter(x =>
          [1, 5, 10, 50, 100, 200, 300].includes(x.giro)),
        ajuda: 'Use --csv para extrato dos 300 giros em centavos'
      }, null, 2) + '\n');
    }
  } catch (erro) {
    process.stderr.write(erro.stack + '\n');
    process.exitCode = 1;
  }
}
module.exports = { executarRelatorioCaixaPdfV6, csvGiros };