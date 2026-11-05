'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {planejarPosicoesCompraAkitemm}=require('../src/domain/plano-posicoes-compra-akitemm');
const {auditarCoberturaDePedido,REF}=require('../src/domain/auditoria-cobertura-lotes-akitemm');
function item(id,classificacao,preco,quantidade=1,extra={}){
 return {produtoId:id,classificacao,quantidade,precoUnitarioCentavos:preco,
  subtotalCentavos:preco*quantidade,...extra};
}
function pedido(itens){
 const plano=planejarPosicoesCompraAkitemm(itens);
 return {fotografia:{itens,planejamentoPosicoes:plano,totalCentavos:plano.valorTotalCentavos},
  valorPedidoCentavos:plano.valorTotalCentavos};
}
function custos(custo=0){
 return {fornecedorCentavos:custo,pspCentavos:0,tributosCentavos:0,
  freteSuportadoCentavos:0,reservaReembolsosCentavos:0,
  bonusPrevistosCentavos:0,outrosCustosCentavos:0};
}
test('verde de mil reais em um pedido reserva so uma referencia de 250',()=>{
 const r=auditarCoberturaDePedido(pedido([item('verde-100','VERDE',10000,10)]));
 assert.equal(r.totalPosicoesPlanejadas,1);
 assert.equal(r.reservaReferenciaPosicoesCentavos,25000);
 assert.equal(r.diferencaBrutaAposReferenciaCentavos,75000);
 assert.equal(r.exposicaoCondicionalSeTodasPosicoesConcluiremCentavos,75000);
 assert.equal(r.podeLiberarOperacaoReal,false);
 assert.equal(r.estado,'CUSTOS_NAO_COMPROVADOS');
});
test('dourado gera reserva por unidade e nao pelo valor bruto',()=>{
 const r=auditarCoberturaDePedido(pedido([item('ouro-500','DOURADO',50000,2)]));
 assert.equal(r.totalPosicoesPlanejadas,2);
 assert.equal(r.reservaReferenciaPosicoesCentavos,50000);
 assert.equal(r.exposicaoCondicionalSeTodasPosicoesConcluiremCentavos,150000);
});
test('roxo de 250 com cinco posicoes e insuficiente MESMO antes de custos',()=>{
 const r=auditarCoberturaDePedido(pedido([item('evento-250','ROXO',25000,1,
  {posicoesPorUnidadeRoxo:5})]));
 assert.equal(r.estado,'BRUTO_INSUFICIENTE');
 assert.equal(r.reservaReferenciaPosicoesCentavos,125000);
 assert.equal(r.diferencaBrutaAposReferenciaCentavos,-100000);
 assert.ok(r.alertas.includes('REFERENCIA_POR_POSICAO_SUPERA_PRECO_BRUTO'));
});
test('roxo carro 10 mil e cinco posicoes tem cobertura BRUTA, nao liquidez confirmada',()=>{
 const r=auditarCoberturaDePedido(pedido([item('carro-10000','ROXO',1000000,1,
  {posicoesPorUnidadeRoxo:5})]));
 assert.equal(r.diferencaBrutaAposReferenciaCentavos,875000);
 assert.equal(r.estado,'CUSTOS_NAO_COMPROVADOS');
 assert.equal(r.dinheiroRealComprovadoCentavos,0);
 assert.equal(r.validacaoBancariaExecutada,false);
});
test('despesas completas cenario ruim torna resultado insuficiente sem transferir',()=>{
 const p=pedido([item('carro-10000','ROXO',1000000,1,{posicoesPorUnidadeRoxo:5})]);
 const negativo=auditarCoberturaDePedido({...p,custosEstimados:custos(900000)});
 assert.equal(negativo.estado,'INSUFICIENTE_APOS_CUSTOS_ESTIMADOS');
 assert.equal(negativo.saldoAposCustosEReferenciaCentavos,-25000);
 assert.equal(negativo.podeLiberarOperacaoReal,false);
 const positivo=auditarCoberturaDePedido({...p,custosEstimados:custos(800000)});
 assert.equal(positivo.estado,'COBERTURA_ARITMETICA_COM_PREMISSAS_NAO_AUDITADAS');
 assert.equal(positivo.saldoAposCustosEReferenciaCentavos,75000);
 assert.equal(positivo.podeLiberarOperacaoReal,false);
 assert.equal(positivo.dinheiroRealComprovadoCentavos,0);
});
test('compra mista calcula 8 posicoes e ignora cinzas na qualificacao',()=>{
 const p=pedido([
  item('verde-150','VERDE',15000,2),
  item('ouro-350','DOURADO',35000,2),
  item('evento-roxo','ROXO',1000000,1,{posicoesPorUnidadeRoxo:5}),
  item('cinza-900','CINZA',90000)
 ]);
 const r=auditarCoberturaDePedido(p);
 assert.equal(r.totalPosicoesPlanejadas,8);
 assert.equal(r.reservaReferenciaPosicoesCentavos,8*REF);
 assert.equal(r.posicoesVerde,1);
 assert.equal(r.posicoesDourado,2);
 assert.equal(r.posicoesRoxo,5);
});
test('nao presume cobertura com custo parcial ou numeros manipulados',()=>{
 const p=pedido([item('ouro-500','DOURADO',50000)]);
 assert.throws(()=>auditarCoberturaDePedido({...p,
  custosEstimados:{fornecedorCentavos:1}}),/CUSTOS_INCOMPLETOS/);
 assert.throws(()=>auditarCoberturaDePedido({...p,
  custosEstimados:{...custos(),pspCentavos:0.5}}),/CUSTOS_INVALIDOS/);
 assert.throws(()=>auditarCoberturaDePedido({...p,valorPedidoCentavos:60000}),
  /FOTOGRAFIA_PLANO_DIVERGENTE/);
 const adulterada=structuredClone(p.fotografia);
 adulterada.planejamentoPosicoes.quantidadePosicoesPrevistas=10;
 assert.throws(()=>auditarCoberturaDePedido({...p,fotografia:adulterada}),
  /FOTOGRAFIA_PLANO_DIVERGENTE/);
});
test('fotografia antiga sem plano nao eh reinterpretada',()=>{
 const r=auditarCoberturaDePedido({
  fotografia:{itens:[],totalCentavos:25000},valorPedidoCentavos:25000});
 assert.equal(r.estado,'FOTO_SEM_PLANO_VIGENTE');
 assert.equal(r.podeLiberarOperacaoReal,false);
});
