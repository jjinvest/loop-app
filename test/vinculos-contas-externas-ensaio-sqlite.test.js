'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {VinculosContasExternasEnsaioSQLite:Vinculos}=
 require('../src/producao/vinculos-contas-externas-ensaio-sqlite');
const key=Buffer.alloc(32,77);
function criar(t){
 const db=new DatabaseSync(':memory:');
 t.after(()=>db.close());
 db.exec([
  'CREATE TABLE loop_lab_tesouraria_movimentos(',
  'id INTEGER PRIMARY KEY,origem TEXT,destino TEXT);',
  'CREATE TABLE loop_lab_tesouraria_extratos_bancarios(',
  'id INTEGER PRIMARY KEY,conta TEXT);',
  "INSERT INTO loop_lab_tesouraria_movimentos VALUES(1,'PSP:CELCOIN','LOOP:INTER');",
  "INSERT INTO loop_lab_tesouraria_movimentos VALUES(2,'PSP:CELCOIN','LOJA:MERCADO_PAGO');",
  "INSERT INTO loop_lab_tesouraria_extratos_bancarios VALUES(1,'LOOP:INTER');",
  "INSERT INTO loop_lab_tesouraria_extratos_bancarios VALUES(2,'LOJA:MERCADO_PAGO');"
 ].join(' '));
 return {db,controle:new Vinculos({banco:db,segredoHmac:key})};
}
const inter={vinculoId:'INTER_TESTE_01',provedor:'INTER',
 contaAlias:'LOOP:INTER',contaReferencia:'CONTAA-TESTE-001',
 documentoTitular:'12345678000195',
 documentoTitularEsperado:'12345678000195'};
test('vinculo de titular e conta fica apenas como declaracao sem CPF/CNPJ no arquivo',t=>{
 const {db,controle}=criar(t);
 const r=controle.registrarDeclaracao(inter);
 assert.equal(r.registrado,true);
 assert.equal(r.contaAutenticada,false);
 assert.equal(controle.registrarDeclaracao(inter).repetido,true);
 assert.equal(controle.verificar().vinculosDeclarados,1);
 const row=db.prepare('SELECT * FROM loop_lab_tesouraria_vinculos_contas').get();
 assert.equal(JSON.stringify(row).includes('12345678000195'),false);
 assert.equal(JSON.stringify(row).includes('CONTAA-TESTE-001'),false);
 assert.equal(row.titular_hmac.length,64);
 const rel=controle.diagnosticarExtratosDeclarados();
 assert.equal(rel.contasNecessariasPeloLivro,2);
 assert.equal(rel.contasExtratoComAlias,1);
 assert.equal(rel.contaRealAutenticada,false);
 assert.equal(rel.alertas.EXTRATO_SEM_VINCULO_DE_TITULAR,1);
});
test('titular divergente, provedor errado e replay com troca silenciosa falham fechado',t=>{
 const {controle}=criar(t);
 assert.throws(()=>controle.registrarDeclaracao({
  ...inter,documentoTitular:'00000000000000'
 }),{codigo:'VINCULO_CONTAS_ENSAIO_TITULAR_DIVERGENTE'});
 assert.throws(()=>controle.registrarDeclaracao({
  ...inter,provedor:'ASAAS'
 }),{codigo:'VINCULO_CONTAS_ENSAIO_DADOS_INVALIDOS'});
 controle.registrarDeclaracao(inter);
 assert.throws(()=>controle.registrarDeclaracao({
  ...inter,contaReferencia:'OUTRA-001'
 }),{codigo:'VINCULO_CONTAS_ENSAIO_REPLAY_DIVERGENTE'});
 assert.throws(()=>controle.registrarDeclaracao({
  ...inter,vinculoId:'INTER_TESTE_02'
 }),{codigo:'VINCULO_CONTAS_ENSAIO_ALIAS_JA_CADASTRADO'});
 assert.equal(controle.verificar().vinculosDeclarados,1);
});
test('duas contas independentes podem ser declaradas; sem autenticar bancos',t=>{
 const {controle}=criar(t);
 controle.registrarDeclaracao(inter);
 controle.registrarDeclaracao({
  vinculoId:'MP_TESTE_01',provedor:'MERCADO_PAGO',
  contaAlias:'LOJA:MERCADO_PAGO',contaReferencia:'ACCOUNT_MP_1',
  documentoTitular:'12345678000195',
  documentoTitularEsperado:'12345678000195'
 });
 const r=controle.diagnosticarExtratosDeclarados();
 assert.equal(r.contasNecessariasPeloLivro,2);
 assert.equal(r.contasExtratoComAlias,2);
 assert.equal(r.titularidadeBancariaAutenticada,false);
 assert.equal(r.conciliacaoRealCertificada,false);
});
test('corrupcao de titular ou conta e detectada mesmo sem segredo para recuperar backup',t=>{
 const {db,controle}=criar(t);
 controle.registrarDeclaracao(inter);
 assert.throws(()=>db.prepare(
  "UPDATE loop_lab_tesouraria_vinculos_contas SET provedor='ASAAS'"
 ).run(),/VINCULO_CONTA_IMUTAVEL/);
 db.exec('DROP TRIGGER loop_lab_tesouraria_vinculos_contas_no_update');
 db.prepare(
  "UPDATE loop_lab_tesouraria_vinculos_contas SET provedor='ASAAS'"
 ).run();
 const rec=Object.create(Vinculos.prototype);rec.db=db;
 assert.throws(()=>rec.verificar(),
  {codigo:'VINCULO_CONTAS_ENSAIO_HISTORICO_INCONSISTENTE'});
});
test('operador sem segredo e producao nao conseguem declarar vinculo',t=>{
 const {db}=criar(t);
 const rec=new Vinculos({banco:db});
 assert.throws(()=>rec.registrarDeclaracao(inter),
  {codigo:'VINCULO_CONTAS_ENSAIO_SEGREDO_INDISPONIVEL'});
 const old=process.env.NODE_ENV;
 try{
  process.env.NODE_ENV='production';
  assert.throws(()=>new Vinculos({banco:db,segredoHmac:key}),
   {codigo:'VINCULO_CONTAS_ENSAIO_PROIBIDO_PRODUCAO'});
 }finally{
  if(old===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=old;
 }
});
