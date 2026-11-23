'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ler=arquivo=>fs.readFileSync(path.join(__dirname,'..',arquivo),'utf8');
test('AKITEMM conserva os quatro filtros clicáveis na ordem exata',()=>{
 const html=ler('src/laboratorio/loja-cliente-demo.html');
 const js=ler('src/producao/interface-aprovada-loja.js');
 const controles=['CINZA','VERDE','DOURADO','ROXO'];
 const pos=controles.map(cor=>html.indexOf('data-akitemm-cor="'+cor+'"'));
 assert.ok(pos.every(x=>x>=0));
 assert.ok(pos.every((x,i)=>i===0||x>pos[i-1]));
 assert.equal((html.match(/data-akitemm-cor=/g)||[]).length,4);
 assert.ok(html.indexOf('id="akitemmFiltroTodos"')<
  html.indexOf('id="akitemmBusca"'));
 assert.ok(html.indexOf('id="akitemmBusca"')<
  html.indexOf('id="akitemmFiltroOfertas"'));
 assert.match(js,/\$\('akitemmFiltroTodos'\)\.addEventListener\('click',filtroTodos\)/);
 assert.match(js,/\$\('akitemmFiltroOfertas'\)\.addEventListener\('click'/);
 assert.match(js,/document\.querySelectorAll\('\[data-akitemm-cor\]'\)/);
});
test('computador ocupa toda a largura, celular adapta sem mudar filtros ou catálogo',()=>{
 const css=ler('src/laboratorio/loja-cliente-demo.css');
 const area=css.slice(css.indexOf('/* Faixa de filtros AKITEMM: largura inteira'));
 assert.ok(area.length>1700,'a faixa responsiva deve existir');
 assert.match(area,/\.akitemm-loja \.akitemm-busca-filtros\s*\{\s*display:grid/);
 assert.match(area,/grid-template-columns:minmax\(90px,auto\) minmax\(0,1fr\) minmax\(90px,auto\)/);
 assert.match(area,/\.akitemm-loja \.akitemm-legenda-cores\s*\{\s*grid-column:1\/-1;grid-row:2;\s*display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(area,/width:100%;max-width:none;min-width:0;margin:0/);
 assert.match(area,/@media\(max-width:800px\)\{/);
 assert.match(area,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(area,/@media\(max-width:450px\)\{/);
 assert.match(area,/\.akitemm-loja \.akitemm-busca\s*\{\s*grid-column:1\/-1;grid-row:2/);
 assert.match(area,/\.akitemm-loja \.akitemm-legenda-cores\s*\{\s*grid-column:1\/-1;grid-row:3/);
 assert.match(area,/#catalogoLojaLoop\{\s*display:grid;grid-template-columns:repeat\(4/);
 assert.match(area,/@media\(max-width:800px\)[\s\S]*?#catalogoLojaLoop\{\s*grid-template-columns:repeat\(2/);
 const browser=ler('scripts/validar-identidade-real-navegador.js');
 assert.match(browser,/async function conferirFiltrosAkitemmResponsivos\(page\)/);
 assert.match(browser,/320,390,600,820,1280,1440/);
 assert.match(browser,/await conferirFiltrosAkitemmResponsivos\(page\)/);
});
