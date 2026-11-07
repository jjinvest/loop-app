'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {criarAgendadorBackupIdentidadeReal}=
 require('../src/producao/agendador-backup-identidade-real');
const OK={estado:'OFFSITE_REAL_IDENTIDADE_CIFRADO_BAIXADO_RESTAURADO',
 copiaExternaConfirmada:true,restauracaoIsoladaConfirmada:true};
test('primeiro cadastro real depende de upload, GET e restauração comprovados',async()=>{
 let agora=1_800_000_000_000,timer=null,agendamentos=0;
 const a=criarAgendadorBackupIdentidadeReal({
  executar:async()=>OK,
  agora:()=>agora,
  agendar:fn=>{agendamentos++;timer=fn;return {unref(){}}},
  cancelar:()=>{timer=null}
 });
 assert.equal(a.estado().backupAtualEmDia,false);
 await a.iniciar();
 assert.equal(a.estado().backupAtualEmDia,true);
 assert.equal(a.estado().contagemCopiasVerificadas,1);
 assert.equal(a.estado().backupFinanceiroConfirmado,false);
 await a.iniciar();
 assert.equal(agendamentos,1,'não criar timers duplicados');
 assert.ok(timer);
 agora+=26*60*60*1000+1;
 assert.equal(a.estado().backupAtualEmDia,false,
  'backup histórico não substitui cópia recente');
 timer();
 await a.executarUmaVez();
 assert.equal(a.estado().backupAtualEmDia,true);
 await a.encerrar();
 assert.equal(timer,null);
 await assert.rejects(a.executarUmaVez(),
  {codigo:'AGENDADOR_IDENTIDADE_REAL_ENCERRADO'});
});
test('erro posterior suspende prontidão sem apagar evidência de restauração anterior',async()=>{
 let falhar=false;
 const a=criarAgendadorBackupIdentidadeReal({
  executar:async()=>falhar?
   {estado:'OFFSITE_IDENTIDADE_REQUER_VERIFICACAO'}:OK,
  agendar:()=>({unref(){}}),cancelar:()=>{}
 });
 await a.iniciar();
 assert.equal(a.estado().backupAtualEmDia,true);
 falhar=true;
 const resposta=await a.executarUmaVez();
 assert.equal(resposta.copiaExternaConfirmada,false);
 assert.equal(a.estado().backupAtualEmDia,false);
 assert.equal(a.estado().ultimaTentativaFalhou,true);
 assert.equal(a.estado().contagemCopiasVerificadas,1);
 assert.equal(a.estado().contagemFalhas,1);
 await a.encerrar();
});
test('backup inicial sem GET e restauração aborta GO antes de abrir serviço',async()=>{
 let timerFoiCriado=false;
 const a=criarAgendadorBackupIdentidadeReal({
  executar:async()=>({estado:'OFFSITE_REAL_IDENTIDADE_CIFRADO_BAIXADO_RESTAURADO',
   copiaExternaConfirmada:true,restauracaoIsoladaConfirmada:false}),
  agendar:()=>{timerFoiCriado=true;return null},
  cancelar:()=>{}
 });
 await assert.rejects(a.iniciar(),
  {codigo:'BACKUP_OFFSITE_REAL_AINDA_NAO_PROVADO'});
 assert.equal(timerFoiCriado,false);
 assert.equal(a.estado().backupAtualEmDia,false);
 await a.encerrar();
});

test('GO real não abre cadastro com GET e restore sem prova das chaves',async()=>{
 let timerCriado=false;
 const agendador=criarAgendadorBackupIdentidadeReal({
  exigirProvaChaves:true,executar:async()=>OK,
  agendar:()=>{timerCriado=true;return {};},cancelar:()=>{}
 });
 await assert.rejects(agendador.iniciar(),
  {codigo:'BACKUP_OFFSITE_REAL_AINDA_NAO_PROVADO'});
 assert.equal(timerCriado,false);
 assert.equal(agendador.estado().chavesDeLeituraVerificadas,false);
 await agendador.encerrar();
 let falhar=false;
 const b=criarAgendadorBackupIdentidadeReal({
  exigirProvaChaves:true,
  executar:async()=>falhar?OK:{...OK,chavesDeLeituraVerificadas:true},
  agendar:()=>({unref(){}}),cancelar:()=>{}
 });
 await b.iniciar();
 assert.equal(b.estado().backupAtualEmDia,true);
 assert.equal(b.estado().chavesDeLeituraVerificadas,true);
 falhar=true;
 await b.executarUmaVez();
 assert.equal(b.estado().backupAtualEmDia,false);
 assert.equal(b.estado().chavesDeLeituraVerificadas,false);
 await b.encerrar();
});
