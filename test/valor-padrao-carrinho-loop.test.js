'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {
 VALOR_PADRAO_LOOP_CENTAVOS,VALOR_CICLO_PARTICIPANTE_CENTAVOS,
 VALOR_CICLO_EMPRESA_CENTAVOS,analisarCarrinhoSimulado
}=require('../src/domain/valor-padrao-loop');
function item(produtoId,precoUnitarioCentavos,custoUnitarioCentavos,quantidade=1){
 return {produtoId,precoUnitarioCentavos,custoUnitarioCentavos,quantidade};
}
test('referencia do LOOP passa a ser R$250 sem mudar cinco vendas ou distribuicao 3/2',()=>{
 assert.equal(VALOR_PADRAO_LOOP_CENTAVOS,25000);
 assert.equal(VALOR_CICLO_PARTICIPANTE_CENTAVOS,75000);
 assert.equal(VALOR_CICLO_EMPRESA_CENTAVOS,50000);
});
test('R$249,99 nao pode comprar; R$250 exatos libera valor para checkout futuro',()=>{
 const insuficiente=analisarCarrinhoSimulado({
  itens:[item('item-um',24999,5000)]
 });
 assert.equal(insuficiente.atingeValorReferencia,false);
 assert.equal(insuficiente.botaoCheckoutPodeAparecerPeloValor,false);
 assert.equal(insuficiente.elegivelNaSimulacao,false);
 assert.equal(insuficiente.projecaoPosicoesSeConfirmado,0);
 const minimo=analisarCarrinhoSimulado({
  itens:[item('curso-pdf',25000,0)]
 });
 assert.equal(minimo.precoTotalCentavos,25000);
 assert.equal(minimo.botaoCheckoutPodeAparecerPeloValor,true);
 assert.equal(minimo.elegivelNaSimulacao,true);
 assert.equal(minimo.sobraComercialCentavos,0);
 assert.equal(minimo.criacaoRealDePosicao,false);
});
test('produto unitario de R$50 pode ser somado ao carrinho, mas nao comprado sozinho',()=>{
 const quatro=analisarCarrinhoSimulado({
  itens:[item('produto-cinquenta',5000,1000,4)]
 });
 assert.equal(quatro.precoTotalCentavos,20000);
 assert.equal(quatro.elegivelNaSimulacao,false);
 const cinco=analisarCarrinhoSimulado({
  itens:[item('produto-cinquenta',5000,1000,5)]
 });
 assert.equal(cinco.precoTotalCentavos,25000);
 assert.equal(cinco.elegivelNaSimulacao,true);
 assert.equal(cinco.custoFornecedorCentavos,5000);
 assert.equal(cinco.sobraComercialCentavos,-5000);
 assert.equal(cinco.alertaMargemInsuficiente,true);
 assert.equal(cinco.projecaoPosicoesSeConfirmado,1);
});
test('carrinho com produtos diferentes gera uma unica posicao por pedido',()=>{
 const c=analisarCarrinhoSimulado({itens:[
  item('item-oitenta',8000,2000),
  item('item-noventa',9000,3000),
  item('item-oitenta-dois',8000,1000)
 ],taxasETributosCentavos:600});
 assert.equal(c.precoTotalCentavos,25000);
 assert.equal(c.custoFornecedorCentavos,6000);
 assert.equal(c.sobraComercialCentavos,-6600);
 assert.equal(c.elegivelNaSimulacao,true);
 assert.equal(c.alertaMargemInsuficiente,true);
 assert.equal(c.itensDistintos,3);
 assert.equal(c.projecaoPosicoesSeConfirmado,1);
});
test('produto R$500, fornecedor R$100 e LOOP R$250 deixa R$150 brutos',()=>{
 const c=analisarCarrinhoSimulado({
  itens:[item('produto-quinhentos',50000,10000)]
 });
 assert.equal(c.precoTotalCentavos,50000);
 assert.equal(c.referenciaLoopCentavos,25000);
 assert.equal(c.custoFornecedorCentavos,10000);
 assert.equal(c.sobraComercialCentavos,15000);
 assert.equal(c.elegivelNaSimulacao,true);
 assert.equal(c.alertaMargemInsuficiente,false);
 const comTaxas=analisarCarrinhoSimulado({
  itens:[item('produto-quinhentos',50000,10000)],
  taxasETributosCentavos:3000
 });
 assert.equal(comTaxas.sobraComercialCentavos,12000);
 assert.equal(comTaxas.projecaoPosicoesSeConfirmado,1);
});
test('carrinho inválido ou arredondamento nao cria calculo elegivel',()=>{
 for(const ruim of [
  {itens:[]}, {itens:[item('produto',5000,1000,0)]},
  {itens:[item('produto',5000.2,1000,1)]},
  {itens:[item('produto',-1,1,1)]},
  {itens:[item('produto',5000,-1,1)]},
  {itens:[item('produto',Number.MAX_SAFE_INTEGER,0,100)]},
  {itens:[item('<script>',25000,0)]}
 ])assert.throws(()=>analisarCarrinhoSimulado(ruim));
});
