'use strict';

// Painel de participantes FICTICIOS; rota exclusiva do servidor local
// protegido pelo mesmo segredo de laboratorio do painel administrativo.
const express = require('express');
const { criarAutorizacao } = require('./admin-catalogo-laboratorio');
const { criarVisaoEscritorioDemo, TITULARES_FICTICIOS } =
  require('../domain/visao-escritorio-demo');
const { criarCenarioEscritorioMotor, extrairVisaoDoMotor } =
  require('../laboratorio/cenario-escritorio-motor');

function criarRouterEscritorioDemo({segredo,publicacoes=null}={}) {
  const router=express.Router();
  router.use(criarAutorizacao({segredo}));
  router.use((_req,res,next)=>{
    res.set('Cache-Control','no-store');
    next();
  });
  router.get('/escritorio-demo/publicacoes',(_req,res)=>{
    if(!publicacoes)return res.status(501).json({erro:'PUBLICACOES_INDISPONIVEIS'});
    return res.json({modo:'ADMIN_LOCAL_TESTE',
      publicacoes:publicacoes.listar(),
      controleExclusivoAdmin:true,semPropagandasAutomaticas:true});
  });
  router.post('/escritorio-demo/publicacoes',(req,res)=>{
    if(!publicacoes)return res.status(501).json({erro:'PUBLICACOES_INDISPONIVEIS'});
    if(!req.is('application/json'))return res.status(415).json({erro:'JSON_OBRIGATORIO'});
    const corpo=req.body;
    if(!corpo||Array.isArray(corpo)||typeof corpo!=='object'||
      Object.keys(corpo).some(x=>![
        'tipo','titulo','descricao','linkDestino','imagemCaminho'].includes(x)))
      return res.status(400).json({erro:'PUBLICACAO_INVALIDA'});
    try{return res.status(201).json(publicacoes.publicar(corpo));}
    catch(e){if(e.codigo)return res.status(400).json({erro:e.codigo});throw e;}
  });
  router.post('/escritorio-demo/publicacoes/:id/arquivar',(req,res)=>{
    if(!publicacoes)return res.status(501).json({erro:'PUBLICACOES_INDISPONIVEIS'});
    if(!req.is('application/json'))return res.status(415).json({erro:'JSON_OBRIGATORIO'});
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
       Object.keys(req.body).length)
      return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
    try{return res.json(publicacoes.arquivar(req.params.id));}
    catch(e){if(e.codigo)return res.status(409).json({erro:e.codigo});throw e;}
  });
  // Painel de auditoria: somente dados persistidos no banco local, sem inventar
  // receita, contemplacoes, cofres ou pagamentos nao conciliados.
  // Diretório administrativo: dados cadastrais mínimos; jamais expor email,
  // telefone, senha ou credenciais. Não atribuir compras sem vínculo verificado.
  router.get('/escritorio-demo/clientes',(_req,res)=>{
    if(!publicacoes?.banco)return res.status(501).json({erro:'FONTE_SQLITE_INDISPONIVEL'});
    const banco=publicacoes.banco;
    const existe=!!banco.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='admin_contas_participantes_demo'").get();
    if(!existe)return res.json({modo:'LABORATORIO_LOCAL',clientes:[],total:0});
    const total=banco.prepare('SELECT COUNT(*) AS n FROM admin_contas_participantes_demo').get().n;
    const clientes=banco.prepare(`
      SELECT c.id AS id,c.nome AS nome,c.criado_em AS criadoEm,
       n.apelido AS nick
      FROM admin_contas_participantes_demo c
      LEFT JOIN admin_links_apelidos_demo n ON n.conta_id=c.id
      ORDER BY c.criado_em DESC,c.id DESC LIMIT 100
    `).all();
    return res.json({modo:'LABORATORIO_LOCAL',total,clientes,
      limite:100,semPagamentosReais:true,
      comprasIndividuais:'NAO_CONCILIADAS',posicoesIndividuais:'NAO_CONCILIADAS',
      contemplacoesIndividuais:'NAO_CONCILIADAS'});
  });
  router.get('/escritorio-demo/auditoria-operacional',(_req,res)=>{
    if(!publicacoes?.banco)return res.status(501).json({
      erro:'FONTE_SQLITE_INDISPONIVEL',modo:'LABORATORIO_LOCAL'
    });
    const banco=publicacoes.banco;
    const existe=t=>!!banco.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
    const contar=t=>existe(t)?banco.prepare('SELECT COUNT(*) AS n FROM '+t).get().n:null;
    return res.json({
      modo:'LABORATORIO_LOCAL',fonte:'SQLITE_LOCAL',
      clientes:contar('admin_contas_participantes_demo'),
      pedidosCarrinho:contar('admin_carrinho_loop_demo'),
      posicoesOriginadasDeCompras:contar('admin_ponte_compras_demo'),
      posicoesAdicionais:contar('admin_ponte_posicoes_adicionais_demo'),
      comprasSomenteLoja:contar('admin_ponte_vendas_loja_sem_loop_demo'),
      eventosDePagamentoFicticio:contar('admin_carrinho_loop_eventos_demo'),
      cofres:null,ciclosConcluidos:null,bolasDouradas:null,
      faturamentoReal:null,pagamentosEfetivados:null,
      pendencias:['COFRES_SEM_FONTE_CONCILIADA_NESTA_ROTA',
       'CICLOS_E_DOURADAS_SEM_LIVRO_CONCILIADO_NESTA_ROTA'],
      semPagamentoReal:true
    });
  });
  router.get('/escritorio-demo',(_req,res)=>{
    res.json({
      modo:'ESCRITORIO_APENAS_DEMONSTRACAO',
      titulares:TITULARES_FICTICIOS.map(t=>({id:t.id,nome:t.nome})),
      semClientesReais:true,
      semPagamentosReais:true
    });
  });
  // Consulta alternativa ao MESMO motor de filas/tabuleiro, sobre um
  // cenario totalmente ficticio e imutavel por chamadas HTTP.
  // A rota especifica deve anteceder o segmento dinamico :id.
  const cenarioMotor=criarCenarioEscritorioMotor();
  router.get('/escritorio-demo/motor/:id',(req,res)=>{
    const resultado=extrairVisaoDoMotor({
      simulador:cenarioMotor,titularId:req.params.id
    });
    if(!resultado) return res.status(404).json({erro:'TITULAR_DEMO_NAO_ENCONTRADO'});
    res.json(resultado);
  });
  router.get('/escritorio-demo/:id',(req,res)=>{
    const resultado=criarVisaoEscritorioDemo({titularId:req.params.id});
    if(!resultado) return res.status(404).json({erro:'TITULAR_DEMO_NAO_ENCONTRADO'});
    res.json(resultado);
  });
  // Nao existe POST/PATCH/DELETE. Nenhuma funcao e operacional.
  return router;
}

module.exports={criarRouterEscritorioDemo};
