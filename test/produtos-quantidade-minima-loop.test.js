'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
function p(id,precoCentavos,tipo='FISICO'){
 return {id,nome:'Produto ficticio '+id,tipo,estado:'PUBLICADO',
  descricao:'Item para testes do LOOP',
  precoCentavos,entrega:tipo==='PDF'?'DOWNLOAD_APOS_CONFIRMACAO':'FORNECEDOR_INTEGRADO',
  fotos:[],videoApresentacaoUrl:null,detalhes:[]};
}
test('caneta R$50 so conta para LOOP comprando pelo menos 20 unidades no mesmo pedido',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 for(const [id,valor,tipo] of [
  ['caneta-50',5000,'FISICO'],['produto-150',15000,'FISICO'],
  ['pdf-250',25000,'PDF']
 ])repo.salvar({produto:p(id,valor,tipo),revisaoEsperada:0});
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const comprador=contas.cadastrar({nome:'Cliente Quantidade Minima',
  email:'quantidade@exemplo.invalid',senha:'senha-ficticia-completa-2026'});
 const segredo='admin-quantidade-minima-caneta-2026-123456';
 const srv=criarAppAdminLaboratorio({repositorio:repo,segredo}).listen(0,'127.0.0.1');
 await once(srv,'listening');t.after(()=>new Promise(resolve=>srv.close(resolve)));
 const base='http://127.0.0.1:'+srv.address().port;
 const headers={Authorization:'Bearer '+segredo,'Content-Type':'application/json'};
 const pedir=async(metodo,caminho,body,auth=headers)=>{
  const r=await fetch(base+'/api/admin/'+caminho,{
   method:metodo,headers:auth,...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:r.status,data:await r.json()};
 };
 const caminho='carrinho-loop-demo';
 const cart=async(pedidoId,itens)=>{
  const r=await pedir('POST',caminho,{pedidoId,itens,contaId:comprador.contaId});
  assert.equal(r.status,201,JSON.stringify(r));
  return r.data.pedido;
 };
 const pagar=async id=>{
  const r=await pedir('POST',caminho+'/'+id+'/eventos',{
   eventoId:'ev-'+id,tipo:'CONFIRMAR_FICTICIO'
  });
  assert.equal(r.status,200);
  assert.notEqual(r.data.integracao.situacao,'SINCRONIZACAO_PENDENTE',
   JSON.stringify(r.data));
  return r.data.integracao;
 };
 let regras=(await pedir('GET',caminho+'/elegibilidade')).data.produtos;
 assert.ok(regras.every(x=>x.quantidadeMinimaLoop===1));
 const original=(await pedir('POST',caminho+'/quantidade-minima',{
  produtoId:'caneta-50',quantidadeMinimaLoop:20,revisaoEsperada:1
 }));
 assert.equal(original.status,200);
 assert.equal(original.data.regra.quantidadeMinimaLoop,20);
 assert.equal(original.data.regra.revisaoQuantidadeMinima,2);
 assert.equal(original.data.regra.elegivelLoop,true);
 // Autorizacao e quantidade sao regras independentes.
 const respostas=await Promise.all([
  pedir('POST',caminho+'/quantidade-minima',{
   produtoId:'caneta-50',quantidadeMinimaLoop:0,revisaoEsperada:2
  }),
  pedir('POST',caminho+'/quantidade-minima',{
   produtoId:'caneta-50',quantidadeMinimaLoop:101,revisaoEsperada:2
  }),
  pedir('POST',caminho+'/quantidade-minima',{
   produtoId:'caneta-50',quantidadeMinimaLoop:20.5,revisaoEsperada:2
  }),
  pedir('POST',caminho+'/quantidade-minima',{
   produtoId:'caneta-50',quantidadeMinimaLoop:15,revisaoEsperada:1
  })
 ]);
 assert.deepEqual(respostas.map(r=>r.status),[400,400,400,409]);
 assert.equal((await pedir('POST',caminho+'/quantidade-minima',{
  produtoId:'caneta-50',quantidadeMinimaLoop:20,revisaoEsperada:2
 })).data.regra.alterado,false);
 assert.equal((await pedir('GET',caminho+'/opcoes')).data.produtos
  .find(x=>x.produtoId==='caneta-50').quantidadeMinimaLoop,20);

 const dezenove=await cart('canetas-dezenove',[
  {produtoId:'caneta-50',quantidade:19}]);
 assert.equal(dezenove.totalCentavos,95000);
 assert.equal(dezenove.totalElegivelLoopCentavos,0);
 assert.equal(dezenove.itens[0].quantidadeMinimaLoop,20);
 assert.equal(dezenove.itens[0].subtotalElegivelCentavos,0);
 assert.equal((await pagar('canetas-dezenove')).posicaoCriada,false);

 // Vinte unidades = R$1000 na loja, 1000 elegiveis, UMA cadeira de R$250.
 const vinte=await cart('canetas-vinte',[
  {produtoId:'caneta-50',quantidade:20}]);
 assert.equal(vinte.totalCentavos,100000);
 assert.equal(vinte.totalElegivelLoopCentavos,100000);
 assert.equal(vinte.itens[0].subtotalElegivelCentavos,100000);
 assert.equal((await pagar('canetas-vinte')).posicaoCriada,true);
 assert.equal((await pagar('canetas-vinte')).repetido,true);

 // Produtos diferentes no mesmo pedido: o item abaixo do minimo
 // nao conta; dois itens de R$150 contam e alcancam R$300.
 const mistura=await cart('caneta-um-dois150',[
  {produtoId:'caneta-50',quantidade:1},
  {produtoId:'produto-150',quantidade:2}
 ]);
 assert.equal(mistura.totalCentavos,35000);
 assert.equal(mistura.totalElegivelLoopCentavos,30000);
 assert.equal((await pagar('caneta-um-dois150')).posicaoCriada,true);

 // Um pedido antigo preserva regra de 20 mesmo quando admin muda para 5.
 const pedidoAntigo=await cart('caneta-10-regra-antiga',[
  {produtoId:'caneta-50',quantidade:10}]);
 assert.equal(pedidoAntigo.totalElegivelLoopCentavos,0);
 const alterado=await pedir('POST',caminho+'/quantidade-minima',{
  produtoId:'caneta-50',quantidadeMinimaLoop:5,revisaoEsperada:2
 });
 assert.equal(alterado.status,200);
 assert.equal(alterado.data.regra.revisaoQuantidadeMinima,3);
 const antigo=(await pedir('GET',caminho+'/caneta-10-regra-antiga')).data.pedido;
 assert.equal(antigo.totalElegivelLoopCentavos,0);
 assert.equal(antigo.itens[0].quantidadeMinimaLoop,20);
 assert.equal(antigo.itens[0].revisaoQuantidadeMinima,2);
 assert.equal((await pagar('caneta-10-regra-antiga')).posicaoCriada,false);
 const novo=await cart('caneta-10-regra-nova',[
  {produtoId:'caneta-50',quantidade:10}]);
 assert.equal(novo.totalElegivelLoopCentavos,50000);
 assert.equal(novo.itens[0].quantidadeMinimaLoop,5);
 assert.equal((await pagar('caneta-10-regra-nova')).posicaoCriada,true);

 // Desautorizar e reautorizar caneta nao altera minimo definido.
 const off=await pedir('POST',caminho+'/elegibilidade',{
  produtoId:'caneta-50',elegivelLoop:false,revisaoEsperada:1
 });
 assert.equal(off.data.regra.quantidadeMinimaLoop,5);
 const desautorizado=await cart('caneta-desautorizada',[
  {produtoId:'caneta-50',quantidade:20}]);
 assert.equal(desautorizado.totalElegivelLoopCentavos,0);
 assert.equal((await pagar('caneta-desautorizada')).posicaoCriada,false);
 const on=await pedir('POST',caminho+'/elegibilidade',{
  produtoId:'caneta-50',elegivelLoop:true,revisaoEsperada:2
 });
 assert.equal(on.data.regra.quantidadeMinimaLoop,5);
 // Compras separadas nao somam quantidades nem valores.
 const separado1=await cart('caneta-separado-um',[{produtoId:'caneta-50',quantidade:4}]);
 const separado2=await cart('caneta-separado-dois',[{produtoId:'caneta-50',quantidade:4}]);
 assert.equal(separado1.totalElegivelLoopCentavos,0);
 assert.equal(separado2.totalElegivelLoopCentavos,0);
 assert.equal((await pagar('caneta-separado-um')).posicaoCriada,false);
 assert.equal((await pagar('caneta-separado-dois')).posicaoCriada,false);

 // Fotografia da quantidade nao pode ser alterada.
 assert.throws(()=>repo.banco.exec(
  'UPDATE admin_carrinho_item_quantidade_minima_demo SET quantidade_minima=1'
 ),/quantidade minima congelada/);
 assert.throws(()=>repo.banco.exec(
  'UPDATE admin_produtos_quantidade_minima_historico_demo SET quantidade_nova=1'
 ),/historico de quantidade imutavel/);
 const ponte=(await pedir('GET','ponte-compras-convites-demo')).data;
 assert.equal(ponte.compras.length,3);
 assert.equal(ponte.filas.B.quantidade,3);
 assert.equal(ponte.comprasLojaSemLoop.length,5);
 assert.equal(repo.banco.prepare('SELECT COUNT(*) AS n FROM admin_produtos_quantidade_minima_historico_demo').get().n,2);
 assert.equal((await pedir('POST',caminho+'/quantidade-minima',{
  produtoId:'caneta-50',quantidadeMinimaLoop:3,revisaoEsperada:3
 },{'Content-Type':'application/json'})).status,401);
 // UI expõe quantidade minima no painel admin e loja.
 const painel=await(await fetch(base+'/admin/financeiro-demo')).text();
 assert.match(painel,/formQuantidadeMinimaLoopDemo/);
 const js=await(await fetch(base+'/admin/financeiro-demo.js')).text();
 assert.match(js,/salvarQuantidadeMinimaLoop/);
 assert.match(js,/qtd>=produto.quantidadeMinimaLoop/);
 const loja=await(await fetch(base+'/laboratorio/loja.js')).text();
 assert.match(loja,/quantidade>=p.quantidadeMinimaLoop/);
});
test('pedido PDF unico so conta quando quantidade minima do produto for um',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 repo.salvar({produto:p('pdf-250',25000,'PDF'),revisaoEsperada:0});
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const comprador=contas.cadastrar({nome:'Cliente PDF Minimo',
  email:'pdf-minimo@exemplo.invalid',senha:'senha-ficticia-completa-2026'});
 const segredo='admin-pdf-minimo-2026-1234567890';
 const srv=criarAppAdminLaboratorio({repositorio:repo,segredo}).listen(0,'127.0.0.1');
 await once(srv,'listening');t.after(()=>new Promise(resolve=>srv.close(resolve)));
 const base='http://127.0.0.1:'+srv.address().port;
 const headers={Authorization:'Bearer '+segredo,'Content-Type':'application/json'};
 const req=async(path,body)=>{
  const r=await fetch(base+'/api/admin/'+path,{method:'POST',headers,body:JSON.stringify(body)});
  assert.equal(r.status,200,path+' '+r.status);
  return r.json();
 };
 async function pedido(id){
  const r=await req('pedidos-pdf-demo',{pedidoId:id,produtoId:'pdf-250'});
  await req('pedidos-pdf-demo/'+id+'/vincular-loop',{contaId:comprador.contaId});
  return r.pedido;
 }
 async function pago(id){
  const r=await req('pedidos-pdf-demo/'+id+'/eventos',{
   eventoId:'pagamento-'+id,tipo:'CONFIRMAR_FICTICIO'
  });
  return r.integracaoLoop;
 }
 const original=await pedido('pdf-original-250');
 assert.equal(original.valorElegivelLoopCentavos,25000);
 await req('carrinho-loop-demo/quantidade-minima',{
  produtoId:'pdf-250',quantidadeMinimaLoop:2,revisaoEsperada:1
 });
 const novo=await pedido('pdf-minimo-2');
 assert.equal(novo.quantidadeMinimaLoop,2);
 assert.equal(novo.valorElegivelLoopCentavos,0);
 assert.equal((await pago('pdf-original-250')).posicaoCriada,true);
 assert.equal((await pago('pdf-minimo-2')).posicaoCriada,false);
 await req('carrinho-loop-demo/quantidade-minima',{
  produtoId:'pdf-250',quantidadeMinimaLoop:1,revisaoEsperada:2
 });
 assert.equal((await pedido('pdf-minimo-restaurado')).valorElegivelLoopCentavos,25000);
 assert.equal((await pago('pdf-minimo-restaurado')).posicaoCriada,true);
});
