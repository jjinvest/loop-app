'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
function produto(id,precoCentavos,tipo='PDF'){
 return {id,nome:'Item '+id,tipo,estado:'PUBLICADO',
  descricao:'Mercadoria ficticia para laboratorio',precoCentavos,
  entrega:tipo==='PDF'?'DOWNLOAD_APOS_CONFIRMACAO':'FORNECEDOR_INTEGRADO',
  fotos:[],videoApresentacaoUrl:null,detalhes:[]};
}
test('todos produtos autorizados por padrao; admin exclui sem retirar da loja, fotografando a regra',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 for(const [id,valor,tipo] of [
  ['pdf-250',25000,'PDF'],['produto-500',50000,'FISICO'],
  ['produto-150',15000,'FISICO'],['nao-elegivel-500',50000,'FISICO']
 ])repo.salvar({produto:produto(id,valor,tipo),revisaoEsperada:0});
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const cliente=contas.cadastrar({nome:'Cliente Elegibilidade',
  email:'elegibilidade@exemplo.invalid',senha:'senha-ficticia-longissima-2026'});
 const segredo='admin-elegibilidade-produto-loop-2026-1234';
 const server=criarAppAdminLaboratorio({repositorio:repo,segredo}).listen(0,'127.0.0.1');
 await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const cab={'Content-Type':'application/json',Authorization:'Bearer '+segredo};
 const pedir=async(method,url,body,headers=cab)=>{
  const resposta=await fetch(base+'/api/admin/'+url,{method,headers,
   ...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:resposta.status,body:await resposta.json()};
 };
 const cart='carrinho-loop-demo';
 const reg=async(id,itens)=>{
  const r=await pedir('POST',cart,{pedidoId:id,contaId:cliente.contaId,itens});
  assert.equal(r.status,201);
  return r.body.pedido;
 };
 const pagar=async(id)=>{
  const r=await pedir('POST',cart+'/'+id+'/eventos',{
   eventoId:'confirmar-'+id,tipo:'CONFIRMAR_FICTICIO'
  });
  assert.equal(r.status,200);
  return r.body;
 };
 const opcoes=(await pedir('GET',cart+'/opcoes')).body.produtos;
 assert.equal(opcoes.length,4);
 assert.ok(opcoes.every(p=>p.elegivelLoop===true),'todos entram autorizados');
 let regras=(await pedir('GET',cart+'/elegibilidade')).body.produtos;
 assert.ok(regras.every(p=>p.elegivelLoop&&p.revisaoElegibilidade===1));
 assert.equal((await pedir('GET',cart+'/elegibilidade',undefined,{
  'Content-Type':'application/json'
 })).status,401);
 // Produto desautorizado AINDA aparece na vitrine.
 const exclusao=await pedir('POST',cart+'/elegibilidade',{
  produtoId:'nao-elegivel-500',elegivelLoop:false,revisaoEsperada:1
 });
 assert.equal(exclusao.status,200);
 assert.equal(exclusao.body.regra.revisaoElegibilidade,2);
 assert.equal(exclusao.body.regra.elegivelLoop,false);
 assert.equal((await pedir('POST',cart+'/elegibilidade',{
  produtoId:'nao-elegivel-500',elegivelLoop:false,revisaoEsperada:1
 })).status,409);
 assert.equal((await pedir('POST',cart+'/elegibilidade',{
  produtoId:'pdf-250',elegivelLoop:'false',revisaoEsperada:1
 })).status,400);
 assert.equal(repo.buscar('nao-elegivel-500').estado,'PUBLICADO');
 assert.equal((await pedir('GET',cart+'/opcoes')).body.produtos
  .find(p=>p.produtoId==='nao-elegivel-500').elegivelLoop,false);
 const pdf=await reg('pedido-pdf250',[{produtoId:'pdf-250',quantidade:1}]);
 assert.equal(pdf.totalCentavos,25000);
 assert.equal(pdf.totalElegivelLoopCentavos,25000);
 assert.equal((await pagar('pedido-pdf250')).integracao.posicaoCriada,true);
 const item500=await reg('pedido-500',[{produtoId:'produto-500',quantidade:1}]);
 assert.equal(item500.totalElegivelLoopCentavos,50000);
 assert.equal((await pagar('pedido-500')).integracao.posicaoCriada,true);
 const duas150=await reg('pedido-duas150',[{produtoId:'produto-150',quantidade:2}]);
 assert.equal(duas150.totalCentavos,30000);
 assert.equal(duas150.totalElegivelLoopCentavos,30000);
 assert.equal((await pagar('pedido-duas150')).integracao.posicaoCriada,true);
 // O produto de 500 segue sendo uma compra de 500, mas SEM cadeira.
 const excluido=await reg('pedido-excluido500',[
  {produtoId:'nao-elegivel-500',quantidade:1}
 ]);
 assert.equal(excluido.totalCentavos,50000);
 assert.equal(excluido.totalElegivelLoopCentavos,0);
 assert.equal(excluido.itens[0].elegivelLoop,0);
 assert.equal((await pagar('pedido-excluido500')).integracao.posicaoCriada,false);
 const misto=await reg('pedido-misto650',[
  {produtoId:'nao-elegivel-500',quantidade:1},
  {produtoId:'produto-150',quantidade:1}
 ]);
 assert.equal(misto.totalCentavos,65000);
 assert.equal(misto.totalElegivelLoopCentavos,15000);
 const pagoMisto=await pagar('pedido-misto650');
 assert.equal(pagoMisto.integracao.posicaoCriada,false);
 assert.equal(pagoMisto.integracao.compraElegivelLoop,false);
 assert.equal(pagoMisto.integracao.valorElegivelLoopCentavos,15000);
 const repetido=await pedir('POST',cart+'/pedido-misto650/eventos',{
  eventoId:'confirmar-pedido-misto650',tipo:'CONFIRMAR_FICTICIO'
 });
 assert.equal(repetido.body.integracao.repetido,true);
 // Pedido congelado com regra ANTIGA deve ser respeitado depois.
 const antigo=await reg('pedido-antigo250',[{produtoId:'pdf-250',quantidade:1}]);
 assert.equal(antigo.totalElegivelLoopCentavos,25000);
 const atualizado=await pedir('POST',cart+'/elegibilidade',{
  produtoId:'pdf-250',elegivelLoop:false,revisaoEsperada:1
 });
 assert.equal(atualizado.body.regra.revisaoElegibilidade,2);
 const congelado=(await pedir('GET',cart+'/pedido-antigo250')).body.pedido;
 assert.equal(congelado.totalElegivelLoopCentavos,25000);
 assert.equal(congelado.itens[0].revisaoElegibilidade,1);
 const novo=await reg('pedido-novo250',[{produtoId:'pdf-250',quantidade:1}]);
 assert.equal(novo.totalCentavos,25000);
 assert.equal(novo.totalElegivelLoopCentavos,0);
 assert.equal(novo.itens[0].revisaoElegibilidade,2);
 assert.equal((await pagar('pedido-antigo250')).integracao.posicaoCriada,true);
 assert.equal((await pagar('pedido-novo250')).integracao.posicaoCriada,false);
 // Reautorizar afeta novas compras, nunca altera o passado.
 const restaurado=await pedir('POST',cart+'/elegibilidade',{
  produtoId:'pdf-250',elegivelLoop:true,revisaoEsperada:2
 });
 assert.equal(restaurado.body.regra.revisaoElegibilidade,3);
 assert.equal((await pedir('GET',cart+'/pedido-novo250')).body.pedido.totalElegivelLoopCentavos,0);
 const reautorizado=await reg('pedido-reautorizado250',[{produtoId:'pdf-250',quantidade:1}]);
 assert.equal(reautorizado.totalElegivelLoopCentavos,25000);
 assert.equal((await pagar('pedido-reautorizado250')).integracao.posicaoCriada,true);
 const ponte=(await pedir('GET','ponte-compras-convites-demo')).body;
 assert.equal(ponte.compras.length,5);
 assert.equal(ponte.comprasLojaSemLoop.length,3);
 assert.equal(ponte.filas.A.quantidade+ponte.filas.B.quantidade,5);
 assert.equal(repo.banco.prepare('SELECT COUNT(*) AS n FROM admin_produtos_elegibilidade_historico_demo').get().n,3);
 assert.throws(()=>repo.banco.exec('UPDATE admin_carrinho_item_elegibilidade_demo SET elegivel_loop=1'),
  /regra congelada/);
 assert.throws(()=>repo.banco.exec('UPDATE admin_produtos_elegibilidade_historico_demo SET para_elegivel=1'),
  /historico imutavel/);
 const html=await(await fetch(base+'/admin/financeiro-demo')).text();
 assert.match(html,/id="formElegibilidadeLoopDemo"/);
 assert.match(html,/id="produtoElegibilidadeLoopDemo"/);
 const frontend=await(await fetch(base+'/admin/financeiro-demo.js')).text();
 assert.match(frontend,/totalElegivelLoopCentavos/);
 assert.match(frontend,/salvarRegraProdutoLoop/);
 assert.doesNotMatch(frontend,/innerHTML/);
 // Compra publica nao aceita campo adicional "elegivelLoop".
 const publicServer=require('../src/server').listen(0,'127.0.0.1');
 await once(publicServer,'listening');t.after(()=>new Promise(resolve=>publicServer.close(resolve)));
 assert.equal((await fetch('http://127.0.0.1:'+publicServer.address().port+
  '/api/admin/carrinho-loop-demo/elegibilidade')).status,404);
});

