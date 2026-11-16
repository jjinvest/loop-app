'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../src/laboratorio/loja-cliente-demo.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../src/candidato/vitrine-horizontal.css'),'utf8');
test('10 abas com 40 quadrinhos: 4 fileiras de 10, 2 exibidas inicialmente',()=>{
 assert.match(src,/TOTAL_ABAS=10,COLUNAS_FAIXA=10,LINHAS_ABA=4,VAGAS_ABA=40/);
 assert.match(src,/const linhas=expandida\?LINHAS_ABA:2/);
 assert.match(src,/length:linhas\*COLUNAS_FAIXA/);
 assert.match(src,/const indice=abaProdutos\*VAGAS_ABA\+i/);
 assert.match(src,/faixas\[Math\.floor\(i\/COLUNAS_FAIXA\)\]/);
 assert.match(src,/abasExpandidas\.has\(abaProdutos\)/);
 assert.match(src,/Página '\+\(n\+1\)\+' de '\+TOTAL_ABAS/);
 assert.match(css,/scroll-snap-type:x proximity/);
 assert.match(css,/flex-basis:calc\(50% - 4px\)/);
});
test('oito cores configuradas e produtos reais continuam conectados, vazio sem checkout',()=>{
 assert.match(src,/coresVitrine\(\)\.map\(\(cor,indice\)=>/);
 assert.match(src,/alvo\.append\(criarSlotVazio\(item\)\)/);
 assert.match(src,/adicionarBotao\.disabled=catalogoRealSemCheckout/);
 assert.match(src,/corFiltro/);
 assert.match(src,/produtosFiltrados\(\)/);
});
