'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {once}=require('node:events');
const {BannersAkitemmRealSQLite}=
 require('../src/producao/banners-akitemm-real-sqlite');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {criarAppIdentidadeLoop}=
 require('../src/producao/servidor-identidade-loop');
const PNG=Buffer.from(
 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4z8DAAMIM/4EAAB/uBfsL2WiLAAAAAElFTkSuQmCC',
 'base64');
const PNG_VALIDO=Buffer.from(
 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DAAMIM/4EAAB/uBfsL2WiLAAAAAElFTkSuQmCC',
 'base64');
const TERM='Cadastro para teste real de banner AKITEMM, sem compra, pedido ou pagamento.';
test('quatro banners reais: imagem, troca de ordem, revisão, remover e dados preservados',t=>{
 const db=new DatabaseSync(':memory:');
 t.after(()=>db.close());
 db.exec('PRAGMA foreign_keys=ON');
 const b=new BannersAkitemmRealSQLite({banco:db,agora:()=>1700000001000});
 const inicio=b.listar();
 assert.equal(inicio.quantidadeMaxima,4);
 assert.deepEqual(inicio.slots.map(x=>x.slot),[1,2,3,4]);
 assert.ok(inicio.slots.every(x=>!x.temImagem&&x.revisao===0));
 assert.throws(()=>b.salvar({
  slot:1,mime:'image/svg+xml',dados:Buffer.from('<svg>'),
  revisaoEsperada:0
 }),{codigo:'BANNER_FOTO_INVALIDA'});
 assert.throws(()=>b.salvar({
  slot:5,mime:'image/png',dados:PNG_VALIDO,revisaoEsperada:0
 }),{codigo:'BANNER_SLOT_INVALIDO'});
 const a=b.salvar({
  slot:1,mime:'image/png',dados:PNG_VALIDO,revisaoEsperada:0,
  enquadramento:'INTEIRA'
 });
 assert.equal(a.slots[0].revisao,1);
 assert.equal(a.slots[0].temImagem,true);
 assert.equal(b.imagem(1).mime,'image/png');
 assert.ok(b.imagem(1).dados.length>=40);
 assert.throws(()=>b.salvar({
  slot:1,mime:'image/png',dados:PNG_VALIDO,revisaoEsperada:0
 }),{codigo:'BANNER_CONFLITO_REVISAO'});
 const movido=b.trocar({
  origem:1,destino:3,revisaoOrigem:1,revisaoDestino:0
 });
 assert.equal(movido.slots[0].temImagem,false);
 assert.equal(movido.slots[2].temImagem,true);
 assert.equal(b.imagem(3).mime,'image/png');
 assert.throws(()=>b.imagem(1),{codigo:'BANNER_SEM_IMAGEM'});
 assert.throws(()=>b.trocar({
  origem:3,destino:4,revisaoOrigem:0,revisaoDestino:0
 }),{codigo:'BANNER_CONFLITO_REVISAO'});
 b.remover({slot:3,revisaoEsperada:1});
 assert.equal(b.listar().slots[2].temImagem,false);
 const novamente=new BannersAkitemmRealSQLite({banco:db});
 assert.equal(novamente.listar().slots[2].revisao,2);
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('público consulta somente quatro banners publicados; upload exige sessão de operador',async t=>{
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 t.after(()=>db.close());
 const banners=new BannersAkitemmRealSQLite({banco:db});
 const contas=new IdentidadeClienteLoopReal({
  banco:db,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-BANNER-REAL-2026',texto:TERM.repeat(3)},
  privacidade:{versao:'LOOP-BANNER-PRIV-2026',texto:TERM.repeat(3)},
  enviarEmail:async()=>true
 });
 const app=criarAppIdentidadeLoop({
  contas,origemHttps:'https://contas.example.invalid',permitirCadastro:false,
  bannersAkitemm:banners
 });
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(ok=>server.close(ok)));
 const url='http://127.0.0.1:'+server.address().port;
 const list=await fetch(url+'/api/loja/banners');
 assert.equal(list.status,200);
 assert.equal((await list.json()).slots.length,4);
 assert.equal((await fetch(url+'/api/loja/banners/1/imagem')).status,404);
 banners.salvar({
  slot:2,mime:'image/png',dados:PNG_VALIDO,revisaoEsperada:0
 });
 const image=await fetch(url+'/api/loja/banners/2/imagem');
 assert.equal(image.status,200);
 assert.equal(image.headers.get('content-type'),'image/png');
 assert.ok((await image.arrayBuffer()).byteLength>40);
 const admin=await fetch(url+'/api/admin/akitemm/banners/2',{
  method:'PUT',headers:{'Content-Type':'image/png'},
  body:PNG_VALIDO
 });
 assert.notEqual(admin.status,200);
 assert.equal((await fetch(url+'/api/loja/banners/6/imagem')).status,404);
 assert.equal((await fetch(url+'/api/loja/pedidos')).status,401);
});
test('interface AKITEMM: quatro slides e toque sobre a moldura abre editor real, no mobile também',()=>{
 const f=path.join(__dirname,'../src/producao/operador-loja-fotos-real.js');
 const js=fs.readFileSync(f,'utf8');
 const css=fs.readFileSync(path.join(__dirname,
  '../src/candidato/vitrine-horizontal.css'),'utf8');
 const routes=fs.readFileSync(path.join(__dirname,
  '../src/producao/gateway-admin-comercial.js'),'utf8');
 const init=fs.readFileSync(path.join(__dirname,
  '../scripts/iniciar-identidade-real-loop.js'),'utf8');
 assert.match(js,/for\(let i=0;i<4;i\+\+\)/);
 assert.match(js,/akitemmBannerConteudo/);
 assert.match(js,/Editar foto deste banner/);
 assert.match(js,/arquivo\.type/);
 assert.match(js,/api\/admin\/akitemm\/banners\/trocar/);
 assert.match(js,/Mover para a direita/);
 assert.match(js,/Mover para a esquerda/);
 assert.match(js,/bannerSlots\.length===4/);
 assert.match(js,/operadorAutenticado&&!visaoClienteSolicitada/);
 assert.match(css,/akitemm-banner-com-foto/);
 assert.match(css,/akitemm-banner-imagem/);
 assert.match(css,/@media\(max-width:480px\)/);
 assert.match(routes,/proteger,validarCsrf/);
 assert.match(routes,/express\.raw/);
 assert.match(init,/const bannersAkitemm=new BannersAkitemmRealSQLite/);
 assert.match(init,/bannersAkitemm,/);
});
