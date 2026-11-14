'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {once}=require('node:events');
const {conferirInfra,criarServidorPreparacao}=require('../scripts/iniciar-identidade-real-preparacao');
function setup(t){
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-real-setup-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const ambiente={
  NODE_ENV:'production',LOOP_REAL_PREPARACAO_INTERNA:'SIM',
  LOOP_REAL_CADASTRO_GO:'NAO',
  LOOP_REAL_APROVACAO_DOCUMENTOS:'NAO',
  LOOP_REAL_DADOS_SEPARADOS:'SIM',
  LOOP_REAL_SQLITE:path.join(pasta,'clientes.sqlite')
 };
 return {pasta,ambiente};
}
test('volume real isolado aceita prova de escrita e nao armazena dado pessoal',t=>{
 const {pasta,ambiente}=setup(t);
 assert.equal(conferirInfra(ambiente,{pasta}).volumeDedicado,true);
 assert.deepEqual(fs.readdirSync(pasta),[]);
 assert.equal(fs.existsSync(ambiente.LOOP_REAL_SQLITE),false);
});
test('preparacao recusa GO comercial, documentos aprovados e modos de laboratorio',t=>{
 const {pasta,ambiente}=setup(t);
 for(const alteracao of [
  {LOOP_REAL_CADASTRO_GO:'SIM'},
  {LOOP_REAL_CADASTRO_GO:undefined},
  {LOOP_REAL_CADASTRO_GO:'PENDENTE'},
  {LOOP_REAL_APROVACAO_DOCUMENTOS:'SIM'},
  {LOOP_REAL_APROVACAO_DOCUMENTOS:undefined},
  {LOOP_REAL_APROVACAO_DOCUMENTOS:'PENDENTE'},
  {LOOP_REAL_PREPARACAO_INTERNA:'NAO'},
  {LOOP_REAL_DADOS_SEPARADOS:'NAO'},
  {NODE_ENV:'development'},
  {LOOP_CLIENTES_LAB:'SIM'},
  {LOOP_MODO_SIMULACAO:'1'},
  {LOOP_PREVIEW_EXCLUSIVO:'SIM'}
 ]){
  assert.throws(()=>conferirInfra({...ambiente,...alteracao},{pasta}),
   /PREPARACAO_REAL_/);
 }
 assert.throws(()=>conferirInfra({
  ...ambiente,LOOP_REAL_SQLITE:'/tmp/laboratorio.sqlite'
 },{pasta}),/VOLUME_SEPARADO_AUSENTE/);
});
test('infra health 200; readiness, cadastro, login, checkout e admin 503',async t=>{
 const {pasta,ambiente}=setup(t);
 const server=criarServidorPreparacao({pasta,ambiente});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const get=async(rota,opts={})=>{
  const r=await fetch(base+rota,opts);
  return {status:r.status,body:await r.json(),headers:r.headers};
 };
 const health=await get('/healthz');
 assert.equal(health.status,200);
 assert.equal(health.body.volumeDedicado,true);
 assert.equal(health.body.cadastroReal,false);
 assert.equal((await get('/readyz')).status,503);
 for(const rota of [
  '/','/escritorio','/loja','/api/contas/documentos',
  '/api/contas/entrar','/api/loja/catalogo','/api/admin',
  '/api/checkout/finalizar','/api/saques/solicitar'
 ]){
  const resp=await get(rota);
  assert.equal(resp.status,503,rota);
  assert.equal(resp.body.financeiroReal,false);
  assert.equal(resp.headers.get('set-cookie'),null);
 }
 const cadastro=await get('/api/contas/cadastrar',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({nome:'Alguem',email:'email@example.invalid'})
 });
 assert.equal(cadastro.status,503);
 assert.equal(cadastro.body.cadastroReal,false);
 assert.deepEqual(fs.readdirSync(pasta),[]);
});

