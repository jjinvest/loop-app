'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {CatalogoMultiDistribuidoresSQLite}=
 require('../src/producao/catalogo-multidistribuidores-sqlite');
test('AKITEMM suporta varios produtos e muitos distribuidores sem cadastrá-los automaticamente',t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 t.after(()=>banco.close());
 const homologados=new Set();
 const catalogo=new CatalogoMultiDistribuidoresSQLite({
  banco,distribuidorHomologado:id=>homologados.has(id)
 });
 assert.deepEqual(catalogo.listarVitrine(),[]);
 for(const nome of ['camiseta','tenis','mochila']){
  catalogo.criarProduto({produtoId:nome,titulo:'Produto '+nome});
  catalogo.ativarProduto({produtoId:nome,ativo:true});
 }
 // Mesmo produto pode ter duas origens; o mesmo distribuidor tem vários SKUs.
 catalogo.vincularOferta({produtoId:'camiseta',distribuidorId:'dist_A',
  sku:'SKU_01',precoUnitCentavos:5000,prioridade:2});
 catalogo.vincularOferta({produtoId:'camiseta',distribuidorId:'dist_B',
  sku:'SKU_01',precoUnitCentavos:4900,prioridade:1});
 catalogo.vincularOferta({produtoId:'tenis',distribuidorId:'dist_A',
  sku:'SKU_02',precoUnitCentavos:14000,prioridade:1});
 catalogo.vincularOferta({produtoId:'mochila',distribuidorId:'dist_C',
  sku:'SKU_21',precoUnitCentavos:8900,prioridade:1});
 assert.deepEqual(catalogo.listarVitrine(),[]);
 assert.throws(()=>catalogo.ativarOferta({
  produtoId:'camiseta',distribuidorId:'dist_A',ativo:true
 }),{codigo:'DISTRIBUIDOR_SEM_HOMOLOGACAO'});
 homologados.add('dist_A');
 for(const produtoId of ['camiseta','tenis'])
  catalogo.ativarOferta({produtoId,distribuidorId:'dist_A',ativo:true});
 let publicados=catalogo.listarVitrine();
 assert.equal(publicados.length,2);
 assert.equal(publicados.find(x=>x.produtoId==='camiseta').checkoutReal,false);
 assert.equal(publicados.find(x=>x.produtoId==='camiseta').estoqueConfirmado,false);
 assert.equal(publicados.find(x=>x.produtoId==='camiseta').distribuidoresHabilitados,1);
 homologados.add('dist_B');
 catalogo.ativarOferta({produtoId:'camiseta',distribuidorId:'dist_B',ativo:true});
 const opcoes=catalogo.ofertasConfiaveis({produtoId:'camiseta'});
 assert.deepEqual(opcoes.ofertas.map(x=>x.distribuidorId),['dist_B','dist_A']);
 assert.equal(opcoes.ofertas[0].precoUnitCentavos,4900);
 assert.equal(opcoes.ofertas[1].precoUnitCentavos,5000);
 assert.equal(catalogo.ofertasConfiaveis({produtoId:'mochila'}).compravel,false);
 // Revogar o parceiro deve cessar oferta sem reescrever preço ou pedido antigo.
 homologados.delete('dist_B');
 assert.deepEqual(catalogo.ofertasConfiaveis({produtoId:'camiseta'})
  .ofertas.map(x=>x.distribuidorId),['dist_A']);
 catalogo.ativarProduto({produtoId:'camiseta',ativo:false});
 assert.equal(catalogo.ofertasConfiaveis({produtoId:'camiseta'}),null);
 assert.equal(catalogo.listarVitrine().length,1);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('um mesmo SKU em distribuidor distinto e permitido, mas não duplicado dentro dele',()=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 try{
  const c=new CatalogoMultiDistribuidoresSQLite({
   banco,distribuidorHomologado:()=>false
  });
  c.criarProduto({produtoId:'p1',titulo:'Produto Um'});
  c.criarProduto({produtoId:'p2',titulo:'Produto Dois'});
  c.vincularOferta({produtoId:'p1',distribuidorId:'dist_A',
   sku:'SKU_01',precoUnitCentavos:10000});
  c.vincularOferta({produtoId:'p2',distribuidorId:'dist_B',
   sku:'SKU_01',precoUnitCentavos:20000});
  assert.throws(()=>c.vincularOferta({produtoId:'p2',distribuidorId:'dist_A',
   sku:'SKU_01',precoUnitCentavos:20000}),/UNIQUE|constraint/i);
  assert.equal(c.listarVitrine().length,0,'nenhum produto ficticio vendido');
 }finally{banco.close()}
});
