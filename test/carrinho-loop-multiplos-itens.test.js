'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');

function produto(id,centavos,tipo='PDF'){
 return {id,nome:'Item ficticio '+id,tipo,estado:'PUBLICADO',
  descricao:'Teste de carrinho LOOP, nao comercializado',
  precoCentavos:centavos,
  entrega:tipo==='PDF'?'DOWNLOAD_APOS_CONFIRMACAO':'FORNECEDOR_INTEGRADO',
  fotos:[],videoApresentacaoUrl:null,detalhes:[]};
}
test('carrinho de varios itens soma R$250 em um pedido e cria UMA posicao azul',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 for(const [id,price,tipo] of [
  ['item-a',10000,'PDF'],['item-b',15000,'FISICO'],
  ['item-c',7500,'PDF'],['item-d',12500,'PDF']
 ])repo.salvar({produto:produto(id,price,tipo),revisaoEsperada:0});
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const a=contas.cadastrar({nome:'Cliente Carrinho Um',
  email:'carrinho-um@exemplo.invalid',senha:'senha-ficticia-longa-2026'});
 const b=contas.cadastrar({nome:'Cliente Carrinho Dois',
  email:'carrinho-dois@exemplo.invalid',senha:'senha-ficticia-longa-2026',
  codigoIndicador:a.codigoConvite});
 const senhaAdmin='chave-teste-carrinho-loop-2026-123';
 const app=criarAppAdminLaboratorio({repositorio:repo,segredo:senhaAdmin});
 const srv=app.listen(0,'127.0.0.1');await once(srv,'listening');
 t.after(()=>new Promise(resolve=>srv.close(resolve)));
 const base='http://127.0.0.1:'+srv.address().port;
 const headers={'Content-Type':'application/json',Authorization:'Bearer '+senhaAdmin};
 const req=async(method,url,data)=>{
  const response=await fetch(base+'/api/admin/'+url,{
   method,headers,...(data===undefined?{}:{body:JSON.stringify(data)})});
  return {status:response.status,body:await response.json()};
 };
 const cart='carrinho-loop-demo';
 const criar=(id,contaId,itens)=>req('POST',cart,{pedidoId:id,contaId,itens});
 const confirmar=(id,eventoId)=>req('POST',cart+'/'+id+'/eventos',
  {eventoId,tipo:'CONFIRMAR_FICTICIO'});
 const ponte=()=>req('GET','ponte-compras-convites-demo');
 const antes=await req('GET',cart+'/opcoes');
 assert.equal(antes.body.produtos.length,4);
 // Um carrinho soma 100+150: unica posicao.
 const id='compra-itens-250';
 let r=await criar(id,a.contaId,[
  {produtoId:'item-a',quantidade:1},{produtoId:'item-b',quantidade:1}]);
 assert.equal(r.status,201);
 assert.equal(r.body.pedido.totalCentavos,25000);
 assert.equal(r.body.pedido.itens.length,2);
 assert.equal(r.body.pedido.posicaoCriada,false);
 assert.equal((await ponte()).body.filas.B.quantidade,0);
 assert.equal((await req('POST',cart+'/'+id+'/sincronizar',{})).body.situacao,
  'AGUARDANDO_PAGAMENTO');
 const pago=await confirmar(id,'evt-itens-250');
 assert.equal(pago.status,200);
 assert.equal(pago.body.integracao.posicaoCriada,true);
 assert.equal(pago.body.integracao.statusAdesao,'PENDENTE');
 assert.equal(pago.body.integracao.posicaoId,1);
 assert.equal((await ponte()).body.filas.B.quantidade,1);
 assert.equal((await req('GET',cart+'/'+id)).body.pedido.posicaoCriada,true);
 // Repetir o mesmo pagamento ou sincronizacao nao duplica posicao.
 assert.equal((await confirmar(id,'evt-itens-250')).body.repetido,true);
 assert.equal((await req('POST',cart+'/'+id+'/sincronizar',{})).body.repetido,true);
 assert.equal((await ponte()).body.compras.length,1);
 // Mudar preco do catalogo nao muda a fotografia historica.
 repo.atualizar({id:'item-b',revisaoEsperada:1,alteracoes:{precoCentavos:22000}});
 const replay=await criar(id,a.contaId,[
  {produtoId:'item-a',quantidade:1},{produtoId:'item-b',quantidade:1}]);
 assert.equal(replay.status,201);
 assert.equal(replay.body.pedido.repetido,true);
 assert.equal(replay.body.pedido.totalCentavos,25000);
 assert.equal((await criar(id,b.contaId,[{produtoId:'item-a',quantidade:1}])).status,409);
 // Compras separadas de 125 + 125 nao se somam.
 for(const suffix of ['a','b']){
  const nome='separado-'+suffix;
  const x=await criar(nome,b.contaId,[{produtoId:'item-d',quantidade:1}]);
  assert.equal(x.body.pedido.totalCentavos,12500);
  const c=await confirmar(nome,'evt-'+nome);
  assert.equal(c.body.integracao.posicaoCriada,false);
  assert.equal(c.body.integracao.situacao,'VENDA_SOMENTE_LOJA');
 }
 assert.equal((await ponte()).body.compras.length,1);
 assert.equal((await ponte()).body.comprasLojaSemLoop.length,2);
 // Tres unidades de R$ 75 no mesmo pedido continuam abaixo do minimo.
 const qtd=await criar('qtd-225',b.contaId,[{produtoId:'item-c',quantidade:3}]);
 assert.equal(qtd.body.pedido.totalCentavos,22500);
 assert.equal((await confirmar('qtd-225','evt-qtd-225')).body.integracao.posicaoCriada,false);
 // Uma compra com itens somando 250 valida o primeiro convite.
 const convidada=await criar('convidada-250',b.contaId,[
  {produtoId:'item-d',quantidade:2}]);
 assert.equal(convidada.body.pedido.totalCentavos,25000);
 assert.equal((await confirmar('convidada-250','evt-convidada')).body.integracao.indicacaoNova,true);
 const estado=(await ponte()).body;
 assert.equal(estado.filas.A.quantidade,1);
 assert.equal(estado.filas.B.quantidade,1);
 assert.equal(estado.convites.length,1);
 assert.equal(estado.compras.length,2);
 assert.equal(estado.comprasLojaSemLoop.length,3);
 // Uma compra muito maior nunca cria varias posicoes.
 const maior=await criar('pedido-500',a.contaId,[{produtoId:'item-d',quantidade:4}]);
 assert.equal(maior.body.pedido.totalCentavos,50000);
 assert.equal((await confirmar('pedido-500','evt-500')).body.integracao.posicaoCriada,true);
 assert.equal((await ponte()).body.compras.length,3);
 // Cada NOVA posicao comeca em B; as antigas ja promovidas continuam em A.
 assert.equal((await ponte()).body.filas.A.quantidade,1);
 assert.equal((await ponte()).body.filas.B.quantidade,2);
 // Rejeita flag arbitraria "pago".
 assert.equal((await req('POST',cart+'/'+id+'/eventos',{
  eventoId:'fraude-1',tipo:'CONFIRMAR_FICTICIO',pago:true})).status,400);
 assert.equal((await req('POST',cart,{
  pedidoId:'fraude-2',contaId:a.contaId,
  itens:[{produtoId:'item-a',quantidade:1,precoCentavos:25000}]})).status,400);
 assert.equal((await criar('duplicados',a.contaId,[
  {produtoId:'item-a',quantidade:1},{produtoId:'item-a',quantidade:1}])).status,400);
 assert.equal((await criar('nada',a.contaId,[])).status,400);
 const es=await req('POST',cart+'/pedido-500/eventos',{
  eventoId:'estorno-500',tipo:'ESTORNAR_FICTICIO'});
 assert.equal(es.status,200);
 assert.equal(es.body.integracao.situacao,'ESTORNADO_REQUER_CONFERENCIA');
 assert.equal((await ponte()).body.compras.length,3);
 // A API permanece fora do servidor publico.
 const publico=require('../src/server').listen(0,'127.0.0.1');
 await once(publico,'listening');t.after(()=>new Promise(resolve=>publico.close(resolve)));
 const resp=await fetch('http://127.0.0.1:'+publico.address().port+'/api/admin/carrinho-loop-demo');
 assert.equal(resp.status,404);
 assert.equal((await fetch(base+'/api/admin/carrinho-loop-demo')).status,401);
});
test('falha de criacao desfaz carrinho e titularidade juntos',t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 repo.salvar({produto:produto('item-prova',25000),revisaoEsperada:0});
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const c=contas.cadastrar({nome:'Teste de Rollback',
  email:'rollback-carrinho@exemplo.invalid',senha:'senha-ficticia-longa-2026'});
 const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
 const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
 const {CarrinhoLojaLoopDemoSQLite}=require('../src/domain/carrinho-loja-loop-demo-sqlite');
 const identificados=new PedidosTitularidadeDemoSQLite({banco:repo.banco,contas});
 const ponte=new PonteComprasConvitesDemoSQLite({banco:repo.banco,contas,
  pedidosIdentificados:identificados,consultarPagamentoConfiavel:async()=>null});
 const carrinhos=new CarrinhoLojaLoopDemoSQLite({catalogo:repo,contas,
  pedidosIdentificados:identificados,ponte});
 repo.banco.exec("CREATE TRIGGER falha_carrinho_teste BEFORE INSERT ON admin_carrinho_loop_itens_demo BEGIN SELECT RAISE(ABORT,'erro forcado'); END");
 assert.throws(()=>carrinhos.criar({pedidoId:'pedido-rollback',contaId:c.contaId,
  itens:[{produtoId:'item-prova',quantidade:1}]}),/erro forcado/);
 assert.equal(identificados.buscar('pedido-rollback'),null);
 assert.equal(carrinhos.buscar('pedido-rollback'),null);
 assert.equal(ponte.consultar().filas.B.quantidade,0);
});
