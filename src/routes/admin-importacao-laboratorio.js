'use strict';

// Controle de importacao EXCLUSIVAMENTE no servidor local do laboratorio.
// Exige a mesma chave administrativa, nao recebe URLs de APIs nem credenciais.
const express = require('express');
const { criarAutorizacao } = require('./admin-catalogo-laboratorio');
const { ImportadorCatalogoSimulado, MARCADOR_CONFIRMACAO } =
  require('../integracoes/importador-catalogo-simulado');

function somenteCampos(dados, permitidos) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados) ||
      Object.keys(dados).some(campo => !permitidos.includes(campo))) {
    throw new Error('Campos nao permitidos na importacao');
  }
  return dados;
}

function criarRouterImportacaoLaboratorio({
  repositorioCatalogo, registroFornecedores, fornecedores, segredo
} = {}) {
  if (!Array.isArray(fornecedores) || !fornecedores.length ||
      fornecedores.some(f => typeof f.id !== 'string' || f.demonstrativo !== true)) {
    throw new Error('Somente fornecedores demonstrativos permitidos no painel de importacao');
  }
  const permitidos = new Set(fornecedores.map(f => f.id));
  const importador = new ImportadorCatalogoSimulado({
    repositorioCatalogo, registroFornecedores
  });
  const router = express.Router();
  router.use(criarAutorizacao({ segredo }));
  router.use((_req,res,next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/importacao/fornecedores', (_req,res) => {
    res.json({
      modo:'SIMULACAO_SEM_API_EXTERNA',
      fornecedores: fornecedores.map(f => ({
        id:f.id, nome:f.nome, demonstrativo:true
      }))
    });
  });

  router.post('/importacao/previa', async(req,res) => {
    try {
      const dados = somenteCampos(req.body,['fornecedorId']);
      if (!permitidos.has(dados.fornecedorId)) {
        return res.status(400).json({ erro:'FORNECEDOR_NAO_DEMONSTRATIVO' });
      }
      const previa = await importador.preparar({ fornecedorId:dados.fornecedorId });
      res.json({ ...previa, compraDisponivel:false, publicacoesAutomaticas:false });
    } catch {
      res.status(400).json({ erro:'PREVIA_INVALIDA' });
    }
  });

  router.post('/importacao/aplicar', async(req,res) => {
    try {
      const dados = somenteCampos(req.body,['fornecedorId','revisaoLote','confirmacao']);
      if (!permitidos.has(dados.fornecedorId)) {
        return res.status(400).json({ erro:'FORNECEDOR_NAO_DEMONSTRATIVO' });
      }
      if (dados.confirmacao !== MARCADOR_CONFIRMACAO) {
        return res.status(400).json({ erro:'CONFIRMACAO_EXPLICITA_OBRIGATORIA' });
      }
      const resultado = await importador.aplicar(dados);
      res.json({ ...resultado, compraDisponivel:false });
    } catch(erro) {
      if (/Lote mudou depois da previa/.test(erro.message)) {
        return res.status(409).json({ erro:'LOTE_MUDOU_REFAZER_PREVIA' });
      }
      if (/UNIQUE constraint failed/.test(erro.message)) {
        return res.status(409).json({ erro:'SKU_EM_CONFLITO_NENHUM_ITEM_IMPORTADO' });
      }
      res.status(400).json({ erro:'IMPORTACAO_NAO_REALIZADA' });
    }
  });
  return router;
}

module.exports = { criarRouterImportacaoLaboratorio };
