'use strict';
// Teste de contrato: pedido comercial e evento LOOP compartilham o MESMO
// commit SQLite. Nenhuma das operações cria posição, bônus ou dinheiro.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {PedidosComerciaisSQLite}=
 require('../src/producao/pedidos-comerciais-sqlite');
const {EventosComerciaisLoopSQLite}=
 require('../src/producao/eventos-comerciais-loop-sqlite');
const {MotorLoopIntegradoSQLite}=
 require('../src/producao/motor-loop-integrado-sqlite');
const {validarIdentidade}=
 require('../src/producao/backup-identidade-real');

const DOC='Consentimento de ensaio exclusivo de pedidos, eventos comerciais e '+
 'recuperação, sem pagamentos, posições, bônus ou participação financeira real.';
const ENDERECO={destinatario:'Pessoa de Ensaio',cep:'27250010',
 logradouro:'Rua Teste',numero:'10',bairro:'Centro',
 cidade:'Volta Redonda',uf:'RJ',complemento:''};
async function preparar(t,{produtosCentavos=25000,freteCentavos=1500}={}){
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-evento-pedido-'));
 const arquivo=path.join(pasta,'comercial.sqlite');
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const db=new DatabaseSync(arquivo);
 db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000');
 t.after(()=>db.close());
 const contas=new IdentidadeClienteLoopReal({
  banco:db,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TERMOS-TESTE',texto:DOC},
  privacidade:{versao:'LOOP-PRIVACIDADE-TESTE',texto:DOC},
  enviarEmail:async()=>true
 });
 const docs=contas.documentos();
 const titular=await contas.cadastrar({
  nome:'Pessoa Exemplo',nick:'Comprador',email:'comprador@example.invalid',
  senha:'SenhaDeEnsaio2026!',aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
  versaoPrivacidade:docs.privacidade.versao,
  hashPrivacidade:docs.privacidade.hash
 });
 db.prepare('UPDATE loop_real_contas SET email_confirmado_em=? WHERE id=?')
  .run(Date.now(),titular.titularId);
 const motor=new MotorLoopIntegradoSQLite({banco:db});
 const chavePedidos=randomBytes(32),total=produtosCentavos+freteCentavos;
 const cotacao={
  cotacaoId:'COT_TESTE_01',titularId:titular.titularId,
  cepDestino:ENDERECO.cep,expiraEm:Date.now()+600000,
  status:'APROVADA',fornecedorId:'FORNECEDOR_TESTE',
  freteCentavos,itens:[{
   sku:'SKU_01',precoUnitCentavos:produtosCentavos,quantidade:1
  }]
 };
 let estado='PENDENTE',pagamentoId='PAG_SIMULADO_01',valor=total;
 const chave=()=>({banco:db,chavePedidos,
  consultarCotacaoConfiavel:async()=>cotacao,
  consultarPagamentoPsp:async({pedidoId})=>({
   pedidoId,status:estado,moeda:'BRL',pagamentoId,valorCentavos:valor
  })});
 // Cria as tabelas de pedido antes da ponte de eventos, na mesma base.
 new PedidosComerciaisSQLite(chave());
 const eventos=new EventosComerciaisLoopSQLite({banco:db});
 const montar=(sink=eventos)=>new PedidosComerciaisSQLite({
  ...chave(),eventosComerciais:sink
 });
 const pedidos=montar();
 const novo=await pedidos.criarPedido({
  titularId:titular.titularId,cotacaoId:cotacao.cotacaoId,
  chaveIdempotencia:'CARRINHO_01',enderecoEntrega:ENDERECO
 });
 assert.equal(novo.status,'AGUARDANDO_PAGAMENTO');
 return {db,arquivo,contas,motor,eventos,montar,pedidos,novo,titular,
  total,produtosCentavos,
  pspStatus:v=>{estado=v},pspValor:v=>{valor=v},
  pspPagamento:v=>{pagamentoId=v}};
}
test('pedido pago alimenta só a fila de revisão; replay é único e estorno é atômico',async t=>{
 const x=await preparar(t);
 const id=x.novo.pedidoId;
 await assert.rejects(x.pedidos.confirmarPagamento({pedidoId:id}),
  {codigo:'PAGAMENTO_PSP_NAO_CONCILIADO'});
 assert.equal(x.eventos.verificar().eventos,0);
 x.pspValor(x.total-1);x.pspStatus('CONFIRMADO');
 await assert.rejects(x.pedidos.confirmarPagamento({pedidoId:id}),
  {codigo:'PAGAMENTO_PSP_NAO_CONCILIADO'});
 assert.equal(x.eventos.verificar().eventos,0);
 x.pspValor(x.total);
 assert.equal((await x.pedidos.confirmarPagamento({pedidoId:id})).confirmado,true);
 assert.equal(x.eventos.verificar().pendentes,1);
 assert.equal((await x.pedidos.confirmarPagamento({pedidoId:id})).confirmado,true);
 assert.equal(x.eventos.verificar().eventos,1);
 assert.equal(x.eventos.verificar().pedidosAprovadosSemEvento,0);
 assert.equal(x.eventos.consultarTitular({titularId:x.titular.titularId})
  .eventos[0].estado,'AGUARDANDO_CONCILIACAO');
 assert.equal(x.motor.consultar().tabuleiro.eventosNoCiclo,0);
 assert.equal(x.motor.consultar().filaB,0);
 assert.deepEqual(x.motor.consultar({titularId:x.titular.titularId})
  .eventosComerciais,{
   registrados:1,aguardandoConciliacao:1,cancelados:0,
   liberadosParaLoop:0
  });
 assert.equal(x.motor.consultar().posicoesReais,0);
 assert.equal(x.motor.verificar().integridade,'OK');
 assert.equal(validarIdentidade(x.arquivo).integridade,'ok');
 assert.equal(x.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 x.pspStatus('ESTORNADO');
 assert.equal((await x.pedidos.confirmarPagamento({pedidoId:id})).cancelado,true);
 assert.equal(x.eventos.verificar().cancelados,1);
 assert.equal(x.eventos.verificar().pendentes,0);
 assert.equal(x.motor.consultar().eventosComerciais.cancelados,1);
 assert.equal(x.motor.consultar().eventosComerciais.aguardandoConciliacao,0);
 assert.equal(x.motor.consultar().tabuleiro.eventosNoCiclo,0);
 assert.equal((await x.pedidos.confirmarPagamento({pedidoId:id})).cancelado,true);
 assert.equal(x.eventos.verificar().eventos,1);
 x.pspStatus('CONFIRMADO');
 await assert.rejects(x.pedidos.confirmarPagamento({pedidoId:id}),
  {codigo:'PEDIDO_CANCELADO'});
 assert.equal(x.eventos.verificar().cancelados,1);
 assert.equal(validarIdentidade(x.arquivo).integridade,'ok');
 assert.deepEqual(x.db.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('falha no registro de eventos faz rollback da confirmação comercial',async t=>{
 const x=await preparar(t);
 const quebrado={
  db:x.db,
  registrarPagamentoConciliadoEmTransacao(){
   throw Error('REGISTRO_EVENTO_INDISPONIVEL');
  },
  registrarCancelamentoEmTransacao(){
   throw Error('CANCELAMENTO_EVENTO_INDISPONIVEL');
  }
 };
 x.pspStatus('CONFIRMADO');
 await assert.rejects(x.montar(quebrado).confirmarPagamento({
  pedidoId:x.novo.pedidoId
 }),/REGISTRO_EVENTO_INDISPONIVEL/);
 const linha=x.db.prepare(
  'SELECT status,pagamento_id FROM loja_real_pedidos WHERE pedido_id=?'
 ).get(x.novo.pedidoId);
 assert.equal(linha.status,'AGUARDANDO_PAGAMENTO');
 assert.equal(linha.pagamento_id,null);
 assert.equal(x.eventos.verificar().eventos,0);
 await x.pedidos.confirmarPagamento({pedidoId:x.novo.pedidoId});
 x.pspStatus('ESTORNADO');
 await assert.rejects(x.montar(quebrado).confirmarPagamento({
  pedidoId:x.novo.pedidoId
 }),/CANCELAMENTO_EVENTO_INDISPONIVEL/);
 assert.equal(x.db.prepare(
  'SELECT status FROM loja_real_pedidos WHERE pedido_id=?'
 ).get(x.novo.pedidoId).status,'APROVADO_PARA_EXPEDICAO');
 assert.equal(x.eventos.verificar().pendentes,1);
});
test('pedido de valor inferior não gera direito nem gira o LOOP',async t=>{
 const x=await preparar(t,{produtosCentavos:10000,freteCentavos:1000});
 x.pspStatus('CONFIRMADO');
 await x.pedidos.confirmarPagamento({pedidoId:x.novo.pedidoId});
 const e=x.eventos.verificar();
 assert.equal(e.pendentes,1);
 assert.equal(e.direitosReaisCriados,0);
 assert.equal(e.girosAcionados,0);
 assert.equal(x.motor.verificar().compras,0);
 assert.equal(x.motor.consultar().posicoesReais,0);
 assert.equal(validarIdentidade(x.arquivo).integridade,'ok');
});
