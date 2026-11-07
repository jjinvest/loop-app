'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {IdentidadeClienteLoopReal}=require('../src/producao/identidade-cliente-loop-sqlite');
const TEXTO='Termos e aviso de privacidade do ambiente controlado de teste de identidade '+
 'para acesso unificado da loja AKITEMM e do Escritório LOOP sem transações reais.';
test('SQLite da identidade separado conserva cadastro e consentimento apos reinicio',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'contas-real-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const arquivo=path.join(dir,'clientes.sqlite');
 const cfg={chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),termos:{versao:'LOOP-TERMO-2026',texto:TEXTO},
  privacidade:{versao:'LOOP-PRIVACIDADE-2026',texto:TEXTO},
  enviarEmail:async()=>true};
 let db=new DatabaseSync(arquivo);
 db.exec('PRAGMA foreign_keys=ON');
 let conta=new IdentidadeClienteLoopReal({...cfg,banco:db});
 const docs=conta.documentos();
 const dados={nome:'Ana Exemplo',nick:'Ana',email:'ana@example.invalid',
  senha:'SenhaDeEnsaio2026!',aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
  versaoPrivacidade:docs.privacidade.versao,
  hashPrivacidade:docs.privacidade.hash};
 const antes=await conta.cadastrar(dados);
 db.close();
 db=new DatabaseSync(arquivo);
 db.exec('PRAGMA foreign_keys=ON');
 conta=new IdentidadeClienteLoopReal({...cfg,banco:db});
 const sessao=await conta.entrar({nick:'Ana',senha:dados.senha});
 assert.equal(sessao.titularId,antes.titularId);
 assert.equal(conta.dadosTitular(sessao.titularId).email,'ana@example.invalid');
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 db.close();
});
