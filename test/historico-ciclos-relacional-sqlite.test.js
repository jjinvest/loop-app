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
const {HistoricoCiclosRelacionalSQLite}=
 require('../src/producao/historico-ciclos-relacional-sqlite');
const {validarIdentidade}=require('../src/producao/backup-identidade-real');
const DOC='Ensaio técnico de persistência e histórico do LOOP 3.0, '+
 'exclusivamente em banco descartável. Não há pessoas, pagamentos, '+
 'saldo, PSP, posições remuneradas, direitos, saque ou dinheiro real.';
const cfg=()=>({
 chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
 chaveCodigo:randomBytes(32),enviarEmail:async()=>true,
 termos:{versao:'LOOP-TERMOS-HISTORICO-2026',texto:DOC},
 privacidade:{versao:'LOOP-PRIV-HISTORICO-2026',texto:DOC}
});
function abrir(file,config){
 const banco=new DatabaseSync(file);
 banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL');
 const contas=new IdentidadeClienteLoopReal({...config,banco});
 const motor=new MotorLoopIntegradoSQLite({banco});
 return {banco,contas,motor};
}
test('ciclos concluídos viram diário append-only com hash e seis eventos cada',async t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-ciclos-hist-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const file=path.join(pasta,'clientes.sqlite'),config=cfg();
 let x=abrir(file,config);
 t.after(()=>{try{x.banco.close();}catch{}});
 const doc=x.contas.documentos(),ids=[];
 for(let i=0;i<12;i++){
  const nick='Ciclo'+String.fromCharCode(65+i);
  const titular=await x.contas.cadastrar({
   nome:'Pessoa de ensaio',nick,email:'ciclo'+i+'@example.invalid',
   senha:'SenhaHistorico2026!',aceiteTermos:true,aceitePrivacidade:true,
   versaoTermos:doc.termos.versao,hashTermos:doc.termos.hash,
   versaoPrivacidade:doc.privacidade.versao,
   hashPrivacidade:doc.privacidade.hash
  });
  ids.push(titular.titularId);
  x.motor.registrarCompraEnsaio({
   titularId:titular.titularId,pedidoId:'pedido-ciclo-'+i
  });
 }
 const hist=x.motor.projecao.historico;
 assert.ok(hist instanceof HistoricoCiclosRelacionalSQLite);
 assert.equal(hist.conferir().totalCiclos,0);
 assert.equal(hist.consultarPagina().ciclos.length,0);
 x.motor.prepararTabuleiroEnsaio();
 x.motor.controlarCatracaEnsaio({acao:'ABRIR'});
 for(let g=0;g<2;g++){
  for(let j=0;j<6;j++){
   const evento=x.motor.registrarEventoEnsaio({
    pedidoId:'pedido-ciclo-'+(g*6+j)
   });
   assert.equal(evento.eventosNoCiclo,j+1);
  }
  assert.equal(x.motor.controlarCatracaEnsaio({acao:'GIRAR'}).girou,true);
  const r=hist.conferir();
  assert.equal(r.totalCiclos,g+1);
  assert.equal(r.totalEventos,(g+1)*6);
 }
 const l=hist.consultarPagina({inicio:1,limite:1});
 assert.equal(l.ciclos.length,1);
 assert.equal(l.ciclos[0].ciclo,1);
 assert.equal(l.ciclos[0].eventos,6);
 assert.equal(l.financeiroReal,false);
 assert.equal(hist.consultarPagina({inicio:2,limite:3}).ciclos[0].ciclo,2);
 const plane=x.banco.prepare([
  'EXPLAIN QUERY PLAN SELECT ciclo FROM loop_real_ciclos_historico',
  'WHERE centro_titular_id=? ORDER BY ciclo LIMIT 20'
 ].join(' ')).all(ids[0]).map(a=>a.detail).join(' ');
 assert.match(plane,/idx_loop_ciclos_por_centro/);
 assert.throws(()=>x.banco.exec(
  "UPDATE loop_real_ciclos_historico SET centro_posicao_id=999 WHERE ciclo=1"
 ),/ciclo imutavel/);
 assert.throws(()=>x.banco.exec(
  "DELETE FROM loop_real_ciclos_historico_eventos WHERE ciclo=1"
 ),/evento de ciclo imutavel/);
 assert.throws(()=>x.banco.exec([
  "INSERT INTO loop_real_ciclos_historico_eventos",
  "(ciclo,ordem,venda_id,destino_previsto)",
  "VALUES(2,1,'e:pedido-ciclo-0','LOOP')"
 ].join(' ')),/UNIQUE constraint failed/);
 assert.equal(validarIdentidade(file).integridade,'ok');
 const linhas=x.banco.prepare([
  'SELECT ciclo,dados_json,sha256 FROM loop_real_ciclos_historico ORDER BY ciclo'
 ].join(' ')).all();
 x.banco.close();x=abrir(file,config);
 assert.deepEqual(x.banco.prepare([
  'SELECT ciclo,dados_json,sha256 FROM loop_real_ciclos_historico ORDER BY ciclo'
 ].join(' ')).all(),linhas);
 assert.deepEqual(x.motor.projecao.historico.conferir(),{
  integridade:'OK',totalCiclos:2,totalEventos:12,
  somenteLeitura:true,financeiroReal:false
 });
 assert.equal(x.motor.verificar().giros,2);
 assert.equal(validarIdentidade(file).integridade,'ok');
 assert.equal(x.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(x.banco.prepare('PRAGMA foreign_key_check').all(),[]);
 // Nem uma alteração encoberta no primeiro ciclo passa na auditoria completa.
 x.banco.exec('DROP TRIGGER loop_ciclos_imutavel_update');
 x.banco.prepare(
  "UPDATE loop_real_ciclos_historico SET dados_json='{}' WHERE ciclo=1"
 ).run();
 assert.throws(()=>x.motor.verificar(),e=>
  e.codigo==='HISTORICO_CICLOS_DIVERGENTE');
 assert.throws(()=>validarIdentidade(file),e=>
  e.codigo==='BACKUP_CICLOS_HISTORICO_DIVERGENTE');
});
test('banco legado sem diário abre e migra histórico sem reescrever o motor',async t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-ciclos-legado-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const file=path.join(pasta,'clientes.sqlite'),config=cfg();
 let x=abrir(file,config);
 t.after(()=>{try{x.banco.close();}catch{}});
 assert.equal(x.motor.projecao.historico.conferir().totalCiclos,0);
 x.banco.exec([
  'DROP TABLE loop_real_ciclos_historico_eventos;',
  'DROP TABLE loop_real_ciclos_historico;',
  'DROP TABLE loop_real_ciclos_historico_meta;'
 ].join(' '));
 assert.equal(validarIdentidade(file).integridade,'ok');
 const before=x.banco.prepare(
  'SELECT revisao,snapshot FROM loop_real_motor_estado WHERE id=1'
 ).get();
 x.banco.close();
 x=abrir(file,config);
 assert.deepEqual(x.banco.prepare(
  'SELECT revisao,snapshot FROM loop_real_motor_estado WHERE id=1'
 ).get(),before);
 assert.equal(x.motor.projecao.historico.conferir().totalCiclos,0);
 assert.equal(validarIdentidade(file).integridade,'ok');
 x.banco.exec('DROP TABLE loop_real_ciclos_historico_eventos;');
 assert.throws(()=>validarIdentidade(file),e=>
  e.codigo==='BACKUP_CICLOS_HISTORICO_INCOMPLETO');
});

