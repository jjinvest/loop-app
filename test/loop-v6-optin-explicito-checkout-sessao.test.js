'use strict';
// A escolha do consumidor e independente da qualificacao do produto.
// Usa somente endpoint LOCAL com sessao e pagamento ficticio administrativo.
// SIM -> posicao SOMENTE apos pagamento; NAO -> loja apenas, sem referencia LOOP.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
function prod(id,preco,tipo='PDF'){
 return {id,nome:'Produto ensaio '+id,tipo,estado:'PUBLICADO',
  descricao:'Produto para teste de opt-in',precoCentavos:preco,
  entrega:tipo==='PDF'?'DOWNLOAD_APOS_CONFIRMACAO':'FORNECEDOR_INTEGRADO',
  fotos:[],videoApresentacaoUrl:null,detalhes:[]};
}
test('opt-in no checkout exige sim ou nao e grava escolha imutavel ate depois do pagamento',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 for(const [id,centavos] of [
  ['curso-pdf-250',25000],['produto-500',50000],['excluido-500',50000]
 ])repo.salvar({produto:prod(id,centavos),revisaoEsperada:0});
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const pessoa=contas.cadastrar({nome:'Consumidor Optin',
  email:'consumidor-optin@exemplo.invalid',senha:'senha-optin-laboratorio-2026'});
 const segredo='segredo-para-checkout-optin-2026-123456789';
 const server=criarAppAdminLaboratorio({repositorio:repo,segredo,habilitarConviteLoopCheckout:true})
  .listen(0,'127.0.0.1');
 await once(server,'listening');t.after(()=>new Promise(ok=>server.close(ok)));
 const url='http://127.0.0.1:'+server.address().port;
 const front={'Content-Type':'application/json','X-LOOP-LAB':'participante'};
 const admin={'Content-Type':'application/json',Authorization:'Bearer '+segredo};
 const login=await fetch(url+'/api/laboratorio/participante/entrar',{
  method:'POST',headers:front,body:JSON.stringify({nome:pessoa.nome,
   senha:'senha-optin-laboratorio-2026'})});
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const comprar=async(itens,participarLoop,extra={})=>{
  const body={itens,participarLoop,...extra};
  const r=await fetch(url+'/api/laboratorio/participante/loja/pedidos',{
   method:'POST',headers:{...front,Cookie:cookie},body:JSON.stringify(body)});
  return {status:r.status,json:await r.json()};
 };
 const confirmar=async pedidoId=>{
  const res=await fetch(url+'/api/admin/carrinho-loop-demo/'+pedidoId+'/eventos',{
   method:'POST',headers:admin,
   body:JSON.stringify({eventoId:'conf-'+pedidoId,tipo:'CONFIRMAR_FICTICIO'})});
  assert.equal(res.status,200);
  return res.json();
 };
 const apenas=id=>[{produtoId:id,quantidade:1}];
 const negado=await fetch(url+'/api/laboratorio/participante/loja/pedidos',{
  method:'POST',headers:{...front,Cookie:cookie},
  body:JSON.stringify({itens:apenas('produto-500')})});
 assert.equal(negado.status,400,'nao deve haver escolha pre-marcada');
 assert.equal((await negado.json()).erro,'ITENS_E_ESCOLHA_LOOP_OBRIGATORIOS');
 assert.equal((await comprar(apenas('produto-500'),'sim')).status,400);
 assert.equal((await comprar(apenas('produto-500'),true,{pago:true})).status,400);
 const excl=await fetch(url+'/api/admin/carrinho-loop-demo/elegibilidade',{
  method:'POST',headers:admin,body:JSON.stringify({
   produtoId:'excluido-500',elegivelLoop:false,revisaoEsperada:1})});
 assert.equal(excl.status,200);
 assert.equal((await comprar(apenas('excluido-500'),true)).status,400,
  'o pedido nao pode optar por LOOP apenas por custar 500');
 const nao=await comprar(apenas('produto-500'),false);
 assert.equal(nao.status,201);
 assert.equal(nao.json.pedido.totalCentavos,50000);
 assert.equal(nao.json.pedido.subtotalQualificadoOriginalCentavos,50000);
 assert.equal(nao.json.pedido.totalElegivelLoopCentavos,0);
 assert.equal(nao.json.pedido.participarLoop,false);
 assert.equal(nao.json.pedido.escolhaLoopExpressa,true);
 assert.equal(nao.json.pedido.posicaoCriada,false);
 const antes=await fetch(url+'/api/laboratorio/participante/minha-conta',{
  headers:{Cookie:cookie}});
 assert.equal((await antes.json()).posicoes.length,0);
 const confirmadoNao=await confirmar(nao.json.pedido.pedidoId);
 assert.equal(confirmadoNao.integracao.posicaoCriada,false);
 assert.equal(confirmadoNao.integracao.compraElegivelLoop,false);
 const sim=await comprar(apenas('produto-500'),true);
 assert.equal(sim.status,201);
 assert.equal(sim.json.pedido.totalElegivelLoopCentavos,50000);
 assert.equal(sim.json.pedido.participarLoop,true);
 assert.equal(sim.json.pedido.posicaoCriada,false);
 const confirmadoSim=await confirmar(sim.json.pedido.pedidoId);
 assert.equal(confirmadoSim.integracao.posicaoCriada,true);
 assert.equal(confirmadoSim.integracao.statusAdesao,'PENDENTE');
 const repetido=await confirmar(sim.json.pedido.pedidoId);
 assert.equal(repetido.integracao.repetido,true);
 const excluido=await comprar(apenas('excluido-500'),false);
 assert.equal(excluido.status,201);
 assert.equal(excluido.json.pedido.subtotalQualificadoOriginalCentavos,0);
 assert.equal(excluido.json.pedido.totalElegivelLoopCentavos,0);
 assert.equal((await confirmar(excluido.json.pedido.pedidoId)).integracao.posicaoCriada,false);
 const mistura=await comprar([
  {produtoId:'excluido-500',quantidade:1},
  {produtoId:'curso-pdf-250',quantidade:1}
 ],true);
 assert.equal(mistura.status,201);
 assert.equal(mistura.json.pedido.totalCentavos,75000);
 assert.equal(mistura.json.pedido.subtotalQualificadoOriginalCentavos,25000);
 assert.equal(mistura.json.pedido.totalElegivelLoopCentavos,25000);
 assert.equal((await confirmar(mistura.json.pedido.pedidoId)).integracao.posicaoCriada,true);
 const escolha=repo.banco.prepare(
  'SELECT participar_loop,subtotal_qualificado_centavos FROM admin_carrinho_escolha_loop_demo WHERE pedido_id=?'
 ).get(nao.json.pedido.pedidoId);
 assert.equal(escolha.participar_loop,0);
 assert.equal(escolha.subtotal_qualificado_centavos,50000);
 assert.throws(()=>repo.banco.prepare(
  'UPDATE admin_carrinho_escolha_loop_demo SET participar_loop=1 WHERE pedido_id=?'
 ).run(nao.json.pedido.pedidoId),/escolha LOOP imutavel/);
 assert.throws(()=>repo.banco.prepare(
  'DELETE FROM admin_carrinho_escolha_loop_demo WHERE pedido_id=?'
 ).run(sim.json.pedido.pedidoId),/escolha LOOP imutavel/);
 const visao=await fetch(url+'/api/laboratorio/participante/minha-conta',
  {headers:{Cookie:cookie}});
 const conta=await visao.json();
 assert.equal(conta.posicoes.length,2);
 assert.equal(repo.banco.prepare(
  'SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n,2);
 assert.equal(repo.banco.prepare(
  'SELECT COUNT(*) AS n FROM admin_carrinho_escolha_loop_demo').get().n,4);
 assert.equal(Object.values(repo.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(repo.banco.prepare('PRAGMA foreign_key_check').all(),[]);
 const pagina=await (await fetch(url+'/laboratorio/loja')).text();
 const script=await (await fetch(url+'/laboratorio/loja.js')).text();
 assert.match(pagina,/id="akitemmEscolhaLoop"/);
 assert.match(pagina,/Você gostaria de participar do LOOP\?/);
 assert.match(pagina,/value="sim"/);
 assert.match(pagina,/value="nao"/);
 assert.match(pagina,/direitos legais de compra e reembolso/);
 assert.doesNotMatch(pagina,/name="akitemmParticiparLoop"[^>]+checked/);
 assert.match(script,/totalElegivel>=referenciaCentavos/);
 assert.match(script,/const participarLoop=!escolha.hidden/);
 assert.match(script,/loja\/pedidos',conviteLoopCheckoutAtivo\?/);
 assert.match(script,/\{itens,participarLoop\}:\{itens\}/);
 console.log('LOOP_CHECKOUT_OPTIN='+JSON.stringify({
  escolhaObrigatoria:true,simGravado:true,naoGravado:true,
  pedidoNaoParticipante500SemPosicao:true,
  pedidoParticipante500ComPosicaoAposConfirmacao:true,
  excluido500SemPosicao:true,
  carrinhoMisto750Somente250Qualificado:true,
  pedidosComEscolhaImutavel:4,posicoes:2,
  pagamentoReal:false,renunciaCDC:false}));
});
