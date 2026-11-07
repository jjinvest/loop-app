'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {CatalogoMultiDistribuidoresSQLite}=
 require('../src/producao/catalogo-multidistribuidores-sqlite');
const {ControleEconomicoLojaSQLite}=
 require('../src/producao/controle-economico-loja-sqlite');
const {PedidosComerciaisSQLite}=
 require('../src/producao/pedidos-comerciais-sqlite');
const TITULAR='titular-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ENDERECO={destinatario:'Nome Pessoal Cliente',cep:'27250010',
 logradouro:'Rua Restrita 123',numero:'14',bairro:'Centro',
 cidade:'Volta Redonda',uf:'RJ',complemento:''};
function montar(t){
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 t.after(()=>banco.close());
 // O teste exercita o núcleo comercial sem abrir portas de clientes.
 banco.exec('CREATE TABLE loop_real_contas('+
  'id TEXT PRIMARY KEY,email_confirmado_em INTEGER)');
 banco.prepare('INSERT INTO loop_real_contas VALUES(?,?)').run(TITULAR,100);
 const catalogo=new CatalogoMultiDistribuidoresSQLite({
  banco,distribuidorHomologado:()=>true
 });
 for(const [produto,distribuidor,sku,preco] of [
  ['camisa','dist_A','A_1',20000],
  ['tenis','dist_B','B_1',8000],
  ['meia','dist_B','B_2',1200]]){
  catalogo.criarProduto({produtoId:produto,titulo:'Produto '+produto});
  catalogo.vincularOferta({
   produtoId:produto,distribuidorId:distribuidor,sku,
   precoUnitCentavos:preco
  });
 }
 const custo=new ControleEconomicoLojaSQLite({banco});
 custo.definirCusto({
  produtoId:'camisa',distribuidorId:'dist_A',custoUnitCentavos:13000
 });
 custo.definirCusto({
  produtoId:'tenis',distribuidorId:'dist_B',custoUnitCentavos:4000
 });
 const cotacoes={
  antigo:{titularId:TITULAR,cepDestino:'27250010',
   cotacaoId:'COTA_1',status:'APROVADA',
   expiraEm:Date.now()+900000,grupos:[
    {fornecedorId:'dist_A',freteCentavos:1500,itens:[
     {sku:'A_1',quantidade:1,precoUnitCentavos:20000}
    ]},
    {fornecedorId:'dist_B',freteCentavos:1000,itens:[
     {sku:'B_1',quantidade:2,precoUnitCentavos:8000}
    ]}
   ]}
 };
 const pedidos=new PedidosComerciaisSQLite({
  banco,chavePedidos:randomBytes(32),
  consultarPagamentoPsp:async({pedidoId})=>({
   pedidoId,status:'CONFIRMADO',moeda:'BRL',
   pagamentoId:'PIX_'+pedidoId,valorCentavos:38500
  }),
  consultarCotacaoConfiavel:async({cotacaoId,titularId})=>
   Object.values(cotacoes).find(c=>c.cotacaoId===cotacaoId&&
    c.titularId===titularId)||null
 });
 const criar=async(cotacaoId,chaveIdempotencia)=>
  pedidos.criarPedido({titularId:TITULAR,cotacaoId,
   chaveIdempotencia,enderecoEntrega:ENDERECO});
 return {banco,catalogo,custo,pedidos,cotacoes,criar};
}
test('margem e custos históricos congelados no pedido mesmo depois de atualizar tabela de preços',async t=>{
 const x=montar(t);
 const primeiro=await x.criar('COTA_1','PRIMEIRA_VENDA');
 assert.equal(primeiro.valorTotalCentavos,38500);
 let resumo=x.pedidos.listarResumoContabil()[0];
 assert.equal(resumo.receitaProdutosCentavos,36000);
 assert.equal(resumo.freteCobradoClienteCentavos,2500);
 assert.equal(resumo.custoFornecedorEstimadoCentavos,21000);
 assert.equal(resumo.diferencaBrutaEstimadaCentavos,15000);
 assert.equal(resumo.custoFornecedorIntegralmenteInformado,true);
 assert.equal(resumo.linhasSemCustoInformado,0);
 assert.equal(resumo.resultadoLiquidoApurado,false);
 await x.pedidos.confirmarPagamento({pedidoId:primeiro.pedidoId});
 x.custo.definirCusto({
  produtoId:'camisa',distribuidorId:'dist_A',
  custoUnitCentavos:19000,revisaoEsperada:1
 });
 x.custo.definirCusto({
  produtoId:'tenis',distribuidorId:'dist_B',
  custoUnitCentavos:7000,revisaoEsperada:1
 });
 x.catalogo.vincularOferta({
  produtoId:'camisa',distribuidorId:'dist_A',
  sku:'A_1',precoUnitCentavos:24000
 });
 resumo=x.pedidos.listarResumoContabil()[0];
 assert.equal(resumo.custoFornecedorEstimadoCentavos,21000);
 assert.equal(resumo.diferencaBrutaEstimadaCentavos,15000);
 assert.equal(resumo.status,'APROVADO_PARA_EXPEDICAO');
 const snap=x.banco.prepare(
  'SELECT fornecedor_id,sku,custo_unit_centavos,revisao_custo FROM loja_real_custos_pedido ORDER BY fornecedor_id'
 ).all();
 assert.deepEqual(snap.map(v=>({
  fornecedor:v.fornecedor_id,sku:v.sku,custo:v.custo_unit_centavos,
  revisao:v.revisao_custo
 })),[
  {fornecedor:'dist_A',sku:'A_1',custo:13000,revisao:1},
  {fornecedor:'dist_B',sku:'B_1',custo:4000,revisao:1}
 ]);
 assert.throws(()=>x.banco.prepare(
  'UPDATE loja_real_custos_pedido SET custo_unit_centavos=0'
 ).run(),/SNAPSHOT_CUSTO_IMUTAVEL/);
 assert.throws(()=>x.banco.prepare(
  'DELETE FROM loja_real_custos_pedido'
 ).run(),/SNAPSHOT_CUSTO_IMUTAVEL/);
 assert.equal(JSON.stringify(snap).includes('Nome Pessoal Cliente'),false);
 assert.equal(x.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(x.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('não inventar custo/margem quando fornecedor ainda não foi cadastrado',async t=>{
 const x=montar(t);
 const now=Date.now();
 x.cotacoes.semCusto={titularId:TITULAR,cepDestino:'27250010',
  cotacaoId:'COTA_SEM_CUSTO',status:'APROVADA',expiraEm:now+900000,
  grupos:[{fornecedorId:'dist_B',freteCentavos:0,
   itens:[{sku:'B_2',quantidade:1,precoUnitCentavos:1200}]}]
 };
 const pedido=await x.criar('COTA_SEM_CUSTO','CARRINHO_SEM_CUSTO');
 const resumo=x.pedidos.listarResumoContabil().find(x=>x.pedidoId===pedido.pedidoId);
 assert.equal(resumo.custoFornecedorIntegralmenteInformado,false);
 assert.equal(resumo.custoFornecedorEstimadoCentavos,null);
 assert.equal(resumo.diferencaBrutaEstimadaCentavos,null);
 assert.equal(resumo.linhasSemCustoInformado,1);
 assert.equal(resumo.tributosCalculados,false);
 assert.equal(resumo.resultadoLiquidoApurado,false);
});
test('pedido repetido não duplica o snapshot, e cada fornecedor possui seu próprio SKU',async t=>{
 const x=montar(t);
 const primeiro=await x.criar('COTA_1','CHAVE_1');
 const repetido=await x.criar('COTA_1','CHAVE_1');
 assert.equal(primeiro.pedidoId,repetido.pedidoId);
 assert.equal(repetido.repetido,true);
 assert.equal(x.banco.prepare(
  'SELECT COUNT(*) AS n FROM loja_real_custos_pedido'
 ).get().n,2);
 assert.equal(x.banco.prepare(
  'SELECT COUNT(*) AS n FROM loja_real_pedidos'
 ).get().n,1);
});
