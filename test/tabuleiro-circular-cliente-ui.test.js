'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'../src/candidato/escritorio-cliente-integrado.css'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../src/candidato/checkout-candidato-ui.html'),'utf8');
test('somente a aba Tabuleiro recebe as posicoes circulares, sem grade 3 por 3',()=>{
 const start=css.indexOf('/* O tabuleiro do cliente volta a ser uma roda real');
 const end=css.indexOf('/* Aceite individual das posicoes no LOOP',start);
 const src=css.slice(start,end);
 assert.ok(src.includes('position:relative;display:block;aspect-ratio:1/1'));
 assert.ok(src.includes('position:absolute;display:flex;width:25%;height:25%'));
 assert.equal((html.match(/tabuleiro-vaga-[1-6]"/g)||[]).length,6);
 assert.equal((html.match(/class="espaco-tabuleiro-demo tabuleiro-centro"/g)||[]).length,1);
 for(let i=1;i<=6;i++){
  assert.match(src,new RegExp('\\.cliente-integrado #conteudoTabuleiro \\.mapa-tabuleiro-posicoes-demo>\\.tabuleiro-vaga-'+i+'\\{left:[0-9.]+%;top:[0-9.]+%\\}'));
 }
 assert.doesNotMatch(src,/#[a-fA-F0-9]{3,8}.*(?:background|color)/);
});
