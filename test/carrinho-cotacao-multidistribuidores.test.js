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
const {ClassificacaoComercialLoopSQLite}=
 require('../src/producao/classificacao-comercial-loop-sqlite');
const {EventosComerciaisLoopSQLite}=
 require('../src/producao/eventos-comerciais-loop-sqlite');
const {MotorLoopIntegradoSQLite}=
 require('../src/producao/motor-loop-integrado-sqlite');
const {PreflightCapacidadeCheckoutSQLite}=
 require('../src/producao/preflight-capacidade-checkout-sqlite');
const {PromocaoPedidoMotorEnsaioSQLite}=
 require('../src/producao/promocao-pedido-motor-ensaio-sqlite');
const {SincronizadorComercialLoopEnsaioSQLite}=
 require('../src/producao/sincronizador-comercial-loop-ensaio-sqlite');
const {JornadaComercialUnificadaEnsaioSQLite}=
 require('../src/producao/jornada-comercial-unificada-ensaio-sqlite');
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
 let statusPsp='CONFIRMADO';
 const psp=async({pedidoId})=>({
  pedidoId,status:statusPsp,moeda:'BRL',
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
  consultarPedidoAprovado:args=>pedidos.consultarPedidoAprovado(args),
  consultarLiberacaoCustoFornecedor:async({pedidoId,fornecedorId})=>({
   pedidoId,fornecedorId,estado:'CUSTO_QUITADO',
   referencia:'FORNECEDOR_PROVA_TESTE_01',
   origem:'CANAL_FORNECEDOR_AUTORIZADO'
  })
 });
 return {db,cliente,catalogo,cotacoes,pedidos,outbox,enviados,homologados,
  registro,psp,setPspStatus:s=>{statusPsp=s;},
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


function montarJornada(x){
 const classificacao=new ClassificacaoComercialLoopSQLite({banco:x.db});
 for(const produtoId of ['camiseta','tenis','mochila'])
  classificacao.configurarProduto({
   produtoId,cor:'VERDE',autorizado:true
  });
 const eventos=new EventosComerciaisLoopSQLite({
  banco:x.db,classificacaoLoop:classificacao
 });
 const motor=new MotorLoopIntegradoSQLite({banco:x.db});
 const promocao=new PromocaoPedidoMotorEnsaioSQLite({
  banco:x.db,motor,classificacaoLoop:classificacao,
  chaveCpfEnsaio:randomBytes(32)
 });
 const integracao=new SincronizadorComercialLoopEnsaioSQLite({
  banco:x.db,motor,classificacaoLoop:classificacao,promocao
 });
 const preflight=new PreflightCapacidadeCheckoutSQLite({
  banco:x.db,motor,classificacaoLoop:classificacao
 });
 const pedidos=new PedidosComerciaisSQLite({
  banco:x.db,chavePedidos:x.pedidos.key,
  consultarCotacaoConfiavel:arg=>x.cotacoes.consultarCotacaoConfiavel(arg),
  consultarPagamentoPsp:x.psp,preflightCapacidade:preflight,
  classificacaoLoop:classificacao,eventosComerciais:eventos,
  integradorComercialEnsaio:integracao
 });
 let custoQuitado=false;
 const outbox=new PedidosFornecedorOutbox({
  banco:x.db,registro:x.registro,chavePedidos:randomBytes(32),
  consultarPagamentoConciliado:x.psp,
  consultarPedidoAprovado:arg=>pedidos.consultarPedidoAprovado(arg),
  consultarLiberacaoCustoFornecedor:async({pedidoId,fornecedorId})=>({
   pedidoId,fornecedorId,
   estado:custoQuitado?'CUSTO_QUITADO':'AGUARDANDO_CUSTO_FORNECEDOR',
   origem:'CANAL_FORNECEDOR_AUTORIZADO',
   referencia:'CUSTO_FORNECEDOR_PROVA_ENSAIO_001'
  })
 });
 const jornada=new JornadaComercialUnificadaEnsaioSQLite({
  banco:x.db,cotacoes:x.cotacoes,pedidos,preflight,outbox,integracao
 });
 return {jornada,pedidos,preflight,motor,outbox,eventos,integracao,
  autorizarCusto:()=>{custoQuitado=true}};
}
test('fluxo unico: estoque/frete de dois fornecedores, cotacao, reserva, PSP reconsultado, fila e remessas',async t=>{
 const x=await montar(t),j=montarJornada(x);
 const previa=await j.jornada.simularCarrinho(x.entrada);
 assert.equal(previa.grupos.length,2);
 assert.equal(previa.subtotalProdutosCentavos,28000);
 const pedido=await j.jornada.registrarPedido({
  ...x.entrada,servicosFrete:x.servicos,
  resumoAceito:previa.resumoHash,
  chaveIdempotencia:'TESTE_UNICO_FORNECEDORES_PSP_1',
  enderecoEntrega:ENDERECO
 });
 assert.equal(pedido.status,'AGUARDANDO_PAGAMENTO');
 assert.equal(pedido.quantidadeDistribuidores,2);
 assert.equal(pedido.capacidade.reservadas,1);
 assert.equal(pedido.cobrancaCriada,false);
 assert.equal(pedido.checkoutReal,false);
 assert.equal(j.motor.verificar().compras,0);
 assert.equal(x.enviados.length,0);
 assert.equal(j.jornada.consultarStatus().pedidos.aguardando,1);
 x.setPspStatus('PENDENTE');
 await assert.rejects(
  j.jornada.verificarPagamentoEPrepararRemessas({pedidoId:pedido.pedidoId}),
  {codigo:'PAGAMENTO_PSP_NAO_CONCILIADO'});
 assert.equal(j.preflight.consultar({titularId:x.cliente.titularId}).reservadas,1);
 assert.equal(j.motor.verificar().compras,0);
 assert.equal(x.enviados.length,0);
 x.setPspStatus('CONFIRMADO');
 const aprovado=await j.jornada.verificarPagamentoEPrepararRemessas({
  pedidoId:pedido.pedidoId
 });
 assert.equal(aprovado.estado,'AGUARDAR_LIBERACAO_FORNECEDOR');
 assert.equal(aprovado.remessasPreparadas,2);
 assert.equal(aprovado.pendentes.length,0);
 assert.equal(aprovado.novasPosicoesEnsaio,1);
 assert.equal(aprovado.remessasEnviadas,0);
 assert.equal(j.motor.consultar().filaB,1);
 assert.equal(j.preflight.consultar({titularId:x.cliente.titularId}).reservadas,0);
 assert.equal(j.preflight.consultar({titularId:x.cliente.titularId}).ativas,1);
 assert.equal(x.enviados.length,0);
 assert.equal(j.outbox.consultar({
  pedidoId:pedido.pedidoId,fornecedorId:'dist_A'
 }).estado,'PENDENTE');
 assert.equal(j.outbox.consultar({
  pedidoId:pedido.pedidoId,fornecedorId:'dist_B'
 }).estado,'PENDENTE');
 const replay=await j.jornada.verificarPagamentoEPrepararRemessas({
  pedidoId:pedido.pedidoId
 });
 assert.equal(replay.remessasPreparadas,0);
 assert.equal(replay.remessasJaPreparadas,2);
 assert.equal(j.motor.verificar().compras,1);
 assert.equal(j.eventos.verificar().eventos,1);
 assert.equal(j.preflight.verificar().integridade,'OK');
 assert.equal(j.jornada.consultarStatus().remessas.pendentes,2);
 assert.equal(j.jornada.consultarStatus().remessas.enviadas,0);
 assert.equal(x.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('fornecedor exige custo quitado, revalida PSP e envio unico com chave idempotente',async t=>{
 const x=await montar(t),j=montarJornada(x);
 const previa=await j.jornada.simularCarrinho(x.entrada);
 const pedido=await j.jornada.registrarPedido({
  ...x.entrada,servicosFrete:x.servicos,
  resumoAceito:previa.resumoHash,
  chaveIdempotencia:'TESTE_CUSTO_PSP_IDEMPOTENCIA_02',
  enderecoEntrega:ENDERECO
 });
 await j.jornada.verificarPagamentoEPrepararRemessas({pedidoId:pedido.pedidoId});
 await assert.rejects(j.outbox.despachar({
  pedidoId:pedido.pedidoId,fornecedorId:'dist_A'
 }),{codigo:'CUSTO_FORNECEDOR_SEM_LIBERACAO'});
 assert.equal(x.enviados.length,0);
 j.autorizarCusto();
 x.setPspStatus('ESTORNADO');
 await assert.rejects(j.outbox.despachar({
  pedidoId:pedido.pedidoId,fornecedorId:'dist_A'
 }),{codigo:'PAGAMENTO_PSP_NAO_CONCILIADO'});
 assert.equal(x.enviados.length,0);
 x.setPspStatus('CONFIRMADO');
 const a=await j.outbox.despachar({
  pedidoId:pedido.pedidoId,fornecedorId:'dist_A'
 });
 assert.equal(a.estado,'ENVIADO');
 const outro=await j.outbox.despachar({
  pedidoId:pedido.pedidoId,fornecedorId:'dist_B'
 });
 assert.equal(outro.estado,'ENVIADO');
 assert.equal(x.enviados.length,2);
 const replay=await j.outbox.despachar({
  pedidoId:pedido.pedidoId,fornecedorId:'dist_A'
 });
 assert.equal(replay.repetido,true);
 assert.equal(x.enviados.length,2);
 assert.notEqual(x.enviados[0].chaveIdempotencia,x.enviados[1].chaveIdempotencia);
 assert.equal(j.jornada.consultarStatus().remessas.enviadas,2);
});
test('jornada de homologacao recusa habilitacao com objetos de bancos ou motores distintos',async t=>{
 const x=await montar(t),j=montarJornada(x);
 const banca=new DatabaseSync(':memory:');
 t.after(()=>banca.close());
 assert.throws(()=>new JornadaComercialUnificadaEnsaioSQLite({
  banco:banca,cotacoes:x.cotacoes,pedidos:j.pedidos,
  preflight:j.preflight,outbox:j.outbox,integracao:j.integracao
 }),{codigo:'JORNADA_COMERCIAL_EXIGE_MESMO_SQLITE_E_MOTOR'});
 const ambiente=process.env.NODE_ENV;
 try{
  process.env.NODE_ENV='production';
  assert.throws(()=>new JornadaComercialUnificadaEnsaioSQLite({
   banco:x.db,cotacoes:x.cotacoes,pedidos:j.pedidos,
   preflight:j.preflight,outbox:j.outbox,integracao:j.integracao
  }),{codigo:'JORNADA_COMERCIAL_ENSAIO_PROIBIDA_PRODUCAO'});
  assert.throws(()=>j.jornada.verificarPagamentoEPrepararRemessas({
   pedidoId:'PEDIDO_TESTE_NAO_DISPONIVEL'
  }),{codigo:'JORNADA_COMERCIAL_ENSAIO_PROIBIDA_PRODUCAO'});
 }finally{
  if(ambiente===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=ambiente;
 }
});
