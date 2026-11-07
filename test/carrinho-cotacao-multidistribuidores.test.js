'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {CatalogoMultiDistribuidoresSQLite}=
 require('../src/producao/catalogo-multidistribuidores-sqlite');
const {CotacoesMultiDistribuidoresSQLite}=
 require('../src/producao/cotacoes-multidistribuidores-sqlite');
const {PedidosComerciaisSQLite}=
 require('../src/producao/pedidos-comerciais-sqlite');
const {PedidosFornecedorOutbox}=
 require('../src/producao/pedidos-fornecedor-outbox');
const {RegistroFornecedores,CONTRATO_FORNECEDOR}=
 require('../src/integracoes/registro-fornecedores');
const TEXTO='Termos para cadastro de ensaio em ambiente isolado, AKITEMM e LOOP. '+
 'As transações são fictícias e não autorizam pagamentos reais ou comissões.';
const ENDERECO={destinatario:'Cliente Ficticio',cep:'27250010',logradouro:'Rua Exemplo',
 numero:'10',bairro:'Centro',cidade:'Volta Redonda',uf:'RJ',complemento:''};
const CARRINHO=[
 {produtoId:'camiseta',quantidade:1},
 {produtoId:'tenis',quantidade:1},
 {produtoId:'mochila',quantidade:1}
];
async function montar(t){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000');
 t.after(()=>db.close());
 const emitidos=[],enviados=[];
 const identidade=new IdentidadeClienteLoopReal({
  banco:db,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TERMO-2026',texto:TEXTO},
  privacidade:{versao:'LOOP-PRIVACIDADE-2026',texto:TEXTO},
  enviarEmail:async d=>{emitidos.push(d);return true}
 });
 const docs=identidade.documentos();
 const cliente=await identidade.cadastrar({
  nome:'Cliente Ficticio',nick:'Cliente',email:'cliente@example.invalid',
  senha:'SenhaDeLaboratorio2026!',
  aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
  versaoPrivacidade:docs.privacidade.versao,
  hashPrivacidade:docs.privacidade.hash
 });
 await identidade.solicitarCodigo({
  titularId:cliente.titularId,finalidade:'EMAIL'
 });
 await identidade.confirmarCodigo({
  titularId:cliente.titularId,finalidade:'EMAIL',codigo:emitidos[0].codigo
 });
 const homologados=new Set(['dist_A','dist_B']);
 const catalogo=new CatalogoMultiDistribuidoresSQLite({
  banco:db,distribuidorHomologado:id=>homologados.has(id)
 });
 for(const p of ['camiseta','tenis','mochila']){
  catalogo.criarProduto({produtoId:p,titulo:'Produto '+p});
  catalogo.ativarProduto({produtoId:p,ativo:true});
 }
 const offer=(produtoId,distribuidorId,sku,precoUnitCentavos,prioridade)=>{
  catalogo.vincularOferta({
   produtoId,distribuidorId,sku,precoUnitCentavos,prioridade
  });
  catalogo.ativarOferta({produtoId,distribuidorId,ativo:true});
 };
 offer('camiseta','dist_A','SKU_CA',5900,1);
 offer('camiseta','dist_B','SKU_CB',6000,2);
 offer('tenis','dist_A','SKU_TA',15000,1);
 offer('mochila','dist_A','SKU_MA',7000,1);
 const registro=new RegistroFornecedores();
 for(const f of ['dist_A','dist_B']){
  registro.registrar({fornecedorId:f,adaptador:{
   versaoContrato:CONTRATO_FORNECEDOR,
   async consultarEstoque({sku}){
    // A não tem camiseta; fornecedor B pode atender este item.
    return {quantidade:sku==='SKU_CA'?0:30};
   },
   async consultarStatus(){return {status:'PENDENTE'}},
   async cotarFrete({cepDestino,itens}){
    assert.equal(cepDestino,'27250010');
    assert.ok(itens.every(i=>typeof i.sku==='string'&&i.quantidade>=1));
    return {opcoes:[{
     servicoId:'normal',cotacaoId:'FRETE_'+f,
     valorCentavos:f==='dist_A'?1000:1500,prazoDiasUteis:3,
     expiraEm:new Date(Date.now()+15*60000).toISOString()
    }]};
   },
   async enviarPedidoIdempotente(dados){
    enviados.push({fornecedorId:f,...dados});
    return {pedidoParceiroId:'PARCEIRO_'+f};
   },
   async consultarPedidoPorChave(){return {encontrado:false}}
  }});
 }
 const cotacoes=new CotacoesMultiDistribuidoresSQLite({
  banco:db,catalogo,registro,chaveCotacoes:randomBytes(32)
 });
 const psp=async({pedidoId})=>({
  pedidoId,status:'CONFIRMADO',moeda:'BRL',
  pagamentoId:'PIX_TESTE_CARRINHO_1',valorCentavos:30500
 });
 const pedidos=new PedidosComerciaisSQLite({
  banco:db,chavePedidos:randomBytes(32),
  consultarCotacaoConfiavel:args=>cotacoes.consultarCotacaoConfiavel(args),
  consultarPagamentoPsp:psp
 });
 const outbox=new PedidosFornecedorOutbox({
  banco:db,registro,chavePedidos:randomBytes(32),
  consultarPagamentoConciliado:psp,
  consultarPedidoAprovado:args=>pedidos.consultarPedidoAprovado(args)
 });
 return {db,cliente,catalogo,cotacoes,pedidos,outbox,enviados,homologados,
  entrada:{titularId:cliente.titularId,itens:CARRINHO,cepDestino:'27250010'},
  servicos:[{fornecedorId:'dist_A',servicoId:'normal'},
   {fornecedorId:'dist_B',servicoId:'normal'}]};
}
test('tres produtos, dois distribuidores, consulta de estoque e frete reais, um pedido e duas remessas',async t=>{
 const x=await montar(t);
 const previa=await x.cotacoes.simular(x.entrada);
 assert.equal(previa.grupos.length,2);
 assert.equal(previa.subtotalProdutosCentavos,28000);
 assert.equal(previa.grupos.find(g=>g.fornecedorId==='dist_B').itens[0].sku,'SKU_CB');
 assert.equal(previa.grupos.find(g=>g.fornecedorId==='dist_A').itens.length,2);
 const cotacao=await x.cotacoes.emitir({
  ...x.entrada,servicosFrete:x.servicos,resumoAceito:previa.resumoHash
 });
 assert.equal(cotacao.totalCentavos,30500);
 assert.equal(cotacao.freteCentavos,2500);
 assert.equal(x.cotacoes.consultarCotacaoConfiavel({
  cotacaoId:cotacao.cotacaoId,titularId:'titular-de-outra-conta'
 }),null);
 const pedido=await x.pedidos.criarPedido({
  titularId:x.cliente.titularId,cotacaoId:cotacao.cotacaoId,
  chaveIdempotencia:'CARRINHO_UNICO_001',enderecoEntrega:ENDERECO
 });
 assert.equal(pedido.status,'AGUARDANDO_PAGAMENTO');
 assert.equal(pedido.quantidadeDistribuidores,2);
 assert.equal(pedido.valorTotalCentavos,30500);
 await x.pedidos.confirmarPagamento({pedidoId:pedido.pedidoId});
 for(const fornecedorId of ['dist_A','dist_B']){
  await x.outbox.registrarPagamentoConciliado({
   pedidoId:pedido.pedidoId,fornecedorId
  });
  const saiu=await x.outbox.despachar({pedidoId:pedido.pedidoId,fornecedorId});
  assert.equal(saiu.estado,'ENVIADO');
 }
 assert.equal(x.enviados.length,2);
 assert.deepEqual(x.enviados.find(v=>v.fornecedorId==='dist_A').itens,[
  {sku:'SKU_TA',quantidade:1},{sku:'SKU_MA',quantidade:1}
 ]);
 assert.deepEqual(x.enviados.find(v=>v.fornecedorId==='dist_B').itens,[
  {sku:'SKU_CB',quantidade:1}
 ]);
 assert.notEqual(x.enviados[0].chaveIdempotencia,
  x.enviados[1].chaveIdempotencia);
 const bruto=JSON.stringify(x.db.prepare('SELECT * FROM loja_real_cotacoes').all());
 assert.equal(bruto.includes('27250010'),false);
 assert.equal(x.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('mudança de preço ou estoque na cotação obriga nova confirmação e não emite pedido',async t=>{
 const x=await montar(t);
 const previa=await x.cotacoes.simular(x.entrada);
 x.catalogo.vincularOferta({produtoId:'tenis',distribuidorId:'dist_A',
  sku:'SKU_TA',precoUnitCentavos:16000,prioridade:1});
 x.catalogo.ativarOferta({produtoId:'tenis',distribuidorId:'dist_A',ativo:true});
 await assert.rejects(x.cotacoes.emitir({
  ...x.entrada,servicosFrete:x.servicos,resumoAceito:previa.resumoHash
 }),{codigo:'PRECO_OU_FRETE_ALTERADO_CONFIRMAR'});
 assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM loja_real_cotacoes').get().n,0);
});
test('sem distribuidor efetivamente homologado nao oferece cotacao ficticia',async t=>{
 const x=await montar(t);
 x.homologados.clear();
 await assert.rejects(x.cotacoes.simular(x.entrada),
  {codigo:'PRODUTO_SEM_OFERTA_HOMOLOGADA'});
 assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM loja_real_cotacoes').get().n,0);
});
