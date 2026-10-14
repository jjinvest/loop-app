'use strict';
const express = require('express');
const { listarCatalogo, buscarProduto } = require('../domain/catalogo');

const router = express.Router();

// Somente leitura. Nao ha carrinho, checkout, cadastro ou upload publico.
router.get('/', (req, res) => {
  res.json({
    modo: 'CATALOGO_DEMONSTRATIVO_SEM_VENDAS',
    compraDisponivel: false,
    produtos: listarCatalogo()
  });
});

router.get('/:id', (req, res) => {
  const produto = buscarProduto(req.params.id);
  if (!produto) return res.status(404).json({ erro: 'Produto nao encontrado' });
  res.json({ modo: 'CATALOGO_DEMONSTRATIVO_SEM_VENDAS', produto });
});

module.exports = router;
