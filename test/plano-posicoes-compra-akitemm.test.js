'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {planejarPosicoesCompraAkitemm:plano}=require('../src/domain/plano-posicoes-compra-akitemm');
function item(id,cor,preco,quantidade=1,extra={}){
 return {produtoId:id,classificacao:cor,quantidade,
  precoUnitarioCentavos:preco,subtotalCentavos:preco*quantidade,...extra};
}
test('verde nunca gera quatro posicoes por uma compra de mil reais',()=>{
 const mil=plano([item('verde-1','VERDE',10000,10)]);
 assert.equal(mil.posicoesVerde,1);
 assert.equal(mil.quantidadePosicoesPrevistas,1);
 assert.equal(mil.valorVerdeConsideradoCentavos,100000);
 assert.equal(plano([item('verde-1','VERDE',24900)]).posicoesVerde,0);
 assert.equal(plano([item('verde-1','VERDE',25000)]).posicoesVerde,1);
});
test('cinza ignora preco e nao completa o limite do verde',()=>{
 const p=plano([item('cinza-1','CINZA',100000),
  item('verde-1','VERDE',24900)]);
 assert.equal(p.quantidadePosicoesPrevistas,0);
 assert.equal(p.valorVerdeConsideradoCentavos,24900);
});
test('dourado uma por unidade, mesmo quando custa acima do piso',()=>{
 const p=plano([item('ouro-500','DOURADO',50000,3)]);
 assert.equal(p.posicoesDourado,3);
 assert.equal(p.posicoesVerde,0);
 assert.equal(p.quantidadePosicoesPrevistas,3);
 assert.throws(()=>plano([item('ouro-200','DOURADO',20000)]),
  /DOURADO_SEM_PISO_UNITARIO/);
});
test('roxo usa configuracao explicita e nao preco dividido por 250',()=>{
 const p=plano([item('carro-10k','ROXO',1000000,1,{posicoesPorUnidadeRoxo:5})]);
 assert.equal(p.posicoesRoxo,5);
 assert.equal(p.quantidadePosicoesPrevistas,5);
 const pendente=plano([item('carro-10k','ROXO',1000000)]);
 assert.equal(pendente.pendenciasConfiguracaoRoxo,1);
 assert.equal(pendente.podeVincularEnsaio,false);
});
test('compra mista: verde 1, dourado 2, roxo configurado 5 e cinza 0',()=>{
 const p=plano([item('verde-100','VERDE',10000,3),
  item('ouro-350','DOURADO',35000,2),
  item('carro-10k','ROXO',1000000,1,{posicoesPorUnidadeRoxo:5}),
  item('cinza-1000','CINZA',100000)]);
 assert.equal(p.quantidadePosicoesPrevistas,8);
 assert.equal(p.posicoesVerde,1);assert.equal(p.posicoesDourado,2);
 assert.equal(p.posicoesRoxo,5);assert.equal(p.podeVincularEnsaio,true);
 assert.equal(p.direitosReaisCriados,0);
});
test('mais de dez bloqueia vinculo sem arredondar ou perder posicoes',()=>{
 const p=plano([item('carro-10k','ROXO',1000000,2,{posicoesPorUnidadeRoxo:6})]);
 assert.equal(p.quantidadePosicoesPrevistas,12);
 assert.equal(p.excedeLimitePorPedido,true);
 assert.equal(p.podeVincularEnsaio,false);
});

test('ROXO por pedido: 4 tenis = 0, 5 = 1, 10 = 1, sem duplicar por unidade',()=>{
 const tenis=quantidade=>item('tenis-especial','ROXO',12000,quantidade,{
  modoRoxo:'POR_PEDIDO',quantidadeMinimaRoxo:5,posicoesPorPedidoRoxo:1});
 for(const [qt,esperado] of [[4,0],[5,1],[10,1]]){
  const p=plano([tenis(qt)]);
  assert.equal(p.posicoesRoxo,esperado);
  assert.equal(p.quantidadePosicoesPrevistas,esperado);
  assert.equal(p.pendenciasConfiguracaoRoxo,0);
  assert.equal(p.detalhamento[0].quantidadePosicoes,esperado);
  assert.equal(p.podeVincularEnsaio,qt>=5);
 }
 const segundoPedido=plano([tenis(5)]);
 assert.equal(segundoPedido.posicoesRoxo,1,
  'cada checkout e um pedido novo, nao se somam unidades entre pedidos');
 assert.equal(plano([tenis(50)]).posicoesRoxo,1,
  'comprar dez lotes no mesmo carrinho continua um unico evento por pedido');
 assert.throws(()=>plano([item('tenis-especial','ROXO',12000,5,{
  modoRoxo:'POR_PEDIDO',quantidadeMinimaRoxo:0,posicoesPorPedidoRoxo:1
 })]),/REGRA_ROXO_POR_PEDIDO_INVALIDA/);
 assert.throws(()=>plano([item('tenis-especial','ROXO',12000,5,{
  modoRoxo:'POR_PEDIDO',quantidadeMinimaRoxo:5,posicoesPorPedidoRoxo:11
 })]),/REGRA_ROXO_POR_PEDIDO_INVALIDA/);
});
test('ROXO legado continua por unidade: um carro com cinco posicoes',()=>{
 const p=plano([item('carro-especial','ROXO',1000000,1,{
  modoRoxo:'POR_UNIDADE',posicoesPorUnidadeRoxo:5})]);
 assert.equal(p.quantidadePosicoesPrevistas,5);
});
