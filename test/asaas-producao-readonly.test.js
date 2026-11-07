'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {consultarAsaasProducaoReadOnly:consultar}=
 require('../src/producao/asaas-producao-readonly');
const {verificarAsaasComercial}=require('../scripts/verificar-asaas-comercial-readonly');
const PROD='$aact_prod_'+('X'.repeat(32));
function resposta(x,status=200){
 return new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json'}});
}
test('chave Sandbox ou ausente e recusada sem acesso externo',async()=>{
 let chamadas=0;
 for(const chave of [undefined,'$aact_hmlg_'+('X'.repeat(32)),'CHAVE_TESTE',' abc ']){
  await assert.rejects(consultar({chave,buscar:async()=>{chamadas++;}}),
   {codigo:'ASAAS_PRODUCAO_CHAVE_AUSENTE_OU_AMBIENTE_ERRADO'});
 }
 assert.equal(chamadas,0);
});
test('somente dois GET fixos, resposta sem PII, sem saldo e sem chave',async()=>{
 const chamadas=[],busca=async(url,opts)=>{
  chamadas.push({url,opts});
  assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');
  assert.equal(opts.headers.access_token,PROD);
  assert.ok(!opts.body);
  if(url.endsWith('/myAccount/status/'))return resposta({
   general:'APPROVED',commercialInfo:'APPROVED',
   bankAccountInfo:'APPROVED',documentation:'APPROVED',
   cpfCnpj:'NAO_DEVOLVER',ownerName:'NAO_DEVOLVER'
  });
  return resposta({totalCount:900,hasMore:true,data:[{
   id:'NAO_EXPOR_ID',paymentId:'NAO_EXPOR_PSP',value:999.99,
   name:'CLIENTE_PRIVADO',cpfCnpj:'NAO_EXPOR_CPF'
  }]});
 };
 const resultado=await consultar({chave:PROD,buscar:busca});
 assert.deepEqual(chamadas.map(x=>x.url),[
  'https://api.asaas.com/v3/myAccount/status/',
  'https://api.asaas.com/v3/financialTransactions?offset=0&limit=1'
 ]);
 assert.equal(resultado.extratoConsultado,true);
 assert.equal(resultado.transacoesRetornadasNaPagina,1);
 assert.equal(resultado.checkoutComercialHabilitado,false);
 assert.equal(resultado.conciliacaoBancariaIndependenteComprovada,false);
 const json=JSON.stringify(resultado);
 for(const proibido of [PROD,'NAO_EXPOR','CLIENTE_PRIVADO','999.99','900'])
  assert.equal(json.includes(proibido),false);
});
test('conta nao aprovada interrompe antes de consultar extrato',async()=>{
 let chamadas=0;
 const ret=await consultar({chave:PROD,buscar:async(url)=>{
  chamadas++;assert.ok(url.endsWith('/myAccount/status/'));
  return resposta({general:'PENDING',documentation:'AWAITING_APPROVAL'});
 }});
 assert.equal(chamadas,1);assert.equal(ret.extratoConsultado,false);
 assert.equal(ret.aprovacaoGeral,'PENDING');
});
test('erro 401, 403, 500, JSON invalidado ou falha de rede sao fechados',async()=>{
 for(const [status,expected] of [
  [401,'ASAAS_PRODUCAO_CHAVE_NAO_AUTENTICADA'],
  [403,'ASAAS_PRODUCAO_ACESSO_RESTRITO'],
  [500,'ASAAS_PRODUCAO_RESPOSTA_NAO_COMPROVADA']]){
  await assert.rejects(consultar({chave:PROD,buscar:async()=>resposta({},status)}),
   {codigo:expected});
 }
 await assert.rejects(consultar({chave:PROD,buscar:async()=>new Response('INVALIDO')}),
  {codigo:'ASAAS_PRODUCAO_RESPOSTA_INVALIDA'});
 await assert.rejects(consultar({chave:PROD,buscar:async()=>{throw Error('SEGREDO');}}),
  {codigo:'ASAAS_PRODUCAO_CONEXAO_NAO_COMPROVADA'});
});
test('extrato inesperado nao comprova acesso read-only',async()=>{
 await assert.rejects(consultar({chave:PROD,buscar:async(url)=>{
  return url.endsWith('/myAccount/status/')?
   resposta({general:'APPROVED'}):resposta({data:[1,2]});
 }}),{codigo:'ASAAS_PRODUCAO_EXTRATO_FORMATO_INVALIDO'});
});
test('CLI desabilitado por padrao, impossivel na previa e com sandbox',async()=>{
 let chamadas=0;const buscar=async()=>{
  chamadas++;return resposta({general:'APPROVED'});
 };
 for(const env of [
  {},{LOOP_ASAAS_PRODUCAO_LEITURA_AUTORIZADA:'SIM',LOOP_PREVIEW_EXCLUSIVO:'SIM'},
  {LOOP_ASAAS_PRODUCAO_LEITURA_AUTORIZADA:'SIM',LOOP_RAILWAY_STAGING_AUTORIZADO:'SIM'}
 ]){
  await assert.rejects(verificarAsaasComercial({env,buscar}),
   {codigo:'ASAAS_COMERCIAL_CONSULTA_NAO_AUTORIZADA'});
 }
 assert.equal(chamadas,0);
});
