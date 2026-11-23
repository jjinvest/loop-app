'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const ler=f=>readFileSync(path.join(__dirname,'..',f),'utf8');
const codigo=ler('src/producao/banners-escritorio-real-client.js');
const css=ler('src/producao/banners-editor-real.css');
function construir(fotosPorBanner,celular){
 const comeco=codigo.indexOf(' function quadrosComFotos(item){');
 const fim=codigo.indexOf(' function navegar(i){',comeco);
 assert.ok(comeco>0&&fim>comeco,'funções de sequenciamento precisam existir');
 const bloco=codigo.slice(comeco,fim);
 const banners=fotosPorBanner.map((quantidade,n)=>{
  const fotos=Array.from({length:quantidade},(_,i)=>{
   const classes=new Set(),atributos=new Map();
   return {posicao:i+1,classes,atributos,
    classList:{toggle:(nome,ativo)=>{
     if(ativo)classes.add(nome);else classes.delete(nome);
    }},
    setAttribute:(nome,valor)=>atributos.set(nome,valor),
    removeAttribute:nome=>atributos.delete(nome),
    querySelector:sel=>sel==='img'?{}:null};
  });
  return {dataset:{bannerSlot:String(n+1)},
   fotos,querySelectorAll:sel=>sel==='.banner-mosaico-celula'?fotos:[]};
 });
 const criar=new Function('banners','celular',
  'let indice=0,slotFotoCelular=null,indiceFotoCelular=0;'+
  'const botao={};const visiveis=()=>banners;const ehCelular=()=>celular;'+
  'function navegar(i){indice=i;sincronizarFotosCelular();}'+bloco+
  'return {iniciar:()=>sincronizarFotosCelular(),'+
  'avancar:()=>avancarFotoNoCelular(),'+
  'estado:()=>({banner:indice+1,foto:indiceFotoCelular+1}),banners};');
 return criar(banners,celular);
}
test('no celular exibe foto 1, foto 2, depois banner seguinte; sem perder imagens',()=>{
 const carrossel=construir([2,1,3],true);
 carrossel.iniciar();
 assert.deepEqual(carrossel.estado(),{banner:1,foto:1});
 assert.equal(carrossel.banners[0].fotos[0].classes.has('banner-foto-ativa'),true);
 assert.equal(carrossel.banners[0].fotos[1].atributos.get('aria-hidden'),'true');
 carrossel.avancar();
 assert.deepEqual(carrossel.estado(),{banner:1,foto:2});
 assert.equal(carrossel.banners[0].fotos[0].atributos.get('aria-hidden'),'true');
 assert.equal(carrossel.banners[0].fotos[1].classes.has('banner-foto-ativa'),true);
 carrossel.avancar();assert.deepEqual(carrossel.estado(),{banner:2,foto:1});
 carrossel.avancar();assert.deepEqual(carrossel.estado(),{banner:3,foto:1});
 carrossel.avancar();assert.deepEqual(carrossel.estado(),{banner:3,foto:2});
 carrossel.avancar();assert.deepEqual(carrossel.estado(),{banner:3,foto:3});
 carrossel.avancar();assert.deepEqual(carrossel.estado(),{banner:1,foto:1});
 assert.deepEqual(carrossel.banners.map(x=>x.fotos.length),[2,1,3]);
});
test('com um único banner de duas fotos alterna sem abandonar o banner',()=>{
 const carrossel=construir([2],true);carrossel.iniciar();
 carrossel.avancar();assert.deepEqual(carrossel.estado(),{banner:1,foto:2});
 carrossel.avancar();assert.deepEqual(carrossel.estado(),{banner:1,foto:1});
});
test('desktop não esconde nenhuma fotografia semanticamente',()=>{
 const carrossel=construir([2,3],false);carrossel.iniciar();
 assert.ok(carrossel.banners.flatMap(b=>b.fotos)
  .every(c=>!c.atributos.has('aria-hidden')));
});
test('mobile altera apenas o LOOP: CSS com foto inteira e transição sem mexer na loja',()=>{
 assert.match(css,/@media\(max-width:600px\)\{\s*#conteudoResumo \.loop03-banner-item \.banner-mosaico\{/);
 assert.match(css,/\.banner-mosaico-celula\.banner-foto-ativa\{/);
 assert.match(css,/transition:opacity \.6s ease-in-out/);
 assert.match(css,/object-fit:contain;object-position:center/);
 assert.match(css,/@media\(max-width:600px\) and \(prefers-reduced-motion:reduce\)/);
 assert.match(codigo,/if\(!ehCelular\(\)\|\|document\.hidden/);
 assert.match(codigo,/avancarFotoNoCelular\(\)/);
 assert.match(codigo,/\},4500\)/);
 assert.match(codigo,/if\(ehCelular\(\)\|\|document\.hidden/);
 assert.match(codigo,/\},7500\)/);
 assert.doesNotMatch(css.slice(css.indexOf('\/\* Apenas LOOP no celular:')),
  /\.akitemm-loja/);
});
