'use strict';
// Regressao isolada do agendador Sandbox: nenhum observer externo libera dinheiro.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ConciliacaoAutomaticaAsaasSandboxLab}=require('../src/domain/conciliacao-automatica-asaas-sandbox-lab');

test('falha da listagem e do observador nao bloqueiam os outros pedidos da rodada',async()=>{
 const visitados=[];
 const agenda=new ConciliacaoAutomaticaAsaasSandboxLab({
  conciliador:{processar:async id=>{
   visitados.push(id);return {posicoesNoPedido:1,confirmacaoIndividualObrigatoria:true};
  }},
  listarPendentes:async()=>{throw Error('CHAVE_PRIVADA_NAO_LOGAR');},
  aoErro:()=>{throw Error('TOKEN_PRIVADO_OBSERVADOR');}
 });
 agenda.acompanhar('pedido-a01');agenda.acompanhar('pedido-b02');
 await agenda.verificar();
 assert.deepEqual(visitados,['pedido-a01','pedido-b02']);
 assert.equal(agenda.pendentes.size,0);
 assert.equal(agenda.falhasAgendador,1);
 assert.equal(agenda.ultimaFalhaAgendador.codigo,'FALHA_INTERNA_AGENDADOR');
 assert.equal(JSON.stringify(agenda.ultimaFalhaAgendador).includes('PRIVAD'),false);
 assert.equal(agenda.verificacaoEmCurso,null);
});

test('falha ao consultar status e observador assincrono rejeitado isolam pedido ruim',async()=>{
 const visitados=[],avisos=[];
 let recuperado=false;
 const agenda=new ConciliacaoAutomaticaAsaasSandboxLab({
  conciliador:{
   cobrancas:{consultar:()=>{throw Error('TOKEN_PRIVADO_PSP');}},
   processar:async id=>{
    visitados.push(id);
    if(id==='pedido-f01'&&!recuperado)throw Error('DADO_PRIVADO_CLIENTE');
    return {posicoesNoPedido:1,confirmacaoIndividualObrigatoria:true};
   }
  },
  aoErro:async(e,id)=>{avisos.push(id);throw Error('OBSERVADOR_PRIVADO');}
 });
 agenda.acompanhar('pedido-f01');agenda.acompanhar('pedido-ok2');
 await agenda.verificar();
 assert.deepEqual(visitados,['pedido-f01','pedido-ok2']);
 assert.deepEqual(avisos,['pedido-f01']);
 assert.deepEqual([...agenda.pendentes],['pedido-f01']);
 assert.equal(agenda.emAndamento.size,0);
 assert.equal(agenda.falhasAgendador,2);
 assert.equal(JSON.stringify(agenda.ultimaFalhaAgendador).includes('PRIVADO'),false);
 recuperado=true;
 await agenda.verificar();
 assert.equal(agenda.pendentes.size,0);
 assert.equal(visitados.filter(x=>x==='pedido-ok2').length,1);
});

test('reversao terminal preserva trilha e nao impede demais pedidos se observador falha',async()=>{
 const visitados=[];
 const agenda=new ConciliacaoAutomaticaAsaasSandboxLab({
  conciliador:{
   cobrancas:{consultar:id=>({status:id==='pedido-r01'?'REVERSAO_INFORMADA_SANDBOX':'PENDING'})},
   processar:async id=>{
    visitados.push(id);
    if(id==='pedido-r01')throw Error('REVERSAO_PROCESSADA');
    return {posicoesNoPedido:0,vendaSomenteLoja:true};
   }
  },
  aoErro:()=>{throw Error('OBSERVADOR_PRIVADO');}
 });
 agenda.acompanhar('pedido-r01');agenda.acompanhar('pedido-n02');
 await agenda.verificar();
 assert.deepEqual(visitados,['pedido-r01','pedido-n02']);
 assert.equal(agenda.pendentes.size,0);
 assert.equal(agenda.falhasAgendador,1);
});
