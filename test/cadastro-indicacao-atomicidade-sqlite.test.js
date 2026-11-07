'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {ContaUnicaCandidataSQLite}=require('../src/domain/conta-unica-candidata-sqlite');
const {EquipeCandidataSQLite}=require('../src/domain/equipe-candidata-sqlite');

test('cadastro + indicacao: falha de vinculo desfaz ambos e permite tentar novamente',async t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 t.after(()=>banco.close());
 const contas=new ContaUnicaCandidataSQLite({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32)
 });
 const equipe=new EquipeCandidataSQLite({banco});
 const dados=(nick,email)=>({
  nome:nick+' Laboratorio',nick,email,
  senha:'SenhaFicticiaCliente2026!',aceiteExplicito:true,
  termosVersao:'LAB-cadastro-atomico-novembro',
  termosTexto:'Cadastro e indicacao inteiramente ficticios para verificar transacoes de laboratorio; nao cria valores comerciais.'
 });
 const indicador=await contas.cadastrar(dados('Ana','ana@example.invalid'));
 assert.ok(indicador.titularId);
 const cadastrarIndicado=onCriada=>contas.cadastrar({
  ...dados('Bia','bia@example.invalid'),onCriada
 });
 await assert.rejects(
  cadastrarIndicado(({titularId})=>{
   assert.equal(equipe.registrarCadastro({
    indicadoId:titularId,indicadorNick:'Ana'
   }).registrado,true);
   throw Error('FALHA_DE_VINCULO_SIMULADA');
  }),/FALHA_DE_VINCULO_SIMULADA/
 );
 assert.equal(banco.prepare([
  'SELECT COUNT(*) AS n FROM akitemm_conta_unica_candidata'
 ].join(' ')).get().n,1,'conta nao pode permanecer se vinculo falha');
 assert.equal(banco.prepare([
  'SELECT COUNT(*) AS n FROM akitemm_convites_candidatos_lab'
 ].join(' ')).get().n,0,'indicacao nao pode permanecer apos rollback');
 const indicado=await cadastrarIndicado(({titularId})=>{
  const vinculo=equipe.registrarCadastro({
   indicadoId:titularId,indicadorNick:'Ana'
  });
  assert.equal(vinculo.registrado,true);
 });
 const equipeAna=equipe.listar({titularId:indicador.titularId});
 assert.equal(equipeAna.total,1);
 assert.equal(equipeAna.cadastros[0].indicadoId,indicado.titularId);
 assert.equal(equipeAna.cadastros[0].nick,'bia');
 assert.equal(banco.prepare(
  'SELECT COUNT(*) AS n FROM akitemm_conta_unica_candidata'
 ).get().n,2);
 assert.equal((await contas.entrar({
  nick:'Bia',senha:'SenhaFicticiaCliente2026!'
 })).titularId,indicado.titularId);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
