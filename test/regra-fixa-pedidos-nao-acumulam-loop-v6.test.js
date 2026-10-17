'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
function produto(id,preco){
 return {id,nome:'Produto AKITEMM '+id,tipo:'PDF',estado:'PUBLICADO',
  descricao:'Produto ficticio teste',precoCentavos:preco,
  entrega:'DOWNLOAD_APOS_CONFIRMACAO',fotos:[],videoApresentacaoUrl:null,
  detalhes:[]};
}
test('regra irrevogavel: cada pedido pago isolado; R$180 ativa link sem posicao; R$190+190 juntos uma posicao',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 repo.salvar({produto:produto('produto-akitemm-180',18000),revisaoEsperada:0});
 repo.salvar({produto:produto('produto-akitemm-100',10000),revisaoEsperada:0});
 repo.salvar({produto:produto('produto-akitemm-190',19000),revisaoEsperada:0});
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const conta=contas.cadastrar({nome:'Comprador Pedidos Separados',
  email:'comprador-pedidos-separados@exemplo.invalid',
  telefone:'(21) 98888-4455',senha:'senha-forte-compra-2026'});
 const segredo='segredo-demo-pedidos-r250-2026-seguro';
 const app=criarAppAdminLaboratorio({repositorio:repo,segredo});
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const participante=base+'/api/laboratorio/participante';
 const admin=base+'/api/admin/carrinho-loop-demo';
 const hCliente={'Content-Type':'application/json','X-LOOP-LAB':'participante'};
 const hAdmin={'Content-Type':'application/json',Authorization:'Bearer '+segredo};
 const login=await fetch(participante+'/entrar',{method:'POST',headers:hCliente,
  body:JSON.stringify({nome:conta.nome,senha:'senha-forte-compra-2026'})});
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const pedido=async(itens)=>{
  const r=await fetch(participante+'/loja/pedidos',{method:'POST',
   headers:{...hCliente,Cookie:cookie},body:JSON.stringify({itens})});
  assert.equal(r.status,201);
  return (await r.json()).pedido;
 };
 const confirmar=async(pedidoId,i)=>{
  const r=await fetch(admin+'/'+pedidoId+'/eventos',{method:'POST',
   headers:hAdmin,body:JSON.stringify({eventoId:'confirmacao-pedido-regra-'+i,
    tipo:'CONFIRMAR_FICTICIO'})});
  assert.equal(r.status,200);
  return (await r.json()).integracao;
 };
 const meusLinks=async()=>{
  const r=await fetch(participante+'/meus-links',{headers:{Cookie:cookie}});
  assert.equal(r.status,200);
  return r.json();
 };
 const minhaConta=async()=>{
  const r=await fetch(participante+'/minha-conta',{headers:{Cookie:cookie}});
  assert.equal(r.status,200);
  return r.json();
 };
 // Cadastro nao ativa nada. Apenas a primeira VENDA CONFIRMADA ativa links.
 assert.equal((await meusLinks()).ativo,false);
 const barato=await pedido([{produtoId:'produto-akitemm-180',quantidade:1}]);
 assert.equal(barato.totalCentavos,18000);
 assert.equal(barato.posicaoCriada,false);
 assert.equal((await meusLinks()).ativo,false); // fechar e pagar, nao apenas montar carrinho
 const fechamentoBarato=await confirmar(barato.pedidoId,'180');
 assert.equal(fechamentoBarato.compraElegivelLoop,false);
 assert.equal(fechamentoBarato.posicaoCriada,false);
 assert.equal(fechamentoBarato.linkDivulgacaoLiberado,true);
 assert.equal((await meusLinks()).ativo,true);
 assert.equal((await meusLinks()).bonificacoesHabilitadas,false);
 assert.equal((await minhaConta()).posicoes.length,0);
 // Duas compras separadas NUNCA acumulam (180+100 nao vira 280).
 const segundo=await pedido([{produtoId:'produto-akitemm-100',quantidade:1}]);
 assert.notEqual(segundo.pedidoId,barato.pedidoId);
 const fechamentoSegundo=await confirmar(segundo.pedidoId,'100');
 assert.equal(fechamentoSegundo.compraElegivelLoop,false);
 assert.equal(fechamentoSegundo.posicaoCriada,false);
 assert.equal((await minhaConta()).posicoes.length,0);
 // Duas unidades no MESMO pedido: 190 + 190 = 380 e 1 posicao.
 const junto=await pedido([{produtoId:'produto-akitemm-190',quantidade:2}]);
 assert.equal(junto.totalCentavos,38000);
 assert.equal(junto.totalElegivelLoopCentavos,38000);
 const resultado=await confirmar(junto.pedidoId,'380');
 assert.equal(resultado.compraElegivelLoop,true);
 assert.equal(resultado.posicaoCriada,true);
 assert.equal(resultado.posicoesCriadas,1);
 assert.equal((await minhaConta()).posicoes.length,1);
 assert.equal((await meusLinks()).ativo,true);
 // Outro pedido de 190 nao adquire posicao, mesmo apos compra de 380.
 const ultimo=await pedido([{produtoId:'produto-akitemm-190',quantidade:1}]);
 const final=await confirmar(ultimo.pedidoId,'190');
 assert.equal(final.compraElegivelLoop,false);
 assert.equal(final.posicaoCriada,false);
 assert.equal((await minhaConta()).posicoes.length,1);
 const r=repo.banco.prepare([
  'SELECT COUNT(*) AS n FROM admin_ponte_compras_demo WHERE conta_id=?'
 ].join(' ')).get(conta.contaId);
 assert.equal(r.n,1);
 // Nenhum teste usou PIX ou aportou R$250 ficticiamente.
 assert.equal(repo.banco.prepare([
  "SELECT COUNT(*) AS n FROM loop_v6_pre_aportes_demo"
 ].join(' ')).get().n,0);
});