test('curso PDF individual segue autorizacao do produto congelada no pedido',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 repo.salvar({produto:produto('pdf-regra-250',25000),revisaoEsperada:0});
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const usuario=contas.cadastrar({
  nome:'Cliente de PDF Individual',email:'pdf-regra@exemplo.invalid',
  senha:'senha-ficticia-grande-2026'
 });
 const segredo='chave-pdf-elegivel-2026-123456789';
 const app=criarAppAdminLaboratorio({repositorio:repo,segredo});
 const srv=app.listen(0,'127.0.0.1');await once(srv,'listening');
 t.after(()=>new Promise(resolve=>srv.close(resolve)));
 const base='http://127.0.0.1:'+srv.address().port;
 const headers={'Content-Type':'application/json',Authorization:'Bearer '+segredo};
 const post=async(p,b)=>{
  const r=await fetch(base+'/api/admin/'+p,{method:'POST',headers,body:JSON.stringify(b)});
  assert.equal(r.status,200,p+' '+r.status);
  return r.json();
 };
 const novo=async(id)=>{
  const criado=await post('pedidos-pdf-demo',{pedidoId:id,produtoId:'pdf-regra-250'});
  assert.equal(criado.pedido.precoBrutoCentavos,25000);
  const v=await post('pedidos-pdf-demo/'+id+'/vincular-loop',{contaId:usuario.contaId});
  assert.equal(v.titularFixado,true);
  return criado.pedido;
 };
 const pagar=async(id)=>{
  const x=await post('pedidos-pdf-demo/'+id+'/eventos',{
   eventoId:'evento-'+id,tipo:'CONFIRMAR_FICTICIO'
  });
  return x.integracaoLoop;
 };
 // Regra padrao do PDF: ele conta.
 const inicio=await novo('pdf-inicial250');
 assert.equal(inicio.elegivelLoop,true);
 assert.equal((await pagar('pdf-inicial250')).posicaoCriada,true);
 // Desmarcar PDF nao remove a venda da loja.
 await post('carrinho-loop-demo/elegibilidade',{
  produtoId:'pdf-regra-250',elegivelLoop:false,revisaoEsperada:1
 });
 const excluido=await novo('pdf-excluido250');
 assert.equal(excluido.precoBrutoCentavos,25000);
 assert.equal(excluido.valorElegivelLoopCentavos,0);
 // Reautorizar antes de confirmar NAO muda a regra do pedido antigo.
 await post('carrinho-loop-demo/elegibilidade',{
  produtoId:'pdf-regra-250',elegivelLoop:true,revisaoEsperada:2
 });
 assert.equal((await pagar('pdf-excluido250')).posicaoCriada,false);
 assert.equal((await novo('pdf-restaurado250')).elegivelLoop,true);
 assert.equal((await pagar('pdf-restaurado250')).posicaoCriada,true);
 const ponte=await(await fetch(base+'/api/admin/ponte-compras-convites-demo',{headers})).json();
 assert.equal(ponte.compras.length,2);
 assert.equal(ponte.comprasLojaSemLoop.length,1);
});
