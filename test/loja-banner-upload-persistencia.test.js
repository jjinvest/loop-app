'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {once}=require('node:events'),{randomBytes}=require('node:crypto');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {AkitemmConfigLojaDemoSQLite}=
 require('../src/domain/akitemm-config-loja-demo-sqlite');
const ADMIN='admin-banner-publicacao-'+('C'.repeat(48));
const PNG=Buffer.from(
 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+anxrAAAAAElFTkSuQmCC',
 'base64');

test('admin envia banner binário, loja exibe somente quando publicado; mesma base SQLite',async t=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 const {app}=criarAppLojaEscritorioCandidato({
  banco:db,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  segredoOperador:ADMIN,termosVersao:'LAB-banner-2026',
  termosTexto:'Somente para teste editorial de banners com imagem real e sem qualquer movimentação financeira.'
 });
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(ok=>server.close(ok));db.close()});
 const base='http://127.0.0.1:'+server.address().port;
 const r=(p,opts={})=>fetch(base+p,{...opts,
  headers:{...(opts.headers||{})}});
 const rota='/staging/escritorio-unificado/loja/banner-arquivo';
 assert.equal((await r(rota,{method:'POST',
  headers:{'Content-Type':'image/png'},body:PNG})).status,401);
 assert.equal((await r(rota,{method:'POST',
  headers:{Authorization:'Bearer '+ADMIN,'Content-Type':'image/svg+xml'},
  body:Buffer.from('<svg/>')})).status,415);
 const up=await r(rota,{method:'POST',
  headers:{Authorization:'Bearer '+ADMIN,'Content-Type':'image/png'},body:PNG});
 assert.equal(up.status,201);
 const {id,imagemCaminho}=await up.json();
 assert.match(id,/^[a-f0-9]{32}$/);
 assert.equal(imagemCaminho,'/staging/vitrine/loja/banner-arquivo/'+id);
 assert.equal((await r(imagemCaminho)).status,404,
  'não publicar arte antes de salvar banner correspondente');
 const configPath='/staging/escritorio-unificado/loja/config';
 const original=await (await r(configPath,{
  headers:{Authorization:'Bearer '+ADMIN}
 })).json();
 const config=original.config;
 config.banners=[
  {titulo:'Banner real de imagem',descricao:'Arte enviada por operador',
   produtoId:'',imagemCaminho}
 ];
 const saved=await r(configPath,{method:'PUT',
  headers:{Authorization:'Bearer '+ADMIN,'Content-Type':'application/json'},
  body:JSON.stringify({config,revisaoEsperada:original.revisao})});
 assert.equal(saved.status,200,await saved.text());
 const publico=await r('/staging/vitrine/loja/config');
 assert.equal(publico.status,200);
 assert.equal((await publico.json()).config.banners[0].imagemCaminho,imagemCaminho);
 const imagem=await r(imagemCaminho);
 assert.equal(imagem.status,200);
 assert.equal(imagem.headers.get('content-type'),'image/png');
 assert.deepEqual(Buffer.from(await imagem.arrayBuffer()),PNG);
 const reaberto=new AkitemmConfigLojaDemoSQLite({banco:db});
 assert.deepEqual(reaberto.abrirImagemBanner(id,{publico:true}).bytes,PNG);
 // A ordem altera a configuração, não a custódia da arte.
 const c2=reaberto.consultar();c2.banners.unshift({
  titulo:'Banner textual anterior',descricao:'Sem imagem',
  produtoId:'',imagemCaminho:''
 });
 reaberto.salvarComRevisao({config:c2,revisaoEsperada:reaberto.revisao()});
 assert.deepEqual(reaberto.abrirImagemBanner(id,{publico:true}).bytes,PNG);
 assert.equal((await r(imagemCaminho)).status,200);
 const c3=reaberto.consultar();c3.banners=c3.banners.filter(b=>b.imagemCaminho!==imagemCaminho);
 reaberto.salvarComRevisao({config:c3,revisaoEsperada:reaberto.revisao()});
 assert.equal((await r(imagemCaminho)).status,404);
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
