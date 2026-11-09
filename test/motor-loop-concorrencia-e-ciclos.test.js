'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {MotorLoopIntegradoSQLite}=
 require('../src/producao/motor-loop-integrado-sqlite');
const {validarIdentidade}=require('../src/producao/backup-identidade-real');
const TEXTO='Termos de contas fictícias para verificar concorrência, repetição, '+
 'fila, catraca e ciclos sem dinheiro, saques ou fornecedores em produção.';
const worker=[
 "const {DatabaseSync}=require('node:sqlite');",
 "const [mod,file,json,offsetStr]=process.argv.slice(1);",
 "const {MotorLoopIntegradoSQLite}=require(mod);",
 "const db=new DatabaseSync(file);",
 "db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=20000;PRAGMA journal_mode=WAL');",
 "const m=new MotorLoopIntegradoSQLite({banco:db});",
 "const ids=JSON.parse(json),offset=Number(offsetStr);",
 "for(let i=0;i<60;i++){",
 " const titularId=ids[(i+offset*3)%ids.length];",
 " m.registrarCompraEnsaio({titularId,pedidoId:'pedido-'+offset+'-'+i});",
 "}",
 "m.registrarCompraEnsaio({titularId:ids[0],pedidoId:'pedido-compartilhado'});",
 "db.close();"
].join('\n');
function executarWorker(file,ids,n){
 return new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,['-e',worker,
   require.resolve('../src/producao/motor-loop-integrado-sqlite'),
   file,JSON.stringify(ids),String(n)],{stdio:['ignore','pipe','pipe']});
  let saida='';
  p.stderr.on('data',b=>{saida+=b.toString().slice(0,2500);});
  p.on('error',reject);
  p.on('close',c=>c===0?resolve():reject(
   Error('WORKER_SQLITE_'+n+'_FALHOU: '+saida.slice(-2400))
  ));
 });
}
test('dois processos, compra única, 120 eventos e 20 giros no SQLite persistido',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-carga-processos-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'clientes.sqlite');
 const cfg={chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TERMOS-2026',texto:TEXTO},
  privacidade:{versao:'LOOP-PRIV-2026',texto:TEXTO},
  enviarEmail:async()=>true
 };
 let db=new DatabaseSync(file);
 db.exec('PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;PRAGMA busy_timeout=20000');
 const contas=new IdentidadeClienteLoopReal({...cfg,banco:db});
 new MotorLoopIntegradoSQLite({banco:db});
 const documentos=contas.documentos(),ids=[];
 for(let i=0;i<14;i++){
  const nick='Conta'+String.fromCharCode(65+i);
  const c=await contas.cadastrar({
   nome:'Titular de Ensaio',nick,email:'ensaio'+i+'@example.invalid',
   senha:'SenhaDaProva2026!',aceiteTermos:true,aceitePrivacidade:true,
   versaoTermos:documentos.termos.versao,
   hashTermos:documentos.termos.hash,
   versaoPrivacidade:documentos.privacidade.versao,
   hashPrivacidade:documentos.privacidade.hash
  });
  ids.push(c.titularId);
 }
 db.close();
 await Promise.all([executarWorker(file,ids,0),executarWorker(file,ids,1)]);
 db=new DatabaseSync(file);
 db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=20000');
 let motor=new MotorLoopIntegradoSQLite({banco:db});
 assert.equal(motor.verificar().compras,121);
 assert.equal(db.prepare(
  "SELECT COUNT(*) AS n FROM loop_real_motor_compras WHERE pedido_id='pedido-compartilhado'"
 ).get().n,1);
 assert.throws(()=>motor.registrarCompraEnsaio({
  titularId:ids[0],pedidoId:'pedido-capacidade-extra'
 }),/LOOP_MAXIMO_DEZ_POSICOES/);
 motor.prepararTabuleiroEnsaio();
 const eventIds=[];
 for(let n=0;n<2;n++)for(let i=0;i<60;i++)eventIds.push('pedido-'+n+'-'+i);
 for(let i=0;i<eventIds.length;i++){
  assert.equal(motor.registrarEventoEnsaio({
   pedidoId:eventIds[i]
  }).repetida,false);
  if((i+1)%6===0){
   motor.controlarCatracaEnsaio({acao:'ABRIR'});
   const r=motor.controlarCatracaEnsaio({acao:'GIRAR'});
   assert.equal(r.girou,true,'giro '+(i+1)/6);
  }
 }
 assert.equal(motor.verificar().eventos,120);
 assert.equal(motor.verificar().giros,20);
 assert.equal(motor.consultar().tabuleiro.eventosNoCiclo,0);
 assert.equal(motor.registrarEventoEnsaio({pedidoId:eventIds[0]}).repetida,true);
 assert.equal(motor.controlarCatracaEnsaio({acao:'GIRAR'}).girou,false);
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(validarIdentidade(file).integridade,'ok');
 db.close();
 db=new DatabaseSync(file);
 db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL');
 motor=new MotorLoopIntegradoSQLite({banco:db});
 assert.equal(motor.verificar().giros,20);
 assert.equal(motor.verificar().eventos,120);
 assert.equal(motor.consultar().posicoesReais,0);
 assert.equal(motor.consultar().saquesReais,0);
 db.close();
});
