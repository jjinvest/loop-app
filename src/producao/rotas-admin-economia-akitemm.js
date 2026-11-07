'use strict';
// API privada da área PRODUTOS do administrador aprovado.
// NÃO montar nas rotas /api/contas dos clientes, nem em LAB.
// "autorizarAdministrador" e "validarCsrfAdmin" devem ser fornecidos pelo
// gateway de administração definitivo; sem os dois, a API não é criada.
const express=require('express');
function erro(c){const e=new Error(c);e.codigo=c;throw e;}
function criarRouterAdminEconomiaAkitemm({
 controle,pedidosComerciais=null,autorizarAdministrador,validarCsrfAdmin,origemHttps
}={}){
 if(!controle||typeof controle.listarOfertas!=='function'||
    typeof controle.definirCusto!=='function'||
    typeof controle.csvContador!=='function'||
    typeof autorizarAdministrador!=='function'||
    typeof validarCsrfAdmin!=='function')
  erro('ADMIN_REAL_SEM_AUTORIZACAO');
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
 router.get('/produtos-valores',(_req,res)=>{
  try{return res.json({
   ofertas:controle.listarOfertas({limite:500}),
   dadosPrivados:true,
   finalidade:'GESTAO_E_CONTABILIDADE',
   impostosCalculados:false,profitLiquidoCalculado:false
  });}catch{return res.status(503).json({erro:'ECONOMIA_INDISPONIVEL'});}
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
