'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const base=path.resolve(__dirname,'..');
const css=fs.readFileSync(path.join(base,'src/laboratorio/loja-cliente-demo.css'),'utf8');
const vitrine=fs.readFileSync(path.join(base,'src/laboratorio/loja-cliente-demo.js'),'utf8');
const cssRegra=seletor=>{
 const inicio=css.lastIndexOf(seletor+'{');
 assert.ok(inicio>=0,'Regra ausente: '+seletor);
 return css.slice(inicio+seletor.length+1,css.indexOf('}',inicio));
};

test('acoes de produtos comuns e especiais ocupam a base do cartao',()=>{
 const acoes=cssRegra('.akitemm-loja #catalogoLojaLoop .akitemm-dados-produto > .akitemm-acoes-produto');
 assert.match(acoes,/order:2/);
 assert.match(acoes,/margin-top:auto/);
 const evento=cssRegra('.akitemm-loja #catalogoLojaLoop .akitemm-dados-produto > .datas-promocao-especial-loop');
 assert.match(evento,/order:1/);
 assert.match(vitrine,/dados\.append\(titulo,descricao,preco,acoes\)/);
 assert.match(vitrine,/dados\.append\(adicional\)/);
});

test('botoes dourados e de detalhes tem a mesma altura e texto legivel no celular',()=>{
 const r=cssRegra('.akitemm-loja #catalogoLojaLoop .akitemm-acoes-produto > button');
 assert.match(r,/min-height:44px/);
 assert.match(r,/margin-top:0/);
 assert.match(r,/white-space:normal!important/);
 assert.match(r,/align-items:center/);
 assert.match(r,/justify-content:center/);
 assert.match(r,/text-align:center/);
});

test('pacotes alinhados sem deslocar adicionar e retirar',()=>{
 const adicionar=cssRegra('.akitemm-loja #akitemmGradePacotes .akitemm-card-pacote [data-akitemm-pacote]');
 const retirar=cssRegra('.akitemm-loja #akitemmGradePacotes .akitemm-card-pacote [data-akitemm-retirar-pacote]');
 assert.match(adicionar,/margin-top:auto/);
 assert.match(retirar,/margin-top:0/);
 assert.match(adicionar,/min-height:44px/);
 assert.match(retirar,/min-height:44px/);
});

test('fotos continuam enquadradas sem distorcer e compra continua conectada',()=>{
 assert.match(css,/object-fit:scale-down;object-position:center/);
 assert.match(vitrine,/adicionarBotao\.addEventListener\('click',\(\)=>adicionar\(p\)\)/);
 assert.match(vitrine,/ver\.addEventListener\('click',\(\)=>abrirDetalhes\(p\)\)/);
});
