'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const { once } = require('node:events');
const { RepositorioCatalogoMemoria } = require('../src/domain/repositorio-catalogo-memoria');
const { validarProduto } = require('../src/domain/catalogo');
const { criarRouterCatalogo } = require('../src/routes/catalogo');
const { RegistroFornecedores, CONTRATO_FORNECEDOR } = require('../src/integracoes/registro-fornecedores');

function modelo(id) {
  return {
    id, nome: 'Produto Teste ' + id, descricao: 'Demonstracao do LOOP',
    tipo: 'FISICO', estado: 'DEMONSTRACAO', precoCentavos: null,
    entrega: 'FORNECEDOR_INTEGRADO', fotos: [],
    videoApresentacaoUrl: null, detalhes: ['Logistica terceirizada']
  };
}

test('repositorio do catalogo permite cadastrar e atualizar sem mudar a rota', async (t) => {
  const memoria = new RepositorioCatalogoMemoria({ produtos: [modelo('produto-a')] });
  const app = express();
  app.use('/catalogo', criarRouterCatalogo({repositorio: memoria}));
  const server = app.listen(0, '127.0.0.1');
  await once(server,'listening');
  t.after(()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve())));
  const url = 'http://127.0.0.1:' + server.address().port;
  const listar = async () => (await (await fetch(url+'/catalogo')).json()).produtos;

  assert.deepEqual((await listar()).map(p=>p.id),['produto-a']);
  memoria.salvar(modelo('produto-b'));
  assert.deepEqual((await listar()).map(p=>p.id),['produto-a','produto-b']);

  memoria.atualizar('produto-a',{nome:'Novo nome',descricao:'Outra descricao'});
  const atualizado = await (await fetch(url+'/catalogo/produto-a')).json();
  assert.equal(atualizado.produto.nome,'Novo nome');
  assert.equal(atualizado.produto.compraDisponivel,false);
  assert.equal((await fetch(url+'/catalogo/nao-existe')).status,404);

  const copiado = memoria.buscar('produto-a');
  copiado.nome = 'ALTERADO FORA DO REPOSITORIO';
  assert.equal(memoria.buscar('produto-a').nome,'Novo nome');
  assert.equal(memoria.atualizar('nao-existe',{nome:'x'}),null);
  assert.throws(()=>memoria.salvar({...modelo('produto-invalido'), fotos:['javascript:alert(1)']}),/Fotos/);
});

test('contrato de catalogo suporta outro repositorio assincrono mantendo URLs', async (t) => {
  const repositorio = {
    listar: async () => [validarProduto(modelo('produto-externo'))],
    buscar: async id => id==='produto-externo' ? validarProduto(modelo(id)) : null
  };
  const app = express();
  app.use('/catalogo',criarRouterCatalogo({repositorio}));
  const server = app.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve())));
  const base='http://127.0.0.1:'+server.address().port;
  assert.equal((await (await fetch(base+'/catalogo')).json()).produtos[0].id,'produto-externo');
  assert.equal((await (await fetch(base+'/catalogo/produto-externo')).json()).produto.id,'produto-externo');
  assert.throws(()=>criarRouterCatalogo({repositorio:{listar:()=>[]}}),/listar e buscar/);
});

function fornecedorDemo(quantidade, status='PENDENTE') {
  return {
    versaoContrato: CONTRATO_FORNECEDOR,
    consultarEstoque: async ({sku}) => ({quantidade}),
    consultarStatus: async ({pedidoParceiroId}) => ({status})
  };
}

test('fornecedor pode ser trocado sem mudar a loja nem o motor de filas', async () => {
  const registro=new RegistroFornecedores();
  registro.registrar({fornecedorId:'parceiro-a',adaptador:fornecedorDemo(3)});
  assert.deepEqual(await registro.consultarEstoque({fornecedorId:'parceiro-a',sku:'camiseta-1'}),{
    fornecedorId:'parceiro-a',sku:'camiseta-1',quantidade:3,disponivel:true
  });
  registro.substituir({fornecedorId:'parceiro-a',adaptador:fornecedorDemo(0,'ENTREGUE')});
  assert.equal((await registro.consultarEstoque({fornecedorId:'parceiro-a',sku:'camiseta-1'})).disponivel,false);
  assert.equal((await registro.consultarStatus({fornecedorId:'parceiro-a',pedidoParceiroId:'pedido1'})).status,'ENTREGUE');
  registro.registrar({fornecedorId:'parceiro-b',adaptador:fornecedorDemo(99)});
  assert.equal((await registro.consultarEstoque({fornecedorId:'parceiro-b',sku:'camiseta-1'})).quantidade,99);
});

test('contratos de fornecedor falham de forma fechada em respostas inesperadas', async () => {
  const reg=new RegistroFornecedores();
  const adapter=fornecedorDemo(2);
  reg.registrar({fornecedorId:'ok',adaptador:adapter});
  assert.throws(()=>reg.registrar({fornecedorId:'ok',adaptador:adapter}),/ja cadastrado/);
  assert.throws(()=>reg.registrar({fornecedorId:'errado',adaptador:{versaoContrato:2}}),/contrato v1/);
  assert.throws(()=>reg.substituir({fornecedorId:'ausente',adaptador:adapter}),/nao encontrado/);
  await assert.rejects(reg.consultarEstoque({fornecedorId:'nao-existe',sku:'x'}),/nao cadastrado/);
  await assert.rejects(reg.consultarEstoque({fornecedorId:'ok',sku:'../../../senha'}),/sku invalido/);
  reg.substituir({fornecedorId:'ok',adaptador:fornecedorDemo(-1)});
  await assert.rejects(reg.consultarEstoque({fornecedorId:'ok',sku:'item'}),/estoque invalido/);
  reg.substituir({fornecedorId:'ok',adaptador:fornecedorDemo(1,'STATUS_DESCONHECIDO')});
  await assert.rejects(reg.consultarStatus({fornecedorId:'ok',pedidoParceiroId:'pedido1'}),/status invalido/);
});
