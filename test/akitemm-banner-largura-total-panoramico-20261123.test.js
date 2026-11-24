'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'../',f),'utf8');
test('banner fica na largura inteira acima das colunas, sem mover o carrinho',()=>{
 const html=read('src/laboratorio/loja-cliente-demo.html');
 const css=read('src/laboratorio/loja-cliente-demo.css');
 assert.match(html,/<div class="akitemm-grade-pagina">\s*<section class="akitemm-banner"/);
 assert.match(html,/<\/section>\s*<div class="akitemm-vitrine-principal">\s*<div class="akitemm-busca-filtros"/);
 assert.match(html,/<aside class="akitemm-coluna-direita">/);
 assert.match(css,/\.akitemm-loja \.akitemm-grade-pagina > \.akitemm-banner\{\s*grid-column:1\/-1;width:100%;min-width:0/);
});
test('banner mantém faixa fina e foto íntegra ao ocupar 100% da grade',()=>{
 const css=read('src/candidato/vitrine-horizontal.css');
 const editor=read('src/producao/banners-editor-real.css');
 assert.match(css,/\.akitemm-loja \.akitemm-banner\.akitemm-banner-com-foto\{\s*height:212px;min-height:212px;max-height:212px/);
 assert.match(editor,/\.akitemm-loja \.akitemm-banner \.banner-mosaico\{[\s\S]*?width:100%;height:100%/);
 assert.match(editor,/object-fit:contain;object-position:center/);
});
