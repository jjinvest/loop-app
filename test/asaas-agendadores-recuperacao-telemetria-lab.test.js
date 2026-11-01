'use strict';
// Falhas de agendamento NAO podem vazar segredos ou parar a conciliacao.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');
const opcoes={webhookAsaasSandbox:{habilitado:true,token:'TOKEN_FICTICIO_AGENDADOR_LAB_2026_123456789'}};
async function aguardar(condicao){
 for(let i=0;i<150;i++){
  if(condicao())return;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 assert.fail('AGENDADOR_NAO_RECUPEROU_APOS_FALHA');
}
test('worker callbacks: falha de lote nao vaza mensagem e nao paralisa timer',async t=>{
 const m=await abrirLaboratorio(':memory:',opcoes);
 const worker=m.integracao.callbacks;
 t.after(async()=>{worker.parar();if(worker.emCurso)await worker.emCurso;await m.fechar();});
 const original=worker._reservar.bind(worker);
 let chamadas=0;
 worker._reservar=()=>{
  chamadas++;
  if(chamadas===1)throw Error('TOKEN_SECRETO_NUNCA_REVELAR');
  return original();
 };
 worker.intervaloMs=100;worker.iniciar();
 await aguardar(()=>worker.falhasAgendador===1&&chamadas>=2);
 worker.parar();if(worker.emCurso)await worker.emCurso;
 const resumo=worker.resumo();
 assert.equal(resumo.falhasAgendador,1);
 assert.equal(resumo.ultimaFalhaAgendador.codigo,'FALHA_INTERNA_LOTE');
 assert.equal(resumo.telemetriaSomenteMemoria,true);
 assert.equal(JSON.stringify(resumo).includes('TOKEN_SECRETO_NUNCA_REVELAR'),false);
 assert.equal(resumo.pagamentoRealAutorizado,false);
});
test('conciliador automatico: callback de erro defeituoso nao cria rejeicao nao tratada',async t=>{
 const m=await abrirLaboratorio(':memory:');
 const agenda=m.integracao.automatico;
 t.after(async()=>{agenda.parar();if(agenda.verificacaoEmCurso)await agenda.verificacaoEmCurso;await m.fechar();});
 let chamadas=0;
 agenda.listarPendentes=()=>{
  chamadas++;
  if(chamadas===1)throw Error('SEGREDO_NAO_REGISTRAR');
  return [];
 };
 agenda.aoErro=()=>{throw Error('OUTRO_SEGREDO_NAO_REGISTRAR');};
 agenda.intervaloMs=100;agenda.iniciar();
 await aguardar(()=>agenda.falhasAgendador===1&&chamadas>=2);
 agenda.parar();if(agenda.verificacaoEmCurso)await agenda.verificacaoEmCurso;
 assert.equal(agenda.ultimaFalhaAgendador.codigo,'FALHA_INTERNA_AGENDADOR');
 assert.equal(JSON.stringify(agenda.ultimaFalhaAgendador).includes('SEGREDO'),false);
 assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM admin_ponte_compras_demo').get().n,0);
});