// Um volume perdido após o boot jamais pode continuar parecendo healthy.
test('healthz falha fechado se o volume real some após inicializar',async t=>{
 const {pasta,ambiente}=setup(t);
 const server=criarServidorPreparacao({pasta,ambiente});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/healthz')).status,200);
 const movida=pasta+'-temporariamente-ausente';
 fs.renameSync(pasta,movida);
 try{
  const resposta=await fetch(base+'/healthz');
  assert.equal(resposta.status,503);
  const json=await resposta.json();
  assert.equal(json.estado,'INFRAESTRUTURA_REAL_INDISPONIVEL');
  assert.equal(json.cadastroReal,false);
  assert.equal(resposta.headers.get('set-cookie'),null);
  assert.equal((await fetch(base+'/readyz')).status,503);
 }finally{fs.renameSync(movida,pasta);}
 assert.equal((await fetch(base+'/healthz')).status,200);
});

test('API privada do tabuleiro nao fabrica vazio quando motor real nao existe',async t=>{
 const {pasta,ambiente}=setup(t);
 ambiente.LOOP_REAL_TABULEIRO_INTERSERVICE_TOKEN='a'.repeat(64);
 const servidor=criarServidorPreparacao({pasta,ambiente});
 servidor.listen(0,'127.0.0.1');await once(servidor,'listening');
 t.after(()=>new Promise(resolve=>servidor.close(resolve)));
 const url='http://127.0.0.1:'+servidor.address().port+'/internal/loop/tabuleiro';
 const anon=await fetch(url);
 assert.equal(anon.status,401);
 const autenticado=await fetch(url,{headers:{
  'x-loop-interservice-token':'a'.repeat(64)}});
 assert.equal(autenticado.status,503);
 assert.equal((await autenticado.json()).erro,'MOTOR_REAL_NAO_ATIVO');
 assert.equal(fs.existsSync(ambiente.LOOP_REAL_SQLITE),false,
  'consulta nao inicializa nem falsifica SQLite real');
});
test('projecao real exige livro de vendas para exibir posicao',t=>{
 const {pasta,ambiente}=setup(t);
 const {DatabaseSync}=require('node:sqlite');
 const {projetarTabuleiroOperacional}=require('../src/producao/leitura-tabuleiro-operacional-real');
 const {SimuladorLoop}=require('../src/domain/simulador-loop');
 const db=new DatabaseSync(ambiente.LOOP_REAL_SQLITE);
 t.after(()=>db.close());
 db.exec("CREATE TABLE loop_real_contas(id TEXT PRIMARY KEY);"+
  "CREATE TABLE loop_real_motor_estado(id INTEGER PRIMARY KEY,snapshot TEXT);"+
  "CREATE TABLE loop_real_motor_compras(posicao_id INTEGER PRIMARY KEY);"+
  "CREATE TABLE loop_real_motor_eventos(chave TEXT PRIMARY KEY);");
 const vazio=projetarTabuleiroOperacional({banco:db});
 assert.equal(vazio.origem,'MOTOR_REAL_SQLITE_DA_IDENTIDADE');
 assert.equal(vazio.tabuleiro.centro,null);
 assert.deepEqual(vazio.tabuleiro.vagas,[null,null,null,null,null,null]);
 const sim=new SimuladorLoop();
 sim.registrarPosicaoSimulada({nome:'Teste não auditado',participanteId:'titular-falso'});
 db.prepare('INSERT INTO loop_real_motor_estado(id,snapshot) VALUES(1,?)')
  .run(JSON.stringify(sim.exportarSnapshot()));
 assert.throws(()=>projetarTabuleiroOperacional({banco:db}),/POSICAO_REAL_SEM_PEDIDO/);
});

