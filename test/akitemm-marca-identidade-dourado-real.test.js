'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('marca da loja usa as mesmas cores do LOOP 3.0 aprovado',()=>{
 const css=fs.readFileSync(path.join(__dirname,
  '../src/laboratorio/loja-cliente-demo.css'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,
  '../src/laboratorio/loja-cliente-demo.html'),'utf8');
 const shell=fs.readFileSync(path.join(__dirname,
  '../src/laboratorio/loop-03-shell.css'),'utf8');
 const parte=css.slice(css.indexOf('/* Identidade aprovada do Escritório:'));
 assert.ok(parte.length>250,'regra definitiva da marca precisa existir');
 assert.match(html,/class="akitemm-marca-loop"/);
 assert.match(html,/LOOP <em>3\.0<\/em>/);
 assert.match(shell,/\.loop03-banner-topo \.loop03-logomarca\{[^\n]*color:#f7c35d/);
 assert.match(parte,/\.akitemm-loja \.akitemm-marca-loop\{[^\n]*color:#f7c35d!important/);
 assert.match(parte,/\.akitemm-loja \.akitemm-marca-loop em\{[^\n]*color:#e5e9f1!important/);
 assert.match(parte,/\.akitemm-loja \.akitemm-marca-loop \.akitemm-anel::before\{[^\n]*color:#f7c35d!important/);
 assert.doesNotMatch(parte,/\.akitemm-loja \.akitemm-marca-loop\{[^\n]*color:#e5e9f1!important/);
});
