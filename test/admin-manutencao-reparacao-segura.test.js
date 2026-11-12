'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const token='OperadorManutencaoSeguro_'+('Q'.repeat(46));
async function preparar(t,{sandbox=false}={}){
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;');
 const c=criarAppLojaEscritorioCandidato({
  banco,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  segredoOperador:token,termosVersao:'LAB-manutencao-2026',
  termosTexto:'Ensaio interno de manutenção segura, sem pagar, vender, sacar ou gerar crédito real.',
  ...(sandbox?{webhookHomologacaoToken:'ManutencaoWebhook_'+('P'.repeat(46)),
   operacoesSandboxAutorizadas:true,
   provedorReconsultaSandbox:{
    ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
    async consultarCobranca(){throw Error('NAO_CONSULTAR_PSP_NO_GET')}
   }}:{})
 });
 const server=c.app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(async()=>{
  await new Promise(ok=>server.close(ok));
  banco.close();
 });
 const url='http://127.0.0.1:'+server.address().port;
 const obter=async({autorizacao='Bearer '+token,method='GET',
  route='/staging/escritorio-unificado/manutencao/diagnostico'}={})=>{
  const r=await fetch(url+route,{method,headers:{
   Authorization:autorizacao,'Cache-Control':'no-store'
  }});
  const tipo=r.headers.get('content-type')||'';
  return {status:r.status,body:tipo.includes('application/json')?await r.json():null,
   headers:r.headers};
 };
 return {obter,banco,url};
}
test('diagnostico no painel exige operador, nao escreve nem libera financeiro',async t=>{
 const {obter,banco}=await preparar(t);
 const antes=banco.prepare('SELECT total_changes() AS n').get().n;
 assert.equal((await obter({autorizacao:''})).status,401);
 assert.equal((await obter({autorizacao:'Bearer senha-visitante'})).status,401);
 assert.equal((await obter({method:'POST'})).status,401);
 // Rota de escrita inexistente permanece bloqueada antes de chegar ao banco.
 const r=await obter();
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal(r.headers.get('cache-control'),'no-store');
 assert.equal(r.body.consultaSomenteLeitura,true);
 assert.equal(r.body.pspReconsultadoNestaLeitura,false);
 assert.equal(r.body.escritasExecutadas,0);
 assert.equal(r.body.financeiroReal,false);
 assert.equal(r.body.integridade.sqliteOk,true);
 assert.equal(r.body.integridade.fksInconsistentes,0);
 assert.equal(r.body.integridade.titularesInconsistentes,0);
 assert.equal(r.body.integridade.pspInconsistentes,0);
 assert.equal(r.body.integridade.motorSnapshotValidado,false);
 assert.equal(r.body.integridade.motorAindaNaoIniciado,true);
 assert.equal(r.body.acoesPermitidas.editarRegistroFinanceiroDiretamente,false);
 assert.equal(r.body.acoesPermitidas.liberarPagamentosReais,false);
 assert.equal(r.body.acoesPermitidas.conciliarSandbox,false);
 assert.equal(r.body.estado,'MOTOR_AGUARDANDO_PRIMEIRO_USO');
 assert.equal(r.body.pendenciasConciliaveis,null);
 assert.equal(banco.prepare('SELECT total_changes() AS n').get().n,antes);
});
test('sob carga concorrente de 144 leituras admin, SQLite e motor seguem imutaveis',async t=>{
 const {obter,banco}=await preparar(t,{sandbox:true});
 const initial=banco.prepare('SELECT total_changes() AS n').get().n;
 for(let lote=0;lote<9;lote++){
  const xs=await Promise.all(Array.from({length:16},
   ()=>obter()));
  assert.equal(xs.length,16);
  for(const r of xs){
   assert.equal(r.status,200,JSON.stringify(r.body));
   assert.equal(r.body.estado,'MOTOR_AGUARDANDO_PRIMEIRO_USO');
   assert.equal(r.body.pendenciasConciliaveis,0);
   assert.equal(r.body.webhooksEmQuarentena,0);
   assert.equal(r.body.financeiroReal,false);
   assert.equal(r.body.integridade.sqliteOk,true);
   assert.equal(r.body.integridade.motorAindaNaoIniciado,true);
  }
 }
 assert.equal(banco.prepare('SELECT total_changes() AS n').get().n,
  initial,'144 GET nao podem mutar posicoes ou financeiro');
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.equal(banco.prepare('PRAGMA foreign_key_check').all().length,0);
});
test('snapshot semanticamente adulterado bloqueia reparo apesar do SQLite íntegro',async t=>{
 const {obter,banco}=await preparar(t,{sandbox:true});
 banco.prepare([
  'INSERT INTO akitemm_motor_conta_ensaio_estado',
  '(id,revisao,snapshot,atualizado_em) VALUES(1,1,?,?)'
 ].join(' ')).run('{not-json',Date.now());
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 const antes=banco.prepare('SELECT total_changes() AS n').get().n;
 const r=await obter();
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal(r.body.estado,'BLOQUEADO_INTEGRIDADE');
 assert.ok(r.body.divergencias.includes('MOTOR_INTEGRIDADE'));
 assert.equal(r.body.acoesPermitidas.conciliarSandbox,false);
 assert.equal(r.body.acoesPermitidas.editarRegistroFinanceiroDiretamente,false);
 assert.equal(r.body.integridade.sqliteOk,true);
 assert.equal(r.body.integridade.motorSnapshotValidado,false);
 assert.equal(banco.prepare('SELECT total_changes() AS n').get().n,antes);
});
test('mesmo painel traz diagnostico e acao protegida que reaproveita conciliacao',()=>{
 const html=readFileSync(path.resolve(__dirname,
  '../src/candidato/escritorio-admin-candidato-ui.html'),'utf8');
 const js=readFileSync(path.resolve(__dirname,
  '../src/candidato/escritorio-admin-candidato-ui.js'),'utf8');
 for(const id of ['manutencaoDiagnosticar','manutencaoEstado',
  'manutencaoMetricas','manutencaoConfirmarSandbox',
  'manutencaoRepararSandbox','manutencaoCriarMissao'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(js,/api\('\/manutencao\/diagnostico'\)/);
 assert.match(js,/reconciliarPendentesPsp'\)\.click\(\)/);
 assert.match(js,/manutencaoConfirmarSandbox'\)\.checked/);
 assert.match(js,/diagnosticoManutencao\?\.acoesPermitidas/);
 assert.match(js,/\$\('departamento'\)\.value='SEGURANCA'/);
 assert.match(html,/reparação segura/i);
 assert.doesNotMatch(js,/fetch\([^\n]*\/api\/pagamentos\/criar/);
});


test('historico operacional sem snapshot bloqueia a manutencao mesmo com SQLite integro',async t=>{
 const {obter,banco}=await preparar(t,{sandbox:true});
 // Simula perda seletiva do snapshot: uma operacao duravel continua no
 // mesmo SQLite, mas nao houve pedido/lote/dourada para denunciar a perda.
 banco.prepare([
  'INSERT INTO akitemm_motor_conta_ensaio_operacoes',
  '(tipo,prepedido_id,titular_id,numero_posicao,criado_em)',
  "VALUES('ALTERAR_AGENDA',NULL,NULL,NULL,?)"
 ].join(' ')).run(Date.now());
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM akitemm_motor_ensaio_lotes_pedido').get().n,0);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
 const antes=banco.prepare('SELECT total_changes() AS n').get().n;
 const r=await obter();
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal(r.body.estado,'BLOQUEADO_INTEGRIDADE');
 assert.ok(r.body.divergencias.includes('MOTOR_INTEGRIDADE'));
 assert.equal(r.body.acoesPermitidas.conciliarSandbox,false);
 assert.equal(r.body.integridade.motorAindaNaoIniciado,false);
 assert.equal(banco.prepare('SELECT total_changes() AS n').get().n,antes);
});

test('auditoria percorre reservas numerosas sem carregar toda tabela no heap',()=>{
 const {auditarIntegridadeMotorCandidato}=
  require('../src/domain/auditoria-integridade-motor-candidato-sqlite');
 const db=new DatabaseSync(':memory:');
 try{
  db.exec([
   'CREATE TABLE akitemm_motor_conta_ensaio_estado(id INTEGER,revisao INTEGER,snapshot TEXT);',
   'CREATE TABLE akitemm_motor_conta_ensaio_operacoes(tipo TEXT,prepedido_id TEXT,titular_id TEXT,numero_posicao INTEGER);',
   'CREATE TABLE akitemm_motor_ensaio_lotes_pedido(prepedido_id TEXT,titular_id TEXT,numero_posicao INTEGER,ordinal INTEGER);',
   'CREATE TABLE akitemm_motor_ensaio_aceites_posicao(numero_posicao INTEGER,prepedido_id TEXT,titular_id TEXT);',
   'CREATE TABLE akitemm_checkout_prepedidos_staging(prepedido_id TEXT PRIMARY KEY,titular_id TEXT);',
   'CREATE TABLE akitemm_conta_unica_candidata(id TEXT PRIMARY KEY);',
   'CREATE TABLE akitemm_prepedido_asaas_sandbox_staging(prepedido_id TEXT PRIMARY KEY,titular_id TEXT);',
   'CREATE TABLE akitemm_vitrine_fotografia_classificacao_prepedido(prepedido_id TEXT PRIMARY KEY,titular_id TEXT,fotografia_json TEXT);',
   'CREATE TABLE akitemm_prepedido_asaas_reserva_posicoes_staging(prepedido_id TEXT PRIMARY KEY,titular_id TEXT,posicoes_previstas INTEGER,posicoes_reservadas INTEGER,modalidade TEXT);'
  ].join(' '));
  const cliente=db.prepare('INSERT INTO akitemm_conta_unica_candidata(id) VALUES(?)');
  const pedido=db.prepare('INSERT INTO akitemm_checkout_prepedidos_staging VALUES(?,?)');
  const psp=db.prepare('INSERT INTO akitemm_prepedido_asaas_sandbox_staging VALUES(?,?)');
  const foto=db.prepare('INSERT INTO akitemm_vitrine_fotografia_classificacao_prepedido VALUES(?,?,?)');
  const reserva=db.prepare('INSERT INTO akitemm_prepedido_asaas_reserva_posicoes_staging VALUES(?,?,?,?,?)');
  db.exec('BEGIN IMMEDIATE');
  for(let i=0;i<1250;i++){
   const id='p'+i,titular='t'+i;
   cliente.run(titular);pedido.run(id,titular);psp.run(id,titular);
   foto.run(id,titular,JSON.stringify({
    prepedidoId:id,titularId:titular,
    planejamentoPosicoes:{quantidadePosicoesPrevistas:1}
   }));
   reserva.run(id,titular,1,1,'COM_POSICOES');
  }
  db.exec('COMMIT');
  const banco={
   prepare(sql){
    const st=db.prepare(sql);
    if(!sql.includes('SELECT v.prepedido_id AS pedidoId'))return st;
    // Um auditor que usar all() nesta consulta falha explicitamente;
    // o teste exige cursor SQLite, inclusive em base acima de mil itens.
    return new Proxy(st,{get(target,prop){
     if(prop==='all')return ()=>{throw Error('AUDITORIA_CARREGA_TUDO_NO_HEAP');};
     const valor=Reflect.get(target,prop,target);
     return typeof valor==='function'?valor.bind(target):valor;
    }});
   }
  };
  const antes=db.prepare('SELECT total_changes() AS n').get().n;
  const r=auditarIntegridadeMotorCandidato({banco,exigirMotor:true});
  assert.equal(r.reservasAuditadas,1250);
  assert.equal(r.snapshotValidado,false);
  assert.equal(r.totalInconsistencias,0);
  assert.equal(db.prepare('SELECT total_changes() AS n').get().n,antes);
 }finally{db.close();}
});
