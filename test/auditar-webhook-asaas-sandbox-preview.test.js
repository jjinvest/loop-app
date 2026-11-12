'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {auditarWebhooksSandbox}=require('../scripts/auditar-webhook-asaas-sandbox-preview');
const base='https://akitemm-escritorio-preview-homologacao.up.railway.app/webhooks/asaas-sandbox-unificado';
const env={
 NODE_ENV:'test',LOOP_PREVIEW_EXCLUSIVO:'SIM',LOOP_PREVIEW_ASAAS_HABILITADO:'SIM',
 LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY:'$aact_hmlg_SEGREDO_DE_TESTE_NAO_UTILIZAR',
 RAILWAY_PUBLIC_DOMAIN:'akitemm-escritorio-preview-homologacao.up.railway.app'
};
const fetchComDados=(data,observador=()=>{})=>async(url,opcoes)=>{
 observador(url,opcoes);
 return {ok:true,status:200,json:async()=>({data})};
};
test('auditoria somente GET reconhece configuracao unica correta sem afirmar entrega',async()=>{
 let chamadas=0;
 const r=await auditarWebhooksSandbox({env,fetchImpl:fetchComDados([{
  url:base,enabled:true,interrupted:false,events:['PAYMENT_RECEIVED','PAYMENT_REFUNDED']
 }],(url,opts)=>{
  chamadas++; assert.equal(url,'https://api-sandbox.asaas.com/v3/webhooks?limit=100');
  assert.equal(opts.method,'GET'); assert.equal(opts.body,undefined);
  assert.equal(opts.headers.access_token,env.LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY);
 })});
 assert.equal(chamadas,1);
 assert.deepEqual(r,{
  ambiente:'ASAAS_SANDBOX_EXCLUSIVO',configuracaoEncontrada:true,
  configuracaoOperacional:true,configuracoesDuplicadas:false,
  entregaExternaComprovada:false,tokenDeWebhookValidadoPorEntrega:false, chamadasDeEscrita:0
 });
 assert.equal(JSON.stringify(r).includes(env.LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY),false);
});
test('dominio oficial do LOOP nao altera o destino fixo e auditado do webhook',async()=>{
 const oficial={...env,RAILWAY_PUBLIC_DOMAIN:'akitemmloop.com.br'};
 let consultas=0;
 const resultado=await auditarWebhooksSandbox({
  env:oficial,fetchImpl:fetchComDados([
   {url:base,enabled:true,interrupted:false,events:['PAYMENT_RECEIVED']}
  ],()=>{consultas++;})
 });
 assert.equal(consultas,1);
 assert.equal(resultado.configuracaoOperacional,true);
 assert.equal(resultado.entregaExternaComprovada,false);
});
test('ausente, fila pausada, duplicada e sem PAYMENT_RECEIVED nao sao aprovados',async()=>{
 for(const data of [
  [],
  [{url:base,enabled:true,interrupted:true,events:['PAYMENT_RECEIVED']}],
  [{url:base,enabled:true,interrupted:false,events:['PAYMENT_CREATED']}],
  [
   {url:base,enabled:true,interrupted:false,events:['PAYMENT_RECEIVED']},
   {url:base,enabled:true,interrupted:false,events:['PAYMENT_RECEIVED']}
  ]
 ]){
  const resultado=await auditarWebhooksSandbox({env,fetchImpl:fetchComDados(data)});
  assert.equal(resultado.configuracaoOperacional,false);
 }
});
test('fail closed sem segredo Sandbox ou com dominio divergente, antes da rede',async()=>{
 for(const alteracao of [
  {NODE_ENV:'production'},{LOOP_PREVIEW_EXCLUSIVO:'NAO'},
  {LOOP_PREVIEW_ASAAS_HABILITADO:'NAO'},
  {LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY:'$aact_producao_ficticia_1234567'},
  {RAILWAY_PUBLIC_DOMAIN:'outro.example.com'}
 ]){
  let chamadas=0;
  await assert.rejects(auditarWebhooksSandbox({
   env:{...env,...alteracao},fetchImpl:async()=>{chamadas++;return{};}
  }),/AUDITORIA_WEBHOOK_/);
  assert.equal(chamadas,0);
 }
});
test('HTTP nao autorizado, JSON invalido e erro de rede nao viram sucesso',async()=>{
 await assert.rejects(auditarWebhooksSandbox({env,fetchImpl:async()=>({
  ok:false,status:401
 })}),{codigo:'AUDITORIA_WEBHOOK_HTTP_401'});
 await assert.rejects(auditarWebhooksSandbox({env,fetchImpl:async()=>({
  ok:true,json:async()=>({itens:[]})
 })}),{codigo:'AUDITORIA_WEBHOOK_RESPOSTA_INVALIDA'});
 await assert.rejects(auditarWebhooksSandbox({env,fetchImpl:async()=>{throw new Error('off');}}),
  {codigo:'AUDITORIA_WEBHOOK_REDE_INCONCLUSIVA'});
});