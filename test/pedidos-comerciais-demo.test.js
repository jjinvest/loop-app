'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {VinculosFornecedoresSQLite}=require('../src/domain/vinculos-fornecedores-sqlite');
const {RazaoFinanceiroDemoSQLite}=require('../src/domain/razao-financeiro-demo-sqlite');
const {RecebimentosPSPDemoSQLite}=require('../src/domain/recebimentos-psp-demo-sqlite');
const {PedidosComerciaisDemoSQLite}=require('../src/domain/pedidos-comerciais-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const TOKEN='pedido-comercial-demo-secret-laboratorio-1234567890';
const AUTH={Authorization:'Bearer '+TOKEN};
const item=(id='produto-teste-loja',preco=60000,tipo='FISICO',estado='PUBLICADO')=>({
 id,nome:'Produto de teste comercial',tipo,estado,descricao:'Exemplo ficticio para pedido comercial',
 precoCentavos:preco,entrega:tipo==='FISICO'?'FORNECEDOR_INTEGRADO':'DOWNLOAD_APOS_CONFIRMACAO',
 fotos:[],videoApresentacaoUrl:null,detalhes:[]
});
function base(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-comercial-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 return path.join(dir,'teste.sqlite');
}
function montar(arquivo=':memory:'){
 const catalogo=new RepositorioCatalogoSQLite({caminho:arquivo});
 const fornecedores=new VinculosFornecedoresSQLite({repositorioCatalogo:catalogo});
 const razao=new RazaoFinanceiroDemoSQLite({banco:catalogo.banco});
 const recebimentos=new RecebimentosPSPDemoSQLite({banco:catalogo.banco,razao});
 const pedidos=new PedidosComerciaisDemoSQLite({
  repositorioCatalogo:catalogo,vinculosFornecedor:fornecedores,recebimentos
 });
 return {catalogo,fornecedores,razao,recebimentos,pedidos};
}
function preparar(m,{id='produto-teste-loja',preco=60000,tipo='FISICO',estado='PUBLICADO',associar=true}={}){
 m.catalogo.salvar({produto:item(id,preco,tipo,estado),revisaoEsperada:0});
 if(associar && tipo==='FISICO')m.fornecedores.vincular({
  produtoId:id,fornecedorId:'fornecedor-ficticio-a',sku:'SKU_'+id.toUpperCase().replaceAll('-','_'),revisaoEsperada:0
 });
}
const entrada={pedidoId:'compra-comercial-001',produtoId:'produto-teste-loja',pagamentoId:'pag-split-02'};
async function servidor(t,arquivo){
 const cat=new RepositorioCatalogoSQLite({caminho:arquivo});
 t.after(()=>cat.fechar());
 const app=criarAppAdminLaboratorio({repositorio:cat,segredo:TOKEN});
 const s=app.listen(0,'127.0.0.1');
 await once(s,'listening');
 t.after(()=>new Promise((resolve,reject)=>s.close(e=>e?reject(e):resolve())));
 return {url:'http://127.0.0.1:'+s.address().port,catalogo:cat};
}
async function post(base,obj,headers=AUTH){
 return fetch(base+'/api/admin/pedidos-comerciais-demo',{
  method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(obj)
 });
}
async function get(base,sufixo='',headers=AUTH){
 return fetch(base+'/api/admin/pedidos-comerciais-demo'+sufixo,{headers});
}

test('pedido criado com preco do catalogo, fornecedor ativo e pagamento PSP fixo',t=>{
 const m=montar(base(t));t.after(()=>m.catalogo.fechar());
 preparar(m);
 const op=m.pedidos.opcoes();
 assert.ok(op.produtos.some(p=>p.produtoId===entrada.produtoId));
 assert.ok(op.pagamentos.some(p=>p.pagamentoId===entrada.pagamentoId));
 assert.ok(!op.pagamentos.some(p=>p.pagamentoId==='pag-split-01'));
 assert.ok(!op.pagamentos.some(p=>p.pagamentoId==='pag-reserva-02'));
 const resp=m.pedidos.registrar(entrada);
 assert.equal(resp.repetido,false);
 assert.equal(resp.pedido.nomeProduto,'Produto de teste comercial');
 assert.equal(resp.pedido.precoBrutoCentavos,60000);
 assert.equal(resp.pedido.custoFornecedorExemploCentavos,30000);
 assert.equal(resp.pedido.parcelaLoopExemploCentavos,10000);
 assert.equal(resp.pedido.sobraComercialBrutaExemploCentavos,20000);
 assert.equal(resp.pedido.situacaoPagamentoFicticio,'AGUARDANDO_FICTICIO');
 assert.equal(resp.pedido.fornecedorId,'fornecedor-ficticio-a');
 assert.equal(resp.pedido.sku,'SKU_PRODUTO_TESTE_LOJA');
 assert.equal(resp.pedido.snapshotImutavel,true);
 assert.equal(resp.pedido.posicaoCriada,false);
 assert.equal(m.razao.consultar().lancamentosRegistrados,0);
 assert.equal(m.catalogo.listar().length,1);
 assert.equal(m.pedidos.listar().pedidos.length,1);
 assert.ok(!m.pedidos.opcoes().pagamentos.some(p=>p.pagamentoId===entrada.pagamentoId));
});

test('mesmo ID e referencias sao idempotentes; pagamento unico nao pode ser reutilizado',t=>{
 const m=montar(base(t));t.after(()=>m.catalogo.fechar());preparar(m);
 assert.equal(m.pedidos.registrar(entrada).repetido,false);
 assert.equal(m.pedidos.registrar(entrada).repetido,true);
 assert.throws(()=>m.pedidos.registrar({...entrada,pagamentoId:'pag-split-03'}),e=>e.codigo==='CONFLITO');
 assert.throws(()=>m.pedidos.registrar({...entrada,pedidoId:'nova-compra-002'}),e=>e.codigo==='CONFLITO');
 assert.throws(()=>m.pedidos.registrar({...entrada,pedidoId:'nova-compra-002',pagamentoId:'pag-split-01'}),e=>e.codigo==='CONFLITO');
 assert.equal(m.pedidos.listar().pedidos.length,1);
 assert.equal(m.razao.consultar().lancamentosRegistrados,0);
});

test('foto do pedido nao muda se produto ou fornecedor mudar depois',t=>{
 const m=montar(base(t));t.after(()=>m.catalogo.fechar());preparar(m);
 const antigo=m.pedidos.registrar(entrada).pedido;
 m.catalogo.atualizar({id:entrada.produtoId,revisaoEsperada:1,alteracoes:{
  nome:'Novo nome da vitrine',precoCentavos:80000
 }});
 m.fornecedores.vincular({
  produtoId:entrada.produtoId,fornecedorId:'fornecedor-ficticio-b',
  sku:'SKU_NOVO',revisaoEsperada:1
 });
 const novamente=m.pedidos.buscar(entrada.pedidoId);
 assert.equal(novamente.nomeProduto,antigo.nomeProduto);
 assert.equal(novamente.precoBrutoCentavos,60000);
 assert.equal(novamente.fornecedorId,'fornecedor-ficticio-a');
 assert.equal(novamente.revisaoProduto,1);
 assert.equal(novamente.revisaoFornecedor,1);
 assert.equal(m.pedidos.registrar(entrada).repetido,true);
 assert.throws(()=>m.catalogo.banco.exec("UPDATE admin_pedidos_comerciais_demo SET preco_bruto_centavos=1"),/imutavel/);
 assert.throws(()=>m.catalogo.banco.exec("DELETE FROM admin_pedidos_comerciais_demo"),/imutavel/);
});

test('PDF, rascunho, fornecedor ausente, preco diferente e PSP ja pago nao criam pedido',t=>{
 const m=montar(base(t));t.after(()=>m.catalogo.fechar());
 preparar(m,{associar:false});
 assert.throws(()=>m.pedidos.registrar(entrada),e=>e.codigo==='INVALIDO');
 m.fornecedores.vincular({produtoId:entrada.produtoId,fornecedorId:'fornecedor-ficticio',
  sku:'ABC_001',revisaoEsperada:0});
 m.catalogo.atualizar({id:entrada.produtoId,revisaoEsperada:1,alteracoes:{precoCentavos:65000}});
 assert.throws(()=>m.pedidos.registrar(entrada),e=>e.codigo==='INVALIDO');
 preparar(m,{id:'curso-teste-pdf',tipo:'PDF',associar:false});
 assert.throws(()=>m.pedidos.registrar({...entrada,produtoId:'curso-teste-pdf'}),e=>e.codigo==='INVALIDO');
 preparar(m,{id:'rascunho-teste',estado:'RASCUNHO',associar:true});
 assert.throws(()=>m.pedidos.registrar({...entrada,produtoId:'rascunho-teste'}),e=>e.codigo==='INVALIDO');
 m.catalogo.atualizar({id:entrada.produtoId,revisaoEsperada:2,alteracoes:{precoCentavos:60000}});
 m.recebimentos.registrarEvento({pagamentoId:'pag-split-02',eventoId:'evt-ja-confirmado',tipo:'CONFIRMAR_FICTICIO'});
 assert.throws(()=>m.pedidos.registrar(entrada),e=>e.codigo==='CONFLITO');
 assert.equal(m.pedidos.listar().pedidos.length,0);
 assert.equal(m.razao.consultar().lancamentosRegistrados,2);
});

test('pedido comercial e sua vinculacao persistem apos reinicio sem criar cobranca',t=>{
 const arquivo=base(t);
 const a=montar(arquivo);
 try{preparar(a);a.pedidos.registrar(entrada);}
 finally{a.catalogo.fechar();}
 const b=montar(arquivo);
 try{
  const p=b.pedidos.buscar(entrada.pedidoId);
  assert.equal(p.pagamentoId,entrada.pagamentoId);
  assert.equal(p.precoBrutoCentavos,60000);
  assert.equal(b.pedidos.listar().pedidos.length,1);
  assert.equal(b.pedidos.registrar(entrada).repetido,true);
  assert.equal(b.razao.consultar().lancamentosRegistrados,0);
  assert.equal(b.catalogo.banco.prepare('PRAGMA user_version').get().user_version,3);
 }finally{b.catalogo.fechar();}
});

test('API admin protege cadastro e nao permite parametros de preco, fornecedor ou cliente',async t=>{
 const {url,catalogo}=await servidor(t,base(t));
 const v=new VinculosFornecedoresSQLite({repositorioCatalogo:catalogo});
 catalogo.salvar({produto:item(),revisaoEsperada:0});
 v.vincular({produtoId:entrada.produtoId,fornecedorId:'fornecedor-ficticio-a',sku:'SKU_DE_TESTE',revisaoEsperada:0});
 assert.equal((await get(url,'',{})).status,401);
 assert.equal((await post(url,entrada,{})).status,401);
 assert.equal((await get(url,'',{...AUTH,Origin:'https://outro.invalid'})).status,403);
 assert.equal((await post(url,{...entrada,precoCentavos:1})).status,400);
 assert.equal((await post(url,{...entrada,cpf:'ficticio'})).status,400);
 assert.equal((await post(url,{...entrada,fornecedorId:'arbitrario'})).status,400);
 assert.equal((await post(url,{...entrada,produtoId:'nao-existe'})).status,404);
 const criado=await post(url,entrada);
 assert.equal(criado.status,200);
 assert.equal((await criado.json()).repetido,false);
 assert.equal((await post(url,entrada)).status,200);
 const pedido=(await (await get(url,'/'+entrada.pedidoId)).json()).pedido;
 assert.equal(pedido.pagamentoId,entrada.pagamentoId);
 assert.equal(pedido.fornecedorId,'fornecedor-ficticio-a');
 const lista=await (await get(url)).json();
 assert.equal(lista.pedidos.length,1);
 const options=await (await get(url,'/opcoes')).json();
 assert.equal(options.pagamentos.some(x=>x.pagamentoId===entrada.pagamentoId),false);
 const html=await (await fetch(url+'/admin/financeiro-demo')).text();
 assert.match(html,/id="formPedidosComerciaisDemo"/);
 const js=await (await fetch(url+'/admin/financeiro-demo.js')).text();
 assert.match(js,/carregarPedidosComerciais/);
 assert.doesNotMatch(js,/innerHTML|localStorage|sessionStorage/);
 const pubApp=require('../src/server');
 const server=pubApp.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const pu='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(pu+'/api/admin/pedidos-comerciais-demo')).status,404);
 assert.equal((await fetch(pu+'/admin/financeiro-demo')).status,404);
});

test('confirmacao posterior do PSP altera status consultado e nao reescreve o pedido',t=>{
 const m=montar(base(t));t.after(()=>m.catalogo.fechar());preparar(m);
 const antes=m.pedidos.registrar(entrada).pedido;
 assert.equal(antes.situacaoPagamentoFicticio,'AGUARDANDO_FICTICIO');
 m.recebimentos.registrarEvento({
  pagamentoId:entrada.pagamentoId,eventoId:'evt-confirmado-depois',tipo:'CONFIRMAR_FICTICIO'
 });
 const depois=m.pedidos.buscar(entrada.pedidoId);
 assert.equal(depois.situacaoPagamentoFicticio,'CONFIRMADO_FICTICIO');
 assert.equal(depois.eventosPagamentoFicticio,1);
 assert.equal(depois.precoBrutoCentavos,antes.precoBrutoCentavos);
 assert.equal(depois.criadoEm,antes.criadoEm);
 assert.equal(depois.posicaoCriada,false);
 m.recebimentos.registrarEvento({
  pagamentoId:entrada.pagamentoId,eventoId:'evt-estornado-depois',tipo:'ESTORNAR_FICTICIO'
 });
 assert.equal(m.pedidos.buscar(entrada.pedidoId).situacaoPagamentoFicticio,'ESTORNADO_FICTICIO');
 assert.equal(m.pedidos.buscar(entrada.pedidoId).eventosPagamentoFicticio,2);
 assert.equal(m.razao.consultar().lancamentosRegistrados,4);
});
