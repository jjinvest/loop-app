'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validarAmbiente,homologarPixPontaAPonta}=
 require('../scripts/homologar-pix-ponta-a-ponta-asaas-preview');
const basico={
 NODE_ENV:'test',LOOP_PREVIEW_EXCLUSIVO:'SIM',LOOP_PREVIEW_ASAAS_HABILITADO:'SIM',
 LOOP_PREVIEW_ASAAS_E2E_EXECUTAR:'SIM',
 LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY:'$aact_hmlg_TESTE_FICTICIO_SEM_USO_REAL',
 LOOP_PREVIEW_SENHA_ACESSO:'SENHA_FAKE_COMPRIDA_QUE_NAO_E_DA_PREVIA',
 RAILWAY_PUBLIC_DOMAIN:'akitemm-escritorio-preview-homologacao.up.railway.app'
};
test('ensaio de ponta a ponta e explicitamente limitado a Sandbox',()=>{
 assert.doesNotThrow(()=>validarAmbiente(basico));
 for(const troca of [
  {NODE_ENV:'production'},
  {LOOP_PREVIEW_EXCLUSIVO:'NAO'},
  {LOOP_PREVIEW_ASAAS_HABILITADO:'NAO'},
  {LOOP_PREVIEW_ASAAS_E2E_EXECUTAR:'NAO'},
  {RAILWAY_PUBLIC_DOMAIN:'dominio-externo.invalid'},
  {LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY:'$aact_prod_TESTE_PRODUCAO'},
  {LOOP_PREVIEW_SENHA_ACESSO:'curta'}
 ]){
  assert.throws(()=>validarAmbiente({...basico,...troca}),/E2E_/);
 }
});
test('falha de seguranca nunca acessa rede ou cria pedido',async()=>{
 let chamadas=0;
 await assert.rejects(homologarPixPontaAPonta({
  env:{...basico,NODE_ENV:'production'},
  fetchImpl:async()=>{chamadas++;return{ok:true};},
  nick:'Lababcdef'
 }),{codigo:'E2E_PREVIA_NAO_AUTORIZADA'});
 assert.equal(chamadas,0);
});
test('nick invalido e rejeitado antes da rede',async()=>{
 let chamadas=0;
 await assert.rejects(homologarPixPontaAPonta({
  env:basico,fetchImpl:async()=>{chamadas++;return{ok:true};},nick:'Homologacao2026'
 }),{codigo:'E2E_TESTE_NAO_CONFIGURADO'});
 assert.equal(chamadas,0);
});