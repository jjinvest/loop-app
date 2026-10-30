'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {criarMaterialPDFTeste}=require('../src/domain/material-pdf-teste');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {PedidosPDFPagamentosDemoSQLite}=require('../src/domain/pedidos-pdf-pagamentos-demo-sqlite');
const {RazaoFinanceiroDemoSQLite}=require('../src/domain/razao-financeiro-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const TOKEN='chave-autorizacao-material-pdf-laboratorio-1234567890';
const AUTH={Authorization:'Bearer '+TOKEN};
function temporario(t){
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-pdf-entrega-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 return path.join(pasta,'teste.sqlite');
}
function curso(id='curso-download-teste',preco=7900){
 return {
  id,nome:'Curso de laboratorio',tipo:'PDF',estado:'PUBLICADO',
  descricao:'Curso PDF de demonstracao para testes',precoCentavos:preco,
  entrega:'DOWNLOAD_APOS_CONFIRMACAO',
  fotos:[],videoApresentacaoUrl:null,detalhes:[]
 };
}
async function servidor(t,caminho){
 const catalogo=new RepositorioCatalogoSQLite({caminho});
 const app=criarAppAdminLaboratorio({repositorio:catalogo,segredo:TOKEN});
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve())));
 t.after(()=>catalogo.fechar());
 const base='http://127.0.0.1:'+server.address().port;
 return {base,catalogo,pedidos:new PedidosPDFPagamentosDemoSQLite({repositorioCatalogo:catalogo})};
}
async function baixar(base,id,headers=AUTH){
 return fetch(base+'/api/admin/pedidos-pdf-demo/'+encodeURIComponent(id)+'/material-teste.pdf',{headers});
}
async function criarPedido(base,pedidoId='pedido-arquivo-teste',produtoId='curso-download-teste'){
 return fetch(base+'/api/admin/pedidos-pdf-demo',{
  method:'POST',headers:{...AUTH,'Content-Type':'application/json'},
  body:JSON.stringify({pedidoId,produtoId})
 });
}
async function evento(base,id,tipo,eventoId){
 return fetch(base+'/api/admin/pedidos-pdf-demo/'+id+'/eventos',{
  method:'POST',headers:{...AUTH,'Content-Type':'application/json'},
  body:JSON.stringify({tipo,eventoId})
 });
}
async function auditoria(base,id){
 const res=await fetch(base+'/api/admin/pedidos-pdf-demo/'+id+'/solicitacoes-material-teste',{headers:AUTH});
 assert.equal(res.status,200);
 return (await res.json()).solicitacoes;
}

test('material PDF de laboratorio e estruturalmente valido e nao representa curso real',()=>{
 const b=criarMaterialPDFTeste();
 const texto=b.toString('ascii');
 assert.ok(Buffer.isBuffer(b));
 assert.ok(texto.startsWith('%PDF-1.4\n'));
 assert.match(texto,/MATERIAL DE TESTE/);
 assert.match(texto,/Nao e um curso vendido/);
 assert.ok(texto.endsWith('%%EOF\n'));
 const match=texto.match(/startxref\n(\d+)\n%%EOF/);
 assert.ok(match);
 const xref=Number(match[1]);
 assert.equal(b.subarray(xref,xref+4).toString(),'xref');
 const trechos=texto.slice(xref).split('\n');
 assert.equal(trechos[1],'0 6');
 for(let i=1;i<=5;i++){
  const pos=Number(trechos[i+2].slice(0,10));
  assert.equal(texto.slice(pos,pos+8),i+' 0 obj\n');
 }
 assert.equal(b.equals(criarMaterialPDFTeste()),true);
});

test('somente pedido PDF confirmado pode solicitar a fixture e auditoria e imutavel',async t=>{
 const {base,catalogo,pedidos}=await servidor(t,temporario(t));
 catalogo.salvar({produto:curso(),revisaoEsperada:0});
 assert.equal((await criarPedido(base)).status,200);
 assert.equal((await baixar(base,'pedido-arquivo-teste',{})).status,401);
 assert.equal((await baixar(base,'pedido-arquivo-teste')).status,403);
 assert.equal((await baixar(base,'pedido-nao-existe')).status,404);
 assert.equal((await auditoria(base,'pedido-arquivo-teste')).length,0);
 assert.equal((await evento(base,'pedido-arquivo-teste','CONFIRMAR_FICTICIO','evento-aprovado-teste')).status,200);
 assert.equal(pedidos.buscar('pedido-arquivo-teste').materialTesteBaixavel,true);
 const resposta=await baixar(base,'pedido-arquivo-teste');
 assert.equal(resposta.status,200);
 assert.match(resposta.headers.get('content-type'),/application\/pdf/);
 assert.match(resposta.headers.get('content-disposition'),/attachment; filename="loop-material-de-teste.pdf"/);
 assert.equal(resposta.headers.get('x-content-type-options'),'nosniff');
 assert.equal(resposta.headers.get('cache-control'),'no-store');
 const conteudo=Buffer.from(await resposta.arrayBuffer());
 assert.ok(conteudo.subarray(0,8).toString().startsWith('%PDF-1.4'));
 assert.match(conteudo.toString('ascii'),/MATERIAL DE TESTE/);
 assert.equal((await auditoria(base,'pedido-arquivo-teste')).length,1);
 assert.equal((await baixar(base,'pedido-arquivo-teste')).status,200);
 assert.equal((await auditoria(base,'pedido-arquivo-teste')).length,2);
 const estorno=await evento(base,'pedido-arquivo-teste','ESTORNAR_FICTICIO','evento-estornado-teste');
 assert.equal(estorno.status,200);
 assert.equal(pedidos.buscar('pedido-arquivo-teste').materialTesteBaixavel,false);
 assert.equal((await baixar(base,'pedido-arquivo-teste')).status,403);
 assert.equal((await auditoria(base,'pedido-arquivo-teste')).length,2);
 assert.equal(catalogo.banco.prepare('SELECT COUNT(*) AS n FROM admin_pdf_demo_solicitacoes').get().n,2);
 assert.throws(()=>catalogo.banco.exec('DELETE FROM admin_pdf_demo_solicitacoes'),/imutavel/);
 assert.throws(()=>catalogo.banco.exec("UPDATE admin_pdf_demo_solicitacoes SET material='OUTRO'"),/imutavel/);
 const livro=new RazaoFinanceiroDemoSQLite({banco:catalogo.banco});
 assert.equal(livro.consultar().lancamentosRegistrados,0);
});

