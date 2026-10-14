'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { criarPeriodo, imprimirCenario } =
  require('../scripts/simular-sustentabilidade');

test('relatorio CLI local exibe cenarios sem informar saque ou lucro garantido', () => {
  const script = path.join(__dirname, '..', 'scripts', 'simular-sustentabilidade.js');
  const saida = execFileSync(process.execPath, [script], {encoding:'utf8', timeout:5000});
  assert.match(saida, /LABORATORIO/);
  assert.match(saida, /Fila inicial de 5 mil/);
  assert.match(saida, /Fila inicial de 10 mil/);
  assert.match(saida, /posicoes ainda pendentes/);
  assert.match(saida, /HIPOTESE, NAO PREVISAO/);
  assert.doesNotMatch(saida, /lucro garantido|saque autorizado/i);
});

test('relatorio tem dados demonstrativos e nao depende de rede', () => {
  const p = criarPeriodo('Teste demonstrativo', 100);
  assert.equal(p.vendasValidas,100);
  assert.equal(p.precoCentavos,25000);
  assert.equal(p.vendasReembolsadas,0);
  assert.equal(p.custoEstornoNaoRecuperavelCentavos,2500);
  assert.equal(typeof imprimirCenario,'function');
});
