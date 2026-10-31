'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');

test('Meus Pedidos lista apenas pedidos do titular autenticado no laboratorio',()=>{
 const banco=new DatabaseSync(':memory:');
 try{
  const contas=new ContasParticipantesDemoSQLite({banco});
  const pedidos=new PedidosTitularidadeDemoSQLite({banco,contas});
  const a=contas.cadastrar({nome:'Cliente Teste Um',email:'um@example.invalid',senha:'senha-forte-teste-01'});
  const b=contas.cadastrar({nome:'Cliente Teste Dois',email:'dois@example.invalid',senha:'senha-forte-teste-02'});
  pedidos.preparar({pedidoId:'pedido-um',contaId:a.contaId,produtoId:'curso',valorCentavos:25000});
  pedidos.preparar({pedidoId:'pedido-dois',contaId:b.contaId,produtoId:'curso',valorCentavos:25000});
  assert.deepEqual(pedidos.listarPorTitular(a.contaId).map(p=>p.pedidoId),['pedido-um']);
  assert.deepEqual(pedidos.listarPorTitular(b.contaId).map(p=>p.pedidoId),['pedido-dois']);
  assert.equal(pedidos.listarPorTitular(a.contaId)[0].valorCentavos,25000);
  assert.equal(pedidos.listarPorTitular(a.contaId)[0].contaId,undefined);
  assert.equal(pedidos.listarPorTitular(b.contaId)[0].produtoId,'curso');
  assert.throws(()=>pedidos.listarPorTitular('invalido'),{codigo:'PEDIDO_INVALIDO'});
 }finally{banco.close();}
});
