'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {assinarObjetoS3Real,enviarBackupOffsiteIdentidade}=
 require('../src/producao/backup-identidade-offsite');
const config={endpoint:'https://bucket.storageapi.dev',
 bucket:'loop-clientes-private-2026',accessKeyId:'CHAVE_DE_TESTE_PUBLICA',
 secretAccessKey:'SegredoFicticioNaoUsarEmProducao1234567890',
 region:'auto'};
const data=new Date('2026-11-07T08:00:00Z');
const uuid='01234567-89ab-4cde-8fab-0123456789ab';
const DOC='Este documento de laboratório valida apenas a identidade cadastral '+
 'da Loja AKITEMM e do Escritório LOOP, sem pagamentos, produtos ou ganhos.';
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-offsite-real-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const arquivo=path.join(dir,'clientes.sqlite');
 const banco=new DatabaseSync(arquivo);
 banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL');
 const contas=new IdentidadeClienteLoopReal({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TERMO-2026-1',texto:DOC},
  privacidade:{versao:'LOOP-PRIVACIDADE-2026-1',texto:DOC},
  enviarEmail:async()=>true
 });
 const docs=contas.documentos();
 const titular=await contas.cadastrar({
  nome:'Ana de Ensaio',nick:'Ana',email:'ana@example.invalid',
  senha:'SenhaFicticiaSegura2026!',
  aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
  versaoPrivacidade:docs.privacidade.versao,
  hashPrivacidade:docs.privacidade.hash
 });
 const sessao=await contas.entrar({nick:'Ana',senha:'SenhaFicticiaSegura2026!'});
 t.after(()=>banco.close());
 return {arquivo,banco,sessao,titular,chaveBackup:randomBytes(32)};
}
const opts=(f,overrides={})=>({
 fonteSqlite:f.arquivo,chaveBackup:f.chaveBackup,config,
 agora:()=>data,id:()=>uuid,...overrides
});
test('SigV4 exclusivo de identidade real não compartilha caminho nem bucket do LAB',()=>{
 const key='clientes/2026-11-07/'+uuid+'.looprealbak';
 const put=assinarObjetoS3Real({config,key,method:'PUT',agora:data});
 const get=assinarObjetoS3Real({config,key,method:'GET',agora:data});
 assert.notEqual(put,get);
 assert.equal(new URL(put).hostname,'loop-clientes-private-2026.bucket.storageapi.dev');
 assert.equal(new URL(put).pathname,'/'+key);
 assert.equal(put.includes(config.secretAccessKey),false);
 assert.equal(put.includes('staging'),false);
 assert.match(new URL(put).searchParams.get('X-Amz-Signature'),/^[a-f0-9]{64}$/);
 assert.throws(()=>assinarObjetoS3Real({
  config:{...config,bucket:'loop-backup-offsite'},
  key,method:'PUT',agora:data
 }),{codigo:'OFFSITE_REAL_CONFIG_INVALIDA'});
 assert.throws(()=>assinarObjetoS3Real({
  config,key:'staging/2026-11-07/'+uuid+'.loopbak',
  method:'PUT',agora:data
 }),{codigo:'OFFSITE_REAL_CHAVE_INVALIDA'});
});
test('PUT e GET do backup real são verificados por SHA e restauração isolada',async t=>{
 const f=await fixture(t);
 let remoto=null,puts=0,gets=0;
 const buscar=async(url,args)=>{
  const parsed=new URL(url);
  assert.equal(parsed.hostname,'loop-clientes-private-2026.bucket.storageapi.dev');
  if(args.method==='PUT'){
   puts++;
   assert.equal(args.headers['If-None-Match'],'*');
   assert.equal(args.duplex,'half');
   const blocos=[];for await(const b of args.body)blocos.push(b);
   remoto=Buffer.concat(blocos);
   assert.equal(remoto.toString('utf8').includes('ana@example.invalid'),false);
   assert.equal(remoto.toString('utf8').includes('SQLite format 3'),false);
   assert.equal(Number(args.headers['Content-Length']),remoto.length);
   return new Response(null,{status:200});
  }
  gets++;assert.equal(args.method,'GET');
  return new Response(remoto,{status:200,
   headers:{'Content-Length':String(remoto.length)}});
 };
 const r=await enviarBackupOffsiteIdentidade(opts(f,{buscar}));
 assert.equal(r.estado,'OFFSITE_REAL_IDENTIDADE_CIFRADO_BAIXADO_RESTAURADO');
 assert.equal(r.copiaExternaConfirmada,true);
 assert.equal(r.restauracaoIsoladaConfirmada,true);
 assert.equal(r.contas,1);
 assert.equal(r.recuperacaoOutraRegiaoComprovada,false);
 assert.equal(r.backupFinanceiro,false);
 assert.equal(puts,1);assert.equal(gets,1);
 assert.equal(f.banco.prepare('SELECT COUNT(*) AS n FROM loop_real_sessoes').get().n,1,
  'restauração não pode alterar sessão do banco original');
 assert.equal(f.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('GET adulterado nunca é aceito como sucesso mesmo depois de PUT 200',async t=>{
 const f=await fixture(t);
 let remoto;
 const buscar=async(_url,args)=>{
  if(args.method==='PUT'){
   const blocos=[];for await(const b of args.body)blocos.push(b);
   remoto=Buffer.concat(blocos);return new Response(null,{status:200});
  }
  const adulterado=Buffer.from(remoto);
  adulterado[Math.floor(adulterado.length/2)]^=0x3f;
  return new Response(adulterado,{status:200});
 };
 await assert.rejects(enviarBackupOffsiteIdentidade(opts(f,{buscar})),
  {codigo:'OFFSITE_REAL_INTEGRIDADE_DIVERGENTE'});
 assert.equal(f.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('sem bucket dedicado nem resposta GET externa não há confirmação offsite',async t=>{
 const f=await fixture(t);
 await assert.rejects(enviarBackupOffsiteIdentidade(opts(f,{
  config:{...config,bucket:'loop-backup-offsite'},
  buscar:async()=>{throw Error('NUNCA CHAMAR');}
 })),{codigo:'OFFSITE_REAL_CONFIG_INVALIDA'});
 const buscar=async(_url,args)=>{
  if(args.method==='PUT'){
   for await(const _ of args.body){}
   return new Response(null,{status:200});
  }
  return new Response(null,{status:503});
 };
 await assert.rejects(enviarBackupOffsiteIdentidade(opts(f,{buscar})),
  {codigo:'OFFSITE_REAL_DOWNLOAD_FALHOU'});
});