test('bootstrap utiliza esquema real, devolve tabuleiro sem compras e bloqueia cadastro',async t=>{
 const {pasta,ambiente}=setup(t);
 ambiente.LOOP_REAL_BOOTSTRAP_MOTOR_INTERNO='SIM';
 ambiente.LOOP_REAL_TABULEIRO_INTERSERVICE_TOKEN='c'.repeat(64);
 ambiente.LOOP_REAL_CHAVE_EMAIL='1'.repeat(64);
 ambiente.LOOP_REAL_CHAVE_CIFRA='2'.repeat(64);
 ambiente.LOOP_REAL_CHAVE_CODIGO='3'.repeat(64);
 const anterior=process.env.NODE_ENV;
 process.env.NODE_ENV='test';
 let servidor;
 try{servidor=criarServidorPreparacao({pasta,ambiente});}
 finally{
  if(anterior===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=anterior;
 }
 servidor.listen(0,'127.0.0.1');await once(servidor,'listening');
 t.after(()=>new Promise(resolve=>servidor.close(resolve)));
 const url='http://127.0.0.1:'+servidor.address().port;
 const resposta=await fetch(url+'/internal/loop/tabuleiro',{headers:{
  'x-loop-interservice-token':'c'.repeat(64)}});
 // O endpoint HTTP recusa volumes temporarios: em producao somente
 // /dados-reais/clientes.sqlite pode fornecer estado operacional.
 assert.equal(resposta.status,503);
 const {projetarTabuleiroOperacional}=
  require('../src/producao/leitura-tabuleiro-operacional-real');
 const {DatabaseSync}=require('node:sqlite');
 const db=new DatabaseSync(ambiente.LOOP_REAL_SQLITE,{readOnly:true});
 const dados=projetarTabuleiroOperacional({banco:db});
 assert.equal(dados.origem,'MOTOR_REAL_SQLITE_DA_IDENTIDADE');
 assert.equal(dados.operacional,true);
 assert.equal(dados.tabuleiro.centro,null);
 assert.deepEqual(dados.tabuleiro.vagas,[null,null,null,null,null,null]);
 assert.deepEqual(dados.filaA,[]);assert.deepEqual(dados.filaB,[]);
 try{
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM loop_real_contas').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM loop_real_motor_compras').get().n,0);
 }finally{db.close();}
 assert.equal((await fetch(url+'/api/contas/cadastrar',{method:'POST'})).status,503);
});

