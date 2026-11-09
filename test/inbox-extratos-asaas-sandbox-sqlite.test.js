'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {coletarExtratoReadOnly}=
 require('../src/producao/contrato-extratos-readonly');
const {InboxExtratosAsaasSandboxSQLite:Inbox,
 consultarEArquivarExtratoAsaasSandbox}=
 require('../src/producao/inbox-extratos-asaas-sandbox-sqlite');
const dados={inicio:'2026-11-01',fim:'2026-11-09'};
const collect=items=>coletarExtratoReadOnly({
 origem:'ASAAS_SANDBOX',...dados,
 consultarPagina:async()=>({
  hasMore:false,totalCount:items.length,data:items
 })
});
function fixture(t){
 const db=new DatabaseSync(':memory:');
 db.exec([
  'PRAGMA foreign_keys=ON;',
  'CREATE TABLE loop_lab_tesouraria_movimentos(',
  'id INTEGER PRIMARY KEY,operacao_id TEXT UNIQUE);'
 ].join(' '));
 t.after(()=>db.close());
 return {db,inbox:new Inbox({banco:db})};
}
test('extrato paginado de asaas entra como rastro imutavel, nunca saldo real',async t=>{
 const {inbox,db}=fixture(t);
 const items=[{id:'TX_10001',type:'TRANSFER',value:-25.50},
  {id:'TX_10002',type:'NOVO_TIPO_2026',value:1}];
 const relatorio=await collect(items);
 const r=inbox.registrarLote({
  consultaId:'LOTE_ASAAS_01',contaAlias:'PAGADOR:ASAAS',relatorio
 });
 assert.equal(r.registrado,true);
 assert.equal(r.liquidacaoRealComprovada,false);
 assert.equal(r.dinheiroRealMovimentado,false);
 assert.equal(inbox.verificar().registros,2);
 assert.equal(inbox.verificar().registrosEmQuarentena,1);
 assert.equal(inbox.registrarLote({
  consultaId:'LOTE_ASAAS_01',contaAlias:'PAGADOR:ASAAS',relatorio
 }).repetido,true);
 assert.equal(db.prepare(
  'SELECT COUNT(*) AS n FROM loop_lab_tesouraria_movimentos'
 ).get().n,0);
 assert.equal(db.prepare(
  'SELECT centavos FROM loop_lab_tesouraria_itens_extrato WHERE transacao_id=?'
 ).get('TX_10001').centavos,-2550);
});
test('consulta externa e arquivo acontecem juntos, sem aceitar pagina incompleta',async t=>{
 const {inbox}=fixture(t);
 const adaptador={consultarExtratoPaginado:async args=>
  collect([{id:'TX_50001',type:'PAYMENT_RECEIVED',value:30}])};
 const r=await consultarEArquivarExtratoAsaasSandbox({
  adaptador,inbox,consultaId:'LOTE_ASAAS_500',
  contaAlias:'PSP:ASAAS',...dados
 });
 assert.equal(r.registrado,true);
 assert.equal(inbox.verificar().lotes,1);
 await assert.rejects(consultarEArquivarExtratoAsaasSandbox({
  adaptador:{consultarExtratoPaginado:async()=>{throw Error('timeout');}},
  inbox,consultaId:'LOTE_ASAAS_501',
  contaAlias:'PSP:ASAAS',...dados
 }),/timeout/);
 assert.equal(inbox.verificar().lotes,1);
});
test('reprocessamento sobreposto igual e aceito; divergente bloqueia atomico',async t=>{
 const {inbox}=fixture(t);
 const a=await collect([{id:'TX_30001',type:'PAYMENT_FEE',value:-3}]);
 const b=await collect([{id:'TX_30001',type:'PAYMENT_FEE',value:-4}]);
 inbox.registrarLote({
  consultaId:'LOTE_ASAAS_301',contaAlias:'PAGADOR:ASAAS',relatorio:a
 });
 assert.equal(inbox.registrarLote({
  consultaId:'LOTE_ASAAS_302',contaAlias:'PAGADOR:ASAAS',relatorio:a
 }).registrado,true);
 assert.throws(()=>inbox.registrarLote({
  consultaId:'LOTE_ASAAS_303',contaAlias:'PAGADOR:ASAAS',relatorio:b
 }),{codigo:'INBOX_EXTRATO_ENSAIO_MOVIMENTO_CONTRADITORIO'});
 assert.equal(inbox.verificar().lotes,2);
 assert.throws(()=>inbox.registrarLote({
  consultaId:'LOTE_ASAAS_301',contaAlias:'PSP:ASAAS',relatorio:a
 }),{codigo:'INBOX_EXTRATO_ENSAIO_REPLAY_DIVERGENTE'});
});
test('alteracao SQL em itens do extrato exige revisao, nao altera livros financeiros',async t=>{
 const {db,inbox}=fixture(t);
 const relatorio=await collect([
  {id:'TX_40001',type:'TRANSFER',value:-50}
 ]);
 inbox.registrarLote({
  consultaId:'LOTE_ASAAS_401',contaAlias:'PAGADOR:ASAAS',relatorio
 });
 assert.throws(()=>db.prepare([
  'UPDATE loop_lab_tesouraria_itens_extrato',
  'SET centavos=1 WHERE transacao_id=?'
 ].join(' ')).run('TX_40001'),/INBOX_EXTRATO_IMUTAVEL/);
 db.exec('DROP TRIGGER loop_lab_tesouraria_itens_extrato_sem_update');
 db.prepare([
  'UPDATE loop_lab_tesouraria_itens_extrato',
  'SET centavos=1 WHERE transacao_id=?'
 ].join(' ')).run('TX_40001');
 assert.throws(()=>inbox.verificar(),
  {codigo:'INBOX_EXTRATO_ENSAIO_HISTORICO_ADULTERADO'});
});
test('relatorio incompleto, outro provedor e producao nunca montam saldo bancario',async t=>{
 const {inbox,db}=fixture(t);
 const relatorio=await collect([
  {id:'TX_60001',type:'TRANSFER',value:-50}
 ]);
 assert.throws(()=>inbox.registrarLote({
  consultaId:'LOTE_ASAAS_601',contaAlias:'LOOP:INTER',relatorio
 }),{codigo:'INBOX_EXTRATO_ENSAIO_LOTE_INVALIDO'});
 assert.throws(()=>inbox.registrarLote({
  consultaId:'LOTE_ASAAS_602',contaAlias:'PAGADOR:ASAAS',
  relatorio:{...relatorio,paginasCompletas:false}
 }),{codigo:'INBOX_EXTRATO_ENSAIO_LOTE_INVALIDO'});
 const atual=process.env.NODE_ENV;
 try{
  process.env.NODE_ENV='production';
  assert.throws(()=>new Inbox({banco:db}),
   {codigo:'INBOX_EXTRATO_ENSAIO_PROIBIDO_PRODUCAO'});
 }finally{
  if(atual===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=atual;
 }
});