test('material usa a credencial em cabecalho, nunca rota publica, e tem auditoria persistente',async t=>{
 const arquivo=temporario(t);
 const a=await servidor(t,arquivo);
 a.catalogo.salvar({produto:curso('curso-reinicio',12990),revisaoEsperada:0});
 assert.equal((await criarPedido(a.base,'pedido-reinicio','curso-reinicio')).status,200);
 assert.equal((await evento(a.base,'pedido-reinicio','CONFIRMAR_FICTICIO','evento-persistencia')).status,200);
 assert.equal((await baixar(a.base,'pedido-reinicio')).status,200);
 const b=await servidor(t,arquivo);
 assert.equal((await auditoria(b.base,'pedido-reinicio')).length,1);
 assert.equal((await baixar(b.base,'pedido-reinicio')).status,200);
 assert.equal((await auditoria(a.base,'pedido-reinicio')).length,2);
 const pagina=await (await fetch(a.base+'/admin/financeiro-demo')).text();
 assert.match(pagina,/id="baixarMaterialPDFDemo"/);
 const script=await (await fetch(a.base+'/admin/financeiro-demo.js')).text();
 assert.match(script,/baixarMaterialPDF/);
 assert.match(script,/Authorization:'Bearer '/);
 assert.doesNotMatch(script,/innerHTML|localStorage|sessionStorage/);
 const appPublica=require('../src/server');
 const srv=appPublica.listen(0,'127.0.0.1');
 await once(srv,'listening');
 t.after(()=>new Promise(resolve=>srv.close(resolve)));
 const base='http://127.0.0.1:'+srv.address().port;
 assert.equal((await baixar(base,'pedido-reinicio')).status,404);
 assert.equal((await fetch(base+'/api/admin/pedidos-pdf-demo/pedido-reinicio/solicitacoes-material-teste')).status,404);
});

test('precos variados no fisico aparecem em pre-cotacoes, mas nao geram faturas ou split',async t=>{
 const {base,catalogo}=await servidor(t,temporario(t));
 const {VinculosFornecedoresSQLite}=require('../src/domain/vinculos-fornecedores-sqlite');
 const vinculos=new VinculosFornecedoresSQLite({repositorioCatalogo:catalogo});
 function fisico(id,preco,estado='PUBLICADO'){
  return {
   id,nome:id,tipo:'FISICO',estado,descricao:'Produto fisico de teste',
   precoCentavos:preco,entrega:'FORNECEDOR_INTEGRADO',
   fotos:[],videoApresentacaoUrl:null,detalhes:[]
  };
 }
 for(const [id,preco] of [['acessorio-fisico',4990],['equipamento-fisico',17500],['produto-rascunho',9900]]){
  catalogo.salvar({produto:fisico(id,preco,id==='produto-rascunho'?'RASCUNHO':'PUBLICADO'),revisaoEsperada:0});
  vinculos.vincular({produtoId:id,fornecedorId:'fornecedor-'+id,sku:'SKU_'+id.replaceAll('-','_'),revisaoEsperada:0});
 }
 const uri=base+'/api/admin/pedidos-comerciais-demo/cotacoes-teste';
 assert.equal((await fetch(uri)).status,401);
 const resposta=await fetch(uri,{headers:AUTH});
 assert.equal(resposta.status,200);
 const dados=await resposta.json();
 assert.equal(dados.modo,'PRE_COTACAO_FISICA_SEM_PAGAMENTO');
 assert.equal(dados.produtos.length,2);
 assert.deepEqual(dados.produtos.map(x=>x.precoCatalogoCentavos),[4990,17500]);
 assert.ok(dados.produtos.every(x=>
  x.cobrancaReal===false&&x.faturaPSPRealCriada===false&&
  x.valorParcelaLOOPDefinido===false&&x.custoFornecedorReal===null));
 assert.equal((await (await fetch(base+'/api/admin/pedidos-comerciais-demo',{headers:AUTH})).json()).pedidos.length,0);
 const livro=new RazaoFinanceiroDemoSQLite({banco:catalogo.banco});
 assert.equal(livro.consultar().lancamentosRegistrados,0);
 const pagina=await (await fetch(base+'/admin/financeiro-demo')).text();
 assert.match(pagina,/id="listaCotacoesFisicasDemo"/);
});
