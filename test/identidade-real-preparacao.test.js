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
