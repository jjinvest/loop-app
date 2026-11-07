'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RegistroFornecedores,CONTRATO_FORNECEDOR}=
 require('../src/integracoes/registro-fornecedores');
const {PedidosFornecedorOutbox}=
 require('../src/producao/pedidos-fornecedor-outbox');
function criar(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-outbox-fornecedor-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const caminho=path.join(dir,'outbox.sqlite');
 const db1=new DatabaseSync(caminho),db2=new DatabaseSync(caminho);
 for(const db of [db1,db2])
  db.exec('PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;');
 t.after(()=>{db2.close();db1.close()});
 const sent=[],consultas=[];
 let falhar=false,compraConfirmada=true,custoLiberado=true,respostaConsulta={encontrado:false};
 let statusPedido='APROVADO_PARA_EXPEDICAO',itensDoPedido=null;
 const registro=new RegistroFornecedores();
 registro.registrar({fornecedorId:'franquia',adaptador:{
  versaoContrato:CONTRATO_FORNECEDOR,
  consultarEstoque:async()=>({quantidade:2}),
  consultarStatus:async()=>({status:'PENDENTE'}),
  cotarFrete:async()=>({opcoes:[]}),
  async enviarPedidoIdempotente(x){
   sent.push(x);
   if(falhar)throw Error('TIMEOUT_APOS_POSSIVEL_ENVIO');
   return {pedidoParceiroId:'PARCEIRO_01'};
  },
  async consultarPedidoPorChave(x){consultas.push(x);return respostaConsulta;}
 }});
 const chavePedidos=randomBytes(32);
 const criarOutbox=banco=>new PedidosFornecedorOutbox({
  banco,registro,chavePedidos,
  consultarPagamentoConciliado:async({pedidoId})=>({
   pedidoId,status:compraConfirmada?'CONFIRMADO':'PENDENTE',
   moeda:'BRL',pagamentoId:'PIX_VALIDADO_01',valorCentavos:28000
  }),
  consultarLiberacaoCustoFornecedor:async({pedidoId,fornecedorId})=>({
   pedidoId,fornecedorId,estado:custoLiberado?'CUSTO_QUITADO':'PENDENTE',
   referencia:'LIQUIDACAO_WEDROP_SIMULADA_01',
   origem:'CANAL_FORNECEDOR_AUTORIZADO'
  }),
  consultarPedidoAprovado:async({pedidoId})=>({
   pedidoId,fornecedorId:'franquia',status:statusPedido,
   pagamentoId:'PIX_VALIDADO_01',valorTotalCentavos:28000,
   itens:itensDoPedido||entrada.itens,
   enderecoEntrega:entrada.enderecoEntrega
  })
 });
 const x=criarOutbox(db1),y=criarOutbox(db2);
 const entrada={
  pedidoId:'PEDIDO_REAL_01',fornecedorId:'franquia',
  itens:[{sku:'SKU_001',quantidade:1}],
  enderecoEntrega:{destinatario:'Ana Cliente',cep:'27250010',
   logradouro:'Rua de Teste',numero:'10',bairro:'Centro',
   cidade:'Volta Redonda',uf:'RJ',complemento:''}
 };
 return {x,y,db1,db2,entrada,sent,consultas,
  falhar:v=>{falhar=v},confirmado:v=>{compraConfirmada=v},
  custoLiberado:v=>{custoLiberado=v},
  statusPedido:v=>{statusPedido=v},
  itensPedido:v=>{itensDoPedido=v},
  consulta:v=>{respostaConsulta=v}};
}
test('compra sem confirmação no PSP não gera ordem de fornecedor',async t=>{
 const a=criar(t);
 a.confirmado(false);
 await assert.rejects(a.x.registrarPagamentoConciliado(a.entrada),
  {codigo:'PAGAMENTO_PSP_NAO_CONCILIADO'});
 assert.equal(a.db1.prepare(
  'SELECT COUNT(*) AS total FROM loja_real_outbox_fornecedor'
 ).get().total,0);
 assert.equal(a.sent.length,0);
});
test('Pix conciliado vira uma única ordem e endereco fica cifrado em SQLite',async t=>{
 const a=criar(t);
 const novo=await a.x.registrarPagamentoConciliado(a.entrada);
 assert.equal(novo.repetido,false);
 assert.equal(novo.estado,'PENDENTE');
 const snapshot=JSON.stringify(a.db1.prepare(
  'SELECT * FROM loja_real_outbox_fornecedor'
 ).all());
 assert.equal(snapshot.includes('Ana Cliente'),false);
 assert.equal(snapshot.includes('Rua de Teste'),false);
 assert.equal(snapshot.includes('27250010'),false);
 const replay=await a.y.registrarPagamentoConciliado(a.entrada);
 assert.equal(replay.repetido,true);
 assert.equal(a.db2.prepare(
  'SELECT COUNT(*) AS total FROM loja_real_outbox_fornecedor'
 ).get().total,1);
 const pedido=await a.x.despachar({
  pedidoId:a.entrada.pedidoId,fornecedorId:a.entrada.fornecedorId
 });
 assert.equal(pedido.estado,'ENVIADO');
 assert.equal(pedido.pedidoParceiroId,'PARCEIRO_01');
 assert.equal(a.sent.length,1);
 assert.equal(a.sent[0].enderecoEntrega.destinatario,'Ana Cliente');
 const r=await a.y.despachar({
  pedidoId:a.entrada.pedidoId,fornecedorId:a.entrada.fornecedorId
 });
 assert.equal(r.repetido,true);
 assert.equal(a.sent.length,1,'não pode duplicar pedido externo');
 await assert.rejects(a.y.registrarPagamentoConciliado({
  ...a.entrada,itens:[{sku:'SKU_001',quantidade:2}]
 }),{codigo:'PEDIDO_DIVERGENTE_DO_ORIGINAL'});
 assert.equal(a.db1.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('timeout apos possível POST não reenvia; consulta recupera confirmação',async t=>{
 const a=criar(t);
 await a.x.registrarPagamentoConciliado(a.entrada);
 a.falhar(true);
 await assert.rejects(a.x.despachar({
  pedidoId:a.entrada.pedidoId,fornecedorId:a.entrada.fornecedorId
 }),{codigo:'ENVIO_FORNECEDOR_INDETERMINADO'});
 const uncertain=a.y.consultar({
  pedidoId:a.entrada.pedidoId,fornecedorId:a.entrada.fornecedorId
 });
 assert.equal(uncertain.estado,'INDETERMINADO');
 await assert.rejects(a.y.despachar({
  pedidoId:a.entrada.pedidoId,fornecedorId:a.entrada.fornecedorId
 }),{codigo:'ENVIO_FORNECEDOR_REQUER_RECONCILIACAO'});
 assert.equal(a.sent.length,1);
 const notFound=await a.x.reconciliar({
  pedidoId:a.entrada.pedidoId,fornecedorId:a.entrada.fornecedorId
 });
 assert.equal(notFound.revisaoManual,true);
 assert.equal(a.sent.length,1,'não reenviar após resposta indeterminada');
 a.consulta({encontrado:true,pedidoParceiroId:'RECUPERADO_1'});
 const resolved=await a.y.reconciliar({
  pedidoId:a.entrada.pedidoId,fornecedorId:a.entrada.fornecedorId
 });
 assert.equal(resolved.estado,'ENVIADO');
 assert.equal(resolved.pedidoParceiroId,'RECUPERADO_1');
 assert.equal(a.sent.length,1);
 assert.equal(a.consultas.length,2);
 assert.equal(a.db2.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});

test('Pix estornado antes do despacho não pode enviar ao parceiro',async t=>{
 const a=criar(t);
 await a.x.registrarPagamentoConciliado(a.entrada);
 a.confirmado(false);
 await assert.rejects(a.y.despachar({
  pedidoId:a.entrada.pedidoId,fornecedorId:a.entrada.fornecedorId
 }),{codigo:'PAGAMENTO_PSP_NAO_CONCILIADO'});
 assert.equal(a.sent.length,0);
 assert.equal(a.x.consultar({
  pedidoId:a.entrada.pedidoId,fornecedorId:a.entrada.fornecedorId
 }).estado,'PENDENTE','não marcar como enviado ou indeterminado sem prova');
});

test('pedido cancelado após o Pix ou alterado no cadastro não autoriza envio',async t=>{
 const a=criar(t);
 await assert.rejects(a.x.registrarPagamentoConciliado({
  ...a.entrada,itens:[{sku:'SKU_099',quantidade:4}]
 }),{codigo:'PEDIDO_DIVERGENTE_DO_ORIGINAL'});
 assert.equal(a.sent.length,0);
 await a.x.registrarPagamentoConciliado(a.entrada);
 a.statusPedido('CANCELADO');
 await assert.rejects(a.y.despachar({
  pedidoId:a.entrada.pedidoId,fornecedorId:a.entrada.fornecedorId
 }),{codigo:'PEDIDO_INTERNO_NAO_APROVADO'});
 a.statusPedido('APROVADO_PARA_EXPEDICAO');
 a.itensPedido([{sku:'SKU_099',quantidade:1}]);
 await assert.rejects(a.x.despachar({
  pedidoId:a.entrada.pedidoId,fornecedorId:a.entrada.fornecedorId
 }),{codigo:'PEDIDO_DIVERGENTE_DO_ORIGINAL'});
 assert.equal(a.sent.length,0);
 assert.equal(a.db1.prepare(
  "SELECT estado FROM loja_real_outbox_fornecedor"
 ).get().estado,'PENDENTE');
});

test('custo do distribuidor ainda não quitado impede envio mesmo com PIX do cliente',async t=>{
 const x=criar(t);
 await x.x.registrarPagamentoConciliado(x.entrada);
 x.custoLiberado(false);
 await assert.rejects(x.x.despachar({pedidoId:x.entrada.pedidoId,
  fornecedorId:x.entrada.fornecedorId}),
  {codigo:'CUSTO_FORNECEDOR_SEM_LIBERACAO'});
 assert.equal(x.sent.length,0);
 assert.equal(x.x.consultar({pedidoId:x.entrada.pedidoId,
  fornecedorId:x.entrada.fornecedorId}).estado,'PENDENTE');
 x.custoLiberado(true);
 const enviado=await x.x.despachar({pedidoId:x.entrada.pedidoId,
  fornecedorId:x.entrada.fornecedorId});
 assert.equal(enviado.estado,'ENVIADO');
 assert.equal(x.sent.length,1);
});
