'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ler=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('banners LOOP e AKITEMM oferecem ajuste por toque dentro da foto, não blocos de recorte',()=>{
 const css=ler('src/producao/banners-editor-real.css');
 const recorteComum=ler('src/producao/recorte-foto-compartilhado.js');
 for(const arquivo of [
  'src/producao/banners-escritorio-real-client.js',
  'src/producao/banners-loja-akitemm-client.js'
 ]){
  const codigo=ler(arquivo);
  assert.doesNotThrow(()=>new vm.Script(codigo,{filename:arquivo}));
  assert.match(codigo,/function fotosNoProprioQuadro\(op\)/);
  assert.match(codigo,/input\.dataset\.recorteNativo='sim'/);
  assert.match(codigo,/banner-editor-grade/);
  assert.match(codigo,/quadro\.dataset\.fotoPosicao=String\(pos\)/);
  assert.match(codigo,/fotosEditor\.abrir\(pos\)/);
  assert.match(codigo,/canvas\.toBlob/);
  assert.match(codigo,/banner-editor-lixeira/);
  assert.match(codigo,/pendentes\.set\(pos,foto\)/);
  assert.match(codigo,/status\.textContent='Foto '\+pos\+' ajustada/);
  assert.doesNotMatch(codigo,/Recortar foto \(opcional\)/);
 }
 assert.match(css,/banner-editor-arquivo-oculto/);
 assert.match(css,/banner-editor-modo-oculto/);
 assert.match(css,/banner-editor-painel\[hidden\]/);
 assert.match(css,/touch-action:none/);
 assert.match(recorteComum,/input\.dataset\.recorteNativo==='sim'/);
});
