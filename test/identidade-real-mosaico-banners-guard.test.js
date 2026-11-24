'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {prepararEstruturaIdentidadeReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {BannersLojaAkitemmRealSQLite}=
 require('../src/producao/banners-loja-akitemm-real-sqlite');

function preparar(db){
 return prepararEstruturaIdentidadeReal({
  banco:db,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32)
 });
}
test('quatro tabelas de mosaicos da AKITEMM real nao bloqueiam reinicio de identidade',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 const loja=new BannersLojaAkitemmRealSQLite({banco:db});
 const criado=loja.adicionar();
 assert.equal(criado.novoSlot,5);
 assert.doesNotThrow(()=>preparar(db));
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 const origem=db.prepare(
  "SELECT name FROM sqlite_master WHERE name LIKE 'akitemm_banner_mosaico_%'"
 ).all().map(x=>x.name).sort();
 assert.deepEqual(origem,[
  'akitemm_banner_mosaico_foto','akitemm_banner_mosaico_foto_extra',
  'akitemm_banner_mosaico_layout','akitemm_banner_mosaico_layout_ampliado'
 ]);
});
test('tabela desconhecida akitemm_ segue proibida mesmo com mosaicos reais',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 new BannersLojaAkitemmRealSQLite({banco:db});
 db.exec('CREATE TABLE akitemm_cartoes_lab(id INTEGER)');
 assert.throws(()=>preparar(db),{codigo:'BANCO_LABORATORIO_NAO_PODE_SER_REAL'});
});
test('tabela loop_lab_ segue bloqueada',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec('CREATE TABLE loop_lab_posicoes(id INTEGER)');
 assert.throws(()=>preparar(db),{codigo:'BANCO_LABORATORIO_NAO_PODE_SER_REAL'});
});
test('mosaicos parciais ou com esquema falso nao passam pela guarda',t=>{
 for(const modo of ['incompleto','invalido']){
  const db=new DatabaseSync(':memory:');
  try{
   db.exec('CREATE TABLE akitemm_banner_mosaico_layout(slot INTEGER,colunas INTEGER,modo TEXT)');
   if(modo==='invalido')
    db.exec('CREATE TABLE akitemm_banner_mosaico_foto(slot INTEGER)');
   assert.throws(()=>preparar(db),{
    codigo:modo==='incompleto'?'BANCO_MOSAICO_REAL_INCOMPLETO':
     'BANCO_MOSAICO_REAL_ESTRUTURA_INVALIDA'
   });
  }finally{db.close();}
 }
});
