'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {PedidosComerciaisSQLite}=
 require('../src/producao/pedidos-comerciais-sqlite');
const {PedidosFornecedorOutbox}=
 require('../src/producao/pedidos-fornecedor-outbox');
const {RegistroFornecedores,CONTRATO_FORNECEDOR}=
 require('../src/integracoes/registro-fornecedores');

const DOCUMENTO='Aceite de teste da identidade real do Escritório LOOP e Loja AKITEMM. '+
 'Termos de laboratorio para proteger o titular sem liberar pagamentos ou retornos reais.';
const ENDERECO={destinatario:'Cliente Exemplo',cep:'27250010',logradouro:'Rua Exemplo',
 numero:'7',bairro:'Centro',cidade:'Volta Redonda',uf:'RJ',complemento:''};

async function preparar(t){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000');
 t.after(()=>db.close());
 let valorPsp=36800,statusPsp='CONFIRMADO';
 let cotacaoCompleta={
  cotacaoId:'COTACAO_MULTI_01',status:'APROVADA',expiraEm:Date.now()+900000,
  grupos:[
   {fornecedorId:'dist_A',freteCentavos:1000,itens:[
    {sku:'SKU_01',quantidade:1,precoUnitCentavos:25000},
    {sku:'SKU_02',quantidade:1,precoUnitCentavos:1000}
   ]},
   {fornecedorId:'dist_B',freteCentavos:1800,itens:[
    // SKU pode se repetir em outro distribuidor; chave real é fornecedor+SKU.
    {sku:'SKU_01',quantidade:2,precoUnitCentavos:4500}
   ]}
  ]
 };
 // 25000+1000+9000+1000+1800=37800
 valorPsp=37800;
 const enviados=[];
 const identity=new IdentidadeClienteLoopReal({
  banco:db,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TESTE-2026',texto:DOCUMENTO},
  privacidade:{versao:'LOOP-PRIV-2026',texto:DOCUMENTO},
  enviarEmail:async d=>{enviados.push(d);return true}
 });
 const docs=identity.documentos();
 const ana=await identity.cadastrar({
  nome:'Cliente Exemplo',nick:'Cliente',email:'cliente@example.invalid',
  senha:'SenhaDeTesteForte2026!',aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
  versaoPrivacidade:docs.privacidade.versao,hashPrivacidade:docs.privacidade.hash
 });
 cotacaoCompleta.titularId=ana.titularId;
 cotacaoCompleta.cepDestino=ENDERECO.cep;
 await identity.solicitarCodigo({titularId:ana.titularId,finalidade:'EMAIL'});
 await identity.confirmarCodigo({
  titularId:ana.titularId,codigo:enviados[0].codigo,finalidade:'EMAIL'
 });
 const psp=async({pedidoId})=>({
  pedidoId,status:statusPsp,moeda:'BRL',
  pagamentoId:'PAGAMENTO_SIMULADO_01',valorCentavos:valorPsp
 });
 const pedidos=new PedidosComerciaisSQLite({
  banco:db,chavePedidos:randomBytes(32),
  consultarCotacaoConfiavel:async({cotacaoId})=>
   cotacaoId===cotacaoCompleta.cotacaoId?cotacaoCompleta:null,
  consultarPagamentoPsp:psp
 });
 const chamados=[];
 const registro=new RegistroFornecedores();
 for(const id of ['dist_A','dist_B']){
  registro.registrar({fornecedorId:id,adaptador:{
   versaoContrato:CONTRATO_FORNECEDOR,
   async consultarEstoque(){return {quantidade:100}},
   async consultarStatus(){return {status:'PENDENTE'}},
   async enviarPedidoIdempotente(dados){
    chamados.push({id,dados});
    return {pedidoParceiroId:'PED_PARCEIRO_'+id};
   },
   async consultarPedidoPorChave(){return {encontrado:false}}
  }});
 }
 const outbox=new PedidosFornecedorOutbox({
  banco:db,registro,chavePedidos:randomBytes(32),
  consultarPagamentoConciliado:psp,
  consultarPedidoAprovado:args=>pedidos.consultarPedidoAprovado(args)
 });
 const entrada={titularId:ana.titularId,cotacaoId:'COTACAO_MULTI_01',
  chaveIdempotencia:'CLIENTE_CARRINHO_1',enderecoEntrega:ENDERECO};
 return {db,ana,pedidos,outbox,chamados,entrada,
  pspStatus:v=>{statusPsp=v},pspValor:v=>{valorPsp=v},
  mudarCotacao:v=>{cotacaoCompleta=v}};
}

