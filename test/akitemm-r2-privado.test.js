'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {configuracaoR2,criarR2Privado}=require('../src/domain/akitemm-r2-privado');

const config={
 accountId:'a'.repeat(32),accessKeyId:'EXAMPLEACCESSKEY123456',
 secretAccessKey:'example-only-secret-not-for-production-abcdefghi',
 bucket:'akitemm-avaliacoes-privado'
};
function env(c=config){return {
 AKITEMM_R2_ACCOUNT_ID:c.accountId,
 AKITEMM_R2_ACCESS_KEY_ID:c.accessKeyId,
 AKITEMM_R2_SECRET_ACCESS_KEY:c.secretAccessKey,
 AKITEMM_R2_BUCKET:c.bucket
};}
test('R2 só é ativado com configuração completa e credenciais ficam exclusivas do servidor',()=>{
 assert.equal(configuracaoR2({}),null);
 assert.deepEqual(configuracaoR2(env()),config);
 assert.throws(()=>configuracaoR2({AKITEMM_R2_BUCKET:'abc'}),/CONFIG_INCOMPLETA/);
 assert.throws(()=>configuracaoR2(env({...config,accountId:'localhost'})),/CONFIG_INVALIDA/);
 assert.throws(()=>configuracaoR2(env({...config,bucket:'http://inseguro'})),/CONFIG_INVALIDA/);
});
test('R2: operação privada AWS v4 PUT/GET/DELETE, dados só no servidor e chaves aleatórias',async()=>{
 const requisicoes=[];
 const arquivo=Buffer.from('somente-para-teste-de-integracao');
 const versao=new Date('2026-10-21T14:00:00.000Z');
 const fakeFetch=async(url,opt)=>{
  requisicoes.push({url,opt});
  assert.match(url,/^https:\/\/a{32}\.r2\.cloudflarestorage\.com\/akitemm-avaliacoes-privado\//);
  assert.ok(!url.includes(config.secretAccessKey));
  assert.equal(opt.redirect,'error');
  assert.match(opt.headers.Authorization,/^AWS4-HMAC-SHA256 Credential=EXAMPLEACCESSKEY123456\/20261021\/auto\/s3\/aws4_request, SignedHeaders=/);
  assert.equal(opt.headers['x-amz-date'],'20261021T140000Z');
  assert.match(opt.headers['x-amz-content-sha256'],/^[a-f0-9]{64}$/);
  return {
   ok:true,headers:new Headers({'content-length':String(arquivo.length)}),
   arrayBuffer:async()=>Uint8Array.from(arquivo).buffer
  };
 };
 const r2=criarR2Privado({config,fetchFn:fakeFetch,agora:()=>versao});
 const chave=r2.novaChave('FOTO');
 assert.match(chave,/^akitemm\/avaliacoes\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.bin$/);
 await r2.enviar(chave,arquivo,'image/png');
 assert.deepEqual(requisicoes[0].opt.body,arquivo);
 assert.equal(requisicoes[0].opt.headers['content-type'],'image/png');
 assert.deepEqual(await r2.obter(chave),arquivo);
 await r2.apagar(chave);
 assert.deepEqual(requisicoes.map(r=>r.opt.method),['PUT','GET','DELETE']);
 assert.throws(()=>r2.novaChave('HTML'),/TIPO_R2_INVALIDO/);
 await assert.rejects(()=>r2.enviar('um/arquivo/fora/do-prefixo',arquivo,'image/png'),/CHAVE_R2_INVALIDA/);
 assert.equal(requisicoes.length,3);
});
test('Falha do R2 é controlada, sem vazar chaves de acesso em erro',async()=>{
 const r2=criarR2Privado({config,fetchFn:async()=>{throw new Error('secret-local');}});
 const chave=r2.novaChave('VIDEO');
 await assert.rejects(()=>r2.enviar(chave,Buffer.from('teste'),'video/mp4'),
  e=>e.message==='AKITEMM_R2_INDISPONIVEL');
 const servidor=criarR2Privado({config,fetchFn:async()=>({ok:false,status:403})});
 await assert.rejects(()=>servidor.obter(chave),/AKITEMM_R2_INDISPONIVEL/);
});
