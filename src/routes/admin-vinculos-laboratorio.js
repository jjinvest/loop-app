'use strict';

// API independente e exclusiva do laboratorio local de fornecedores.
// Usa a mesma autorizacao restrita do cadastro de produtos.
const express = require('express');
const { criarAutorizacao } = require('./admin-catalogo-laboratorio');

function camposExatos(dados, permitidos) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados) ||
      Object.keys(dados).some(chave => !permitidos.includes(chave))) {
    throw new Error('Campos nao permitidos para vinculo de fornecedor');
  }
  return dados;
}

function falha(erro, res, next) {
  if (/Conflito de revisao/.test(erro.message)) {
    return res.status(409).json({
      erro:'CONFLITO_FORNECEDOR',
      mensagem:'Recarregue o vinculo para verificar a revisao atual'
    });
  }
  if (/UNIQUE constraint failed/.test(erro.message)) {
    return res.status(409).json({ erro:'FORNECEDOR_SKU_JA_UTILIZADO' });
  }
  if (/nao cadastrado/.test(erro.message)) {
    return res.status(404).json({ erro:'PRODUTO_NAO_CADASTRADO' });
  }
  if (!/SQLITE|database|ENOENT|EACCES/i.test(erro.message)) {
    return res.status(400).json({ erro:'DADOS_DE_VINCULO_INVALIDOS' });
  }
  next(erro);
}

function criarRouterVinculosLaboratorio({ repositorio, vinculos, segredo } = {}) {
  if (!repositorio || typeof repositorio.buscarRegistro !== 'function' ||
      !vinculos || ['consultar','historico','vincular','desativar'].some(
        metodo => typeof vinculos[metodo] !== 'function'
      )) {
    throw new Error('Repositorio e vinculos sao obrigatorios');
  }
  const router = express.Router();
  router.use(criarAutorizacao({ segredo }));
  router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});

  router.get('/produtos/:id/fornecedor', async (req,res,next)=>{
    try {
      const registro = await repositorio.buscarRegistro(req.params.id);
      if (!registro) return res.status(404).json({erro:'PRODUTO_NAO_CADASTRADO'});
      res.json({
        modo:'LABORATORIO_SEM_PEDIDOS',
        vinculo: await vinculos.consultar({produtoId:req.params.id})
      });
    } catch(erro) { falha(erro,res,next); }
  });

  router.get('/produtos/:id/fornecedor/historico', async(req,res,next)=>{
    try {
      const registro = await repositorio.buscarRegistro(req.params.id);
      if (!registro) return res.status(404).json({erro:'PRODUTO_NAO_CADASTRADO'});
      res.json({
        modo:'LABORATORIO_SEM_PEDIDOS',
        eventos: await vinculos.historico({produtoId:req.params.id})
      });
    } catch(erro) { falha(erro,res,next); }
  });

  router.put('/produtos/:id/fornecedor', async(req,res,next)=>{
    try {
      const dados = camposExatos(req.body, ['fornecedorId','sku','revisaoEsperada']);
      const resultado = await vinculos.vincular({
        produtoId:req.params.id, fornecedorId:dados.fornecedorId,
        sku:dados.sku, revisaoEsperada:dados.revisaoEsperada
      });
      res.json({modo:'LABORATORIO_SEM_PEDIDOS', vinculo:resultado});
    } catch(erro) { falha(erro,res,next); }
  });

  router.post('/produtos/:id/fornecedor/desativar', async(req,res,next)=>{
    try {
      const dados = camposExatos(req.body, ['revisaoEsperada']);
      const resultado = await vinculos.desativar({
        produtoId:req.params.id, revisaoEsperada:dados.revisaoEsperada
      });
      res.json({modo:'LABORATORIO_SEM_PEDIDOS', vinculo:resultado});
    } catch(erro) { falha(erro,res,next); }
  });
  return router;
}

module.exports={ criarRouterVinculosLaboratorio };
