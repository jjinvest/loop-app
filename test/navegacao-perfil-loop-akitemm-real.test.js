'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {renderizarInterfaceAprovada}=
 require('../src/producao/interface-aprovada-loop');

test('Meus Pedidos e banners seguem a mesma visao entre LOOP e AKITEMM',()=>{
 const html=renderizarInterfaceAprovada();
 assert.match(html,
  /class="loop03-pedidos-atalhos"[\s\S]*?<a href="\/loja">Ir à AKITEMM<\/a>/);
 const js=fs.readFileSync('src/producao/interface-aprovada-contas.js','utf8');
 const inicio=js.indexOf(' function acessosAkitemmDoEscritorio(){');
 const fim=js.indexOf(' // O gateway verifica a sessão administrativa isolada',inicio);
 assert.ok(inicio>0&&fim>inicio,'helper de navegacao presente');
 const codigo=js.slice(inicio,fim);
 const links=Array.from({length:8},()=>({
  href:null,setAttribute(atributo,valor){
   assert.equal(atributo,'href');this.href=valor;
  }
 }));
 let seletor='';
 const direcionar=vm.runInNewContext(codigo+'; direcionarAcessosAkitemm',{
  document:{querySelectorAll(s){seletor=s;return links;}}
 });
 direcionar('cliente');
 assert.ok(links.every(a=>a.href==='/loja?visao=cliente'));
 assert.match(seletor,/\.loop03-pedidos-atalhos/);
 assert.match(seletor,/\.loop03-banner-item/);
 assert.match(seletor,/#irParaLoja/);
 direcionar('operador');
 assert.ok(links.every(a=>a.href==='/loja?visao=operador'));
 direcionar(null);
 assert.ok(links.every(a=>a.href==='/loja'));
 assert.match(js,/direcionarAcessosAkitemm\('operador'\)/);
 assert.match(js,/direcionarAcessosAkitemm\('cliente'\)/);
 assert.match(js,/direcionarAcessosAkitemm\(ativo\?/);
});

test('loja nao transforma visao cliente em acesso administrativo',()=>{
 const js=fs.readFileSync('src/producao/interface-aprovada-loja.js','utf8');
 assert.match(js,
  /akitemmEditarConta'\)\.href=visaoClienteLoja\?/);
 assert.match(js,/\/escritorio\?visao=cliente/);
 assert.match(js,/linkRodape\.hidden=!permitido\|\|visaoClienteLoja/);
 const fotos=fs.readFileSync('src/producao/operador-loja-fotos-real.js','utf8');
 assert.match(fotos,/operador=operadorAutenticado&&!visaoClienteSolicitada/);
});
