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
    x.moeda!=='BRL')
  erro('CONCILIACAO_EXTRATO_BANCO_INVALIDO');
 if(x.estado==='CREDITO_CONFIRMADO'){
  if(!dinheiro(x.creditoCentavos)||x.creditoCentavos===0||
     x.debitoCentavos!==undefined||x.transacaoOrigemId!==undefined)
   erro('CONCILIACAO_EXTRATO_BANCO_INVALIDO');
 }else if(x.estado==='DEBITO_REVERSAO'){
  if(!dinheiro(x.debitoCentavos)||x.debitoCentavos===0||
     !validarId(x.transacaoOrigemId)||
     x.transacaoOrigemId===x.transacaoBancoId||
     x.creditoCentavos!==undefined)
   erro('CONCILIACAO_EXTRATO_BANCO_INVALIDO');
 }else erro('CONCILIACAO_EXTRATO_BANCO_INVALIDO');
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
 for(const [tabela,colunas] of [
  ['loja_real_pedidos',['pedido_id','pagamento_id','status',
   'valor_total_centavos','criado_em']],
  ['loja_real_custos_pedido',['pedido_id','fornecedor_id',
   'custo_unit_centavos','quantidade']],
  ['loja_real_outbox_fornecedor',['pedido_id','fornecedor_id','estado',
   'pagamento_id','valor_pago_centavos','pedido_parceiro_id']]
 ]){
  const existe=banco.prepare(
   "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  ).get(tabela);
  if(!existe)erro('CONCILIACAO_BANCO_INTERNO_INCOMPLETO');
  const campos=new Set(banco.prepare('PRAGMA table_info('+tabela+')')
   .all().map(x=>x.name));
  if(colunas.some(c=>!campos.has(c)))
   erro('CONCILIACAO_BANCO_INTERNO_INCOMPLETO');
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
 const bancoLotes=new Map(),transacoesBanco=new Set(),creditosBanco=new Map();
 const reversoes=[];
 for(const x of extratoBanco){
  validarBanco(x);
  if(transacoesBanco.has(x.transacaoBancoId))
   erro('CONCILIACAO_BANCO_DUPLICADO');
  transacoesBanco.add(x.transacaoBancoId);
  if(x.estado==='DEBITO_REVERSAO'){reversoes.push(x);continue;}
  creditosBanco.set(x.transacaoBancoId,x);
  const atual=bancoLotes.get(x.liquidacaoId)||0;
  if(!Number.isSafeInteger(atual+x.creditoCentavos))
   erro('CONCILIACAO_VALOR_EXCEDE_PRECISAO');
  bancoLotes.set(x.liquidacaoId,atual+x.creditoCentavos);
 }
 // Reversões podem vir antes do crédito no extrato. Validar vínculo original.
 let valorDebitosReversaoDeclaradosCentavos=0;
 const reversoesPorOrigem=new Map();
 for(const r of reversoes){
  avisar('REVERSAO_BANCARIA_EXIGE_REVISAO');
  const origem=creditosBanco.get(r.transacaoOrigemId);
  if(!origem){
   avisar('REVERSAO_BANCARIA_SEM_CREDITO_ORIGINAL');
   continue;
  }
  if(origem.liquidacaoId!==r.liquidacaoId){
   avisar('REVERSAO_BANCARIA_LOTE_DIVERGENTE');
   continue;
  }
  const total=(reversoesPorOrigem.get(r.transacaoOrigemId)||0)+r.debitoCentavos;
  if(!Number.isSafeInteger(total)||
     !Number.isSafeInteger(valorDebitosReversaoDeclaradosCentavos+r.debitoCentavos))
   erro('CONCILIACAO_VALOR_EXCEDE_PRECISAO');
  reversoesPorOrigem.set(r.transacaoOrigemId,total);
  if(total>origem.creditoCentavos)
   avisar('REVERSAO_BANCARIA_SUPERA_CREDITO');
  valorDebitosReversaoDeclaradosCentavos+=r.debitoCentavos;
  const anterior=bancoLotes.get(r.liquidacaoId)||0;
  if(!Number.isSafeInteger(anterior-r.debitoCentavos))
   erro('CONCILIACAO_VALOR_EXCEDE_PRECISAO');
  bancoLotes.set(r.liquidacaoId,anterior-r.debitoCentavos);
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
 // Auditoria de remessas percorrendo TODOS os pedidos, inclusive pendentes.
 // Uma remessa enviada para pedido nao pago ou fornecedor sem custo congelado
 // e um alerta financeiro, mesmo que o total do extrato declarado seja igual.
 const pedidoDaRemessa=banco.prepare([
  'SELECT status,pagamento_id,valor_total_centavos FROM loja_real_pedidos',
  'WHERE pedido_id=?'
 ].join(' '));
 const custoDaRemessa=banco.prepare([
  'SELECT 1 AS existe FROM loja_real_custos_pedido',
  'WHERE pedido_id=? AND fornecedor_id=? LIMIT 1'
 ].join(' '));
 const remessasGlobais=banco.prepare([
  'SELECT pedido_id,fornecedor_id,pagamento_id,valor_pago_centavos,',
  'estado,pedido_parceiro_id FROM loja_real_outbox_fornecedor'
 ].join(' '));
 for(const r of remessasGlobais.iterate()){
  const p=pedidoDaRemessa.get(r.pedido_id);
  if(!p||p.status!=='APROVADO_PARA_EXPEDICAO')
   avisar('REMESSA_PEDIDO_NAO_APROVADO',r.pedido_id);
  if(p&&(!p.pagamento_id||p.pagamento_id!==r.pagamento_id||
          p.valor_total_centavos!==r.valor_pago_centavos))
   avisar('REMESSA_PSP_VALOR_INCONSISTENTE',r.pedido_id);
  if(!custoDaRemessa.get(r.pedido_id,r.fornecedor_id))
   avisar('REMESSA_FORNECEDOR_SEM_CUSTO_CONGELADO',r.pedido_id);
  if(r.estado==='ENVIADO'&&!r.pedido_parceiro_id)
   avisar('REMESSA_ENVIADA_SEM_REFERENCIA_PARCEIRO',r.pedido_id);
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
  for(const x of outbox){
   if(outboxMap.has(x.fornecedor_id))
    avisar('REMESSA_DUPLICADA_NO_BANCO',id);
   outboxMap.set(x.fornecedor_id,x.estado);
  }
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
    if(outboxMap.get(c.fornecedor_id)!=='ENVIADO')
     avisar('FORNECEDOR_PAGO_SEM_REMESSA_CONFIRMADA',id);
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
  reversoesBancariasDeclaradas:reversoes.length,
  reversoesBancariasVinculadas:reversoesPorOrigem.size,
  valorDebitosReversaoDeclaradosCentavos,
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
