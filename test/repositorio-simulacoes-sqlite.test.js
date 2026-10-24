'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { SimuladorLoop } = require('../src/domain/simulador-loop');
const { RepositorioSimulacoesSQLite } = require('../src/domain/repositorio-simulacoes-sqlite');

function base(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-sqlite-teste-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'simulacao.sqlite');
}
function exemplo() {
  const loop = new SimuladorLoop();
  for (let i=1; i<=9; i++) {
    loop.registrarPosicaoSimulada({ participanteId:'p'+i, vendaId:'pedido-'+i });
  }
  loop.registrarIndicacaoSimulada({
    indicadorId:'p9', eventoId:'indicacao-p9',
    convidouEm:'2026-10-14T10:00:00Z'
  });
  loop.prepararTabuleiro();
  return loop;
}
function completarCiclo(loop, prefixo) {
  for (let i=1; i<=6; i++) {
    loop.registrarVendaNoCicloSimulada({ vendaId:prefixo+'-'+i });
  }
}

test('SQLite salva estado e recupera apos fechar e reabrir o banco', (t) => {
  const caminho = base(t);
  const loop = exemplo();
  loop.registrarVendaNoCicloSimulada({ vendaId:'c1-1' });
  loop.registrarVendaNoCicloSimulada({ vendaId:'c1-2' });
  const original = loop.exportarSnapshot();
  let repo = new RepositorioSimulacoesSQLite({ caminho });
  const gravacao = repo.salvar({ id:'simulacao-1', simulador:loop, revisaoEsperada:0 });
  assert.equal(gravacao.revisao,1);
  repo.fechar();

  assert.equal(fs.existsSync(caminho), true);
  repo = new RepositorioSimulacoesSQLite({ caminho });
  const lido = repo.recuperar({ id:'simulacao-1' });
  assert.deepEqual(lido.simulador.exportarSnapshot(),original);
  assert.equal(lido.revisao,1);
  assert.equal(lido.simulador.registrarVendaNoCicloSimulada({ vendaId:'c1-1' }).repetida,true);
  assert.equal(lido.simulador.registrarPosicaoSimulada({ participanteId:'p1',vendaId:'pedido-1' }).repetida,true);
  for (let i=3;i<=6;i++)lido.simulador.registrarVendaNoCicloSimulada({vendaId:'c1-'+i});
  assert.equal(lido.simulador.tentarGiro().motivo,'CATRACA_PAUSADA');
  lido.simulador.abrirCatraca();
  assert.equal(lido.simulador.tentarGiro().girou,true);
  assert.equal(lido.simulador.estado().tabuleiro.ciclosConcluidos,1);
  assert.equal(repo.salvar({
    id:'simulacao-1', simulador:lido.simulador, revisaoEsperada:lido.revisao
  }).revisao,2);
  repo.fechar();

  repo = new RepositorioSimulacoesSQLite({ caminho });
  const final = repo.recuperar({ id:'simulacao-1' });
  assert.equal(final.revisao,2);
  assert.equal(final.simulador.estado().tabuleiro.ciclosConcluidos,1);
  assert.equal(final.simulador.registrarVendaNoCicloSimulada({ vendaId:'c1-5' }).repetida,true);
  repo.fechar();
});

test('duas instancias nao sobrescrevem estado antigo silenciosamente', (t) => {
  const caminho = base(t);
  const repo1 = new RepositorioSimulacoesSQLite({ caminho });
  const repo2 = new RepositorioSimulacoesSQLite({ caminho });
  t.after(()=>{repo1.fechar();repo2.fechar();});
  const loop = exemplo();
  repo1.salvar({id:'disputa',simulador:loop,revisaoEsperada:0});
  const copia1 = repo1.recuperar({id:'disputa'});
  const copia2 = repo2.recuperar({id:'disputa'});

  copia1.simulador.registrarVendaNoCicloSimulada({vendaId:'venda-concorrente-A'});
  assert.equal(repo1.salvar({
    id:'disputa',simulador:copia1.simulador,revisaoEsperada:copia1.revisao
  }).revisao,2);

  copia2.simulador.registrarVendaNoCicloSimulada({vendaId:'venda-concorrente-B'});
  assert.throws(()=>repo2.salvar({
    id:'disputa',simulador:copia2.simulador,revisaoEsperada:copia2.revisao
  }),/Conflito de revisao/);
  assert.deepEqual(repo2.recuperar({id:'disputa'}).simulador.exportarSnapshot(),
    copia1.simulador.exportarSnapshot());
});

test('id invalido e gravacao sem revisao esperada sao recusados', (t) => {
  const caminho = base(t);
  const repo = new RepositorioSimulacoesSQLite({ caminho });
  t.after(()=>repo.fechar());
  assert.equal(repo.recuperar({id:'nao-existe'}),null);
  assert.throws(()=>repo.recuperar({id:'../arquivo'}),/Identificador/);
  assert.throws(()=>repo.salvar({id:'teste',simulador:exemplo()}),/revisaoEsperada/);
  assert.throws(()=>repo.salvar({
    id:'teste',simulador:exemplo(),revisaoEsperada:1
  }),/Conflito de revisao/);
  assert.equal(repo.recuperar({id:'teste'}),null);
});

test('estado corrompido nao e recuperado como se fosse valido', (t) => {
  const caminho = base(t);
  const repo = new RepositorioSimulacoesSQLite({ caminho });
  const loop = exemplo();
  repo.salvar({id:'corrompido',simulador:loop,revisaoEsperada:0});
  repo.fechar();

  // Injetar registro inconsistente diretamente para simular falha de armazenamento.
  const db = new DatabaseSync(caminho);
  const snapshot = loop.exportarSnapshot();
  snapshot.tabuleiro.vagas[0] = snapshot.tabuleiro.centro;
  db.prepare('UPDATE simulacoes_loop SET estado_json = ? WHERE id = ?')
    .run(JSON.stringify(snapshot),'corrompido');
  db.close();

  const outra = new RepositorioSimulacoesSQLite({ caminho });
  t.after(()=>outra.fechar());
  assert.throws(()=>outra.recuperar({id:'corrompido'}),/Snapshot LOOP invalido/);
});

test('esquema desconhecido nao e carregado', (t) => {
  const caminho = base(t);
  const db = new DatabaseSync(caminho);
  db.exec('PRAGMA user_version=99');
  db.close();
  assert.throws(()=>new RepositorioSimulacoesSQLite({ caminho }),/nao suportada/);
});

test('arquivo SQLite tem permissao restrita em sistemas Unix', (t) => {
  const caminho = base(t);
  const repo = new RepositorioSimulacoesSQLite({ caminho });
  const modo = fs.statSync(caminho).mode & 0o777;
  if (process.platform !== 'win32') assert.equal(modo,0o600);
  repo.fechar();
});
