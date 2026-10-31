'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
const {montarIntegracaoAsaasSandboxLoopLab}=require('../src/domain/montagem-integracao-asaas-sandbox-loop-lab');
test('pedido identificado persiste e impede troca de titular',t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const pedidos=new PedidosTitularidadeDemoSQLite({banco:repo.banco,contas});
 const a=contas.cadastrar({nome:'Cliente Primeiro',email:'primeiro@exemplo.invalid',senha:'senha-ficticia-primeiro'});
 const b=contas.cadastrar({nome:'Cliente Segundo',email:'segundo@exemplo.invalid',senha:'senha-ficticia-segundo'});
 const pedido={pedidoId:'pedido-asaas-isolado',contaId:a.contaId,produtoId:'curso-teste',valorCentavos:25000};
 pedidos.preparar(pedido);
 assert.equal(pedidos.buscar(pedido.pedidoId).contaId,a.contaId);
 assert.throws(()=>pedidos.preparar({...pedido,contaId:b.contaId}));
 assert.equal(pedidos.buscar(pedido.pedidoId).contaId,a.contaId);
});
