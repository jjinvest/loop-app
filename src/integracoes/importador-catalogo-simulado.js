'use strict';

// Importacao de catalogo EXCLUSIVA de laboratorio.
// Nao compra mercadoria, nao conecta a Shopee e nao baixa imagens externas.
// Adaptadores sao injetados; nenhuma credencial e armazenada neste modulo.
const { createHash } = require('node:crypto');
const { validarProduto } = require('../domain/catalogo');
const { RepositorioCatalogoSQLite } = require('../domain/repositorio-catalogo-sqlite');
const { AplicadorLoteCatalogoSQLite } = require('./aplicador-lote-catalogo-sqlite');

const MAX_ITENS = 100;
const MARCADOR_CONFIRMACAO = 'IMPORTAR_RASCUNHOS_SIMULADOS';

function validarCodigo(valor, nome, limite = 48) {
  if (typeof valor !== 'string' ||
      !new RegExp('^[A-Za-z0-9_-]{1,' + limite + '}$').test(valor)) {
    throw new Error(nome + ' invalido');
  }
  return valor;
}

function validarItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error('Item de fornecedor invalido');
  }
  const sku = validarCodigo(item.sku, 'SKU');
  if (typeof item.nome !== 'string' || !item.nome.trim() || item.nome.length > 150) {
    throw new Error('Nome de produto de fornecedor invalido');
  }
  if (typeof item.descricao !== 'string' || !item.descricao.trim() ||
      item.descricao.length > 2000) {
    throw new Error('Descricao de produto de fornecedor invalida');
  }
  // Campos nao reconhecidos do parceiro (custo, token, URLs, endereco etc)
  // NUNCA sao copiados ao produto da loja.
  return { sku, nome: item.nome.trim(), descricao: item.descricao.trim() };
}

function idLocal(fornecedorId, sku) {
  const identificador = createHash('sha256')
    .update(fornecedorId + '\0' + sku)
    .digest('hex')
    .slice(0, 24);
  return 'forn-' + identificador;
}

function montarProduto(fornecedorId, item) {
  return validarProduto({
    id: idLocal(fornecedorId, item.sku),
    nome: item.nome, tipo: 'FISICO', estado: 'RASCUNHO',
    descricao: item.descricao, precoCentavos: null,
    entrega: 'FORNECEDOR_INTEGRADO',
    fotos: [], videoApresentacaoUrl: null, detalhes: []
  });
}

class ImportadorCatalogoSimulado {
  constructor({ registroFornecedores, repositorioCatalogo } = {}) {
    if (!registroFornecedores || typeof registroFornecedores.obter !== 'function') {
      throw new Error('Registro de fornecedores obrigatorio');
    }
    if (!repositorioCatalogo ||
        typeof repositorioCatalogo.buscarRegistro !== 'function' ||
        typeof repositorioCatalogo.salvar !== 'function') {
      throw new Error('Repositorio SQLite editavel do catalogo obrigatorio');
    }
    this.fornecedores = registroFornecedores;
    this.catalogo = repositorioCatalogo;
    this.aplicador = repositorioCatalogo instanceof RepositorioCatalogoSQLite
      ? new AplicadorLoteCatalogoSQLite({ repositorioCatalogo }) : null;
  }

  async obterLote(fornecedorId) {
    validarCodigo(fornecedorId, 'Fornecedor');
    const adaptador = this.fornecedores.obter(fornecedorId);
    if (typeof adaptador.listarProdutos !== 'function') {
      throw new Error('Fornecedor ainda nao oferece listagem de catalogo');
    }
    const resultado = await adaptador.listarProdutos();
    if (!Array.isArray(resultado) || resultado.length > MAX_ITENS) {
      throw new Error('Resposta de fornecedor invalida ou excede limite do lote');
    }
    const vistos = new Set();
    const infos = resultado.map(item => {
      const valido = validarItem(item);
      if (vistos.has(valido.sku)) throw new Error('SKU duplicado no lote do fornecedor');
      vistos.add(valido.sku);
      return valido;
    }).sort((a, b) => a.sku.localeCompare(b.sku));

    // Vincula a confirmacao ao conteudo exato do lote visualizado.
    const revisaoLote = createHash('sha256').update(
      JSON.stringify({ fornecedorId, infos })
    ).digest('hex');
    return { revisaoLote, itens: infos.map(info => ({
      sku: info.sku, produto: montarProduto(fornecedorId, info)
    })) };
  }

  async preparar({ fornecedorId } = {}) {
    const { revisaoLote, itens: validados } = await this.obterLote(fornecedorId);

    const itens = [];
    for (const info of validados) {
      const existente = await this.catalogo.buscarRegistro(info.produto.id);
      itens.push({
        sku: info.sku,
        produtoId: info.produto.id,
        situacao: existente ? 'JA_CADASTRADO' : 'NOVO_RASCUNHO',
        // Nenhum valor de fornecedor vira preco final da loja.
        nomeSugerido: info.produto.nome
      });
    }
    return {
      modo: 'IMPORTACAO_SIMULADA_SEM_VENDAS',
      fornecedorId,
      limiteLote: MAX_ITENS,
      revisaoLote,
      itens
    };
  }

  async aplicar({ fornecedorId, revisaoLote, confirmacao } = {}) {
    if (confirmacao !== MARCADOR_CONFIRMACAO) {
      throw new Error('Confirmacao de importacao de laboratorio obrigatoria');
    }
    if (typeof revisaoLote !== 'string' || !/^[a-f0-9]{64}$/.test(revisaoLote)) {
      throw new Error('Revisao do lote aprovada e obrigatoria');
    }
    const lote = await this.obterLote(fornecedorId);
    if (lote.revisaoLote !== revisaoLote) {
      throw new Error('Lote mudou depois da previa: revise antes de importar');
    }
    if (this.aplicador) return this.aplicador.aplicar({ fornecedorId, itens:lote.itens });

    // Repositorios nao-SQLite de laboratorio mantem o fluxo legado nao atomico.
    const produtos = lote.itens.map(item => item.produto);

    let criados = 0;
    let ignorados = 0;
    for (const produto of produtos) {
      if (await this.catalogo.buscarRegistro(produto.id)) {
        ignorados++;
        continue;
      }
      try {
        await this.catalogo.salvar({ produto, revisaoEsperada: 0 });
        criados++;
      } catch (erro) {
        if (!/Conflito de revisao/.test(erro.message) ||
            !await this.catalogo.buscarRegistro(produto.id)) throw erro;
        ignorados++;
      }
    }
    return {
      modo: 'IMPORTACAO_SIMULADA_SEM_VENDAS',
      fornecedorId, criados, ignorados,
      // A importacao nao publica, nao define preco, nao movimenta fila.
      publicados: 0,
      comprasHabilitadas: false
    };
  }
}

module.exports = { ImportadorCatalogoSimulado, MARCADOR_CONFIRMACAO, MAX_ITENS };
