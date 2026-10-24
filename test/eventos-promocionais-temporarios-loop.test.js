'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const item=(id,centavos)=>({
 id,nome:'Produto ficticio '+id,tipo:'FISICO',estado:'PUBLICADO',
 descricao:'Produto de teste do evento',precoCentavos:centavos,
 entrega:'FORNECEDOR_INTEGRADO',fotos:[],videoApresentacaoUrl:null,detalhes:[]
});
test('promoção criada manualmente: cinza, 10/20/30 unidades, banners e fim',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 for(const [id,v] of [['barato-30',3000],['caneta-50',5000],['produto-180',18000],['produto-300',30000],['cinza-70',7000]])
  repo.salvar({produto:item(id,v),revisaoEsperada:0});
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const conta=contas.cadastrar({nome:'Participante de eventos',email:'teste-evento@exemplo.invalid',
  senha:'senha-ficticia-por-evento-123'});
 const chave='admin-eventos-manuais-testes-2026-12345';
 const srv=criarAppAdminLaboratorio({repositorio:repo,segredo:chave}).listen(0,'127.0.0.1');
 await once(srv,'listening');t.after(()=>new Promise(resolve=>srv.close(resolve)));
 const base='http://127.0.0.1:'+srv.address().port;
 const cab={'Content-Type':'application/json',Authorization:'Bearer '+chave};
 async function api(method,payload,body,headers=cab){
  const res=await fetch(base+'/api/admin/'+payload,{method,headers,
   ...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:res.status,data:await res.json()};
 }
 const cart='carrinho-loop-demo';
 const inicio=new Date().toISOString().slice(0,10);
 const fim=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
 const evento=(id,produtoId,min,pos)=>({
  eventoId:id,produtoId,titulo:'Promoção manual '+id,
  descricao:'Condição temporária do produto '+produtoId,
  dataInicio:inicio,dataFim:fim,quantidadeMinimaLoop:min,posicoesPorPedidoLoop:pos
 });
 const criar=(id,produtoId,qtd)=>api('POST',cart,{
  pedidoId:id,contaId:conta.contaId,itens:[{produtoId,quantidade:qtd}]
 });
 async function confirmar(id){
  return api('POST',cart+'/'+id+'/eventos',{
   eventoId:'confirmacao-'+id,tipo:'CONFIRMAR_FICTICIO'
  });
 }
 // Dois produtos verdes diferentes somam R$180 + R$300 = R$480, uma posicao;
 // produto CINZA de R$70 nao entra no minimo nem soma outra posicao.
 const regraCinza=await api('POST',cart+'/elegibilidade',{
  produtoId:'cinza-70',elegivelLoop:false,revisaoEsperada:1
 });
 assert.equal(regraCinza.status,200);
 const mistura=await api('POST',cart,{
  pedidoId:'carrinho-verdes-e-cinza',contaId:conta.contaId,
  itens:[{produtoId:'produto-180',quantidade:1},
   {produtoId:'produto-300',quantidade:1},
   {produtoId:'cinza-70',quantidade:1}]
 });
 assert.equal(mistura.status,201);
 assert.equal(mistura.data.pedido.totalCentavos,55000);
 assert.equal(mistura.data.pedido.totalElegivelLoopCentavos,48000);
 assert.equal(mistura.data.pedido.posicoesSolicitadas,1);
 assert.equal(mistura.data.pedido.itens.find(p=>p.produtoId==='cinza-70').subtotalElegivelCentavos,0);
 // Minimo POR PRODUTO pode ser definido pelo admin, diferentemente do
 // minimo de R$250 do pedido. A segunda regra prevalece se for maior.
 // Produto de R$180 elegível exige dois no mesmo pedido quando o admin assim configurar.
 const minAtual=await api('POST',cart+'/quantidade-minima',{
  produtoId:'produto-180',quantidadeMinimaLoop:2,revisaoEsperada:1
 });
 assert.equal(minAtual.status,200);
 const uma=await criar('produto-180-uma','produto-180',1);
 assert.equal(uma.data.pedido.totalElegivelLoopCentavos,0);
 const duas=await criar('produto-180-duas','produto-180',2);
 assert.equal(duas.data.pedido.posicoesSolicitadas,1);
 assert.equal(duas.data.pedido.totalElegivelLoopCentavos,36000);
 // A promoção pode tornar elegível um produto normalmente CINZA.
 const cinza=await api('POST',cart+'/elegibilidade',{
  produtoId:'barato-30',elegivelLoop:false,revisaoEsperada:1
 });
 assert.equal(cinza.status,200);
 assert.equal((await criar('cinza-antes','barato-30',10)).data.pedido.totalElegivelLoopCentavos,0);
 const errado=await api('POST',cart+'/eventos-especiais',evento('evento-inviavel','barato-30',10,2));
 assert.equal(errado.status,400);assert.equal(errado.data.erro,'LASTRO_MINIMO_INSUFICIENTE');
 const semAut=await api('POST',cart+'/eventos-especiais',evento('evento-sem-aut','barato-30',10,1),
  {'Content-Type':'application/json'});
 assert.equal(semAut.status,401);
 const ativo=await api('POST',cart+'/eventos-especiais',evento('evento-30-1','barato-30',10,1));
 assert.equal(ativo.status,201);
 assert.equal((await api('GET',cart+'/opcoes')).data.produtos.find(
  p=>p.produtoId==='barato-30').elegivelLoop,true);
 assert.equal((await api('GET',cart+'/opcoes')).data.produtos.find(
  p=>p.produtoId==='barato-30').posicoesPorPedidoLoop,1);
 const carrinhoAberto=await criar('cinza-durante','barato-30',10);
 assert.equal(carrinhoAberto.data.pedido.totalElegivelLoopCentavos,30000);
 assert.equal(carrinhoAberto.data.pedido.itens[0].eventoId,'evento-30-1');
 assert.equal((await api('GET','escritorio-demo/publicacoes')).data.publicacoes
  .some(p=>p.tipo==='EVENTO'&&p.titulo==='Promoção manual evento-30-1'),true);
 const fechado=await api('POST',cart+'/eventos-especiais/evento-30-1/encerrar',{});
 assert.equal(fechado.status,200);
 assert.equal((await api('GET',cart+'/opcoes')).data.produtos.find(
  p=>p.produtoId==='barato-30').elegivelLoop,false);
 assert.equal((await api('GET','escritorio-demo/publicacoes')).data.publicacoes
  .some(p=>p.titulo==='Promoção manual evento-30-1'),false);
 const semPromocao=await criar('cinza-depois','barato-30',10);
 assert.equal(semPromocao.data.pedido.totalElegivelLoopCentavos,0);
 assert.equal((await api('GET',cart+'/cinza-durante')).data.pedido.itens[0].eventoId,'evento-30-1');
 assert.equal((await confirmar('cinza-durante')).data.integracao.posicoesCriadas,1);
 assert.equal((await confirmar('cinza-depois')).data.integracao.posicaoCriada,false);
 assert.throws(()=>repo.banco.exec("DELETE FROM admin_carrinho_item_evento_especial_demo"),
  /evento congelado no pedido/);
 assert.equal((await api('GET',cart+'/eventos-especiais')).data.eventos
  .find(p=>p.eventoId==='evento-30-1').estado,'ENCERRADO');
 assert.equal((await api('POST',cart+'/eventos-especiais/evento-30-1/encerrar',{})).status,409);
 // Um novo evento pode usar o mesmo produto: 20 unidades de R$30 -> duas posições.
 const dois=await api('POST',cart+'/eventos-especiais',evento('evento-30-2','barato-30',20,2));
 assert.equal(dois.status,201);
 const p2=await criar('cinza-duas-posicoes','barato-30',20);
 assert.equal(p2.data.pedido.posicoesSolicitadas,2);
 assert.equal((await confirmar('cinza-duas-posicoes')).data.integracao.posicoesCriadas,2);
 assert.equal((await api('POST',cart+'/eventos-especiais/evento-30-2/encerrar',{})).status,200);
 const tres=await api('POST',cart+'/eventos-especiais',evento('evento-30-3','barato-30',30,3));
 assert.equal(tres.status,201);
 const p3=await criar('cinza-tres-posicoes','barato-30',30);
 assert.equal(p3.data.pedido.posicoesSolicitadas,3);
 const compra=await confirmar('cinza-tres-posicoes');
 assert.equal(compra.data.integracao.posicoesCriadas,3);
 assert.equal((await api('GET','ponte-compras-convites-demo')).data.filas.B.quantidade,6);
 // 20 canetas de R$50 podem conceder duas posições em evento expresso.
 const caneta=await api('POST',cart+'/eventos-especiais',evento('evento-20-canetas','caneta-50',20,2));
 assert.equal(caneta.status,201);
 const ultimo=await criar('vinte-canetas-duas','caneta-50',20);
 assert.equal(ultimo.data.pedido.posicoesSolicitadas,2);
 assert.equal((await confirmar('vinte-canetas-duas')).data.integracao.posicoesCriadas,2);
 assert.equal((await api('GET',cart+'/eventos-especiais')).data.eventos
  .some(x=>x.eventoId==='evento-20-canetas'&&x.estado==='ATIVO'),true);
});