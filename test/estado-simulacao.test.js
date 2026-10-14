'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SimuladorLoop } = require('../src/domain/simulador-loop');

function criarCenario() {
  const loop = new SimuladorLoop();
  for (let i=1; i<=10; i++) {
    loop.registrarPosicaoSimulada({ participanteId: 'cliente-'+i, vendaId: 'pedido-'+i });
  }
  loop.registrarIndicacaoSimulada({ indicadorId:'cliente-9',eventoId:'indicacao-9-1',convidouEm:'2026-10-14T09:00:00Z' });
  loop.registrarIndicacaoSimulada({ indicadorId:'cliente-10',eventoId:'indicacao-10-1',convidouEm:'2026-10-14T09:01:00Z' });
  loop.prepararTabuleiro();
  return loop;
}

test('snapshot preserva o tabuleiro, ordem das filas e os eventos de ciclo', () => {
  const loop = criarCenario();
  for(let i=1;i<=3;i++)loop.registrarVendaNoCicloSimulada({vendaId:'ciclo-1-'+i});
  const snapshot=loop.exportarSnapshot();
  assert.equal(snapshot.formato,'LOOP_SIMULADOR_V1');
  const importado=SimuladorLoop.restaurarSnapshot(JSON.parse(JSON.stringify(snapshot)));
  assert.deepEqual(importado.estado(),loop.estado());
  assert.deepEqual(importado.exportarSnapshot(),snapshot);
  assert.equal(importado.tentarGiro().motivo,'CATRACA_PAUSADA');

  // Replays nao criam novas posicoes ou vendas, mesmo depois da restauracao.
  const pedidoAnterior=importado.registrarPosicaoSimulada({participanteId:'cliente-1',vendaId:'pedido-1'});
  assert.equal(pedidoAnterior.repetida,true);
  assert.equal(importado.registrarVendaNoCicloSimulada({vendaId:'ciclo-1-2'}).repetida,true);
  assert.equal(importado.estado().tabuleiro.vendasNoCiclo,3);

  importado.registrarVendaNoCicloSimulada({vendaId:'ciclo-1-4'});
  importado.registrarVendaNoCicloSimulada({vendaId:'ciclo-1-5'});
  assert.equal(importado.tentarGiro().motivo,'CATRACA_PAUSADA');
  importado.abrirCatraca();
  assert.equal(importado.tentarGiro().girou,true);
  assert.equal(importado.estado().catraca.giros,1);
  assert.equal(loop.estado().catraca.giros,0); // cópia completamente isolada
});

test('snapshot apos giro restaura historico e permite iniciar proximo ciclo', () => {
  const loop=criarCenario();
  for(let i=1;i<=5;i++)loop.registrarVendaNoCicloSimulada({vendaId:'c1-'+i});
  loop.abrirCatraca();
  assert.equal(loop.tentarGiro().girou,true);
  loop.pausarCatraca();
  loop.registrarVendaNoCicloSimulada({vendaId:'c2-1'});
  const recuperado=SimuladorLoop.restaurarSnapshot(loop.exportarSnapshot());
  assert.deepEqual(recuperado.estado(),loop.estado());
  for(let i=2;i<=5;i++)recuperado.registrarVendaNoCicloSimulada({vendaId:'c2-'+i});
  assert.equal(recuperado.tentarGiro().motivo,'CATRACA_PAUSADA');
  recuperado.abrirCatraca();
  assert.equal(recuperado.tentarGiro().girou,true);
  assert.equal(recuperado.estado().catraca.giros,2);
  assert.equal(recuperado.registrarVendaNoCicloSimulada({vendaId:'c1-1'}).repetida,true);
});

test('snapshot tem representacao JSON transferivel entre processos (arquivo temporario)', (t) => {
  const loop=criarCenario();
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'loop-snapshot-test-'));
  t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const caminho=path.join(temp,'estado.json');
  fs.writeFileSync(caminho,JSON.stringify(loop.exportarSnapshot()),{encoding:'utf8',flag:'wx'});
  const recuperado=SimuladorLoop.restaurarSnapshot(JSON.parse(fs.readFileSync(caminho,'utf8')));
  assert.deepEqual(recuperado.estado(),loop.estado());
});

test('snapshot danificado ou com versao desconhecida e recusado', () => {
  const loop=criarCenario();
  const base=loop.exportarSnapshot();
  const alterar=(fn)=>{
    const copia=JSON.parse(JSON.stringify(base));
    fn(copia);
    assert.throws(()=>SimuladorLoop.restaurarSnapshot(copia),/Snapshot LOOP invalido/);
  };
  alterar(s=>{s.versao=2;});
  alterar(s=>{s.catraca.giros=3;});
  alterar(s=>{s.filas.sequencia=1;});
  alterar(s=>{s.tabuleiro.vagas[0]=s.tabuleiro.centro;});
  alterar(s=>{s.tabuleiro.vagas=[];});
  alterar(s=>{s.filas.indicacoesProcessadas=[];});
  alterar(s=>{s.filas.filaA[0].fila='B';});
  assert.deepEqual(loop.exportarSnapshot(),base); // dados originais nao alterados
});

test('snapshot vazio tambem pode ser recuperado', () => {
  const loop=new SimuladorLoop();
  const recuperado=SimuladorLoop.restaurarSnapshot(loop.exportarSnapshot());
  assert.deepEqual(recuperado.estado(),loop.estado());
  recuperado.registrarPosicaoSimulada({participanteId:'novo',vendaId:'novo-pedido'});
  assert.equal(recuperado.estado().filas.B.quantidade,1);
});
