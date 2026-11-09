'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {ConciliacaoMultibancosEnsaioSQLite:Conciliar}=
 require('../src/producao/conciliacao-multibancos-ensaio-sqlite');
function banco(t){
 const db=new DatabaseSync(':memory:');
 t.after(()=>db.close());
 db.exec([
  'CREATE TABLE loop_lab_tesouraria_movimentos(',
  'operacao_id TEXT PRIMARY KEY,origem TEXT,destino TEXT,centavos INTEGER);',
  "INSERT INTO loop_lab_tesouraria_movimentos VALUES('VENDA_1',NULL,'PSP:CELCOIN',49500);",
  "INSERT INTO loop_lab_tesouraria_movimentos VALUES('LOOP_1','PSP:CELCOIN','LOOP:INTER',25000);",
  "INSERT INTO loop_lab_tesouraria_movimentos VALUES('LOJA_1','PSP:CELCOIN','LOJA:MERCADO_PAGO',6000);",
  "INSERT INTO loop_lab_tesouraria_movimentos VALUES('ABAST_1','LOOP:INTER','TRANSITO:ABAST_1',5000);",
  "INSERT INTO loop_lab_tesouraria_movimentos VALUES('ENTRA_1','TRANSITO:ABAST_1','PAGADOR:ASAAS',5000);",
  "INSERT INTO loop_lab_tesouraria_movimentos VALUES('PIX_1','PAGADOR:ASAAS',NULL,5000);"
 ].join(' '));
 return {db,x:new Conciliar({banco:db})};
}
const evidencias=[
 ['BANK_INTER_1','INTER','LOOP:INTER','LOOP_1','CREDITO',25000],
 ['BANK_MP_1','MERCADO_PAGO','LOJA:MERCADO_PAGO','LOJA_1','CREDITO',6000],
 ['BANK_INTER_2','INTER','LOOP:INTER','ABAST_1','DEBITO',5000],
 ['BANK_ASAAS_1','ASAAS','PAGADOR:ASAAS','ENTRA_1','CREDITO',5000],
 ['BANK_ASAAS_2','ASAAS','PAGADOR:ASAAS','PIX_1','DEBITO',5000]
];
function declarar(x,linha){
 const [evidenciaId,banco,conta,movimentoId,tipo,valorCentavos]=linha;
 return x.registrarExtratoDeclarado({
  evidenciaId,banco,conta,movimentoId,tipo,valorCentavos
 });
}
test('múltiplos bancos independentes conferem as pernas do livro sem certificar dinheiro real',t=>{
 const {x}=banco(t);
 assert.equal(x.analisar().divergenciasPorCodigo.MOVIMENTO_SEM_EXTRATO,5);
 for(const e of evidencias)assert.equal(declarar(x,e).registrado,true);
 assert.equal(declarar(x,evidencias[0]).repetido,true);
 const rel=x.analisar();
 assert.equal(rel.movimentosBancariosEsperados,5);
 assert.equal(rel.movimentosComDeclaracoesConcordantes,5);
 assert.equal(rel.totalDivergencias,0);
 assert.equal(rel.todasDeclaracoesCoincidem,true);
 assert.equal(rel.extratosExternosAutenticados,false);
 assert.equal(rel.conciliacaoRealCertificada,false);
 assert.equal(rel.creditoOuSaqueRealLiberado,false);
});
test('banco trocado, valor errado, duplicidade e extrato órfão geram divergências',t=>{
 const {x}=banco(t);
 declarar(x,['BANK_FALSO_1','BANCO_2','LOOP:INTER','LOOP_1','CREDITO',24999]);
 declarar(x,['BANK_FALSO_2','INTER','LOOP:INTER','LOOP_1','CREDITO',25000]);
 declarar(x,['BANK_FALSO_3','INTER','LOOP:INTER','INEXISTENTE_1','CREDITO',25000]);
 const r=x.analisar();
 assert.equal(r.divergenciasPorCodigo.BANCO_DIVERGENTE,1);
 assert.equal(r.divergenciasPorCodigo.VALOR_BANCARIO_DIVERGENTE,1);
 assert.equal(r.divergenciasPorCodigo.LANCAMENTO_BANCARIO_DUPLICADO,1);
 assert.equal(r.divergenciasPorCodigo.EXTRATO_SEM_MOVIMENTO_COMPATIVEL,1);
 assert.equal(r.conciliacaoRealCertificada,false);
 assert.throws(()=>declarar(x,['BANK_FALSO_1','INTER','LOOP:INTER',
  'LOOP_1','CREDITO',25000]),
 {codigo:'CONCILIACAO_BANCO_ENSAIO_REPLAY_DIVERGENTE'});
});
test('reversão parcial até total congela o movimento, excesso rejeitado e revisão obrigatória',t=>{
 const {x}=banco(t);
 declarar(x,evidencias[0]);
 assert.equal(x.registrarExtratoDeclarado({
  evidenciaId:'REVERSAO_1',banco:'INTER',conta:'LOOP:INTER',
  movimentoId:'LOOP_1',tipo:'REVERSAO',valorCentavos:12000,
  reversaoDe:'BANK_INTER_1'
 }).registrado,true);
 assert.equal(x.registrarExtratoDeclarado({
  evidenciaId:'REVERSAO_2',banco:'INTER',conta:'LOOP:INTER',
  movimentoId:'LOOP_1',tipo:'REVERSAO',valorCentavos:13000,
  reversaoDe:'BANK_INTER_1'
 }).registrado,true);
 assert.throws(()=>x.registrarExtratoDeclarado({
  evidenciaId:'REVERSAO_EXCESSO',banco:'INTER',conta:'LOOP:INTER',
  movimentoId:'LOOP_1',tipo:'REVERSAO',valorCentavos:1,
  reversaoDe:'BANK_INTER_1'
 }),{codigo:'CONCILIACAO_BANCO_ENSAIO_REVERSAO_EXCESSIVA'});
 assert.equal(x.analisar().divergenciasPorCodigo.MOVIMENTO_BANCARIO_REVERTIDO,1);
 assert.equal(x.verificar().integridade,'OK');
});
test('extrato imutável, adulteração do hash, ausência de livro e produção fechada',t=>{
 const {x,db}=banco(t);
 declarar(x,evidencias[0]);
 assert.throws(()=>db.prepare(
  "UPDATE loop_lab_tesouraria_extratos_bancarios SET valor_centavos=1"
 ).run(),/EXTRATO_ENSAIO_IMUTAVEL/);
 db.exec('DROP TRIGGER loop_lab_tesouraria_extratos_bancarios_immut_u');
 db.prepare(
  "UPDATE loop_lab_tesouraria_extratos_bancarios SET valor_centavos=1"
 ).run();
 assert.throws(()=>x.verificar(),
  {codigo:'CONCILIACAO_BANCO_ENSAIO_HISTORICO_ADULTERADO'});
 const empty=new DatabaseSync(':memory:');t.after(()=>empty.close());
 assert.throws(()=>new Conciliar({banco:empty}),
  {codigo:'CONCILIACAO_BANCO_ENSAIO_REQUER_LIVRO_UNIFICADO'});
 const old=process.env.NODE_ENV;
 try{
  process.env.NODE_ENV='production';
  assert.throws(()=>new Conciliar({banco:empty}),
   {codigo:'CONCILIACAO_BANCO_ENSAIO_PROIBIDA_PRODUCAO'});
 }finally{
  if(old===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=old;
 }
});
