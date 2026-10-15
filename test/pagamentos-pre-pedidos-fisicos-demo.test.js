'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {VinculosFornecedoresSQLite}=require('../src/domain/vinculos-fornecedores-sqlite');
const {PlanejamentoVendasFisicasDemoSQLite}=require('../src/domain/planejamento-vendas-fisicas-demo-sqlite');
const {PagamentosPrePedidosFisicosDemoSQLite}=require('../src/domain/pagamentos-pre-pedidos-fisicos-demo-sqlite');
const {RazaoFinanceiroDemoSQLite}=require('../src/domain/razao-financeiro-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const TOKEN='pagamentos-pre-pedidos-fisicos-test-token-20261015-123456';
const AUTH={Authorization:'Bearer '+TOKEN};
function novoArquivo(t){
 const p=fs.mkdtempSync(path.join(os.tmpdir(),'loop-pagamentos-fisicos-demo-'));
 t.after(()=>fs.rmSync(p,{recursive:true,force:true}));
 return path.join(p,'loja.sqlite');
}
function ambiente(arquivo){
 const catalogo=new RepositorioCatalogoSQLite({caminho:arquivo});
 const vinculos=new VinculosFornecedoresSQLite({repositorioCatalogo:catalogo});
 const planejamento=new PlanejamentoVendasFisicasDemoSQLite({
  repositorioCatalogo:catalogo,vinculosFornecedor:vinculos
 });
 const pagamentos=new PagamentosPrePedidosFisicosDemoSQLite({planejamento});
 const razao=new RazaoFinanceiroDemoSQLite({banco:catalogo.banco});
 return {catalogo,vinculos,planejamento,pagamentos,razao};
}
function cadastrar(m,{id='produto-fisico-a',preco=25990,custo=8000}={}){
 m.catalogo.salvar({produto:{
  id,nome:'Produto fisico demonstrativo',tipo:'FISICO',estado:'PUBLICADO',
  descricao:'Venda somente de laboratorio',precoCentavos:preco,
  entrega:'FORNECEDOR_INTEGRADO',fotos:[],videoApresentacaoUrl:null,detalhes:[]
 },revisaoEsperada:0});
 m.vinculos.vincular({
  produtoId:id,fornecedorId:'distribuidor-ficticio',sku:'SKU_'+id.replaceAll('-','_'),
  revisaoEsperada:0
 });
 m.planejamento.registrarCusto({produtoId:id,custoCentavos:custo,revisaoEsperada:0});
}
function criar(m,pedidoId='pre-pedido-fisico-a',produtoId='produto-fisico-a'){
 return m.planejamento.criarPrePedido({pedidoId,produtoId,revisaoProduto:1,revisaoCustoTeste:1}).pedido;
}
function evt(pedido,tipo,id){
 return {
  pedidoId:pedido.pedidoId,pagamentoIntentoTesteId:pedido.pagamentoIntentoTesteId,
  eventoId:id,tipo
 };
}
async function servidor(t,arquivo){
 const catalogo=new RepositorioCatalogoSQLite({caminho:arquivo});
 const app=criarAppAdminLaboratorio({repositorio:catalogo,segredo:TOKEN});
 const s=app.listen(0,'127.0.0.1');
 await once(s,'listening');
 t.after(()=>new Promise((resolve,reject)=>s.close(e=>e?reject(e):resolve())));
 t.after(()=>catalogo.fechar());
 return {base:'http://127.0.0.1:'+s.address().port,catalogo};
}
async function api(base,caminho,headers=AUTH){
 return fetch(base+'/api/admin/pagamentos-pre-pedidos-fisicos-demo'+caminho,{headers});
}
async function post(base,id,corpo,headers=AUTH){
 return fetch(base+'/api/admin/pagamentos-pre-pedidos-fisicos-demo/'+id+'/eventos',{
  method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(corpo)
 });
}

test('pagamento ficticio guarda mesmo valor do pre-pedido variavel sem criar movimento real',t=>{
 const m=ambiente(novoArquivo(t));t.after(()=>m.catalogo.fechar());
 cadastrar(m,{preco:25990,custo:8000});
 const pedido=criar(m);
 const antes=m.pagamentos.buscar(pedido.pedidoId);
 assert.equal(antes.valorVinculadoPagamentoFicticioCentavos,25990);
 assert.equal(antes.precoCatalogoCentavos,25990);
 assert.equal(antes.situacaoPagamentoFicticio,'AGUARDANDO_FICTICIO');
 assert.equal(antes.integridade,'VINCULO_FICTICIO_CONFERIDO');
 assert.equal(antes.autorizacaoLogistica,false);
 const retorno=m.pagamentos.registrarEvento(evt(pedido,'CONFIRMAR_FICTICIO','evt-confirmacao-fisica'));
 assert.equal(retorno.repetido,false);
 assert.equal(retorno.conferencia.situacaoPagamentoFicticio,'CONFIRMADO_FICTICIO');
 assert.equal(retorno.conferencia.quantidadeEventosPagamentoFicticio,1);
 assert.equal(retorno.conferencia.fornecedorBloqueado,true);
 assert.equal(retorno.conferencia.situacaoLogistica,'NAO_INICIADA');
 assert.equal(retorno.conferencia.posicaoCriada,false);
 assert.equal(retorno.conferencia.pagamentoPSPReal,false);
 assert.equal(retorno.conferencia.reservaRealEfetuada,false);
 assert.equal(m.pagamentos.historico(pedido.pedidoId)[0].valorCentavos,25990);
 assert.equal(m.razao.consultar().lancamentosRegistrados,0);
});

test('idempotencia do mesmo evento e conflito de reutilizacao em outro pedido',t=>{
 const m=ambiente(novoArquivo(t));t.after(()=>m.catalogo.fechar());
 cadastrar(m);
 const a=criar(m,'pre-pedido-um');
 const b=criar(m,'pre-pedido-dois');
 const evento=evt(a,'CONFIRMAR_FICTICIO','evt-pagamento-um');
 assert.equal(m.pagamentos.registrarEvento(evento).repetido,false);
 assert.equal(m.pagamentos.registrarEvento(evento).repetido,true);
 assert.throws(()=>m.pagamentos.registrarEvento(
  evt(b,'CONFIRMAR_FICTICIO','evt-pagamento-um')
 ),e=>e.codigo==='CONFLITO');
 assert.throws(()=>m.pagamentos.registrarEvento(
  {...evento,pagamentoIntentoTesteId:b.pagamentoIntentoTesteId,eventoId:'evt-nao-corresponde'}
 ),e=>e.codigo==='CONFLITO');
 assert.throws(()=>m.pagamentos.registrarEvento(
  {...evento,eventoId:'evt-confirmar-novamente'}
 ),e=>e.codigo==='CONFLITO');
 assert.equal(m.pagamentos.historico(a.pedidoId).length,1);
 assert.equal(m.pagamentos.historico(b.pedidoId).length,0);
 assert.equal(m.razao.consultar().lancamentosRegistrados,0);
});

test('estorno ficticio exige confirmacao previa e bloqueia reconfirmacao',t=>{
 const m=ambiente(novoArquivo(t));t.after(()=>m.catalogo.fechar());
 cadastrar(m,{preco:58000,custo:20000});
 const p=criar(m);
 assert.throws(()=>m.pagamentos.registrarEvento(
  evt(p,'ESTORNAR_FICTICIO','evt-estorno-cedo')
 ),e=>e.codigo==='CONFLITO');
 m.pagamentos.registrarEvento(evt(p,'CONFIRMAR_FICTICIO','evt-confirmar-compra'));
 const estorno=m.pagamentos.registrarEvento(evt(p,'ESTORNAR_FICTICIO','evt-estorno-compra'));
 assert.equal(estorno.conferencia.situacaoPagamentoFicticio,'ESTORNADO_FICTICIO');
 assert.equal(estorno.conferencia.autorizacaoLogistica,false);
 assert.equal(estorno.conferencia.fornecedorBloqueado,true);
 assert.equal(m.pagamentos.registrarEvento(
  evt(p,'ESTORNAR_FICTICIO','evt-estorno-compra')
 ).repetido,true);
 assert.throws(()=>m.pagamentos.registrarEvento(
  evt(p,'CONFIRMAR_FICTICIO','evt-reconfirmar-compra')
 ),e=>e.codigo==='CONFLITO');
 assert.equal(m.pagamentos.historico(p.pedidoId).length,2);
 assert.equal(m.razao.consultar().lancamentosRegistrados,0);
});

test('mudanca no preco/fornecedor nao modifica valor imutavel do evento nem pre-pedido',t=>{
 const m=ambiente(novoArquivo(t));t.after(()=>m.catalogo.fechar());
 cadastrar(m,{preco:45000,custo:12000});
 const p=criar(m);
 m.catalogo.atualizar({id:p.produtoId,revisaoEsperada:1,
  alteracoes:{precoCentavos:72000,nome:'Produto com nome atualizado'}});
 m.vinculos.vincular({produtoId:p.produtoId,revisaoEsperada:1,
  fornecedorId:'distribuidor-b',sku:'SKU_B'});
 m.pagamentos.registrarEvento(evt(p,'CONFIRMAR_FICTICIO','evt-snapshot-preco'));
 const atual=m.pagamentos.buscar(p.pedidoId);
 assert.equal(atual.valorVinculadoPagamentoFicticioCentavos,45000);
 assert.equal(atual.precoCatalogoCentavos,45000);
 assert.equal(atual.fornecedorId,'distribuidor-ficticio');
 assert.equal(atual.situacaoLogistica,'NAO_INICIADA');
 assert.equal(m.pagamentos.historico(p.pedidoId)[0].valorCentavos,45000);
 assert.throws(()=>m.catalogo.banco.exec(
  'DELETE FROM admin_pre_pedidos_pagamentos_eventos_demo'
 ),/imutavel/);
 assert.throws(()=>m.catalogo.banco.exec(
  'UPDATE admin_pre_pedidos_pagamentos_eventos_demo SET valor_centavos=1'
 ),/imutavel/);
});

test('SQLite armazena confirmacao e estorno apos reinicio, sem disparar a logistica',t=>{
 const arquivo=novoArquivo(t);
 const a=ambiente(arquivo);
 cadastrar(a,{preco:33000,custo:12000});
 const p=criar(a);
 a.pagamentos.registrarEvento(evt(p,'CONFIRMAR_FICTICIO','evt-de-antes-reinicio'));
 a.catalogo.fechar();
 const b=ambiente(arquivo);
 try{
  const c=b.pagamentos.buscar(p.pedidoId);
  assert.equal(c.situacaoPagamentoFicticio,'CONFIRMADO_FICTICIO');
  assert.equal(c.pagamentoIntentoTesteId,p.pagamentoIntentoTesteId);
  assert.equal(c.fornecedorBloqueado,true);
  assert.equal(b.pagamentos.historico(p.pedidoId).length,1);
  assert.equal(b.pagamentos.registrarEvento(evt(p,'CONFIRMAR_FICTICIO','evt-de-antes-reinicio')).repetido,true);
  assert.equal(b.razao.consultar().lancamentosRegistrados,0);
 }finally{b.catalogo.fechar();}
});

test('API exige autorizacao local, recusa valor e nao existe na loja publica',async t=>{
 const {base,catalogo}=await servidor(t,novoArquivo(t));
 const m=new VinculosFornecedoresSQLite({repositorioCatalogo:catalogo});
 const plan=new PlanejamentoVendasFisicasDemoSQLite({
  repositorioCatalogo:catalogo,vinculosFornecedor:m
 });
 const pag=new PagamentosPrePedidosFisicosDemoSQLite({planejamento:plan});
 // Registra apenas dados ficticios por rotas de laboratorio.
 catalogo.salvar({produto:{
  id:'produto-api-teste',nome:'Produto teste',tipo:'FISICO',estado:'PUBLICADO',
  descricao:'Demonstracao da API',precoCentavos:19990,entrega:'FORNECEDOR_INTEGRADO',
  fotos:[],videoApresentacaoUrl:null,detalhes:[]
 },revisaoEsperada:0});
 m.vincular({produtoId:'produto-api-teste',fornecedorId:'fornecedor-teste',
  sku:'SKU_TESTE',revisaoEsperada:0});
 plan.registrarCusto({produtoId:'produto-api-teste',custoCentavos:5000,revisaoEsperada:0});
 const p=plan.criarPrePedido({pedidoId:'pre-pedido-api',produtoId:'produto-api-teste',
  revisaoProduto:1,revisaoCustoTeste:1}).pedido;
 assert.equal((await api(base,'',{})).status,401);
 assert.equal((await api(base,'',{...AUTH,Origin:'https://externo.invalid'})).status,403);
 assert.equal((await post(base,p.pedidoId,{
  eventoId:'evt-api-confirmacao',tipo:'CONFIRMAR_FICTICIO',
  pagamentoIntentoTesteId:p.pagamentoIntentoTesteId
 },{})).status,401);
 assert.equal((await post(base,p.pedidoId,{
  eventoId:'evt-api-confirmacao',tipo:'CONFIRMAR_FICTICIO',
  pagamentoIntentoTesteId:p.pagamentoIntentoTesteId,valorCentavos:1
 })).status,400);
 assert.equal((await post(base,p.pedidoId,{
  eventoId:'evt-api-confirmacao',tipo:'CONFIRMAR_FICTICIO',
  pagamentoIntentoTesteId:'intent-fisico-pre-pedido-errado'
 })).status,409);
 const conf=await post(base,p.pedidoId,{
  eventoId:'evt-api-confirmacao',tipo:'CONFIRMAR_FICTICIO',
  pagamentoIntentoTesteId:p.pagamentoIntentoTesteId
 });
 assert.equal(conf.status,200);
 const resultado=await conf.json();
 assert.equal(resultado.conferencia.situacaoPagamentoFicticio,'CONFIRMADO_FICTICIO');
 assert.equal(resultado.conferencia.valorVinculadoPagamentoFicticioCentavos,19990);
 assert.equal(resultado.filaMovimentada,false);
 assert.equal(resultado.fornecedorAvisado,false);
 assert.equal((await (await api(base)).json()).pedidos.length,1);
 assert.equal((await (await api(base,'/'+p.pedidoId)).json()).conferencia.fornecedorBloqueado,true);
 assert.equal((await (await api(base,'/'+p.pedidoId+'/historico')).json()).eventos.length,1);
 assert.equal((await api(base,'/nao-existe')).status,404);
 assert.equal(pag.buscar(p.pedidoId).reservaLoopReal,false);
 const html=await (await fetch(base+'/admin/financeiro-demo')).text();
 assert.match(html,/id="formEventoPagPrePedidoFisicoDemo"/);
 const js=await (await fetch(base+'/admin/financeiro-demo.js')).text();
 assert.match(js,/carregarPagamentosFisicos/);
 assert.doesNotMatch(js,/innerHTML|localStorage|sessionStorage/);
 const publico=require('../src/server');
 const server=publico.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const publicBase='http://127.0.0.1:'+server.address().port;
 assert.equal((await api(publicBase)).status,404);
 assert.equal((await post(publicBase,p.pedidoId,{
  eventoId:'evt-copia',tipo:'CONFIRMAR_FICTICIO',
  pagamentoIntentoTesteId:p.pagamentoIntentoTesteId
 })).status,404);
});
