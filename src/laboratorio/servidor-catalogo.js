'use strict';

// Servidor separado, somente para prototipo em 127.0.0.1.
// Nao montar estas rotas no app publico sem autenticacao de producao.
const express = require('express');
const path = require('node:path');
const { RepositorioCatalogoSQLite } = require('../domain/repositorio-catalogo-sqlite');
const { criarRouterCatalogo } = require('../routes/catalogo');
const { criarRouterAdminCatalogo, localSeguro } = require('../routes/admin-catalogo-laboratorio');
const { VinculosFornecedoresSQLite } = require('../domain/vinculos-fornecedores-sqlite');
const { criarRouterVinculosLaboratorio } = require('../routes/admin-vinculos-laboratorio');
const { criarFornecedoresDemonstrativos } = require('./fornecedores-demo');
const { criarRouterImportacaoLaboratorio } = require('../routes/admin-importacao-laboratorio');
const { criarRouterPedidosLogisticaDemo } = require('../routes/admin-pedidos-logistica-demo');
const { PedidosLogisticosSimuladosSQLite } = require('../domain/pedidos-logisticos-simulados-sqlite');
const { VinculosPedidosPagamentosDemoSQLite } = require('../domain/vinculos-pedidos-pagamentos-demo-sqlite');
const { criarRouterVinculosPedidosPagamentosDemo } = require('../routes/admin-vinculos-pedidos-pagamentos-demo');
const { criarRouterEscritorioDemo } = require('../routes/admin-escritorio-demo');
const { criarRouterFinanceiroAdminDemo } = require('../routes/admin-financeiro-demo');
const { RepositorioAparenciaCofresSQLite } = require('../domain/repositorio-aparencia-cofres-sqlite');
const { RazaoFinanceiroDemoSQLite } = require('../domain/razao-financeiro-demo-sqlite');
const { RecebimentosPSPDemoSQLite } = require('../domain/recebimentos-psp-demo-sqlite');
const { criarRouterRecebimentosPSPDemo } = require('../routes/admin-recebimentos-psp-demo');
const { criarRouterWebhookPSPDemoLocal } = require('../routes/webhook-psp-demo-local');