test('uma compra multiproduto, dois distribuidores, um pagamento e duas remessas',async t=>{
 const x=await preparar(t);
 const pedido=await x.pedidos.criarPedido(x.entrada);
 assert.equal(pedido.status,'AGUARDANDO_PAGAMENTO');
 assert.equal(pedido.valorTotalCentavos,37800);
 assert.equal(pedido.freteCentavos,2800);
 assert.equal(pedido.quantidadeDistribuidores,2);
 assert.deepEqual(pedido.fornecedores,['dist_A','dist_B']);
 assert.equal(pedido.fornecedorId,null,'carrinho não pertence a um único parceiro');
 assert.equal(x.chamados.length,0);
 const confirm=await x.pedidos.confirmarPagamento({pedidoId:pedido.pedidoId});
 assert.equal(confirm.status,'APROVADO_PARA_EXPEDICAO');
 assert.equal(confirm.valorTotalCentavos,37800);
 const chave={pedidoId:pedido.pedidoId};
 const remessaA=x.pedidos.consultarPedidoAprovado({...chave,fornecedorId:'dist_A'});
 const remessaB=x.pedidos.consultarPedidoAprovado({...chave,fornecedorId:'dist_B'});
 assert.deepEqual(remessaA.itens,[
  {sku:'SKU_01',quantidade:1},{sku:'SKU_02',quantidade:1}
 ]);
 assert.deepEqual(remessaB.itens,[{sku:'SKU_01',quantidade:2}]);
 assert.equal(remessaA.valorTotalCentavos,37800);
 assert.equal(remessaB.valorTotalCentavos,37800);
 assert.equal(x.pedidos.consultarPedidoAprovado({...chave,fornecedorId:'dist_C'}),null);
 assert.equal(x.pedidos.consultarPedidoAprovado(chave),null);
 for(const fornecedorId of ['dist_A','dist_B']){
  const out=await x.outbox.registrarPagamentoConciliado({...chave,fornecedorId});
  assert.equal(out.estado,'PENDENTE');
  assert.equal(out.repetido,false);
 }
 assert.equal(x.db.prepare(
  'SELECT COUNT(*) AS total FROM loja_real_outbox_fornecedor'
 ).get().total,2);
 for(const fornecedorId of ['dist_A','dist_B']){
  const envio=await x.outbox.despachar({...chave,fornecedorId});
  assert.equal(envio.estado,'ENVIADO');
  assert.equal(envio.pedidoParceiroId,'PED_PARCEIRO_'+fornecedorId);
  assert.equal((await x.outbox.despachar({...chave,fornecedorId})).repetido,true);
 }
 assert.equal(x.chamados.length,2,'cada distribuidor recebe uma remessa');
 const a=x.chamados.find(z=>z.id==='dist_A');
 const b=x.chamados.find(z=>z.id==='dist_B');
 assert.deepEqual(a.dados.itens,remessaA.itens);
 assert.deepEqual(b.dados.itens,remessaB.itens);
 assert.notEqual(a.dados.chaveIdempotencia,b.dados.chaveIdempotencia);
 assert.equal(a.dados.pedidoLojaId,b.dados.pedidoLojaId);
 const bruto=JSON.stringify(x.db.prepare('SELECT * FROM loja_real_pedidos').all());
 assert.equal(bruto.includes('Cliente Exemplo'),false);
 assert.equal(bruto.includes('27250010'),false);
 assert.equal(x.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('estorno entre a primeira e segunda remessa impede novo envio',async t=>{
 const x=await preparar(t);
 const pedido=await x.pedidos.criarPedido(x.entrada);
 await x.pedidos.confirmarPagamento({pedidoId:pedido.pedidoId});
 const key={pedidoId:pedido.pedidoId};
 await x.outbox.registrarPagamentoConciliado({...key,fornecedorId:'dist_A'});
 await x.outbox.registrarPagamentoConciliado({...key,fornecedorId:'dist_B'});
 await x.outbox.despachar({...key,fornecedorId:'dist_A'});
 x.pspStatus('ESTORNADO');
 await assert.rejects(x.outbox.despachar({...key,fornecedorId:'dist_B'}),
  {codigo:'PAGAMENTO_PSP_NAO_CONCILIADO'});
 assert.equal(x.chamados.length,1);
 assert.equal(x.outbox.consultar({...key,fornecedorId:'dist_B'}).estado,'PENDENTE');
});
test('cotação inválida por fornecedor repetido ou valor divergente não cria pedido',async t=>{
 const x=await preparar(t);
 const base={cotacaoId:'COTACAO_MULTI_01',status:'APROVADA',
  titularId:x.ana.titularId,cepDestino:ENDERECO.cep,
  expiraEm:Date.now()+900000};
 x.mudarCotacao({...base,grupos:[
  {fornecedorId:'dist_A',freteCentavos:1000,
   itens:[{sku:'SKU_01',quantidade:1,precoUnitCentavos:12000}]},
  {fornecedorId:'dist_A',freteCentavos:1000,
   itens:[{sku:'SKU_02',quantidade:1,precoUnitCentavos:12000}]}
 ]});
 await assert.rejects(x.pedidos.criarPedido(x.entrada),
  {codigo:'COTACAO_COMERCIAL_INVALIDA'});
 assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM loja_real_pedidos').get().n,0);
});

test('cotacao de outro titular ou CEP nao pode ser reutilizada',async t=>{
 const x=await preparar(t);
 const valido={cotacaoId:'COTACAO_MULTI_01',status:'APROVADA',
  titularId:'titular-de-outro-cliente',cepDestino:ENDERECO.cep,
  expiraEm:Date.now()+900000,
  grupos:[{fornecedorId:'dist_A',freteCentavos:800,
   itens:[{sku:'SKU_01',quantidade:1,precoUnitCentavos:25000}]}]};
 x.mudarCotacao(valido);
 await assert.rejects(x.pedidos.criarPedido(x.entrada),
  {codigo:'COTACAO_COMERCIAL_NAO_CONFIRMADA'});
 x.mudarCotacao({...valido,titularId:x.ana.titularId,cepDestino:'01001000'});
 await assert.rejects(x.pedidos.criarPedido(x.entrada),
  {codigo:'COTACAO_COMERCIAL_NAO_CONFIRMADA'});
 assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM loja_real_pedidos').get().n,0);
});
