'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const raiz=path.resolve(__dirname,'..');
const fontes=[
 'src/producao/banners-escritorio-real-client.js',
 'src/producao/banners-loja-akitemm-client.js'
];
for(const arquivo of fontes){
 test(arquivo+' conserva foto inteira no quadro e libera zoom para os dois lados',()=>{
  const fonte=fs.readFileSync(path.join(raiz,arquivo),'utf8');
  assert.match(fonte,/Math\.min\(w\/img\.naturalWidth,h\/img\.naturalHeight\)\*crop\.zoom/);
  assert.match(fonte,/Math\.pow\(4,\(Number\(zoom\.value\)-100\)\/100\)/);
  assert.match(fonte,/min="0" max="200" value="100"/);
  assert.match(fonte,/semAjuste\?crop\.original:/);
  const trecho=fonte.match(/function desenhar\(\)\{([\s\S]*?)\n \}\n async function abrirRecorte/);
  assert.ok(trecho,'motor do canvas deve permanecer disponível');
  const executar=new Function('crop','canvas',
   'function desenhar(){'+trecho[1]+'}\ndesenhar();');
  let desenho=null;
  const canvas={width:1000,height:1364,
   getContext:()=>({fillRect:()=>{},set fillStyle(_v){},
    drawImage:(_img,x,y,w,h)=>{desenho={x,y,w,h};}})};
  const imagem={naturalWidth:900,naturalHeight:1600};
  const crop={imagem,zoom:1,x:0,y:0};
  executar(crop,canvas);
  assert.ok(desenho.w<=1000&&desenho.h<=1364,'foto completa sem corte');
  assert.ok(Math.abs(desenho.w/desenho.h-900/1600)<.00001,'proporção preservada');
  assert.ok(Math.abs(desenho.x-(1000-desenho.w)/2)<.01,'foto centralizada');
  crop.zoom=4;executar(crop,canvas);
  assert.ok(desenho.w>1000||desenho.h>1364,'zoom permite ampliar para recortar');
  crop.zoom=.25;executar(crop,canvas);
  assert.ok(desenho.w<1000&&desenho.h<1364,'zoom permite reduzir');
 });
}
test('mosaicos e miniaturas preservam proporcao em ambos os sistemas',()=>{
 const css=fs.readFileSync(path.join(raiz,'src/producao/banners-editor-real.css'),'utf8');
 assert.match(css,/\.banner-mosaico-celula img\{[\s\S]*?object-fit:contain;object-position:center/);
 assert.match(css,/\.banner-editor-celula img:not\(\[hidden\]\)\{[\s\S]*?object-fit:contain;object-position:center/);
});
test('foto nao expande a moldura compacta e preexistente da AKITEMM',()=>{
 const css=fs.readFileSync(path.join(raiz,'src/candidato/vitrine-horizontal.css'),'utf8');
 assert.match(css,/\.akitemm-banner\.akitemm-banner-com-foto\{\s*height:212px;min-height:212px;max-height:212px;aspect-ratio:auto/);
});
