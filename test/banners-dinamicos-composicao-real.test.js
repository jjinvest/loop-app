'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {BannersEscritorioCandidatoSQLite}=
 require('../src/domain/banners-escritorio-candidato-sqlite');
const {BannersLojaAkitemmRealSQLite}=
 require('../src/producao/banners-loja-akitemm-real-sqlite');
const PNG=Buffer.from(
 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jI7sAAAAASUVORK5CYII=',
 'base64');
const entrada=(a,slot)=>{
 const x=a.listar().slots.find(v=>v.slot===slot);
 assert.ok(x);return x;
};
const enviar=(a,slot,posicao)=>{
 const x=entrada(a,slot);
 if(posicao===1)return a.salvar({slot,mime:'image/png',bytes:PNG,
  revisaoEsperada:x.revisao});
 return a.salvarFotoMosaico({slot,posicao,mime:'image/png',bytes:PNG,
  revisaoEsperada:x.revisao});
};
const layout=(a,slot,colunas,modo='PREENCHER')=>
 a.configurarMosaico({slot,colunas,modo,
  revisaoEsperada:entrada(a,slot).revisao});

test('ampliação aditiva mantém os quatro banners originais de LOOP e AKITEMM',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const loop=new BannersEscritorioCandidatoSQLite({banco:db});
  const akitemm=new BannersLojaAkitemmRealSQLite({banco:db});
  for(const a of [loop,akitemm]){
   assert.deepEqual(a.listar().slots.map(x=>x.slot),[1,2,3,4]);
   enviar(a,1,1);
   assert.equal(a.listar().slots[0].publicado,true);
   assert.equal(a.adicionar().novoSlot,5);
   assert.equal(a.adicionar().novoSlot,6);
   assert.equal(a.listar().slots.length,6);
   assert.deepEqual(a.imagem(1).bytes,PNG);
  }
  assert.ok(loop.listar().slots[4].temImagem===false);
  assert.ok(akitemm.listar().slots[4].temImagem===false);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{db.close();}
});
test('cada banner publica com uma imagem, mantendo dois ou três quadros independentes',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const loop=new BannersEscritorioCandidatoSQLite({banco:db});
  const loja=new BannersLojaAkitemmRealSQLite({banco:db});
  for(const a of [loop,loja]){
   const slot=a.adicionar().novoSlot;
   layout(a,slot,3,'PREENCHER');
   assert.equal(entrada(a,slot).colunas,3);
   assert.equal(entrada(a,slot).publicado,false);
   enviar(a,slot,1);
   assert.equal(entrada(a,slot).publicado,true);
   assert.deepEqual(entrada(a,slot).fotos.slice(0,3).map(x=>x.temImagem),
    [true,false,false]);
   enviar(a,slot,2);
   assert.equal(entrada(a,slot).publicado,true);
   enviar(a,slot,3);
   assert.equal(entrada(a,slot).publicado,true);
   assert.deepEqual(entrada(a,slot).fotos.slice(0,3).map(x=>x.temImagem),
    [true,true,true]);
   assert.deepEqual(a.imagemMosaico({slot,posicao:3}).bytes,PNG);
   assert.throws(()=>a.configurarMosaico({
    slot,colunas:2,modo:'INTEIRA',revisaoEsperada:0
   }),{codigo:'BANNER_MOSAICO_CONFLITO_REVISAO'});
   a.removerFotoMosaico({
    slot,posicao:2,revisaoEsperada:entrada(a,slot).revisao
   });
   assert.equal(entrada(a,slot).publicado,true);
   assert.deepEqual(entrada(a,slot).fotos.slice(0,3).map(x=>x.temImagem),
    [true,false,true]);
   layout(a,slot,1,'INTEIRA');
   assert.equal(entrada(a,slot).publicado,true);
   layout(a,slot,2,'PREENCHER');
   assert.equal(entrada(a,slot).publicado,true);
   a.remover({slot,revisaoEsperada:entrada(a,slot).revisao});
   assert.equal(entrada(a,slot).publicado,false);
   enviar(a,slot,2);
   assert.equal(entrada(a,slot).publicado,true);
   assert.deepEqual(entrada(a,slot).fotos.slice(0,3).map(x=>x.temImagem),
    [false,true,true]);
   a.removerFotoMosaico({
    slot,posicao:2,revisaoEsperada:entrada(a,slot).revisao
   });
   assert.equal(entrada(a,slot).publicado,false);
   layout(a,slot,3,'PREENCHER');
   assert.equal(entrada(a,slot).publicado,true);
  }
  const aposLoop=new BannersEscritorioCandidatoSQLite({banco:db});
  const aposLoja=new BannersLojaAkitemmRealSQLite({banco:db});
  assert.equal(entrada(aposLoop,5).colunas,3);
  assert.equal(entrada(aposLoja,5).colunas,3);
  assert.equal(entrada(aposLoop,5).publicado,true);
  assert.equal(entrada(aposLoja,5).publicado,true);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{db.close();}
});
test('mosaicos compartilham o estado de publicação com o carrossel, não o motor',()=>{
 const ler=x=>fs.readFileSync(path.join(__dirname,'..',x),'utf8');
 const loop=ler('src/producao/banners-escritorio-real-client.js');
 const loja=ler('src/producao/banners-loja-akitemm-client.js');
 const backLoop=ler('src/producao/banners-escritorio-real.js');
 const backLoja=ler('src/producao/gateway-admin-comercial.js');
 const css=ler('src/producao/banners-editor-real.css');
 assert.match(loop,/api\/admin\/loop\/banners\/adicionar/);
 assert.match(loja,/api\/admin\/akitemm\/banners\/adicionar/);
 assert.match(loop,/BannerColunasReal/);
 assert.match(loja,/BannerColunasReal/);
 assert.match(loop,/slot\.publicado/);
 assert.match(loja,/s\.publicado/);
 assert.match(loop,/banner-mosaico/);
 assert.match(loja,/banner-mosaico/);
 assert.match(backLoop,/\/:slot\/layout/);
 assert.match(backLoja,/\/:slot\/layout/);
 assert.match(css,/grid-template-columns:repeat\(var\(--banner-quadros\)/);
 assert.match(loop,/removerFotoIndividual/);
 assert.match(loja,/removerFotoIndividual/);
 assert.match(loja,/prepararFotoBanner/);
 assert.match(loop,/banner-foto-lixeira-quadro/);
 assert.match(loja,/banner-foto-lixeira-quadro/);
 assert.match(css,/banner-foto-lixeira-quadro/);
 const motor=ler('src/producao/banner-mosaico-sqlite.js');
 assert.match(motor,/fotos\.slice\(0,colunas\)\.some\(x=>x\.temImagem\)/);

 assert.doesNotMatch(backLoop,/consulta.*caixa|processarAgenda|criarPedido/);
});
