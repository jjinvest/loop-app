'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const ler=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('banner AKITEMM conserva moldura panoramica antes e depois da foto',()=>{
 const css=ler('src/candidato/vitrine-horizontal.css');
 assert.match(css,/\.akitemm-loja \.akitemm-banner\{\s*box-sizing:border-box;height:212px;min-height:212px;max-height:212px/);
 assert.match(css,/@media\(max-width:450px\)\{\s*\.akitemm-loja \.akitemm-banner\{\s*height:177px;min-height:177px;max-height:177px/);
 assert.match(css,/\.akitemm-loja \.akitemm-banner \.akitemm-banner-conteudo\{\s*box-sizing:border-box;height:100%;min-height:0/);
 assert.doesNotMatch(css,/aspect-ratio:2\/1;min-height:190px/);
});
test('imagem inteira padrao e zoom permite reduzir abaixo do tamanho de ajuste',()=>{
 const js=ler('src/producao/banners-loja-akitemm-client.js');
 const css=ler('src/producao/banners-editor-real.css');
 assert.match(js,/const escala=Math\.min\(w\/img\.naturalWidth,h\/img\.naturalHeight\)\*crop\.zoom/);
 assert.match(js,/min="50" max="300" value="100"/);
 assert.match(js,/foto\.style\.objectFit='contain'/);
 assert.match(js,/mosaico\.dataset\.modo='INTEIRA'/);
 assert.match(js,/modo\.value='INTEIRA'/);
 assert.match(css,/\.akitemm-loja \.banner-real-formulario \.banner-editor-celula img:not\(\[hidden\]\)\{\s*object-fit:contain/);
 assert.match(css,/\.akitemm-loja \.akitemm-banner \.banner-mosaico-celula img\{\s*object-fit:contain/);
 assert.doesNotMatch(js,/Math\.max\(w\/img\.naturalWidth,h\/img\.naturalHeight\)\*crop\.zoom/);
});
