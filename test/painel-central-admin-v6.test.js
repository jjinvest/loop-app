'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const {calcularPonteAkitemmLoop}=require('../src/domain/ponte-financeira-simples-akitemm-loop-v6');

test('painel central apresenta abas reais e diagnostico restrito ao admin do laboratorio',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 const senha='somente-laboratorio-admin-central-loop-2026';
 const server=criarAppAdminLaboratorio({repositorio:repo,segredo:senha})
  .listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const pagina=await fetch(base+'/admin');
 assert.equal(pagina.status,200);
 const html=await pagina.text();
 for(const id of ['navAdminCentral','areaVisaoAdmin','areaPainel',
  'areaImportacao','areaPedidosDemo','atualizarDiagnosticoAdmin',
  'resumoProdutosAdmin','resumoPublicadosAdmin','resumoCofresAdmin',
  'resumoPixAdmin','precoProduto','custoUnitarioCalcAdmin',
  'quantidadeCalcAdmin','resultadoCalcAdmin']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/role="tablist"/);
 assert.match(html,/data-aba-admin="inicio"/);
 assert.match(html,/href="\/admin\/circuit-break-v6"/);
 assert.match(html,/href="\/admin\/financeiro-demo"/);
 assert.match(html,/href="\/admin\/cadastro-participantes-demo"/);
 assert.match(html,/href="\/laboratorio\/loja"/);
 assert.match(html,/\/admin\/precificacao\.js/);
 assert.doesNotMatch(html,/R\$ 100 de custo|Margem do dono.*R\$/);
 const js=await fetch(base+'/admin/painel.js');
 assert.equal(js.status,200);
 const codigo=await js.text();
 assert.match(codigo,/atualizarDiagnosticoAdmin/);
 assert.match(codigo,/PonteFinanceiraAkitemmLoopV6/);
 assert.match(codigo,/mostrarAbaAdmin/);
 assert.match(codigo,/atualizarCalculadoraAdmin/);
 assert.doesNotMatch(codigo,/segredo-desenvolvimento-temporario/);
 const helper=await fetch(base+'/admin/precificacao.js');
 assert.equal(helper.status,200);
 assert.match(await helper.text(),/calcularPonteAkitemmLoop/);
 const api='/api/admin/circuit-break-v6-demo/ponte/conciliacao';
 assert.equal((await fetch(base+api)).status,401);
 const resposta=await fetch(base+api,{headers:{Authorization:'Bearer '+senha}});
 assert.equal(resposta.status,200);
 const c=await resposta.json();
 assert.equal(c.dinheiroBancarioComprovadoCentavos,0);
});

test('painel nao escolhe precos nem envia custo confidencial ao catalogo',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 const precoUnitarioCentavos=19000,custoUnitarioCentavos=5000,quantidade=2;
 const calculo=calcularPonteAkitemmLoop({
  valorVendaCentavos:precoUnitarioCentavos*quantidade,
  custoProdutosCentavos:custoUnitarioCentavos*quantidade
 });
 assert.equal(calculo.loopSeparavelCentavos,25000);
 assert.equal(calculo.restanteProprietarioCentavos,3000);
 assert.equal(calculo.separacaoRealExecutada,false);
 // Cadastro publico do produto tem apenas preco de venda escolhido pelo dono.
 const dados={
  id:'produto-preco-escolhido',nome:'Produto do laboratorio',
  tipo:'FISICO',estado:'PUBLICADO',
  descricao:'Cadastro sem custo de fornecedor',
  precoCentavos:precoUnitarioCentavos,
  entrega:'FORNECEDOR_INTEGRADO',fotos:[],
  videoApresentacaoUrl:null,detalhes:[]
 };
 repo.salvar({produto:dados,revisaoEsperada:0});
 assert.equal(repo.buscar(dados.id).precoCentavos,precoUnitarioCentavos);
 assert.equal(Object.hasOwn(repo.buscar(dados.id),'custoProdutosCentavos'),false);
 assert.equal(Object.hasOwn(repo.buscar(dados.id),'custoUnitarioCentavos'),false);
});
