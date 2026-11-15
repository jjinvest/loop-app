'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomBytes}=require('node:crypto');
const {configurar}=require('../scripts/iniciar-identidade-cadastro-real');
const doc='Este documento define o acesso à conta digital, descreve o uso de dados '+
 'pessoais no cadastro e informa direitos e canais de atendimento. '+
 'É exclusivamente uma configuração fictícia para testes locais, sem efeito público.';
function fixture(t){
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'cadastro-real-gates-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const key=()=>randomBytes(32).toString('hex');
 const ambiente={
  NODE_ENV:'production',
  LOOP_REAL_CADASTRO_GO:'SIM',LOOP_REAL_APROVACAO_DOCUMENTOS:'SIM',
  LOOP_REAL_BACKUP_OFFSITE_AUTO:'SIM',LOOP_REAL_DADOS_SEPARADOS:'SIM',
  LOOP_REAL_SQLITE:path.join(pasta,'clientes.sqlite'),
  LOOP_REAL_CHAVE_EMAIL:key(),LOOP_REAL_CHAVE_CIFRA:key(),
  LOOP_REAL_CHAVE_CODIGO:key(),LOOP_REAL_CHAVE_BACKUP:key(),
  LOOP_REAL_TERMOS_VERSAO:'LOOP-CADASTRO-2026-01',
  LOOP_REAL_TERMOS_TEXTO:doc,
  LOOP_REAL_PRIVACIDADE_VERSAO:'LOOP-PRIVACIDADE-2026-01',
  LOOP_REAL_PRIVACIDADE_TEXTO:doc+' Os dados só serão disponibilizados ao titular.',
  LOOP_REAL_ORIGEM:'https://loop-cadastro-real.up.railway.app',
  LOOP_REAL_S3_ENDPOINT:'https://conta.r2.cloudflarestorage.com',
  LOOP_REAL_S3_BUCKET:'loop-clientes-private-2026',
  LOOP_REAL_S3_ACCESS_KEY_ID:'CHAVE_DE_TESTE',
  LOOP_REAL_S3_SECRET_ACCESS_KEY:'SEGREDO_DE_TESTE_SEM_USO_FORA_DA_CI',
  LOOP_REAL_S3_REGION:'auto',
  RESEND_API_KEY:'chave-de-teste',RESEND_FROM_EMAIL:'teste@example.invalid',
  LOOP_REAL_CATALOGO_EDITAVEL:'SIM',
  LOOP_REAL_TABULEIRO_INTERSERVICE_TOKEN:key()
 };
 return {pasta,ambiente,conf:a=>configurar(a,{pasta})};
}
test('cadastro real isolado preserva catalogo e exige backup e documentos',t=>{
 const x=fixture(t),v=x.conf(x.ambiente);
 assert.equal(v.catalogoAtivo,true);
 assert.equal(v.origemHttps,x.ambiente.LOOP_REAL_ORIGEM);
 assert.ok(Buffer.isBuffer(v.chaveBackup)&&v.chaveBackup.length===32);
 assert.equal(v.arquivo,path.join(x.pasta,'clientes.sqlite'));
 assert.ok(!('chaveAdmin' in v)&&!('chaveAuditoria' in v),
  'cadastro nao depende da credencial do administrador');
 for(const [chave,valor,erro] of [
  ['LOOP_REAL_CADASTRO_GO','NAO','CADASTRO_PUBLICO_NAO_AUTORIZADO'],
  ['LOOP_REAL_APROVACAO_DOCUMENTOS','NAO','CADASTRO_PUBLICO_NAO_AUTORIZADO'],
  ['LOOP_REAL_BACKUP_OFFSITE_AUTO','NAO','CADASTRO_PUBLICO_NAO_AUTORIZADO'],
  ['LOOP_REAL_TERMOS_TEXTO','','CADASTRO_DOCUMENTOS_DEFINITIVOS_AUSENTES'],
  ['LOOP_REAL_PRIVACIDADE_TEXTO','','CADASTRO_DOCUMENTOS_DEFINITIVOS_AUSENTES'],
  ['LOOP_REAL_ORIGEM','http://localhost','CADASTRO_ORIGEM_HTTPS_INVALIDA'],
  ['LOOP_REAL_CHAVE_BACKUP','','CADASTRO_CHAVE_AUSENTE_LOOP_REAL_CHAVE_BACKUP'],
  ['LOOP_REAL_S3_BUCKET','loop-backup-offsite','OFFSITE_REAL_CONFIG_INVALIDA']
 ]){
  assert.throws(()=>x.conf({...x.ambiente,[chave]:valor}),
   e=>e.message===erro,chave);
 }
});
test('cadastro falha fechado diante de chaves repetidas e operacao laboratorial',t=>{
 const x=fixture(t);
 assert.throws(()=>x.conf({...x.ambiente,
  LOOP_REAL_CHAVE_BACKUP:x.ambiente.LOOP_REAL_CHAVE_CIFRA}),
  /CADASTRO_CHAVES_NAO_INDEPENDENTES/);
 assert.throws(()=>x.conf({...x.ambiente,LOOP_CLIENTES_LAB:'SIM'}),
  /CADASTRO_PUBLICO_NAO_AUTORIZADO/);
 assert.throws(()=>x.conf({...x.ambiente,LOOP_MODO_SIMULACAO:'1'}),
  /CADASTRO_PUBLICO_NAO_AUTORIZADO/);
 assert.throws(()=>x.conf({...x.ambiente,LOOP_REAL_SQLITE:'/tmp/clientes.sqlite'}),
  /CADASTRO_VOLUME_DEDICADO_AUSENTE/);
 assert.throws(()=>x.conf({...x.ambiente,
  LOOP_REAL_CATALOGO_EDITAVEL:'SIM',
  LOOP_REAL_TABULEIRO_INTERSERVICE_TOKEN:''}),
  /CADASTRO_NAO_PODE_INTERROMPER_CATALOGO/);
});
