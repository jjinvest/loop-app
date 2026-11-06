'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validarAmbiente,homologarClienteConviteTabuleiro}=
 require('../scripts/homologar-cliente-convite-tabuleiro-asaas-preview');
const env={NODE_ENV:'test',LOOP_PREVIEW_EXCLUSIVO:'SIM',
 LOOP_PREVIEW_ASAAS_HABILITADO:'SIM',LOOP_PREVIEW_FLUXO_CLIENTE_EXECUTAR:'SIM',
 RAILWAY_PUBLIC_DOMAIN:'akitemm-escritorio-preview-homologacao.up.railway.app',
 LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY:'$aact_hmlg_CREDENCIAL_TOTALMENTE_FICTICIA',
 LOOP_PREVIEW_SENHA_ACESSO:'SENHA_FICTICIA_PARA_HOMOLOGACAO_TESTE_123'};
test('fluxo jamais executa em producao ou sem opt-in explicito',()=>{
 assert.doesNotThrow(()=>validarAmbiente(env));
 for(const x of [{NODE_ENV:'production'},{LOOP_PREVIEW_EXCLUSIVO:'NAO'},
  {LOOP_PREVIEW_FLUXO_CLIENTE_EXECUTAR:'NAO'},
  {LOOP_PREVIEW_ASAAS_HABILITADO:'NAO'},
  {RAILWAY_PUBLIC_DOMAIN:'outro.example.invalid'},
  {LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY:'$aact_live_credencial'}])
  assert.throws(()=>validarAmbiente({...env,...x}),/FLUXO_CLIENTE_/);
});
test('sem autorizacao, nenhum cadastro nem cobranca podem ser criados',async()=>{
 let chamadas=0;
 await assert.rejects(homologarClienteConviteTabuleiro({
  env:{...env,LOOP_PREVIEW_FLUXO_CLIENTE_EXECUTAR:'NAO'},
  fetchImpl:async()=>{chamadas++;return{};}
 }),{codigo:'FLUXO_CLIENTE_PREVIA_NAO_AUTORIZADA'});
 assert.equal(chamadas,0);
});
test('nicks fora do formato falham antes da rede',async()=>{
 let chamadas=0;
 await assert.rejects(homologarClienteConviteTabuleiro({
  env,nickA:'ContaReal',nickB:'Babcdefgh',
  fetchImpl:async()=>{chamadas++;return{};}
 }),{codigo:'FLUXO_CLIENTE_FIXTURE_INVALIDA'});
 assert.equal(chamadas,0);
});