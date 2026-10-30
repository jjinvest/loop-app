'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');

function produto(id,centavos,tipo='FISICO'){
 return {id,nome:'Item de teste '+id,tipo,estado:'PUBLICADO',
  descricao:'Produto simulado sem venda real',precoCentavos:centavos,
  entrega:tipo==='PDF'?'DOWNLOAD_APOS_CONFIRMACAO':'FORNECEDOR_INTEGRADO',
  fotos:[],videoApresentacaoUrl:null,detalhes:[]};
}
test('caneta R$50 precisa de 20 unidades NO MESMO PEDIDO apesar do minimo da cadeira ser R$250',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 repo.salvar({produto:produto('caneta-50',5000),revisaoEsperada:0});
 repo.salvar({produto:produto('curso-250',25000,'PDF'),revisaoEsperada:0});
 repo.salvar({produto:produto('item-150',15000),revisaoEsperada:0});
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const cliente=contas.cadastrar({
  nome:'Teste Cliente Vinte Canetas',
  email:'cliente-vinte-canetas@exemplo.invalid',
  senha:'senha-ficticia-caneta-2026'
 });
 const senha='admin-laboratorio-minimo-20-canetas-123456789';
 const srv=criarAppAdminLaboratorio({repositorio:repo,segredo:senha})
  .listen(0,'127.0.0.1');
 await once(srv,'listening');t.after(()=>new Promise(resolve=>srv.close(resolve)));
 const base='http://127.0.0.1:'+srv.address().port;
 const headers={'Content-Type':'application/json',Authorization:'Bearer '+senha};
 const api=async(method,rota,body)=>{
  const r=await fetch(base+'/api/admin/'+rota,{
   method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  return {status:r.status,json:await r.json()};
 };
 const registro=async(id,itens)=>{
  const r=await api('POST','carrinho-loop-demo',{
   pedidoId:id,contaId:cliente.contaId,itens
  });
  assert.equal(r.status,201,JSON.stringify(r.json));
  return r.json.pedido;
 };
 const confirmar=async(id)=>{
  const r=await api('POST','carrinho-loop-demo/'+id+'/eventos',{
   eventoId:'evento-'+id,tipo:'CONFIRMAR_FICTICIO'
  });
  assert.equal(r.status,200,JSON.stringify(r.json));
  return r.json.integracao;
 };
 // Antes da mudanca todos os produtos entram com minimo padrao de uma unidade.
 const anterior=await registro('pedido-caneta-antes',[
  {produtoId:'caneta-50',quantidade:5}
 ]);
 assert.equal(anterior.totalCentavos,25000);
 assert.equal(anterior.totalElegivelLoopCentavos,25000);
 assert.equal(anterior.itens[0].quantidadeMinimaLoop,1);
 const opcoes=(await api('GET','carrinho-loop-demo/opcoes')).json.produtos;
 assert.equal(opcoes.find(p=>p.produtoId==='caneta-50').quantidadeMinimaLoop,1);
 // Administrador sobe exigencia para vinte unidades.
 const alterado=await api('POST','carrinho-loop-demo/quantidade-minima',{
  produtoId:'caneta-50',quantidadeMinimaLoop:20,revisaoEsperada:1
 });
 assert.equal(alterado.status,200);
 assert.equal(alterado.json.regra.quantidadeMinimaLoop,20);
 assert.equal(alterado.json.regra.revisaoQuantidadeMinima,2);
 for(const invalido of [0,101,1.5,'20',null]){
  const x=await api('POST','carrinho-loop-demo/quantidade-minima',{
   produtoId:'caneta-50',quantidadeMinimaLoop:invalido,revisaoEsperada:2
  });
  assert.equal(x.status,400,'invalid '+String(invalido));
 }
 assert.equal((await api('POST','carrinho-loop-demo/quantidade-minima',{
  produtoId:'caneta-50',quantidadeMinimaLoop:10,revisaoEsperada:1
 })).status,409);
 assert.equal((await api('GET','carrinho-loop-demo/opcoes')).json.produtos
  .find(p=>p.produtoId==='caneta-50').quantidadeMinimaLoop,20);
 // Os 19 itens custam R$ 950 e o pagamento de loja e valido,
 // mas NENHUM real deste produto conta para uma cadeira.
 const dezenove=await registro('pedido-19-canetas',[
  {produtoId:'caneta-50',quantidade:19}
 ]);
 assert.equal(dezenove.totalCentavos,95000);
 assert.equal(dezenove.totalElegivelLoopCentavos,0);
 assert.equal(dezenove.itens[0].quantidadeMinimaLoop,20);
 assert.equal((await confirmar('pedido-19-canetas')).posicaoCriada,false);
 // O pedido antigo nao deve ser reavaliado com a nova regra.
 assert.equal((await confirmar('pedido-caneta-antes')).posicaoCriada,true);
 // Vinte unidades atingem sua regra, gerando UMA posicao apesar de R$ 1.000.
 const vinte=await registro('pedido-20-canetas',[
  {produtoId:'caneta-50',quantidade:20}
 ]);
 assert.equal(vinte.totalCentavos,100000);
 assert.equal(vinte.totalElegivelLoopCentavos,100000);
 const r20=await confirmar('pedido-20-canetas');
 assert.equal(r20.posicaoCriada,true);
 assert.equal(r20.valorElegivelLoopCentavos,100000);
 assert.equal((await api('POST','carrinho-loop-demo/pedido-20-canetas/sincronizar',{})).json.repetido,true);
 // Um produto valido soma com outro apenas se atender SUA regra individual.
 const misto=await registro('pedido-19-canetas-e-150',[
  {produtoId:'caneta-50',quantidade:19},
  {produtoId:'item-150',quantidade:1}
 ]);
 assert.equal(misto.totalCentavos,110000);
 assert.equal(misto.totalElegivelLoopCentavos,15000);
 assert.equal((await confirmar('pedido-19-canetas-e-150')).posicaoCriada,false);
 const pdf=await registro('pedido-caneta-e-pdf',[
  {produtoId:'caneta-50',quantidade:1},
  {produtoId:'curso-250',quantidade:1}
 ]);
 assert.equal(pdf.totalCentavos,30000);
 assert.equal(pdf.totalElegivelLoopCentavos,25000);
 assert.equal((await confirmar('pedido-caneta-e-pdf')).posicaoCriada,true);
 // Excluir caneta mantem produto na loja, independentemente da quantidade.
 const excluido=await api('POST','carrinho-loop-demo/elegibilidade',{
  produtoId:'caneta-50',elegivelLoop:false,revisaoEsperada:1
 });
 assert.equal(excluido.status,200);
 const quarenta=await registro('pedido-40-canetas-desautorizadas',[
  {produtoId:'caneta-50',quantidade:40}
 ]);
 assert.equal(quarenta.totalCentavos,200000);
 assert.equal(quarenta.totalElegivelLoopCentavos,0);
 assert.equal((await confirmar('pedido-40-canetas-desautorizadas')).posicaoCriada,false);
 assert.equal((await api('GET','carrinho-loop-demo/opcoes')).json.produtos
  .find(p=>p.produtoId==='caneta-50').quantidadeMinimaLoop,20);
 // Restaurar a autorizacao e baixar minimo somente para pedidos futuros.
 assert.equal((await api('POST','carrinho-loop-demo/elegibilidade',{
  produtoId:'caneta-50',elegivelLoop:true,revisaoEsperada:2
 })).status,200);
 assert.equal((await api('POST','carrinho-loop-demo/quantidade-minima',{
  produtoId:'caneta-50',quantidadeMinimaLoop:1,revisaoEsperada:2
 })).status,200);
 assert.equal((await api('GET','carrinho-loop-demo/pedido-19-canetas')).json.pedido.totalElegivelLoopCentavos,0);
 const cinco=await registro('pedido-cinco-canetas-restaurado',[
  {produtoId:'caneta-50',quantidade:5}
 ]);
 assert.equal(cinco.totalElegivelLoopCentavos,25000);
 assert.equal((await confirmar('pedido-cinco-canetas-restaurado')).posicaoCriada,true);
 const ponte=(await api('GET','ponte-compras-convites-demo')).json;
 assert.equal(ponte.compras.length,4);
 assert.equal(ponte.comprasLojaSemLoop.length,3);
 assert.equal(repo.banco.prepare('SELECT COUNT(*) AS n FROM admin_produtos_quantidade_minima_historico_demo').get().n,2);
 assert.throws(()=>repo.banco.exec(
  'UPDATE admin_carrinho_item_quantidade_minima_demo SET quantidade_minima=1'
 ),/quantidade minima congelada/);
 assert.throws(()=>repo.banco.exec(
  'UPDATE admin_produtos_quantidade_minima_historico_demo SET quantidade_nova=1'
 ),/historico de quantidade imutavel/);
});
