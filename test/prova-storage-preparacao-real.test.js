'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {provarStoragePreparacaoReal}=
 require('../src/producao/prova-storage-preparacao-real');
const {assinarObjetoS3Real}=require('../src/producao/backup-identidade-offsite');
const {executar}=require('../scripts/provar-storage-real-preparacao');
const config={endpoint:'https://bucket.storageapi.dev',
 bucket:'identidade-real-backup',accessKeyId:'ID_TESTE_STORAGE',
 secretAccessKey:'SEGREDO_FICTICIO_USAR_APENAS_NOS_TESTES_1234',
 region:'auto'};
const id='01234567-89ab-4cde-8fab-0123456789ab';
const agora=()=>new Date('2026-11-13T22:00:00Z');
test('somente probe isolado permite DELETE; nunca backup real',()=>{
 const url=assinarObjetoS3Real({config,key:'preparacao/'+id+'.probe',
  method:'DELETE',agora:agora()});
 assert.match(url,/X-Amz-Signature=[a-f0-9]{64}/);
 for(const key of [
  'clientes/2026-11-13/'+id+'.looprealbak',
  'preparacao/../../clientes/2026-11-13/'+id+'.looprealbak'
 ])assert.throws(()=>assinarObjetoS3Real({config,key,
  method:'DELETE',agora:agora()}),{codigo:'OFFSITE_REAL_CHAVE_INVALIDA'});
});
test('prova bytes aleatorios, recusa vazamento e sempre remove probe',async()=>{
 let remoto=null;const metodos=[];
 const buscar=async(url,o)=>{
  const u=new URL(url);metodos.push(o.method);
  assert.equal(u.pathname,'/preparacao/'+id+'.probe');
  if(o.method==='PUT'){
   assert.equal(o.headers['If-None-Match'],'*');
   remoto=Buffer.from(o.body);
   assert.equal(remoto.length,48);
   return new Response(null,{status:200});
  }
  if(o.method==='GET')return new Response(remoto,{status:200});
  remoto=null;return new Response(null,{status:204});
 };
 const resposta=await provarStoragePreparacaoReal({config,buscar,agora,id:()=>id});
 assert.equal(resposta.estado,'STORAGE_REAL_PUT_GET_INTEGRIDADE_OK');
 assert.equal(resposta.limpezaComprovada,true);
 assert.equal(resposta.financeiroReal,false);
 assert.deepEqual(metodos,['PUT','GET','DELETE']);
 assert.equal(remoto,null);
});
test('GET divergente falha e ainda apaga o objeto',async()=>{
 const metodos=[];
 const buscar=async(_url,o)=>{
  metodos.push(o.method);
  if(o.method==='PUT')return new Response(null,{status:200});
  if(o.method==='GET')return new Response(Buffer.alloc(48),{status:200});
  return new Response(null,{status:204});
 };
 await assert.rejects(
  provarStoragePreparacaoReal({config,buscar,agora,id:()=>id}),
  {codigo:'PROVA_STORAGE_INTEGRIDADE_DIVERGENTE'});
 assert.deepEqual(metodos,['PUT','GET','DELETE']);
});
test('sem GO explicitamente fechado jamais contata storage',async()=>{
 await assert.rejects(executar({
  NODE_ENV:'production',LOOP_REAL_PREPARACAO_INTERNA:'SIM',
  LOOP_REAL_CADASTRO_GO:'SIM',LOOP_REAL_APROVACAO_DOCUMENTOS:'NAO',
  LOOP_REAL_DADOS_SEPARADOS:'SIM'
 }),/STORAGE_PREPARACAO_REQUER_OPERACAO_FECHADA/);
});
