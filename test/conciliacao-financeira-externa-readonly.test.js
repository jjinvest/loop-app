'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {analisarConvergenciaFinanceiraDeclarada:analisar}=
 require('../src/producao/conciliacao-financeira-externa-readonly');
function fixture(t){
 const db=new DatabaseSync(':memory:');
 t.after(()=>db.close());
 db.exec([
  'CREATE TABLE loja_real_pedidos(',
  'pedido_id TEXT PRIMARY KEY,pagamento_id TEXT,status TEXT,',
  'valor_total_centavos INTEGER,criado_em INTEGER);',
  'CREATE TABLE loja_real_custos_pedido(',
  'pedido_id TEXT,fornecedor_id TEXT,sku TEXT,',
  'custo_unit_centavos INTEGER,quantidade INTEGER);',
  'CREATE TABLE loja_real_outbox_fornecedor(',
  'pedido_id TEXT,fornecedor_id TEXT,estado TEXT);'
 ].join(' '));
 const pedido=db.prepare(
  'INSERT INTO loja_real_pedidos VALUES(?,?,?,?,?)');
 pedido.run('P1','PAY1','APROVADO_PARA_EXPEDICAO',25000,1);
 pedido.run('P2','PAY2','APROVADO_PARA_EXPEDICAO',50000,2);
 const custo=db.prepare('INSERT INTO loja_real_custos_pedido VALUES(?,?,?,?,?)');
 custo.run('P1','FORN1','SKU1',8000,1);
 custo.run('P1','FORN2','SKU2',3000,2);
 custo.run('P2','FORN1','SKU3',15000,2);
 const out=db.prepare('INSERT INTO loja_real_outbox_fornecedor VALUES(?,?,?)');
 out.run('P1','FORN1','ENVIADO');out.run('P1','FORN2','ENVIADO');
 out.run('P2','FORN1','ENVIADO');
 const extratoPsp=[
  {pedidoId:'P1',pagamentoId:'PAY1',moeda:'BRL',estado:'RECEBIDO',
   brutoCentavos:25000,tarifaCentavos:300,liquidoCentavos:24700,
   liquidacaoId:'LOTE123'},
  {pedidoId:'P2',pagamentoId:'PAY2',moeda:'BRL',estado:'RECEBIDO',
   brutoCentavos:50000,tarifaCentavos:500,liquidoCentavos:49500,
   liquidacaoId:'LOTE123'}
 ];
 const extratoBanco=[{
  liquidacaoId:'LOTE123',transacaoBancoId:'TRANS1',moeda:'BRL',
  estado:'CREDITO_CONFIRMADO',creditoCentavos:74200
 }];
 const comprovantesFornecedor=[
  {pedidoId:'P1',fornecedorId:'FORN1',transacaoFornecedorId:'TRF1',
   documentoFiscalReferencia:'NFE1',estado:'PAGO',custoPagoCentavos:8000,
   fretePagoCentavos:500},
  {pedidoId:'P1',fornecedorId:'FORN2',transacaoFornecedorId:'TRF2',
   documentoFiscalReferencia:'NFE2',estado:'PAGO',custoPagoCentavos:6000,
   fretePagoCentavos:600},
  {pedidoId:'P2',fornecedorId:'FORN1',transacaoFornecedorId:'TRF3',
   documentoFiscalReferencia:'NFE3',estado:'PAGO',custoPagoCentavos:30000,
   fretePagoCentavos:700}
 ];
 return {banco:db,extratoPsp,extratoBanco,comprovantesFornecedor};
}
test('PSP com dois pedidos no mesmo lote concilia um credito bancario sem contar duplicado',t=>{
 const x=fixture(t);
 const origem=x.banco.prepare('SELECT COUNT(*) AS n FROM loja_real_pedidos').get().n;
 const r=analisar(x);
 assert.equal(r.pedidosLidos,2);
 assert.equal(r.lotesPspDeclarados,1);
 assert.equal(r.totalDivergencias,0);
 assert.equal(r.valorBrutoPedidosAprovadosCentavos,75000);
 assert.equal(r.valorLiquidoPspDeclaradoCentavos,74200);
 assert.equal(r.custoFornecedorCongeladoCentavos,44000);
 assert.equal(r.custoMaisFreteFornecedorPagoDeclaradoCentavos,45800);
 assert.equal(r.fonteExternaAutenticada,false);
 assert.equal(r.extratoBancarioVerificadoComBanco,false);
 assert.equal(r.creditoPosicoesPermitido,false);
 assert.equal(r.saquePermitido,false);
 assert.equal(x.banco.prepare('SELECT COUNT(*) AS n FROM loja_real_pedidos').get().n,origem);
});
test('extrato bancario com transferencia divergente bloqueia conciliação',t=>{
 const x=fixture(t);
 x.extratoBanco[0].creditoCentavos=74100;
 const r=analisar(x);
 assert.equal(r.totalDivergencias,1);
 assert.equal(r.divergenciasPorCodigo.LOTE_PSP_CREDITO_BANCARIO_DIVERGENTE,1);
 assert.equal(r.concilicaoRealCertificada,false);
});
test('cobranca PSP de outro pedido e estorno nao podem ser apresentados como recebimento',t=>{
 const x=fixture(t);
 x.extratoPsp[0].pedidoId='P2';
 x.extratoPsp[1]={...x.extratoPsp[1],estado:'ESTORNADO'};
 delete x.extratoPsp[1].liquidacaoId;
 delete x.extratoPsp[1].tarifaCentavos;
 delete x.extratoPsp[1].liquidoCentavos;
 const r=analisar(x);
 assert.equal(r.divergenciasPorCodigo.PSP_TITULARIDADE_OU_VALOR_DIVERGENTE,1);
 assert.equal(r.divergenciasPorCodigo.PSP_PAGAMENTO_REVERSO_OU_NAO_LIQUIDADO,1);
 assert.equal(r.divergenciasPorCodigo.CREDITO_BANCO_SEM_LOTE_PSP,1);
});
test('fornecedor pendente, custo alterado e remessa incerta exigem revisao',t=>{
 const x=fixture(t);
 x.banco.prepare(
  "UPDATE loja_real_outbox_fornecedor SET estado='INDETERMINADO' WHERE pedido_id='P1' AND fornecedor_id='FORN2'"
 ).run();
 x.comprovantesFornecedor=x.comprovantesFornecedor.slice(0,2);
 x.comprovantesFornecedor[0].custoPagoCentavos=12000;
 const r=analisar(x);
 assert.equal(r.divergenciasPorCodigo.REMESSA_EXIGE_REVISAO_MANUAL,1);
 assert.equal(r.divergenciasPorCodigo.FORNECEDOR_SEM_COMPROVANTE_PAGO,1);
 assert.equal(r.divergenciasPorCodigo.FORNECEDOR_CUSTO_PAGO_DIVERGE_ORCAMENTO,1);
});
test('duplicidade de PSP, banco ou fornecedor em extratos externos e rejeitada',t=>{
 const x=fixture(t);
 assert.throws(()=>analisar({...x,extratoPsp:[...x.extratoPsp,x.extratoPsp[0]]}),
  {codigo:'CONCILIACAO_PSP_DUPLICADO'});
 assert.throws(()=>analisar({...x,extratoBanco:[...x.extratoBanco,x.extratoBanco[0]]}),
  {codigo:'CONCILIACAO_BANCO_DUPLICADO'});
 assert.throws(()=>analisar({...x,comprovantesFornecedor:[
  ...x.comprovantesFornecedor,x.comprovantesFornecedor[0]
 ]}),{codigo:'CONCILIACAO_FORNECEDOR_DUPLICADO'});
});
test('sem tabelas de pedidos ou dados negativos nao existe conciliação comprovada',t=>{
 const b=new DatabaseSync(':memory:');
 t.after(()=>b.close());
 assert.throws(()=>analisar({banco:b}),
  {codigo:'CONCILIACAO_BANCO_INTERNO_INCOMPLETO'});
 const x=fixture(t);
 x.extratoPsp[0].liquidoCentavos=-1;
 assert.throws(()=>analisar(x),{codigo:'CONCILIACAO_EXTRATO_PSP_INVALIDO'});
});
