'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');

test('escritorio repaginado mantém identidade, casa para propaganda selecionada e segunda aba tabuleiro',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const segredo='admin-virtual-loop-2026-segredo-forte';
 const server=criarAppAdminLaboratorio({repositorio:repo,segredo}).listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const api=base+'/api/admin/escritorio-demo';
 const headers={Authorization:'Bearer '+segredo,'Content-Type':'application/json'};
 const pagina=await fetch(base+'/admin/escritorio-demo');
 assert.equal(pagina.status,200);
 const html=await pagina.text();
 for(const name of ['home','tabuleiro','conta']){
  assert.match(html,new RegExp('data-aba-escritorio="'+name+'"'));
 }
 for(const id of ['abaHomeEscritorio','abaTabuleiroEscritorio','abaContaEscritorio',
  'anelTabuleiroEscritorio','listaFilaAEscritorio','listaFilaBEscritorio',
  'formPublicacaoHome']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.ok(html.indexOf('data-aba-escritorio="home"')<
  html.indexOf('data-aba-escritorio="tabuleiro"'));
 const js=await fetch(base+'/admin/escritorio-demo.js');
 assert.equal(js.status,200);
 const codigo=await js.text();
 assert.match(codigo,/mostrarMapa/);
 assert.match(codigo,/atualizarPublicacoesHome/);
 assert.match(codigo,/criarEsfera/);
 assert.equal((await fetch(api+'/publicacoes')).status,401);
 const vazio=await (await fetch(api+'/publicacoes',{headers})).json();
 assert.equal(vazio.publicacoes.length,0);
 const dados={tipo:'AKITEMM',titulo:'Novidade da AKITEMM',
  descricao:'Veja as novidades disponíveis na loja da plataforma.',
  linkDestino:'/loja'};
 const criado=await fetch(api+'/publicacoes',{method:'POST',headers,
  body:JSON.stringify(dados)});
 assert.equal(criado.status,201);
 const registro=await criado.json();
 assert.equal(registro.situacao,'PUBLICADA');
 const listado=await (await fetch(api+'/publicacoes',{headers})).json();
 assert.equal(listado.publicacoes.length,1);
 assert.equal(listado.publicacoes[0].titulo,dados.titulo);
 assert.equal(listado.publicacoes[0].linkDestino,'/loja');
 const invalido=await fetch(api+'/publicacoes',{method:'POST',headers,
  body:JSON.stringify({...dados,linkDestino:'https://site-externo.example'})});
 assert.equal(invalido.status,400);
 assert.equal((await fetch(api+'/publicacoes',{method:'POST',
  headers:{'Content-Type':'application/json'},body:JSON.stringify(dados)})).status,401);
 const arquivar=await fetch(api+'/publicacoes/'+registro.id+'/arquivar',{
  method:'POST',headers,body:'{}'});
 assert.equal(arquivar.status,200);
 const apos=await (await fetch(api+'/publicacoes',{headers})).json();
 assert.equal(apos.publicacoes.length,0);
 const visao=await (await fetch(api+'/motor/conta-demo-a',{headers})).json();
 assert.equal(visao.origem,'MOTOR_EXISTENTE_EM_CENARIO_FICTICIO');
 assert.equal(visao.mapa.vagas.length,6);
 assert.ok(Array.isArray(visao.mapa.filaA));
 assert.ok(Array.isArray(visao.mapa.filaB));
 assert.ok(visao.mapa.centro);
 assert.equal(visao.mapa.filaA.length+visao.mapa.filaB.length,
  visao.mapa.filaA.length+visao.mapa.filaB.length);
});
