'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
test('origem de convite invalida nao cria titular orfao nem perde nick',async t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 const {app}=criarAppLojaEscritorioCandidato({
  banco,
  repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  segredoOperador:'OPERADOR_TESTE_ISOLADO_'+('S'.repeat(40)),
  termosVersao:'LAB-vinculo-atomico-http',
  termosTexto:'Cadastro ficticio para conferir vinculacao de convite e rollback, sem receita, saque ou direitos financeiros.'
 });
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));banco.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const cadastro=(indicador)=>fetch(base+'/staging/contas/cadastrar',{
  method:'POST',
  headers:{'Content-Type':'application/json',
   ...(indicador?{'x-akitemm-preview-indicador':indicador}:{})},
  body:JSON.stringify({nome:'Bruna Ficticia',nick:'Bruna',
   email:'bruna@example.invalid',senha:'SenhaFicticiaSegura2026!',
   aceiteExplicito:true})
 });
 // Gateway real so injeta o header com cookie assinado. Neste teste,
 // simular uma referencia que perdeu o dono ANTES de gravar no DB.
 const falha=await cadastro('SemDono');
 assert.equal(falha.status,409);
 assert.equal((await falha.json()).erro,'INDICACAO_ORIGEM_NAO_CONFIRMADA');
 assert.equal(banco.prepare(
  'SELECT COUNT(*) AS n FROM akitemm_conta_unica_candidata'
 ).get().n,0,'rollback impede titular sem origem prometida');
 assert.equal(banco.prepare(
  'SELECT COUNT(*) AS n FROM akitemm_convites_candidatos_lab'
 ).get().n,0);
 const correta=await cadastro(null);
 assert.equal(correta.status,201,'cliente consegue recadastrar apos falha');
 assert.equal((await correta.json()).contaCriada,true);
 assert.equal(banco.prepare(
  'SELECT COUNT(*) AS n FROM akitemm_conta_unica_candidata'
 ).get().n,1);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
