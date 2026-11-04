'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {PreAdesaoSandboxCandidatoSQLite}=
 require('../src/domain/pre-adesao-sandbox-candidato-sqlite');
const ID='hom-11111111-1111-1111-1111-111111111111';
test('sem custodia CPF ou PSP, pre-adesao falha fechada e nao cria posicoes',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 try{
  assert.throws(()=>new PreAdesaoSandboxCandidatoSQLite({
   banco:db,sinalizacao:{db:{},consultarFotografiaPrepedido:()=>null}
  }),/FONTES_STAGING_OBRIGATORIAS/);
  const reg=new PreAdesaoSandboxCandidatoSQLite({
   banco:db,sinalizacao:{db,consultarFotografiaPrepedido:()=>null}
  });
  assert.throws(()=>reg.registrar({prepedidoId:ID}),/REGISTRO_PRE_ADESAO_NAO_AUTORIZADO/);
  assert.throws(()=>reg.registrar({
   prepedidoId:ID,autorizado:true
  }),/PRE_ADESAO_INDISPONIVEL/);
  assert.throws(()=>reg.avaliar({prepedidoId:'outro'}),/PREPEDIDO_INVALIDO/);
  assert.throws(()=>reg.listarTitular('cpf:123'),/TITULAR_INVALIDO/);
  assert.equal(reg.listarTitular('titular-11111111-1111-1111-1111-111111111111').registros.length,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_pre_adesao_sandbox_candidato').get().n,0);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close();}
});
test('checkpoint de pre-adesao e proibido em produção',()=>{
 const old=process.env.NODE_ENV;
 process.env.NODE_ENV='production';
 const db=new DatabaseSync(':memory:');
 try{
  assert.throws(()=>new PreAdesaoSandboxCandidatoSQLite({banco:db}),
   /PRE_ADESAO_SANDBOX_PROIBIDA_PRODUCAO/);
 }finally{
  db.close();
  if(old===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=old;
 }
});
