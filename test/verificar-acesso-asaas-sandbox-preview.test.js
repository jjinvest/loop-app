'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {verificarAcesso}=require('../scripts/verificar-acesso-asaas-sandbox-preview');
const valido={
 NODE_ENV:'test',LOOP_PREVIEW_EXCLUSIVO:'SIM',
 LOOP_PREVIEW_ASAAS_HABILITADO:'SIM',
 LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY:'$aact_hmlg_CHAVE_DE_TESTE_FICTICIA_NAO_USAR'
};
test('pre-deploy prova acesso ao PSP apenas por GET e sem criar cobranca',async()=>{
 let chamado=0;
 const resultado=await verificarAcesso({env:valido,criarPsp:chave=>{
  assert.equal(chave,valido.LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY);
  return {async testarAcessoRemoto(){chamado++;return{
   ambiente:'ASAAS_SANDBOX_EXCLUSIVO',pspRemotoRespondeu:true,
   cobrancasCriadas:0,webhookExternoComprovado:false
  };}};
 }});
 assert.equal(chamado,1);
 assert.deepEqual(resultado,{ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  acessoRemotoComprovado:true,cobrancasCriadas:0});
 assert.equal(JSON.stringify(resultado).includes(valido.LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY),false);
});
test('pre-deploy nunca contata PSP sem autorizacao exclusiva e chave de homologacao',async()=>{
 for(const alteracao of [
  {NODE_ENV:'production'},
  {LOOP_PREVIEW_EXCLUSIVO:'NAO'},
  {LOOP_PREVIEW_ASAAS_HABILITADO:'NAO'},
  {LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY:'$aact_producao_chave_longa_ficticia'},
  {LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY:'$aact_hmlg_curta'},
  {LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY:'$aact_hmlg_chave com espaco'}
 ]){
  let chamados=0;
  await assert.rejects(verificarAcesso({
   env:{...valido,...alteracao},criarPsp:()=>{chamados++;return{};}
  }),e=>e.codigo==='PREVIA_SANDBOX_NAO_AUTORIZADA'||
        e.codigo==='CHAVE_ASAAS_HOMOLOGACAO_INVALIDA');
  assert.equal(chamados,0);
 }
});
test('pre-deploy falha fechado sem declarar sucesso de PSP indisponivel',async()=>{
 await assert.rejects(verificarAcesso({env:valido,criarPsp:()=>({
  async testarAcessoRemoto(){throw Object.assign(new Error('Sem rede'),{codigo:'ASAAS_SANDBOX_HTTP_401'});}
 })}),{codigo:'ASAAS_SANDBOX_HTTP_401'});
 await assert.rejects(verificarAcesso({env:valido,criarPsp:()=>({
  async testarAcessoRemoto(){return {ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
   pspRemotoRespondeu:true,cobrancasCriadas:1};}
 })}),{codigo:'PROVA_ASAAS_SANDBOX_INCONCLUSIVA'});
});
