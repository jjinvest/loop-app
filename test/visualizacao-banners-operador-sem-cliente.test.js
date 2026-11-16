'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('banners mostram fotos ao operador sem abrir imagem particular a visitantes',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'../src/candidato/checkout-candidato-ui.js'),'utf8');
 const server=fs.readFileSync(path.join(__dirname,'../src/candidato/servidor-loja-escritorio-candidato.js'),'utf8');
 assert.match(ui,/const baseBanners=modoOperadorSemCliente\?/);
 assert.match(ui,/\/staging\/escritorio-unificado\/banners-escritorio/);
 assert.match(ui,/\/staging\/banners-escritorio/);
 assert.match(ui,/img\.src=baseBanners\+'\/'\+b\.slot\+'\/imagem'/);
 assert.match(server,/app\.get\('\/staging\/banners-escritorio'/);
 assert.match(server,/if\(!contas\.sessao\(req\)\)return res\.status\(401\)/);
 assert.match(server,/app\.get\('\/staging\/escritorio-unificado\/banners-escritorio'/);
 assert.match(server,/app\.get\('\/staging\/escritorio-unificado\/banners-escritorio\/:slot\/imagem'/);
});
