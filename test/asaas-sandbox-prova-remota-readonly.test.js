'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {AsaasSandboxLojaV6,ASAAS_SANDBOX_BASE}=
 require('../src/domain/asaas-sandbox-loja-v6');

test('prova remota do Asaas Sandbox faz apenas GET sem retornar dados nem criar Pix',async()=>{
 const reqs=[];
 const psp=new AsaasSandboxLojaV6({
  apiKey:'$aact_hmlg_'+'x'.repeat(40),
  fetchImpl:async(url,options)=>{
   reqs.push({url,method:options.method,body:options.body,redirect:options.redirect});
   return {ok:true,json:async()=>({
    data:[{id:'pay_PRIVADO_12345',customer:'cus_PRIVADO_12345'}],
    totalCount:1,hasMore:false
   })};
  }
 });
 const prova=await psp.testarAcessoRemoto();
 assert.deepEqual(prova,{ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  pspRemotoRespondeu:true,cobrancasCriadas:0,webhookExternoComprovado:false});
 assert.deepEqual(reqs,[{url:ASAAS_SANDBOX_BASE+'/payments?limit=1',
  method:'GET',body:undefined,redirect:'error'}]);
 assert.equal(JSON.stringify(prova).includes('pay_PRIVADO'),false);
});

test('prova remota nao confunde resposta malformada, 401 ou queda com autenticacao',async()=>{
 const key='$aact_hmlg_'+'x'.repeat(40);
 const malformed=new AsaasSandboxLojaV6({apiKey:key,
  fetchImpl:async()=>({ok:true,json:async()=>({erro:'falso sucesso'})})});
 await assert.rejects(()=>malformed.testarAcessoRemoto(),
  {codigo:'ASAAS_SANDBOX_PROVA_RESPOSTA_INVALIDA'});
 const invalid=new AsaasSandboxLojaV6({apiKey:key,
  fetchImpl:async()=>({ok:false,status:401})});
 await assert.rejects(()=>invalid.testarAcessoRemoto(),
  {codigo:'ASAAS_SANDBOX_HTTP_401'});
 const indisponivel=new AsaasSandboxLojaV6({apiKey:key,
  fetchImpl:async()=>{throw Error('token privado jamais expor');}});
 await assert.rejects(()=>indisponivel.testarAcessoRemoto(),
  {codigo:'ASAAS_SANDBOX_REDE_INCONCLUSIVA'});
});
