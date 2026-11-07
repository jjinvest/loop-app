'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {IdentidadeClienteLoopReal}=require('../src/producao/identidade-cliente-loop-sqlite');
const {configurar}=require('../scripts/iniciar-identidade-real-loop');
const terms='Documento de cadastro de laboratório técnico: informa identificação dos usuários, '+
 'direitos, acesso ao Escritório LOOP e à Loja AKITEMM. Não autoriza pagamentos ou ganhos reais.';
const TERMS={versao:'LOOP-TERMO-2026-01',texto:terms};
const PRIV={versao:'LOOP-PRIV-2026-01',texto:terms+' Os dados pessoais são usados somente para fins de cadastro.'};
function setup(t){
 const db=new DatabaseSync(':memory:');
 t.after(()=>db.close());
 const sent=[];
 const contas=new IdentidadeClienteLoopReal({
  banco:db,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),termos:TERMS,privacidade:PRIV,
  enviarEmail:async m=>{sent.push(m);return true}
 });
 const docs=contas.documentos();
 const data=(nick,email)=>({
  nome:nick+' Exemplo',nick,email,senha:'SenhaDoEnsaio2026!',
  aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
  versaoPrivacidade:docs.privacidade.versao,
  hashPrivacidade:docs.privacidade.hash
 });
 return {db,contas,sent,docs,data};
}
test('contas nao compartilham dados ou segredos com LAB',async t=>{
 const x=setup(t);
 const stale={...x.data('Ana','ana@example.invalid'),hashTermos:'f'.repeat(64)};
 await assert.rejects(x.contas.cadastrar(stale),{codigo:'DOCUMENTOS_ALTERADOS_RELER'});
 const a=await x.contas.cadastrar(x.data('Ana','ana@example.invalid'));
 const b=await x.contas.cadastrar(x.data('Bia','bia@example.invalid'));
 assert.notEqual(a.titularId,b.titularId);
 const raw=JSON.stringify(x.db.prepare('SELECT * FROM loop_real_contas').all());
 assert.ok(!raw.includes('ana@example.invalid'));
 assert.ok(!raw.includes('SenhaDoEnsaio2026!'));
 const login=await x.contas.entrar({nick:'Ana',senha:'SenhaDoEnsaio2026!'});
 assert.equal(login.titularId,a.titularId);
 assert.ok(x.contas.sessao(login.token));
 assert.equal(x.contas.sessao('0'.repeat(64)),null);
});
test('email e recuperacao limitados ao proprio titular',async t=>{
 const x=setup(t);
 await x.contas.cadastrar(x.data('Ana','ana@example.invalid'));
 await x.contas.cadastrar(x.data('Bia','bia@example.invalid'));
 const a=await x.contas.entrar({nick:'Ana',senha:'SenhaDoEnsaio2026!'});
 const b=await x.contas.entrar({nick:'Bia',senha:'SenhaDoEnsaio2026!'});
 await x.contas.solicitarCodigo({titularId:a.titularId,finalidade:'EMAIL'});
 assert.equal(x.sent.length,1);
 await assert.rejects(x.contas.confirmarCodigo({
  titularId:b.titularId,codigo:x.sent[0].codigo,finalidade:'EMAIL'
 }),{codigo:'CODIGO_INVALIDO'});
 const confirmed=await x.contas.confirmarCodigo({
  titularId:a.titularId,codigo:x.sent[0].codigo,finalidade:'EMAIL'
 });
 assert.equal(confirmed.emailVerificado,true);
 assert.equal(x.contas.sessao(b.token).emailVerificado,false);
 await x.contas.solicitarCodigo({email:'ana@example.invalid',finalidade:'SENHA'});
 const recovery=await x.contas.confirmarCodigo({
  email:'ana@example.invalid',codigo:x.sent[1].codigo,
  novaSenha:'NovaSenhaDoEnsaio2026!',finalidade:'SENHA'
 });
 assert.equal(recovery.sessoesRevogadas,true);
 assert.equal(x.contas.sessao(a.token),null);
 assert.ok(x.contas.sessao(b.token));
});
test('bootstrap do cadastro real falha fechado sem decisao GO',()=>{
 assert.throws(()=>configurar({NODE_ENV:'production'}),
  /CADASTRO_REAL_BLOQUEADO_ATE_GO_FORMAL/);
});
