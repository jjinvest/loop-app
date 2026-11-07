'use strict';
// Convergencia contábil SOMENTE LEITURA: fontes externas DECLARADAS.
// Nao comprova autenticidade de APIs, titularidade da conta bancaria ou
// liquidação; não altera pedido, outbox, livro financeiro ou motor V6.
// Preferir a conta bancária real/PSP/fiscal obtidos em conexões separadas,
// com evidência imutável. Não aceitar isso como gatilho de pagamento.
function erro(c){const e=new Error(c);e.codigo=c;throw e;}
const ID=/^[A-Za-z0-9_-]{1,120}$/;
const validarId=x=>typeof x==='string'&&ID.test(x);
const dinheiro=x=>Number.isSafeInteger(x)&&x>=0&&x<=1e12;
function validarPsp(x){
 if(!x||!validarId(x.pagamentoId)||!validarId(x.pedidoId)||
    x.moeda!=='BRL'||!dinheiro(x.brutoCentavos)||
    x.brutoCentavos===0||
    !['RECEBIDO','ESTORNADO','PENDENTE','REVERSO'].includes(x.estado))
  erro('CONCILIACAO_EXTRATO_PSP_INVALIDO');
 if(x.estado==='RECEBIDO'&&(!validarId(x.liquidacaoId)||
    !dinheiro(x.tarifaCentavos)||!dinheiro(x.liquidoCentavos)||
    x.tarifaCentavos+x.liquidoCentavos!==x.brutoCentavos))
  erro('CONCILIACAO_EXTRATO_PSP_INVALIDO');
 return x;
}
function validarBanco(x){
 if(!x||!validarId(x.liquidacaoId)||!validarId(x.transacaoBancoId)||
    x.moeda!=='BRL'||x.estado!=='CREDITO_CONFIRMADO'||
    !dinheiro(x.creditoCentavos)||x.creditoCentavos===0)
  erro('CONCILIACAO_EXTRATO_BANCO_INVALIDO');
 return x;
}
function validarFornecedor(x){
 if(!x||!validarId(x.pedidoId)||!validarId(x.fornecedorId)||
    !validarId(x.transacaoFornecedorId)||
    x.estado!=='PAGO'||
    !dinheiro(x.custoPagoCentavos)||!dinheiro(x.fretePagoCentavos)||
    !validarId(x.documentoFiscalReferencia))
  erro('CONCILIACAO_EXTRATO_FORNECEDOR_INVALIDO');
 return x;
}
function analisarConvergenciaFinanceiraDeclarada({
 banco,extratoPsp=[],extratoBanco=[],comprovantesFornecedor=[]
}={}){
 if(typeof banco?.prepare!=='function'||
    !Array.isArray(extratoPsp)||!Array.isArray(extratoBanco)||
    !Array.isArray(comprovantesFornecedor))
  erro('CONCILIACAO_FONTES_NAO_CONFIGURADAS');
 // Sem um destes três conjuntos de tabelas NÃO alegar saldo zero.
 for(const tabela of ['loja_real_pedidos','loja_real_custos_pedido',
  'loja_real_outbox_fornecedor']){
  const existe=banco.prepare(
   "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  ).get(tabela);
  if(!existe)erro('CONCILIACAO_BANCO_INTERNO_INCOMPLETO');
 }
 const amostras=[],contador=new Map();
 let totalAvisos=0;
 function avisar(c,pedidoId=''){
  totalAvisos++;
  contador.set(c,(contador.get(c)||0)+1);
  if(amostras.length<60)amostras.push({codigo:c,pedidoId});
 }
 const psp=new Map();
 for(const x of extratoPsp){
  validarPsp(x);
  if(psp.has(x.pagamentoId))erro('CONCILIACAO_PSP_DUPLICADO');
  psp.set(x.pagamentoId,x);
 }
 const bancoLotes=new Map(),transacoesBanco=new Set();
 for(const x of extratoBanco){
  validarBanco(x);
  if(transacoesBanco.has(x.transacaoBancoId))
   erro('CONCILIACAO_BANCO_DUPLICADO');
  transacoesBanco.add(x.transacaoBancoId);
  const atual=bancoLotes.get(x.liquidacaoId)||0;
  if(!Number.isSafeInteger(atual+x.creditoCentavos))
   erro('CONCILIACAO_VALOR_EXCEDE_PRECISAO');
  bancoLotes.set(x.liquidacaoId,atual+x.creditoCentavos);
 }
 const fornecedor=new Map(),transacoesFornecedor=new Set();
 for(const x of comprovantesFornecedor){
  validarFornecedor(x);
  const chave=x.pedidoId+'|'+x.fornecedorId;
  if(fornecedor.has(chave)||transacoesFornecedor.has(x.transacaoFornecedorId))
   erro('CONCILIACAO_FORNECEDOR_DUPLICADO');
  fornecedor.set(chave,x);
  transacoesFornecedor.add(x.transacaoFornecedorId);
 }
 const custos=banco.prepare([
  'SELECT fornecedor_id,COUNT(*) AS linhas,',
  'SUM(CASE WHEN custo_unit_centavos IS NULL THEN 1 ELSE 0 END) AS sem_custo,',
  'SUM(CASE WHEN custo_unit_centavos IS NOT NULL THEN',
  'custo_unit_centavos*quantidade ELSE 0 END) AS esperado',
  'FROM loja_real_custos_pedido WHERE pedido_id=?',
  'GROUP BY fornecedor_id'
 ].join(' '));
 const remessas=banco.prepare([
  'SELECT fornecedor_id,estado FROM loja_real_outbox_fornecedor',
  'WHERE pedido_id=?'
 ].join(' '));
 const esperadoBanco=new Map(),usadosPsp=new Set(),usadosFornecedor=new Set();
 let pedidos=0,aprovados=0,valorBrutoInterno=0,
  valorLiquidoPspDeclarado=0,totalPrevistoFornecedor=0,
  totalPagoFornecedorDeclarado=0;
 for(const pedido of banco.prepare([
  'SELECT pedido_id,pagamento_id,status,valor_total_centavos',
  'FROM loja_real_pedidos ORDER BY criado_em,pedido_id'
 ].join(' ')).iterate()){
  pedidos++;
  if(pedido.status!=='APROVADO_PARA_EXPEDICAO')continue;
  aprovados++;
  const id=pedido.pedido_id,pagamentoId=pedido.pagamento_id;
  if(!pagamentoId||!validarId(pagamentoId)||
     !dinheiro(pedido.valor_total_centavos)||
     pedido.valor_total_centavos===0){
   avisar('PEDIDO_APROVADO_SEM_REFERENCIA_PSP',id);
   continue;
  }
  valorBrutoInterno+=pedido.valor_total_centavos;
  if(!Number.isSafeInteger(valorBrutoInterno))
   erro('CONCILIACAO_VALOR_EXCEDE_PRECISAO');
  const p=psp.get(pagamentoId);
  if(!p){
   avisar('PSP_SEM_COMPROVANTE',id);
  }else{
   usadosPsp.add(pagamentoId);
   if(p.pedidoId!==id||p.brutoCentavos!==pedido.valor_total_centavos){
    avisar('PSP_TITULARIDADE_OU_VALOR_DIVERGENTE',id);
   }else if(p.estado!=='RECEBIDO'){
    avisar('PSP_PAGAMENTO_REVERSO_OU_NAO_LIQUIDADO',id);
   }else{
    valorLiquidoPspDeclarado+=p.liquidoCentavos;
    const n=esperadoBanco.get(p.liquidacaoId)||0;
    if(!Number.isSafeInteger(n+p.liquidoCentavos)||
       !Number.isSafeInteger(valorLiquidoPspDeclarado))
     erro('CONCILIACAO_VALOR_EXCEDE_PRECISAO');
    esperadoBanco.set(p.liquidacaoId,n+p.liquidoCentavos);
   }
  }
  const congelados=custos.all(id),outbox=remessas.all(id);
  const outboxMap=new Map();
  for(const x of outbox)outboxMap.set(x.fornecedor_id,x.estado);
  if(congelados.length===0){
   avisar('CUSTO_CONGELADO_AUSENTE',id);continue;
  }
  for(const c of congelados){
   if(!Number.isSafeInteger(c.esperado)||c.esperado<0){
    avisar('CUSTO_CONGELADO_INVALIDO',id);continue;
   }
   totalPrevistoFornecedor+=c.esperado;
   if(!Number.isSafeInteger(totalPrevistoFornecedor))
    erro('CONCILIACAO_VALOR_EXCEDE_PRECISAO');
   if(c.sem_custo>0)avisar('CUSTO_CONGELADO_INCOMPLETO',id);
   if(!outboxMap.has(c.fornecedor_id))
    avisar('REMESSA_NAO_REGISTRADA',id);
   if(outboxMap.get(c.fornecedor_id)==='INDETERMINADO')
    avisar('REMESSA_EXIGE_REVISAO_MANUAL',id);
   const chave=id+'|'+c.fornecedor_id,comprovante=fornecedor.get(chave);
   if(!comprovante){
    avisar('FORNECEDOR_SEM_COMPROVANTE_PAGO',id);
   }else{
    usadosFornecedor.add(chave);
    totalPagoFornecedorDeclarado+=
     comprovante.custoPagoCentavos+comprovante.fretePagoCentavos;
    if(!Number.isSafeInteger(totalPagoFornecedorDeclarado))
     erro('CONCILIACAO_VALOR_EXCEDE_PRECISAO');
    if(c.sem_custo===0&&c.esperado!==comprovante.custoPagoCentavos)
     avisar('FORNECEDOR_CUSTO_PAGO_DIVERGE_ORCAMENTO',id);
   }
  }
 }
 for(const [lote,valor] of esperadoBanco){
  if(!bancoLotes.has(lote))avisar('LOTE_PSP_SEM_CREDITO_BANCO');
  else if(bancoLotes.get(lote)!==valor)
   avisar('LOTE_PSP_CREDITO_BANCARIO_DIVERGENTE');
 }
 for(const lote of bancoLotes.keys()){
  if(!esperadoBanco.has(lote))avisar('CREDITO_BANCO_SEM_LOTE_PSP');
 }
 for(const pagamentoId of psp.keys()){
  if(!usadosPsp.has(pagamentoId))
   avisar('PSP_SEM_PEDIDO_APROVADO');
 }
 for(const chave of fornecedor.keys()){
  if(!usadosFornecedor.has(chave))
   avisar('COMPROVANTE_FORNECEDOR_SEM_REMESSA_APROVADA');
 }
 return {
  modo:'READ_ONLY_FONTES_DECLARADAS',pedidosLidos:pedidos,
  pedidosAprovados:aprovados,extratoPspRegistros:psp.size,
  extratoBancoRegistros:extratoBanco.length,
  comprovantesFornecedorRegistros:fornecedor.size,
  valorBrutoPedidosAprovadosCentavos:valorBrutoInterno,
  valorLiquidoPspDeclaradoCentavos:valorLiquidoPspDeclarado,
  custoFornecedorCongeladoCentavos:totalPrevistoFornecedor,
  custoMaisFreteFornecedorPagoDeclaradoCentavos:totalPagoFornecedorDeclarado,
  lotesPspDeclarados:esperadoBanco.size,
  totalDivergencias:totalAvisos,
  divergenciasPorCodigo:Object.fromEntries(contador),
  amostraDivergencias:amostras,
  amostraLimitada:totalAvisos>amostras.length,
  fonteExternaAutenticada:false,
  extratoBancarioVerificadoComBanco:false,
  notasFiscaisVerificadas:false,
  retencoesTributariasConferidas:false,
  conciliacaoRealCertificada:false,
  lucroLiquidoApurado:false,
  creditoPosicoesPermitido:false,
  saquePermitido:false,
  relatorioNaoAlteraBanco:true
 };
}
module.exports={analisarConvergenciaFinanceiraDeclarada};
