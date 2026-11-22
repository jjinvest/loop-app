'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {renderizarInterfaceAprovada}=require('../src/producao/interface-aprovada-loop');
test('alternar entre visoes mantem o mesmo escritorio',()=>{const html=renderizarInterfaceAprovada();assert.match(html,/id="loopOperadorAtalhos"/);assert.match(html,/id="loopVoltarOperador"/);assert.doesNotMatch(html,/Escritório Virtual · OPERADOR/);});
