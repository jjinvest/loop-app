'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {CatalogoMultiDistribuidoresSQLite}=
 require('../src/producao/catalogo-multidistribuidores-sqlite');
const {PedidosComerciaisSQLite}=
 require('../src/producao/pedidos-comerciais-sqlite');
const {ClassificacaoComercialLoopSQLite}=
 require('../src/producao/classificacao-comercial-loop-sqlite');
const {EventosComerciaisLoopSQLite}=
 require('../src/producao/eventos-comerciais-loop-sqlite');
const {MotorLoopIntegradoSQLite}=
 require('../src/producao/motor-loop-integrado-sqlite');
const {validarIdentidade,criarBackupIdentidadeReal,
 restaurarBackupIdentidadeReal}=
 require('../src/producao/backup-identidade-real');
const END={destinatario:'Cliente Ensaio',cep:'27250010',logradouro:'Rua Ensaio',
 numero:'10',bairro:'Centro',cidade:'Volta Redonda',uf:'RJ',complemento:''};
const DOC='Termos fictícios de teste de classificação comercial da AKITEMM '+
 'sem conferir saldo, comissão, participação nem movimentação financeira real.';
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-cor-comercial-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'clientes.sqlite');
 const db=new DatabaseSync(file);
 db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL');
 t.after(()=>db.close());
 const contas=new IdentidadeClienteLoopReal({
  banco:db,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TERMOS-2026',texto:DOC},
  privacidade:{versao:'LOOP-PRIV-2026',texto:DOC},
  enviarEmail:async()=>true
 });
 const d=contas.documentos();
 const titular=await contas.cadastrar({
  nome:'Cliente Teste',nick:'Cliente',email:'cliente@example.invalid',
  senha:'SenhaDaProva2026!',aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:d.termos.versao,hashTermos:d.termos.hash,
  versaoPrivacidade:d.privacidade.versao,hashPrivacidade:d.privacidade.hash
 });
 db.prepare('UPDATE loop_real_contas SET email_confirmado_em=? WHERE id=?')
  .run(Date.now(),titular.titularId);
 const catalogo=new CatalogoMultiDistribuidoresSQLite({
  banco:db,distribuidorHomologado:()=>false
 });
 new PedidosComerciaisSQLite({banco:db,chavePedidos:randomBytes(32),
  consultarCotacaoConfiavel:async()=>null,
  consultarPagamentoPsp:async()=>null});
 const cor=new ClassificacaoComercialLoopSQLite({banco:db});
 const eventos=new EventosComerciaisLoopSQLite({
  banco:db,classificacaoLoop:cor
 });
 const motor=new MotorLoopIntegradoSQLite({banco:db});
 const chavePedidos=randomBytes(32);
 let pagou=true,estornou=false,valorPsp=null;
 const cotacoes=new Map();
 const pedidos=new PedidosComerciaisSQLite({
  banco:db,chavePedidos,classificacaoLoop:cor,
  eventosComerciais:eventos,
  consultarCotacaoConfiavel:async({cotacaoId})=>cotacoes.get(cotacaoId),
  consultarPagamentoPsp:async({pedidoId})=>{
   const p=db.prepare(
    'SELECT valor_total_centavos FROM loja_real_pedidos WHERE pedido_id=?'
   ).get(pedidoId);
   return {pedidoId,status:estornou?'ESTORNADO':pagou?'CONFIRMADO':'PENDENTE',
    pagamentoId:'PAG_'+pedidoId,valorCentavos:valorPsp??p.valor_total_centavos,
    moeda:'BRL'};
  }
 });
 let contador=0;
 function produto(id,preco){
  catalogo.criarProduto({produtoId:id,titulo:'Produto '+id});
  catalogo.vincularOferta({
   produtoId:id,distribuidorId:'distribuidorA',sku:'SKU_'+id,
   precoUnitCentavos:preco
  });
 }
 async function pedido(itens,{frete=1000}={}){
  contador++;
  const cotacaoId='COTACAO_'+contador;
  const grupos=[{fornecedorId:'distribuidorA',freteCentavos:frete,
   itens:itens.map(i=>({
    sku:'SKU_'+i.produto,precoUnitCentavos:i.preco,quantidade:i.quantidade||1
   }))}];
  cotacoes.set(cotacaoId,{
   cotacaoId,titularId:titular.titularId,cepDestino:END.cep,
   status:'APROVADA',expiraEm:Date.now()+600000,grupos
  });
  const p=await pedidos.criarPedido({titularId:titular.titularId,
   cotacaoId,chaveIdempotencia:'CHAVE_'+contador,enderecoEntrega:END});
  return p.pedidoId;
 }
 return {db,file,dir,contas,titular,catalogo,cor,eventos,motor,pedidos,produto,
  pedido,pspAtivo:x=>{pagou=x},estornar:x=>{estornou=x},
  valorPsp:x=>{valorPsp=x}};
}
test('verde por R$ 250 sem frete e revisão posterior não muda pedido',async t=>{
 const x=await fixture(t);
 x.produto('verde1',25000);
 x.cor.configurarProduto({produtoId:'verde1',cor:'VERDE',autorizado:true});
 const id=await x.pedido([{produto:'verde1',preco:25000}],{frete:3500});
 assert.equal(x.cor.avaliarPedido({pedidoId:id}).posicoesVerdesPrevistas,1);
 assert.equal(x.cor.verificar().integridade,'OK');
 x.cor.configurarProduto({produtoId:'verde1',cor:'CINZA',
  revisaoEsperada:1,autorizado:true});
 assert.equal(x.cor.avaliarPedido({pedidoId:id}).posicoesVerdesPrevistas,1);
 const l=x.db.prepare(
  'SELECT cor,revisao FROM loop_real_fotos_regras_pedido WHERE pedido_id=?'
 ).get(id);
 assert.equal(l.cor,'VERDE');
 assert.equal(l.revisao,1);
 assert.throws(()=>x.db.prepare(
  "UPDATE loop_real_fotos_regras_pedido SET cor='CINZA' WHERE pedido_id=?"
 ).run(id),/fotografia imutavel/);
 assert.equal((await x.pedidos.confirmarPagamento({pedidoId:id})).confirmado,true);
 assert.equal((await x.pedidos.confirmarPagamento({pedidoId:id})).confirmado,true);
 assert.equal(x.eventos.verificar().eventos,1);
 assert.equal(x.cor.avaliarPedido({pedidoId:id}).posicoesReaisCriadas,0);
 assert.equal(x.motor.verificar().compras,0);
 assert.equal(validarIdentidade(x.file).integridade,'ok');
});
test('cinza, verde agregado, dourado e roxo não viram posições reais',async t=>{
 const x=await fixture(t);
 for(const [nome,preco] of [
  ['cinza1',30000],['verde1',12500],['verde2',12500],
  ['gold1',25000],['purple1',30000],['quase1',24900]
 ])x.produto(nome,preco);
 for(const id of ['verde1','verde2','quase1'])
  x.cor.configurarProduto({produtoId:id,cor:'VERDE',autorizado:true});
 x.cor.configurarProduto({produtoId:'gold1',cor:'DOURADO',
  autorizado:true});
 x.cor.configurarProduto({produtoId:'purple1',cor:'ROXO',
  roxasPorUnidade:3,autorizado:true});
 const ids=[
  await x.pedido([{produto:'cinza1',preco:30000}]),
  await x.pedido([{produto:'verde1',preco:12500},
   {produto:'verde2',preco:12500}]),
  await x.pedido([{produto:'gold1',preco:25000,quantidade:2}]),
  await x.pedido([{produto:'purple1',preco:30000}]),
  await x.pedido([{produto:'quase1',preco:24900}],{frete:500})
 ];
 const a=ids.map(id=>x.cor.avaliarPedido({pedidoId:id}));
 assert.equal(a[0].totalPosicoesPrevistas,0);
 assert.equal(a[0].itensSemRegraExplicita,1);
 assert.equal(a[1].posicoesVerdesPrevistas,1);
 assert.equal(a[2].posicoesDouradasPrevistas,2);
 assert.equal(a[3].posicoesRoxasBloqueadas,3);
 assert.equal(a[3].totalPosicoesPrevistas,0);
 assert.equal(a[3].eventosEspeciaisNaoHomologados,true);
 assert.equal(a[4].posicoesVerdesPrevistas,0);
 assert.equal(a[4].totalPosicoesPrevistas,0);
 for(const r of a){
  assert.equal(r.posicoesReaisCriadas,0);
  assert.equal(r.autorizadoParaGiro,false);
 }
 assert.equal(x.cor.verificar().pedidos,5);
 assert.equal(x.motor.verificar().compras,0);
 assert.equal(validarIdentidade(x.file).integridade,'ok');
});
test('dourado abaixo de R$ 250 rejeita pedido e fotografia no mesmo rollback',async t=>{
 const x=await fixture(t);
 x.produto('gold1',24900);
 x.cor.configurarProduto({produtoId:'gold1',cor:'DOURADO',autorizado:true});
 await assert.rejects(x.pedido([{produto:'gold1',preco:24900}]),
  {codigo:'CORES_COMERCIAIS_DOURADO_ABAIXO_PISO'});
 assert.equal(x.db.prepare(
  'SELECT COUNT(*) AS n FROM loja_real_pedidos'
 ).get().n,0);
 assert.equal(x.db.prepare(
  'SELECT COUNT(*) AS n FROM loop_real_fotos_regras_pedido'
 ).get().n,0);
});
test('backup cifrado preserva cores do pedido e barra fotografia parcial',async t=>{
 const x=await fixture(t);
 x.produto('verde1',25000);
 x.cor.configurarProduto({produtoId:'verde1',cor:'VERDE',autorizado:true});
 const id=await x.pedido([{produto:'verde1',preco:25000}]);
 await x.pedidos.confirmarPagamento({pedidoId:id});
 const backup=path.join(x.dir,'backup.looprealbak');
 const restaurado=path.join(x.dir,'restaurado.sqlite');
 const chave=randomBytes(32);
 await criarBackupIdentidadeReal({
  origem:x.file,destino:backup,chaveBackup:chave,autorizado:true
 });
 await restaurarBackupIdentidadeReal({
  origem:backup,destino:restaurado,chaveBackup:chave,autorizado:true
 });
 const db2=new DatabaseSync(restaurado);
 try{
  db2.exec('PRAGMA foreign_keys=ON');
  const check=Object.create(ClassificacaoComercialLoopSQLite.prototype);
  check.db=db2;
  assert.equal(check.avaliarPedido({pedidoId:id}).posicoesVerdesPrevistas,1);
  assert.equal(check.verificar().integridade,'OK');
  assert.equal(validarIdentidade(restaurado).integridade,'ok');
 }finally{db2.close();}
 x.db.exec('DROP TABLE loop_real_fotos_regras_pedido');
 assert.throws(()=>validarIdentidade(x.file),
  {codigo:'BACKUP_COMERCIAL_CORES_INCOMPLETAS'});
});