function criarAppAdminLaboratorio({ repositorio, segredo, webhookDemo } = {}) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('O painel de laboratorio nao funciona em producao');
  }
  const app = express();
  app.disable('x-powered-by');
  // A rota opcional precisa ler bytes ORIGINAIS antes do parser JSON geral.
  // Nao existe no laboratorio normal nem na aplicacao publica.
  let recebimentosDemo = null;
  if (webhookDemo?.habilitado === true) {
    app.use('/api/laboratorio', criarRouterWebhookPSPDemoLocal({
      segredo:webhookDemo.segredo,
      obterRecebimentos:()=>recebimentosDemo,
      ...(webhookDemo.agoraSegundos?{agoraSegundos:webhookDemo.agoraSegundos}:{})
    }));
  }
  app.use(express.json({limit:'16kb',strict:true}));

  function somenteLocal(req, res, next) {
    if (!localSeguro(req) || process.env.NODE_ENV === 'production') {
      return res.status(403).send('Painel disponivel apenas localmente');
    }
    res.set('Cache-Control', 'no-store');
    res.set('Content-Security-Policy',
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    next();
  }
  if (repositorio instanceof RepositorioCatalogoSQLite) {
    const vinculos = new VinculosFornecedoresSQLite({ repositorioCatalogo: repositorio });
    app.use('/api/admin', criarRouterVinculosLaboratorio({ repositorio, vinculos, segredo }));
    const amostra = criarFornecedoresDemonstrativos();
    app.use('/api/admin', criarRouterImportacaoLaboratorio({
      repositorioCatalogo: repositorio,
      registroFornecedores: amostra.registro,
      fornecedores: amostra.fornecedores,
      segredo
    }));
  }
  app.use('/api/admin', criarRouterAdminCatalogo({ repositorio, segredo }));
  const pedidosLogisticaDemo=new PedidosLogisticosSimuladosSQLite({caminho:':memory:'});
  app.locals.pedidosLogisticaDemo=pedidosLogisticaDemo;
  app.use('/api/admin', criarRouterPedidosLogisticaDemo({
    segredo, repositorio:pedidosLogisticaDemo
  }));
  app.use('/api/admin', criarRouterEscritorioDemo({ segredo }));
  const configuracaoCofres = repositorio instanceof RepositorioCatalogoSQLite
    ? new RepositorioAparenciaCofresSQLite({ banco:repositorio.banco })
    : null;
  const razaoPersistente = repositorio instanceof RepositorioCatalogoSQLite
    ? new RazaoFinanceiroDemoSQLite({ banco:repositorio.banco })
    : null;
  app.use('/api/admin', criarRouterFinanceiroAdminDemo({
    segredo, configuracao:configuracaoCofres, razaoPersistente
  }));
  recebimentosDemo = razaoPersistente
    ? new RecebimentosPSPDemoSQLite({ banco:repositorio.banco,razao:razaoPersistente })
    : null;
  app.use('/api/admin', criarRouterRecebimentosPSPDemo({
    segredo,recebimentos:recebimentosDemo
  }));
  // Ponte apenas de LEITURA. O mesmo repo de logistica do painel preexistente
  // e os pagamentos PSP ficticios sao fontes separadas de status, nunca
  // um comando de confirmacao automatica, reserva real ou criacao de posicao.
  const vinculosPedidoPagamentoDemo=recebimentosDemo
    ? new VinculosPedidosPagamentosDemoSQLite({
      banco:repositorio.banco, recebimentos:recebimentosDemo,
      logistica:pedidosLogisticaDemo
    })
    : null;
  app.use('/api/admin', criarRouterVinculosPedidosPagamentosDemo({
    segredo,vinculos:vinculosPedidoPagamentoDemo
  }));
  app.get('/admin', somenteLocal, (req, res) => {
    res.sendFile(path.join(__dirname, 'painel-catalogo.html'));
  });
  app.get('/admin/financeiro-demo', somenteLocal, (req, res) => {
    res.sendFile(path.join(__dirname,'financeiro-admin-demo.html'));
  });
  app.get('/admin/financeiro-demo.js', somenteLocal, (req, res) => {
    res.type('application/javascript').sendFile(path.join(__dirname,'financeiro-admin-demo.js'));
  });
  app.get('/admin/financeiro-demo.css', somenteLocal, (req, res) => {
    res.type('text/css').sendFile(path.join(__dirname,'financeiro-admin-demo.css'));
  });
  app.get('/admin/escritorio-demo', somenteLocal, (req, res) => {
    res.sendFile(path.join(__dirname, 'escritorio-demo.html'));
  });
  app.get('/admin/escritorio-demo.js', somenteLocal, (req, res) => {
    res.type('application/javascript').sendFile(path.join(__dirname,'escritorio-demo.js'));
  });
  app.get('/admin/escritorio-demo.css', somenteLocal, (req, res) => {
    res.type('text/css').sendFile(path.join(__dirname,'escritorio-demo.css'));
  });
  app.get('/admin/painel.js', somenteLocal, (req, res) => {
    res.type('application/javascript').sendFile(path.join(__dirname,'painel-catalogo.js'));
  });
  app.get('/admin/importacao.js', somenteLocal, (req, res) => {
    res.type('application/javascript').sendFile(path.join(__dirname, 'painel-importacao.js'));
  });
  app.get('/admin/pedidos-demo.js', somenteLocal, (req, res) => {
    res.type('application/javascript').sendFile(path.join(__dirname,'painel-pedidos-demo.js'));
  });
  app.get('/admin/painel.css', somenteLocal, (req, res) => {
    res.type('text/css').sendFile(path.join(__dirname,'painel-catalogo.css'));
  });
  app.use('/catalogo', criarRouterCatalogo({ repositorio }));
  app.use(express.static(path.join(__dirname, '..', '..', 'public')));
  return app;
}

function iniciarLaboratorio({ ambiente = process.env } = {}) {
  if (ambiente.LOOP_ADMIN_CATALOGO_LOCAL !== '1' || ambiente.NODE_ENV === 'production') {
    throw new Error('Exija LOOP_ADMIN_CATALOGO_LOCAL=1 e ambiente de desenvolvimento');
  }
  const caminho = ambiente.LOOP_CATALOGO_DB;
  if (!caminho || !path.isAbsolute(caminho)) {
    throw new Error('LOOP_CATALOGO_DB precisa ser um caminho absoluto');
  }
  const publicDir = path.resolve(__dirname,'..','..','public') + path.sep;
  const pastaRepo = path.resolve(__dirname,'..','..') + path.sep;
  if (caminho.startsWith(publicDir) || caminho.startsWith(pastaRepo)) {
    throw new Error('Banco de catalogo deve ficar fora da pasta do projeto');
  }
  const banco = new RepositorioCatalogoSQLite({ caminho });
  try {
    const app = criarAppAdminLaboratorio({
      repositorio:banco,
      segredo:ambiente.LOOP_ADMIN_TEST_TOKEN,
      // Explicito, opcional e exclusivamente para testes locais.
      webhookDemo:{
        habilitado:ambiente.LOOP_WEBHOOK_DEMO_LOCAL==='1',
        segredo:ambiente.LOOP_WEBHOOK_DEMO_SECRET
      }
    });
    const porta = ambiente.PORT ? Number(ambiente.PORT) : 3001;
    if (!Number.isSafeInteger(porta) || porta < 1 || porta > 65535) {
      throw new Error('Porta invalida');
    }
    const servidor = app.listen(porta,'127.0.0.1', () => {
      process.stdout.write('Catalogo LOOP em teste local: http://127.0.0.1:' + porta + '/admin\n');
    });
    servidor.on('close',() => banco.fechar());
    return { servidor, banco };
  } catch (erro) {
    banco.fechar();
    throw erro;
  }
}

if (require.main === module) iniciarLaboratorio();

module.exports = { criarAppAdminLaboratorio, iniciarLaboratorio };
