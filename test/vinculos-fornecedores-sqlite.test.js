'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { RepositorioCatalogoSQLite } = require('../src/domain/repositorio-catalogo-sqlite');
const { VinculosFornecedoresSQLite } = require('../src/domain/vinculos-fornecedores-sqlite');

function baseProduto(id, tipo='FISICO') {
  return {
    id, nome:'Produto com ID estavel', tipo,
    descricao:'Modelo fisico com fornecedores substituiveis',
    estado:'PUBLICADO', precoCentavos:15390,
    entrega:tipo==='PDF' ? 'DOWNLOAD_APOS_CONFIRMACAO' : 'FORNECEDOR_INTEGRADO',
    fotos:[], videoApresentacaoUrl:null, detalhes:[]
  };
}
function preparar(t, existentes=[baseProduto('produto-a')]) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-vinculos-forn-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const caminho=path.join(dir,'catalogo.sqlite');
  const repo=new RepositorioCatalogoSQLite({caminho});
  t.after(()=>repo.fechar());
  for(const produto of existentes) repo.salvar({produto,revisaoEsperada:0});
  const vinculos=new VinculosFornecedoresSQLite({repositorioCatalogo:repo});
  return { repo, vinculos, caminho };
}

test('trocar fornecedor mantem o mesmo produto, preco e URL da loja', t => {
  const {repo,vinculos}=preparar(t);
  assert.equal(vinculos.consultar({produtoId:'produto-a'}),null);
  const um=vinculos.vincular({
    produtoId:'produto-a', fornecedorId:'franquia-a', sku:'COD_123',revisaoEsperada:0
  });
  assert.equal(um.ativo,true);
  assert.equal(um.revisao,1);
  assert.equal(um.sku,'COD_123');

  const dois=vinculos.vincular({
    produtoId:'produto-a',fornecedorId:'parceiro-b',sku:'SKU-987',revisaoEsperada:1
  });
  assert.equal(dois.revisao,2);
  assert.equal(dois.fornecedorId,'parceiro-b');
  assert.equal(dois.sku,'SKU-987');
  assert.equal(repo.buscar('produto-a').id,'produto-a');
  assert.equal(repo.buscar('produto-a').precoCentavos,15390);
  assert.equal(repo.buscar('produto-a').nome,'Produto com ID estavel');
  assert.equal(repo.buscarRegistro('produto-a').revisao,1);
  assert.deepEqual(vinculos.historico({produtoId:'produto-a'}).map(x=>x.acao),
    ['VINCULADO','SUBSTITUIDO']);
  assert.deepEqual(vinculos.historico({produtoId:'produto-a'})[1].antes,{
    fornecedorId:'franquia-a',sku:'COD_123'
  });
});

test('desativar fornecedor nao exclui o produto e pode religar depois', t=>{
  const {repo,vinculos}=preparar(t);
  vinculos.vincular({produtoId:'produto-a',fornecedorId:'primeiro',sku:'sku1',revisaoEsperada:0});
  const desligado=vinculos.desativar({produtoId:'produto-a',revisaoEsperada:1});
  assert.equal(desligado.ativo,false);
  assert.equal(desligado.fornecedorId,null);
  assert.equal(desligado.revisao,2);
  assert.equal(repo.buscar('produto-a').estado,'PUBLICADO');
  const ligado=vinculos.vincular({produtoId:'produto-a',fornecedorId:'segundo',sku:'sku2',revisaoEsperada:2});
  assert.equal(ligado.revisao,3);
  assert.deepEqual(vinculos.historico({produtoId:'produto-a'}).map(x=>x.acao),
    ['VINCULADO','DESATIVADO','VINCULADO']);
  assert.equal(repo.buscarRegistro('produto-a').revisao,1);
});

test('nao duplicar vinculo, nao usar SKU identico em dois produtos e controlar revisao', t=>{
  const {repo,vinculos}=preparar(t,[baseProduto('produto-a'),baseProduto('produto-b')]);
  vinculos.vincular({produtoId:'produto-a',fornecedorId:'parceiro-a',sku:'ABC',revisaoEsperada:0});
  const repetido=vinculos.vincular({produtoId:'produto-a',fornecedorId:'parceiro-a',sku:'ABC',revisaoEsperada:1});
  assert.equal(repetido.alterado,false);
  assert.equal(repetido.revisao,1);
  assert.throws(()=>vinculos.vincular({
    produtoId:'produto-a',fornecedorId:'parceiro-b',sku:'OUTRO',revisaoEsperada:0
  }),/Conflito de revisao/);
  assert.throws(()=>vinculos.vincular({
    produtoId:'produto-b',fornecedorId:'parceiro-a',sku:'ABC',revisaoEsperada:0
  }),/UNIQUE constraint failed/);
  assert.equal(vinculos.consultar({produtoId:'produto-b'}),null);
  assert.deepEqual(vinculos.historico({produtoId:'produto-b'}),[]);
  assert.equal(vinculos.historico({produtoId:'produto-a'}).length,1);
  assert.equal(repo.buscarRegistro('produto-a').revisao,1);
});

