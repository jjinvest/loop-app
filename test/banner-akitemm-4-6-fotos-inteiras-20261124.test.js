'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path');
const {BannersLojaAkitemmRealSQLite}=require('../src/producao/banners-loja-akitemm-real-sqlite');
const {BannersEscritorioCandidatoSQLite}=require('../src/domain/banners-escritorio-candidato-sqlite');
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jI7sAAAAASUVORK5CYII=','base64');
test('AKITEMM 4, 5 e 6 fotos sem alterar o LOOP ou perder imagens',()=>{
 const db=new DatabaseSync(':memory:');
 try{
 const loja=new BannersLojaAkitemmRealSQLite({banco:db});
 const loop=new BannersEscritorioCandidatoSQLite({banco:db});
 for(const n of [4,5,6]){
  const atual=loja.listar().slots[0];
  loja.configurarMosaico({slot:1,colunas:n,modo:'INTEIRA',revisaoEsperada:atual.revisao});
  const s=loja.listar().slots[0];
  assert.equal(s.colunas,n);
  loja.salvarFotoMosaico({slot:1,posicao:n,mime:'image/png',bytes:PNG,revisaoEsperada:s.revisao});
  assert.deepEqual(loja.imagemMosaico({slot:1,posicao:n}).bytes,PNG);
 }
 const a=loja.listar().slots[0];
 loja.configurarMosaico({slot:1,colunas:2,modo:'PREENCHER',revisaoEsperada:a.revisao});
 assert.equal(loja.listar().slots[0].colunas,2);
 assert.equal(loja.listar().slots[0].fotos[5].temImagem,true);
 assert.throws(()=>loop.configurarMosaico({slot:1,colunas:4,modo:'INTEIRA',revisaoEsperada:0}),{codigo:'BANNER_MOSAICO_LAYOUT_INVALIDO'});
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{db.close();}
});
test('banner preserva proporção, controles pequenos e faixa inteira',()=>{
 const read=p=>fs.readFileSync(path.join(__dirname,'../',p),'utf8');
 const front=read('src/producao/banners-loja-akitemm-client.js');
 const css=read('src/producao/banners-editor-real.css');
 const vit=read('src/candidato/vitrine-horizontal.css');
 assert.match(front,/\['6','6 quadrinhos'\]/);
 assert.match(front,/\[2,3,4,5,6\]\.map/);
 assert.match(front,/foto\.style\.objectFit='contain'/);
 assert.match(front,/area\.clientWidth/);
 assert.match(vit,/object-fit:contain!important/);
 assert.match(vit,/width:16px;height:16px/);
});