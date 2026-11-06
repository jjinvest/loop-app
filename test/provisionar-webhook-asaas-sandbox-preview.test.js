'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {provisionarWebhookSandbox}=require('../scripts/provisionar-webhook-asaas-sandbox-preview');
const url='https://akitemm-escritorio-preview-homologacao.up.railway.app/webhooks/asaas-sandbox-unificado';
const eventos=[
 'PAYMENT_RECEIVED','PAYMENT_REFUNDED','PAYMENT_PARTIALLY_REFUNDED',
 'PAYMENT_REFUND_IN_PROGRESS','PAYMENT_CHARGEBACK_REQUESTED',
 'PAYMENT_CHARGEBACK_DISPUTE','PAYMENT_DELETED'
];
const env={
 NODE_ENV:'test',LOOP_PREVIEW_EXCLUSIVO:'SIM',LOOP_PREVIEW_ASAAS_HABILITADO:'SIM',
 LOOP_PREVIEW_ASAAS_WEBHOOK_PROVISIONAR:'SIM',
 LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY:'$aact_hmlg_CHAVE_FICTICIA_SEM_ACESSO',
 LOOP_PREVIEW_ASAAS_WEBHOOK_TOKEN:'TOKEN_WEBHOOK_FICTICIO_MINIMO_32_CARACTERES',
 LOOP_PREVIEW_ASAAS_WEBHOOK_EMAIL:'contato@example.invalid',
 RAILWAY_PUBLIC_DOMAIN:'akitemm-escritorio-preview-homologacao.up.railway.app'
};
test('somente Sandbox cria um webhook unico com token separado do API key',async()=>{
 let gets=0,posts=0;
 const r=await provisionarWebhookSandbox({env,fetchImpl:async(x,o)=>{
  assert.equal(x.startsWith('https://api-sandbox.asaas.com/v3/webhooks'),true);
  if(o.method==='GET'){gets++;return {ok:true,json:async()=>({data:[]})};}
  posts++;
  const b=JSON.parse(o.body);
  assert.equal(b.authToken,env.LOOP_PREVIEW_ASAAS_WEBHOOK_TOKEN);
  assert.notEqual(b.authToken,o.headers.access_token);
  assert.equal(b.url,url);assert.equal(b.sendType,'SEQUENTIALLY');
  assert.deepEqual(b.events,eventos);
  return {ok:true,json:async()=>({url,enabled:true})};
 }});
 assert.equal(gets,1);assert.equal(posts,1);
 assert.equal(r.criadoAgora,true);assert.equal(r.tokenComprovadoPorEntrega,false);
 assert.equal(JSON.stringify(r).includes(env.LOOP_PREVIEW_ASAAS_WEBHOOK_TOKEN),false);
});
test('repeticao nao cria webhook, mas apenas se existente correto',async()=>{
 let posts=0;
 const fetchImpl=async(_x,o)=>{
  if(o.method!=='GET')posts++;
  return {ok:true,json:async()=>({data:[{url,enabled:true,
   interrupted:false,events:[...eventos]}]})};
 };
 const r=await provisionarWebhookSandbox({env,fetchImpl});
 assert.equal(r.configuracaoOperacional,true);
 assert.equal(r.criadoAgora,false);assert.equal(posts,0);
});
test('existente incompleto e webhook duplicado bloqueiam POST',async()=>{
 for(const data of [
  [{url,enabled:true,interrupted:true,events:eventos}],
  [{url,enabled:true,interrupted:false,events:['PAYMENT_RECEIVED']}],
  [
   {url,enabled:true,interrupted:false,events:eventos},
   {url,enabled:true,interrupted:false,events:eventos}
  ]
 ]){
  let post=0;
  await assert.rejects(provisionarWebhookSandbox({env,fetchImpl:async(_x,o)=>{
   if(o.method==='POST')post++;
   return {ok:true,json:async()=>({data})};
  }}),/PROVISIONAR_WEBHOOK_/);
  assert.equal(post,0);
 }
});
test('falta de opt-in, dominio, email, token e producao impedem rede',async()=>{
 for(const mudanca of [
  {NODE_ENV:'production'},
  {LOOP_PREVIEW_ASAAS_WEBHOOK_PROVISIONAR:'NAO'},
  {RAILWAY_PUBLIC_DOMAIN:'fora.example.invalid'},
  {LOOP_PREVIEW_ASAAS_WEBHOOK_EMAIL:'nao-email'},
  {LOOP_PREVIEW_ASAAS_WEBHOOK_TOKEN:'invalido'},
  {LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY:'$aact_outra_chave_de_producao_1234'}
 ]){
  let chamadas=0;
  await assert.rejects(provisionarWebhookSandbox({
   env:{...env,...mudanca},fetchImpl:async()=>{chamadas++;return{};}
  }),/PROVISIONAR_WEBHOOK_/);
  assert.equal(chamadas,0);
 }
});
test('erro HTTP e resultado ambiguo nunca sao marcados sucesso',async()=>{
 await assert.rejects(provisionarWebhookSandbox({
  env,fetchImpl:async(_x,o)=>o.method==='GET'?
   {ok:true,json:async()=>({data:[]})}:{ok:false,status:401}
 }),{codigo:'PROVISIONAR_WEBHOOK_POST_HTTP_401'});
 await assert.rejects(provisionarWebhookSandbox({
  env,fetchImpl:async(_x,o)=>o.method==='GET'?
   {ok:true,json:async()=>({data:[]})}:{ok:true,json:async()=>({})}
 }),{codigo:'PROVISIONAR_WEBHOOK_POST_INCONCLUSIVO_RECONSULTAR'});
});