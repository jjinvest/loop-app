'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {ProjecaoFilasCandidatoSandbox,MAX_LEITURA}=
 require('../src/domain/projecao-filas-candidato-sandbox');
test('sem PSP configurado: leitura não inventa posição ou fila',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const antes=db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n;
  const p=new ProjecaoFilasCandidatoSandbox({banco:db,posicoes:null});
  const a=p.consultar();
  assert.equal(a.estado,'SEM_PROJECAO_PSP_SANDBOX');
  assert.equal(a.posicoesReaisCriadas,0);
  assert.equal(a.filaRealAlterada,false);
  assert.equal(a.tabuleiroRealAlterado,false);
  assert.equal(a.classificacaoHistoricaComprovada,false);
  const cliente=p.consultar({titularId:'titular_01'});
  assert.equal(cliente.estado,'SEM_PROJECAO_PSP_SANDBOX');
  assert.equal(cliente.hipoteseFilaB.length,0);
  assert.throws(()=>p.consultar({titularId:'invalid@id'}),/TITULAR_INVALIDO/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n,antes);
 }finally{db.close();}
});
test('fonte desconectada do SQLite é recusada e projeção excessiva falha fechada',()=>{
 const db=new DatabaseSync(':memory:'),outro=new DatabaseSync(':memory:');
 try{
  assert.throws(()=>new ProjecaoFilasCandidatoSandbox({
   banco:db,posicoes:{banco:outro,consultar:()=>null}
  }),/PONTE_SANDBOX_INCOMPATIVEL/);
  db.exec('CREATE TABLE akitemm_prepedido_posicoes_pendentes_sandbox_staging ('+
   'prepedido_id TEXT PRIMARY KEY, titular_id TEXT, id TEXT, criado_em TEXT)');
  const insert=db.prepare(
   'INSERT INTO akitemm_prepedido_posicoes_pendentes_sandbox_staging VALUES(?,?,?,?)'
  );
  for(let i=0;i<=MAX_LEITURA;i++)insert.run(
   'hom-'+String(i).padStart(36,'0'),'titular_01',
   'pos-'+i,'2026-11-04T00:00:00Z');
  const p=new ProjecaoFilasCandidatoSandbox({
   banco:db,posicoes:{banco:db,consultar:()=>{throw Error('NÃO DEVE CONSULTAR POSIÇÃO');}}
  });
  assert.throws(()=>p.consultar(),/MAXIMO_ANALISE_SEGURA_EXCEDIDO/);
 }finally{db.close();outro.close();}
});
test('projeção rejeita execução em produção',()=>{
 const db=new DatabaseSync(':memory:'),old=process.env.NODE_ENV;
 process.env.NODE_ENV='production';
 try{assert.throws(()=>new ProjecaoFilasCandidatoSandbox({banco:db}),/PROJECAO_FILAS_PROIBIDA_PRODUCAO/);}
 finally{db.close();if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;}
});
