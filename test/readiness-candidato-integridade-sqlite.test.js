'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {randomBytes,randomUUID}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
test('readiness percebe titular corrompido que quick_check sozinho não detecta',async t=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 const {app}=criarAppLojaEscritorioCandidato({
  banco:db,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  segredoOperador:'teste-health-somente-laboratorio-'+('A'.repeat(40)),
  termosVersao:'LAB-health-2026',
  termosTexto:'Aceite fictício e isolado apenas para ensaio de readiness, sem operações comerciais.'
 });
 const srv=app.listen(0,'127.0.0.1');await once(srv,'listening');
 t.after(async()=>{await new Promise(done=>srv.close(done));db.close();});
 const base='http://127.0.0.1:'+srv.address().port;
 const consulta=async p=>{
  const r=await fetch(base+p);return {status:r.status,data:await r.json()};
 };
 const live=await consulta('/healthz');
 assert.equal(live.status,200);
 const ready=await consulta('/readyz');
 assert.equal(ready.status,200);
 assert.equal(ready.data.estado,'APTO_SOMENTE_ENSAIO_LOCAL');
 assert.equal(ready.data.checkoutReal,false);
 assert.equal(ready.data.marcoZeroLiberado,false);
 db.exec('DROP TRIGGER candidato_integridade_rascunho_insert');
 db.prepare([
  'INSERT INTO akitemm_checkout_intencoes_preparacao',
  '(pedido_id,titular_id,chave_hash,itens_canonicos_json,',
  'cotacao_json,total_centavos,estado,criado_em)',
  "VALUES(?,?,?,?,?,25000,'RASCUNHO_SEM_COBRANCA',?)"
 ].join(' ')).run(
  'pre-'+randomUUID(),'titular-'+randomUUID(),
  'a'.repeat(64),'[]','{}',new Date().toISOString()
 );
 assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal((await consulta('/healthz')).status,200);
 const blocked=await consulta('/readyz');
 assert.equal(blocked.status,503);
 assert.equal(blocked.data.estado,'BANCO_LABORATORIO_INCONSISTENTE');
 assert.equal(blocked.data.laboratorioPronto,false);
 assert.equal(blocked.data.marcoZeroLiberado,false);
});
