'use strict';
// Contrato do cadastro definitivo: a tela não pode exigir CPF/telefone e
// descartar os dados no servidor. Nada de pagamento ou KYC presumido.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {IdentidadeClienteLoopReal}=require('../src/producao/identidade-cliente-loop-sqlite');
const TEXTO='Termos e privacidade exclusivamente de teste local: cadastro de '+
 'identidade com CPF e telefone cifrados, sem pagamento, bonificação, saque '+
 'ou validação bancária. Não são documentos para o público comercial.';
function montar(db,k){
 return new IdentidadeClienteLoopReal({banco:db,
  ...k,termos:{versao:'LOOP-TERMO-CONTATO-2026',texto:TEXTO},
  privacidade:{versao:'LOOP-PRIV-CONTATO-2026',texto:TEXTO},
  enviarEmail:async()=>true});
}
test('CPF e telefone realmente persistem cifrados, sem KYC ou acesso alheio',async t=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 t.after(()=>db.close());
 const k={chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32)};
 const c=montar(db,k),d=c.documentos();
 const criar=(nick,email,cpf,telefone)=>c.cadastrar({nome:'Cliente de Teste',
  nick,email,senha:'SenhaMuitoLonga2026!',
  cpf,telefone,aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:d.termos.versao,hashTermos:d.termos.hash,
  versaoPrivacidade:d.privacidade.versao,hashPrivacidade:d.privacidade.hash});
 const a=await criar('Julia','julia@example.invalid','529.982.247-25','(21) 98888-7777');
 assert.equal(a.cadastroCpfRecebido,true);
 assert.equal(a.identidadeExternaVerificada,false);
 assert.equal(a.pagamentoReal,false);
 const real=c.dadosTitular(a.titularId);
 assert.equal(real.telefone,'21988887777');
 assert.equal(real.cpfRecebido,true);
 assert.equal(real.cpfConfirmado,false);
 assert.equal(real.cpfExibicao,'***.***.***-25');
 assert.ok(!JSON.stringify(real).includes('52998224725'));
 const linha=db.prepare('SELECT * FROM loop_real_contatos_cadastro WHERE titular_id=?')
  .get(a.titularId);
 assert.equal(typeof linha.cpf_hmac,'string');
 assert.equal(linha.cpf_hmac.length,64);
 assert.notEqual(linha.cpf_ct,'52998224725');
 assert.notEqual(linha.telefone_ct,'21988887777');
 assert.ok(!JSON.stringify(linha).includes('52998224725'));
 assert.ok(!JSON.stringify(linha).includes('21988887777'));
 await assert.rejects(criar('Outra','outra@example.invalid','52998224725','21988887777'),
  /CADASTRO_EXISTENTE/);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM loop_real_contas').get().n,1);
 await assert.rejects(criar('Dois','dois@example.invalid','00000000000','21988887777'),
  /CPF_INVALIDO/);
 await assert.rejects(criar('Tres','tres@example.invalid','11144477735','123'),
  /TELEFONE_INVALIDO/);
 const b=await criar('Mateus','mateus@example.invalid','11144477735','21988887777');
 assert.equal(c.dadosTitular(b.titularId).cpfExibicao,'***.***.***-35');
 assert.equal(c.dadosTitular(a.titularId).cpfExibicao,'***.***.***-25');
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('tabela de contato pode ser adicionada a banco existente sem perder contas',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 const k={chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32)};
 const original=montar(db,k),doc=original.documentos();
 const antigo=await original.cadastrar({nome:'Cliente Antigo',nick:'Antigo',
  email:'antigo@example.invalid',senha:'SenhaMuitoLonga2026!',
  aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:doc.termos.versao,hashTermos:doc.termos.hash,
  versaoPrivacidade:doc.privacidade.versao,hashPrivacidade:doc.privacidade.hash});
 db.exec('DROP TABLE loop_real_contatos_cadastro');
 const reaberto=montar(db,k);
 assert.equal(reaberto.dadosTitular(antigo.titularId).nick,'antigo');
 assert.equal(reaberto.dadosTitular(antigo.titularId).cpfRecebido,false);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM loop_real_contatos_cadastro').get().n,0);
 assert.equal((await reaberto.entrar({nick:'antigo',senha:'SenhaMuitoLonga2026!'}))
  .titularId,antigo.titularId);
});
