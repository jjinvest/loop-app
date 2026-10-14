'use strict';

// Importacao de catalogo EXCLUSIVA de laboratorio.
// Nao compra mercadoria, nao conecta a Shopee e nao baixa imagens externas.
// Adaptadores sao injetados; nenhuma credencial e armazenada neste modulo.
const { createHash } = require('node:crypto');
const { validarProduto } = require('../domain/catalogo');

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
  }

  async preparar({ fornecedorId } = {}) {
    validarCodigo(fornecedorId, 'Fornecedor');
    const adaptador = this.fornecedores.obter(fornecedorId);
    if (typeof adaptador.listarProdutos !== 'function') {
      throw new Error('Fornecedor ainda nao oferece listagem de catalogo');
    }
    const resultado = await adaptador.listarProdutos();
    if (!Array.isArray(resultado) || resultado.length > MAX_ITENS) {
      throw new Error('Resposta de fornecedor invalida ou excede limite do lote');
    }

    // Toda a resposta e validada ANTES de criar um unico rascunho.
    const encontrados = new Set();
    const validados = resultado.map(item => {
      const info = validarItem(item);
      if (encontrados.has(info.sku)) throw new Error('SKU duplicado no lote do fornecedor');
      encontrados.add(info.sku);
      const produto = validarProduto({
        id: idLocal(fornecedorId, info.sku),
        nome: info.nome,
        tipo: 'FISICO',
        estado: 'RASCUNHO',
        descricao: info.descricao,
        precoCentavos: null,
        entrega: 'FORNECEDOR_INTEGRADO',
        fotos: [],
        videoApresentacaoUrl: null,
        detalhes: []
      });
      return { sku: info.sku, produto };
    });

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
      itens
    };
  }

  async aplicar({ fornecedorId, confirmacao } = {}) {
    if (confirmacao !== MARCADOR_CONFIRMACAO) {
      throw new Error('Confirmacao de importacao de laboratorio obrigatoria');
    }
    validarCodigo(fornecedorId, 'Fornecedor');

    // Reconsulta o parceiro; o plano pode ficar desatualizado entre as chamadas.
    const adaptador = this.fornecedores.obter(fornecedorId);
    if (typeof adaptador.listarProdutos !== 'function') {
      throw new Error('Fornecedor ainda nao oferece listagem de catalogo');
    }
    const lista = await adaptador.listarProdutos();
    if (!Array.isArray(lista) || lista.length > MAX_ITENS) {
      throw new Error('Resposta de fornecedor invalida ou excede limite do lote');
    }
    const skus = new Set();
    const produtos = lista.map(item => {
      const valido = validarItem(item);
      if (skus.has(valido.sku)) throw new Error('SKU duplicado no lote do fornecedor');
      skus.add(valido.sku);
      return validarProduto({
        id: idLocal(fornecedorId, valido.sku),
        nome: valido.nome,
        tipo:'FISICO', estado:'RASCUNHO',
        descricao: valido.descricao, precoCentavos: null,
        entrega:'FORNECEDOR_INTEGRADO',
        fotos:[], videoApresentacaoUrl:null, detalhes:[]
      });
    });

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
