'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {renderizarInterfaceAprovada,renderizarLojaAprovada}=
 require('../src/producao/interface-aprovada-loop');
const css=fs.readFileSync('src/producao/harmonia-toque-real.css','utf8');
test('mesma harmonizacao de toque externa no LOOP e na AKITEMM',()=>{
 const link='<link rel="stylesheet" href="/identidade/assets/harmonia-toque-real.css">';
 for(const html of [renderizarInterfaceAprovada(),renderizarLojaAprovada()])
  assert.ok(html.includes(link),'falta CSS na interface publicada');
 const js=fs.readFileSync('src/producao/interface-aprovada-loop.js','utf8');
 assert.ok(js.includes("'./harmonia-toque-real.css'"));
});
test('destaque quadrado Android sai sem alterar geometria ou identidade visual',()=>{
 assert.ok(css.includes('-webkit-tap-highlight-color:transparent'));
 assert.ok(css.includes('@media (hover:none) and (pointer:coarse)'));
 assert.ok(css.includes(':focus:not(:focus-visible)'));
 assert.ok(css.includes(':where(.akitemm-loja,.cliente-integrado'));
 assert.doesNotMatch(css,/\b(?:border-radius|padding|margin|width|height|display|position|transform|background|color|font|grid|flex|box-shadow)\s*:/);
 const servidor=fs.readFileSync('src/producao/servidor-identidade-loop.js','utf8');
 assert.ok(servidor.includes("style-src 'self'"));
});
