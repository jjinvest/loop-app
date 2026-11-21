'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {MotorLoopIntegradoSQLite}=
 require('../src/producao/motor-loop-integrado-sqlite');
const {lerEstadoMotor,gravarEstadoMotor}=
 require('../src/producao/estado-motor-unificado-sqlite');
const {validarIdentidade}=require('../src/producao/backup-identidade-real');
const DOC='Ensaio descartável de migração de histórico, base de cadastro, '+
 'ordem das filas e catraca. Não existe pagamento, repasse, saldo, '+
 'direito a recompensa, fornecedor ou saque real.';
function config(){
 return {
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),enviarEmail:async()=>true,
  termos:{versao:'LOOP-ESTADO-UNIFICADO-2026',texto:DOC},
  privacidade:{versao:'LOOP-PRIV-UNIFICADO-2026',texto:DOC}
 };
}
function abrir(file,cfg){
 const banco=new DatabaseSync(file);
 banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL');
 const contas=new IdentidadeClienteLoopReal({...cfg,banco});
 const motor=new MotorLoopIntegradoSQLite({banco});
 return {banco,contas,motor};
}
test('V1 migra atomicamente para V2; V2 restaura, gira e registra novas posições',async t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-motor-v2-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const file=path.join(pasta,'cadastros.sqlite'),cfg=config();
 let env=abrir(file,cfg);
 t.after(()=>{try{env.banco.close();}catch{}});
 const ids=[],docs=env.contas.documentos();
 for(let i=0;i<19;i++){
  const titular=await env.contas.cadastrar({
   nome:'Registro técnico',nick:'Usuario'+String.fromCharCode(65+i),
   email:'usuario-v2-'+i+'@example.invalid',
   senha:'SenhaCapacidade2026!',aceiteTermos:true,aceitePrivacidade:true,
   versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
   versaoPrivacidade:docs.privacidade.versao,
   hashPrivacidade:docs.privacidade.hash
  });
  ids.push(titular.titularId);
  if(i<18)env.motor.registrarCompraEnsaio({
   titularId:titular.titularId,pedidoId:'v2-pedido-'+i
  });
 }
 env.motor.prepararTabuleiroEnsaio();
 env.motor.controlarCatracaEnsaio({acao:'ABRIR'});
 for(let g=0;g<2;g++){
  for(let e=0;e<6;e++)env.motor.registrarEventoEnsaio({
   pedidoId:'v2-pedido-'+(g*6+e)
  });
  assert.equal(env.motor.controlarCatracaEnsaio({acao:'GIRAR'}).girou,true);
 }
 const antes=lerEstadoMotor(env.banco),totais=env.motor.verificar();
 assert.equal(antes.formato,'V1');
 assert.equal(totais.giros,2);
 assert.equal(JSON.parse(antes.snapshot).tabuleiro.ciclosConcluidos.length,2);
 const first=env.motor.migrarHistoricoExterno();
 assert.equal(first.formato,'V2');
 assert.equal(first.repetida,false);
 assert.equal(first.ciclos,2);
 const second=env.motor.migrarHistoricoExterno();
 assert.equal(second.repetida,true);
 const agora=lerEstadoMotor(env.banco);
 assert.equal(agora.formato,'V2');
 assert.equal(agora.snapshot,antes.snapshot,'JSON lógico V1 idêntico');
 const gravado=JSON.parse(agora.persistido);
 assert.deepEqual(gravado.tabuleiro.ciclosConcluidos,[]);
 assert.equal(gravado.historicoRelacionalV2.totalCiclos,2);
 assert.ok(agora.persistido.length<antes.snapshot.length);
 assert.equal(env.motor.verificar().giros,2);
 assert.equal(validarIdentidade(file).integridade,'ok');
 const afterProjection=env.motor.projecao.conferir();
 assert.equal(afterProjection.totalPosicoes,env.motor.consultar().filaA+
  env.motor.consultar().filaB+7);
 env.banco.close();env=abrir(file,cfg);
 assert.equal(lerEstadoMotor(env.banco).snapshot,antes.snapshot);
 assert.equal(env.motor.migrarHistoricoExterno().repetida,true);
 const compra=env.motor.registrarCompraEnsaio({
  titularId:ids[18],pedidoId:'v2-nova-compra'
 });
 assert.equal(compra.repetida,false);
 for(let e=12;e<18;e++){
  const a=env.motor.registrarEventoEnsaio({pedidoId:'v2-pedido-'+e});
  assert.equal(a.eventosNoCiclo,e-11);
 }
 assert.equal(env.motor.controlarCatracaEnsaio({acao:'GIRAR'}).girou,true);
 const apos=lerEstadoMotor(env.banco);
 assert.equal(apos.formato,'V2','a escrita não volta para V1');
 assert.equal(JSON.parse(apos.persistido).tabuleiro.ciclosConcluidos.length,0);
 assert.equal(JSON.parse(apos.snapshot).tabuleiro.ciclosConcluidos.length,3);
 assert.equal(env.motor.verificar().giros,3);
 assert.equal(env.motor.projecao.historico.conferir().totalEventos,18);
 assert.equal(validarIdentidade(file).integridade,'ok');
 assert.deepEqual(env.banco.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(env.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 const pre=env.banco.prepare(
  'SELECT revisao,snapshot FROM loop_real_motor_estado WHERE id=1'
 ).get();
 env.banco.exec('BEGIN IMMEDIATE');
 try{
  assert.throws(()=>gravarEstadoMotor(env.banco,{
   anterior:lerEstadoMotor(env.banco),snapshot:'{"formato":"FORJADO"}'
  }),e=>e.codigo==='ESTADO_MOTOR_SNAPSHOT_INVALIDO');
 }finally{env.banco.exec('ROLLBACK');}
 assert.deepEqual(env.banco.prepare(
  'SELECT revisao,snapshot FROM loop_real_motor_estado WHERE id=1'
 ).get(),pre,'falha não escreve no banco');
 env.banco.exec('DROP TRIGGER loop_ciclos_imutavel_update');
 env.banco.prepare(
  "UPDATE loop_real_ciclos_historico SET dados_json='{}' WHERE ciclo=1"
 ).run();
 assert.throws(()=>lerEstadoMotor(env.banco),
  e=>e.codigo==='ESTADO_MOTOR_V2_CICLO_INVALIDO');
 assert.throws(()=>env.motor.registrarCompraEnsaio({
  titularId:ids[18],pedidoId:'v2-compra-apos-corrupcao'
 }),e=>e.codigo==='ESTADO_MOTOR_V2_CICLO_INVALIDO');
 assert.equal(env.banco.prepare(
  "SELECT COUNT(*) AS n FROM loop_real_motor_compras WHERE pedido_id='v2-compra-apos-corrupcao'"
 ).get().n,0);
});
test('estado V1 permanece compatível, inclusive sem arquivo de histórico',async t=>{
 const banco=new DatabaseSync(':memory:');t.after(()=>banco.close());
 new IdentidadeClienteLoopReal({...config(),banco});
 const motor=new MotorLoopIntegradoSQLite({banco});
 assert.equal(lerEstadoMotor(banco),null);
 assert.equal(motor.verificar().compras,0);
 assert.equal(motor.projecao.conferir().totalPosicoes,0);
});
