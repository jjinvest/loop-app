'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {MotorLoopIntegradoSQLite}=
 require('../src/producao/motor-loop-integrado-sqlite');
const {lerEstadoMotor}=require('../src/producao/estado-motor-unificado-sqlite');
const {criarAgendadorBackupIdentidadeReal}=
 require('../src/producao/agendador-backup-identidade-real');
const {migrarHistoricoV2Protegido}=
 require('../src/producao/migracao-historico-v2-protegida');
const DOC='Ensaio descartável de migração sem cliente, pagamento, giro, '+
 'crédito, saldo ou direito real de recompensa.';
const cfg={
 chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
 chaveCodigo:randomBytes(32),enviarEmail:async()=>true,
 termos:{versao:'LOOP-MIGRACAO-HISTORICO-2026',texto:DOC},
 privacidade:{versao:'LOOP-PRIV-MIGRACAO-2026',texto:DOC}
};
test('ativação V2 exige backup externo antes e depois e inicia motor vazio sem dinheiro',async t=>{
 const banco=new DatabaseSync(':memory:');t.after(()=>banco.close());
 new IdentidadeClienteLoopReal({...cfg,banco});
 const motor=new MotorLoopIntegradoSQLite({banco});
 let copias=0,canceladas=0;
 const agendador=criarAgendadorBackupIdentidadeReal({
  exigirProvaChaves:true,
  executar:async()=>{
   copias++;
   return {estado:'OFFSITE_REAL_IDENTIDADE_CIFRADO_BAIXADO_RESTAURADO',
    copiaExternaConfirmada:true,restauracaoIsoladaConfirmada:true,
    chavesDeLeituraVerificadas:true};
  },
  agendar:()=>({unref(){}}),cancelar:()=>{canceladas++;}
 });
 t.after(async()=>agendador.encerrar());
 assert.equal(lerEstadoMotor(banco),null);
 await assert.rejects(()=>migrarHistoricoV2Protegido({
  motor,agendador,autorizacaoInterna:true
 }),e=>e.codigo==='HISTORICO_V2_BACKUP_ANTES_NAO_COMPROVADO');
 assert.equal(lerEstadoMotor(banco),null);
 await agendador.iniciar();
 await assert.rejects(()=>migrarHistoricoV2Protegido({
  motor,agendador,autorizacaoInterna:false
 }),e=>e.codigo==='HISTORICO_V2_AUTORIZACAO_INVALIDA');
 assert.equal(lerEstadoMotor(banco),null);
 const r=await migrarHistoricoV2Protegido({
  motor,agendador,autorizacaoInterna:true
 });
 assert.equal(copias,2);
 assert.equal(r.formato,'V2');
 assert.equal(r.repetida,false);
 assert.equal(r.ciclos,0);
 assert.equal(r.backupsAntesDepoisRestaurados,true);
 assert.equal(r.financeiroReal,false);
 assert.equal(r.semMovimento,true);
 assert.equal(lerEstadoMotor(banco).formato,'V2');
 assert.equal(motor.projecao.conferir().totalPosicoes,0);
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM loop_real_motor_compras').get().n,0);
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM loop_real_motor_eventos').get().n,0);
 const outro=await migrarHistoricoV2Protegido({
  motor,agendador,autorizacaoInterna:true
 });
 assert.equal(outro.repetida,true);
 assert.equal(copias,3);
 assert.equal(motor.verificar().giros,0);
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('falha na segunda cópia não declara migração concluída',async t=>{
 const banco=new DatabaseSync(':memory:');t.after(()=>banco.close());
 new IdentidadeClienteLoopReal({...cfg,banco});
 const motor=new MotorLoopIntegradoSQLite({banco});
 let tentativas=0;
 const agendador=criarAgendadorBackupIdentidadeReal({
  exigirProvaChaves:true,
  executar:async()=>{
   tentativas++;
   return {estado:'OFFSITE_REAL_IDENTIDADE_CIFRADO_BAIXADO_RESTAURADO',
    copiaExternaConfirmada:tentativas===1,
    restauracaoIsoladaConfirmada:tentativas===1,
    chavesDeLeituraVerificadas:tentativas===1};
  },
  agendar:()=>({unref(){}}),cancelar:()=>{}
 });
 t.after(async()=>agendador.encerrar());
 await agendador.iniciar();
 await assert.rejects(()=>migrarHistoricoV2Protegido({
  motor,agendador,autorizacaoInterna:true
 }),e=>e.codigo==='HISTORICO_V2_BACKUP_DEPOIS_NAO_COMPROVADO');
 assert.equal(lerEstadoMotor(banco).formato,'V2',
  'alteração local é reconhecível, mas servidor não declara prontidão');
 assert.equal(agendador.estado().backupAtualEmDia,false);
});
