'use strict';
// Prova isolada em RAM: nunca modifica contas, pedidos ou dinheiro do Railway.
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {OutboxCompraLoopSQLite}=
 require('../src/producao/outbox-compra-loop-sqlite');
const TITULAR='titular-123e4567-e89b-12d3-a456-426614174000';
const PEDIDO='PEDIDO_001',PAGAMENTO='PAGAMENTO_001';
function preparar(t){
 const db=new DatabaseSync(':memory:');
 t.after(()=>db.close());
 db.exec([
  'PRAGMA foreign_keys=ON;',
  'CREATE TABLE loop_real_contas(id TEXT PRIMARY KEY);',
  'CREATE TABLE loja_real_pedidos(',
  'pedido_id TEXT PRIMARY KEY,titular_id TEXT NOT NULL,',
  'pagamento_id TEXT,valor_total_centavos INTEGER NOT NULL,',
  'status TEXT NOT NULL);',
  'CREATE TABLE loop_real_eventos_comerciais(',
  'pedido_id TEXT PRIMARY KEY,titular_id TEXT NOT NULL,',
  'pagamento_id TEXT NOT NULL,estado TEXT NOT NULL);'
 ].join(' '));
 db.prepare('INSERT INTO loop_real_contas(id) VALUES(?)').run(TITULAR);
 const outbox=new OutboxCompraLoopSQLite({banco:db,agora:()=>1700000000000});
 const contar=()=>db.prepare('SELECT COUNT(*) AS n FROM loop_real_outbox_compra_confirmada').get().n;
 const inserir=({pedido=PEDIDO,pagamento=PAGAMENTO,status='APROVADO_PARA_EXPEDICAO'}={})=>{
  db.prepare('INSERT INTO loja_real_pedidos VALUES(?,?,?,?,?)')
   .run(pedido,TITULAR,pagamento,26500,status);
  db.prepare('INSERT INTO loop_real_eventos_comerciais VALUES(?,?,?,?)')
   .run(pedido,TITULAR,pagamento,
    status==='CANCELADO'?'CANCELADO':'AGUARDANDO_CONCILIACAO');
 };
 const emTransacao=fn=>{
  db.exec('BEGIN IMMEDIATE');
  try{const x=fn();db.exec('COMMIT');return x;}
  catch(e){db.exec('ROLLBACK');throw e;}
 };
 const cancelar=(pedido=PEDIDO)=>{
  db.prepare("UPDATE loja_real_pedidos SET status='CANCELADO' WHERE pedido_id=?")
   .run(pedido);
  db.prepare("UPDATE loop_real_eventos_comerciais SET estado='CANCELADO' WHERE pedido_id=?")
   .run(pedido);
 };
 return {db,outbox,contar,inserir,emTransacao,cancelar};
}
test('mesma compra gera apenas uma entrega pendente, sem posição ou catraca',t=>{
 const x=preparar(t);x.inserir();
 assert.throws(()=>x.outbox.registrarConfirmacaoEmTransacao({pedidoId:PEDIDO}),
  {codigo:'OUTBOX_COMPRA_TRANSACAO_OBRIGATORIA'});
 assert.equal(x.outbox.verificar().pedidosAprovadosAnterioresSemOutbox,1);
 assert.deepEqual(x.emTransacao(()=>
  x.outbox.registrarConfirmacaoEmTransacao({pedidoId:PEDIDO})),
  {repetido:false,estado:'PENDENTE'});
 assert.deepEqual(x.emTransacao(()=>
  x.outbox.registrarConfirmacaoEmTransacao({pedidoId:PEDIDO})),
  {repetido:true,estado:'PENDENTE'});
 const v=x.outbox.verificar();
 assert.equal(v.integridade,'OK');
 assert.equal(v.registros,1);assert.equal(v.pendentes,1);
 assert.equal(v.pedidosAprovadosAnterioresSemOutbox,0);
 assert.equal(v.posicoesReaisCriadas,0);assert.equal(v.financeiroReal,false);
 assert.equal(x.contar(),1);
 assert.equal(x.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'loop_real_motor_%'").get().n,0);
});
test('cancelamento comprovado para evento pendente é atômico e único',t=>{
 const x=preparar(t);x.inserir();
 x.emTransacao(()=>x.outbox.registrarConfirmacaoEmTransacao({pedidoId:PEDIDO}));
 x.emTransacao(()=>{
  x.cancelar();
  assert.equal(x.outbox.cancelarEmTransacao({pedidoId:PEDIDO}).cancelado,true);
 });
 assert.equal(x.outbox.verificar().cancelados,1);
 assert.equal(x.emTransacao(()=>x.outbox.cancelarEmTransacao({pedidoId:PEDIDO})).repetido,true);
 assert.equal(x.outbox.listarPendentes().length,0);
 assert.equal(x.contar(),1);
});
test('pedido processado e estornado fica sinalizado para revisão; não inventa compensação',t=>{
 const x=preparar(t);x.inserir();
 x.emTransacao(()=>x.outbox.registrarConfirmacaoEmTransacao({pedidoId:PEDIDO}));
 x.db.prepare("UPDATE loop_real_outbox_compra_confirmada SET estado='PROCESSADO',processado_em=?")
  .run(1700000000010);
 x.emTransacao(()=>{
  x.cancelar();
  assert.equal(x.outbox.cancelarEmTransacao({pedidoId:PEDIDO}).revisaoNecessaria,true);
 });
 const v=x.outbox.verificar();
 assert.equal(v.estornosProcessadosParaRevisar,1);
 assert.equal(v.processados,1);
 assert.equal(x.outbox.listarPendentes().length,0);
});
test('referência PSP divergente ou evento sem correspondência bloqueia auditoria',t=>{
 const x=preparar(t);x.inserir();
 x.emTransacao(()=>x.outbox.registrarConfirmacaoEmTransacao({pedidoId:PEDIDO}));
 x.db.prepare('UPDATE loop_real_outbox_compra_confirmada SET pagamento_id=? WHERE pedido_id=?')
  .run('PAGAMENTO_TROCADO',PEDIDO);
 assert.throws(()=>x.outbox.verificar(),
  {codigo:'OUTBOX_COMPRA_PEDIDO_DIVERGENTE'});
 assert.equal(x.contar(),1);
});
test('sem PSP e com pedido apenas aguardando, não há registro de compra confirmada',t=>{
 const x=preparar(t);
 x.db.prepare('INSERT INTO loja_real_pedidos VALUES(?,?,?,?,?)')
  .run(PEDIDO,TITULAR,null,26500,'AGUARDANDO_PAGAMENTO');
 assert.equal(x.outbox.verificar().registros,0);
 assert.equal(x.outbox.verificar().pedidosAprovadosAnterioresSemOutbox,0);
});
