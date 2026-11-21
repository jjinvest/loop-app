'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {analisarQualificacaoPedidosReal}=
 require('../src/producao/avaliador-qualificacao-pedidos-real');
function banco(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 return db;
}
function estrutura(db){
 db.exec([
  'CREATE TABLE loja_real_pedidos(',
  'pedido_id TEXT PRIMARY KEY,titular_id TEXT,pagamento_id TEXT,',
  'valor_total_centavos INTEGER,status TEXT,criado_em INTEGER);',
  'CREATE TABLE loop_real_eventos_comerciais(',
  'pedido_id TEXT PRIMARY KEY,titular_id TEXT,pagamento_id TEXT,estado TEXT);',
  'CREATE TABLE loop_real_outbox_compra_confirmada(',
  'pedido_id TEXT PRIMARY KEY,titular_id TEXT,pagamento_id TEXT,estado TEXT);',
  'CREATE TABLE loop_real_checkout_reservas_posicoes(',
  'pedido_id TEXT PRIMARY KEY,titular_id TEXT,quantidade INTEGER,estado TEXT);',
  'CREATE TABLE loop_real_motor_compras(',
  'pedido_id TEXT PRIMARY KEY,titular_id TEXT,posicao_id INTEGER);'
 ].join(' '));
}
function pedido(db,{id='P1',status='APROVADO_PARA_EXPEDICAO',
 titular='T1',pg='PAG1',evento=true,outbox=true,reserva=true,
 estadoEvento='AGUARDANDO_CONCILIACAO',estadoOutbox='PENDENTE',
 estadoReserva='RESERVADA',qtd=1,noMotor=false,ts=1}={}){
 db.prepare('INSERT INTO loja_real_pedidos VALUES(?,?,?,?,?,?)')
  .run(id,titular,pg,25000,status,ts);
 if(evento)db.prepare('INSERT INTO loop_real_eventos_comerciais VALUES(?,?,?,?)')
  .run(id,titular,pg,estadoEvento);
 if(outbox)db.prepare('INSERT INTO loop_real_outbox_compra_confirmada VALUES(?,?,?,?)')
  .run(id,titular,pg,estadoOutbox);
 if(reserva)db.prepare('INSERT INTO loop_real_checkout_reservas_posicoes VALUES(?,?,?,?)')
  .run(id,titular,qtd,estadoReserva);
 if(noMotor)db.prepare('INSERT INTO loop_real_motor_compras VALUES(?,?,?)')
  .run(id,titular,1);
}
function consulta(db,config={},limite=200){
 const regras=config.regras||new Map();
 const classification={db,avaliarPedido:({pedidoId})=>{
  if(config.erro&&config.erro===pedidoId)throw Error('SEM_FOTOGRAFIA');
  const regra=regras.get(pedidoId)||{};
  return {pedidoId,totalPosicoesMistasPrevistas:regra.qtd??1,
   itensSemRegraExplicita:regra.semRegra??0,
   eventosEspeciaisNaoHomologados:regra.especial??false};
 }};
 return analisarQualificacaoPedidosReal({banco:db,motorLoop:{banco:db},
  classificacaoLoop:classification,limite});
}
test('sem fontes, não afirma saldo zero nem finge comprador ou PSP',()=>{
 const db=banco();
 try{
  const r=analisarQualificacaoPedidosReal({
   banco:db,motorLoop:{banco:db}
  });
  assert.equal(r.estado,'DEPENDENCIAS_INCOMPLETAS');
  assert.equal(r.totalAprovados,null);
  assert.ok(r.tabelasIndisponiveis.includes('loja_real_pedidos'));
  assert.equal(r.comprovanteBancarioDisponivel,false);
  assert.equal(r.liberacaoAutomatica,false);
  assert.equal(r.posicoesAtivadasPorEstaConsulta,0);
  assert.equal(r.pagamentosExecutados,0);
  assert.throws(()=>analisarQualificacaoPedidosReal({
   banco:db,motorLoop:{banco:banco()}
  }),/QUALIFICACAO_REAL_FONTE_INVALIDA/);
  assert.throws(()=>analisarQualificacaoPedidosReal({
   banco:db,motorLoop:{banco:db},
   classificacaoLoop:{db:banco(),avaliarPedido(){}}
  }),/QUALIFICACAO_REAL_CLASSIFICACAO_DIVERGENTE/);
 }finally{db.close();}
});
test('qualificação aprovada e vaga reservada ainda exigem prova bancária verdadeira',()=>{
 const db=banco();
 try{
  estrutura(db);
  pedido(db);
  db.exec('PRAGMA query_only=ON');
  const r=consulta(db);
  assert.equal(r.estado,'CONFERENCIA_INTERNA_SEM_LIBERACAO_FINANCEIRA');
  assert.equal(r.amostraCompleta,true);
  assert.equal(r.totalAprovados,1);
  assert.equal(r.posicoesPotenciaisNaAmostra,1);
  assert.equal(r.grupos.aguardandoProvaBancaria,1);
  assert.equal(r.financeiroReal,false);
  assert.equal(r.catracaAlterada,false);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM loop_real_motor_compras').get().n,0);
  assert.equal(db.prepare("SELECT estado FROM loop_real_outbox_compra_confirmada").get().estado,'PENDENTE');
 }finally{db.close();}
});
test('diferencia bloqueios, compras cinzas, roxas, estornos, duplicações e amostras parciais',()=>{
 const db=banco();
 try{
  estrutura(db);
  pedido(db,{id:'NO_EVENT',pg:'PSP_NO_EVENT',evento:false,ts:1});
  pedido(db,{id:'MIS',pg:'PSP_MIS',ts:2});
  db.prepare("UPDATE loop_real_eventos_comerciais SET titular_id='T2' WHERE pedido_id='MIS'").run();
  pedido(db,{id:'MOTOR',pg:'PSP_MOTOR',noMotor:true,ts:3});
  pedido(db,{id:'NORULE',pg:'PSP_NORULE',ts:4});
  pedido(db,{id:'GREY',pg:'PSP_GREY',reserva:false,ts:5});
  pedido(db,{id:'PURPLE',pg:'PSP_PURPLE',qtd:2,ts:6});
  pedido(db,{id:'UNRESERVED',pg:'PSP_UNRESERVED',reserva:false,ts:7});
  pedido(db,{id:'REVERSED',pg:'PSP_REVERSED',estadoOutbox:'REVISAO',ts:8});
  pedido(db,{id:'APPROVED',pg:'PSP_APPROVED',ts:9});
  const regras=new Map([
   ['GREY',{qtd:0}],['PURPLE',{qtd:2,especial:true}]
  ]);
  const r=consulta(db,{regras,erro:'NORULE'});
  assert.equal(r.totalAprovados,9);
  assert.equal(r.amostraCompleta,true);
  assert.equal(r.grupos.semEventoOuOutbox,1);
  assert.equal(r.grupos.referenciasDivergentes,1);
  assert.equal(r.grupos.jaNoMotorExigeRevisao,1);
  assert.equal(r.grupos.semRegraAprovada,1);
  assert.equal(r.grupos.naoQualifica,1);
  assert.equal(r.grupos.especialAguardandoRegra,1);
  assert.equal(r.grupos.reservaIncompleta,1);
  assert.equal(r.grupos.cancelamentoOuRevisao,1);
  assert.equal(r.grupos.aguardandoProvaBancaria,1);
  const subset=consulta(db,{regras,erro:'NORULE'},3);
  assert.equal(subset.totalAprovados,9);
  assert.equal(subset.amostra,3);
  assert.equal(subset.amostraCompleta,false);
  assert.equal(Object.values(subset.grupos).reduce((a,b)=>a+b,0),3);
  assert.equal(subset.semDadosPessoais,true);
  assert.ok(!JSON.stringify(r).includes('PSP_APPROVED'));
  assert.ok(!JSON.stringify(r).includes('T1'));
 }finally{db.close();}
});


