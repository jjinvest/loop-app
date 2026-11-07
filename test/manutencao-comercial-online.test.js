'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {AuditoriaOperacionalSQLite}=
 require('../src/producao/auditoria-operacional-sqlite');
const {ManutencaoComercialSQLite}=
 require('../src/producao/manutencao-comercial-sqlite');
const {CatalogoMultiDistribuidoresSQLite}=
 require('../src/producao/catalogo-multidistribuidores-sqlite');
const {ControleEconomicoLojaSQLite}=
 require('../src/producao/controle-economico-loja-sqlite');
const {PedidosComerciaisSQLite}=
 require('../src/producao/pedidos-comerciais-sqlite');
const {CotacoesMultiDistribuidoresSQLite}=
 require('../src/producao/cotacoes-multidistribuidores-sqlite');

const TITULAR='titular-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ENDERECO={destinatario:'Cliente Exemplo',cep:'27250010',
 logradouro:'Rua de Teste',numero:'10',bairro:'Centro',
 cidade:'Volta Redonda',uf:'RJ',complemento:''};

function base(t){
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 t.after(()=>banco.close());
 const auditoria=new AuditoriaOperacionalSQLite({
  banco,chaveAuditoria:randomBytes(32)
 });
 const manutencao=new ManutencaoComercialSQLite({banco,auditoria});
 const catalogo=new CatalogoMultiDistribuidoresSQLite({
  banco,auditoria,manutencao,distribuidorHomologado:()=>true
 });
 const custos=new ControleEconomicoLojaSQLite({banco,auditoria,manutencao});
 return {banco,auditoria,manutencao,catalogo,custos};
}
test('pausa e retomada persistentes permitem leitura e auditam ambos os movimentos',t=>{
 const x=base(t);
 x.catalogo.criarProduto({produtoId:'camisa',titulo:'Camiseta'});
 x.catalogo.vincularOferta({
  produtoId:'camisa',distribuidorId:'dist_A',sku:'SKU_CA',
  precoUnitCentavos:15000
 });
 x.catalogo.ativarProduto({produtoId:'camisa',ativo:true});
 x.catalogo.ativarOferta({
  produtoId:'camisa',distribuidorId:'dist_A',ativo:true
 });
 assert.equal(x.catalogo.listarVitrine().length,1);
 assert.equal(x.manutencao.estado().suspensa,false);
 const pausado=x.manutencao.alterar({
  suspensa:true,revisaoEsperada:0,motivo:'CORRECAO_TECNICA'
 });
 assert.equal(pausado.suspensa,true);
 assert.equal(pausado.revisao,1);
 assert.equal(x.catalogo.listarVitrine().length,1,
  'cliente continua consultando ofertas existentes');
 assert.equal(x.catalogo.listarProdutosAdministrativos().length,1);
 assert.throws(()=>x.catalogo.criarProduto({
  produtoId:'novo',titulo:'Produto Novo'
 }),{codigo:'OPERACAO_COMERCIAL_EM_MANUTENCAO'});
 assert.throws(()=>x.catalogo.ativarOferta({
  produtoId:'camisa',distribuidorId:'dist_A',ativo:false
 }),{codigo:'OPERACAO_COMERCIAL_EM_MANUTENCAO'});
 assert.throws(()=>x.custos.definirCusto({
  produtoId:'camisa',distribuidorId:'dist_A',custoUnitCentavos:5000
 }),{codigo:'OPERACAO_COMERCIAL_EM_MANUTENCAO'});
 assert.throws(()=>x.custos.atualizarPrecoVenda({
  produtoId:'camisa',distribuidorId:'dist_A',
  precoAnteriorCentavos:15000,precoVendaCentavos:12000,
  revisaoPrecoEsperada:0
 }),{codigo:'OPERACAO_COMERCIAL_EM_MANUTENCAO'});
 assert.equal(x.custos.consultarOferta({
  produtoId:'camisa',distribuidorId:'dist_A'
 }).precoVendaCentavos,15000);
 assert.throws(()=>x.manutencao.alterar({
  suspensa:false,revisaoEsperada:0,motivo:'RETOMADA_OPERACAO'
 }),{codigo:'MANUTENCAO_REVISAO_EM_CONFLITO'});
 assert.throws(()=>x.manutencao.alterar({
  suspensa:false,revisaoEsperada:1,motivo:'cpf 12345678901'
 }),{codigo:'MANUTENCAO_COMANDO_INVALIDO'});
 assert.equal(x.manutencao.estado().suspensa,true);
 const reaberto=x.manutencao.alterar({
  suspensa:false,revisaoEsperada:1,motivo:'RETOMADA_OPERACAO'
 });
 assert.equal(reaberto.revisao,2);
 x.custos.definirCusto({
  produtoId:'camisa',distribuidorId:'dist_A',custoUnitCentavos:9000
 });
 assert.equal(x.catalogo.listarVitrine().length,1);
 const prova=x.auditoria.verificar();
 assert.equal(prova.integra,true);
 assert.equal(prova.verificacaoCompleta,true);
 assert.throws(()=>x.auditoria.verificar({limite:2}),
  {codigo:'AUDITORIA_ACIMA_DO_LIMITE'});
 assert.deepEqual(x.auditoria.listar({limite:4}).map(x=>x.acao),[
  'CUSTO_FORNECEDOR_ALTERADO','MANUTENCAO_COMERCIAL_ALTERADA',
  'MANUTENCAO_COMERCIAL_ALTERADA','OFERTA_STATUS_ALTERADO'
 ]);
 assert.equal(x.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('se a auditoria falha, o estado de manutenção é revertido',t=>{
 const x=base(t);
 const impossivel={db:x.banco,registrar:()=>{throw Error('SEM_AUDITORIA')},
  verificar:()=>{throw Error('SEM_AUDITORIA')}};
 const m=new ManutencaoComercialSQLite({banco:x.banco,auditoria:impossivel});
 assert.throws(()=>m.alterar({
  suspensa:true,revisaoEsperada:0,motivo:'INCIDENTE_OPERACIONAL'
 }),/SEM_AUDITORIA/);
 assert.equal(m.estado().suspensa,false);
 assert.equal(m.estado().revisao,0);
});
test('manutenção interrompe novos pedidos e cotações sem bloquear pagamento de pedido existente',async t=>{
 const x=base(t);
 x.banco.exec('CREATE TABLE loop_real_contas('+
  'id TEXT PRIMARY KEY,email_confirmado_em INTEGER)');
 x.banco.prepare('INSERT INTO loop_real_contas VALUES(?,?)').run(TITULAR,100);
 const agora=Date.now();
 const cotacao={
  cotacaoId:'COTA_VALIDADA',status:'APROVADA',
  titularId:TITULAR,cepDestino:'27250010',expiraEm:agora+600000,
  grupos:[{fornecedorId:'dist_A',freteCentavos:1000,
   itens:[{sku:'SKU_A',quantidade:1,precoUnitCentavos:10000}]}]
 };
 const pedidos=new PedidosComerciaisSQLite({
  banco:x.banco,manutencao:x.manutencao,chavePedidos:randomBytes(32),
  consultarCotacaoConfiavel:async()=>cotacao,
  consultarPagamentoPsp:async({pedidoId})=>({
   pedidoId,status:'CONFIRMADO',moeda:'BRL',valorCentavos:11000,
   pagamentoId:'PIX_CONFIRMADO_01'
  })
 });
 const registro={
  consultarEstoque:async()=>({quantidade:10}),
  cotarFrete:async()=>({opcoes:[{
   servicoId:'normal',valorCentavos:1000,prazoDiasUteis:4,
   expiraEm:new Date(agora+600000).toISOString()
  }]})
 };
 const catalogo={
  ofertasConfiaveis:()=>({
   compravel:true,ofertas:[{
    distribuidorId:'dist_A',sku:'SKU_A',precoUnitCentavos:10000,
    prioridade:1
   }]
  })
 };
 const cotacoes=new CotacoesMultiDistribuidoresSQLite({
  banco:x.banco,catalogo,registro,
  chaveCotacoes:randomBytes(32),manutencao:x.manutencao
 });
 const antes=await pedidos.criarPedido({
  titularId:TITULAR,cotacaoId:'COTA_VALIDADA',
  chaveIdempotencia:'PAGAMENTO_EM_ANDAMENTO',enderecoEntrega:ENDERECO
 });
 assert.equal(antes.status,'AGUARDANDO_PAGAMENTO');
 const pausa=x.manutencao.alterar({
  suspensa:true,revisaoEsperada:0,motivo:'INCIDENTE_OPERACIONAL'
 });
 assert.equal(pausa.suspensa,true);
 await assert.rejects(pedidos.criarPedido({
  titularId:TITULAR,cotacaoId:'COTA_VALIDADA',
  chaveIdempotencia:'PEDIDO_NOVO',enderecoEntrega:ENDERECO
 }),{codigo:'OPERACAO_COMERCIAL_EM_MANUTENCAO'});
 await assert.rejects(cotacoes.simular({
  itens:[{produtoId:'camisa',quantidade:1}],cepDestino:'27250010'
 }),{codigo:'OPERACAO_COMERCIAL_EM_MANUTENCAO'});
 assert.equal(pedidos.listarDoTitular({titularId:TITULAR}).length,1);
 // Pagamento previamente autorizado continua conciliando, sem desaparecer.
 const recebido=await pedidos.confirmarPagamento({
  pedidoId:antes.pedidoId
 });
 assert.equal(recebido.status,'APROVADO_PARA_EXPEDICAO');
 const repetido=await pedidos.criarPedido({
  titularId:TITULAR,cotacaoId:'COTA_VALIDADA',
  chaveIdempotencia:'PAGAMENTO_EM_ANDAMENTO',enderecoEntrega:ENDERECO
 });
 assert.equal(repetido.repetido,true);
 assert.equal(x.banco.prepare(
  'SELECT COUNT(*) AS n FROM loja_real_pedidos'
 ).get().n,1);
});
