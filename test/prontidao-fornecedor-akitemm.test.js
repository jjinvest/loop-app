'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {RegistroFornecedores,CONTRATO_FORNECEDOR}=
 require('../src/integracoes/registro-fornecedores');

test('parceiro existente externamente nao equivale a API ja conectada',()=>{
 const registro=new RegistroFornecedores();
 const diagnostico=registro.diagnosticarIntegracao({
  fornecedorId:'franquia_real_pendente'
 });
 assert.equal(diagnostico.adaptadorConectado,false);
 assert.equal(diagnostico.checkoutHabilitado,false);
 assert.deepEqual(diagnostico.pendencias,[
  'ADAPTADOR_API_FORNECEDOR_NAO_CONECTADO'
 ]);
});

test('capacidade do fornecedor se avalia sem emitir pedidos nem simular frete',()=>{
 const r=new RegistroFornecedores();
 let requisicoes=0;
 const adaptador={
  versaoContrato:CONTRATO_FORNECEDOR,
  async consultarEstoque(){requisicoes++;return {quantidade:12};},
  async consultarStatus(){requisicoes++;return {status:'PENDENTE'};},
  async cotarFrete(){requisicoes++;return {opcoes:[]};},
  async enviarPedidoIdempotente(){requisicoes++;throw Error('NAO ENVIAR');},
  async consultarPedidoPorChave(){requisicoes++;throw Error('NAO RECONSULTAR');}
 };
 r.registrar({fornecedorId:'franquia',adaptador});
 const diagnostico=r.diagnosticarIntegracao({fornecedorId:'franquia'});
 assert.equal(diagnostico.adaptadorConectado,true);
 assert.equal(diagnostico.freteRealDisponivel,true);
 assert.equal(diagnostico.pedidosExternosDisponiveis,true);
 assert.equal(diagnostico.checkoutHabilitado,false,
  'metodos presentes nao demonstram API homologada nem PSP aprovado');
 assert.equal(diagnostico.apiHomologada,false);
 assert.deepEqual(diagnostico.pendencias,[]);
 assert.equal(requisicoes,0,'diagnostico nunca deve enviar pedidos ou dados');
});

test('compatibilidade v1 com fornecedores atuais e pendencias de pedido',()=>{
 const r=new RegistroFornecedores();
 r.registrar({fornecedorId:'franquia',adaptador:{
  versaoContrato:CONTRATO_FORNECEDOR,
  async consultarEstoque(){return {quantidade:2};},
  async consultarStatus(){return {status:'PENDENTE'};}
 }});
 const result=r.diagnosticarIntegracao({fornecedorId:'franquia'});
 assert.equal(result.adaptadorConectado,true);
 assert.equal(result.freteRealDisponivel,false);
 assert.equal(result.pedidosExternosDisponiveis,false);
 assert.ok(result.pendencias.includes('API_SEM_COTARFRETE'));
 assert.ok(result.pendencias.includes('API_SEM_ENVIARPEDIDOIDEMPOTENTE'));
 assert.ok(result.pendencias.includes('API_SEM_CONSULTARPEDIDOPORCHAVE'));
 assert.equal(result.checkoutHabilitado,false);
});