test('qualificação do pedido real é consulta exclusiva do operador autenticado',async t=>{
 const {randomBytes}=require('node:crypto');
 const {once}=require('node:events');
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
 const db=banco();
 t.after(()=>db.close());
 const versao='LOOP-QUALIFICACAO-TESTE-1';
 const contas=new IdentidadeClienteLoopReal({
  banco:db,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao,texto:'Termos de teste isolado e descartável para conferir a rota protegida da qualificação comercial do LOOP. Nenhum pedido ou dinheiro real será criado neste procedimento.'},
  privacidade:{versao,texto:'Privacidade para o teste descartável da rota de consulta agregada de pedidos, sem exibir titulares, telefones, e-mails, senhas, Pix nem comprovantes reais.'},
  enviarEmail:async()=>true
 });
 const motor=new MotorLoopIntegradoSQLite({banco:db});
 const catalogo=new CatalogoMultiDistribuidoresSQLite({
  banco:db,distribuidorHomologado:()=>false
 });
 const controle=new ControleEconomicoLojaSQLite({banco:db});
 const senha='SenhaOperadorQualificacao2026!MuitoForte';
 const sessoes=new SessaoAdminComercialSQLite({
  banco:db,chaveAdmin:randomBytes(32),credencialAdmin:senha
 });
 const origem='https://contas.example.invalid';
 const app=criarAppIdentidadeLoop({
  contas,motorLoop:motor,origemHttps:origem,permitirCadastro:false,
  adminComercial:{catalogo,controle,sessoes}
 });
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const rota='/api/admin/loop/qualificacao-pedidos';
 assert.equal((await fetch(base+rota)).status,401);
 const login=await fetch(base+'/api/operador/entrar',{
  method:'POST',
  headers:{Origin:origem,'Content-Type':'application/json'},
  body:JSON.stringify({nick:'OPERADOR',senha})
 });
 assert.equal(login.status,200);
 const token=login.headers.get('set-cookie').split(';')[0];
 const res=await fetch(base+rota,{headers:{Cookie:token}});
 assert.equal(res.status,200);
 assert.equal(res.headers.get('cache-control'),'no-store');
 const dados=await res.json();
 assert.equal(dados.estado,'DEPENDENCIAS_INCOMPLETAS');
 assert.equal(dados.somenteLeitura,true);
 assert.equal(dados.semDadosPessoais,true);
 assert.equal(dados.financeiroReal,false);
 assert.equal(dados.liberacaoAutomatica,false);
});
