'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {once}=require('node:events');
const {criarAppLojaEscritorioCandidato}=require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=require('../src/laboratorio/servidor-checkout-staging-local');
const {ComunicadosCanaisAdminSQLite}=require('../src/domain/comunicados-canais-admin-sqlite');
const ADMIN='admin-recados-'+('A'.repeat(55));
const dados=(canal,estado='RASCUNHO',formato='RECADO')=>({
 canal,estado,formato,titulo:'Aviso para '+canal,corpo:'Mensagem exclusiva para '+canal
});
test('SQLite separa avisos AKITEMM e LOOP, conserva revisoes e historico',()=>{
 const banco=new DatabaseSync(':memory:');
 try{
  const repo=new ComunicadosCanaisAdminSQLite({banco});
  const loja=repo.criar(dados('AKITEMM'));
  const loop=repo.criar(dados('LOOP'));
  assert.equal(repo.listar({canal:'AKITEMM'}).length,1);
  assert.equal(repo.listar({canal:'LOOP'}).length,1);
  assert.equal(repo.listar({canal:'AKITEMM',publicados:true}).length,0);
  assert.throws(()=>repo.criar(dados('LOOP','PUBLICADO')),e=>e.codigo==='COMUNICADO_CRIACAO_EXIGE_RASCUNHO');
  const publicado=repo.atualizar({id:loja.id,revisaoEsperada:1,dados:dados('AKITEMM','PUBLICADO','BANNER')});
  assert.equal(publicado.revisao,2);
  assert.equal(repo.listar({canal:'AKITEMM',publicados:true})[0].formato,'BANNER');
  assert.deepEqual(repo.listar({canal:'LOOP',publicados:true}),[]);
  assert.throws(()=>repo.atualizar({id:loja.id,revisaoEsperada:2,
   dados:dados('LOOP','PUBLICADO')}),e=>e.codigo==='COMUNICADO_CANAL_IMUTAVEL');
  assert.throws(()=>repo.atualizar({id:loja.id,revisaoEsperada:1,
   dados:dados('AKITEMM','ARQUIVADO')}),e=>e.codigo==='COMUNICADO_CONFLITO_REVISAO');
  assert.equal(repo.consultar(loja.id).canal,'AKITEMM');
  assert.equal(repo.consultar(loop.id).canal,'LOOP');
  assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM akitemm_comunicados_auditoria_lab').get().n,3);
  const novamente=new ComunicadosCanaisAdminSQLite({banco});
  assert.equal(novamente.listar({canal:'AKITEMM',publicados:true})[0].id,loja.id);
 }finally{banco.close();}
});
test('rotas privadas de operador publicam e os sininhos mantem os canais separados',async t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON;');
 const ctx=criarAppLojaEscritorioCandidato({
  banco,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  segredoOperador:ADMIN,termosVersao:'LAB-comunicados-2026',
  termosTexto:'Ensaios do painel editorial. Nenhuma compra ou cobrança comercial.'
 });
 const srv=ctx.app.listen(0,'127.0.0.1');await once(srv,'listening');
 t.after(async()=>{await new Promise(resolve=>srv.close(resolve));banco.close();});
 const base='http://127.0.0.1:'+srv.address().port;
 async function call(rota,{method='GET',auth=false,body}={}){
  const r=await fetch(base+rota,{method,headers:{
   ...(auth?{Authorization:'Bearer '+ADMIN}:{}),
   ...(body?{'Content-Type':'application/json'}:{})
  },body:body?JSON.stringify(body):undefined});
  return {status:r.status,data:await r.json()};
 }
 const uri='/staging/escritorio-unificado/comunicados';
 assert.equal((await call(uri)).status,401);
 assert.equal((await call('/staging/contas/avisos-loop')).status,401);
 assert.deepEqual((await call('/staging/vitrine/loja/comunicados')).data.itens,[]);
 const a=await call(uri,{method:'POST',auth:true,body:dados('AKITEMM')});
 assert.equal(a.status,201,JSON.stringify(a.data));
 const b=await call(uri,{method:'POST',auth:true,body:dados('LOOP')});
 assert.equal(b.status,201,JSON.stringify(b.data));
 assert.equal((await call(uri,{auth:true})).data.itens.length,2);
 assert.equal((await call('/staging/vitrine/loja/comunicados')).data.itens.length,0);
 const pub=await call(uri+'/'+a.data.id,{method:'PATCH',auth:true,
  body:{revisaoEsperada:1,dados:dados('AKITEMM','PUBLICADO','BANNER')}});
 assert.equal(pub.status,200,JSON.stringify(pub.data));
 const avisos=await call('/staging/vitrine/loja/comunicados');
 assert.equal(avisos.status,200);
 assert.equal(avisos.data.canal,'AKITEMM');
 assert.deepEqual(avisos.data.itens.map(x=>x.canal),['AKITEMM']);
 assert.equal(avisos.data.itens[0].formato,'BANNER');
 assert.equal((await call(uri+'/'+a.data.id,{method:'PATCH',auth:false,
  body:{revisaoEsperada:2,dados:dados('AKITEMM','ARQUIVADO')}})).status,401);
 assert.equal((await call(uri+'/'+a.data.id,{method:'PATCH',auth:true,
  body:{revisaoEsperada:2,dados:dados('LOOP','PUBLICADO')}})).status,400);
 assert.equal((await call('/staging/contas/avisos-loop')).status,401);
 assert.equal((await call('/staging/vitrine/loja/comunicados')).data.itens.length,1);
 const rev=await call(uri+'/'+a.data.id,{method:'PATCH',auth:true,
  body:{revisaoEsperada:2,dados:dados('AKITEMM','ARQUIVADO')}});
 assert.equal(rev.status,200);
 assert.equal((await call('/staging/vitrine/loja/comunicados')).data.itens.length,0);
});
test('administrador por abas mantém um único painel e os mesmos IDs funcionais',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../src/candidato/escritorio-admin-candidato-ui.html'),'utf8');
 const js=fs.readFileSync(path.resolve(__dirname,'../src/candidato/escritorio-admin-candidato-ui.js'),'utf8');
 const loja=fs.readFileSync(path.resolve(__dirname,'../src/laboratorio/loja-cliente-demo.html'),'utf8');
 const loop=fs.readFileSync(path.resolve(__dirname,'../src/candidato/checkout-candidato-ui.html'),'utf8');
 for(const id of ['abasServicosAdmin','conteudoServicosAdmin','formComunicadoAdmin','comunicadoCanalAdmin',
   'comunicadoFormatoAdmin','comunicadoTituloAdmin','comunicadoCorpoAdmin','comunicadoEstadoAdmin',
   'listaComunicadosAdmin','formProduto','reconsultar','formAgendaMotor','formCriarDouradaAdmin',
   'formConfigLojaAdmin','criarMissao']){
  assert.match(html,new RegExp('id="'+id+'"'),id);
 }
 for(const titulo of ['Produtos e cursos','Mensagens e banners','Pedidos e clientes','Financeiro',
   'Motor e filas','Missões e manutenção','Configurações e fotos'])
  assert.ok(js.includes(titulo));
 assert.match(js,/function selecionarAbaAdmin/);
 assert.match(js,/section\.matches\('section\.painel'\)/);
 assert.match(js,/comunicadoAdminEditando/);
 assert.match(loja,/id="akitemmAbrirConta"/);
 assert.match(loja,/id="akitemmSino"/);
 assert.match(loop,/id="loop03Sino"/);
 assert.match(loop,/id="loop03PainelAvisos"/);
});
