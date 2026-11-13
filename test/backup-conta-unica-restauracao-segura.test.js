'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {randomUUID,randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {cotarCheckoutPublico}=require('../src/domain/cotacao-checkout-publico');
const {criarBackupCriptografado,restaurarBackupCriptografado}=
 require('../scripts/backup-criptografado-checkout-staging');
const {COOKIE}=require('../src/domain/conta-unica-candidata-sqlite');
const {auditarIntegridadeMotorCandidato}=
 require('../src/domain/auditoria-integridade-motor-candidato-sqlite');

const SENHA_BACKUP='EnsaioSeguroDeRestauração_2026_ChaveNãoProdutiva_123456';
const SENHA_CONTA='SenhaLaboratorioDeRestauração2026!';
const TERMOS='Termos exclusivamente fictícios para teste de recuperação, sem pagamento ou benefícios reais.';
const operator='OperadorBackupSomenteEnsaio_'+('X'.repeat(42));
const termsVersion='LAB-backup-conta-2026';
function paths(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-dr-unificado-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 return {origem:path.join(dir,'checkout.sqlite'),
  backup:path.join(dir,'checkout.loopbak'),
  restaurado:path.join(dir,'isolado.sqlite')};
}
function config(db,keys,capture=[]){
 return {banco:db,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:keys.email,chaveCifra:keys.cifra,
  chaveProvaEmail:keys.provaEmail,
  enviarEmailDeVerificacao:async msg=>{capture.push(msg);return true;},
  ...(keys.recuperacao?{
   chaveRecuperacao:keys.recuperacao,
   enviarRecuperacao:async msg=>{capture.push(msg);return true;}
  }:{}),
  segredoOperador:operator,termosVersao:termsVersion,termosTexto:TERMOS};
}
async function cadastrar(contas,nick){
 return contas.cadastrar({nome:nick+' Exemplo',nick,
  email:nick.toLowerCase()+'@example.invalid',senha:SENHA_CONTA,
  aceiteExplicito:true,termosVersao:termsVersion,termosTexto:TERMOS});
}
test('restauração isolada preserva titular/pedido, mas REVOCA cookies e códigos antigos',async t=>{
 const a=paths(t);
 const keys={email:randomBytes(32),cifra:randomBytes(32),
  provaEmail:randomBytes(32),recuperacao:randomBytes(32)};
 const db=new DatabaseSync(a.origem);
 db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000');
 const capturados=[];
 const app=criarAppLojaEscritorioCandidato(config(db,keys,capturados));
 const alice=await cadastrar(app.contas,'Alice');
 const bia=await cadastrar(app.contas,'Bia');
 const sessao=await app.contas.entrar({nick:'Alice',senha:SENHA_CONTA});
 const cookieReq={get:name=>name==='cookie'?COOKIE+'='+sessao.token:undefined};
 assert.equal(app.contas.sessao(cookieReq).titularId,alice.titularId);
 await app.provasEmail.solicitar({titularId:alice.titularId,autorizado:true});
 assert.equal(capturados.length,1);
 await app.contas.solicitarRecuperacao({email:'alice@example.invalid'});
 assert.equal(capturados.length,2);
 const codigoAnteriorAoBackup=capturados[1].codigo;
 const entrada={itens:[{produtoId:'curso-homologacao-250',quantidade:1}]};
 const catalogo=catalogoFicticioCheckout();
 const cotacao=await cotarCheckoutPublico({repositorio:catalogo,entrada});
 const pedido=app.intencoes.criar({titularId:alice.titularId,
  chaveIdempotencia:'restaurar-titular-unico-2026-01',entrada,cotacao});
 const pre=await app.prePedidos.preparar({titularId:alice.titularId,
  rascunhoId:pedido.intencao.pedidoId,repositorioCatalogo:catalogo});
 const snapshot=await criarBackupCriptografado({
  origem:a.origem,destino:a.backup,senha:SENHA_BACKUP,autorizado:true
 });
 assert.equal(snapshot.fonteIntegra,true);
 assert.equal(fs.statSync(a.backup).mode&0o777,0o600);
 assert.equal(fs.readFileSync(a.backup).includes(Buffer.from('alice@example.invalid')),false);
 // Simular escrita após snapshot; não deve existir no ponto de recuperação.
 const depois=await cadastrar(app.contas,'Carla');
 const resultado=await restaurarBackupCriptografado({
  origem:a.backup,destino:a.restaurado,senha:SENHA_BACKUP,autorizado:true
 });
 assert.equal(resultado.integridadeSQLite,'ok');
 assert.equal(resultado.identidadeCandidataAuditada,true);
 assert.equal(resultado.sessoesCandidatasRevogadas,1);
 assert.equal(resultado.provasEmailPendentesInvalidadas,1);
 assert.equal(resultado.codigosRecuperacaoSenhaInvalidados,1);
 const rdb=new DatabaseSync(a.restaurado);
 rdb.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000');
 try{
  const recovered=criarAppLojaEscritorioCandidato(config(rdb,keys));
  assert.equal(recovered.integridade.auditar().totalInconsistencias,0);
  assert.equal(recovered.contas.sessao(cookieReq),null,
   'sessão antiga não pode renascer após desastre');
  assert.equal(recovered.contas.perfil(alice.titularId).nick,'Alice');
  assert.equal(recovered.contas.perfil(bia.titularId).nick,'Bia');
  assert.equal(recovered.contas.perfil(depois.titularId),null,
   'não pode prometer RPO zero quando novo cadastro ocorreu após snapshot');
  assert.equal(recovered.prePedidos.consultar({
   titularId:alice.titularId,prepedidoId:pre.prepedido.prepedidoId
  }).totalCentavos,25000);
  assert.equal(recovered.prePedidos.consultar({
   titularId:bia.titularId,prepedidoId:pre.prepedido.prepedidoId
  }),null);
  assert.equal(rdb.prepare('SELECT estado FROM akitemm_candidato_email_desafios')
   .get().estado,'BLOQUEADO');
  assert.equal(rdb.prepare([
   'SELECT estado FROM akitemm_recuperacao_senha_candidata',
   'ORDER BY criado_em DESC LIMIT 1'
  ].join(' ')).get().estado,'BLOQUEADO');
  await assert.rejects(recovered.contas.confirmarRecuperacao({
   email:'alice@example.invalid',
   codigo:codigoAnteriorAoBackup,novaSenha:'SenhaRestauradaNova2026!'
  }),{codigo:'RECUPERACAO_CODIGO_OU_SENHA_INVALIDOS'});
  assert.throws(()=>recovered.provasEmail.confirmar({
   titularId:alice.titularId,codigo:capturados[0].codigo,autorizado:true
  }),/PROVA_EMAIL_EXPIRADA_OU_INVALIDA/);
  const novoLogin=await recovered.contas.entrar({nick:'ALICE',senha:SENHA_CONTA});
  assert.equal(novoLogin.titularId,alice.titularId);
  assert.notEqual(novoLogin.token,sessao.token);
  assert.equal(rdb.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(rdb.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{rdb.close();db.close();}
});
test('backup recusa corrupção semântica do titular que SQLite FK isolada não detectaria',async t=>{
 const a=paths(t);
 const keys={email:randomBytes(32),cifra:randomBytes(32),provaEmail:randomBytes(32)};
 const db=new DatabaseSync(a.origem);
 db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL');
 const app=criarAppLojaEscritorioCandidato(config(db,keys));
 await cadastrar(app.contas,'Marta');
 db.exec('DROP TRIGGER candidato_integridade_rascunho_insert');
 db.prepare([
  'INSERT INTO akitemm_checkout_intencoes_preparacao',
  '(pedido_id,titular_id,chave_hash,itens_canonicos_json,',
  'cotacao_json,total_centavos,estado,criado_em)',
  "VALUES(?,?,?,?,?,25000,'RASCUNHO_SEM_COBRANCA',?)"
 ].join(' ')).run('pre-'+randomUUID(),'titular-'+randomUUID(),
  'a'.repeat(64),'[]','{}',new Date().toISOString());
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0,
  'sem FK explícita o banco seria considerado válido superficialmente');
 await assert.rejects(criarBackupCriptografado({
  origem:a.origem,destino:a.backup,senha:SENHA_BACKUP,autorizado:true
 }),{codigo:'BACKUP_CANDIDATO_TITULAR_DIVERGENTE'});
 assert.equal(fs.existsSync(a.backup),false);
 db.close();
});

test('backup rejeita entrega PSP forjada mesmo com SQLite e titular coerentes',async t=>{
 const a=paths(t);
 const keys={email:randomBytes(32),cifra:randomBytes(32),provaEmail:randomBytes(32)};
 const db=new DatabaseSync(a.origem);
 db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL');
 try{
  const app=criarAppLojaEscritorioCandidato(config(db,keys));
  const pessoa=await cadastrar(app.contas,'Julia');
  const entrada={itens:[{produtoId:'curso-homologacao-250',quantidade:1}]};
  const catalogo=catalogoFicticioCheckout();
  const cotacao=await cotarCheckoutPublico({repositorio:catalogo,entrada});
  const rascunho=app.intencoes.criar({titularId:pessoa.titularId,
   chaveIdempotencia:'backup-forja-entrega-2026',entrada,cotacao});
  const preparado=await app.prePedidos.preparar({titularId:pessoa.titularId,
   rascunhoId:rascunho.intencao.pedidoId,repositorioCatalogo:catalogo});
  const id=preparado.prepedido.prepedidoId;
  const foto=JSON.parse(db.prepare(
   'SELECT fotografia_json FROM akitemm_checkout_prepedidos_staging WHERE prepedido_id=?'
  ).get(id).fotografia_json);
  const item=foto[0];
  // FK integro: a entrega existe para um pre-pedido real do mesmo titular.
  // O elo PSP, porem, foi inventado e nenhuma cobranca foi conciliada.
  db.prepare([
   'INSERT INTO akitemm_prepedido_entregas_sandbox_staging',
   '(prepedido_id,produto_id,titular_id,tipo,quantidade,valor_centavos,',
   'pagamento_id,estado,criado_em)',
   "VALUES(?,?,?,?,?,?,?,'APTA_SIMULADA_SEM_ENTREGA',?)"
  ].join(' ')).run(id,item.produtoId,pessoa.titularId,item.tipo,item.quantidade,
   item.subtotalCentavos,'pay_SEM_CONCILIACAO',new Date().toISOString());
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(app.integridade.auditar().totalInconsistencias,0,
   'titularidade isolada nao percebe entrega sem lastro PSP');
  await assert.rejects(criarBackupCriptografado({
   origem:a.origem,destino:a.backup,senha:SENHA_BACKUP,autorizado:true
  }),{codigo:'BACKUP_CANDIDATO_RELACOES_PSP_DIVERGENTES'});
  assert.equal(fs.existsSync(a.backup),false);
 }finally{db.close();}
});

test('backup offsite recusa snapshot e lote do motor incoerentes',async t=>{
 const a=paths(t);
 const keys={email:randomBytes(32),cifra:randomBytes(32),
  provaEmail:randomBytes(32)};
 const db=new DatabaseSync(a.origem);
 db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;');
 t.after(()=>db.close());
 criarAppLojaEscritorioCandidato(config(db,keys));
 db.prepare([
  'INSERT INTO akitemm_motor_conta_ensaio_estado',
  '(id,revisao,snapshot,atualizado_em) VALUES(1,1,?,?)'
 ].join(' ')).run('{"formato":"FORJADO"}',Date.now());
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 await assert.rejects(criarBackupCriptografado({
  origem:a.origem,destino:a.backup,senha:SENHA_BACKUP,autorizado:true
 }),{codigo:'BACKUP_CANDIDATO_MOTOR_DIVERGENTE'});
 assert.equal(fs.existsSync(a.backup),false,'nao deve produzir copia aprovada');
 db.prepare('DELETE FROM akitemm_motor_conta_ensaio_estado').run();
 db.prepare([
  'INSERT INTO akitemm_motor_ensaio_lotes_pedido',
  '(prepedido_id,ordinal,titular_id,numero_posicao) VALUES(?,?,?,?)'
 ].join(' ')).run('hom-00000000-0000-4000-8000-000000000000',
  1,'titular-00000000-0000-4000-8000-000000000000',99999);
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 await assert.rejects(criarBackupCriptografado({
  origem:a.origem,destino:a.backup,senha:SENHA_BACKUP,autorizado:true
 }),{codigo:'BACKUP_CANDIDATO_MOTOR_DIVERGENTE'});
 assert.equal(fs.existsSync(a.backup),false);
});

test('backup bloqueia reserva adulterada de compra e fotografia original',async t=>{
 const a=paths(t);
 const keys={email:randomBytes(32),cifra:randomBytes(32),
  provaEmail:randomBytes(32)};
 const db=new DatabaseSync(a.origem);
 db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;');
 t.after(()=>db.close());
 const app=criarAppLojaEscritorioCandidato(config(db,keys));
 const pessoa=await cadastrar(app.contas,'Reserva');
 await app.sinalizacaoVitrine.atualizar('curso-homologacao-250',{
  classificacao:'VERDE',quantidadeMinimaLoop:1,revisaoEsperada:0
 });
 const catalogo=catalogoFicticioCheckout();
 const entrada={itens:[{produtoId:'curso-homologacao-250',quantidade:1}]};
 const cotacao=await cotarCheckoutPublico({repositorio:catalogo,entrada});
 const draft=app.intencoes.criar({
  titularId:pessoa.titularId,
  chaveIdempotencia:'backup-reserva-indelevel-2026',
  entrada,cotacao
 });
 const pre=await app.prePedidos.preparar({
  titularId:pessoa.titularId,
  rascunhoId:draft.intencao.pedidoId,
  repositorioCatalogo:catalogo
 });
 const pid=pre.prepedido.prepedidoId;
 app.ponte.preparar({
  titularId:pessoa.titularId,prepedidoId:pid,
  clienteAsaasId:'cus_RespaldoReserva2026',
  capacidade:{quantidadePosicoes:1,consultarAtivas:()=>0}
 });
 assert.equal(auditarIntegridadeMotorCandidato({
  banco:db,exigirMotor:true
 }).reservasAuditadas,1);
 const base='UPDATE akitemm_prepedido_asaas_reserva_posicoes_staging';
 const executar=sql=>db.prepare(base+' SET '+sql+' WHERE prepedido_id=?');
 const rejeitar=async codigo=>{
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.throws(()=>auditarIntegridadeMotorCandidato({
   banco:db,exigirMotor:true
  }),{codigo});
  await assert.rejects(criarBackupCriptografado({
   origem:a.origem,destino:a.backup,
   senha:SENHA_BACKUP,autorizado:true
  }),{codigo:'BACKUP_CANDIDATO_MOTOR_DIVERGENTE'});
  assert.equal(fs.existsSync(a.backup),false,
   'backup offsite nao pode certificar o pedido adulterado');
 };
 executar('posicoes_reservadas=0').run(pid);
 await rejeitar('MOTOR_SQLITE_RESERVAS_INCONSISTENTES');
 executar('posicoes_reservadas=1').run(pid);
 executar('titular_id=?').run('titular-'+randomUUID(),pid);
 await rejeitar('MOTOR_SQLITE_RESERVAS_TITULAR_DIVERGENTE');
 executar('titular_id=?').run(pessoa.titularId,pid);
 executar('posicoes_previstas=2').run(pid);
 await rejeitar('MOTOR_SQLITE_RESERVA_FOTOGRAFIA_DIVERGENTE');
 executar('posicoes_previstas=1').run(pid);
 assert.equal(auditarIntegridadeMotorCandidato({
  banco:db,exigirMotor:true
 }).reservasAuditadas,1);
 const backupValido=await criarBackupCriptografado({
  origem:a.origem,destino:a.backup,
  senha:SENHA_BACKUP,autorizado:true
 });
 assert.equal(backupValido.fonteIntegra,true,
  'snapshot legitimo deve continuar recuperavel apos restaurar os vinculos');
 assert.ok(fs.statSync(a.backup).size>100);
});
