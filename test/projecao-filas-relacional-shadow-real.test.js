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
const {ProjecaoFilasRelacionalSQLite}=
 require('../src/producao/projecao-filas-relacional-sqlite');
const {validarIdentidade}=require('../src/producao/backup-identidade-real');
const DOC='Termos de auditoria de persistencia da fila em banco descartavel, '+
 'sem uso comercial. Nao representa dinheiro, operacoes financeiras, '+
 'beneficios, ganhos, PSP, fornecedores, saque ou compra real.';

test('espelho relacional preserva filas e tabuleiro após alterações e reinício',async t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-filas-relacionais-'));
 const arquivo=path.join(pasta,'dados.sqlite');
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const cfg={
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),enviarEmail:async()=>true,
  termos:{versao:'LOOP-TERMOS-RELACIONAL-2026',texto:DOC},
  privacidade:{versao:'LOOP-PRIV-RELACIONAL-2026',texto:DOC}
 };
 const abrir=()=>{
  const banco=new DatabaseSync(arquivo);
  banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL');
  const contas=new IdentidadeClienteLoopReal({...cfg,banco});
  const motor=new MotorLoopIntegradoSQLite({banco});
  return {banco,contas,motor};
 };
 let env=abrir();
 t.after(()=>{try{env.banco.close()}catch{}});
 const docs=env.contas.documentos(),pessoas=[];
 for(let i=0;i<8;i++){
  const nick='Cliente'+String.fromCharCode(65+i);
  const p=await env.contas.cadastrar({
   nome:'Titular do ensaio',nick,email:'titular'+i+'@example.invalid',
   ...(i===1?{indicadorNick:'ClienteA'}:{}),
   senha:'SenhaLongevidade2026!',aceiteTermos:true,aceitePrivacidade:true,
   versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
   versaoPrivacidade:docs.privacidade.versao,
   hashPrivacidade:docs.privacidade.hash
  });
  pessoas.push(p);
  env.motor.registrarCompraEnsaio({
   titularId:p.titularId,pedidoId:'compra-espelho-'+i,valorCentavos:25000
  });
 }
 const espelho=env.motor.projecao;
 assert.ok(espelho instanceof ProjecaoFilasRelacionalSQLite);
 assert.equal(espelho.conferir().totalPosicoes,8);
 const filaB=espelho.consultarFila({fila:'B'});
 assert.deepEqual(filaB.itens.map(p=>p.numero),[1,2,3,4,5,6,7,8]);
 assert.equal(filaB.financeiroReal,false);
 const p2=espelho.consultarFila({fila:'B',limite:3});
 assert.deepEqual(p2.itens.map(x=>x.ordem),[1,2,3]);
 assert.equal(p2.proximaOrdem,3);
 const p3=espelho.consultarFila({fila:'B',aposOrdem:p2.proximaOrdem,limite:3});
 assert.deepEqual(p3.itens.map(x=>x.ordem),[4,5,6]);
 const p4=espelho.consultarFila({fila:'B',aposOrdem:p3.proximaOrdem,limite:3});
 assert.deepEqual(p4.itens.map(x=>x.ordem),[7,8]);
 assert.equal(p4.proximaOrdem,null);
 assert.throws(()=>espelho.consultarFila({fila:'B',aposOrdem:3,offset:1}),
  {codigo:'FILA_PROJECAO_PAGINACAO_INVALIDA'});

 const plano=env.banco.prepare([
  'EXPLAIN QUERY PLAN SELECT posicao_id FROM',
  'loop_real_filas_projecao_posicoes',
  "WHERE local='B' ORDER BY ordem LIMIT 30"
 ] .join(' ')).all().map(x=>x.detail).join('; ');
 assert.match(plano,/idx_loop_projecao_fila_ordem/);
 env.motor.registrarIndicacaoEnsaio({
  indicadorId:pessoas[0].titularId,indicadoId:pessoas[1].titularId,
  posicaoId:1,pedidoIndicado:'compra-espelho-1',eventoId:'convite-espelho'
 });
 assert.equal(espelho.conferir().totalPosicoes,8);
 assert.deepEqual(espelho.consultarFila({fila:'A'}).itens.map(p=>p.numero),[1]);
 const antes=env.banco.prepare(
  'SELECT revisao,snapshot FROM loop_real_motor_estado WHERE id=1'
 ).get();
 env.banco.prepare([
  "UPDATE loop_real_filas_projecao_posicoes SET ordem=99",
  "WHERE local='A' AND posicao_id=1"
 ].join(' ')).run();
 assert.throws(()=>env.motor.verificar(),e=>
  e.codigo==='FILA_PROJECAO_POSICOES_DIVERGENTES');
 assert.throws(()=>env.motor.registrarCompraEnsaio({
  titularId:pessoas[0].titularId,pedidoId:'compra-nao-registrada'
 }),e=>e.codigo==='FILA_PROJECAO_POSICOES_DIVERGENTES');
 assert.deepEqual(env.banco.prepare(
  'SELECT revisao,snapshot FROM loop_real_motor_estado WHERE id=1'
 ).get(),antes,'divergencia aborta sem modificar fila nem revisao');
 assert.equal(env.banco.prepare(
  "SELECT 1 FROM loop_real_motor_compras WHERE pedido_id='compra-nao-registrada'"
 ).get(),undefined);
 assert.throws(()=>validarIdentidade(arquivo),e=>
  e.codigo==='BACKUP_FILA_PROJECAO_DIVERGENTE');
 env.banco.prepare(
  "UPDATE loop_real_filas_projecao_posicoes SET ordem=1 WHERE posicao_id=1"
 ).run();
 assert.equal(espelho.conferir().integridade,'OK');
 env.motor.prepararTabuleiroEnsaio();
 assert.equal(espelho.conferir().totalPosicoes,8);
 assert.equal(env.motor.verificar().compras,8);
 assert.equal(validarIdentidade(arquivo).integridade,'ok');
 const antesReinicio=env.banco.prepare([
  'SELECT posicao_id,participante_id,fila,local,ordem',
  'FROM loop_real_filas_projecao_posicoes ORDER BY posicao_id'
 ].join(' ')).all();
 env.banco.close();
 env=abrir();
 const depoisReinicio=env.banco.prepare([
  'SELECT posicao_id,participante_id,fila,local,ordem',
  'FROM loop_real_filas_projecao_posicoes ORDER BY posicao_id'
 ].join(' ')).all();
 assert.deepEqual(depoisReinicio,antesReinicio);
 assert.equal(env.motor.projecao.conferir().integridade,'OK');
 assert.deepEqual(env.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('backup histórico sem espelho permanece válido e ganha projeção aditiva',async t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-filas-legadas-'));
 const arquivo=path.join(pasta,'dados.sqlite');
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const cfg={
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),enviarEmail:async()=>true,
  termos:{versao:'LOOP-TERMOS-FILAS-ANTIGAS',texto:DOC},
  privacidade:{versao:'LOOP-PRIV-FILAS-ANTIGAS',texto:DOC}
 };
 let db=new DatabaseSync(arquivo);
 db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL');
 new IdentidadeClienteLoopReal({...cfg,banco:db});
 let motor=new MotorLoopIntegradoSQLite({banco:db});
 assert.equal(motor.projecao.conferir().totalPosicoes,0);
 db.exec([
  'DROP TABLE loop_real_filas_projecao_posicoes;',
  'DROP TABLE loop_real_filas_projecao_meta;'
 ].join(' '));
 assert.equal(validarIdentidade(arquivo).integridade,'ok',
  'backup de antes da projeção continua restaurável');
 db.close();
 db=new DatabaseSync(arquivo);
 try{
  db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL');
  new IdentidadeClienteLoopReal({...cfg,banco:db});
  motor=new MotorLoopIntegradoSQLite({banco:db});
  assert.equal(motor.projecao.conferir().totalPosicoes,0);
  assert.equal(validarIdentidade(arquivo).integridade,'ok');
  db.exec('DROP TABLE loop_real_filas_projecao_posicoes;');
  assert.throws(()=>validarIdentidade(arquivo),e=>
   e.codigo==='BACKUP_FILA_PROJECAO_INCOMPLETA');
 }finally{db.close();}
});