test('livro real: bonus 10% exige verde+PSP, credito unico, consolidacao e Pix por posicao',()=>{
 const {randomUUID}=require('node:crypto');
 const {DatabaseSync}=require('node:sqlite');
 const {LivroFinanceiroRealSQLite}=
  require('../src/producao/livro-financeiro-real-sqlite');
 const db=new DatabaseSync(':memory:');
 try{
  db.exec([
   'PRAGMA foreign_keys=ON;',
   'CREATE TABLE loop_real_contas(id TEXT PRIMARY KEY);',
   'CREATE TABLE loop_real_vinculos_indicacao(',
   'indicado_id TEXT PRIMARY KEY,indicador_id TEXT NOT NULL);',
   'CREATE TABLE loop_real_motor_compras(',
   'pedido_id TEXT PRIMARY KEY,titular_id TEXT NOT NULL,',
   'posicao_id INTEGER NOT NULL UNIQUE,valor_centavos INTEGER NOT NULL);',
   'CREATE TABLE loop_real_motor_qualificacoes(',
   'indicado_id TEXT PRIMARY KEY,indicador_id TEXT NOT NULL,',
   'pedido_id TEXT NOT NULL,posicao_id INTEGER NOT NULL,',
   'evento_id TEXT NOT NULL);',
   'CREATE TABLE loop_real_motor_eventos(chave TEXT PRIMARY KEY,tipo TEXT NOT NULL);'
  ].join(' '));
  const indicador='titular-'+randomUUID();
  const indicado='titular-'+randomUUID();
  const estranho='titular-'+randomUUID();
  const conta=db.prepare('INSERT INTO loop_real_contas(id) VALUES(?)');
  for(const id of [indicador,indicado,estranho])conta.run(id);
  db.prepare('INSERT INTO loop_real_vinculos_indicacao VALUES(?,?)')
   .run(indicado,indicador);
  const compra=db.prepare(
   'INSERT INTO loop_real_motor_compras VALUES(?,?,?,?)');
  compra.run('pedido-indicador-1',indicador,4,25000);
  compra.run('pedido-indicador-2',indicador,5,25000);
  compra.run('pedido-indicado',indicado,7,25000);
  db.prepare('INSERT INTO loop_real_motor_qualificacoes VALUES(?,?,?,?,?)')
   .run(indicado,indicador,'pedido-indicado',4,'i:indicacao0001');
  db.prepare('INSERT INTO loop_real_motor_eventos VALUES(?,?)')
   .run('g:1','GIRO');
  db.prepare('INSERT INTO loop_real_motor_eventos VALUES(?,?)')
   .run('g:2','GIRO');
  const semProvas=new LivroFinanceiroRealSQLite({banco:db});
  assert.throws(()=>semProvas.registrarBonusPorIndicadoVerde({indicadoId:indicado}),
   /FIN_COMPROVACAO_EXTERNA_NAO_HOMOLOGADA/);
  const vazio=semProvas.consultar({titularId:indicador,posicaoId:4});
  assert.equal(vazio.saldosLiberados,false);
  assert.equal(vazio.saldoBonusCentavos,0);
  assert.equal(vazio.saldoTotalPosicoesCentavos,0);
  assert.equal(vazio.saldoPosicaoSelecionadaCentavos,0);
  assert.equal(semProvas.historico({titularId:indicador}).registros.length,0);
  let verde=false;
  const provas={
   confirmarIndicacaoVerde:args=>verde&&args.indicadoId===indicado?
    {ambiente:'PRODUCAO',estado:'PSP_LIQUIDADO_E_INDICADO_VERDE',
     comprovanteId:'liquidacao-real-indicacao'}:null,
   confirmarContemplacao:args=>({
    ambiente:'PRODUCAO',estado:'POSICAO_CONTEMPLADA_E_CAIXA_CONFIRMADO',
    comprovanteId:'centro-psp-'+args.posicaoId
   }),
   confirmarPixPago:args=>({
    ambiente:'PRODUCAO',estado:'PIX_LIQUIDADO_REAL',
    comprovanteId:'pix-pago-'+args.saqueId
   })
  };
  const livro=new LivroFinanceiroRealSQLite({banco:db,provas});
  assert.throws(()=>livro.registrarBonusPorIndicadoVerde({indicadoId:indicado}),
   /FIN_COMPROVANTE_EXTERNO_NAO_CONFIRMADO/);
  assert.equal(livro.consultar({titularId:indicador}).saldoBonusCentavos,0);
  verde=true;
  const bonus=livro.registrarBonusPorIndicadoVerde({indicadoId:indicado});
  assert.equal(bonus.repetido,false);
  assert.equal(livro.registrarBonusPorIndicadoVerde({indicadoId:indicado}).repetido,true);
  assert.equal(livro.consultar({titularId:indicador}).saldoBonusCentavos,2500);
  livro.registrarContemplacaoComprovada({posicaoId:4,giroChave:'g:1'});
  livro.registrarContemplacaoComprovada({posicaoId:5,giroChave:'g:2'});
  assert.equal(livro.registrarContemplacaoComprovada({
   posicaoId:4,giroChave:'g:1'}).repetido,true);
  const completo=livro.consultar({titularId:indicador,posicaoId:4});
  assert.equal(completo.saldoPosicaoSelecionadaCentavos,75000);
  assert.equal(completo.saldoTotalPosicoesCentavos,150000);
  assert.equal(completo.indicadosValidos,1);
  assert.equal(completo.minimoSaqueCentavos,2500);
  assert.equal(completo.taxaSaquePercentual,0);
  assert.equal(completo.posicoes.length,2);
  assert.equal(livro.consultar({titularId:indicador,posicaoId:5})
   .saldoPosicaoSelecionadaCentavos,75000);
  assert.throws(()=>livro.consultar({titularId:estranho,posicaoId:4}),
   /FIN_POSICAO_NAO_PERTENCE_A_TITULAR/);
  assert.equal(livro.consultar({titularId:estranho})
   .saldoTotalPosicoesCentavos,0);
  assert.throws(()=>livro.registrarPixPago({
   saqueId:'saque-maior-que-saldo',titularId:indicador,
   grupo:'POSICAO',valorCentavos:150001}),/FIN_SALDO_INSUFICIENTE/);
  assert.equal(livro.registrarPixPago({
   saqueId:'saque-posicoes-001',titularId:indicador,
   grupo:'POSICAO',valorCentavos:80000}).repetido,false);
  assert.equal(livro.registrarPixPago({
   saqueId:'saque-posicoes-001',titularId:indicador,
   grupo:'POSICAO',valorCentavos:80000}).repetido,true);
  assert.equal(livro.consultar({titularId:indicador,posicaoId:4})
   .saldoPosicaoSelecionadaCentavos,0);
  assert.equal(livro.consultar({titularId:indicador,posicaoId:5})
   .saldoPosicaoSelecionadaCentavos,70000);
  assert.equal(livro.consultar({titularId:indicador})
   .saldoTotalPosicoesCentavos,70000);
  livro.registrarPixPago({saqueId:'saque-bonus-001',
   titularId:indicador,grupo:'BONUS',valorCentavos:2500});
  assert.equal(livro.consultar({titularId:indicador}).saldoBonusCentavos,0);
  assert.throws(()=>livro.registrarPixPago({
   saqueId:'saque-bonus-001',titularId:indicador,
   grupo:'BONUS',valorCentavos:2501}),/FIN_REPLAY_DIVERGENTE/);
  assert.equal(livro.historico({titularId:indicador}).registros.length,6);
  assert.deepEqual(livro.historico({titularId:estranho}).registros,[]);
  assert.equal(livro.verificar().integridade,'OK');
  assert.throws(()=>db.prepare(
   "UPDATE loop_real_fin_lancamentos SET valor_centavos=1 WHERE grupo='BONUS'"
  ).run(),/lancamento imutavel/);
  assert.throws(()=>db.prepare('DELETE FROM loop_real_fin_lancamentos').run(),
   /lancamento imutavel/);
  assert.equal(db.prepare(
   'SELECT COUNT(*) AS n FROM loop_real_fin_saques_pagos'
  ).get().n,2);
 }finally{db.close();}
});

test('qualificacao de ensaio sozinha nao gera credito real nem cria saldo',()=>{
 const {DatabaseSync}=require('node:sqlite');
 const {randomUUID}=require('node:crypto');
 const {LivroFinanceiroRealSQLite}=
  require('../src/producao/livro-financeiro-real-sqlite');
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE loop_real_contas(id TEXT PRIMARY KEY);'+
   'CREATE TABLE loop_real_motor_compras('+
   'pedido_id TEXT PRIMARY KEY,titular_id TEXT,posicao_id INTEGER);'+
   'CREATE TABLE loop_real_motor_qualificacoes(indicado_id TEXT PRIMARY KEY);');
  const dono='titular-'+randomUUID();
  db.prepare('INSERT INTO loop_real_contas VALUES(?)').run(dono);
  const livro=new LivroFinanceiroRealSQLite({banco:db});
  assert.deepEqual(livro.historico({titularId:dono}).registros,[]);
  assert.equal(livro.consultar({titularId:dono}).saldosLiberados,false);
  assert.equal(livro.consultar({titularId:dono}).saldoTotalPosicoesCentavos,0);
 }finally{db.close();}
});
