'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ler=p=>readFileSync(path.join(root,p),'utf8');
const html=ler('src/laboratorio/loja-cliente-demo.html');
const css=ler('src/laboratorio/loja-cliente-demo.css');
const js=ler('src/laboratorio/loja-cliente-demo.js');
const regra=(seletor,origem=css)=>{
 const i=origem.indexOf(seletor+'{');
 assert.ok(i>=0,'regra ausente '+seletor);
 return origem.slice(i+seletor.length+1,origem.indexOf('}',i));
};

test('quatro filtros na ordem autorizada, sem alterar os IDs e as classes',()=>{
 const itens=[...html.matchAll(/data-akitemm-cor="(CINZA|VERDE|DOURADO|ROXO)"[^>]*>[^<]*<i[^>]*><\/i>([^<]*)<\/button>/g)]
   .map(x=>({cor:x[1],nome:x[2].trim()}));
 assert.deepEqual(itens,[
  {cor:'CINZA',nome:'Cinza · Compra comum'},
  {cor:'VERDE',nome:'Verde · Qualificado'},
  {cor:'DOURADO',nome:'Dourado · Qualificado'},
  {cor:'ROXO',nome:'Roxo · Ofertas especiais'}]);
 assert.match(html,/A cor não garante contemplação/);
 assert.match(js,/botao\.addEventListener\('click',\(\)=>escolherCor\(botao\.dataset\.akitemmCor\)\)/);
});

test('legenda em duas colunas no PC e celular; 4 colunas PC e 2 no celular',()=>{
 const legenda=regra('.akitemm-loja .akitemm-legenda-cores');
 assert.match(legenda,/display:grid/);
 assert.match(legenda,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 const desktop=regra('.akitemm-loja #catalogoLojaLoop');
 assert.match(desktop,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:800px\)\{\s*\.akitemm-loja #catalogoLojaLoop\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test('dez abas de 40 espacos em fileiras horizontais; filtros continuam com layout anterior',()=>{
 assert.match(js,/TOTAL_ABAS=10,COLUNAS_FAIXA=10,LINHAS_ABA=4,VAGAS_ABA=40/);
 assert.match(js,/const linhas=expandida\?LINHAS_ABA:2/);
 assert.match(js,/const indice=abaProdutos\*VAGAS_ABA\+i/);
 assert.match(js,/el\('akitemmCarregarMais'\)\.textContent=expandida/);
 assert.match(js,/quantidadeVitrine\+=tamanhoPaginaVitrine\(\)/);
 assert.match(js,/itensExibidos=itens\.slice\(0,quantidadeVitrine\)/);
 assert.match(js,/alvo\.append\(card\)/);
});
