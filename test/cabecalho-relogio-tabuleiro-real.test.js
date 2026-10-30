'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ultimoEventoValidoDoTabuleiro}=require('../src/domain/escritorio-individual-demo');

test('relogio nao fabrica evento onde nao ha registro valido no motor',()=>{
 assert.equal(ultimoEventoValidoDoTabuleiro({vendasDoCiclo:[],ciclosConcluidos:[]}),null);
 assert.equal(ultimoEventoValidoDoTabuleiro({vendasDoCiclo:[{registradaEm:'invalida'}],ciclosConcluidos:[]}),null);
 assert.equal(ultimoEventoValidoDoTabuleiro({vendasDoCiclo:[{}],ciclosConcluidos:[]}),null);
});

test('relogio do tabuleiro aponta o ultimo evento persistido, ate depois de um giro',()=>{
 const agora=Date.parse('2026-10-19T13:00:00.000Z');
 const concluidos=[{vendas:[{registradaEm:'2026-10-19T12:45:00.000Z'},{registradaEm:'2026-10-19T12:51:00.000Z'}]}];
 const ativos=[{registradaEm:'2026-10-19T12:58:00.000Z'},{registradaEm:'2026-10-19T12:59:07.000Z'}];
 assert.equal(ultimoEventoValidoDoTabuleiro({ciclosConcluidos:concluidos,vendasDoCiclo:ativos},agora),
  '2026-10-19T12:59:07.000Z');
 assert.equal(ultimoEventoValidoDoTabuleiro({ciclosConcluidos:concluidos,vendasDoCiclo:[]},agora),
  '2026-10-19T12:51:00.000Z');
});

test('horario invalido ou futuro nao gera marcador e consulta nao altera ciclo',()=>{
 const tabuleiro={vendasDoCiclo:[{registradaEm:'2026-10-20T12:00:00.000Z'},{registradaEm:'2026-10-19 12:00:00'}],ciclosConcluidos:[]};
 const antes=JSON.stringify(tabuleiro);
 assert.equal(ultimoEventoValidoDoTabuleiro(tabuleiro,Date.parse('2026-10-19T13:00:00.000Z')),null);
 assert.equal(JSON.stringify(tabuleiro),antes);
});
