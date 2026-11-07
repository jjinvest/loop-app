'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {CatalogoMultiDistribuidoresSQLite}=
 require('../src/producao/catalogo-multidistribuidores-sqlite');
const {ControleEconomicoLojaSQLite}=
 require('../src/producao/controle-economico-loja-sqlite');

function preparar(t){
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 t.after(()=>banco.close());
 const catalogo=new CatalogoMultiDistribuidoresSQLite({
  banco,distribuidorHomologado:()=>true
 });
 for(const p of ['camiseta','tenis']){
  catalogo.criarProduto({produtoId:p,titulo:'Produto '+p});
  catalogo.ativarProduto({produtoId:p,ativo:true});
 }
 catalogo.vincularOferta({produtoId:'camiseta',distribuidorId:'wedrop',
  sku:'WD_001',precoUnitCentavos:19000,prioridade:1});
 catalogo.vincularOferta({produtoId:'camiseta',distribuidorId:'segundo',
  sku:'OUTRO_01',precoUnitCentavos:18500,prioridade:2});
 catalogo.vincularOferta({produtoId:'tenis',distribuidorId:'wedrop',
  sku:'WD_002',precoUnitCentavos:25000,prioridade:1});
 const custos=new ControleEconomicoLojaSQLite({banco});
 return {banco,catalogo,custos};
}
test('administrador vê preço de venda, custo do fornecedor e diferença bruta, sem chamá-la lucro',t=>{
 const x=preparar(t);
 let antes=x.custos.consultarOferta({produtoId:'camiseta',distribuidorId:'wedrop'});
 assert.equal(antes.precoVendaCentavos,19000);
 assert.equal(antes.custoFornecedorCentavos,null);
 assert.equal(antes.diferencaBrutaCentavos,null);
 assert.equal(antes.lucroLiquidoCalculado,false);
 let a=x.custos.definirCusto({produtoId:'camiseta',distribuidorId:'wedrop',
  custoUnitCentavos:11500});
 assert.equal(a.precoVendaCentavos,19000);
 assert.equal(a.custoFornecedorCentavos,11500);
 assert.equal(a.diferencaBrutaCentavos,7500);
 assert.equal(a.lucroLiquidoCalculado,false);
 assert.equal(a.tributosApurados,false);
 a=x.custos.definirCusto({produtoId:'camiseta',distribuidorId:'wedrop',
  custoUnitCentavos:12500,revisaoEsperada:1});
 assert.equal(a.diferencaBrutaCentavos,6500);
 assert.equal(a.revisaoCusto,2);
 assert.throws(()=>x.custos.definirCusto({produtoId:'camiseta',
  distribuidorId:'wedrop',custoUnitCentavos:0,revisaoEsperada:1}),
 {codigo:'REVISAO_CUSTO_EM_CONFLITO'});
 const hist=x.banco.prepare(
  'SELECT custo_anterior_centavos AS antes,custo_novo_centavos AS depois FROM loja_real_custos_historico ORDER BY id'
 ).all().map(x=>({antes:x.antes,depois:x.depois}));
 assert.deepEqual(hist,[
  {antes:null,depois:11500},{antes:11500,depois:12500}
 ]);
 assert.throws(()=>x.banco.prepare(
  'UPDATE loja_real_custos_historico SET custo_novo_centavos=0'
 ).run(),/AUDITORIA_IMUTAVEL/);
 assert.equal(x.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('cada distribuidor tem custo independente; preço baixo pode resultar em margem negativa',t=>{
 const x=preparar(t);
 x.custos.definirCusto({produtoId:'camiseta',distribuidorId:'wedrop',
  custoUnitCentavos:21500});
 x.custos.definirCusto({produtoId:'camiseta',distribuidorId:'segundo',
  custoUnitCentavos:13500});
 const precos=x.custos.listarOfertas();
 assert.equal(precos.length,3);
 assert.equal(precos.find(x=>x.distribuidorId==='wedrop'&&x.produtoId==='camiseta')
  .diferencaBrutaCentavos,-2500);
 assert.equal(precos.find(x=>x.distribuidorId==='segundo').diferencaBrutaCentavos,5000);
 assert.equal(precos.find(x=>x.produtoId==='tenis').diferencaBrutaCentavos,null);
 // O catálogo do cliente nunca pode mostrar custo do distribuidor.
 const vitrine=x.catalogo.ofertasConfiaveis({produtoId:'camiseta'});
 assert.equal(JSON.stringify(vitrine).includes('custoFornecedor'),false);
 assert.equal(JSON.stringify(vitrine).includes('21500'),false);
 assert.equal(x.banco.prepare('PRAGMA foreign_key_check').all().length,0);
});
test('CSV para contador não inventa imposto nem calcula lucro líquido',t=>{
 const x=preparar(t);
 x.custos.definirCusto({produtoId:'tenis',distribuidorId:'wedrop',
  custoUnitCentavos:16000});
 const csv=x.custos.csvContador();
 assert.match(csv,/"Produto_ID";"Distribuidor_ID";"SKU";"Preco_de_venda_R\$"/);
 assert.match(csv,/"tenis";"wedrop";"WD_002";"250,00";"160,00";"90,00";"NAO";"NAO";"1"/);
 assert.match(csv,/"camiseta";"segundo";"OUTRO_01";"185,00";"";"";"NAO";"NAO";"0"/);
 assert.equal(csv.includes('CPF'),false);
 assert.equal(csv.split('\r\n').filter(Boolean).length,4);
});
test('custo não cadastrado não é presumido, e SKU inexistente não recebe custo',t=>{
 const x=preparar(t);
 assert.throws(()=>x.custos.definirCusto({
  produtoId:'camiseta',distribuidorId:'inexistente',custoUnitCentavos:1000
 }),{codigo:'OFERTA_NAO_EXISTE'});
 assert.throws(()=>x.custos.definirCusto({
  produtoId:'camiseta',distribuidorId:'wedrop',custoUnitCentavos:1.5
 }),{codigo:'CUSTO_FORNECEDOR_INVALIDO'});
 assert.equal(x.custos.consultarOferta({
  produtoId:'camiseta',distribuidorId:'inexistente'
 }),null);
});
