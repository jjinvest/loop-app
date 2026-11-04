'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {IntencoesCheckoutSQLite}=require('../src/domain/intencoes-checkout-sqlite');
const {PrePedidosCheckoutStagingSQLite}=require('../src/domain/prepedidos-checkout-staging-sqlite');
const {PontePrepedidoAsaasSandboxStaging}=
 require('../src/domain/ponte-prepedido-asaas-sandbox-staging');
const {envio}=require('../scripts/validar-backup-offsite-checkout-staging');
const URL='https://bucket.s3.example.com/backups/homologacao-001.loopbak';
const senha='senha-inteiramente-ficticia-para-backup-isolado-2026-11';
function preparar(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'offsite-ensaio-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'loja.sqlite');
 const db=new DatabaseSync(file);
 db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL');
 new IntencoesCheckoutSQLite({banco:db});
 new PrePedidosCheckoutStagingSQLite({banco:db});
 new PontePrepedidoAsaasSandboxStaging({banco:db});
 db.prepare("INSERT INTO akitemm_checkout_intencoes_preparacao"+
  " (pedido_id,titular_id,chave_hash,itens_canonicos_json,cotacao_json,total_centavos,estado,criado_em)"+
  " VALUES(?,?,?,?,?,?,'RASCUNHO_SEM_COBRANCA',?)").run(
   'pre-11111111-1111-4111-8111-111111111111',
   'titular-22222222-2222-4222-8222-222222222222',
   'f'.repeat(64),'[{"produtoId":"curso","quantidade":1}]',
   JSON.stringify({itens:[{produtoId:'curso',quantidade:1}],
    totalCentavos:25000}),25000,new Date().toISOString());
 db.close();
 return {file,dir};
}
function params(file,fetchImpl){
 return {fonteSqlite:file,senha,autorizado:true,host:'bucket.s3.example.com',
  uploadUrl:URL+'?method=put&signature=ficticia',
  downloadUrl:URL+'?method=get&signature=ficticia',
  fetchImpl};
}
test('HTTPS PUT assinado + GET de objeto cifrado + restauração separada com hash',async t=>{
 const {file}=preparar(t);
 let uploaded=null,puts=0,gets=0;
 const fake=async(_u,req)=>{
  if(req.method==='PUT'){
   puts++;const parts=[];
   for await(const chunk of req.body)parts.push(chunk);
   uploaded=Buffer.concat(parts);
   assert.equal(uploaded.length,Number(req.headers['Content-Length']));
   assert.equal(req.headers['If-None-Match'],'*','recusar sobrescrita da mesma chave');
   assert.equal(uploaded.subarray(0,8).toString(),'LOOPBKP1');
   assert.equal(uploaded.includes(Buffer.from('curso')),false);
   return new Response(null,{status:200});
  }
  gets++;
  return new Response(uploaded,{status:200});
 };
 const before=fs.statSync(file).size;
 const result=await envio(params(file,fake));
 assert.equal(result.estado,'COPIA_CRIPTOGRAFADA_ENVIADA_LIDA_E_RESTAURADA');
 assert.equal(result.copiaOffsiteVerificada,true);
 assert.equal(result.restauracaoIsoladaValidada,true);
 assert.equal(result.recuperacaoRegionalIndependente,false);
 assert.equal(result.bancoOriginalNaoModificado,true);
 assert.equal(result.pagamentosReais,0);
 assert.equal(result.bytesRecebidos,uploaded.length);
 assert.equal(puts,1);assert.equal(gets,1);
 assert.equal(fs.statSync(file).size,before);
});
test('offsite adulterado ou URL fora do host nao e aceito',async t=>{
 const {file}=preparar(t);
 let uploaded=null;
 const fake=async(_u,req)=>{
  if(req.method==='PUT'){
   const parts=[];for await(const chunk of req.body)parts.push(chunk);
   uploaded=Buffer.concat(parts);return new Response(null,{status:200});
  }
  const forged=Buffer.from(uploaded);
  forged[forged.length-30]^=1;
  return new Response(forged,{status:200});
 };
 await assert.rejects(()=>envio(params(file,fake)),
  /BACKUP_OFFSITE_INTEGRO_NAO_COMPROVADO/);
 await assert.rejects(()=>envio({...params(file,fake),
  uploadUrl:'https://127.0.0.1/backup?signature=x'}),/DESTINO_OFFSITE_INVALIDO/);
 await assert.rejects(()=>envio({...params(file,fake),
  downloadUrl:'http://bucket.s3.example.com/backups/homologacao-001.loopbak'}),
  /DESTINO_OFFSITE_INVALIDO/);
 await assert.rejects(()=>envio({...params(file,fake),autorizado:false}),
  /OFFSITE_STAGING_NAO_AUTORIZADO/);
});
test('objeto ja presente (412) ou escrita concorrente (409) bloqueiam PUT sem GET nem repeticao',async t=>{
 const {file}=preparar(t);
 for(const [status,codigo] of [[412,'BACKUP_OFFSITE_OBJETO_JA_EXISTE'],
  [409,'BACKUP_OFFSITE_CONCORRENCIA']]){
  let puts=0,gets=0;
  const fake=async(_u,req)=>{
   if(req.method==='PUT'){
    puts++;
    assert.equal(req.headers['If-None-Match'],'*');
    return new Response(null,{status});
   }
   gets++;throw Error('GET NAO AUTORIZADO APOS FALHA');
  };
  await assert.rejects(envio(params(file,fake)),{codigo});
  assert.equal(puts,1,'nao repetir upload de resultado conflitante');
  assert.equal(gets,0,'nao restaurar objeto antigo como se fosse backup novo');
 }
});
