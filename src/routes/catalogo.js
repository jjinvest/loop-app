'use strict';
const express = require('express');
const { listarCatalogo } = require('../domain/catalogo');
const { RepositorioCatalogoMemoria } = require('../domain/repositorio-catalogo-memoria');
const { produtoParaVitrine } = require('../domain/catalogo-publico');

// A API depende do contrato listar()/buscar(). O banco pode ser trocado sem
// alterar as URLs publicas nem a camada visual do LOOP.
function criarRouterCatalogo({ repositorio } = {}) {
  const armazenamento = repositorio || new RepositorioCatalogoMemoria({
    produtos: listarCatalogo()
  });
  if (typeof armazenamento.listar !== 'function' || typeof armazenamento.buscar !== 'function') {
    throw new TypeError('Repositorio do catalogo deve oferecer listar e buscar');
  }

  const router = express.Router();
  router.get('/', async (req, res, next) => {
    try {
      const produtos = await armazenamento.listar();
      res.json({
        modo: 'CATALOGO_DEMONSTRATIVO_SEM_VENDAS',
        compraDisponivel: false,
        produtos: produtos.map(produtoParaVitrine).filter(Boolean)
      });
    } catch (erro) {
      next(erro);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const produto = await armazenamento.buscar(req.params.id);
      const publico = produto ? produtoParaVitrine(produto) : null;
      if (!publico) return res.status(404).json({ erro: 'Produto nao encontrado' });
      res.json({
        modo: 'CATALOGO_DEMONSTRATIVO_SEM_VENDAS',
        produto: publico
      });
    } catch (erro) {
      next(erro);
    }
  });

  return router;
}

const router = criarRouterCatalogo();
module.exports = router;
module.exports.criarRouterCatalogo = criarRouterCatalogo;
