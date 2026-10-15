'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {PedidosPDFPagamentosDemoSQLite}=require('../src/domain/pedidos-pdf-pagamentos-demo-sqlite');
const {RazaoFinanceiroDemoSQLite}=require('../src/domain/razao-financeiro-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const TOKEN='chave-pdf-laboratorio-de-teste-20261015-123456789';
const AUTH={Authorization:'Bearer '+TOKEN};
function tmp(t){
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-pdf-pag-demo-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 return path.join(pasta,'base.sqlite');
}
function produto(id,preco,tipo='PDF',estado='PUBLICADO'){
 return {id,nome:'Curso ou produto de teste '+id,tipo,estado,
  descricao:'Material de laboratorio, nao comercializado',
  precoCentavos:preco,
  entrega:tipo==='PDF'?'DOWNLOAD_APOS_CONFIRMACAO':'FORNECEDOR_INTEGRADO',
  fotos:[],videoApresentacaoUrl:null,detalhes:[]};
}
function preparar(arquivo){
 const catalogo=new RepositorioCatalogoSQLite({caminho:arquivo});
 const pedidos=new PedidosPDFPagamentosDemoSQLite({repositorioCatalogo:catalogo});
 const razao=new RazaoFinanceiroDemoSQLite({banco:catalogo.banco});
 return {catalogo,pedidos,razao};
}
const criar=(p,id,produtoId)=>p.criar({pedidoId:id,produtoId});
async function servidor(t,arquivo){
 const catalogo=new RepositorioCatalogoSQLite({caminho:arquivo});
 t.after(()=>catalogo.fechar());
 const app=criarAppAdminLaboratorio({repositorio:catalogo,segredo:TOKEN});
 const srv=app.listen(0,'127.0.0.1');
 await once(srv,'listening');
 t.after(()=>new Promise((resolve,reject)=>srv.close(e=>e?reject(e):resolve())));
 return {catalogo,url:'http://127.0.0.1:'+srv.address().port};
}
async function request(base,url,body,headers=AUTH){
 return fetch(base+'/api/admin/'+url,{
  method:'POST',headers:{...headers,'Content-Type':'application/json'},
  body:JSON.stringify(body)
 });
}

test('cursos PDF mantem preco padrao de R$250 nas faturas ficticias',t=>{
 const m=preparar(tmp(t));t.after(()=>m.catalogo.fechar());
 m.catalogo.salvar({produto:produto('curso-basico',25000),revisaoEsperada:0});
 m.catalogo.salvar({produto:produto('curso-avancado',25000),revisaoEsperada:0});
 assert.equal(m.pedidos.opcoes().produtos.length,2);
 const a=criar(m.pedidos,'pedido-pdf-barato','curso-basico').pedido;
 const b=criar(m.pedidos,'pedido-pdf-caro','curso-avancado').pedido;
 assert.equal(a.precoBrutoCentavos,25000);
 assert.equal(b.precoBrutoCentavos,25000);
 assert.equal(a.pagamentoId,'pdf-pedido-pdf-barato');
 assert.equal(b.pagamentoId,'pdf-pedido-pdf-caro');
 assert.equal(a.situacaoPagamentoFicticio,'AGUARDANDO_FICTICIO');
 assert.equal(a.habilitacaoDownloadFicticia,false);
 assert.equal(a.downloadRealDisponivel,false);
 assert.equal(a.parcelaLOOPCalculada,false);
 assert.equal(a.posicaoCriada,false);
 assert.equal(m.pedidos.listar().pedidos.length,2);
 assert.equal(m.razao.consultar().lancamentosRegistrados,0);
 assert.equal(m.catalogo.banco.prepare('PRAGMA user_version').get().user_version,3);
});

test('preco e nome da compra PDF ficam congelados mesmo ao editar catalogo',t=>{
 const m=preparar(tmp(t));t.after(()=>m.catalogo.fechar());
 m.catalogo.salvar({produto:produto('curso-memoria',25000),revisaoEsperada:0});
 const a=criar(m.pedidos,'pedido-antigo','curso-memoria');
 assert.equal(a.repetido,false);
 m.catalogo.atualizar({id:'curso-memoria',revisaoEsperada:1,alteracoes:{
  nome:'Outro nome',precoCentavos:25000
 }});
 assert.equal(m.pedidos.buscar('pedido-antigo').precoBrutoCentavos,25000);
 assert.equal(m.pedidos.buscar('pedido-antigo').nomeProduto,a.pedido.nomeProduto);
 assert.equal(m.pedidos.buscar('pedido-antigo').revisaoProduto,1);
 assert.equal(criar(m.pedidos,'pedido-antigo','curso-memoria').repetido,true);
 assert.throws(()=>criar(m.pedidos,'pedido-antigo','produto-diferente'),e=>e.codigo==='CONFLITO');
 assert.throws(()=>m.catalogo.banco.exec("UPDATE admin_pdf_demo_pedidos SET preco_centavos=1"),/imutavel/);
 assert.throws(()=>m.catalogo.banco.exec('DELETE FROM admin_pdf_demo_pedidos'),/imutavel/);
});

test('confirmacao, retry e estorno ficticios controlam apenas elegibilidade de download simulada',t=>{
 const m=preparar(tmp(t));t.after(()=>m.catalogo.fechar());
 m.catalogo.salvar({produto:produto('curso-fluxo',25000),revisaoEsperada:0});
 criar(m.pedidos,'pedido-fluxo','curso-fluxo');
 assert.throws(()=>m.pedidos.registrarEvento({
  pedidoId:'pedido-fluxo',eventoId:'evento-sem-pagamento',tipo:'ESTORNAR_FICTICIO'
 }),e=>e.codigo==='CONFLITO');
 const recebido=m.pedidos.registrarEvento({
  pedidoId:'pedido-fluxo',eventoId:'evento-confirmado',tipo:'CONFIRMAR_FICTICIO'
 });
 assert.equal(recebido.repetido,false);
 assert.equal(recebido.pedido.habilitacaoDownloadFicticia,true);
 assert.equal(recebido.pedido.downloadRealDisponivel,false);
 assert.equal(recebido.pedido.situacaoPagamentoFicticio,'CONFIRMADO_FICTICIO');
 assert.equal(m.pedidos.registrarEvento({
  pedidoId:'pedido-fluxo',eventoId:'evento-confirmado',tipo:'CONFIRMAR_FICTICIO'
 }).repetido,true);
 assert.throws(()=>m.pedidos.registrarEvento({
  pedidoId:'pedido-fluxo',eventoId:'evento-confirmado',tipo:'ESTORNAR_FICTICIO'
 }),e=>e.codigo==='CONFLITO');
 assert.throws(()=>m.pedidos.registrarEvento({
  pedidoId:'pedido-fluxo',eventoId:'outra-confirmacao',tipo:'CONFIRMAR_FICTICIO'
 }),e=>e.codigo==='CONFLITO');
 const est=m.pedidos.registrarEvento({
  pedidoId:'pedido-fluxo',eventoId:'evento-estorno',tipo:'ESTORNAR_FICTICIO'
 });
 assert.equal(est.pedido.situacaoPagamentoFicticio,'ESTORNADO_FICTICIO');
 assert.equal(est.pedido.habilitacaoDownloadFicticia,false);
 assert.equal(est.pedido.eventosPagamentoFicticio,2);
 assert.equal(m.pedidos.historico('pedido-fluxo').length,2);
 assert.equal(m.razao.consultar().lancamentosRegistrados,0);
 assert.throws(()=>m.catalogo.banco.exec('DELETE FROM admin_pdf_demo_eventos'),/imutavel/);
 assert.throws(()=>m.catalogo.banco.exec("UPDATE admin_pdf_demo_eventos SET tipo='APAGADO'"),/imutavel/);
});

test('mesmo evento nao pertence a dois pedidos e estados invalidos nao gravam eventos parciais',t=>{
 const m=preparar(tmp(t));t.after(()=>m.catalogo.fechar());
 m.catalogo.salvar({produto:produto('curso-um',25000),revisaoEsperada:0});
 criar(m.pedidos,'pedido-um','curso-um');
 criar(m.pedidos,'pedido-dois','curso-um');
 m.pedidos.registrarEvento({pedidoId:'pedido-um',eventoId:'evento-compartilhado',tipo:'CONFIRMAR_FICTICIO'});
 assert.throws(()=>m.pedidos.registrarEvento({
  pedidoId:'pedido-dois',eventoId:'evento-compartilhado',tipo:'CONFIRMAR_FICTICIO'
 }),e=>e.codigo==='CONFLITO');
 assert.throws(()=>m.pedidos.registrarEvento({
  pedidoId:'pedido-dois',eventoId:'evento-desconhecido',tipo:'BAIXAR_PDF'
 }),e=>e.codigo==='INVALIDO');
 assert.equal(m.pedidos.historico('pedido-dois').length,0);
 assert.equal(m.pedidos.buscar('pedido-dois').situacaoPagamentoFicticio,'AGUARDANDO_FICTICIO');
});

test('PDF somente publicado com preco; campos financeiros nunca vem do administrador',t=>{
 const m=preparar(tmp(t));t.after(()=>m.catalogo.fechar());
 m.catalogo.salvar({produto:produto('curso-rascunho',null,'PDF','RASCUNHO'),revisaoEsperada:0});
 m.catalogo.salvar({produto:produto('produto-fisico',30000,'FISICO'),revisaoEsperada:0});
 assert.throws(()=>criar(m.pedidos,'pedido-rascunho','curso-rascunho'),e=>e.codigo==='INVALIDO');
 assert.throws(()=>criar(m.pedidos,'pedido-fisico','produto-fisico'),e=>e.codigo==='INVALIDO');
 assert.throws(()=>criar(m.pedidos,'pedido-vazio','nao-existe'),e=>e.codigo==='NAO_ENCONTRADO');
 assert.throws(()=>criar(m.pedidos,'../pedido','curso-rascunho'),e=>e.codigo==='INVALIDO');
 assert.equal(m.pedidos.listar().pedidos.length,0);
});

test('pedidos e eventos sobrevivem ao reinicio do SQLite com historico intacto',t=>{
 const arquivo=tmp(t);
 const um=preparar(arquivo);
 try{
  um.catalogo.salvar({produto:produto('curso-persistente',25000),revisaoEsperada:0});
  criar(um.pedidos,'pedido-persistente','curso-persistente');
  um.pedidos.registrarEvento({
   pedidoId:'pedido-persistente',eventoId:'evento-persistente',tipo:'CONFIRMAR_FICTICIO'
  });
 }finally{um.catalogo.fechar();}
 const dois=preparar(arquivo);
 try{
  const pedido=dois.pedidos.buscar('pedido-persistente');
  assert.equal(pedido.precoBrutoCentavos,25000);
  assert.equal(pedido.situacaoPagamentoFicticio,'CONFIRMADO_FICTICIO');
  assert.equal(pedido.habilitacaoDownloadFicticia,true);
  assert.equal(dois.pedidos.historico('pedido-persistente').length,1);
  assert.equal(dois.pedidos.registrarEvento({
   pedidoId:'pedido-persistente',eventoId:'evento-persistente',tipo:'CONFIRMAR_FICTICIO'
  }).repetido,true);
 }finally{dois.catalogo.fechar();}
});

test('API PDF de laboratorio requer token e nao aparece no app publico',async t=>{
 const {url,catalogo}=await servidor(t,tmp(t));
 const item=produto('curso-api',25000);
 catalogo.salvar({produto:item,revisaoEsperada:0});
 assert.equal((await fetch(url+'/api/admin/pedidos-pdf-demo')).status,401);
 assert.equal((await fetch(url+'/api/admin/pedidos-pdf-demo',{headers:{
  ...AUTH,Origin:'https://externo.invalid'
 }})).status,403);
 assert.equal((await request(url,'pedidos-pdf-demo',{pedidoId:'pedido-api',produtoId:'curso-api'},{})).status,401);
 assert.equal((await request(url,'pedidos-pdf-demo',{pedidoId:'pedido-api',produtoId:'curso-api',precoCentavos:1})).status,400);
 assert.equal((await request(url,'pedidos-pdf-demo',{pedidoId:'pedido-api',produtoId:'curso-api',cpf:'inventado'})).status,400);
 const op=(await (await fetch(url+'/api/admin/pedidos-pdf-demo/opcoes',{headers:AUTH})).json()).produtos;
 assert.equal(op.length,1);
 assert.equal(op[0].precoCentavos,25000);
 const pedidoCriado=await request(url,'pedidos-pdf-demo',{pedidoId:'pedido-api',produtoId:'curso-api'});
 assert.equal(pedidoCriado.status,200);
 assert.equal((await pedidoCriado.json()).pedido.precoBrutoCentavos,25000);
 assert.equal((await request(url,'pedidos-pdf-demo',{pedidoId:'pedido-api',produtoId:'curso-api'})).status,200);
 const confirm=await request(url,'pedidos-pdf-demo/pedido-api/eventos',{
  eventoId:'evento-api-confirmacao',tipo:'CONFIRMAR_FICTICIO'
 });
 assert.equal(confirm.status,200);
 assert.equal((await confirm.json()).pedido.habilitacaoDownloadFicticia,true);
 assert.equal((await request(url,'pedidos-pdf-demo/pedido-api/eventos',{
  eventoId:'evento-api-confirmacao',tipo:'ESTORNAR_FICTICIO'
 })).status,409);
 const historico=await fetch(url+'/api/admin/pedidos-pdf-demo/pedido-api/historico',{headers:AUTH});
 assert.equal((await historico.json()).eventos.length,1);
 assert.equal((await fetch(url+'/api/admin/pedidos-pdf-demo/pedido-api',{headers:AUTH})).status,200);
 const html=await (await fetch(url+'/admin/financeiro-demo')).text();
 assert.match(html,/id="formPedidosPDFDemo"/);
 assert.match(html,/id="formEventoPDFDemo"/);
 const js=await (await fetch(url+'/admin/financeiro-demo.js')).text();
 assert.match(js,/carregarPedidosPDF/);
 assert.doesNotMatch(js,/innerHTML|localStorage|sessionStorage/);
 const publico=require('../src/server');
 const servidorPublico=publico.listen(0,'127.0.0.1');
 await once(servidorPublico,'listening');
 t.after(()=>new Promise(resolve=>servidorPublico.close(resolve)));
 const base='http://127.0.0.1:'+servidorPublico.address().port;
 assert.equal((await fetch(base+'/api/admin/pedidos-pdf-demo')).status,404);
 assert.equal((await request(base,'pedidos-pdf-demo',{pedidoId:'p1',produtoId:'curso-api'})).status,404);
 assert.equal((await fetch(base+'/admin/financeiro-demo')).status,404);
});
