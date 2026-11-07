'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {planejarPosicoesCompraAkitemm}=require('../src/domain/plano-posicoes-compra-akitemm');
const {planejarRecebimentoTresBancos}=
 require('../src/domain/plano-roteamento-tres-bancos-lab');
const foto=(m={})=>({
 prepedidoId:'hom-00000000-0000-0000-0000-000000000001',
 totalBrutoCotadoCentavos:50000,
 quantidadePosicoesPlanejadas:1,
 referenciaLoopPrevistaCentavos:25000,
 custoFornecedorPrevistoCentavos:17500,
 fretePrevistoCentavos:1500,
 tarifaPspPrevistaCentavos:500,
 reservaTributariaEstimadaCentavos:500,
 custosCompletos:true,
 itens:[{produtoId:'produto-teste-dourado',quantidade:1}],
 ...m
});
test('venda R$500: 1 posicao dourada, R$250 LOOP, loja liquida menos taxa, fornecedor pendente',()=>{
 const pos=planejarPosicoesCompraAkitemm([{
  produtoId:'produto-teste-dourado',classificacao:'DOURADO',
  quantidade:1,precoUnitarioCentavos:50000,subtotalCentavos:50000
 }]);
 assert.equal(pos.valorTotalCentavos,50000);
 assert.equal(pos.quantidadePosicoesPrevistas,1);
 const plano=planejarRecebimentoTresBancos({fotografia:foto()});
 assert.equal(plano.valorBrutoCotadoCentavos,50000);
 assert.equal(plano.loopReservarCentavos,25000);
 assert.equal(plano.valorLiquidoPrevistoCentavos,49500);
 assert.equal(plano.sobraComercialPrevistaCentavos,24500);
 assert.equal(plano.fornecedorAPagarPrevistoCentavos,17500);
 assert.equal(plano.freteReservarPrevistoCentavos,1500);
 assert.equal(plano.margemComercialEstimadaCentavos,5000);
 assert.equal(plano.valorLiquidoPrevistoCentavos,
  plano.loopReservarCentavos+plano.sobraComercialPrevistaCentavos);
 assert.equal(plano.sobraComercialPrevistaCentavos,
  plano.fornecedorAPagarPrevistoCentavos+plano.freteReservarPrevistoCentavos+
  foto().reservaTributariaEstimadaCentavos+plano.margemComercialEstimadaCentavos);
 assert.deepEqual(plano.receptores.map(x=>x.destino),[
  'LOOP_INTER','LOJA_MERCADO_PAGO','COFRES_LATERAIS_TERCEIRO_BANCO']);
 assert.equal(plano.receptores[0].montantePrevistoCentavos,25000);
 assert.equal(plano.receptores[1].montantePrevistoCentavos,24500);
 assert.equal(plano.receptores[2].montantePrevistoCentavos,null);
 assert.equal(plano.estado,'PREVISAO_NAO_EXECUTADA');
 assert.equal(plano.alerta,'PLANO_CONTABIL_CONSISTENTE');
 assert.ok(plano.receptores.every(x=>!x.contaConectada&&!x.transferenciaExecutada));
 assert.equal(plano.splitAsaasParaBancoExterno,false);
 assert.equal(plano.liquidacaoPspRealComprovada,false);
 assert.equal(plano.taxaPspRealComprovada,false);
 assert.equal(plano.transferenciaInterRealConfirmada,false);
 assert.equal(plano.transferenciaMercadoPagoRealConfirmada,false);
 assert.equal(plano.fornecedorPagoCentavos,0);
 assert.equal(plano.fornecedorPagamentoConfirmado,false);
 assert.equal(plano.caixaCentroSacavelCentavos,0);
 assert.equal(plano.cofreLateralSacavelCentavos,0);
});
test('sem custo cadastrado nao inventa pagamento ao fornecedor nem margem',()=>{
 const p=planejarRecebimentoTresBancos({fotografia:foto({
  custoFornecedorPrevistoCentavos:null,fretePrevistoCentavos:null,
  custosCompletos:false,reservaTributariaEstimadaCentavos:null
 })});
 assert.equal(p.alerta,'CUSTOS_INCOMPLETOS');
 assert.equal(p.fornecedorAPagarPrevistoCentavos,null);
 assert.equal(p.freteReservarPrevistoCentavos,null);
 assert.equal(p.margemComercialEstimadaCentavos,null);
 assert.equal(p.fornecedorPagoCentavos,0);
});
test('taxa informada no teste nao e taxa confirmada de um banco',()=>{
 const p=planejarRecebimentoTresBancos({
  fotografia:foto(),taxaRealPspCentavos:800
 });
 assert.equal(p.tarifaPspCentavosParaCalculo,800);
 assert.equal(p.taxaPspInformadaParaSimulacao,true);
 assert.equal(p.taxaPspRealComprovada,false);
 assert.equal(p.sobraComercialPrevistaCentavos,24200);
 assert.equal(p.transferenciaInterRealConfirmada,false);
});
test('quando liquido nao cobre referencia de 250, bloqueia o plano',()=>{
 const p=planejarRecebimentoTresBancos({fotografia:foto({
  tarifaPspPrevistaCentavos:27000
 })});
 assert.equal(p.alerta,'LIQUIDO_INSUFICIENTE_PARA_SEPARAR_LOOP');
 assert.equal(p.receptores[0].montantePrevistoCentavos,null);
 assert.equal(p.receptores[1].montantePrevistoCentavos,null);
 assert.equal(p.estado,'PREVISAO_NAO_EXECUTADA');
});
test('margem projetada negativa gera alerta, nunca transfere valor ausente',()=>{
 const p=planejarRecebimentoTresBancos({fotografia:foto({
  custoFornecedorPrevistoCentavos:25500
 })});
 assert.equal(p.alerta,'MARGEM_COMERCIAL_ESTIMADA_NEGATIVA');
 assert.equal(p.margemComercialEstimadaCentavos,-3000);
 assert.equal(p.fornecedorPagamentoConfirmado,false);
});
test('referencia de LOOP nao pode divergir da quantidade de posicoes',()=>{
 assert.throws(()=>planejarRecebimentoTresBancos({fotografia:foto({
  quantidadePosicoesPlanejadas:2
 })}),/ROTEAMENTO_FOTOGRAFIA_INVALIDA/);
 assert.throws(()=>planejarRecebimentoTresBancos({fotografia:foto(),
  taxaRealPspCentavos:-1}),/ROTEAMENTO_TAXA_PSP_INVALIDA/);
});
