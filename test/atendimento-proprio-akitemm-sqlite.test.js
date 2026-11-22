'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {AtendimentoAkitemmSQLite}=
 require('../src/producao/atendimento-akitemm-sqlite');
const {AuditoriaOperacionalSQLite}=
 require('../src/producao/auditoria-operacional-sqlite');
function preparar(){
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 banco.exec([
  'CREATE TABLE loop_real_contas(id TEXT PRIMARY KEY,nick TEXT NOT NULL);',
  "INSERT INTO loop_real_contas(id,nick) VALUES('titular-1','Ana'),('titular-2','Joao');"
 ].join(' '));
 const auditoria=new AuditoriaOperacionalSQLite({
  banco,chaveAuditoria:randomBytes(32)
 });
 const atendimento=new AtendimentoAkitemmSQLite({
  banco,chaveCifra:randomBytes(32),auditoria
 });
 return {banco,atendimento,auditoria};
}
test('chamado da loja real permanece privado e criptografado, sem marketplace',()=>{
 const {banco,atendimento,auditoria}=preparar();
 try{
  const msg='Preciso saber quais cores estão disponíveis no produto';
  const aberto=atendimento.abrir({
   titularId:'titular-1',tipo:'PRODUTO',mensagem:msg
  });
  assert.equal(aberto.estado,'ABERTO');
  assert.equal(atendimento.meus({titularId:'titular-2'}).length,0);
  assert.equal(atendimento.meus({titularId:'titular-1'})[0].mensagem,msg);
  const raw=banco.prepare(
   'SELECT mensagem_ct,resposta_ct FROM loja_real_atendimentos'
  ).get();
  assert.ok(!raw.mensagem_ct.includes('Preciso'));
  assert.equal(raw.resposta_ct,null);
  assert.equal(atendimento.pendentes()[0].nick,'Ana');
  assert.equal(auditoria.verificar().total,1);
  const resposta='Olá! O atendimento da AKITEMM está verificando o seu produto.';
  const concluido=atendimento.responder({
   protocolo:aberto.protocolo,resposta
  });
  assert.equal(concluido.estado,'RESPONDIDO');
  assert.equal(atendimento.meus({titularId:'titular-1'})[0].resposta,resposta);
  assert.equal(atendimento.pendentes()[0].estado,'RESPONDIDO');
  assert.equal(auditoria.verificar().total,2);
  assert.throws(()=>atendimento.responder({
   protocolo:aberto.protocolo,resposta
  }),/ATENDIMENTO_JA_RESPONDIDO/);
  assert.equal(auditoria.verificar().total,2);
  assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{banco.close();}
});
test('rejeita campos inválidos, limita solicitações e preserva consistência',()=>{
 const {banco,atendimento}=preparar();
 try{
  assert.throws(()=>atendimento.abrir({
   titularId:'titular-1',tipo:'API',mensagem:'Quero saber mais sobre meu produto'
  }),/ATENDIMENTO_DADOS_INVALIDOS/);
  assert.throws(()=>atendimento.abrir({
   titularId:'titular-1',tipo:'OUTROS',mensagem:'curta'
  }),/ATENDIMENTO_MENSAGEM_INVALIDA/);
  for(let i=0;i<5;i++){
   atendimento.abrir({titularId:'titular-1',tipo:'PEDIDO',
    mensagem:'Quero verificar informações sobre a solicitação '+i});
  }
  assert.throws(()=>atendimento.abrir({
   titularId:'titular-1',tipo:'OUTROS',mensagem:'Preciso de mais informações sobre o produto'
  }),/ATENDIMENTO_LIMITE_ABERTOS/);
  assert.equal(atendimento.meus({titularId:'titular-2'}).length,0);
  assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM loja_real_atendimentos').get().n,5);
  assert.equal(banco.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{banco.close();}
});
