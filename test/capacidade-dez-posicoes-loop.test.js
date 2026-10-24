'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {LIMITE_POSICOES_ATIVAS}=require('../src/domain/capacidade-posicoes-loop');
const {criarVisaoEscritorioDemo}=require('../src/domain/visao-escritorio-demo');
const titulares=[{id:'cliente',nome:'Cliente'}];
const posicoes=n=>Array.from({length:n},(_,i)=>({id:'p-'+i,titularId:'cliente',situacao:'ATIVA',local:'FILA',fila:'B'}));
test('limite de dez posicoes tem fonte unica',()=>{
 assert.equal(LIMITE_POSICOES_ATIVAS,10);
 const nove=criarVisaoEscritorioDemo({titularId:'cliente',titulares,posicoes:posicoes(9)});
 assert.equal(nove.vagasDisponiveis,1);
 const dez=criarVisaoEscritorioDemo({titularId:'cliente',titulares,posicoes:posicoes(10)});
 assert.equal(dez.vagasDisponiveis,0);
 assert.equal(dez.posicoesAtivas,10);
 assert.throws(()=>criarVisaoEscritorioDemo({titularId:'cliente',titulares,posicoes:posicoes(11)}),/Limite/);
});
