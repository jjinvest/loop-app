'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {verificarPainelAdmin}=require('../scripts/verificar-painel-admin-recuperacao-preview');
const env={
 NODE_ENV:'test',LOOP_PREVIEW_EXCLUSIVO:'SIM',
 LOOP_PREVIEW_ASAAS_HABILITADO:'SIM',
 RAILWAY_PUBLIC_DOMAIN:'akitemm-escritorio-preview-homologacao.up.railway.app',
 LOOP_PREVIEW_SENHA_ACESSO:'SENHA_FICTICIA_PARA_TESTES_NAO_USAR'
};
const recovery={processando:1,retomaveis:2,segundaFalha:0};
const js='Reconsultas PSP em andamento;Interrupções PSP em recuperação;'+
 'Reincidências — revisão humana;retomadasComProvaPSP';
const mock=async(url,opts)=>{
 assert.equal(opts.method,'GET');
 assert.equal(opts.body,undefined);
 assert.match(opts.headers.Authorization,/^Basic /);
 if(url.endsWith('/staging/assets/admin.js'))
  return {status:200,text:async()=>js};
 if(url.endsWith('/staging/escritorio-unificado'))
  return {status:200,json:async()=>({
   escritorioFonteUnica:true,recuperacaoPSP:recovery
  })};
 if(url.endsWith('/staging/escritorio-unificado/monitor-psp'))
  return {status:200,json:async()=>({
   ambiente:'ASAAS_SANDBOX_EXCLUSIVO',somenteLaboratorio:true,
   posicoesReais:0,saquesReais:0,recuperacaoPSP:recovery
  })};
 throw Error('Rota inesperada');
};
test('painel usa a mesma contagem do monitor PSP sem executar POST',async()=>{
 const r=await verificarPainelAdmin({env,fetchImpl:mock});
 assert.equal(r.painelExistenteLigadoAoBanco,true);
 assert.equal(r.operacoesDeEscrita,0);
 assert.equal(JSON.stringify(r).includes(env.LOOP_PREVIEW_SENHA_ACESSO),false);
});
test('painel e endpoints divergentes impedem declarar integracao concluida',async()=>{
 await assert.rejects(verificarPainelAdmin({env,fetchImpl:async(u,o)=>{
  const x=await mock(u,o);
  if(u.endsWith('/monitor-psp'))
   return {status:200,json:async()=>({
    ambiente:'ASAAS_SANDBOX_EXCLUSIVO',somenteLaboratorio:true,
    posicoesReais:0,saquesReais:0,recuperacaoPSP:{...recovery,segundaFalha:1}
   })};
  return x;
 }}),{codigo:'PAINEL_ADMIN_DOIS_ESTADOS_DIVERGENTES'});
});
test('credencial e dominio invalidos bloqueiam rede',async()=>{
 for(const change of [
  {NODE_ENV:'production'},
  {RAILWAY_PUBLIC_DOMAIN:'outro.example.com'},
  {LOOP_PREVIEW_ASAAS_HABILITADO:'NAO'},
  {LOOP_PREVIEW_SENHA_ACESSO:'curta'}]){
  let chamadas=0;
  await assert.rejects(verificarPainelAdmin({
   env:{...env,...change},
   fetchImpl:async()=>{chamadas++;return{};}
  }),/PAINEL_ADMIN_/);
  assert.equal(chamadas,0);
 }
});