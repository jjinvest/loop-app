'use strict';
// Gatilho de seguranca comercial: cotacao so le catalogo; NUNCA cria pedido.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const express=require('express');
const {RepositorioCatalogoMemoria}=require('../src/domain/repositorio-catalogo-memoria');
const {criarRouterCatalogo}=require('../src/routes/catalogo');
const {criarRouterCheckoutPublico}=require('../src/routes/checkout-publico');
const {cotarCheckoutPublico}=require('../src/domain/cotacao-checkout-publico');
const {listarCatalogo}=require('../src/domain/catalogo');
function produto(id,valor=25000){
 return {id,nome:'Curso ficticio '+id,tipo:'PDF',estado:'PUBLICADO',
  descricao:'Somente teste de cotacao informativa',precoCentavos:valor,
  entrega:'DOWNLOAD_APOS_CONFIRMACAO',fotos:[],detalhes:[],
  videoApresentacaoUrl:null};
}
async function abrir(t){
 const repo=new RepositorioCatalogoMemoria({produtos:[
  produto('pdf-teste-250',25000),produto('pdf-teste-100',10000),
  {...produto('pdf-rascunho',25000),estado:'RASCUNHO'}
 ]});
 const app=express();app.use(express.json({limit:'32kb'}));
 app.use('/catalogo',criarRouterCatalogo({repositorio:repo}));
 app.use('/api/checkout',criarRouterCheckoutPublico({repositorio:repo}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(r=>server.close(r)));
 return {repo,base:'http://127.0.0.1:'+server.address().port};
}
async function post(base,rota,body){
 return fetch(base+rota,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify(body)});
}
test('vitrine e cotacao usam o mesmo preco do servidor, sem conta, Pix ou posicao',async t=>{
 const {base,repo}=await abrir(t);
 const inicial=await(await fetch(base+'/catalogo')).json();
 assert.equal(inicial.compraDisponivel,false);
 assert.equal(inicial.produtos.find(p=>p.id==='pdf-teste-250').precoCentavos,25000);
 const payload={itens:[{produtoId:'pdf-teste-250',quantidade:2},
  {produtoId:'pdf-teste-100',quantidade:1}]};
 const resp=await post(base,'/api/checkout/cotacao',payload);
 assert.equal(resp.status,200);
 assert.equal(resp.headers.get('cache-control'),'no-store');
 const cot=await resp.json();
 assert.equal(cot.totalCentavos,60000);
 assert.deepEqual(cot.itens.map(x=>x.subtotalCentavos),[50000,10000]);
 assert.equal(cot.pedidoCriado,false);assert.equal(cot.cobrancaCriada,false);
 assert.equal(cot.compraDisponivel,false);assert.equal(cot.quantidadePosicoesCriadas,0);
 assert.equal(cot.participacaoLoopDisponivel,false);
 assert.equal(cot.precoNaoReservado,true);
 // Nao existe arbitragem do cliente sobre o preco: so os dados do catalogo.
 repo.atualizar('pdf-teste-250',{precoCentavos:30000});
 const resposta=await post(base,'/api/checkout/cotacao',{itens:[{produtoId:'pdf-teste-250',quantidade:1}]});
 assert.equal((await resposta.json()).totalCentavos,30000);
 assert.equal(inicial.produtos.find(p=>p.id==='pdf-teste-250').precoCentavos,25000);
});
test('nao aceita preco, CPF, email, pedidoId ou quantidade injetada pelo cliente',async t=>{
 const {base}=await abrir(t);
 const entradas=[
  {itens:[{produtoId:'pdf-teste-250',quantidade:1,precoCentavos:1}]},
  {itens:[{produtoId:'pdf-teste-250',quantidade:1}],cpf:'11144477735'},
  {itens:[{produtoId:'pdf-teste-250',quantidade:1}],email:'a@example.invalid'},
  {itens:[{produtoId:'pdf-teste-250',quantidade:1}],pedidoId:'abc'},
  {itens:[{produtoId:'pdf-teste-250',quantidade:1.5}]},
  {itens:[{produtoId:'pdf-teste-250',quantidade:0}]},
  {itens:[{produtoId:'pdf-teste-250',quantidade:1},{produtoId:'pdf-teste-250',quantidade:2}]},
  {itens:[{produtoId:'pdf-teste-250',quantidade:51}]},
  {itens:[{produtoId:'pdf-rascunho',quantidade:1}]},
  {itens:[{produtoId:'nao-existe',quantidade:1}]}
 ];
 for(const entrada of entradas){
  const r=await post(base,'/api/checkout/cotacao',entrada);
  assert.ok(r.status===400||r.status===404,JSON.stringify(entrada));
 }
});
test('falha fechada em criar pedido, pagar, webhook e outros caminhos',async t=>{
 const {base}=await abrir(t);
 for(const rota of ['/api/checkout/pedidos','/api/checkout/pagar',
  '/api/checkout/webhook','/api/checkout/finalizar','/api/checkout']){
  for(const method of ['GET','POST']){
   const r=await fetch(base+rota,{method});
   assert.equal(r.status,503,method+' '+rota);
   assert.equal((await r.json()).erro,'CHECKOUT_PUBLICO_NAO_HOMOLOGADO');
  }
 }
 const estado=await(await fetch(base+'/api/checkout/estado')).json();
 assert.equal(estado.checkoutHabilitado,false);
 assert.equal(estado.asaasRemotoHomologado,false);
});
test('publico principal permanece nao pronto sem qualquer override ou checkout autorizado',async t=>{
 const app=require('../src/server');
 const srv=app.listen(0,'127.0.0.1');await once(srv,'listening');
 t.after(()=>new Promise(resolve=>srv.close(resolve)));
 const base='http://127.0.0.1:'+srv.address().port;
 const live=await fetch(base+'/health');
 assert.equal(live.status,200);
 const ready=await fetch(base+'/health/ready');
 assert.equal(ready.status,503);
 const r=await ready.json();
 assert.equal(r.marcoZeroLiberado,false);
 assert.equal(r.pagamentosReais,false);
 assert.ok(r.bloqueios.includes('JURIDICO'));
 assert.equal((await fetch(base+'/api/checkout/pedidos',{method:'POST'})).status,503);
 const demo=await post(base,'/api/checkout/cotacao',{
  itens:[{produtoId:listarCatalogo()[0].id,quantidade:1}]});
 assert.equal(demo.status,404,'produto demonstrativo nao e vendavel');
 assert.equal((await fetch(base+'/catalogo')).status,200);
});
test('overflow e produto com valor excessivo rejeitados sem calcular credito',async()=>{
 const repo={buscar:async()=>produto('pdf-caro',100000000)};
 await assert.rejects(cotarCheckoutPublico({repositorio:repo,entrada:{
  itens:[{produtoId:'pdf-caro',quantidade:2}]}}),{codigo:'LIMITE_COTACAO_EXCEDIDO'});
});
