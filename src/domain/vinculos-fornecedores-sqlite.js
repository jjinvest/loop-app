'use strict';

// Vinculos internos de LABORATORIO entre um produto LOOP e um SKU externo.
// Nenhum endereco de cliente, token, pedido ou preco e armazenado aqui.
// A identidade publica do produto jamais e modificada ao trocar de parceiro.
const { RepositorioCatalogoSQLite } = require('./repositorio-catalogo-sqlite');

function produtoIdValido(id) {
  if (typeof id !== 'string' || !/^[a-z0-9-]{3,80}$/.test(id)) {
    throw new Error('produtoId invalido');
  }
}
function codigoValido(id, campo) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
    throw new Error(campo + ' invalido');
  }
}
function revisaoValida(revisaoEsperada) {
  if (!Number.isSafeInteger(revisaoEsperada) || revisaoEsperada < 0) {
    throw new Error('revisaoEsperada invalida');
  }
}
function registroPublico(linha) {
  if (!linha) return null;
  return {
    produtoId: linha.produto_id,
    fornecedorId: linha.fornecedor_id,
    sku: linha.sku,
    ativo: linha.fornecedor_id !== null,
    revisao: linha.revisao,
    atualizadoEm: linha.atualizado_em
  };
}

class VinculosFornecedoresSQLite {
  constructor({ repositorioCatalogo } = {}) {
    if (!(repositorioCatalogo instanceof RepositorioCatalogoSQLite)) {
      throw new Error('RepositorioCatalogoSQLite obrigatorio para vinculos');
    }
    this.banco = repositorioCatalogo.banco;
  }

  consultar({ produtoId } = {}) {
    produtoIdValido(produtoId);
    return registroPublico(this.banco.prepare(
      'SELECT produto_id, fornecedor_id, sku, revisao, atualizado_em FROM catalogo_vinculos_fornecedor WHERE produto_id = ?'
    ).get(produtoId));
  }

  historico({ produtoId } = {}) {
    produtoIdValido(produtoId);
    return this.banco.prepare(
      'SELECT revisao, acao, antes_fornecedor, antes_sku, depois_fornecedor, depois_sku, ocorrido_em FROM catalogo_vinculos_historico WHERE produto_id = ? ORDER BY revisao'
    ).all(produtoId).map(l => ({
      revisao: l.revisao,
      acao: l.acao,
      antes: l.antes_fornecedor === null ? null :
        { fornecedorId:l.antes_fornecedor, sku:l.antes_sku },
      depois: l.depois_fornecedor === null ? null :
        { fornecedorId:l.depois_fornecedor, sku:l.depois_sku },
      ocorridoEm: l.ocorrido_em
    }));
  }

  vincular({ produtoId, fornecedorId, sku, revisaoEsperada } = {}) {
    produtoIdValido(produtoId);
    codigoValido(fornecedorId, 'fornecedorId');
    codigoValido(sku, 'sku');
    revisaoValida(revisaoEsperada);
    return this.gravar({ produtoId, fornecedorId, sku, revisaoEsperada });
  }

  desativar({ produtoId, revisaoEsperada } = {}) {
    produtoIdValido(produtoId);
    revisaoValida(revisaoEsperada);
    return this.gravar({ produtoId, fornecedorId:null, sku:null, revisaoEsperada });
  }

  gravar({ produtoId, fornecedorId, sku, revisaoEsperada }) {
    this.banco.exec('BEGIN IMMEDIATE;');
    try {
      const produto = this.banco.prepare(
        'SELECT dados_json FROM catalogo_produtos WHERE id = ?'
      ).get(produtoId);
      if (!produto) throw new Error('Produto LOOP nao cadastrado');
      let dados;
      try { dados = JSON.parse(produto.dados_json); }
      catch { throw new Error('Produto LOOP corrompido'); }
      if (dados.tipo !== 'FISICO') throw new Error('Somente produtos fisicos possuem fornecedor externo');

      const anterior = this.banco.prepare(
        'SELECT fornecedor_id, sku, revisao FROM catalogo_vinculos_fornecedor WHERE produto_id = ?'
      ).get(produtoId);
      const atual = anterior?.revisao || 0;
      if (atual !== revisaoEsperada) {
        throw new Error('Conflito de revisao de fornecedor: recarregue antes de trocar');
      }
      if (!anterior && fornecedorId === null) {
        throw new Error('Vinculo ainda nao existe');
      }
      if (anterior && anterior.fornecedor_id === fornecedorId && anterior.sku === sku) {
        this.banco.exec('COMMIT;');
        return { ...this.consultar({ produtoId }), alterado:false };
      }

      const novo = atual + 1;
      const agora = new Date().toISOString();
      if (!anterior) {
        this.banco.prepare(
          'INSERT INTO catalogo_vinculos_fornecedor (produto_id, fornecedor_id, sku, revisao, atualizado_em) VALUES (?, ?, ?, ?, ?)'
        ).run(produtoId, fornecedorId, sku, novo, agora);
      } else {
        this.banco.prepare(
          'UPDATE catalogo_vinculos_fornecedor SET fornecedor_id = ?, sku = ?, revisao = ?, atualizado_em = ? WHERE produto_id = ?'
        ).run(fornecedorId, sku, novo, agora, produtoId);
      }
      const acao = fornecedorId === null ? 'DESATIVADO' :
        anterior?.fornecedor_id === null || !anterior ? 'VINCULADO' : 'SUBSTITUIDO';
      this.banco.prepare(
        'INSERT INTO catalogo_vinculos_historico (produto_id, revisao, acao, antes_fornecedor, antes_sku, depois_fornecedor, depois_sku, ocorrido_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        produtoId, novo, acao,
        anterior?.fornecedor_id ?? null, anterior?.sku ?? null,
        fornecedorId, sku, agora
      );
      this.banco.exec('COMMIT;');
      return { ...this.consultar({ produtoId }), alterado:true };
    } catch (erro) {
      this.banco.exec('ROLLBACK;');
      throw erro;
    }
  }
}

module.exports = { VinculosFornecedoresSQLite };
