'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ler=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('ferramentas do operador nao invadem a grade dos filtros da AKITEMM',()=>{
 const js=ler('src/producao/operador-loja-fotos-real.js');
 const inicio=js.indexOf(' function sincronizarEditorOfertas(){');
 const fim=js.indexOf(' function modal(titulo){',inicio);
 assert.ok(inicio>=0&&fim>inicio);
 const trecho=js.slice(inicio,fim);
 assert.match(trecho,/const linhaFiltros=filtro\.closest\('\.akitemm-busca-filtros'\)/);
 assert.match(trecho,/linhaFiltros\.insertAdjacentElement\('afterend',barra\)/);
 assert.match(trecho,/const barraId='akitemmFerramentasOperadorVitrine'/);
 assert.match(trecho,/barra\.append\(botao\)/);
 assert.match(trecho,/barra\.append\(instrucao\)/);
 assert.doesNotMatch(trecho,/filtro\.insertAdjacentElement\('afterend',botao\)/);
 assert.match(trecho,/barraAtual\?\.remove\(\)/);
});
test('filtros amarelos limitados e ferramentas responsivas no computador e celular',()=>{
 const base=ler('src/laboratorio/loja-cliente-demo.css');
 const extra=ler('src/candidato/vitrine-horizontal.css');
 assert.match(base,/grid-template-columns:minmax\(90px,116px\) minmax\(0,1fr\) minmax\(90px,116px\)/);
 assert.match(base,/@media\(max-width:640px\)[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(extra,/#akitemmFerramentasOperadorVitrine\{/);
 assert.match(extra,/#akitemmFerramentasOperadorVitrine>#akitemmInstrucaoArrastar\{/);
 assert.match(extra,/@media\(max-width:600px\)[\s\S]*?flex-basis:calc\(50% - 4px\)/);
});