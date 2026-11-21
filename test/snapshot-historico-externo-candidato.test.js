'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {MotorLoopIntegradoSQLite}=
 require('../src/producao/motor-loop-integrado-sqlite');
const {SimuladorLoop}=require('../src/domain/simulador-loop');
const {validarIdentidade}=require('../src/producao/backup-identidade-real');
const {prepararSnapshotCandidato,reconstituirSnapshotCandidato}=
 require('../src/producao/snapshot-historico-externo-candidato');
const DOC='Ensaio de capacidade e recuperação do estado das filas do LOOP. '+
 'Não envolve pessoas reais, valor, bônus, pagamento, saque, comissão ou PSP.';
const config=()=>({
 chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
 chaveCodigo:randomBytes(32),enviarEmail:async()=>true,
 termos:{versao:'LOOP-SNAPSHOT-EXTERNO-2026',texto:DOC},
 privacidade:{versao:'LOOP-PRIV-EXTERNO-2026',texto:DOC}
});
function abrir(arquivo,cfg){
 const banco=new DatabaseSync(arquivo);
 banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL');
 const contas=new IdentidadeClienteLoopReal({...cfg,banco});
 const motor=new MotorLoopIntegradoSQLite({banco});
 return {banco,contas,motor};
}
test('candidato compacto reconstrói o MESMO snapshot após dois giros e reinício',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-snapshot-externo-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const arquivo=path.join(dir,'clientes.sqlite'),cfg=config();
 let x=abrir(arquivo,cfg);
 t.after(()=>{try{x.banco.close();}catch{}});
 const docs=x.contas.documentos();
 for(let i=0;i<12;i++){
  const titular=await x.contas.cadastrar({
   nome:'Pessoa do ensaio',nick:'Candidato'+String.fromCharCode(65+i),
   email:'candidato'+i+'@example.invalid',
   senha:'SenhaSnapshot2026!',aceiteTermos:true,aceitePrivacidade:true,
   versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
   versaoPrivacidade:docs.privacidade.versao,
   hashPrivacidade:docs.privacidade.hash
  });
  x.motor.registrarCompraEnsaio({
   titularId:titular.titularId,pedidoId:'candidato-pedido-'+i
  });
 }
 x.motor.prepararTabuleiroEnsaio();
 x.motor.controlarCatracaEnsaio({acao:'ABRIR'});
 for(let giro=0;giro<2;giro++){
  for(let e=0;e<6;e++)
   assert.equal(x.motor.registrarEventoEnsaio({
    pedidoId:'candidato-pedido-'+(giro*6+e)
   }).eventosNoCiclo,e+1);
  assert.equal(x.motor.controlarCatracaEnsaio({acao:'GIRAR'}).girou,true);
 }
 const antes=x.banco.prepare(
  'SELECT revisao,snapshot FROM loop_real_motor_estado WHERE id=1'
 ).get();
 const entradas=x.banco.prepare([
  'SELECT COUNT(*) AS n FROM loop_real_ciclos_historico_eventos'
 ].join(' ')).get().n;
 const {candidato,bytesOrigem,bytesCandidato,bytesRemovidos}=
  prepararSnapshotCandidato({banco:x.banco});
 assert.equal(candidato.arquivo.totalCiclos,2);
 assert.equal(candidato.arquivo.totalEventos,12);
 assert.equal(candidato.financeiroReal,false);
 assert.ok(bytesOrigem>bytesCandidato);
 assert.ok(bytesRemovidos>0);
 assert.deepEqual(JSON.parse(candidato.estadoSemHistorico)
  .tabuleiro.ciclosConcluidos,[]);
 assert.equal(x.banco.prepare(
  'SELECT revisao,snapshot FROM loop_real_motor_estado WHERE id=1'
 ).get().snapshot,antes.snapshot,'preparação NÃO grava nada no motor');
 assert.equal(x.banco.prepare(
  'SELECT COUNT(*) AS n FROM loop_real_ciclos_historico_eventos'
 ).get().n,entradas,'preparação NÃO cria eventos');
 assert.throws(()=>SimuladorLoop.restaurarSnapshot(candidato),
  /Snapshot LOOP invalido/,'motor antigo NÃO aceita candidato como estado real');
 const ress=reconstituirSnapshotCandidato({banco:x.banco,candidato});
 assert.equal(ress.snapshot,antes.snapshot);
 assert.equal(ress.integridade,'OK');
 assert.equal(ress.totalCiclos,2);
 assert.equal(ress.totalEventos,12);
 assert.equal(x.motor.verificar().giros,2);
 assert.equal(validarIdentidade(arquivo).integridade,'ok');
 x.banco.close();x=abrir(arquivo,cfg);
 const reaproveitado=JSON.parse(JSON.stringify(candidato));
 assert.equal(reconstituirSnapshotCandidato({
  banco:x.banco,candidato:reaproveitado
 }).snapshot,antes.snapshot,'reabre SQLite sem perder ordem nem histórico');
 assert.deepEqual(x.banco.prepare('PRAGMA foreign_key_check').all(),[]);
 const modificado=JSON.parse(JSON.stringify(reaproveitado));
 modificado.estadoSemHistorico=modificado.estadoSemHistorico.replace(
  'LOOP_SIMULADOR_V1','LOOP_SIMULADOR_V0'
 );
 assert.throws(()=>reconstituirSnapshotCandidato({
  banco:x.banco,candidato:modificado
 }),e=>e.codigo==='SNAPSHOT_EXTERNO_FORMATO_INVALIDO');
 const troca=JSON.parse(JSON.stringify(reaproveitado));
 troca.arquivo.ultimoHash='f'.repeat(64);
 assert.throws(()=>reconstituirSnapshotCandidato({
  banco:x.banco,candidato:troca
 }),e=>e.codigo==='SNAPSHOT_EXTERNO_ARQUIVO_DIVERGENTE');
 const trocaFila=JSON.parse(JSON.stringify(reaproveitado));
 const fila=JSON.parse(trocaFila.estadoSemHistorico);
 fila.filas.contadorA=12345;
 trocaFila.estadoSemHistorico=JSON.stringify(fila);
 assert.throws(()=>reconstituirSnapshotCandidato({
  banco:x.banco,candidato:trocaFila
 }),e=>e.codigo==='SNAPSHOT_EXTERNO_ORIGINAL_DIVERGENTE');
 x.motor.controlarCatracaEnsaio({acao:'PAUSAR'});
 assert.throws(()=>reconstituirSnapshotCandidato({
  banco:x.banco,candidato:reaproveitado
 }),e=>e.codigo==='SNAPSHOT_EXTERNO_FONTE_DESATUALIZADA');
 const atualizado=prepararSnapshotCandidato({banco:x.banco}).candidato;
 assert.equal(reconstituirSnapshotCandidato({
  banco:x.banco,candidato:atualizado
 }).snapshot,x.banco.prepare(
  'SELECT snapshot FROM loop_real_motor_estado WHERE id=1'
 ).get().snapshot);
 x.banco.exec('DROP TRIGGER loop_ciclos_imutavel_update');
 x.banco.prepare(
  "UPDATE loop_real_ciclos_historico SET dados_json='{}' WHERE ciclo=1"
 ).run();
 assert.throws(()=>reconstituirSnapshotCandidato({
  banco:x.banco,candidato:atualizado
 }),e=>e.codigo==='SNAPSHOT_EXTERNO_CICLO_DIVERGENTE');
 assert.throws(()=>validarIdentidade(arquivo));
 console.log('SNAPSHOT_EXTERNO_CANDIDATO_PROVADO='+JSON.stringify({
  ciclos:2,eventos:12,bytesOrigem,bytesCandidato,bytesRemovidos,
  alteraBase:false,regraFilaModificada:false,financeiroReal:false
 }));
});
test('sem snapshot ou sem diário, candidata falha fechado e não modifica o banco',t=>{
 const db=new DatabaseSync(':memory:');
 t.after(()=>db.close());
 new IdentidadeClienteLoopReal({...config(),banco:db});
 const motor=new MotorLoopIntegradoSQLite({banco:db});
 assert.throws(()=>prepararSnapshotCandidato({banco:db}),
  e=>e.codigo==='SNAPSHOT_EXTERNO_FONTE_AUSENTE');
 assert.equal(motor.projecao.historico.conferir().totalCiclos,0);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM loop_real_motor_estado')
  .get().n,0);
});