test('cinco mil ciclos acumulados ficam indexados e somente novos são gravados',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const h=new HistoricoCiclosRelacionalSQLite({banco:db});
  const sim={tabuleiro:{ciclosConcluidos:[]}};
  db.exec('BEGIN IMMEDIATE');
  h.inicializarEmTransacao({sim});
  db.exec('COMMIT');
  for(let i=0;i<5000;i++){
   const centro={id:i+1,participanteId:'titular-sintetico-'+i};
   sim.tabuleiro.ciclosConcluidos.push({
    ciclo:i+1,centro,concluidoEm:'2030-01-01T00:00:00.000Z',
    vendas:Array.from({length:6},(_,j)=>({
     vendaId:'e:sintetico-'+i+'-'+j,ciclo:i+1,ordem:j+1,
     posicaoCentroId:centro.id,
     destinoPrevisto:j%2?'EMPRESA':'CLIENTE'
    }))
   });
  }
  db.exec('BEGIN IMMEDIATE');
  h.sincronizarEmTransacao({sim});
  db.exec('COMMIT');
  const p=h.consultarPagina({inicio:4976,limite:30});
  assert.equal(p.ciclos.length,25);
  assert.deepEqual(p.ciclos.map(x=>x.ciclo),
   Array.from({length:25},(_,i)=>4976+i));
  const contagens=()=>({
   ciclos:db.prepare(
    'SELECT COUNT(*) AS n FROM loop_real_ciclos_historico'
   ).get().n,
   eventos:db.prepare(
    'SELECT COUNT(*) AS n FROM loop_real_ciclos_historico_eventos'
   ).get().n
  });
  assert.deepEqual(contagens(),{ciclos:5000,eventos:30000});
  db.exec('BEGIN IMMEDIATE');
  h.sincronizarEmTransacao({sim});
  db.exec('COMMIT');
  assert.deepEqual(contagens(),{ciclos:5000,eventos:30000},
   'reprocessar snapshot não regrava nem duplica ciclos');
  assert.equal(h.conferir({sim}).totalCiclos,5000);
  assert.equal(h.conferir({sim}).totalEventos,30000);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{db.close();}
});
