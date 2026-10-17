'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {IndicacoesLinksComissoesDemoSQLite,extrairLink}=
  require('../src/domain/indicacoes-links-comissoes-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');

test('dois enderecos AKITEMM e Escritorio LOOP preservam mesmo indicador e links Vilela antigos', async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const indicador=contas.cadastrar({
  nome:'Indicador Laboratorio Links',email:'indicador-vilela@exemplo.invalid',
  senha:'senha-ficticia-segura-2026'
 });
 // O servidor monta previamente as tabelas da ponte/carrinho usadas para ativacao.
 const app=criarAppAdminLaboratorio({repositorio:repo,segredo:'chave-super-segura-laboratorio-vilela-2026'});
 const links=new IndicacoesLinksComissoesDemoSQLite({banco:repo.banco,contas});
 const dados=links.linkDaConta(indicador.contaId);
 assert.match(dados.linkLoja,/^\/loja\/convite\/lp-[a-f0-9]{20}\/meu-loop$/);
 assert.match(dados.linkEscritorio,/^\/escritorio\/convite\/lp-[a-f0-9]{20}\/meu-loop$/);
 assert.equal(dados.mesmoCodigoIndicador,true);
 assert.equal(dados.ativo,false);
 const loja=extrairLink(dados.linkLoja);
 const escritorio=extrairLink(dados.linkEscritorio);
 assert.equal(loja.token,escritorio.token);
 assert.equal(loja.destino,'loja');
 assert.equal(escritorio.destino,'escritorio');
 assert.equal(extrairLink(dados.link+'?destino=loja').token,loja.token);
 assert.equal(extrairLink(dados.link+'?destino=loja').destino,'loja');
 assert.equal(extrairLink(dados.link+'?destino=escritorio').destino,'escritorio');
 for(const url of [
  dados.linkLoja+'?destino=escritorio',
  dados.linkEscritorio+'?destino=loja',
  dados.linkLoja+'?extra=1',
  dados.linkEscritorio+'#pagina',
  '/loja-vilela/convite/lp-errado/qualquer'
 ]){
  assert.throws(()=>extrairLink(url),e=>e.codigo==='LINK_INVALIDO');
 }
 const alterado=links.personalizar({contaId:indicador.contaId,apelido:'Vilela'});
 assert.ok(alterado.linkLoja.endsWith('/vilela'));
 assert.ok(alterado.linkEscritorio.endsWith('/vilela'));
 assert.equal(extrairLink(alterado.linkLoja).token,loja.token);
 assert.equal(extrairLink(alterado.linkEscritorio).token,loja.token);
 assert.equal(links.resolver(dados.linkLoja).indicadorId,indicador.contaId);
 assert.equal(links.resolver(alterado.linkEscritorio).indicadorId,indicador.contaId);
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const texto=async path=>{
  const res=await fetch(base+path);
  return {status:res.status,body:await res.text()};
 };
 const tl=await texto('/loja-vilela');
 const te=await texto('/escritorio-vilela');
 assert.equal(tl.status,200);
 assert.equal(te.status,200);
 assert.match(tl.body,/AKITEMM/);
 assert.match(te.body,/Escritório LOOP/);
 for(const novo of [dados.linkLoja,dados.linkEscritorio,
   alterado.linkLoja,alterado.linkEscritorio]){
  const r=await texto(novo);
  assert.equal(r.status,200);
  assert.match(r.body,/tituloDestinoConvite/);
 }
 const api=async link=>{
  const res=await fetch(base+'/api/laboratorio/convite/estado?link='+
   encodeURIComponent(link));
  assert.equal(res.status,200);
  return res.json();
 };
 assert.equal((await api(alterado.linkLoja)).destino,'loja');
 assert.equal((await api(alterado.linkEscritorio)).destino,'escritorio');
 assert.equal((await api(dados.link+'?destino=loja')).destino,'loja');
 assert.equal((await api(dados.link+'?destino=escritorio')).destino,'escritorio');
 assert.equal((await texto('/laboratorio/loja')).status,200);
 assert.equal((await texto('/laboratorio/participante')).status,200);
 assert.equal((await texto('/loja-vilela/convite/lp-invalido/vilela')).status,404);
 const navegador=await texto('/laboratorio/convite.js');
 assert.equal(navegador.status,200);
 assert.match(navegador.body,/trocaDestino/);
 const serverPublico=require('../src/server').listen(0,'127.0.0.1');
 await once(serverPublico,'listening');
 t.after(()=>new Promise(resolve=>serverPublico.close(resolve)));
 assert.equal((await fetch('http://127.0.0.1:'+
  serverPublico.address().port+'/loja-vilela')).status,404);
 assert.equal((await fetch('http://127.0.0.1:'+
  serverPublico.address().port+'/escritorio-vilela')).status,404);
});
