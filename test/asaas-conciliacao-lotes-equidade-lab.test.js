'use strict';
// Lotes limitados e rodizio de pendencias de consultas Sandbox; nunca libera PIX real.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ConciliacaoAutomaticaAsaasSandboxLab}=require('../src/domain/conciliacao-automatica-asaas-sandbox-lab');

test('limite de reconsultas evita uma rodada ilimitada e preserva pedidos restantes',async()=>{
 const tentativas=[];
 const agenda=new ConciliacaoAutomaticaAsaasSandboxLab({
  maxPorVerificacao:4,
  conciliador:{processar:async id=>{
   tentativas.push(id);
   return {posicoesNoPedido:1,confirmacaoIndividualObrigatoria:true};
  }}
 });
 for(let i=0;i<13;i++)agenda.acompanhar('pedido-'+String(i).padStart(3,'0'));
 await agenda.verificar();
 assert.equal(tentativas.length,4);
 assert.equal(agenda.pendentes.size,9);
 await agenda.verificar();await agenda.verificar();await agenda.verificar();
 assert.equal(tentativas.length,13);
 assert.equal(agenda.pendentes.size,0);
 assert.equal(new Set(tentativas).size,13);
});

test('um pedido nao confirmado nao monopoliza o limite nem esconde o novo',async()=>{
 const tentativas=[],avisos=[];
 let liberar=false;
 const agenda=new ConciliacaoAutomaticaAsaasSandboxLab({
  maxPorVerificacao:2,
  conciliador:{
   cobrancas:{consultar:()=>({status:'PENDENTE_SANDBOX'})},
   processar:async id=>{
    tentativas.push(id);
    if(id==='pedido-pendente'&&!liberar){
     const e=new Error('Falha esperada');
     e.codigo='COBRANCA_SANDBOX_NAO_CONFIRMADA';throw e;
    }
    return {posicoesNoPedido:1,confirmacaoIndividualObrigatoria:true};
   }
  },
  aoErro:(_erro,id)=>{avisos.push(id);}
 });
 for(const id of ['pedido-pendente','pedido-b01','pedido-b02','pedido-b03','pedido-b04'])agenda.acompanhar(id);
 await agenda.verificar();
 assert.deepEqual(tentativas,['pedido-pendente','pedido-b01']);
 assert.deepEqual([...agenda.pendentes],['pedido-b02','pedido-b03','pedido-b04','pedido-pendente']);
 await agenda.verificar();await agenda.verificar();
 assert.deepEqual(avisos,['pedido-pendente','pedido-pendente']);
 assert.equal(agenda.pendentes.size,1);
 liberar=true;await agenda.verificar();
 assert.equal(agenda.pendentes.size,0);
 assert.equal(tentativas.filter(id=>id==='pedido-pendente').length,3);
 assert.equal(agenda.falhasAgendador,0);
});

test('parametro de lote rejeita zero, nao inteiro ou excesso',()=>{
 for(const maxPorVerificacao of [0,101,-1,1.4,'20',NaN]){
  assert.throws(()=>new ConciliacaoAutomaticaAsaasSandboxLab({
   conciliador:{processar:async()=>({})},maxPorVerificacao
  }),{name:'RangeError'});
 }
});
