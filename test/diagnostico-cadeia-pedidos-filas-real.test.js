'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {once}=require('node:events');
const {diagnosticarCadeiaPedidosFilas}=
 require('../src/producao/diagnostico-cadeia-pedidos-filas');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {MotorLoopIntegradoSQLite}=
 require('../src/producao/motor-loop-integrado-sqlite');
const {SessaoAdminComercialSQLite}=
 require('../src/producao/sessao-admin-comercial-sqlite');
const {CatalogoMultiDistribuidoresSQLite}=
 require('../src/producao/catalogo-multidistribuidores-sqlite');
const {ControleEconomicoLojaSQLite}=
 require('../src/producao/controle-economico-loja-sqlite');
const {criarAppIdentidadeLoop}=
 require('../src/producao/servidor-identidade-loop');
const REAL='https://contas.example.invalid';
const CREDENCIAL='SenhaOperadorRealSomenteNoTeste2026!';
function prepararBanco(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON;');
 const contas=new IdentidadeClienteLoopReal({
  banco:db,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TESTE-CADEIA-1',texto:'Termos técnicos para ensaio isolado de auditoria comercial do LOOP 3.0 e AKITEMM. Nenhuma pessoa real compra, recebe posições ou autoriza pagamentos.'},
  privacidade:{versao:'LOOP-TESTE-CADEIA-1',texto:'Política técnica para ensaio isolado no SQLite descartável. Não se acessa nenhum dado verdadeiro de cliente nem se promove saldo financeiro.'},
  enviarEmail:async()=>true
 });
 const motor=new MotorLoopIntegradoSQLite({banco:db});
 return {db,contas,motor};
}
test('diagnóstico não confunde estrutura existente com fluxo financeiro real',()=>{
 const x=prepararBanco();
 try{
  assert.throws(()=>diagnosticarCadeiaPedidosFilas({
   banco:x.db,motorLoop:{banco:new DatabaseSync(':memory:')}
  }),/CADEIA_COMERCIAL_BANCO_DIVERGENTE/);
  const estado=diagnosticarCadeiaPedidosFilas({
   banco:x.db,motorLoop:x.motor
  });
  assert.equal(estado.statusEstrutural,'ETAPAS_PARCIAIS');
  assert.equal(estado.pedidos,null);
  assert.equal(estado.posicoesMotor,0);
  assert.equal(estado.financeiroReal,false);
  assert.equal(estado.podeAtivarPosicoes,false);
  assert.equal(estado.podeCreditar,false);
  assert.equal(estado.podeGirar,false);
  assert.equal(estado.somenteLeitura,true);
  assert.ok(estado.etapasIndisponiveis.includes('loja_real_pedidos'));
 }finally{x.db.close();}
});
test('mostra onde pedidos param e não escreve nem sob SQLite query_only',()=>{
 const x=prepararBanco();
 try{
  x.db.exec([
   'CREATE TABLE loja_real_pedidos(pedido_id TEXT PRIMARY KEY,status TEXT);',
   'CREATE TABLE loop_real_eventos_comerciais(pedido_id TEXT PRIMARY KEY,estado TEXT);',
   'CREATE TABLE loop_real_outbox_compra_confirmada(pedido_id TEXT PRIMARY KEY,estado TEXT);'
  ].join(' '));
  x.db.prepare('INSERT INTO loja_real_pedidos VALUES(?,?)')
   .run('pedidoA','APROVADO_PARA_EXPEDICAO');
  x.db.prepare('INSERT INTO loja_real_pedidos VALUES(?,?)')
   .run('pedidoB','APROVADO_PARA_EXPEDICAO');
  x.db.prepare('INSERT INTO loja_real_pedidos VALUES(?,?)')
   .run('pedidoC','AGUARDANDO_PAGAMENTO');
  x.db.prepare('INSERT INTO loja_real_pedidos VALUES(?,?)')
   .run('pedidoD','CANCELADO');
  x.db.prepare('INSERT INTO loop_real_eventos_comerciais VALUES(?,?)')
   .run('pedidoA','AGUARDANDO_CONCILIACAO');
  x.db.prepare('INSERT INTO loop_real_eventos_comerciais VALUES(?,?)')
   .run('pedidoD','CANCELADO');
  x.db.prepare('INSERT INTO loop_real_outbox_compra_confirmada VALUES(?,?)')
   .run('pedidoA','PENDENTE');
  x.db.prepare('INSERT INTO loop_real_outbox_compra_confirmada VALUES(?,?)')
   .run('pedidoD','CANCELADO');
  x.db.exec('PRAGMA query_only=ON;');
  const estado=diagnosticarCadeiaPedidosFilas({
   banco:x.db,motorLoop:x.motor
  });
  assert.equal(estado.statusEstrutural,'ETAPAS_PRESENTES');
  assert.deepEqual(estado.pedidos,{aguardandoPagamento:1,aprovados:2,cancelados:1});
  assert.deepEqual(estado.eventos,{aguardandoConciliacao:1,cancelados:1});
  assert.deepEqual(estado.outbox,{pendentes:1,processados:0,emRevisao:0,cancelados:1});
  assert.equal(estado.posicoesMotor,0);
  assert.equal(estado.pendencias.aprovadosSemEvento,1);
  assert.equal(estado.pendencias.aprovadosSemOutbox,1);
  assert.equal(estado.pendencias.eventosSemOutbox,0);
  assert.equal(estado.pendencias.pedidosComPosicaoNoMotor,0);
  assert.equal(estado.financeiroReal,false);
  assert.equal(estado.podeAtivarPosicoes,false);
  assert.ok(!JSON.stringify(estado).includes('pedidoA'));
  assert.equal(x.db.prepare('SELECT COUNT(*) n FROM loja_real_pedidos').get().n,4);
 }finally{x.db.close();}
});
test('rota real do diagnóstico só responde ao operador autenticado e não expõe titulares',async t=>{
 const x=prepararBanco();
 t.after(()=>x.db.close());
 const catalogo=new CatalogoMultiDistribuidoresSQLite({
  banco:x.db,distribuidorHomologado:()=>false
 });
 const controle=new ControleEconomicoLojaSQLite({banco:x.db});
 const sessoes=new SessaoAdminComercialSQLite({
  banco:x.db,chaveAdmin:randomBytes(32),credencialAdmin:CREDENCIAL
 });
 const app=criarAppIdentidadeLoop({
  contas:x.contas,motorLoop:x.motor,origemHttps:REAL,permitirCadastro:false,
  adminComercial:{catalogo,controle,sessoes}
 });
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const path='/api/admin/loop/cadeia-comercial';
 assert.equal((await fetch(base+path)).status,401);
 const entrada=await fetch(base+'/api/operador/entrar',{
  method:'POST',headers:{Origin:REAL,'Content-Type':'application/json'},
  body:JSON.stringify({nick:'OPERADOR',senha:CREDENCIAL})
 });
 assert.equal(entrada.status,200);
 const cookie=entrada.headers.get('set-cookie').split(';')[0];
 const resposta=await fetch(base+path,{headers:{Cookie:cookie}});
 assert.equal(resposta.status,200);
 assert.equal(resposta.headers.get('cache-control'),'no-store');
 const dados=await resposta.json();
 assert.equal(dados.somenteLeitura,true);
 assert.equal(dados.semDadosPessoais,true);
 assert.equal(dados.financeiroReal,false);
 assert.equal(dados.podeAtivarPosicoes,false);
 assert.equal(dados.statusEstrutural,'ETAPAS_PARCIAIS');
 assert.equal(dados.posicoesMotor,0);
 assert.ok(!JSON.stringify(dados).includes(CREDENCIAL));
});
