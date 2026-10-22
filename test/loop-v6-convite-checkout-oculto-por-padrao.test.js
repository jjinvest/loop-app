'use strict';
// Novo requisito do dono: o convite para LOOP existe, porem OCULTO por padrao.
// Na ausencia de liberacao expressa do operador, comprar fica so na AKITEMM.
// POST forjado SIM nao pode ligar o recurso; nenhuma tela principal muda.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
test('convite LOOP fica oculto por padrao: checkout continua e SIM forjado nao cria vaga',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 repo.salvar({produto:{id:'pdf-convite-oculto',nome:'PDF Teste Convite Oculto',
  tipo:'PDF',estado:'PUBLICADO',descricao:'PDF ficticio de 250',
  precoCentavos:25000,entrega:'DOWNLOAD_APOS_CONFIRMACAO',
  fotos:[],videoApresentacaoUrl:null,detalhes:[]},revisaoEsperada:0});
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const pessoa=contas.cadastrar({nome:'Cliente Sem Convite',
  email:'sem-convite@exemplo.invalid',senha:'senha-ficticia-ocultar-loop-2026'});
 const adminToken='chave-de-laboratorio-convite-oculto-2026-987654321';
 // NENHUMA chave passada = oculto. Quem controla e o servidor, nao JS.
 const server=criarAppAdminLaboratorio({repositorio:repo,segredo:adminToken})
  .listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(done=>server.close(done)));
 const base='http://127.0.0.1:'+server.address().port;
 const headers={'Content-Type':'application/json','X-LOOP-LAB':'participante'};
 const resLogin=await fetch(base+'/api/laboratorio/participante/entrar',{
  method:'POST',headers,body:JSON.stringify({nome:pessoa.nome,
   senha:'senha-ficticia-ocultar-loop-2026'})});
 assert.equal(resLogin.status,200);
 const cookie=resLogin.headers.get('set-cookie').split(';')[0];
 const api=base+'/api/laboratorio/participante';
 const catalogo=await fetch(api+'/loja/catalogo',{headers:{Cookie:cookie}});
 const json=await catalogo.json();
 assert.equal(json.conviteLoopCheckoutAtivo,false);
 assert.equal(json.referenciaLoopCentavos,25000);
 const itens=[{produtoId:'pdf-convite-oculto',quantidade:1}];
 const criar=async participarLoop=>{
  const r=await fetch(api+'/loja/pedidos',{
   method:'POST',headers:{...headers,Cookie:cookie},
   body:JSON.stringify({itens,participarLoop})});
  return {status:r.status,json:await r.json()};
 };
 const forjado=await criar(true);
 assert.equal(forjado.status,409);
 assert.equal(forjado.json.erro,'CONVITE_LOOP_AINDA_OCULTO');
 assert.equal(repo.banco.prepare('SELECT COUNT(*) AS n FROM admin_carrinho_loop_demo').get().n,0);
 const comum=await criar(false);
 assert.equal(comum.status,201);
 assert.equal(comum.json.pedido.totalCentavos,25000);
 assert.equal(comum.json.pedido.participarLoop,false);
 assert.equal(comum.json.pedido.escolhaLoopExpressa,true);
 assert.equal(comum.json.pedido.totalElegivelLoopCentavos,0);
 assert.equal(comum.json.pedido.subtotalQualificadoOriginalCentavos,25000);
 assert.equal(comum.json.pedido.posicoesSolicitadas,0);
 const pedidoId=comum.json.pedido.pedidoId;
 const confirmado=await fetch(base+'/api/admin/carrinho-loop-demo/'+pedidoId+'/eventos',{
  method:'POST',
  headers:{'Content-Type':'application/json',Authorization:'Bearer '+adminToken},
  body:JSON.stringify({eventoId:'pagamento-optin-oculto-demo-001',
   tipo:'CONFIRMAR_FICTICIO'})});
 assert.equal(confirmado.status,200);
 const resultado=await confirmado.json();
 assert.equal(resultado.integracao.posicaoCriada,false);
 assert.equal(resultado.integracao.compraElegivelLoop,false);
 const minha=await fetch(api+'/minha-conta',{headers:{Cookie:cookie}});
 assert.equal((await minha.json()).posicoes.length,0);
 const html=await(await fetch(base+'/laboratorio/loja')).text();
 const js=await(await fetch(base+'/laboratorio/loja.js')).text();
 assert.match(html,/<fieldset id="akitemmEscolhaLoop"[^>]+ hidden\b/);
 assert.match(js,/conviteLoopCheckoutAtivo=false/);
 assert.match(js,/conviteLoopCheckoutAtivo=dados\.conviteLoopCheckoutAtivo===true/);
 assert.match(js,/qualificado=conviteLoopCheckoutAtivo&&totalElegivel>=referenciaCentavos/);
 assert.equal(Object.values(repo.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 console.log('LOOP_CONVITE_OCULTO='+JSON.stringify({
  defaultOculto:true,checkoutNormal:true,ligacaoFalsificadaRejeitada:true,
  pagamentoFicticioSemVaga:true,
  posicoes:0,tarifaOuCreditoReal:0,
  habilitacaoExigeAcaoDoProprietario:true
 }));
});
