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
const { PedidosComerciaisDemoSQLite } = require('../domain/pedidos-comerciais-demo-sqlite');
const { criarRouterPedidosComerciaisDemo } = require('../routes/admin-pedidos-comerciais-demo');
const { PlanejamentoVendasFisicasDemoSQLite } = require('../domain/planejamento-vendas-fisicas-demo-sqlite');
const { criarRouterPlanejamentoFisicoDemo } = require('../routes/admin-planejamento-fisico-demo');
const { PagamentosPrePedidosFisicosDemoSQLite } = require('../domain/pagamentos-pre-pedidos-fisicos-demo-sqlite');
const { criarRouterPagamentosPrePedidosFisicosDemo } = require('../routes/admin-pagamentos-pre-pedidos-fisicos-demo');
const { PedidosPDFPagamentosDemoSQLite } = require('../domain/pedidos-pdf-pagamentos-demo-sqlite');
const { IntegracaoLojaPDFLoopDemo } = require('../domain/integracao-loja-pdf-loop-demo');
const { CarrinhoLojaLoopDemoSQLite } = require('../domain/carrinho-loja-loop-demo-sqlite');
const { criarRouterCarrinhoLoopDemo } = require('../routes/admin-carrinho-loop-demo');
const { criarRouterPedidosPDFDemo } = require('../routes/admin-pedidos-pdf-demo');
const { criarRouterEscritorioDemo } = require('../routes/admin-escritorio-demo');
const {PublicacoesHomeLoopV6DemoSQLite}=require('../domain/publicacoes-home-loop-v6-demo-sqlite');
const { ContasParticipantesDemoSQLite } = require('../domain/contas-participantes-demo-sqlite');
const { criarRouterContasParticipantesDemo } = require('../routes/admin-contas-participantes-demo');
const { criarRouterIndicacoesAdminDemo }=require('../routes/admin-indicacoes-taxa-demo');
const { criarRouterConviteCadastroDemo }=require('../routes/convite-cadastro-laboratorio-demo');
const { PonteComprasConvitesDemoSQLite } = require('../domain/ponte-compras-convites-demo-sqlite');
const { AdesoesPosicoesDemoSQLite } = require('../domain/adesoes-posicoes-demo-sqlite');
const { PedidosTitularidadeDemoSQLite } = require('../domain/pedidos-titularidade-demo-sqlite');
const { criarRouterPonteComprasConvitesDemo } = require('../routes/admin-ponte-compras-convites-demo');
const { criarRouterParticipanteDemo } = require('../routes/participante-laboratorio-demo');
const { SolicitacoesSaqueDemoSQLite }=require('../domain/solicitacoes-saque-demo-sqlite');
const {RetornoSaqueCentroV6DemoSQLite}=require('../domain/retorno-saque-centro-v6-demo-sqlite');
const { SessoesParticipanteDemo } = require('../domain/sessoes-participante-demo');
const { AuditoriaAcessoParticipanteDemoSQLite } = require('../domain/auditoria-acesso-participante-demo-sqlite');
const { criarRouterAuditoriaParticipanteDemo } = require('../routes/admin-auditoria-participante-demo');
const { criarRouterFinanceiroAdminDemo } = require('../routes/admin-financeiro-demo');
const { ConfiguracaoValorLoopDemoSQLite } = require('../domain/configuracao-valor-loop-demo-sqlite');
const { RepositorioAparenciaCofresSQLite } = require('../domain/repositorio-aparencia-cofres-sqlite');
const { RazaoFinanceiroDemoSQLite } = require('../domain/razao-financeiro-demo-sqlite');
const { RecebimentosPSPDemoSQLite } = require('../domain/recebimentos-psp-demo-sqlite');
const { criarRouterRecebimentosPSPDemo } = require('../routes/admin-recebimentos-psp-demo');
const { criarRouterWebhookPSPDemoLocal } = require('../routes/webhook-psp-demo-local');
const {CircuitBreakV6DemoSQLite}=require('../domain/circuit-break-v6-demo-sqlite');
const {CircuitBreakPonteV6DemoSQLite}=require('../domain/circuit-break-ponte-v6-demo-sqlite');
const {ProgramadorCatracaV6DemoSQLite}=require('../domain/programador-catraca-v6-demo-sqlite');
const {criarRouterCircuitBreakV6Demo}=require('../routes/admin-circuit-break-v6-demo');
const {AsaasSandboxLojaV6}=require('../domain/asaas-sandbox-loja-v6');
const {CobrancasAkitemmAsaasSandboxSQLite}=require('../domain/cobrancas-akitemm-asaas-sandbox-v6');
const {criarRouterCobrancasAkitemmSandboxV6}=require('../routes/admin-cobrancas-akitemm-sandbox-v6');

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
  const publicacoesHomeLoop= repositorio?.banco ?
    new PublicacoesHomeLoopV6DemoSQLite({banco:repositorio.banco}):null;
  app.use('/api/admin', criarRouterEscritorioDemo({ segredo,publicacoes:publicacoesHomeLoop }));
  // Publicacoes escolhidas pelo dono, visiveis ao participante, somente leitura.
  // Nenhuma credencial, custo, dado interno ou endpoint admin e exposto.
  app.get('/api/laboratorio/loop03/publicacoes',somenteLocal,(_req,res)=>{
    const publicacoes=publicacoesHomeLoop?publicacoesHomeLoop.listar().map(p=>({
      tipo:p.tipo,titulo:p.titulo,descricao:p.descricao,
      imagemCaminho:p.imagemCaminho,linkDestino:p.linkDestino
    })):[];
    res.json({publicacoes,modo:'LABORATORIO_LOCAL'});
  });
  let pedidosPDFDemo=null;
  let integracaoPDFLoopDemo=null;
  let carrinhosLojaLoopDemo=null;
  let ponteParaCircuito=null;
  let circuitoPonteDemo=null;
  let retornoSaqueCentroDemo=null;
  let contasParaRetornoSaqueCentro=null;
  // Cadastro de pessoas APENAS FICTICIAS: sem CPF, confirmacao de compra,
  // sessao publica, codigo validado de fila ou movimentacao de catraca.
  if(repositorio instanceof RepositorioCatalogoSQLite){
    const contasDemo=new ContasParticipantesDemoSQLite({banco:repositorio.banco});
    contasParaRetornoSaqueCentro=contasDemo;
    app.use('/api/admin',criarRouterContasParticipantesDemo({
      segredo,contas:contasDemo
    }));
    const configuracaoValorLoopDemo=new ConfiguracaoValorLoopDemoSQLite({banco:repositorio.banco});
    const pedidosIdentificadosDemo=new PedidosTitularidadeDemoSQLite({
      banco:repositorio.banco,contas:contasDemo
    });
    pedidosPDFDemo=new PedidosPDFPagamentosDemoSQLite({repositorioCatalogo:repositorio});
    // Ponte somente de leitura no HTTP; a confirmacao confiavel e
    // injetada apenas por testes/scripts do servidor, NUNCA pelo navegador.
    const ponteDemo=new PonteComprasConvitesDemoSQLite({
      banco:repositorio.banco,contas:contasDemo,
      pedidosIdentificados:pedidosIdentificadosDemo,
      configuracaoValor:configuracaoValorLoopDemo,
      consultarPagamentoConfiavel:async pedidoId=>{
        if(carrinhosLojaLoopDemo?.buscar(pedidoId))
          return carrinhosLojaLoopDemo.comprovanteConfirmado(pedidoId);
        if(!integracaoPDFLoopDemo)throw new Error('Verificador interno PDF nao configurado');
        return integracaoPDFLoopDemo.comprovanteConfirmado(pedidoId);
      }
    });
    ponteParaCircuito=ponteDemo;
    app.use('/api/admin',criarRouterIndicacoesAdminDemo({
      segredo,links:ponteDemo.linksComissoes
    }));
    integracaoPDFLoopDemo=new IntegracaoLojaPDFLoopDemo({
      pedidosPDF:pedidosPDFDemo,pedidosIdentificados:pedidosIdentificadosDemo,ponte:ponteDemo
    });
    carrinhosLojaLoopDemo=new CarrinhoLojaLoopDemoSQLite({
      catalogo:repositorio,contas:contasDemo,
      pedidosIdentificados:pedidosIdentificadosDemo,ponte:ponteDemo
    });
    app.use('/api/admin',criarRouterCarrinhoLoopDemo({
      segredo,carrinhos:carrinhosLojaLoopDemo
    }));
    app.use('/api/laboratorio/convite',criarRouterConviteCadastroDemo({
      contas:contasDemo,links:ponteDemo.linksComissoes,carrinhos:carrinhosLojaLoopDemo
    }));
    const adesoesDemo=new AdesoesPosicoesDemoSQLite({ponte:ponteDemo});
    const saquesDemo=new SolicitacoesSaqueDemoSQLite({
      banco:repositorio.banco,contas:contasDemo,links:ponteDemo.linksComissoes
    });
    app.use('/api/admin',criarRouterPonteComprasConvitesDemo({
      segredo,ponte:ponteDemo
    }));
    // O titular usa uma sessao ficticia segregada: nenhuma credencial admin
    // nem ID de outro participante e aceita na rota individual.
    const auditoriaDemo=new AuditoriaAcessoParticipanteDemoSQLite({
      banco:repositorio.banco
    });
    const sessoesDemo=new SessoesParticipanteDemo({
      contas:contasDemo,auditoria:auditoriaDemo
    });
    app.use('/api/laboratorio/participante',criarRouterParticipanteDemo({
      contas:contasDemo,ponte:ponteDemo,sessoes:sessoesDemo,adesoes:adesoesDemo,
      carrinhos:carrinhosLojaLoopDemo,saques:saquesDemo,
      obterLivroProvisoesV6:()=>circuitoPonteDemo?.livro||null,
      obterRetornoSaqueCentroDemo:()=>retornoSaqueCentroDemo
    }));
    app.use('/api/admin',criarRouterAuditoriaParticipanteDemo({
      segredo,auditoria:auditoriaDemo
    }));
  }
  const configuracaoCofres = repositorio instanceof RepositorioCatalogoSQLite
    ? new RepositorioAparenciaCofresSQLite({ banco:repositorio.banco })
    : null;
  const razaoPersistente = repositorio instanceof RepositorioCatalogoSQLite
    ? new RazaoFinanceiroDemoSQLite({ banco:repositorio.banco })
    : null;
  const circuitoDemo = repositorio instanceof RepositorioCatalogoSQLite
    ? new CircuitBreakV6DemoSQLite({banco:repositorio.banco}) : null;
  circuitoPonteDemo=circuitoDemo&&ponteParaCircuito?
    new CircuitBreakPonteV6DemoSQLite({banco:repositorio.banco,
      ponte:ponteParaCircuito,controle:circuitoDemo}):null;
  retornoSaqueCentroDemo=circuitoPonteDemo&&contasParaRetornoSaqueCentro?
    new RetornoSaqueCentroV6DemoSQLite({banco:repositorio.banco,
      livro:circuitoPonteDemo.livro,contas:contasParaRetornoSaqueCentro}):null;
  const programadorCatracaDemo=circuitoPonteDemo?
    new ProgramadorCatracaV6DemoSQLite({banco:repositorio.banco,
      ponteControle:circuitoPonteDemo,controle:circuitoDemo}):null;
  app.locals.programadorCatracaDemo=programadorCatracaDemo;
  app.use('/api/admin',criarRouterCircuitBreakV6Demo({
    segredo,controle:circuitoDemo,ponteControle:circuitoPonteDemo,
    programador:programadorCatracaDemo,retornoSaqueCentroDemo
  }));
  app.use('/api/admin', criarRouterFinanceiroAdminDemo({
    segredo, configuracao:configuracaoCofres, razaoPersistente,
    configuracaoValorLoop:repositorio instanceof RepositorioCatalogoSQLite?
      new ConfiguracaoValorLoopDemoSQLite({banco:repositorio.banco}):null
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
  const pedidosComerciaisDemo=recebimentosDemo
    ? new PedidosComerciaisDemoSQLite({
      repositorioCatalogo:repositorio,
      vinculosFornecedor:new VinculosFornecedoresSQLite({repositorioCatalogo:repositorio}),
      recebimentos:recebimentosDemo
    })
    : null;
  if (pedidosComerciaisDemo) {
    app.use('/api/admin', criarRouterPedidosComerciaisDemo({
      segredo,pedidos:pedidosComerciaisDemo
    }));
  }
  // Fluxo de cursos digitais: faturas com preco do catalogo e sem
  // distribuicao de valores na catraca. Simulacao separada do PSP legado.
  if (repositorio instanceof RepositorioCatalogoSQLite) {
    app.use('/api/admin',criarRouterPedidosPDFDemo({
      segredo,pedidos:pedidosPDFDemo,integracaoLoop:integracaoPDFLoopDemo
    }));
  }
  // AKITEMM dentro do LOOP: conector opcional EXCLUSIVAMENTE SANDBOX.
  // Sem chave de teste, rotas respondem desativadas. Em producao o servidor
  // de laboratorio ja recusa inicializacao. Jamais expor a chave ao cliente.
  const asaasSandbox=process.env.ASAAS_SANDBOX_API_KEY&&
    repositorio instanceof RepositorioCatalogoSQLite?
    new CobrancasAkitemmAsaasSandboxSQLite({
      banco:repositorio.banco,
      provedor:new AsaasSandboxLojaV6({apiKey:process.env.ASAAS_SANDBOX_API_KEY})
    }):null;
  app.use('/api/admin',criarRouterCobrancasAkitemmSandboxV6({
    segredo,servico:asaasSandbox
  }));
  app.locals.akitemmSandboxHabilitado=Boolean(asaasSandbox);
  // Compra fisica com preco livre: so PRE-PEDIDO ficticio, com
  // custo preenchido pelo admin, sem caixa, PSP ou criacao de posicao.
  if(repositorio instanceof RepositorioCatalogoSQLite){
    const planejamentoFisicoDemo=new PlanejamentoVendasFisicasDemoSQLite({
      repositorioCatalogo:repositorio,
      vinculosFornecedor:new VinculosFornecedoresSQLite({repositorioCatalogo:repositorio})
    });
    app.use('/api/admin',criarRouterPlanejamentoFisicoDemo({
      segredo,planejamento:planejamentoFisicoDemo
    }));
    const pagamentosPrePedidosFisicosDemo=new PagamentosPrePedidosFisicosDemoSQLite({
      planejamento:planejamentoFisicoDemo
    });
    app.use('/api/admin',criarRouterPagamentosPrePedidosFisicosDemo({
      segredo,pagamentos:pagamentosPrePedidosFisicosDemo
    }));
  }
  app.get('/admin', somenteLocal, (req, res) => {
    res.sendFile(path.join(__dirname, 'painel-catalogo.html'));
  });
  app.get('/admin/circuit-break-v6', somenteLocal, (_req,res)=>{
    res.sendFile(path.join(__dirname,'circuit-break-v6-demo.html'));
  });
  app.get('/admin/circuit-break-v6.js', somenteLocal, (_req,res)=>{
    res.type('application/javascript').sendFile(path.join(__dirname,'circuit-break-v6-demo.js'));
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
  // Apelidos de rota: duas portas identificadas, sem dominio externo publicado.
  // A plataforma LOOP e unica; AKITEMM e a aba loja e o escritorio e central.
  // Os links personalizados de todos os titulares entram por portas genericas.
  app.get('/loja', somenteLocal, (_req,res)=>{
    res.sendFile(path.join(__dirname,'loja-cliente-demo.html'));
  });
  app.get('/escritorio', somenteLocal, (_req,res)=>{
    res.sendFile(path.join(__dirname,'participante-demo.html'));
  });
  app.get('/loja-vilela', somenteLocal, (_req, res) => {
    res.sendFile(path.join(__dirname,'loja-cliente-demo.html'));
  });
  app.get('/escritorio-vilela', somenteLocal, (_req, res) => {
    res.sendFile(path.join(__dirname,'participante-demo.html'));
  });
  app.get('/laboratorio/loja', somenteLocal, (req, res) => {
    res.sendFile(path.join(__dirname,'loja-cliente-demo.html'));
  });
  app.get('/laboratorio/educacao-carrinho.js', somenteLocal, (_req,res)=>{
    res.type('application/javascript').sendFile(path.join(__dirname,'educacao-carrinho-loop-v6.js'));
  });
  app.get('/laboratorio/loja.js', somenteLocal, (req, res) => {
    res.type('application/javascript').sendFile(path.join(__dirname,'loja-cliente-demo.js'));
  });
  app.get('/laboratorio/loja.css', somenteLocal, (req, res) => {
    res.type('text/css').sendFile(path.join(__dirname,'loja-cliente-demo.css'));
  });
  app.get('/laboratorio/cadastro',somenteLocal,(_req,res)=>{
    res.sendFile(path.join(__dirname,'convite-cliente-demo.html'));
  });
  app.get([
    '/laboratorio/convite/:token','/laboratorio/convite/:token/:apelido',
    '/loja-vilela/convite/:token','/loja-vilela/convite/:token/:apelido',
    '/escritorio-vilela/convite/:token','/escritorio-vilela/convite/:token/:apelido',
    '/loja/convite/:token','/loja/convite/:token/:apelido',
    '/escritorio/convite/:token','/escritorio/convite/:token/:apelido'
  ],somenteLocal,(req,res)=>{
    const token=req.params.token;
    if(typeof token!=='string'||token.length!==23||!/^lp-[a-f0-9]+/.test(token))
      return res.status(404).end();
    res.sendFile(path.join(__dirname,'convite-cliente-demo.html'));
  });
  app.get('/laboratorio/convite.js',somenteLocal,(_req,res)=>{
    res.type('application/javascript').sendFile(path.join(__dirname,'convite-cliente-demo.js'));
  });
  app.get('/laboratorio/participante', somenteLocal, (req, res) => {
    res.sendFile(path.join(__dirname,'participante-demo.html'));
  });
  app.get('/laboratorio/participante.js', somenteLocal, (req, res) => {
    res.type('application/javascript').sendFile(path.join(__dirname,'participante-demo.js'));
  });
  app.get('/laboratorio/participante.css', somenteLocal, (req, res) => {
    res.type('text/css').sendFile(path.join(__dirname,'participante-demo.css'));
  });
  app.get('/laboratorio/loop-03-shell.js',somenteLocal,(_req,res)=>{
    res.type('application/javascript').sendFile(path.join(__dirname,'loop-03-shell.js'));
  });
  app.get('/laboratorio/loop-03-shell.css',somenteLocal,(_req,res)=>{
    res.type('text/css').sendFile(path.join(__dirname,'loop-03-shell.css'));
  });
  app.get('/admin/cadastro-participantes-demo', somenteLocal, (req, res) => {
    res.sendFile(path.join(__dirname,'cadastro-participantes-demo.html'));
  });
  app.get('/admin/cadastro-participantes-demo.js', somenteLocal, (req, res) => {
    res.type('application/javascript').sendFile(path.join(__dirname,'cadastro-participantes-demo.js'));
  });
  app.get('/admin/cadastro-participantes-demo.css', somenteLocal, (req, res) => {
    res.type('text/css').sendFile(path.join(__dirname,'cadastro-participantes-demo.css'));
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
  app.get('/admin/precificacao.js', somenteLocal, (_req,res)=>{
    res.type('application/javascript').sendFile(path.join(__dirname,'../domain/ponte-financeira-simples-akitemm-loop-v6.js'));
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
    // Agenda automatica SOMENTE no processo de laboratorio LOCAL em execucao.
    // Em testes HTTP com app factory nao criamos timers externos.
    const programa=app.locals.programadorCatracaDemo;
    const timer=programa?setInterval(()=>{
      try{programa.processarVencimento();}
      catch(e){process.stderr.write('[LOOP demo] programacao falhou: '+e.message+'\n');}
    },60_000):null;
    if(timer)timer.unref();
    servidor.on('close',()=>{
      if(timer)clearInterval(timer);
      banco.fechar();
    });
    return { servidor, banco };
  } catch (erro) {
    banco.fechar();
    throw erro;
  }
}

if (require.main === module) iniciarLaboratorio();

module.exports = { criarAppAdminLaboratorio, iniciarLaboratorio };
