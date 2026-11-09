'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {ObservacoesPSPEnsaioSQLite}=
 require('../src/producao/observacoes-psp-ensaio-sqlite');
function preparar(t){
 const db=new DatabaseSync(':memory:');
 db.exec([
  'PRAGMA foreign_keys=ON;',
  'CREATE TABLE loja_real_pedidos(',
  'pedido_id TEXT PRIMARY KEY,pagamento_id TEXT,',
  'valor_total_centavos INTEGER NOT NULL);',
  'CREATE TABLE loop_lab_tesouraria_saques(',
  'saque_id TEXT PRIMARY KEY,tentativa_id TEXT,centavos INTEGER NOT NULL);',
  'CREATE TABLE loop_lab_tesouraria_tentativas(',
  'tentativa_id TEXT PRIMARY KEY,saque_id TEXT NOT NULL,',
  'centavos INTEGER NOT NULL,estado TEXT NOT NULL);',
  "INSERT INTO loja_real_pedidos VALUES('PEDIDO_10001','PAY_ASAAS_01',25000);",
  "INSERT INTO loop_lab_tesouraria_saques VALUES('SAQUE_10001','PIX_ASAAS_01',5000);",
  "INSERT INTO loop_lab_tesouraria_tentativas VALUES('PIX_ASAAS_01','SAQUE_10001',5000,'INDETERMINADA');"
 ].join(' '));
 t.after(()=>db.close());
 return {db,caixa:new ObservacoesPSPEnsaioSQLite({banco:db})};
}
const pix=(id='PIX_ASAAS_01',estado='INDETERMINADO')=>({
 origem:'ASAAS_SANDBOX',transferenciaId:id,estado,
 valorFicticioCentavos:5000,saqueRealPago:false,
 comprovanteRealConciliado:false,podeReenviarAutomaticamente:false
});
test('PIX falhou: referencia historica continua verificavel mesmo apos limpar tentativa ativa',t=>{
 const {db,caixa}=preparar(t);
 caixa.registrarCompromisso({tipo:'PIX',referencia:'PIX_ASAAS_01',
  operacaoId:'SAQUE_10001',valorCentavos:5000});
 caixa.registrarObservacao({tipo:'PIX',referencia:'PIX_ASAAS_01',
  observacaoId:'OBS_ASAAS_01',observado:pix()});
 db.prepare([
  "UPDATE loop_lab_tesouraria_tentativas SET estado='FALHOU'",
  "WHERE tentativa_id='PIX_ASAAS_01'"
 ].join(' ')).run();
 db.prepare(
  "UPDATE loop_lab_tesouraria_saques SET tentativa_id=NULL WHERE saque_id='SAQUE_10001'"
 ).run();
 assert.equal(caixa.verificar().integridade,'OK');
 assert.equal(caixa.verificar().observacoes,1);
 assert.equal(caixa.consultarCompromisso({
  tipo:'PIX',referencia:'PIX_ASAAS_01'
 }).reenviarAutomaticamente,false);
 assert.throws(()=>caixa.registrarCompromisso({
  tipo:'PIX',referencia:'PIX_ASAAS_02',
  operacaoId:'SAQUE_10001',valorCentavos:5000
 }),{codigo:'OBSERVACOES_ENSAIO_ORIGEM_DIVERGENTE'});
});
test('inbox rejeita observacao de outra transferencia e replay contraditorio',t=>{
 const {caixa}=preparar(t);
 caixa.registrarCompromisso({tipo:'PIX',referencia:'PIX_ASAAS_01',
  operacaoId:'SAQUE_10001',valorCentavos:5000});
 assert.throws(()=>caixa.registrarObservacao({
  tipo:'PIX',referencia:'PIX_ASAAS_01',
  observacaoId:'OBS_ASAAS_01',observado:pix('PIX_ASAAS_02')
 }),{codigo:'CONFERENCIA_PSP_PIX_DIVERGENTE'});
 assert.equal(caixa.verificar().observacoes,0);
 assert.equal(caixa.registrarObservacao({
  tipo:'PIX',referencia:'PIX_ASAAS_01',
  observacaoId:'OBS_ASAAS_01',observado:pix()
 }).registrado,true);
 assert.throws(()=>caixa.registrarObservacao({
  tipo:'PIX',referencia:'PIX_ASAAS_01',
  observacaoId:'OBS_ASAAS_01',observado:pix('PIX_ASAAS_01','FALHA_NO_SANDBOX')
 }),{codigo:'OBSERVACOES_ENSAIO_OBSERVACAO_REPLAY_DIVERGENTE'});
 assert.equal(caixa.verificar().observacoes,1);
});
test('apagar protecao SQLite e adulterar observacao invalida cadeia de auditoria',t=>{
 const {db,caixa}=preparar(t);
 caixa.registrarCompromisso({tipo:'COBRANCA',referencia:'PAY_ASAAS_01',
  operacaoId:'PEDIDO_10001',valorCentavos:25000});
 caixa.registrarObservacao({
  tipo:'COBRANCA',referencia:'PAY_ASAAS_01',
  observacaoId:'OBS_PAGAMENTO_01',observado:{
   origem:'ASAAS_SANDBOX',pagamentoId:'PAY_ASAAS_01',
   valorFicticioCentavos:25000,estadoObservado:'PENDING',
   autorizaPosicao:false,autorizaPedidoReal:false
  }
 });
 assert.throws(()=>db.prepare([
  "UPDATE loop_lab_tesouraria_observacoes_psp",
  "SET estado='PSP_SANDBOX_SINALIZOU_RECEBIMENTO'",
  'WHERE id=1'
 ].join(' ')).run(),/OBSERVACAO_IMUTAVEL/);
 db.exec('DROP TRIGGER loop_lab_tesouraria_observacoes_psp_immut_u');
 db.prepare([
  "UPDATE loop_lab_tesouraria_observacoes_psp",
  "SET estado='PSP_SANDBOX_SINALIZOU_RECEBIMENTO'",
  'WHERE id=1'
 ].join(' ')).run();
 assert.throws(()=>caixa.verificar(),
  {codigo:'OBSERVACOES_ENSAIO_LIVRO_ADULTERADO'});
});
test('sem tabelas/custodia reais ou em producao nao monta observador de ensaio',t=>{
 const db=new DatabaseSync(':memory:');
 t.after(()=>db.close());
 assert.throws(()=>new ObservacoesPSPEnsaioSQLite({banco:db}),
  {codigo:'OBSERVACOES_ENSAIO_EXIGE_TESOURARIA_UNIFICADA'});
 const antigo=process.env.NODE_ENV;
 try{
  process.env.NODE_ENV='production';
  assert.throws(()=>new ObservacoesPSPEnsaioSQLite({banco:db}),
   {codigo:'OBSERVACOES_PSP_ENSAIO_PROIBIDAS_EM_PRODUCAO'});
 }finally{
  if(antigo===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=antigo;
 }
});
