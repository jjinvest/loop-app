'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {CorrespondenciasExtratoEnsaioSQLite:Correlacoes}=
 require('../src/producao/correspondencias-extrato-ensaio-sqlite');
function preparar(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec([
  'CREATE TABLE loop_lab_tesouraria_movimentos(',
  'operacao_id TEXT UNIQUE,origem TEXT,destino TEXT,centavos INTEGER);',
  'CREATE TABLE loop_lab_tesouraria_lotes_extrato(',
  'consulta_id TEXT UNIQUE,conta_alias TEXT);',
  'CREATE TABLE loop_lab_tesouraria_itens_extrato(',
  'consulta_id TEXT,transacao_id TEXT,tipo TEXT,',
  'centavos INTEGER,classificacao TEXT,digest TEXT);',
  'CREATE TABLE loop_lab_tesouraria_vinculos_contas(',
  'conta_alias TEXT PRIMARY KEY);',
  "INSERT INTO loop_lab_tesouraria_movimentos VALUES('PIX_INNO_01','PAGADOR:ASAAS',NULL,5000);",
  "INSERT INTO loop_lab_tesouraria_movimentos VALUES('PIX_INNO_02','PAGADOR:ASAAS',NULL,5000);",
  "INSERT INTO loop_lab_tesouraria_lotes_extrato VALUES('LOTE_TESTE_01','PAGADOR:ASAAS');",
  "INSERT INTO loop_lab_tesouraria_itens_extrato VALUES('LOTE_TESTE_01','TX_PIX_10001','TRANSFER',-5000,'SOMENTE_EXTRATO_SANDBOX','"+'a'.repeat(64)+"');",
  "INSERT INTO loop_lab_tesouraria_itens_extrato VALUES('LOTE_TESTE_01','TX_PIX_10002','TRANSFER',-5000,'SOMENTE_EXTRATO_SANDBOX','"+'b'.repeat(64)+"');",
  "INSERT INTO loop_lab_tesouraria_vinculos_contas VALUES('PAGADOR:ASAAS');"
 ].join(' '));
 return {db,correl:new Correlacoes({banco:db})};
}
const p={ligacaoId:'LIGACAO_PIX_01',contaAlias:'PAGADOR:ASAAS',
 transacaoId:'TX_PIX_10001',operacaoId:'PIX_INNO_01'};
test('mesmo valor nao basta; transacao e lancamento so podem ser atribuidos uma vez',t=>{
 const {db,correl}=preparar(t);
 assert.equal(correl.registrarVinculo(p).registrado,true);
 assert.equal(correl.registrarVinculo(p).repetido,true);
 assert.throws(()=>correl.registrarVinculo({
  ...p,ligacaoId:'LIGACAO_PIX_02',operacaoId:'PIX_INNO_02'
 }),{codigo:'CORRESPONDENCIA_EXTRATO_ATRIBUICAO_DUPLA'});
 assert.throws(()=>correl.registrarVinculo({
  ...p,ligacaoId:'LIGACAO_PIX_03',transacaoId:'TX_PIX_10002'
 }),{codigo:'CORRESPONDENCIA_EXTRATO_ATRIBUICAO_DUPLA'});
 assert.equal(correl.verificar().correspondencias,1);
 assert.equal(correl.diagnosticar().liquidacoesReaisComprovadas,0);
 assert.equal(db.prepare([
  'SELECT COUNT(*) AS n FROM loop_lab_tesouraria_movimentos'
 ].join(' ')).get().n,2);
});
test('valor e sentido precisam coincidir; titularidade somente declarada',t=>{
 const {db,correl}=preparar(t);
 db.prepare([
  "UPDATE loop_lab_tesouraria_itens_extrato SET centavos=5000",
  "WHERE transacao_id='TX_PIX_10001'"
 ].join(' ')).run();
 assert.throws(()=>correl.registrarVinculo(p),
  {codigo:'CORRESPONDENCIA_EXTRATO_DIRECAO_OU_VALOR_DIVERGENTE'});
 db.prepare([
  "UPDATE loop_lab_tesouraria_itens_extrato SET centavos=-5100",
  "WHERE transacao_id='TX_PIX_10001'"
 ].join(' ')).run();
 assert.throws(()=>correl.registrarVinculo(p),
  {codigo:'CORRESPONDENCIA_EXTRATO_DIRECAO_OU_VALOR_DIVERGENTE'});
});
test('conta sem vinculo ou tipo nao reconhecido nao pode ser atribuido',t=>{
 const {db,correl}=preparar(t);
 db.exec('DELETE FROM loop_lab_tesouraria_vinculos_contas');
 assert.throws(()=>correl.registrarVinculo(p),
  {codigo:'CORRESPONDENCIA_SEM_VINCULO_CONTA'});
 db.exec("INSERT INTO loop_lab_tesouraria_vinculos_contas VALUES('PAGADOR:ASAAS')");
 db.exec("UPDATE loop_lab_tesouraria_itens_extrato SET classificacao='TIPO_NAO_CLASSIFICADO' WHERE transacao_id='TX_PIX_10001'");
 assert.throws(()=>correl.registrarVinculo(p),
  {codigo:'CORRESPONDENCIA_EXTRATO_NAO_CONFIAVEL'});
});
test('adulteracao de vinculo, extrato ou movimento e detectada em restauro',t=>{
 const {db,correl}=preparar(t);
 correl.registrarVinculo(p);
 assert.throws(()=>db.prepare([
  'UPDATE loop_lab_tesouraria_correspondencias_extrato',
  'SET centavos_assinados=100 WHERE seq=1'
 ].join(' ')).run(),/CORRESPONDENCIA_IMUTAVEL/);
 db.exec('DROP TRIGGER loop_lab_tesouraria_correspondencias_extrato_no_update');
 db.prepare([
  'UPDATE loop_lab_tesouraria_correspondencias_extrato',
  'SET centavos_assinados=100 WHERE seq=1'
 ].join(' ')).run();
 const rec=Object.create(Correlacoes.prototype);rec.db=db;
 assert.throws(()=>rec.verificar(),
  {codigo:'CORRESPONDENCIA_EXTRATO_HISTORICO_ADULTERADO'});
});
test('sem tabelas, sem CNPJ e em producao nao se cria comprovante',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 assert.throws(()=>new Correlacoes({banco:db}),
  {codigo:'CORRESPONDENCIA_EXTRATO_BASE_INCOMPLETA'});
 const old=process.env.NODE_ENV;
 try{
  process.env.NODE_ENV='production';
  assert.throws(()=>new Correlacoes({banco:db}),
   {codigo:'CORRESPONDENCIA_EXTRATO_PROIBIDA_PRODUCAO'});
 }finally{if(old===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=old;}
});
