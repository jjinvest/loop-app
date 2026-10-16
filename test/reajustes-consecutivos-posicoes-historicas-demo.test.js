'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {EscritorioIndividualDemo}=require('../src/domain/escritorio-individual-demo');
const {ConfiguracaoValorLoopDemoSQLite,compararParcelaAntigaComNova}=
 require('../src/domain/configuracao-valor-loop-demo-sqlite');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');
const tem=(hhmm)=>'2026-10-15T'+hhmm+':00.000Z';
test('reajustes 250 -> 500 -> 750 preservam tres referencias individuais na mesma fila',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 let horarioMudanca=tem('10:30');
 const config=new ConfiguracaoValorLoopDemoSQLite({
  banco:repo.banco,agora:()=>horarioMudanca
 });
 const pedidos=new PedidosTitularidadeDemoSQLite({banco:repo.banco,contas,
  relogio:()=>tem('09:00')});
 const eventos=new Map();
 const ponte=new PonteComprasConvitesDemoSQLite({
  banco:repo.banco,contas,pedidosIdentificados:pedidos,configuracaoValor:config,
  consultarPagamentoConfiavel:async pedidoId=>eventos.get(pedidoId),
  relogio:()=>tem('13:00')
 });
 const cliente=contas.cadastrar({
  nome:'Cliente Referencias Historicas',
  email:'referencias@exemplo.invalid',
  senha:'senha-apenas-de-laboratorio'
 });
 async function compra(pedidoId,valorCentavos,confirmadoEm){
  const pedido=pedidos.preparar({pedidoId,contaId:cliente.contaId,
   produtoId:'produto-vitrine-ficticio',valorCentavos});
  eventos.set(pedidoId,{...pedido,status:STATUS_CONFIRMADO,confirmadoEm});
  return ponte.processar({pedidoId});
 }
 const a=await compra('pedido-valor-250',25000,tem('10:00'));
 assert.equal(a.valorReferenciaPosicaoCentavos,25000);
 assert.equal(a.revisaoValorPosicao,1);
 config.alterar({valorCentavos:50000,revisaoEsperada:1});
 const somenteLoja=await compra('venda-somente-loja-250',25000,tem('11:00'));
 assert.equal(somenteLoja.posicaoCriada,false);
 const b=await compra('pedido-valor-500',50000,tem('11:00'));
 assert.equal(b.valorReferenciaPosicaoCentavos,50000);
 assert.equal(b.revisaoValorPosicao,2);
 horarioMudanca=tem('11:30');
 config.alterar({valorCentavos:75000,revisaoEsperada:2});
 const c=await compra('pedido-valor-750',75000,tem('12:00'));
 assert.equal(c.valorReferenciaPosicaoCentavos,75000);
 assert.equal(c.revisaoValorPosicao,3);
 const info=new EscritorioIndividualDemo({contas,ponte}).consultar(cliente.contaId);
 assert.equal(info.compras.length,3);
 assert.equal(info.comprasLojaSemLoop.length,1);
 assert.equal(info.posicoes.length,3);
 assert.equal(info.vagasLivres,2);
 assert.deepEqual(info.posicoes.map(x=>x.valorReferenciaCentavos),[25000,50000,75000]);
 assert.deepEqual(info.posicoes.map(x=>x.revisaoValor),[1,2,3]);
 assert.ok(info.posicoes.every(x=>x.local==='FILA_B'));
 assert.deepEqual(ponte.consultar().valoresDeCadaPosicao.map(x=>x.valorReferenciaCentavos),
  [25000,50000,75000]);
 assert.equal(ponte.consultar().filas.A.quantidade,0);
 assert.equal(ponte.consultar().filas.B.quantidade,3);
 assert.equal((await ponte.processar({pedidoId:'pedido-valor-250'})).valorReferenciaPosicaoCentavos,25000);
 const confirmadas=ponte.consultar().compras.length;
 assert.equal(confirmadas,3);
 assert.equal(config.historico().length,3);
 assert.throws(()=>repo.banco.exec('DELETE FROM admin_ponte_posicoes_valores_demo'),/imutavel/);
});
test('reduzir referencia nova nao apaga promessa historica; relatorio mostra deficit',()=>{
 const c=compararParcelaAntigaComNova({
  valorCentroOriginalCentavos:50000,valorNovaVendaLoopCentavos:25000,
  evento:'PARTICIPANTE'
 });
 assert.equal(c.referenciaHistoricaParticipanteCentavos,50000);
 assert.equal(c.valorParticipanteCentavos,25000);
 assert.equal(c.deficitDeCoberturaCentavos,25000);
 assert.equal(c.exigeAnaliseDeCobertura,true);
 assert.equal(c.valorEmpresaPropostoCentavos,0);
 assert.equal(c.preservaValorOriginalDaPosicao,true);
 assert.equal(c.dinheiroMovimentado,false);
 const subiu=compararParcelaAntigaComNova({
  valorCentroOriginalCentavos:25000,valorNovaVendaLoopCentavos:50000,
  evento:'PARTICIPANTE'
 });
 assert.equal(subiu.deficitDeCoberturaCentavos,0);
 assert.equal(subiu.valorParticipanteCentavos,25000);
 assert.equal(subiu.valorEmpresaPropostoCentavos,25000);
});
