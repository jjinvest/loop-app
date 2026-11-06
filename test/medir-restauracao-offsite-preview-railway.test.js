'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {assinarLista,ultimoObjeto,validateEnv,medirRestauracaoOffsite}=
 require('../scripts/medir-restauracao-offsite-preview-railway');
const env={NODE_ENV:'test',LOOP_PREVIEW_EXCLUSIVO:'SIM',
 LOOP_PREVIEW_OFFSITE_DR_TESTE:'SIM',LOOP_PREVIEW_BACKUP_OFFSITE_AUTO:'SIM',
 RAILWAY_PUBLIC_DOMAIN:'akitemm-escritorio-preview-homologacao.up.railway.app',
 LOOP_PREVIEW_SEGREDO_RAIZ:'SEGREDO_FICTICIO_NAO_USADO_FORA_DOS_TESTES_123456',
 LOOP_PREVIEW_SENHA_ACESSO:'SENHA_FICTICIA_NAO_USADA_NA_PREVIA_123456',
 LOOP_BACKUP_S3_ENDPOINT:'https://s3.sandbox.invalid',
 LOOP_BACKUP_S3_BUCKET:'bucketlab',
 LOOP_BACKUP_S3_ACCESS_KEY_ID:'FAKEID123456',
 LOOP_BACKUP_S3_SECRET_ACCESS_KEY:'SECRET_FICTICIO_NAO_REAL_PARA_TESTES_2026',
 LOOP_BACKUP_S3_REGION:'auto'};
test('URL lista S3 assina somente GET list-type e prefixo estrito',()=>{
 const url=new URL(assinarLista({config:{
  endpoint:env.LOOP_BACKUP_S3_ENDPOINT,bucket:env.LOOP_BACKUP_S3_BUCKET,
  accessKeyId:env.LOOP_BACKUP_S3_ACCESS_KEY_ID,
  secretAccessKey:env.LOOP_BACKUP_S3_SECRET_ACCESS_KEY,
  region:env.LOOP_BACKUP_S3_REGION
 },prefix:'staging/2026-11-06/',data:new Date('2026-11-06T19:00:00Z')}));
 assert.equal(url.host,'bucketlab.s3.sandbox.invalid');
 assert.equal(url.searchParams.get('list-type'),'2');
 assert.equal(url.searchParams.get('prefix'),'staging/2026-11-06/');
 assert.match(url.searchParams.get('X-Amz-Signature'),/^[0-9a-f]{64}$/);
 assert.equal(url.search.includes('SECRET_FICTICIO'),false);
 assert.equal(url.pathname,'/');
});
test('seleciona ultimo snapshot pela hora, nao UUID, sem segredos',()=>{
 const xml='<ListBucketResult><IsTruncated>false</IsTruncated>'+
  '<Contents><Key>staging/2026-11-06/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.loopbak</Key>'+
  '<LastModified>2026-11-06T18:00:00Z</LastModified></Contents>'+
  '<Contents><Key>staging/2026-11-06/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.loopbak</Key>'+
  '<LastModified>2026-11-06T19:00:00Z</LastModified></Contents></ListBucketResult>';
 const r=ultimoObjeto(xml,'staging/2026-11-06/',new Date('2026-11-06T19:05:00Z'));
 assert.match(r.key,/bbbbbbbb/);assert.equal(r.when,Date.parse('2026-11-06T19:00:00Z'));
});
test('rejeita listagem parcial, vazia e objeto forjado',()=>{
 for(const xml of ['','<ListBucketResult><IsTruncated>true</IsTruncated></ListBucketResult>',
  '<ListBucketResult><Contents><Key>outro/2026/abc.loopbak</Key>'+
   '<LastModified>2026-11-06T19:00:00Z</LastModified></Contents></ListBucketResult>'])
  assert.throws(()=>ultimoObjeto(xml,'staging/2026-11-06/'),/DR_/);
});
test('desautorizado e producao barram antes de obter credenciais',async()=>{
 for(const mudanca of [{NODE_ENV:'production'},
  {LOOP_PREVIEW_OFFSITE_DR_TESTE:'NAO'},
  {LOOP_PREVIEW_EXCLUSIVO:'NAO'},
  {RAILWAY_PUBLIC_DOMAIN:'malicioso.example'},
  {LOOP_BACKUP_S3_SECRET_ACCESS_KEY:'curta'}]){
  let chamadas=0;
  await assert.rejects(medirRestauracaoOffsite({
   env:{...env,...mudanca},fetchImpl:async()=>{chamadas++;return{};}
  }),/^(?:Error: )?(?:DR_|S3_)/);
  assert.equal(chamadas,0);
 }
});
