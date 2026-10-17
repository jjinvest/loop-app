'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { DatabaseSync } = require('node:sqlite');

const { RepositorioCatalogoSQLite } = require('../src/domain/repositorio-catalogo-sqlite');
const { criarRouterCatalogo } = require('../src/routes/catalogo');

function produto(id, tipo = 'FISICO', estado = 'RASCUNHO') {
  return {
    id,
    nome: 'Produto ' + id,
    tipo,
    estado,
    descricao: 'Modelo de produto para testes isolados do LOOP.',
    precoCentavos: estado === 'PUBLICADO' ? 18000 : null,
    entrega: tipo === 'PDF' ? 'DOWNLOAD_APOS_CONFIRMACAO' : 'FORNECEDOR_INTEGRADO',
    fotos: [],
    videoApresentacaoUrl: null,
    detalhes: ['Testes de cadastro e vitrine']
  };
}
function arquivoTemp(t) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-catalogo-db-'));
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  return path.join(pasta, 'catalogo.sqlite');
}
async function servidor(t, repositorio) {
  const app = express();
  app.use('/catalogo', criarRouterCatalogo({ repositorio }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) =>
    server.close(e => e ? reject(e) : resolve())
  ));
  return 'http://127.0.0.1:' + server.address().port;
}

test('produto permanece salvo apos fechar e reabrir o SQLite', (t) => {
  const caminho = arquivoTemp(t);
  let repositorio = new RepositorioCatalogoSQLite({ caminho });
  const primeiro = repositorio.salvar({ produto: produto('produto-a'), revisaoEsperada: 0 });
  assert.equal(primeiro.revisao, 1);
  repositorio.fechar();

  repositorio = new RepositorioCatalogoSQLite({ caminho });
  assert.equal(repositorio.buscar('produto-a').estado, 'RASCUNHO');
  const revisao = repositorio.atualizar({
    id: 'produto-a',
    alteracoes: {
      nome: 'Novo titulo da mercadoria',
      estado: 'PUBLICADO',
      precoCentavos: 18500,
      fotos: ['/imagens/catalogo/capa-teste.webp']
    },
    revisaoEsperada: 1
  });
  assert.equal(revisao.revisao, 2);
  repositorio.fechar();

  repositorio = new RepositorioCatalogoSQLite({ caminho });
  t.after(() => repositorio.fechar());
  const registro = repositorio.buscarRegistro('produto-a');
  assert.equal(registro.revisao, 2);
  assert.equal(registro.produto.nome, 'Novo titulo da mercadoria');
  assert.equal(registro.produto.precoCentavos, 18500);
  assert.deepEqual(registro.produto.fotos, ['/imagens/catalogo/capa-teste.webp']);
  assert.equal(fs.statSync(caminho).mode & 0o777, 0o600);
});

test('rascunhos ficam invisiveis na vitrine e pagina individual', async (t) => {
  const caminho = arquivoTemp(t);
  const banco = new RepositorioCatalogoSQLite({ caminho });
  t.after(() => banco.fechar());
  banco.salvar({ produto: produto('rascunho'), revisaoEsperada: 0 });
  banco.salvar({ produto: produto('curso-demo', 'PDF', 'DEMONSTRACAO'), revisaoEsperada: 0 });
  banco.salvar({ produto: produto('publicado', 'FISICO', 'PUBLICADO'), revisaoEsperada: 0 });

  const base = await servidor(t, banco);
  const listar = await (await fetch(base + '/catalogo')).json();
  assert.deepEqual(listar.produtos.map(p => p.id), ['curso-demo', 'publicado']);
  assert.ok(listar.produtos.every(p => p.compraDisponivel === false));
  assert.equal((await fetch(base + '/catalogo/rascunho')).status, 404);
  const item = await (await fetch(base + '/catalogo/publicado')).json();
  assert.equal(item.produto.compraDisponivel, false);

  banco.atualizar({
    id: 'rascunho', revisaoEsperada: 1,
    alteracoes: { estado: 'PUBLICADO', precoCentavos: 6000 }
  });
  const depois = await (await fetch(base + '/catalogo')).json();
  assert.deepEqual(depois.produtos.map(p => p.id), ['curso-demo', 'publicado', 'rascunho']);
});

