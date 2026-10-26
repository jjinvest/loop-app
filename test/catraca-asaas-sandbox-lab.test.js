'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {CatracaAsaasSandboxLab}=require('../src/domain/catraca-asaas-sandbox-lab');
const pedidoId='pedido-lab-250';
const parecer={pedidoId,ambiente:'LABORATORIO_ASAAS_SANDBOX',
 titularId:'conta-a',valorCentavos:25000,elegivelParaTesteDeCatraca:true,
 catracaAutorizada:false,posicoesCriadas:0};
test('conecta parecer elegivel a ponte confiavel e preserva repeticao',async()=>{
 let chamadas=0;
 const adaptador=new CatracaAsaasSandboxLab({
  elegibilidade:{conferir:id=>{assert.equal(id,pedidoId);return parecer;}},
  ponte:{atribuicaoManualPorPosicao:true,processar:async({pedidoId:id})=>{
   assert.equal(id,pedidoId);chamadas++;
   return {contaId:'conta-a',posicaoId:7,posicaoIds:[7],
    compraElegivelLoop:true,posicaoCriada:true,
    criado:chamadas===1,repetido:chamadas>1};
  }}
 });
 const primeira=await adaptador.processar(pedidoId);
 const segunda=await adaptador.processar(pedidoId);
 assert.equal(primeira.criada,true);
 assert.equal(segunda.repetida,true);
 assert.equal(primeira.posicoesNoPedido,1);
 assert.equal(primeira.cpfConfirmadoAutomaticamente,false);
 assert.equal(chamadas,2);
});
test('bloqueia parecer sem pagamento elegivel antes da ponte',async()=>{
 for(const alteracao of [{valorCentavos:19000},{elegivelParaTesteDeCatraca:false},
  {titularId:null},{ambiente:'PRODUCAO'}]){
  let chamadas=0;
  const adaptador=new CatracaAsaasSandboxLab({
   elegibilidade:{conferir:()=>({...parecer,...alteracao})},
   ponte:{atribuicaoManualPorPosicao:true,processar:async()=>{chamadas++;}}
  });
  await assert.rejects(adaptador.processar(pedidoId),{codigo:'PAGAMENTO_SANDBOX_NAO_ELEGIVEL'});
  assert.equal(chamadas,0);
 }
});
test('detecta divergencia de titular e pacote inesperado',async()=>{
 for(const resposta of [
  {contaId:'conta-b',posicaoIds:[7]},
  {contaId:'conta-a',posicaoIds:[7,8]}
 ]){
  const adaptador=new CatracaAsaasSandboxLab({
   elegibilidade:{conferir:()=>parecer},
   ponte:{atribuicaoManualPorPosicao:true,processar:async()=>({
    compraElegivelLoop:true,posicaoCriada:true,...resposta
   })}
  });
  await assert.rejects(adaptador.processar(pedidoId));
 }
});
