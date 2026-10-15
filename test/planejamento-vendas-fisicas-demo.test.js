'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {VinculosFornecedoresSQLite}=require('../src/domain/vinculos-fornecedores-sqlite');
const {PlanejamentoVendasFisicasDemoSQLite,RESERVA_REFERENCIAL_LOOP}=
 require('../src/domain/planejamento-vendas-fisicas-demo-sqlite');
const {RazaoFinanceiroDemoSQLite}=require('../src/domain/razao-financeiro-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const TOKEN='chave-laboratorio-planejamento-de-vendas-fisicas-12345';
const AUTH={Authorization:'Bearer '+TOKEN};
function temporario(t){
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-fisicos-planejamento-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 return path.join(pasta,'banco.sqlite');
}
function produto(id='produto-teste-loja',preco=60000,estado='PUBLICADO',tipo='FISICO'){
 return {id,nome:'Produto de teste de fornecedor',estado,tipo,precoCentavos:preco,
  descricao:'Produto sem nenhuma venda real',
  entrega:tipo==='FISICO'?'FORNECEDOR_INTEGRADO':'DOWNLOAD_APOS_CONFIRMACAO',
  fotos:[],videoApresentacaoUrl:null,detalhes:[]};
}
function contexto(arquivo){
 const catalogo=new RepositorioCatalogoSQLite({caminho:arquivo});
 const fornecedores=new VinculosFornecedoresSQLite({repositorioCatalogo:catalogo});
 const planejamento=new PlanejamentoVendasFisicasDemoSQLite({
  repositorioCatalogo:catalogo,vinculosFornecedor:fornecedores
 });
 const livro=new RazaoFinanceiroDemoSQLite({banco:catalogo.banco});
 return {catalogo,fornecedores,planejamento,livro};
}
function montarProduto(ctx,{id='produto-teste-loja',preco=60000,
 fornecedorId='fornecedor-a',sku='SKU_A',estado='PUBLICADO',tipo='FISICO',vincular=true}={}){
 ctx.catalogo.salvar({produto:produto(id,preco,estado,tipo),revisaoEsperada:0});
 if(vincular)ctx.fornecedores.vincular({
  produtoId:id,fornecedorId,sku,revisaoEsperada:0
 });
}
const refs={pedidoId:'pre-compra-001',produtoId:'produto-teste-loja',revisaoProduto:1,revisaoCustoTeste:1};
async function server(t,arquivo){
 const catalogo=new RepositorioCatalogoSQLite({caminho:arquivo});
 const app=criarAppAdminLaboratorio({repositorio:catalogo,segredo:TOKEN});
 const svr=app.listen(0,'127.0.0.1');
 await once(svr,'listening');
 t.after(()=>new Promise((resolve,reject)=>svr.close(e=>e?reject(e):resolve())));
 t.after(()=>catalogo.fechar());
 return {base:'http://127.0.0.1:'+svr.address().port,catalogo,
  fornecedores:new VinculosFornecedoresSQLite({repositorioCatalogo:catalogo})};
}
async function get(base,url='',headers=AUTH){
 return fetch(base+'/api/admin/planejamento-fisico-demo'+url,{headers});
}
async function post(base,url,obj,headers=AUTH){
 return fetch(base+'/api/admin/planejamento-fisico-demo'+url,{
  method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(obj)
 });
}

test('sem custo ativo nao cria pre-pedido e custo de teste calcula margem preliminar de R$100 referencial',t=>{
 const m=contexto(temporario(t));t.after(()=>m.catalogo.fechar());
 montarProduto(m);
 assert.equal(RESERVA_REFERENCIAL_LOOP,10000);
 assert.equal(m.planejamento.diagnostico('produto-teste-loja').situacao,'SEM_CUSTO_TESTE');
 assert.throws(()=>m.planejamento.criarPrePedido(refs),e=>e.codigo==='INVALIDO');
 const c=m.planejamento.registrarCusto({
  produtoId:refs.produtoId,custoCentavos:30000,revisaoEsperada:0
 });
 assert.equal(c.alterado,true);
 assert.equal(c.custo.custoRealVerificado,false);
 const d=m.planejamento.diagnostico('produto-teste-loja');
 assert.equal(d.precoCatalogoCentavos,60000);
 assert.equal(d.custoFornecedorTesteCentavos,30000);
 assert.equal(d.reservaReferencialLoopCentavos,10000);
 assert.equal(d.margemBrutaPreliminarCentavos,20000);
 assert.equal(d.situacao,'PRE_PEDIDO_FICTICIO_POSSIVEL');
 assert.equal(d.taxaPagamentoIncluida,false);
 assert.equal(d.impostosIncluidos,false);
 const r=m.planejamento.criarPrePedido(refs);
 assert.equal(r.repetido,false);
 assert.equal(r.pedido.pagamentoIntentoTesteId,'intent-fisico-pre-compra-001');
 assert.equal(r.pedido.precoCatalogoCentavos,60000);
 assert.equal(r.pedido.reservaReferencialLoopCentavos,10000);
 assert.equal(r.pedido.margemBrutaPreliminarCentavos,20000);
 assert.equal(r.pedido.pagamentoRealEfetuado,false);
 assert.equal(r.pedido.posicaoCriada,false);
 assert.equal(m.livro.consultar().lancamentosRegistrados,0);
});

test('reutilizar o mesmo ID nao duplica e nao aceita outras referencias',t=>{
 const m=contexto(temporario(t));t.after(()=>m.catalogo.fechar());
 montarProduto(m);
 m.planejamento.registrarCusto({produtoId:refs.produtoId,custoCentavos:25000,revisaoEsperada:0});
 assert.equal(m.planejamento.criarPrePedido(refs).repetido,false);
 assert.equal(m.planejamento.criarPrePedido(refs).repetido,true);
 assert.throws(()=>m.planejamento.criarPrePedido({...refs,revisaoCustoTeste:2}),e=>e.codigo==='CONFLITO');
 assert.throws(()=>m.planejamento.criarPrePedido({...refs,produtoId:'produto-alterado'}),e=>e.codigo==='CONFLITO');
 assert.equal(m.planejamento.listarPrePedidos().pedidos.length,1);
 assert.equal(m.livro.consultar().lancamentosRegistrados,0);
});

test('trocar fornecedor invalida custo; registrar novamente exige nova revisao e preserva pedido anterior',t=>{
 const m=contexto(temporario(t));t.after(()=>m.catalogo.fechar());
 montarProduto(m);
 m.planejamento.registrarCusto({produtoId:refs.produtoId,custoCentavos:25000,revisaoEsperada:0});
 const antigo=m.planejamento.criarPrePedido(refs).pedido;
 m.fornecedores.vincular({produtoId:refs.produtoId,
  fornecedorId:'fornecedor-b',sku:'SKU_B',revisaoEsperada:1});
 const d=m.planejamento.diagnostico(refs.produtoId);
 assert.equal(d.situacao,'CUSTO_DESATUALIZADO');
 assert.equal(d.custoAindaCorresponde,false);
 assert.throws(()=>m.planejamento.criarPrePedido({...refs,pedidoId:'pre-novo-002'}),e=>e.codigo==='INVALIDO');
 const n=m.planejamento.registrarCusto({produtoId:refs.produtoId,custoCentavos:27000,revisaoEsperada:1});
 assert.equal(n.custo.revisao,2);
 assert.equal(n.custo.fornecedorId,'fornecedor-b');
 assert.equal(m.planejamento.historicoCustos(refs.produtoId).length,2);
 m.catalogo.atualizar({id:refs.produtoId,revisaoEsperada:1,
  alteracoes:{nome:'Novo nome',precoCentavos:80000}});
 const novo=m.planejamento.criarPrePedido({
  ...refs,pedidoId:'pre-novo-002',revisaoProduto:2,revisaoCustoTeste:2
 }).pedido;
 assert.equal(novo.precoCatalogoCentavos,80000);
 assert.equal(novo.fornecedorId,'fornecedor-b');
 assert.equal(antigo.precoCatalogoCentavos,60000);
 assert.equal(m.planejamento.buscarPrePedido(refs.pedidoId).fornecedorId,'fornecedor-a');
 assert.equal(m.planejamento.buscarPrePedido(refs.pedidoId).custoFornecedorTesteCentavos,25000);
 assert.throws(()=>m.catalogo.banco.exec('DELETE FROM admin_pre_pedidos_fisicos_demo'),/imutavel/);
 assert.throws(()=>m.catalogo.banco.exec('UPDATE admin_pre_pedidos_fisicos_demo SET preco_catalogo_centavos=1'),/imutavel/);
 assert.throws(()=>m.catalogo.banco.exec('DELETE FROM admin_custos_fornecedor_historico_demo'),/imutavel/);
 assert.equal(m.livro.consultar().lancamentosRegistrados,0);
});

test('nao trata insuficiencia de margem preliminar como venda elegivel',t=>{
 const m=contexto(temporario(t));t.after(()=>m.catalogo.fechar());
 montarProduto(m,{preco:11500});
 m.planejamento.registrarCusto({produtoId:refs.produtoId,custoCentavos:2000,revisaoEsperada:0});
 const d=m.planejamento.diagnostico(refs.produtoId);
 assert.equal(d.margemBrutaPreliminarCentavos,-500);
 assert.equal(d.situacao,'MARGEM_PRELIMINAR_INSUFICIENTE');
 assert.throws(()=>m.planejamento.criarPrePedido(refs),e=>e.codigo==='INVALIDO');
 assert.equal(m.planejamento.listarPrePedidos().pedidos.length,0);
 assert.equal(m.livro.consultar().lancamentosRegistrados,0);
});

test('custo invalido, fraude de revisao e documentos sem fornecedor nao sao aceitos',t=>{
 const m=contexto(temporario(t));t.after(()=>m.catalogo.fechar());
 montarProduto(m,{vincular:false});
 assert.equal(m.planejamento.diagnostico(refs.produtoId).situacao,'SEM_FORNECEDOR');
 assert.throws(()=>m.planejamento.registrarCusto({
  produtoId:refs.produtoId,custoCentavos:20000,revisaoEsperada:0
 }),e=>e.codigo==='INVALIDO');
 m.fornecedores.vincular({produtoId:refs.produtoId,fornecedorId:'fornecedor-a',sku:'SKU_A',revisaoEsperada:0});
 assert.throws(()=>m.planejamento.registrarCusto({
  produtoId:refs.produtoId,custoCentavos:-1,revisaoEsperada:0
 }),e=>e.codigo==='INVALIDO');
 assert.throws(()=>m.planejamento.registrarCusto({
  produtoId:refs.produtoId,custoCentavos:0.01,revisaoEsperada:0
 }),e=>e.codigo==='INVALIDO');
 m.planejamento.registrarCusto({produtoId:refs.produtoId,custoCentavos:28000,revisaoEsperada:0});
 assert.equal(m.planejamento.registrarCusto({
  produtoId:refs.produtoId,custoCentavos:28000,revisaoEsperada:1
 }).alterado,false);
 assert.throws(()=>m.planejamento.registrarCusto({
  produtoId:refs.produtoId,custoCentavos:29000,revisaoEsperada:0
 }),e=>e.codigo==='CONFLITO');
 assert.equal(m.planejamento.historicoCustos(refs.produtoId).length,1);
 assert.throws(()=>m.planejamento.criarPrePedido({...refs,revisaoProduto:2}),e=>e.codigo==='CONFLITO');
 montarProduto(m,{id:'curso-pdf-um',tipo:'PDF',vincular:false});
 assert.equal(m.planejamento.diagnostico('curso-pdf-um').situacao,'NAO_FISICO');
 assert.throws(()=>m.planejamento.registrarCusto({
  produtoId:'curso-pdf-um',custoCentavos:35000,revisaoEsperada:0
 }),e=>e.codigo==='INVALIDO');
});

test('registros de custos e pedidos historicos continuam apos reiniciar SQLite',t=>{
 const arquivo=temporario(t);
 const a=contexto(arquivo);
 montarProduto(a);
 a.planejamento.registrarCusto({produtoId:refs.produtoId,custoCentavos:32000,revisaoEsperada:0});
 const old=a.planejamento.criarPrePedido(refs).pedido;
 a.catalogo.fechar();
 const b=contexto(arquivo);
 try{
  const atual=b.planejamento.buscarPrePedido(refs.pedidoId);
  assert.equal(atual.criadoEm,old.criadoEm);
  assert.equal(atual.custoFornecedorTesteCentavos,32000);
  assert.equal(atual.pagamentoRealEfetuado,false);
  assert.equal(b.planejamento.historicoCustos(refs.produtoId).length,1);
  assert.equal(b.planejamento.criarPrePedido(refs).repetido,true);
  assert.equal(b.catalogo.banco.prepare('PRAGMA user_version').get().user_version,3);
 }finally{b.catalogo.fechar();}
});

test('API local valida entrada e nao expos rotas de margem ou pre-compra no app publico',async t=>{
 const {base,catalogo,fornecedores}=await server(t,temporario(t));
 catalogo.salvar({produto:produto(),revisaoEsperada:0});
 fornecedores.vincular({produtoId:refs.produtoId,fornecedorId:'fornecedor-a',sku:'SKU_A',revisaoEsperada:0});
 assert.equal((await get(base,'',{})).status,401);
 assert.equal((await post(base,'/custos',{produtoId:refs.produtoId,custoCentavos:30000,revisaoEsperada:0},{})).status,401);
 assert.equal((await get(base,'',{...AUTH,Origin:'https://outro.invalid'})).status,403);
 assert.equal((await post(base,'/custos',{produtoId:refs.produtoId,custoCentavos:30000,revisaoEsperada:0,cpf:'fake'})).status,400);
 const registrado=await post(base,'/custos',{produtoId:refs.produtoId,custoCentavos:30000,revisaoEsperada:0});
 assert.equal(registrado.status,200);
 assert.equal((await registrado.json()).custo.custoCentavos,30000);
 assert.equal((await post(base,'/custos',{produtoId:refs.produtoId,custoCentavos:31000,revisaoEsperada:0})).status,409);
 assert.equal((await post(base,'/pre-pedidos',{...refs,valorCentavos:1})).status,400);
 const primeiro=await post(base,'/pre-pedidos',refs);
 assert.equal(primeiro.status,200);
 assert.equal((await primeiro.json()).pedido.pagamentoIntentoTesteId,'intent-fisico-pre-compra-001');
 assert.equal((await post(base,'/pre-pedidos',refs)).status,200);
 const consulta=await (await get(base)).json();
 assert.equal(consulta.produtos.length,1);
 assert.equal(consulta.produtos[0].situacao,'PRE_PEDIDO_FICTICIO_POSSIVEL');
 const pre=await (await get(base,'/pre-pedidos')).json();
 assert.equal(pre.pedidos.length,1);
 const hist=await (await get(base,'/'+refs.produtoId+'/custos-historico')).json();
 assert.equal(hist.historico.length,1);
 const pagina=await (await fetch(base+'/admin/financeiro-demo')).text();
 assert.match(pagina,/id="formPrePedidoFisicoDemo"/);
 assert.match(pagina,/id="formCustoFisicoDemo"/);
 const js=await (await fetch(base+'/admin/financeiro-demo.js')).text();
 assert.match(js,/carregarPlanejamentoFisico/);
 assert.doesNotMatch(js,/innerHTML|localStorage|sessionStorage/);
 const appPublico=require('../src/server');
 const publicServer=appPublico.listen(0,'127.0.0.1');
 await once(publicServer,'listening');
 t.after(()=>new Promise(resolve=>publicServer.close(resolve)));
 const url='http://127.0.0.1:'+publicServer.address().port;
 assert.equal((await fetch(url+'/api/admin/planejamento-fisico-demo')).status,404);
 assert.equal((await fetch(url+'/api/admin/planejamento-fisico-demo/pre-pedidos')).status,404);
 assert.equal((await fetch(url+'/admin/financeiro-demo')).status,404);
});

test('documentos de pedido existentes bloqueiam reutilizacao de ID no novo fluxo',async t=>{
 const {base,catalogo,fornecedores}=await server(t,temporario(t));
 catalogo.salvar({produto:produto(),revisaoEsperada:0});
 fornecedores.vincular({produtoId:refs.produtoId,fornecedorId:'fornecedor-a',sku:'SKU_A',revisaoEsperada:0});
 await post(base,'/custos',{produtoId:refs.produtoId,custoCentavos:30000,revisaoEsperada:0});
 // O PSP antigo aceita exclusivamente R$600 e nao muda nessa etapa.
 const old=await fetch(base+'/api/admin/pedidos-comerciais-demo',{
  method:'POST',headers:{...AUTH,'Content-Type':'application/json'},
  body:JSON.stringify({pedidoId:refs.pedidoId,produtoId:refs.produtoId,pagamentoId:'pag-split-02'})
 });
 assert.equal(old.status,200);
 assert.equal((await post(base,'/pre-pedidos',refs)).status,409);
 assert.equal((await (await get(base,'/pre-pedidos')).json()).pedidos.length,0);
});
