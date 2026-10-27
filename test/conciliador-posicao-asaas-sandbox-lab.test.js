'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ConciliadorPosicaoAsaasSandboxLab}=require('../src/domain/conciliador-posicao-asaas-sandbox-lab');
const pedidoId='pedido-lab-250';
function montar({status='RECEBIMENTO_INFORMADO_SANDBOX',valorCentavos=25000}={}){
 const chamadas=[];
 const cobrancas={
  conferir:async id=>{chamadas.push('reconsulta');assert.equal(id,pedidoId);return {status};},
  consultar:id=>{chamadas.push('local');return {encontrado:true,pedidoId:id,pagamentoId:'pay_sandbox_123',status,valorCentavos};}
 };
 const catraca={processar:async id=>{
  chamadas.push('catraca');assert.equal(id,pedidoId);
  return {pedidoId:id,posicoesNoPedido:1,confirmacaoIndividualObrigatoria:true,
   posicaoId:42,criada:true};
 }};
 return {conciliador:new ConciliadorPosicaoAsaasSandboxLab({cobrancas,catraca}),chamadas};
}
test('reconsulta pagamento confirmado antes de criar posicao pendente',async()=>{
 const {conciliador,chamadas}=montar();
 const resultado=await conciliador.processar(pedidoId);
 assert.deepEqual(chamadas,['reconsulta','local','catraca']);
 assert.equal(resultado.posicaoId,42);
 assert.equal(resultado.reconsultaAsaasAntesDaCatraca,true);
});
test('nao aciona catraca para pagamento pendente ou abaixo de R$250',async()=>{
 for(const cenario of [{status:'PENDENTE_SANDBOX'},{valorCentavos:24999}]){
  const {conciliador,chamadas}=montar(cenario);
  await assert.rejects(conciliador.processar(pedidoId),{codigo:'COBRANCA_SANDBOX_NAO_CONFIRMADA'});
  assert.deepEqual(chamadas,['reconsulta','local']);
 }
});
test('nao aciona catraca se a reconsulta falhar',async()=>{
 let acionou=false;
 const conciliador=new ConciliadorPosicaoAsaasSandboxLab({
  cobrancas:{conferir:async()=>{throw Error('Asaas indisponivel');},consultar:()=>({})},
  catraca:{processar:async()=>{acionou=true;}}
 });
 await assert.rejects(conciliador.processar(pedidoId),/Asaas indisponivel/);
 assert.equal(acionou,false);
});
