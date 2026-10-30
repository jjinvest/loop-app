'use strict';
// GUARDA DE REGRESSAO DO DONO: pergunta extra OCULTA nao pode mexer
// na qualificacao automatica do pedido nem na confirmacao individual.
// Somente laboratorio: pagamentos ADMIN FICTICIOS, nao PIX de verdade.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const produto=(id,precoCentavos)=>({
 id,nome:'Produto ficticio '+id,tipo:'PDF',estado:'PUBLICADO',
 descricao:'Somente fixture para a regressao; nao e tabela comercial',
 precoCentavos,entrega:'DOWNLOAD_APOS_CONFIRMACAO',
 fotos:[],videoApresentacaoUrl:null,detalhes:[]
});
test('convite escondido nao acumula pedidos nem inclui produtos excluidos na qualificacao',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 for(const [id,preco] of [
  ['curso-exato-250',25000],['curso-fixture-150',15000],
  ['produto-excluido-500',50000]
 ])repo.salvar({produto:produto(id,preco),revisaoEsperada:0});
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const titular=contas.cadastrar({nome:'Comprador Regra Preservada',
  email:'regra-preservada@exemplo.invalid',senha:'senha-comprador-regra-2026'});
 const segredo='segredo-regressao-sem-mudar-fluxo-2026-456987123';
 const servidor=criarAppAdminLaboratorio({repositorio:repo,segredo})
  .listen(0,'127.0.0.1');
 await once(servidor,'listening');
 t.after(()=>new Promise(resolve=>servidor.close(resolve)));
 const url='http://127.0.0.1:'+servidor.address().port;
 const participante=url+'/api/laboratorio/participante';
 const cliente={'Content-Type':'application/json','X-LOOP-LAB':'participante'};
 const admin={'Content-Type':'application/json',Authorization:'Bearer '+segredo};
 const entrar=await fetch(participante+'/entrar',{method:'POST',headers:cliente,
  body:JSON.stringify({nome:titular.nome,senha:'senha-comprador-regra-2026'})});
 assert.equal(entrar.status,200);
 const cookie=entrar.headers.get('set-cookie').split(';')[0];
 const catalogo=await fetch(participante+'/loja/catalogo',{headers:{Cookie:cookie}});
 assert.equal((await catalogo.json()).conviteLoopCheckoutAtivo,false);
 const respostaExcluido=await fetch(url+'/api/admin/carrinho-loop-demo/elegibilidade',{
  method:'POST',headers:admin,body:JSON.stringify({
   produtoId:'produto-excluido-500',elegivelLoop:false,revisaoEsperada:1
  })});
 assert.equal(respostaExcluido.status,200);
 const criar=async(itens,extra=null)=>{
  const r=await fetch(participante+'/loja/pedidos',{
   method:'POST',headers:{...cliente,Cookie:cookie},
   body:JSON.stringify(extra?{itens,...extra}:{itens})});
  const data=await r.json();
  assert.equal(r.status,201,JSON.stringify(data));
  assert.equal(data.pedido.escolhaLoopExpressa,false);
  assert.equal(data.pedido.participarLoop,null);
  assert.equal(data.pedido.posicaoCriada,false);
  return data.pedido;
 };
 const confirmar=async(pedido,indice)=>{
  const r=await fetch(url+'/api/admin/carrinho-loop-demo/'+pedido.pedidoId+'/eventos',{
   method:'POST',headers:admin,
   body:JSON.stringify({eventoId:'conf-regressao-'+indice,tipo:'CONFIRMAR_FICTICIO'})
  });
  assert.equal(r.status,200);
  return (await r.json()).integracao;
 };
 const item=(produtoId,quantidade=1)=>({produtoId,quantidade});
 const abaixo1=await criar([item('curso-fixture-150')]);
 const abaixo2=await criar([item('curso-fixture-150')]);
 assert.equal(abaixo1.totalElegivelLoopCentavos,15000);
 assert.equal(abaixo2.totalElegivelLoopCentavos,15000);
 assert.equal((await confirmar(abaixo1,1)).posicaoCriada,false);
 assert.equal((await confirmar(abaixo2,2)).posicaoCriada,false);
 const excluido=await criar([item('produto-excluido-500')]);
 assert.equal(excluido.totalCentavos,50000);
 assert.equal(excluido.totalElegivelLoopCentavos,0);
 assert.equal((await confirmar(excluido,3)).posicaoCriada,false);
 const mistoAbaixo=await criar([
  item('produto-excluido-500'),item('curso-fixture-150')
 ]);
 assert.equal(mistoAbaixo.totalCentavos,65000);
 assert.equal(mistoAbaixo.totalElegivelLoopCentavos,15000);
 assert.equal((await confirmar(mistoAbaixo,4)).posicaoCriada,false);
 const mistoQualificado=await criar([
  item('produto-excluido-500'),item('curso-exato-250')
 ]);
 assert.equal(mistoQualificado.totalCentavos,75000);
 assert.equal(mistoQualificado.totalElegivelLoopCentavos,25000);
 assert.equal(mistoQualificado.posicoesSolicitadas,1);
 const criarPosicao=await confirmar(mistoQualificado,5);
 assert.equal(criarPosicao.compraElegivelLoop,true);
 assert.equal(criarPosicao.posicaoCriada,true);
 assert.equal(criarPosicao.statusAdesao,'PENDENTE');
 const repetir=await fetch(url+'/api/admin/carrinho-loop-demo/'+mistoQualificado.pedidoId+'/eventos',{
  method:'POST',headers:admin,
  body:JSON.stringify({eventoId:'conf-regressao-5',tipo:'CONFIRMAR_FICTICIO'})
 });
 assert.equal(repetir.status,200);
 assert.equal((await repetir.json()).integracao.repetido,true);
 const minha=await fetch(participante+'/minha-conta',{headers:{Cookie:cookie}});
 assert.equal(minha.status,200);
 const visao=await minha.json();
 assert.equal(visao.posicoes.length,1);
 assert.equal(visao.posicoes[0].statusAdesao,'PENDENTE');
 assert.equal(repo.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n,1);
 assert.equal(repo.banco.prepare('SELECT COUNT(*) AS n FROM admin_carrinho_escolha_loop_demo').get().n,0);
 assert.equal(Object.values(repo.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(repo.banco.prepare('PRAGMA foreign_key_check').all(),[]);
 console.log('LOOP_REGRESSAO_CONVITE_INVISIVEL='+JSON.stringify({
  perguntasVisiveis:false,pedidosFicticios:5,posicoesPendentesAtivacao:1,
  comprasIndependentes150NaoAcumulam:true,
  itemExcluido500NaoQualifica:true,
  compraMista650Apenas150ElegiveisNaoQualifica:true,
  compraMista750Com250ElegiveisGeraUmaPosicao:true,
  mesmoEventoIdempotente:true,semPagamentoReal:true
 }));
});
