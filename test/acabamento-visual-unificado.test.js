'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {renderizarInterfaceAprovada,renderizarLojaAprovada}=
 require('../src/producao/interface-aprovada-loop');
const fonte=fs.readFileSync(path.join(__dirname,
 '../src/shared/acabamento-visual-loop.js'),'utf8');
test('a mesma marca chega ao pré-cadastro e à loja reais',()=>{
 assert.match(renderizarInterfaceAprovada(),/\/identidade\/assets\/acabamento-loop\.js/);
 assert.match(renderizarLojaAprovada(),/\/identidade\/assets\/acabamento-loop\.js/);
 assert.match(fonte,/akitemm-marca-loop/);
 assert.match(fonte,/\.cabecalho \.marca/);
});
test('Todos tem o mesmo destaque de Ofertas; sino dourado',()=>{
 assert.match(fonte,/#akitemmFiltroTodos/);
 assert.match(fonte,/#akitemmFiltroTodos\[aria-pressed="true"\]/);
 assert.match(fonte,/#akitemmSino/);
});
test('sino do escritório fica abaixo da foto na linha de boas-vindas',()=>{
 assert.match(fonte,/boas\.append\(sino\)/);
 assert.match(fonte,/boas\.append\(avisos\)/);
 assert.match(fonte,/loop03AlterarFotoTopo/);
});
