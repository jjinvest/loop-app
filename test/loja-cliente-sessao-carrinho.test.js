'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');

function produto(id,centavos){
 return {id,nome:'Produto loja '+id,tipo:'PDF',estado:'PUBLICADO',
  descricao:'Produto ficticio teste',
  precoCentavos:centavos,entrega:'DOWNLOAD_APOS_CONFIRMACAO',
  fotos:[],videoApresentacaoUrl:null,detalhes:[]};
}
test('loja individual: cliente prepara pedido sem admin; so admin ficticio confirma posicao',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 repo.salvar({produto:produto('loja-produto-100',10000),revisaoEsperada:0});
 repo.salvar({produto:produto('loja-produto-150',15000),revisaoEsperada:0});
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const senha='senha-ficticia-que-e-segura-2026';
 const a=contas.cadastrar({nome:'Comprador Sessao Um',
  email:'sessao-um@exemplo.invalid',senha});
 const b=contas.cadastrar({nome:'Comprador Sessao Dois',
  email:'sessao-dois@exemplo.invalid',senha});
 const segredo='admin-local-loja-cliente-2026-123456789';
 const app=criarAppAdminLaboratorio({repositorio:repo,segredo,habilitarConviteLoopCheckout:true});
 const srv=app.listen(0,'127.0.0.1');
 await once(srv,'listening');t.after(()=>new Promise(resolve=>srv.close(resolve)));
 const base='http://127.0.0.1:'+srv.address().port;
 const loja=base+'/api/laboratorio/participante';
 const admin=base+'/api/admin/carrinho-loop-demo';
 const frontHeader={'Content-Type':'application/json','X-LOOP-LAB':'participante'};
 const teste=async(url,method='GET',cookie=null,body=null,headers={})=>{
  const r=await fetch(url,{method,headers:{...headers,...(cookie?{Cookie:cookie}:{})},
   ...(body===null?{}:{body:JSON.stringify(body)})});
  return {status:r.status,body:await r.json(),headers:r.headers};
 };
 assert.equal((await teste(loja+'/loja/catalogo')).status,401);
 assert.equal((await teste(loja+'/loja/pedidos','POST',null,
  {itens:[{produtoId:'loja-produto-100',quantidade:1}],participarLoop:false},frontHeader)).status,401);
 const logar=async nome=>{
  const resp=await teste(loja+'/entrar','POST',null,{nome,senha},frontHeader);
  assert.equal(resp.status,200);
  assert.equal(resp.body.autenticadoNoTeste,true);
  return resp.headers.get('set-cookie').split(';')[0];
 };
 const cookieA=await logar(a.nome);
 const cookieB=await logar(b.nome);
 const catalogo=await teste(loja+'/loja/catalogo','GET',cookieA);
 assert.equal(catalogo.status,200);
 assert.equal(catalogo.body.produtos.length,2);
 assert.equal(catalogo.body.referenciaLoopCentavos,25000);
 assert.equal(catalogo.body.pagamentoReal,false);
 assert.equal(JSON.stringify(catalogo.body).includes('sessao-um@'),false);
 const itens=[{produtoId:'loja-produto-100',quantidade:1},
  {produtoId:'loja-produto-150',quantidade:1}];
 const criacao=await teste(loja+'/loja/pedidos','POST',cookieA,{itens,participarLoop:true},frontHeader);
 assert.equal(criacao.status,201);
 assert.equal(criacao.body.pedido.totalCentavos,25000);
 assert.equal(criacao.body.pedido.itens.length,2);
 assert.equal(criacao.body.pedido.posicaoCriada,false);
 assert.equal(criacao.body.pedido.contaId,a.contaId);
 assert.match(criacao.body.pedido.pedidoId,/^carrinho-[0-9a-f-]{36}$/);
 const id=criacao.body.pedido.pedidoId;
 // Comprador nao informa titular nem valor do pagamento.
 for(const corpo of [
  {itens,contaId:b.contaId},{itens,pago:true},
  {itens,valorCentavos:25000},{itens,pedidoId:'carrinho-forjado'},
  {itens:[{produtoId:'loja-produto-100',quantidade:1,precoCentavos:25000}]}
 ]){
  assert.equal((await teste(loja+'/loja/pedidos','POST',cookieA,corpo,frontHeader)).status,400);
 }
 assert.equal((await teste(loja+'/loja/pedidos','POST',cookieA,{itens},
  {'Content-Type':'application/json'})).status,403);
 assert.equal((await teste(loja+'/loja/pedidos','POST',cookieA,{itens},{
  ...frontHeader,'Sec-Fetch-Site':'cross-site'
 })).status,403);
 assert.equal((await teste(loja+'/loja/pedidos/'+id,'GET',cookieB)).status,404);
 const outro=await teste(loja+'/loja/pedidos','GET',cookieB);
 assert.equal(outro.status,200);
 assert.equal(outro.body.pedidos.length,0);
 const proprio=await teste(loja+'/loja/pedidos','GET',cookieA);
 assert.equal(proprio.body.pedidos.length,1);
 assert.equal(proprio.body.pedidos[0].pedidoId,id);
 // Nenhuma fila antes da confirmacao ADMIN.
 let minha=await teste(loja+'/minha-conta','GET',cookieA);
 assert.equal(minha.body.posicoes.length,0);
 const adminHeaders={'Content-Type':'application/json',Authorization:'Bearer '+segredo};
 assert.equal((await teste(admin+'/'+id+'/eventos','POST',null,
  {eventoId:'confirmacao-carrinho-cliente-a',tipo:'CONFIRMAR_FICTICIO'},
  {'Content-Type':'application/json'})).status,401);
 const confirmado=await teste(admin+'/'+id+'/eventos','POST',null,
  {eventoId:'confirmacao-carrinho-cliente-a',tipo:'CONFIRMAR_FICTICIO'},
  adminHeaders);
 assert.equal(confirmado.status,200);
 assert.equal(confirmado.body.integracao.posicaoCriada,true);
 assert.equal(confirmado.body.integracao.statusAdesao,'PENDENTE');
 assert.equal(confirmado.body.integracao.posicaoId,1);
 const repete=await teste(admin+'/'+id+'/eventos','POST',null,
  {eventoId:'confirmacao-carrinho-cliente-a',tipo:'CONFIRMAR_FICTICIO'},
  adminHeaders);
 assert.equal(repete.body.integracao.repetido,true);
 minha=await teste(loja+'/minha-conta','GET',cookieA);
 assert.equal(minha.body.posicoes.length,1);
 assert.equal(minha.body.posicoes[0].statusAdesao,'PENDENTE');
 assert.equal(minha.body.mapaCores.filaB[0].cor,'AZUL');
 const pedidoFinal=await teste(loja+'/loja/pedidos/'+id,'GET',cookieA);
 assert.equal(pedidoFinal.body.pedido.posicaoCriada,true);
 assert.equal(pedidoFinal.body.pedido.situacaoPagamentoFicticio,'CONFIRMADO_FICTICIO');
 assert.equal((await teste(loja+'/loja/pedidos','GET',cookieB)).body.pedidos.length,0);
 // Nao ha recursos de pagamento reais no app publico.
 const appPublico=require('../src/server').listen(0,'127.0.0.1');
 await once(appPublico,'listening');t.after(()=>new Promise(resolve=>appPublico.close(resolve)));
 const publico='http://127.0.0.1:'+appPublico.address().port;
 assert.equal((await fetch(publico+'/laboratorio/loja')).status,404);
 assert.equal((await fetch(publico+'/api/laboratorio/participante/loja/catalogo')).status,404);
 // A vitrine local e servida separada do painel admin.
 const pagina=await(await fetch(base+'/laboratorio/loja')).text();
 assert.match(pagina,/id="catalogoLojaLoop"/);
 assert.match(pagina,/id="registrarPedidoLoja"/);
 const arquivoJS=await(await fetch(base+'/laboratorio/loja.js')).text();
 assert.match(arquivoJS,/loja\/pedidos/);
 assert.doesNotMatch(arquivoJS,/innerHTML|localStorage|sessionStorage/);
 const participanteHTML=await(await fetch(base+'/laboratorio/participante')).text();
 assert.match(participanteHTML,/href="\/loja"/);
});
test('comprador nao acessa itens fora do catalogo e valores de pedidos sao congelados',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 repo.salvar({produto:produto('produto-catalogo',9900),revisaoEsperada:0});
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const c=contas.cadastrar({nome:'Cliente Historico Loja',
  email:'hist-loja@exemplo.invalid',senha:'senha-ficticia-longa-2026'});
 const segredo='chave-admin-loja-historico-2026-123456789';
 const server=criarAppAdminLaboratorio({repositorio:repo,segredo}).listen(0,'127.0.0.1');
 await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url='http://127.0.0.1:'+server.address().port;
 const front={'Content-Type':'application/json','X-LOOP-LAB':'participante'};
 const login=await fetch(url+'/api/laboratorio/participante/entrar',{
  method:'POST',headers:front,body:JSON.stringify({nome:c.nome,senha:'senha-ficticia-longa-2026'})});
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const enviar=async itens=>{
  const r=await fetch(url+'/api/laboratorio/participante/loja/pedidos',{
   method:'POST',headers:{...front,Cookie:cookie},body:JSON.stringify({itens,participarLoop:false})});
  return {status:r.status,data:await r.json()};
 };
 assert.equal((await enviar([{produtoId:'inventado',quantidade:1}])).status,409);
 assert.equal((await enviar([{produtoId:'produto-catalogo',quantidade:0}])).status,400);
 assert.equal((await enviar([{produtoId:'produto-catalogo',quantidade:101}])).status,400);
 const r=await enviar([{produtoId:'produto-catalogo',quantidade:1}]);
 assert.equal(r.status,201);
 assert.equal(r.data.pedido.totalCentavos,9900);
 repo.atualizar({id:'produto-catalogo',revisaoEsperada:1,
  alteracoes:{precoCentavos:29900}});
 const pedido=await fetch(url+'/api/laboratorio/participante/loja/pedidos/'+r.data.pedido.pedidoId,{
  headers:{Cookie:cookie}});
 assert.equal((await pedido.json()).pedido.totalCentavos,9900);
 const novo=await enviar([{produtoId:'produto-catalogo',quantidade:1}]);
 assert.equal(novo.data.pedido.totalCentavos,29900);
});
