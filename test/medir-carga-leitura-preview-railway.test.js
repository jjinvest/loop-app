'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {medirCargaLeitura}=require('../scripts/medir-carga-leitura-preview-railway');
const env={
 NODE_ENV:'test',LOOP_PREVIEW_EXCLUSIVO:'SIM',
 LOOP_PREVIEW_CARGA_LEITURA_EXECUTAR:'SIM',
 RAILWAY_PUBLIC_DOMAIN:'akitemm-escritorio-preview-homologacao.up.railway.app',
 LOOP_PREVIEW_SENHA_ACESSO:'SENHA_DE_ENSAIO_SOMENTE_TESTE_123'
};
test('smoke GET limitado, confirma liveness e readiness com protecao e sem POST',async()=>{
 let ativo=0,pico=0,health=0,ready=0,tempo=100;
 const result=await medirCargaLeitura({env,total:23,concorrencia:5,prontidoes:3,
  agora:()=>tempo++,
  fetchImpl:async(url,opcoes)=>{
   ativo++;pico=Math.max(pico,ativo);
   assert.equal(opcoes.method,'GET');
   assert.equal(opcoes.body,undefined);
   assert.equal(url.startsWith('https://akitemm-escritorio-preview-homologacao.up.railway.app/'),true);
   const protegido=url.endsWith('/readyz');
   if(protegido){
    ready++;assert.match(opcoes.headers.Authorization||'',/^Basic /);
   }else{
    health++;assert.equal(opcoes.headers.Authorization,undefined);
   }
   await Promise.resolve();
   ativo--;
   return {status:200,json:async()=>({
    estado:protegido?'BANCO_DE_ENSAIO_APTO':'PREVIA_PROTEGIDA',
    financeiroReal:false,marcoZeroLiberado:false
   })};
  }
 });
 assert.equal(health,23);assert.equal(ready,3);
 assert.equal(result.totalRequisicoes,26);
 assert.equal(result.erros,0);assert.equal(result.operacoesDeEscrita,0);
 assert.equal(result.marcoZeroAprovado,false);
 assert.equal(pico<=5,true);
 assert.equal(JSON.stringify(result).includes(env.LOOP_PREVIEW_SENHA_ACESSO),false);
});
test('smoke nao inicia fora do ambiente ou sem opt-in',async()=>{
 for(const change of [
  {NODE_ENV:'production'},{LOOP_PREVIEW_EXCLUSIVO:'NAO'},
  {LOOP_PREVIEW_CARGA_LEITURA_EXECUTAR:'NAO'},
  {RAILWAY_PUBLIC_DOMAIN:'outro.example.invalid'},
  {LOOP_PREVIEW_SENHA_ACESSO:'curta'}
 ]){
  let chamadas=0;
  await assert.rejects(medirCargaLeitura({
   env:{...env,...change},total:3,concorrencia:2,prontidoes:1,
   fetchImpl:async()=>{chamadas++;return{};}
  }),/CARGA_/);
  assert.equal(chamadas,0);
 }
});
test('smoke nunca mascara resposta 503 ou token recusado',async()=>{
 for(const status of [401,503]){
  await assert.rejects(medirCargaLeitura({
   env,total:2,concorrencia:1,prontidoes:1,
   fetchImpl:async()=>({status,json:async()=>({estado:'FALHA'})})
  }),{codigo:'CARGA_PREVIA_RESPOSTAS_INVALIDAS'});
 }
});
