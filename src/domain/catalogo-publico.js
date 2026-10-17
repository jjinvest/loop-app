'use strict';

const { validarProduto } = require('./catalogo');

// Contrato publico rigoroso: rascunhos e campos internos nao saem no JSON.
// "PUBLICADO" significa exibivel, NAO autorizado para compra real.
const ESTADOS_VISIVEIS = new Set(['PUBLICADO', 'DEMONSTRACAO']);

function produtoParaVitrine(registro) {
  const produto = validarProduto(registro);
  if (!ESTADOS_VISIVEIS.has(produto.estado)) return null;

  return {
    id: produto.id,
    nome: produto.nome,
    tipo: produto.tipo,
    estado: produto.estado,
    descricao: produto.descricao,
    precoCentavos: produto.precoCentavos,
    entrega: produto.entrega,
    fotos: [...produto.fotos],
    videoApresentacaoUrl: produto.videoApresentacaoUrl,
    detalhes: [...produto.detalhes],
    compraDisponivel: false
  };
}

module.exports = { produtoParaVitrine };