test('dados internos extras nao vazam e revisao de banco nao e publicada', async (t) => {
  const app = express();
  const custom = {
    listar: async () => [
      { ...produto('visivel', 'PDF', 'DEMONSTRACAO'), tokenSecreto:'NUNCA_EXIBIR', custoFornecedor:100 },
      { ...produto('privado', 'FISICO', 'RASCUNHO'), chaveApi:'NUNCA_EXIBIR' }
    ],
    buscar: async id => id === 'visivel' ?
      { ...produto('visivel', 'PDF', 'DEMONSTRACAO'), chaveApi:'NUNCA_EXIBIR' } :
      { ...produto('privado', 'FISICO', 'RASCUNHO'), chaveApi:'NUNCA_EXIBIR' }
  };
  app.use('/catalogo', criarRouterCatalogo({ repositorio: custom }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve())));
  const base = 'http://127.0.0.1:' + server.address().port;
  const resposta = await (await fetch(base + '/catalogo')).text();
  assert.doesNotMatch(resposta, /NUNCA_EXIBIR|tokenSecreto|custoFornecedor|chaveApi/);
  assert.deepEqual(JSON.parse(resposta).produtos.map(p => p.id), ['visivel']);
  assert.equal((await fetch(base + '/catalogo/privado')).status, 404);
  const individual = await (await fetch(base + '/catalogo/visivel')).text();
  assert.doesNotMatch(individual, /NUNCA_EXIBIR|chaveApi/);
});

test('duas instancias detectam revisao antiga e preservam a ultima alteracao', (t) => {
  const caminho = arquivoTemp(t);
  const a = new RepositorioCatalogoSQLite({ caminho });
  const b = new RepositorioCatalogoSQLite({ caminho });
  t.after(() => { a.fechar(); b.fechar(); });
  assert.equal(a.salvar({ produto:produto('produto-x'), revisaoEsperada:0 }).revisao, 1);
  const antigo = b.buscarRegistro('produto-x');
  assert.equal(a.atualizar({
    id:'produto-x', alteracoes:{ nome:'Nome atualizado A' }, revisaoEsperada:1
  }).revisao, 2);

  assert.throws(() => b.salvar({
    produto: { ...antigo.produto, nome:'Nome obsoleto B' },
    revisaoEsperada:antigo.revisao
  }), /Conflito de revisao/);
  assert.throws(() => b.atualizar({
    id:'produto-x',alteracoes:{ nome:'Atualizacao B' },revisaoEsperada:1
  }), /Conflito de revisao/);
  assert.equal(b.buscar('produto-x').nome, 'Nome atualizado A');
  assert.equal(b.buscarRegistro('produto-x').revisao, 2);
});

test('alteracao invalida nao corrompe o catalogo e id continua imutavel', (t) => {
  const caminho = arquivoTemp(t);
  const repo = new RepositorioCatalogoSQLite({ caminho });
  t.after(() => repo.fechar());
  repo.salvar({ produto: produto('produto-b'), revisaoEsperada:0 });

  assert.throws(() => repo.atualizar({
    id:'produto-b',revisaoEsperada:1,
    alteracoes:{ estado:'PUBLICADO' }
  }), /preco positivo/);
  assert.equal(repo.buscarRegistro('produto-b').revisao, 1);
  assert.equal(repo.buscar('produto-b').estado,'RASCUNHO');
  assert.throws(() => repo.atualizar({
    id:'produto-b',revisaoEsperada:1,
    alteracoes:{ precoCentavos:1.5 }
  }), /Preco invalido/);
  assert.equal(repo.atualizar({
    id:'produto-b',revisaoEsperada:1,
    alteracoes:{ id:'produto-malicioso', nome:'Ok' }
  }).id,'produto-b');
  assert.equal(repo.buscar('produto-malicioso'),null);
  assert.throws(() => repo.salvar({produto:produto('produto-b'),revisaoEsperada:0}),/Conflito/);
});

test('arquivo de dados corrompido e esquema desconhecido nao sao aceitos', (t) => {
  const caminho = arquivoTemp(t);
  let repo = new RepositorioCatalogoSQLite({ caminho });
  repo.salvar({ produto: produto('produto-z'), revisaoEsperada:0 });
  repo.fechar();
  const db = new DatabaseSync(caminho);
  db.prepare('UPDATE catalogo_produtos SET dados_json = ? WHERE id = ?')
    .run('texto-nao-json','produto-z');
  db.close();
  repo = new RepositorioCatalogoSQLite({ caminho });
  assert.throws(() => repo.buscar('produto-z'),/corrompido/);
  repo.fechar();

  const db2 = new DatabaseSync(caminho);
  db2.exec('PRAGMA user_version=123;');
  db2.close();
  assert.throws(() => new RepositorioCatalogoSQLite({ caminho }),/nao suportada/);
});
