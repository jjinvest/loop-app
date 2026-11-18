'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {criarAgendadorBackupMidiaReal}=
 require('../src/producao/agendador-backup-midia-real');
const PROVA={
 estado:'OFFSITE_MIDIA_CIFRADA_BAIXADA_RESTAURADA',
 copiaExternaConfirmada:true,restauracaoIsoladaConfirmada:true,
 integridadeSQLite:'ok',produtosMidia:7,fotosAtuais:23,pdfAtuais:1
};
test('mídia só tem estado comprovado após upload, GET e restauração',async()=>{
 let agora=1000000000,agendada=null,cancelou=false,chamadas=0;
 const a=criarAgendadorBackupMidiaReal({
  executar:async()=>{chamadas++;return PROVA;},
  agora:()=>agora,agendar:fn=>{agendada=fn;return {unref(){}};},
  cancelar:()=>{cancelou=true;}
 });
 assert.equal(a.estado().backupAtualEmDia,false);
 const inicial=await a.iniciar();
 assert.equal(inicial.backupAtualEmDia,true);
 assert.equal(inicial.fotosAtuais,23);
 assert.equal(chamadas,1);
 assert.ok(agendada);
 agora+=3600000;
 const nova=await a.executarUmaVez();
 assert.equal(nova.restauracaoComprovada,true);
 assert.equal(a.estado().copiasVerificadas,2);
 await a.encerrar();
 assert.equal(cancelou,true);
});
test('backup externo falho impede iniciar agendador, não vira sucesso antigo',async()=>{
 let fazer=false;
 const a=criarAgendadorBackupMidiaReal({
  executar:async()=>fazer?PROVA:{estado:'INCOMPLETO'},
  agendar:()=>({unref(){}}),cancelar:()=>{}
 });
 await assert.rejects(a.iniciar(),/AGENDADOR_MIDIA_PRIMEIRA_COPIA_NAO_COMPROVADA/);
 assert.equal(a.estado().backupAtualEmDia,false);
 assert.equal(a.estado().estado,'FALHOU');
 fazer=true;
 await a.iniciar();
 assert.equal(a.estado().backupAtualEmDia,true);
 fazer=false;
 await a.executarUmaVez();
 assert.equal(a.estado().backupAtualEmDia,false);
 await a.encerrar();
});
test('comprovação expirada não serve como autorização de backup fresco',async()=>{
 let agora=1000000000;
 const a=criarAgendadorBackupMidiaReal({
  executar:async()=>PROVA,agora:()=>agora,
  agendar:()=>({unref(){}}),cancelar:()=>{}
 });
 await a.iniciar();
 agora+=27*3600000;
 assert.equal(a.estado().backupAtualEmDia,false);
 await a.encerrar();
});
