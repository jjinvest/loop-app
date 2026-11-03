'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {ContaUnicaCandidataSQLite}=
 require('../src/domain/conta-unica-candidata-sqlite');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {once}=require('node:events');
const SENHA='SenhaCandidatoLaboratorio2026!';
function chaves(){return {chaveEmail:randomBytes(32),chaveCifra:randomBytes(32)};}
async function cadastro(c){
 return c.cadastrar({nome:'Alice Exemplo',nick:'Alice',
  email:'alice-custodia@example.invalid',senha:SENHA,aceiteExplicito:true,
  termosVersao:'LAB-custodia-2026',
  termosTexto:'Termos fictícios de laboratório, sem venda, benefício ou posição financeira real.'});
}
test('chaves divergentes impedem abrir SQLite existente antes de login ou cadastro',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 const {chaveEmail,chaveCifra}=chaves();
 const contas=new ContaUnicaCandidataSQLite({banco:db,chaveEmail,chaveCifra});
 const a=await cadastro(contas);
 assert.equal(contas.verificarCustodia(),true);
 assert.equal(contas.perfil(a.titularId).nick,'alice');
 assert.equal(new ContaUnicaCandidataSQLite({
  banco:db,chaveEmail,chaveCifra
 }).verificarCustodia(),true);
 assert.throws(()=>new ContaUnicaCandidataSQLite({
  banco:db,chaveEmail:randomBytes(32),chaveCifra
 }),/CHAVES_CONTA_INCOMPATIVEIS_COM_SQLITE/);
 assert.throws(()=>new ContaUnicaCandidataSQLite({
  banco:db,chaveEmail,chaveCifra:randomBytes(32)
 }),/CHAVES_CONTA_INCOMPATIVEIS_COM_SQLITE/);
 assert.equal(contas.perfil(a.titularId).nick,'alice');
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_candidato_custodia_chaves').get().n,1);
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 db.close();
});
test('migração de SQLite sem sentinela verifica e-mail cifrado antes de gravar prova',async()=>{
 const db=new DatabaseSync(':memory:');
 const keys=chaves();
 const original=new ContaUnicaCandidataSQLite({banco:db,...keys});
 const created=await cadastro(original);
 db.exec([
  'DROP TRIGGER candidato_custodia_no_update;',
  'DROP TRIGGER candidato_custodia_no_delete;',
  'DROP TABLE akitemm_candidato_custodia_chaves;'
 ].join(' '));
 assert.throws(()=>new ContaUnicaCandidataSQLite({
  banco:db,chaveEmail:keys.chaveEmail,chaveCifra:randomBytes(32)
 }),/CHAVES_CONTA_INCOMPATIVEIS_COM_SQLITE/);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_candidato_custodia_chaves').get().n,0);
 assert.throws(()=>new ContaUnicaCandidataSQLite({
  banco:db,chaveEmail:randomBytes(32),chaveCifra:keys.chaveCifra
 }),/CHAVES_CONTA_INCOMPATIVEIS_COM_SQLITE/);
 const migrated=new ContaUnicaCandidataSQLite({banco:db,...keys});
 assert.equal(migrated.verificarCustodia(),true);
 assert.equal(migrated.emailParaEntrega(created.titularId),'alice-custodia@example.invalid');
 db.close();
});
test('readiness falha quando sentinela foi adulterada sem expor material de chave',async t=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 const keys=chaves();
 const {app}=criarAppLojaEscritorioCandidato({
  banco:db,...keys,repositorioCatalogo:catalogoFicticioCheckout(),
  segredoOperador:'somente-laboratorio-custodia-'+('X'.repeat(48)),
  termosVersao:'LAB-custodia-2026',
  termosTexto:'Termos fictícios de laboratório, sem venda, benefício ou posição financeira real.'
 });
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(done=>server.close(done));db.close();});
 const url='http://127.0.0.1:'+server.address().port+'/readyz';
 let r=await fetch(url);
 assert.equal(r.status,200);
 assert.equal((await r.json()).marcoZeroLiberado,false);
 db.exec('DROP TRIGGER candidato_custodia_no_update');
 db.prepare('UPDATE akitemm_candidato_custodia_chaves SET cifra_prova=? WHERE id=1')
  .run('0'.repeat(64));
 r=await fetch(url);
 assert.equal(r.status,503);
 const body=await r.json();
 assert.equal(body.estado,'BANCO_LABORATORIO_INDISPONIVEL');
 assert.equal(body.checkoutReal,false);
 assert.equal(body.marcoZeroLiberado,false);
 assert.equal(JSON.stringify(body).includes(keys.chaveEmail.toString('hex')),false);
 assert.equal(JSON.stringify(body).includes(keys.chaveCifra.toString('hex')),false);
});
