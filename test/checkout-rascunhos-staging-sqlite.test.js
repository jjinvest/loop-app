'use strict';
// Exercita contrato de preparacao que NAO e montado no servidor publico.
// Contas, autenticacao e CSRF abaixo sao fixtures locais, nao credenciais reais.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const express=require('express');
const {RepositorioCatalogoMemoria}=require('../src/domain/repositorio-catalogo-memoria');
const {IntencoesCheckoutSQLite}=require('../src/domain/intencoes-checkout-sqlite');
const {criarRouterRascunhosCheckoutStaging}=require('../src/routes/rascunhos-checkout-staging');
const {cotarCheckoutPublico}=require('../src/domain/cotacao-checkout-publico');
function produto(id,preco=25000){
 return {id,nome:'Curso de teste '+id,tipo:'PDF',estado:'PUBLICADO',
  descricao:'Somente laboratorio isolado de pedido',precoCentavos:preco,
  entrega:'DOWNLOAD_APOS_CONFIRMACAO',fotos:[],videoApresentacaoUrl:null,detalhes:[]};
}
async function abrir(t){
 const pasta=mkdtempSync(path.join(tmpdir(),'loop-rascunhos-staging-'));
 const dbpath=path.join(pasta,'compras-local.sqlite');
 let banco=new DatabaseSync(dbpath);
 banco.exec('PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;');
 const repo=new RepositorioCatalogoMemoria({produtos:[
  produto('curso-lab-250'),produto('curso-lab-100',10000),
  {...produto('curso-escondido'),estado:'RASCUNHO'}
 ]});
 let intencoes=new IntencoesCheckoutSQLite({banco});
 const app=express();app.use(express.json({limit:'32kb'}));
 const identificador=(req)=>req.get('X-Fixture-Sessao')==='sessao-A'?'titular-teste-0001':
  req.get('X-Fixture-Sessao')==='sessao-B'?'titular-teste-0002':null;
 const csrf=(req)=>req.get('X-Fixture-Csrf')==='autorizacao-ensaio-local';
 app.use('/staging',criarRouterRascunhosCheckoutStaging({
  repositorioCatalogo:repo,intencoes,identificarTitular:identificador,
  autorizarMutacao:csrf
 }));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{
  await new Promise(resolve=>server.close(resolve));
  banco.close();rmSync(pasta,{force:true,recursive:true});
 });
 const base='http://127.0.0.1:'+server.address().port+'/staging';
 const headers=(sessao='sessao-A')=>({'Content-Type':'application/json',
  'X-Fixture-Sessao':sessao,'X-Fixture-Csrf':'autorizacao-ensaio-local',
  'Idempotency-Key':'chave-ensaio-publico-0000001'});
 const request=async(rota,{method='GET',body,headers:hd={}}={})=>{
  const r=await fetch(base+rota,{method,headers:{...headers(),...hd},
   ...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:r.status,data:await r.json(),headers:r.headers};
 };
 return {repo,get banco(){return banco;},get intencoes(){return intencoes;},
  base,request,headers,dbpath,reabrir(){
   banco.close();banco=new DatabaseSync(dbpath);
   banco.exec('PRAGMA foreign_keys=ON;');
   intencoes=new IntencoesCheckoutSQLite({banco});
   // In-process route references old instance. Read through fresh repository
   // directly after reabrir, no simulated HTTP on the closed instance.
   return intencoes;
  }};
}
test('HTTP staging: pedido preparatorio persiste sem Pix, titular B isolado e replay exato',async t=>{
 const s=await abrir(t);
 const itens={itens:[{produtoId:'curso-lab-250',quantidade:1},
  {produtoId:'curso-lab-100',quantidade:2}]};
 const novo=await s.request('/rascunhos',{method:'POST',body:itens});
 assert.equal(novo.status,201,JSON.stringify(novo.data));
 assert.equal(novo.data.repetido,false);
 const id=novo.data.intencao.pedidoId;
 assert.match(id,/^pre-[0-9a-f-]{36}$/);
 assert.equal(novo.data.intencao.totalCentavos,45000);
 assert.equal(novo.data.intencao.estado,'RASCUNHO_SEM_COBRANCA');
 assert.equal(novo.data.intencao.pagamentoIniciado,false);
 assert.equal(novo.data.intencao.pedidoComercialCriado,false);
 assert.equal(novo.data.intencao.posicoesCriadas,0);
 assert.equal(novo.headers.get('cache-control'),'no-store');
 assert.equal(s.banco.prepare('SELECT COUNT(*) AS n FROM akitemm_checkout_intencoes_preparacao').get().n,1);
 const replay=await s.request('/rascunhos',{method:'POST',
  body:{itens:[...itens.itens].reverse()}});
 assert.equal(replay.status,200);
 assert.equal(replay.data.repetido,true);
 assert.equal(replay.data.intencao.pedidoId,id);
 assert.equal((await s.request('/rascunhos')).data.intencoes.length,1);
 const b=await s.request('/rascunhos',{method:'POST',body:itens,
  headers:{'X-Fixture-Sessao':'sessao-B'}});
 assert.equal(b.status,201);
 assert.notEqual(b.data.intencao.pedidoId,id);
 assert.equal((await s.request('/rascunhos',{headers:{'X-Fixture-Sessao':'sessao-B'}})).data.intencoes.length,1);
 const invisivel=await s.request('/rascunhos/'+id,{headers:{'X-Fixture-Sessao':'sessao-B'}});
 assert.equal(invisivel.status,404);
 assert.equal((await s.request('/rascunhos/'+id)).status,200);
 assert.equal(s.banco.prepare('SELECT COUNT(*) AS n FROM akitemm_checkout_intencoes_preparacao').get().n,2);
 const gravado=s.banco.prepare('SELECT * FROM akitemm_checkout_intencoes_preparacao WHERE pedido_id=?').get(id);
 assert.notEqual(gravado.chave_hash,'chave-ensaio-publico-0000001');
 assert.equal(gravado.itens_canonicos_json.includes('email'),false);
 assert.equal(s.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(s.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('preco muda antes de nova chave, mas replay preserva fotografia sem vender ou reservar',async t=>{
 const s=await abrir(t);
 const compra={itens:[{produtoId:'curso-lab-250',quantidade:1}]};
 const a=await s.request('/rascunhos',{method:'POST',body:compra});
 assert.equal(a.status,201);
 s.repo.atualizar('curso-lab-250',{precoCentavos:30000});
 const replay=await s.request('/rascunhos',{method:'POST',body:compra});
 assert.equal(replay.data.intencao.totalCentavos,25000);
 const novo=await s.request('/rascunhos',{method:'POST',body:compra,
  headers:{'Idempotency-Key':'chave-ensaio-publico-0000002'}});
 assert.equal(novo.status,201);
 assert.equal(novo.data.intencao.totalCentavos,30000);
 assert.equal(novo.data.intencao.precoNaoReservado,true);
 const conflito=await s.request('/rascunhos',{method:'POST',body:{itens:[
  {produtoId:'curso-lab-100',quantidade:1}]},headers:{
   'Idempotency-Key':'chave-ensaio-publico-0000001'
  }});
 assert.equal(conflito.status,409);
 assert.equal(conflito.data.erro,'CHAVE_IDEMPOTENCIA_CONFLITANTE');
 assert.equal(s.banco.prepare('SELECT COUNT(*) n FROM akitemm_checkout_intencoes_preparacao').get().n,2);
 const reaberto=s.reabrir();
 assert.equal(reaberto.consultarDoTitular({
  titularId:'titular-teste-0001',pedidoId:a.data.intencao.pedidoId
 }).totalCentavos,25000);
 assert.throws(()=>s.banco.prepare(
  'DELETE FROM akitemm_checkout_intencoes_preparacao').run(),/rascunho imutavel/);
 assert.throws(()=>s.banco.prepare(
  'UPDATE akitemm_checkout_intencoes_preparacao SET total_centavos=1').run(),/rascunho imutavel/);
});
test('auth e protecoes CSRF/host barram usuario e campos nao autorizados antes de gravar',async t=>{
 const s=await abrir(t);
 const compra={itens:[{produtoId:'curso-lab-250',quantidade:1}]};
 const semSessao=await s.request('/rascunhos',{method:'POST',body:compra,
  headers:{'X-Fixture-Sessao':'desconhecido'}});
 assert.equal(semSessao.status,401);
 const semCsrf=await s.request('/rascunhos',{method:'POST',body:compra,
  headers:{'X-Fixture-Csrf':'incorreto'}});
 assert.equal(semCsrf.status,403);
 const semOrigem=await s.request('/rascunhos',{method:'POST',body:compra,
  headers:{Origin:'https://site-invalido.invalid'}});
 assert.equal(semOrigem.status,403);
 const injection=await s.request('/rascunhos',{method:'POST',
  body:{...compra,titularId:'titular-teste-0002'}});
 assert.equal(injection.status,400);
 const precoFalso=await s.request('/rascunhos',{method:'POST',
  body:{itens:[{produtoId:'curso-lab-250',quantidade:1,precoCentavos:1}]}});
 assert.equal(precoFalso.status,400);
 const naoPublicado=await s.request('/rascunhos',{method:'POST',
  body:{itens:[{produtoId:'curso-escondido',quantidade:1}]}});
 assert.equal(naoPublicado.status,404);
 const keyRuim=await s.request('/rascunhos',{method:'POST',body:compra,
  headers:{'Idempotency-Key':'curta'}});
 assert.equal(keyRuim.status,400);
 assert.equal(s.banco.prepare('SELECT COUNT(*) n FROM akitemm_checkout_intencoes_preparacao').get().n,0);
});
test('apenas catalogo e cotacao publica sao montados: rotas de rascunho nao existem no servidor publico',async t=>{
 const app=require('../src/server'),server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 for(const rota of ['/api/checkout/rascunhos','/staging/rascunhos']){
  const r=await fetch(base+rota,{method:'POST'});
  assert.ok([404,503].includes(r.status));
 }
 assert.equal((await fetch(base+'/health/ready')).status,503);
});
test('cotacao forjada e negada no dominio antes de inserir rascunho',async t=>{
 const s=await abrir(t);
 const entrada={itens:[{produtoId:'curso-lab-250',quantidade:1}]};
 const cotacao=await cotarCheckoutPublico({repositorio:s.repo,entrada});
 assert.throws(()=>s.intencoes.criar({
  titularId:'titular-teste-0001',chaveIdempotencia:'chave-ensaio-publico-0000003',
  entrada,cotacao:{...cotacao,totalCentavos:1}
 }),{codigo:'COTACAO_NAO_CONFIAVEL'});
 assert.equal(s.banco.prepare('SELECT COUNT(*) n FROM akitemm_checkout_intencoes_preparacao').get().n,0);
});