test('nao vincula curso PDF nem produto inexistente nem IDs inseguros',t=>{
  const {vinculos}=preparar(t,[baseProduto('curso-pdf','PDF')]);
  assert.throws(()=>vinculos.vincular({
    produtoId:'curso-pdf',fornecedorId:'parceiro',sku:'ABC',revisaoEsperada:0
  }),/Somente produtos fisicos/);
  assert.throws(()=>vinculos.vincular({
    produtoId:'inexistente',fornecedorId:'parceiro',sku:'ABC',revisaoEsperada:0
  }),/nao cadastrado/);
  assert.throws(()=>vinculos.vincular({
    produtoId:'../segredo',fornecedorId:'parceiro',sku:'ABC',revisaoEsperada:0
  }),/produtoId invalido/);
  assert.throws(()=>vinculos.vincular({
    produtoId:'curso-pdf',fornecedorId:'https://site',sku:'ABC',revisaoEsperada:0
  }),/fornecedorId invalido/);
  assert.throws(()=>vinculos.vincular({
    produtoId:'curso-pdf',fornecedorId:'parceiro',sku:'../../arquivo',revisaoEsperada:0
  }),/sku invalido/);
  assert.throws(()=>vinculos.desativar({produtoId:'curso-pdf',revisaoEsperada:0}),/Somente produtos fisicos/);
  assert.deepEqual(vinculos.historico({produtoId:'curso-pdf'}),[]);
});

test('vinculos e historico resistem ao reinicio e bloqueiam alteracao direta da trilha',t=>{
  const {repo,vinculos,caminho}=preparar(t);
  vinculos.vincular({produtoId:'produto-a',fornecedorId:'antigo',sku:'SKU_A',revisaoEsperada:0});
  vinculos.vincular({produtoId:'produto-a',fornecedorId:'novo',sku:'SKU_B',revisaoEsperada:1});
  const reaberto=new RepositorioCatalogoSQLite({caminho});
  t.after(()=>reaberto.fechar());
  const historico=new VinculosFornecedoresSQLite({repositorioCatalogo:reaberto});
  assert.equal(historico.consultar({produtoId:'produto-a'}).fornecedorId,'novo');
  assert.deepEqual(historico.historico({produtoId:'produto-a'}).map(x=>x.revisao),[1,2]);
  assert.equal(reaberto.banco.prepare('PRAGMA user_version').get().user_version,3);
  assert.throws(()=>reaberto.banco.prepare(
    'DELETE FROM catalogo_vinculos_historico WHERE produto_id = ?'
  ).run('produto-a'),/historico vinculos imutavel/);
  assert.throws(()=>reaberto.banco.prepare(
    'UPDATE catalogo_vinculos_historico SET acao = ? WHERE produto_id = ?'
  ).run('DESATIVADO','produto-a'),/historico vinculos imutavel/);
  assert.equal(repo.buscar('produto-a').id,'produto-a');
});

test('migra banco de catalogo v2 e conserva produtos e historico antigos',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-v2-para-v3-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const dbFile=path.join(dir,'catalogo.sqlite');
  const legado=new DatabaseSync(dbFile);
  legado.exec(`
    CREATE TABLE catalogo_produtos (
      id TEXT PRIMARY KEY NOT NULL, revisao INTEGER NOT NULL,
      dados_json TEXT NOT NULL, atualizado_em TEXT NOT NULL
    );
    CREATE TABLE catalogo_historico (
      sequencia INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id TEXT NOT NULL,
      revisao INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      campos_json TEXT NOT NULL,
      antes_json TEXT NOT NULL,
      depois_json TEXT NOT NULL,
      ocorrido_em TEXT NOT NULL,
      UNIQUE(produto_id, revisao)
    );
    PRAGMA user_version=2;
  `);
  legado.prepare('INSERT INTO catalogo_produtos VALUES (?,?,?,?)').run(
    'produto-legado',2,JSON.stringify(baseProduto('produto-legado')),
    '2026-10-14T09:00:00Z'
  );
  legado.prepare('INSERT INTO catalogo_historico (produto_id,revisao,tipo,campos_json,antes_json,depois_json,ocorrido_em) VALUES (?,?,?,?,?,?,?)').run(
    'produto-legado',2,'IMPORTADO_V1','[]','{}',JSON.stringify(baseProduto('produto-legado')),'2026-10-14T09:00:00Z'
  );
  legado.close();

  const repo=new RepositorioCatalogoSQLite({caminho:dbFile});
  t.after(()=>repo.fechar());
  const vinculos=new VinculosFornecedoresSQLite({repositorioCatalogo:repo});
  assert.equal(repo.buscar('produto-legado').precoCentavos,15390);
  assert.equal(repo.historico('produto-legado').length,1);
  assert.equal(vinculos.consultar({produtoId:'produto-legado'}),null);
  assert.equal(vinculos.vincular({
    produtoId:'produto-legado',fornecedorId:'franquia',sku:'ITEM01',revisaoEsperada:0
  }).revisao,1);
  assert.equal(repo.banco.prepare('PRAGMA user_version').get().user_version,3);
});

test('trocar fornecedor nao altera motor de filas nem habilita pagamentos',t=>{
  const {repo,vinculos}=preparar(t);
  const produtoAntes=repo.buscar('produto-a');
  vinculos.vincular({
    produtoId:'produto-a',fornecedorId:'distribuidor-1',sku:'SKU01',revisaoEsperada:0
  });
  vinculos.vincular({
    produtoId:'produto-a',fornecedorId:'distribuidor-2',sku:'SKU02',revisaoEsperada:1
  });
  const produtoDepois=repo.buscar('produto-a');
  assert.deepEqual(produtoDepois,produtoAntes);
  assert.equal(produtoDepois.compraDisponivel,false);
  assert.equal(vinculos.consultar({produtoId:'produto-a'}).sku,'SKU02');
});
