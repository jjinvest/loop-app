'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {criarAgendadorConciliacaoSandbox}=
 require('../src/domain/agendador-conciliacao-asaas-sandbox');

test('agendador automatico consulta no mesmo fluxo e nao sobrepoe rodadas',async()=>{
 let liberar,consultas=0,agendado=null,cancelado=0,periodo=null;
 const espera=new Promise(ok=>{liberar=ok;});
 const a=criarAgendadorConciliacaoSandbox({
  executar:async limite=>{
   consultas++;assert.equal(limite,20);
   await espera;
   return {consultados:1,pendentesRestantes:0};
  },
  intervaloMs:30000,limite:20,
  agendar:(cb,ms)=>{
   periodo=ms;agendado=cb;
   return {unref(){}};
  },
  cancelar:()=>{cancelado++;}
 });
 assert.equal(a.iniciar().habilitado,true);
 await Promise.resolve();
 assert.equal(consultas,1);
 assert.equal(periodo,30000);
 assert.equal((await a.executarUmaVez()).estado,'EM_ANDAMENTO');
 agendado();
 await Promise.resolve();
 assert.equal(consultas,1,'ticks concorrentes nao podem duplicar GET PSP');
 liberar();
 await new Promise(setImmediate);
 assert.equal(a.estado().rodadas,1);
 assert.equal(a.estado().falhas,0);
 assert.equal(a.estado().emExecucao,false);
 const segunda=await a.executarUmaVez();
 assert.equal(segunda.estado,'CONCLUIDA');
 assert.equal(consultas,2);
 await a.encerrar();
 assert.equal(cancelado,1);
 assert.equal(a.estado().habilitado,false);
 assert.equal((await a.executarUmaVez()).estado,'ENCERRADO');
});
test('erro nao imprime segredos nem cria saldo e proximo ciclo continua',async()=>{
 const codigos=[];let vezes=0;
 const a=criarAgendadorConciliacaoSandbox({
  executar:async()=>{
   vezes++;if(vezes===1)throw new Error('token-Asaas-segredo-NUNCA-LOGAR');
   return {consultados:0,pendentesRestantes:0};
  },
  onErro:codigo=>codigos.push(codigo)
 });
 const erro=await a.executarUmaVez();
 assert.equal(erro.estado,'EXIGE_VERIFICACAO');
 assert.equal(erro.pagamentosReais,false);
 assert.equal(erro.saquesReais,false);
 assert.deepEqual(codigos,['CONCILIACAO_SANDBOX_NAO_CONCLUIDA']);
 assert.equal((await a.executarUmaVez()).estado,'CONCLUIDA');
 assert.equal(a.estado().falhas,1);
 assert.equal(a.estado().rodadas,1);
 await a.encerrar();
});
test('nao aceita executar sem worker, intervalo curto ou lote fora do teto',()=>{
 const fn=async()=>({consultados:0});
 assert.throws(()=>criarAgendadorConciliacaoSandbox(),/AGENDADOR_SANDBOX_CONFIG_INVALIDA/);
 assert.throws(()=>criarAgendadorConciliacaoSandbox({executar:fn,intervaloMs:5000}),
  /AGENDADOR_SANDBOX_CONFIG_INVALIDA/);
 assert.throws(()=>criarAgendadorConciliacaoSandbox({executar:fn,limite:21}),
  /AGENDADOR_SANDBOX_CONFIG_INVALIDA/);
});
