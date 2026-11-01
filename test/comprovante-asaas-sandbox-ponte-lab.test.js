'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ComprovanteAsaasSandboxPonteLab}=require('../src/domain/comprovante-asaas-sandbox-ponte-lab');
const pedidoId='pedido-lab-250';
const titular={contaId:'titular-a',produtoId:'pdf-real-identificado',valorCentavos:25000,
 intentoPagamentoId:'intent-demo-123',criadoEm:'2026-10-26T09:00:00.000Z'};
const cobranca={encontrado:true,pedidoId,origem:'PDF',pagamentoId:'pay_asaas_123',
 valorCentavos:25000,status:'RECEBIMENTO_INFORMADO_SANDBOX',
 criadoEm:'2026-10-26T10:00:00.000Z',atualizadoEm:'2026-10-26T11:00:00.000Z'};
function montar(c=cobranca,t=titular){
 return new ComprovanteAsaasSandboxPonteLab({
  cobrancas:{consultar:()=>c},titularidade:{buscar:()=>t}});
}
test('comprovante preserva produto e intento identificados antes da cobranca',async()=>{
 const r=await montar().consultar(pedidoId);
 assert.equal(r.produtoId,titular.produtoId);
 assert.equal(r.intentoPagamentoId,titular.intentoPagamentoId);
 assert.equal(r.contaId,titular.contaId);
 assert.equal(r.valorCentavos,25000);
 assert.equal(r.status,'CONFIRMADO_SIMULADO');
});
test('reconsultas RECEIVED_IN_CASH mantem o primeiro horario confirmado no replay',async()=>{
 let atualizadoEm='2026-10-26T11:00:00.000Z';
 const fonte=new ComprovanteAsaasSandboxPonteLab({
  titularidade:{buscar:()=>titular},cobrancas:{
   consultar:()=>({...cobranca,atualizadoEm}),
   historico:()=>({conferencias:[{estadoLoja:'RECEBIMENTO_INFORMADO_SANDBOX',
    statusAsaas:'RECEIVED_IN_CASH',consultadoEm:'2026-10-26T10:30:00.000Z'}]})
  }});
 const primeira=await fonte.consultar(pedidoId);
 atualizadoEm='2026-10-27T12:00:00.000Z';
 const repetida=await fonte.consultar(pedidoId);
 assert.equal(primeira.confirmadoEm,'2026-10-26T10:30:00.000Z');
 assert.equal(repetida.confirmadoEm,primeira.confirmadoEm);
});
test('bloqueia status pendente, valor divergente e titular posterior',async()=>{
 for(const fonte of [
  montar({...cobranca,status:'PENDENTE_SANDBOX'}),
  montar(cobranca,{...titular,valorCentavos:26000}),
  montar(cobranca,{...titular,criadoEm:'2026-10-26T12:00:00.000Z'}),
  montar({...cobranca,valorCentavos:24999}),
  montar({...cobranca,pedidoId:'outro-pedido'}),
  montar({...cobranca,atualizadoEm:'2026-10-26T08:00:00.000Z'})
 ]){
  await assert.rejects(fonte.consultar(pedidoId));
 }
});
