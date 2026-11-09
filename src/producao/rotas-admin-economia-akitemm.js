'use strict';
// API privada da área PRODUTOS do administrador aprovado.
// NÃO montar nas rotas /api/contas dos clientes, nem em LAB.
// "autorizarAdministrador" e "validarCsrfAdmin" devem ser fornecidos pelo
// gateway de administração definitivo; sem os dois, a API não é criada.
const express=require('express');
function erro(c){const e=new Error(c);e.codigo=c;throw e;}
function criarRouterAdminEconomiaAkitemm({
 controle,catalogo=null,pedidosComerciais=null,auditoria=null,
 manutencao=null,classificacaoLoop=null,autorizarAdministrador,validarCsrfAdmin,origemHttps
}={}){
 if(!controle||typeof controle.listarOfertas!=='function'||
    typeof controle.definirCusto!=='function'||
    typeof controle.atualizarPrecoVenda!=='function'||
    typeof controle.csvContador!=='function'||
    typeof autorizarAdministrador!=='function'||
    typeof validarCsrfAdmin!=='function')
  erro('ADMIN_REAL_SEM_AUTORIZACAO');
 if(catalogo!==null&&(
    typeof catalogo.criarProduto!=='function'||
    typeof catalogo.vincularOferta!=='function'||
    typeof catalogo.listarProdutosAdministrativos!=='function'))
  erro('CATALOGO_ADMIN_NAO_CONFIGURADO');
 if(auditoria!==null&&(
    typeof auditoria.listar!=='function'||
    typeof auditoria.verificar!=='function'))
  erro('AUDITORIA_ADMIN_NAO_CONFIGURADA');
 if(manutencao!==null&&(
    typeof manutencao.estado!=='function'||
    typeof manutencao.alterar!=='function'||
    manutencao.db!==controle.db))
  erro('MANUTENCAO_ADMIN_NAO_CONFIGURADA');
 if(classificacaoLoop!==null&&(
    classificacaoLoop.db!==controle.db||
    typeof classificacaoLoop.listarRegras!=='function'||
    typeof classificacaoLoop.configurarProduto!=='function'))
  erro('CLASSIFICACAO_ADMIN_NAO_CONFIGURADA');
 if(pedidosComerciais!==null&&
    typeof pedidosComerciais.listarResumoContabil!=='function')
  erro('CONTABILIDADE_PEDIDOS_NAO_CONFIGURADA');
 let origem;
 try{
  const url=new URL(origemHttps);
  if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.hash)
   erro('ORIGEM_ADMIN_REAL_INVALIDA');
  origem=url.origin;
 }catch{erro('ORIGEM_ADMIN_REAL_INVALIDA');}
 const router=express.Router();
 router.use((_req,res,next)=>{
  res.set('Cache-Control','no-store');
  res.set('X-Content-Type-Options','nosniff');
  res.set('Content-Security-Policy',"default-src 'none'");
  next();
 });
 router.use(autorizarAdministrador);
 // Emergência não bloqueia login, consulta de preços, auditoria ou
 // pedidos antigos. Escritas de catálogo param, mesmo com sessão válida.
 router.use((req,res,next)=>{
  if(req.method!=='POST'||req.path==='/manutencao'||!manutencao)
   return next();
  try{
   if(manutencao.estado().suspensa)return res.status(423).json({
    erro:'OPERACAO_COMERCIAL_EM_MANUTENCAO'
   });
   next();
  }catch{return res.status(503).json({erro:'MANUTENCAO_INDISPONIVEL'});}
 });
 router.get('/manutencao',(_req,res)=>{
  if(!manutencao)return res.status(503).json({
   erro:'MANUTENCAO_NAO_CONFIGURADA'
  });
  try{return res.json(manutencao.estado());}
  catch{return res.status(503).json({erro:'MANUTENCAO_INDISPONIVEL'});}
 });
 router.post('/manutencao',express.json({limit:'2kb',strict:true}),
  (req,res,next)=>{
   if(req.get('origin')!==origem)
    return res.status(403).json({erro:'ORIGEM_ADMIN_INVALIDA'});
   if(!req.is('application/json'))
    return res.status(415).json({erro:'JSON_OBRIGATORIO'});
   next();
  },validarCsrfAdmin,(req,res)=>{
   if(!manutencao)return res.status(503).json({
    erro:'MANUTENCAO_NAO_CONFIGURADA'
   });
   const body=req.body;
   if(!body||Array.isArray(body)||
      Object.keys(body).sort().join(',')!=='motivo,revisaoEsperada,suspensa')
    return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
   try{return res.json(manutencao.alterar(body));}
   catch(e){
    if(e.codigo==='MANUTENCAO_REVISAO_EM_CONFLITO'||
       e.codigo==='MANUTENCAO_MODO_JA_DEFINIDO')
     return res.status(409).json({erro:e.codigo});
    if(e.codigo==='MANUTENCAO_COMANDO_INVALIDO')
     return res.status(400).json({erro:e.codigo});
    return res.status(503).json({erro:'MANUTENCAO_INDISPONIVEL'});
   }
  });
 router.get('/auditoria',(_req,res)=>{
  if(!auditoria)return res.status(503).json({
   erro:'AUDITORIA_ADMIN_AINDA_NAO_CONFIGURADA'
  });
  try{
   const verificacao=auditoria.verificar();
   return res.json({auditoriaIntegra:verificacao.integra,
    totalHistorico:verificacao.total,
    eventos:auditoria.listar({limite:50}),
    somenteLeitura:true,nenhumDadoPessoal:true});
  }catch{return res.status(503).json({
   erro:'AUDITORIA_ADMIN_NAO_COMPROVADA'
  });}
 });
 router.get('/produtos-valores',(_req,res)=>{
  try{return res.json({
   ofertas:controle.listarOfertas({limite:500}),
   dadosPrivados:true,
   finalidade:'GESTAO_E_CONTABILIDADE',
   impostosCalculados:false,profitLiquidoCalculado:false
  });}catch{return res.status(503).json({erro:'ECONOMIA_INDISPONIVEL'});}
 });
 // Cadastro de produtos/distribuidores comerciais reais apenas em
 // RASCUNHO: nunca ativa oferta sem homologação do parceiro.
 router.get('/produtos-cadastrados',(_req,res)=>{
  if(!catalogo)return res.status(503).json({erro:'CATALOGO_ADMIN_NAO_CONFIGURADO'});
  try{return res.json({
   produtos:catalogo.listarProdutosAdministrativos({limite:500}),
   nenhumProdutoPublicadoPorEstaRota:true
  });}catch{return res.status(503).json({erro:'CATALOGO_INDISPONIVEL'});}
 });
 const editarCadastro=(req,res,next)=>{
  if(req.get('origin')!==origem)
   return res.status(403).json({erro:'ORIGEM_ADMIN_INVALIDA'});
  if(!req.is('application/json'))
   return res.status(415).json({erro:'JSON_OBRIGATORIO'});
  next();
 };
 router.get('/classificacoes',(_req,res)=>{
  if(!classificacaoLoop)return res.status(503).json({
   erro:'CLASSIFICACAO_AINDA_NAO_CONFIGURADA'
  });
  try{return res.json(classificacaoLoop.listarRegras());}
  catch{return res.status(503).json({erro:'CLASSIFICACAO_INDISPONIVEL'});}
 });
 router.post('/classificacoes/:produtoId',
  express.json({limit:'2kb',strict:true}),
  editarCadastro,validarCsrfAdmin,(req,res)=>{
   if(!classificacaoLoop)return res.status(503).json({
    erro:'CLASSIFICACAO_AINDA_NAO_CONFIGURADA'
   });
   const b=req.body;
   if(!b||Array.isArray(b)||
      Object.keys(b).sort().join(',')!==
      'cor,minimo,revisaoEsperada,roxasPorUnidade')
    return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
   try{return res.json(classificacaoLoop.configurarProduto({
    produtoId:req.params.produtoId,...b,autorizado:true
   }));}
   catch(e){
    if(e.codigo==='CORES_COMERCIAIS_REVISAO_DIVERGENTE')
     return res.status(409).json({erro:e.codigo});
    if(['CORES_COMERCIAIS_REGRA_INVALIDA',
        'CORES_COMERCIAIS_PRODUTO_INEXISTENTE'].includes(e.codigo))
     return res.status(400).json({erro:e.codigo});
    if(e.codigo==='OPERACAO_COMERCIAL_EM_MANUTENCAO')
     return res.status(423).json({erro:e.codigo});
    return res.status(503).json({erro:'CLASSIFICACAO_INDISPONIVEL'});
   }
  });
 router.post('/produtos-cadastrar',express.json({limit:'4kb',strict:true}),
  editarCadastro,validarCsrfAdmin,(req,res)=>{
   if(!catalogo)return res.status(503).json({erro:'CATALOGO_ADMIN_NAO_CONFIGURADO'});
   const b=req.body;
   if(!b||Array.isArray(b)||
      Object.keys(b).sort().join(',')!=='descricao,produtoId,titulo')
    return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
   try{
    const produto=catalogo.criarProduto(b);
    return res.status(201).json(produto);
   }catch(e){
    if(e.codigo==='PRODUTO_COMERCIAL_INVALIDO')
     return res.status(400).json({erro:e.codigo});
    if(/UNIQUE|constraint/i.test(e.message||''))
     return res.status(409).json({erro:'PRODUTO_JA_CADASTRADO'});
    return res.status(503).json({erro:'CATALOGO_INDISPONIVEL'});
   }
  });
 router.post('/ofertas-cadastrar',express.json({limit:'4kb',strict:true}),
  editarCadastro,validarCsrfAdmin,(req,res)=>{
   if(!catalogo)return res.status(503).json({erro:'CATALOGO_ADMIN_NAO_CONFIGURADO'});
   const b=req.body;
   if(!b||Array.isArray(b)||
      Object.keys(b).sort().join(',')!==
       'distribuidorId,precoUnitCentavos,prioridade,produtoId,sku')
    return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
   try{
    const oferta=catalogo.vincularOferta(b);
    return res.status(201).json(oferta);
   }catch(e){
    if(['OFERTA_COMERCIAL_INVALIDA','PRODUTO_COMERCIAL_NAO_EXISTE'].includes(e.codigo))
     return res.status(400).json({erro:e.codigo});
    if(/UNIQUE|constraint/i.test(e.message||''))
     return res.status(409).json({erro:'SKU_OU_OFERTA_EM_CONFLITO'});
    return res.status(503).json({erro:'CATALOGO_INDISPONIVEL'});
   }
  });
 router.post('/produtos-valores/:produtoId/:distribuidorId',
  express.json({limit:'4kb',strict:true}),
  (req,res,next)=>{
   if(req.get('origin')!==origem)
    return res.status(403).json({erro:'ORIGEM_ADMIN_INVALIDA'});
   if(!req.is('application/json'))
    return res.status(415).json({erro:'JSON_OBRIGATORIO'});
   next();
  },validarCsrfAdmin,(req,res)=>{
   const b=req.body;
   if(!b||Array.isArray(b)||
      Object.keys(b).sort().join(',')!=='custoUnitCentavos,revisaoEsperada')
    return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
   try{
    return res.json(controle.definirCusto({
     produtoId:req.params.produtoId,
     distribuidorId:req.params.distribuidorId,
     custoUnitCentavos:b.custoUnitCentavos,
     revisaoEsperada:b.revisaoEsperada
    }));
   }catch(e){
    if(e.codigo==='REVISAO_CUSTO_EM_CONFLITO')
     return res.status(409).json({erro:e.codigo});
    if(['CUSTO_FORNECEDOR_INVALIDO','OFERTA_NAO_EXISTE'].includes(e.codigo))
     return res.status(400).json({erro:e.codigo});
    return res.status(503).json({erro:'ECONOMIA_INDISPONIVEL'});
   }
  });
 // Preço de vitrine é mutável, mas cada alteração fica auditada.
 // Esta rota não cria pagamento e preserva o snapshot dos pedidos antigos.
 router.post('/produtos-preco/:produtoId/:distribuidorId',
  express.json({limit:'4kb',strict:true}),
  (req,res,next)=>{
   if(req.get('origin')!==origem)
    return res.status(403).json({erro:'ORIGEM_ADMIN_INVALIDA'});
   if(!req.is('application/json'))
    return res.status(415).json({erro:'JSON_OBRIGATORIO'});
   next();
  },validarCsrfAdmin,(req,res)=>{
   const b=req.body;
   if(!b||Array.isArray(b)||
      Object.keys(b).sort().join(',')!==
       'precoAnteriorCentavos,precoVendaCentavos,revisaoPrecoEsperada')
    return res.status(400).json({erro:'CAMPOS_INVALIDOS'});
   try{
    return res.json(controle.atualizarPrecoVenda({
     produtoId:req.params.produtoId,
     distribuidorId:req.params.distribuidorId,
     precoVendaCentavos:b.precoVendaCentavos,
     precoAnteriorCentavos:b.precoAnteriorCentavos,
     revisaoPrecoEsperada:b.revisaoPrecoEsperada
    }));
   }catch(e){
    if(e.codigo==='REVISAO_PRECO_EM_CONFLITO')
     return res.status(409).json({erro:e.codigo});
    if(['PRECO_VENDA_INVALIDO','OFERTA_NAO_EXISTE'].includes(e.codigo))
     return res.status(400).json({erro:e.codigo});
    return res.status(503).json({erro:'ECONOMIA_INDISPONIVEL'});
   }
  });
 router.get('/contador/catalogo.csv',(_req,res)=>{
  try{
   const csv=controle.csvContador({limite:500});
   return res.set({
    'Content-Type':'text/csv; charset=utf-8',
    'Content-Disposition':'attachment; filename="akitemm-produtos-para-contador.csv"'
   }).send('\uFEFF'+csv);
  }catch{return res.status(503).json({erro:'CSV_INDISPONIVEL'});}
 });
 router.get('/contador/pedidos.csv',(_req,res)=>{
  if(!pedidosComerciais)
   return res.status(503).json({erro:'PEDIDOS_REAIS_AINDA_NAO_INTEGRADOS'});
  try{
   const rows=pedidosComerciais.listarResumoContabil({limite:500});
   if(!Array.isArray(rows)||rows.length>500)
    throw Error('PEDIDOS_INCONSISTENTES');
   const escapar=v=>{
    const s=String(v??'');
    return '"'+(/^[=+@\-\t\r]/.test(s)?"'"+s:s)
     .replaceAll('"','""')+'"';
   };
   const dinheiro=n=>Number.isSafeInteger(n)?
    (n/100).toFixed(2).replace('.',','):'';
   const cabecalho=[
    'Pedido_ID','Status','Data_criacao','Ultima_atualizacao',
    'ID_pagamento_PSP','Valor_produtos_BRL','Frete_cobrado_BRL',
    'Total_pedido_BRL','Distribuidores','Quantidade_itens',
    'Custo_fornecedor_estimado_no_pedido_BRL',
    'Diferenca_bruta_estimada_no_pedido_BRL',
    'Custo_unitario_informado_em_todas_linhas','Linhas_sem_custo',
    'Taxas_PSP_conciliadas','Custo_fornecedor_pago_comprovado',
    'Impostos_apurados','Lucro_liquido_apurado'
   ];
   const linhas=rows.map(p=>[
    p.pedidoId,p.status,
    new Date(p.criadoEm).toISOString(),
    new Date(p.ultimaAtualizacaoEm).toISOString(),
    p.pagamentoId||'',dinheiro(p.receitaProdutosCentavos),
    dinheiro(p.freteCobradoClienteCentavos),
    dinheiro(p.valorTotalPedidoCentavos),
    p.distribuidores.join('|'),p.quantidadeItens,
    dinheiro(p.custoFornecedorEstimadoCentavos),
    dinheiro(p.diferencaBrutaEstimadaCentavos),
    p.custoFornecedorIntegralmenteInformado===true?'SIM':'NAO',
    p.linhasSemCustoInformado??'','NAO','NAO','NAO','NAO'
   ]);
   const csv='\uFEFF'+[cabecalho,...linhas].map(row=>
    row.map(escapar).join(';')).join('\r\n')+'\r\n';
   res.set({
    'Content-Type':'text/csv; charset=utf-8',
    'Content-Disposition':'attachment; filename="akitemm-pedidos-contador.csv"'
   });
   return res.send(csv);
  }catch{return res.status(503).json({erro:'PEDIDOS_CONTABEIS_INDISPONIVEIS'});}
 });
 return router;
}
module.exports={criarRouterAdminEconomiaAkitemm};
