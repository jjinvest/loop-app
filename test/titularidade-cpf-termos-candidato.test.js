'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalizarCpf}=require('../src/domain/titularidade-cpf-termos-candidato');
test('rejeita CPF invalido e repetido no ensaio',()=>{
 assert.throws(()=>normalizarCpf('00000000000'),/CPF_INVALIDO/);
 assert.throws(()=>normalizarCpf('12345678900'),/CPF_INVALIDO/);
 assert.throws(()=>normalizarCpf(''),/CPF_INVALIDO/);
});
