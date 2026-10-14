'use strict';

// Armazenamento LOCAL de laboratorio para o catalogo.
// Nao e painel administrativo, nem mecanismo de venda real.
// Node.js 22+; usar arquivo exclusivo, separado do SQLite dos ciclos.
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { validarProduto } = require('./catalogo');

function validarCaminho(caminho) {
  if (typeof caminho !== 'string' || !caminho.trim()) {
    throw new Error('Caminho explicito do banco do catalogo e obrigatorio');
  }
}
function validarRevisao(revisao) {
  if (!Number.isSafeInteger(revisao) || revisao < 0) {
    throw new Error('revisaoEsperada deve ser inteiro nao negativo');
  }
}
function verificarId(id) {
  if (typeof id !== 'string' || !/^[a-z0-9-]{3,80}$/.test(id)) {
    throw new Error('Identificador de produto invalido');
  }
}
function extrairProduto(linha) {
  if (!linha) return null;
  let dados;
  try {
    dados = JSON.parse(linha.dados_json);
  } catch {
    throw new Error('Catalogo persistido corrompido: JSON invalido');
  }
  const produto = validarProduto(dados);
  if (produto.id !== linha.id) {
    throw new Error('Catalogo persistido corrompido: ID divergente');
  }
  return {
    produto,
    revisao: linha.revisao,
    atualizadoEm: linha.atualizado_em
  };
}

class RepositorioCatalogoSQLite {
  constructor({ caminho } = {}) {
    validarCaminho(caminho);
    this.banco = new DatabaseSync(caminho);
    try {
      this.banco.exec('PRAGMA busy_timeout=5000;');
      this.banco.exec('PRAGMA journal_mode=WAL;');
      this.banco.exec('PRAGMA synchronous=FULL;');

      const versao = this.banco.prepare('PRAGMA user_version').get().user_version;
      if (versao !== 0 && versao !== 1) throw new Error('Versao do catalogo SQLite nao suportada');

      this.banco.exec(`
        CREATE TABLE IF NOT EXISTS catalogo_produtos (
          id TEXT PRIMARY KEY NOT NULL,
          revisao INTEGER NOT NULL CHECK (revisao >= 1),
          dados_json TEXT NOT NULL,
          atualizado_em TEXT NOT NULL
        );
      `);
      if (versao === 0) this.banco.exec('PRAGMA user_version=1;');
      if (caminho !== ':memory:') fs.chmodSync(caminho, 0o600);
    } catch (erro) {
      this.banco.close();
      throw erro;
    }
  }

  listar() {
    const linhas = this.banco.prepare(
      'SELECT id, revisao, dados_json, atualizado_em FROM catalogo_produtos ORDER BY id'
    ).all();
    return linhas.map(linha => extrairProduto(linha).produto);
  }

  buscar(id) {
    verificarId(id);
    const linha = this.banco.prepare(
      'SELECT id, revisao, dados_json, atualizado_em FROM catalogo_produtos WHERE id = ?'
    ).get(id);
    return extrairProduto(linha)?.produto || null;
  }

  buscarRegistro(id) {
    verificarId(id);
    const linha = this.banco.prepare(
      'SELECT id, revisao, dados_json, atualizado_em FROM catalogo_produtos WHERE id = ?'
    ).get(id);
    return extrairProduto(linha);
  }

  // O gravador interno exige revisao atual. Rascunhos nao sao publicados
  // automaticamente; a API publica filtra os estados.
  salvar({ produto, revisaoEsperada } = {}) {
    const validado = validarProduto(produto);
    validarRevisao(revisaoEsperada);
    const atualizadoEm = new Date().toISOString();

    this.banco.exec('BEGIN IMMEDIATE;');
    try {
      const anterior = this.banco.prepare(
        'SELECT revisao FROM catalogo_produtos WHERE id = ?'
      ).get(validado.id);
      const revisaoAtual = anterior ? anterior.revisao : 0;
      if (revisaoAtual !== revisaoEsperada) {
        throw new Error('Conflito de revisao do catalogo: recarregue o produto');
      }
      const novaRevisao = revisaoAtual + 1;
      if (anterior) {
        this.banco.prepare(
          'UPDATE catalogo_produtos SET revisao = ?, dados_json = ?, atualizado_em = ? WHERE id = ?'
        ).run(novaRevisao, JSON.stringify(validado), atualizadoEm, validado.id);
      } else {
        this.banco.prepare(
          'INSERT INTO catalogo_produtos (id, revisao, dados_json, atualizado_em) VALUES (?, ?, ?, ?)'
        ).run(validado.id, novaRevisao, JSON.stringify(validado), atualizadoEm);
      }
      this.banco.exec('COMMIT;');
      return { id: validado.id, revisao: novaRevisao, atualizadoEm };
    } catch (erro) {
      this.banco.exec('ROLLBACK;');
      throw erro;
    }
  }

  // Altera somente os campos declarados e preserva o identificador.
  atualizar({ id, alteracoes, revisaoEsperada } = {}) {
    verificarId(id);
    validarRevisao(revisaoEsperada);
    if (!alteracoes || typeof alteracoes !== 'object' || Array.isArray(alteracoes)) {
      throw new Error('Informe as alteracoes do produto');
    }
    const registro = this.buscarRegistro(id);
    if (!registro) return null;
    if (registro.revisao !== revisaoEsperada) {
      throw new Error('Conflito de revisao do catalogo: recarregue o produto');
    }
    return this.salvar({
      produto: { ...registro.produto, ...alteracoes, id },
      revisaoEsperada
    });
  }

  fechar() {
    this.banco.close();
  }
}

module.exports = { RepositorioCatalogoSQLite };
