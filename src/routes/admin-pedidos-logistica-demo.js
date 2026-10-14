'use strict';

// Painel de pedidos inteiramente ficticios. Estas rotas nao existem na
// aplicacao publica. Nenhuma confirmacao aqui significa pagamento real.
const { randomUUID } = require('node:crypto');
const express = require('express');
const { criarAutorizacao } = require('./admin-catalogo-laboratorio');
const { PedidosLogisticosSimuladosSQLite, TRANSICOES } =
  require('../domain/pedidos-logisticos-simulados-sqlite');

const ACOES = Object.freeze([
  ...Object.keys(TRANSICOES),
  'SOLICITAR_REEMBOLSO_SIMULADO',
  'REGISTRAR_REEMBOLSO_SIMULADO'
]);

const MODELOS = Object.freeze([
  Object.freeze({
    pedidoId:'pedido-demo-001', produtoId:'produto-demo-casa',
    fornecedorId:'distribuidor-ficticio-casa', sku:'CASA_001'
  }),
  Object.freeze({
    pedidoId:'pedido-demo-002', produtoId:'produto-demo-escritorio',
    fornecedorId:'distribuidor-ficticio-escritorio', sku:'ESC_001'
  })
]);

function criarRouterPedidosLogisticaDemo({ segredo, repositorio } = {}) {
  const repo = repositorio || new PedidosLogisticosSimuladosSQLite({ caminho:':memory:' });
  if (!repo || ['buscar','listar','historico','registrar','cadastrar'].some(
    metodo => typeof repo[metodo] !== 'function'
  )) throw new Error('Repositorio de pedidos de laboratorio invalido');

  // Somente IDs ficticios com origem fixa; nunca receber clientes reais.
  for (const modelo of MODELOS) repo.cadastrar(modelo);
  const ids = new Set(MODELOS.map(m => m.pedidoId));
  const router = express.Router();
  router.use(criarAutorizacao({ segredo }));
  router.use((req,res,next)=>{
    res.set('Cache-Control','no-store');
    next();
  });

  router.get('/pedidos-demo',(_req,res)=>{
    res.json({
      modo:'PEDIDOS_E_PAGAMENTOS_TOTALMENTE_SIMULADOS',
      pedidos:repo.listar().filter(p=>ids.has(p.pedidoId)),
      acoesDisponiveis:ACOES,
      pagamentosReais:false,
      filasMovimentadas:false
    });
  });

  router.get('/pedidos-demo/:id/historico',(req,res)=>{
    if(!ids.has(req.params.id)) return res.status(404).json({erro:'PEDIDO_DEMO_NAO_ENCONTRADO'});
    res.json({modo:'PEDIDOS_TOTALMENTE_SIMULADOS',eventos:repo.historico(req.params.id)});
  });

  router.post('/pedidos-demo/:id/eventos',(req,res)=>{
    if(!ids.has(req.params.id)) return res.status(404).json({erro:'PEDIDO_DEMO_NAO_ENCONTRADO'});
    const dados = req.body;
    if(!dados || typeof dados !== 'object' || Array.isArray(dados) ||
       Object.keys(dados).some(chave=>!['tipo','revisaoEsperada'].includes(chave)) ||
       !ACOES.includes(dados.tipo) ||
       !Number.isSafeInteger(dados.revisaoEsperada) || dados.revisaoEsperada < 1) {
      return res.status(400).json({erro:'EVENTO_DEMO_INVALIDO'});
    }
    try {
      const resultado=repo.registrar({
        pedidoId:req.params.id,
        eventoId:'evt_'+randomUUID(),
        tipo:dados.tipo,
        revisaoEsperada:dados.revisaoEsperada
      });
      res.json({modo:'PEDIDOS_TOTALMENTE_SIMULADOS',...resultado});
    }catch(erro) {
      if(/Conflito de revisao/.test(erro.message)) {
        return res.status(409).json({erro:'PEDIDO_ALTERADO_RECARREGAR'});
      }
      if(/Transicao .* nao permitida|Registro de reembolso nao permitido|Solicitacao de reembolso nao permitida/.test(erro.message)) {
        return res.status(409).json({erro:'TRANSICAO_NAO_PERMITIDA'});
      }
      res.status(400).json({erro:'EVENTO_DEMO_REJEITADO'});
    }
  });

  return router;
}

module.exports={criarRouterPedidosLogisticaDemo,MODELOS,ACOES};
