'use strict';

// Rotas administrativas de LABORATORIO, nao autenticacao de producao.
// Somente loopback, host local, ambiente nao produtivo e segredo >= 32 chars.
// O segredo nunca e enviado por pagina HTML ou incluido no GitHub.
const { timingSafeEqual } = require('node:crypto');
const express = require('express');

const CAMPOS_PRODUTO = new Set([
  'id','nome','tipo','estado','descricao','precoCentavos',
  'entrega','fotos','videoApresentacaoUrl','detalhes'
]);
const CAMPOS_ALTERAVEIS = new Set([...CAMPOS_PRODUTO].filter(c => c !== 'id'));

function localSeguro(req) {
  const ip = req.socket?.remoteAddress;
  if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip)) return false;

  // Verificacao de Host ajuda a bloquear DNS rebinding no navegador.
  const host = req.get('host') || '';
  if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host)) return false;
  const origem = req.get('origin');
  if (origem && origem !== 'http://' + host && origem !== 'https://' + host) return false;
  return true;
}

function criarAutorizacao({ segredo }) {
  if (typeof segredo !== 'string' || segredo.length < 32) {
    throw new Error('LOOP_ADMIN_TEST_TOKEN precisa de no minimo 32 caracteres');
  }
  const esperado = Buffer.from(segredo);
  return (req, res, next) => {
    if (!localSeguro(req)) {
      return res.status(403).json({ erro: 'ACESSO_ADMIN_LOCAL_APENAS' });
    }
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ erro: 'ADMIN_INDISPONIVEL_EM_PRODUCAO' });
    }
    const cabecalho = req.get('authorization') || '';
    const prefixo = 'Bearer ';
    const token = cabecalho.startsWith(prefixo) ? cabecalho.slice(prefixo.length) : '';
    const recebido = Buffer.from(token);
    if (!token || recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) {
      return res.status(401).json({ erro: 'CREDENCIAL_ADMIN_INVALIDA' });
    }
    if (['POST','PATCH','PUT','DELETE'].includes(req.method) && !req.is('application/json')) {
      return res.status(415).json({ erro: 'USE_APPLICATION_JSON' });
    }
    next();
  };
}

function extrairCampos(obj, camposPermitidos) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('Informe os campos do produto');
  }
  const keys = Object.keys(obj);
  if (keys.some(k => !camposPermitidos.has(k))) {
    throw new Error('Campo nao permitido no cadastro do produto');
  }
  return Object.fromEntries(keys.map(k => [k, obj[k]]));
}

function criarRouterAdminCatalogo({ repositorio, segredo } = {}) {
  if (!repositorio || ['listar','buscarRegistro','salvar','atualizar'].some(k => typeof repositorio[k] !== 'function')) {
    throw new Error('Repositorio editavel com controle de revisao e obrigatorio');
  }
  const router = express.Router();
  router.use(criarAutorizacao({ segredo }));

  router.get('/produtos', async (req, res, next) => {
    try {
      const produtos = await repositorio.listar();
      res.json({ modo:'ADMIN_LOCAL_TESTE', produtos });
    } catch (erro) { next(erro); }
  });

  router.get('/produtos/:id/historico', async (req, res, next) => {
    try {
      if (typeof repositorio.historico !== 'function') {
        return res.status(501).json({ erro:'HISTORICO_NAO_SUPORTADO' });
      }
      const registro = await repositorio.buscarRegistro(req.params.id);
      if (!registro) return res.status(404).json({ erro:'PRODUTO_NAO_ENCONTRADO' });
      const eventos = await repositorio.historico(req.params.id);
      res.set('Cache-Control', 'no-store');
      res.json({ modo:'ADMIN_LOCAL_TESTE', produtoId:req.params.id, eventos });
    } catch (erro) { responderErro(erro, res, next); }
  });

  router.get('/produtos/:id', async (req, res, next) => {
    try {
      const registro = await repositorio.buscarRegistro(req.params.id);
      if (!registro) return res.status(404).json({ erro:'PRODUTO_NAO_ENCONTRADO' });
      res.json({ modo:'ADMIN_LOCAL_TESTE', ...registro });
    } catch (erro) { responderErro(erro, res, next); }
  });

  router.post('/produtos', async (req, res, next) => {
    try {
      const corpo = extrairCampos(req.body, CAMPOS_PRODUTO);
      // Nao aceitar revisao da venda, custos de fornecedor, token ou status de pagamento.
      const gravacao = await repositorio.salvar({ produto:corpo, revisaoEsperada:0 });
      res.status(201).json({ modo:'ADMIN_LOCAL_TESTE', ...gravacao });
    } catch (erro) { responderErro(erro, res, next); }
  });

  router.patch('/produtos/:id', async (req, res, next) => {
    try {
      const { revisaoEsperada, alteracoes } = extrairCampos(
        req.body, new Set(['revisaoEsperada','alteracoes'])
      );
      if (!Number.isSafeInteger(revisaoEsperada) || revisaoEsperada < 1) {
        throw new Error('Informe revisaoEsperada valida');
      }
      const campos = extrairCampos(alteracoes, CAMPOS_ALTERAVEIS);
      const atualizado = await repositorio.atualizar({
        id:req.params.id, alteracoes:campos, revisaoEsperada
      });
      if (!atualizado) return res.status(404).json({ erro:'PRODUTO_NAO_ENCONTRADO' });
      res.json({ modo:'ADMIN_LOCAL_TESTE', ...atualizado });
    } catch (erro) { responderErro(erro, res, next); }
  });

  return router;
}

function responderErro(erro, res, next) {
  if (/Conflito de revisao/.test(erro.message)) {
    return res.status(409).json({ erro:'CONFLITO_DE_REVISAO', mensagem:'Recarregue o produto antes de salvar' });
  }
  if (erro instanceof Error && !/SQLITE|database|ENOENT|EACCES/i.test(erro.message)) {
    return res.status(400).json({ erro:'DADOS_INVALIDOS', mensagem:erro.message });
  }
  next(erro);
}

module.exports = { criarRouterAdminCatalogo, criarAutorizacao, localSeguro };
