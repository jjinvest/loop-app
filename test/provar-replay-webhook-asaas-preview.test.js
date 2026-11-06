'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validarAmbiente,selecionarCobranca,resumoMotor,provarReplayWebhook}=
 require('../scripts/provar-replay-webhook-asaas-preview');
const env={
 NODE_ENV:'test',LOOP_PREVIEW_EXCLUSIVO:'SIM',
 LOOP_PREVIEW_ASAAS_HABILITADO:'SIM',
 LOOP_PREVIEW_WEBHOOK_REPLAY_EXECUTAR:'SIM',
 RAILWAY_PUBLIC_DOMAIN:'akitemm-escritorio-preview-homologacao.up.railway.app',
 LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY:'$aact_hmlg_CREDENCIAL_FICTICIA_NAO_USAR',
 LOOP_PREVIEW_ASAAS_WEBHOOK_TOKEN:'TOKEN_FICTICIO_NAO_USAR_12345678901234567890',
 LOOP_PREVIEW_SENHA_ACESSO:'SENHA_FICTICIA_NAO_USAR_123456789012345'
};
const ID='pay_TESTES_REPLAY_12345',REF='LOOPLAB-hom-12345678-1234-4123-8123-123456789abc';
const vinculo={ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
 pagamentoId:ID,externalReference:REF,valorCentavos:25000,
 consultaSomenteLeitura:true,financeiroReal:false};
const psp={id:ID,externalReference:REF,billingType:'PIX',status:'RECEIVED',value:250};
const pos={numero:1,status:'PENDENTE',dourada:false};
const estado={laboratorio:true,dinheiroReal:false,autorizacaoComercial:false,
 posicoesReais:0,filaA:[],filaB:[pos],ordemAlimentacao:'3A:1B',
 tabuleiro:{centro:null,vagas:[null,null,null,null,null,null],eventosNoCiclo:0,
 ciclosConcluidos:0},catraca:{estado:'PARADO',giros:0}};
test('exige Sandbox, opt-in e segredo webhook separado de API key',()=>{
 assert.doesNotThrow(()=>validarAmbiente(env));
 for(const change of [
  {NODE_ENV:'production'}, {LOOP_PREVIEW_EXCLUSIVO:'NAO'},
  {LOOP_PREVIEW_ASAAS_HABILITADO:'NAO'},
  {LOOP_PREVIEW_WEBHOOK_REPLAY_EXECUTAR:'NAO'},
  {RAILWAY_PUBLIC_DOMAIN:'exemplo.com'},
  {LOOP_PREVIEW_ASAAS_SANDBOX_API_KEY:'$aact_prod_credencial_ficticia'},
  {LOOP_PREVIEW_ASAAS_WEBHOOK_TOKEN:'curto'}
 ])
  assert.throws(()=>validarAmbiente({...env,...change}),/REPLAY_SANDBOX_/);
});
test('seleciona cobranca vinculada no motor e confirmada por GET PSP',()=>{
 assert.deepEqual(selecionarCobranca(vinculo,psp),{id:ID,ref:REF});
 for(const falsos of [
  [vinculo,{...psp,status:'PENDING'}],
  [vinculo,{...psp,value:251}],
  [{...vinculo,pagamentoId:'pay_OUTRO_12345'},psp],
  [{...vinculo,valorCentavos:0},psp],
  [{...vinculo,financeiroReal:true},psp]
 ]) assert.throws(()=>selecionarCobranca(...falsos),/REPLAY_/);
});
test('fingerprint rejeita motor com mais de uma posicao e nao divulga PII',()=>{
 const hash=resumoMotor(estado);
 assert.match(hash,/^[a-f0-9]{64}$/);
 const diff=structuredClone(estado);diff.filaB.push({numero:2,status:'PENDENTE'});
 assert.throws(()=>resumoMotor(diff),/REPLAY_/);
});
test('ensaio remoto com simulacao HTTP garante 6 eventos e 1 posicao',async()=>{
 const seen=new Map(),urls=[],times=[];
 let chamadasPsp=0,reconciliacoes=0;
 const fake=async(url,opt)=>{
  urls.push(url);
  assert.equal(opt.redirect,'error');
  if(url.includes('api-sandbox.asaas.com')){
   chamadasPsp++;assert.equal(opt.method,'GET');assert.equal(opt.body,undefined);
   return {status:200,json:async()=>psp};
  }
  if(url.endsWith('/webhooks/asaas-sandbox-unificado')){
   assert.equal(opt.method,'POST');
   assert.equal(opt.headers['asaas-access-token'],env.LOOP_PREVIEW_ASAAS_WEBHOOK_TOKEN);
   const body=JSON.parse(opt.body);
   times.push(body.id);
   const n=seen.get(body.id)||0;seen.set(body.id,n+1);
   return {status:200,json:async()=>({
    eventoRegistrado:n===0,repetido:n>0,posicoesCriadas:0,financasReais:false
   })};
  }
  assert.match(opt.headers.Authorization||'',/^Basic /);
  if(url.endsWith('/webhook-replay-fixture'))
   return {status:200,json:async()=>vinculo};
  if(url.endsWith('/motor/estado'))
   return {status:200,json:async()=>estado};
  if(url.endsWith('/reconciliar-pendentes-sandbox')){
   reconciliacoes++;
   return {status:200,json:async()=>({
    ambiente:'ASAAS_SANDBOX_EXCLUSIVO',errosDeProcessamento:0,
    pendentesRestantes:0,saquesReais:0,posicoesComerciais:0
   })};
  }
  if(url.endsWith('/monitor-psp'))return {status:200,json:async()=>({
   ambiente:'ASAAS_SANDBOX_EXCLUSIVO',saquesReais:0,pagamentosReais:0,
   posicoesReais:0,consultaPSPExecutadaNestaLeitura:false
  })};
  throw new Error('UNEXPECTED_ROUTE');
 };
 let counter=0;
 const r=await provarReplayWebhook({env,fetchImpl:fake,
  idFactory:()=>String(++counter).padStart(32,'a')});
 assert.equal(r.entregasHTTP,6);
 assert.equal(r.posicoesAntes,1);
 assert.equal(r.posicoesDepois,1);
 assert.equal(r.estadoMotorIdêntico,true);
 assert.equal(reconciliacoes,1);assert.equal(chamadasPsp,1);
 assert.equal(times.length,6);assert.equal(new Set(times).size,2);
 assert.equal([...seen.values()].sort().join(','),'2,4');
 assert.equal(urls.some(x=>x.endsWith('/payments/'+ID)),true);
 assert.equal(JSON.stringify(r).includes(env.LOOP_PREVIEW_ASAAS_WEBHOOK_TOKEN),false);
});
test('nenhuma chamada em producao, dominio alternativo ou opt-in ausente',async()=>{
 for(const changed of [{NODE_ENV:'production'},
  {LOOP_PREVIEW_WEBHOOK_REPLAY_EXECUTAR:'NAO'},
  {RAILWAY_PUBLIC_DOMAIN:'outro.example.invalid'}]){
  let chamadas=0;
  await assert.rejects(provarReplayWebhook({
   env:{...env,...changed},fetchImpl:async()=>{chamadas++;return{};}
  }),/REPLAY_/);
  assert.equal(chamadas,0);
 }
});