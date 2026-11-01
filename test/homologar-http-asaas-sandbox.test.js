'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {homologarHttpSandbox}=require('../scripts/homologar-http-asaas-sandbox');
const {ASAAS_SANDBOX_BASE}=require('../src/domain/asaas-sandbox-loja-v6');
test('homologacao HTTP externa desabilitada sem flag e rejeita chave de producao',async()=>{
 let chamadas=0;const fetchImpl=async()=>{chamadas++;throw Error('Nao chamar rede');};
 await assert.rejects(homologarHttpSandbox({ambiente:{},fetchImpl}),/DESABILITADA/);
 await assert.rejects(homologarHttpSandbox({ambiente:{LOOP_ASAAS_SANDBOX_HTTP_HOMOLOGAR:'SIM',
  ASAAS_SANDBOX_API_KEY:'chave-de-producao-invalida'},fetchImpl}),/EXCLUSIVAMENTE_SANDBOX/);
 assert.equal(chamadas,0);
});
test('roteiro HTTP Sandbox inteiro com dublê remoto: compra, recebimento, cliente e reinicio',async()=>{
 let pagamento=null,clientes=0,postPagamentos=0,confirmacoes=0;
 const fetchImpl=async(url,opts)=>{
  assert.ok(url.startsWith(ASAAS_SANDBOX_BASE+'/'));
  let dados;
  if(url.endsWith('/customers')){
   clientes++;const corpo=JSON.parse(opts.body);assert.equal(corpo.notificationDisabled,true);
   dados={id:'cus_HttpHomologacao',externalReference:corpo.externalReference};
  }else if(url.endsWith('/payments')&&opts.method==='POST'){
   postPagamentos++;const corpo=JSON.parse(opts.body);
   pagamento={id:'pay_HttpHomologacao',externalReference:corpo.externalReference,
    value:corpo.value,customer:corpo.customer,billingType:'PIX',status:'PENDING'};dados=pagamento;
  }else if(url.endsWith('/confirm')){confirmacoes++;pagamento.status='RECEIVED';dados={};}
  else dados=pagamento;
  return {ok:true,json:async()=>dados};
 };
 const r=await homologarHttpSandbox({ambiente:{LOOP_ASAAS_SANDBOX_HTTP_HOMOLOGAR:'SIM',
  ASAAS_SANDBOX_API_KEY:'$aact_hmlg_CHAVE_FICTICIA_APENAS_TESTE',ASAAS_SANDBOX_CPF_FICTICIO:'24971563792'},fetchImpl});
 assert.equal(r.posicoes,1);assert.equal(r.sqliteReaberto,true);
 assert.equal(clientes,1);assert.equal(postPagamentos,1);assert.equal(confirmacoes,1);
 assert.equal(r.pagamentosReais,0);
});
