'use strict';

// Aplicacao transacional e interna de rascunhos + vinculos de fornecedores.
// Sem API externa, pagamento, pedidos ou posicoes nas filas.
const { RepositorioCatalogoSQLite } = require('../domain/repositorio-catalogo-sqlite');
const { validarProduto } = require('../domain/catalogo');

function validarCodigo(valor, campo, limite = 48) {
  if (typeof valor !== 'string' || !new RegExp('^[A-Za-z0-9_-]{1,'+limite+'}$').test(valor)) {
    throw new Error(campo + ' invalido');
  }
}

class AplicadorLoteCatalogoSQLite {
  constructor({ repositorioCatalogo } = {}) {
    if (!(repositorioCatalogo instanceof RepositorioCatalogoSQLite)) {
      throw new Error('Importacao atomica requer catalogo SQLite do laboratorio');
    }
    this.banco = repositorioCatalogo.banco;
  }

  aplicar({ fornecedorId, itens } = {}) {
    validarCodigo(fornecedorId, 'Fornecedor');
    if (!Array.isArray(itens) || itens.length > 100) {
      throw new Error('Lote invalido ou grande demais');
    }

    const ids = new Set();
    const skus = new Set();
    const validados = itens.map(({ sku, produto }) => {
      validarCodigo(sku, 'SKU');
      if (skus.has(sku)) throw new Error('SKU repetido na importacao');
      skus.add(sku);
      const p = validarProduto(produto);
      if (ids.has(p.id)) throw new Error('Identificador duplicado na importacao');
      ids.add(p.id);
      if (p.tipo !== 'FISICO' || p.estado !== 'RASCUNHO' ||
          p.precoCentavos !== null || p.fotos.length ||
          p.videoApresentacaoUrl !== null || p.detalhes.length ||
          p.compraDisponivel !== false) {
        throw new Error('A importacao aceita apenas rascunhos fisicos sem preco ou midia');
      }
      return { sku, produto:p };
    });

    let criados = 0, ignorados = 0, pendentesVinculo = 0;
    const banco = this.banco;
    banco.exec('BEGIN IMMEDIATE;');
    try {
      const procurarProduto = banco.prepare('SELECT id FROM catalogo_produtos WHERE id = ?');
      const procurarVinculo = banco.prepare(
        'SELECT fornecedor_id, sku FROM catalogo_vinculos_fornecedor WHERE produto_id = ?'
      );
      const inserirProduto = banco.prepare(
        'INSERT INTO catalogo_produtos (id, revisao, dados_json, atualizado_em) VALUES (?, 1, ?, ?)'
      );
      const inserirHistoricoProduto = banco.prepare(
        "INSERT INTO catalogo_historico (produto_id, revisao, tipo, campos_json, antes_json, depois_json, ocorrido_em) VALUES (?, 1, 'CRIADO', ?, ?, ?, ?)"
      );
      const inserirVinculo = banco.prepare(
        'INSERT INTO catalogo_vinculos_fornecedor (produto_id, fornecedor_id, sku, revisao, atualizado_em) VALUES (?, ?, ?, 1, ?)'
      );
      const inserirHistoricoVinculo = banco.prepare(
        "INSERT INTO catalogo_vinculos_historico (produto_id, revisao, acao, antes_fornecedor, antes_sku, depois_fornecedor, depois_sku, ocorrido_em) VALUES (?, 1, 'VINCULADO', NULL, NULL, ?, ?, ?)"
      );

      for (const { sku, produto } of validados) {
        const existente = procurarProduto.get(produto.id);
        if (existente) {
          const atual = procurarVinculo.get(produto.id);
          if (!atual || atual.fornecedor_id !== fornecedorId || atual.sku !== sku) {
            pendentesVinculo++;
          }
          // NUNCA alterar um cadastro ou vinculo que ja exista.
          ignorados++;
          continue;
        }
        const agora = new Date().toISOString();
        inserirProduto.run(produto.id, JSON.stringify(produto), agora);
        inserirHistoricoProduto.run(
          produto.id, JSON.stringify(Object.keys(produto)),
          '{}', JSON.stringify(produto), agora
        );
        inserirVinculo.run(produto.id, fornecedorId, sku, agora);
        inserirHistoricoVinculo.run(produto.id, fornecedorId, sku, agora);
        criados++;
      }
      banco.exec('COMMIT;');
    } catch (erro) {
      banco.exec('ROLLBACK;');
      throw erro;
    }
    return {
      modo:'IMPORTACAO_SIMULADA_SEM_VENDAS',
      fornecedorId, criados, ignorados, pendentesVinculo,
      publicados:0, comprasHabilitadas:false
    };
  }
}

module.exports = { AplicadorLoteCatalogoSQLite };
