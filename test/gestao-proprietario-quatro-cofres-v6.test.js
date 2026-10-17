'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {CircuitBreakV6DemoSQLite}=require('../src/domain/circuit-break-v6-demo-sqlite');
const {CircuitBreakPonteV6DemoSQLite}=require('../src/domain/circuit-break-ponte-v6-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');

test('gestao livre no horario, mas movimento apenas solicitado, imutavel e sem afetar catraca',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const pessoa=contas.cadastrar({nome:'Titular Demo Gestao',
  email:'gestao-proprietario@exemplo.invalid',
  senha:'senha-forte-gestao-2026'});
 const comprovante={pedidoId:'pdf-gestao-2026',contaId:pessoa.contaId,
  produtoId:'curso-pdf-demo',status:STATUS_CONFIRMADO,
  valorCentavos:25000,confirmadoEm:'2026-10-17T12:00:00.000Z'};
 const ponte=new PonteComprasConvitesDemoSQLite({
  banco:repo.banco,contas,
  consultarPagamentoConfiavel:async pedido=>pedido===comprovante.pedidoId?comprovante:null});
 await ponte.processar({pedidoId:comprovante.pedidoId});
 const controle=new CircuitBreakV6DemoSQLite({banco:repo.banco});
 const cb=new CircuitBreakPonteV6DemoSQLite({banco:repo.banco,ponte,controle});
 cb.preLancamento.habilitar({valorFixoLoopCentavos:25000});
 assert.throws(()=>cb.gestaoProprietario.solicitar({
  movimentoId:'mov-prop-antes-da-config-001',
  cofreOrigem:'LOOP_CENTRO',destino:'EMPRESA_EXTERNA',valorCentavos:1,
  justificativa:'Pedido de teste sem dinheiro depositado'
 }),{codigo:'SALDO_DEMONSTRATIVO_INSUFICIENTE'});
 cb.preLancamento.registrarAporteFicticio({
  aporteId:'aporte-gestao-2026',pedidoId:'pdf-gestao-2026',
  valorLoopCentavos:25000});
 const resumoOriginal=cb.preLancamento.resumo();
 const registro={movimentoId:'mov-prop-teste-cofre-2026',
  cofreOrigem:'LOOP_ESQUERDA',destino:'EMPRESA_EXTERNA',
  valorCentavos:5000,justificativa:'Movimento de gestao registrado somente no laboratorio'};
 const pedido=cb.gestaoProprietario.solicitar(registro);
 assert.equal(pedido.repetido,false);
 assert.equal(pedido.status,'PENDENTE_CONCILIACAO_REAL');
 assert.equal(pedido.dinheiroTransferidoCentavos,0);
 assert.equal(pedido.confirmadoBancariamente,false);
 assert.equal(cb.gestaoProprietario.solicitar(registro).repetido,true);
 assert.throws(()=>cb.gestaoProprietario.solicitar({...registro,
  valorCentavos:6000}),{codigo:'CONFLITO_IDEMPOTENCIA'});
 assert.throws(()=>cb.gestaoProprietario.solicitar({
  ...registro,movimentoId:'mov-prop-teste-muito-alto-2026',valorCentavos:20000
 }),{codigo:'SALDO_DEMONSTRATIVO_INSUFICIENTE'});
 assert.throws(()=>cb.gestaoProprietario.solicitar({
  ...registro,movimentoId:'mov-prop-estorno-invalido-2026',destino:'ESTORNO_COMERCIAL'
 }),{codigo:'ORIGEM_DESTINO_INVALIDOS'});
 const lista=cb.gestaoProprietario.listar();
 assert.equal(lista.registros.length,1);
 assert.equal(lista.totalDebitadoDosCofresCentavos,0);
 assert.equal(lista.dinheiroTransferidoCentavos,0);
 assert.deepEqual(cb.preLancamento.resumo(),resumoOriginal);
 assert.equal(cb.resumo().girosConcluidos,0);
 assert.equal(cb.conciliacao.conferir().quantidadeDivergencias,0);
 assert.throws(()=>repo.banco.exec(
  'DELETE FROM loop_v6_gestao_cofres_solicitacoes_demo'),/solicitacao de gestao imutavel/);
});

test('pedidos administrativos sem autenticação e sem campos exatos são recusados',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 const segredo='gestao-administrativa-local-2026-forte';
 const server=criarAppAdminLaboratorio({repositorio:repo,segredo})
  .listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url='http://127.0.0.1:'+server.address().port+
  '/api/admin/circuit-break-v6-demo/ponte/gestao-proprietario';
 assert.equal((await fetch(url)).status,401);
 const hs={Authorization:'Bearer '+segredo,'Content-Type':'application/json'};
 assert.equal((await fetch(url,{headers:hs})).status,200);
 const bad=await fetch(url,{method:'POST',headers:hs,body:JSON.stringify({
  movimentoId:'mov-prop-id-2026',cofreOrigem:'LOOP_CENTRO',
  destino:'EMPRESA_EXTERNA',valorCentavos:1,
  justificativa:'teste de movimento no escritorio',liberarPix:true
 })});
 assert.equal(bad.status,400);
 const withoutConfig=await fetch(url,{method:'POST',headers:hs,body:JSON.stringify({
  movimentoId:'mov-prop-id-2026',cofreOrigem:'LOOP_CENTRO',
  destino:'EMPRESA_EXTERNA',valorCentavos:1,
  justificativa:'teste de movimento no escritorio'
 })});
 assert.equal(withoutConfig.status,409);
 const publico=require('../src/server').listen(0,'127.0.0.1');
 await once(publico,'listening');
 t.after(()=>new Promise(resolve=>publico.close(resolve)));
 assert.equal((await fetch('http://127.0.0.1:'+publico.address().port+
  '/api/admin/circuit-break-v6-demo/ponte/gestao-proprietario')).status,404);
});
