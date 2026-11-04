'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {criarAppLojaEscritorioCandidato}=require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=require('../src/laboratorio/servidor-checkout-staging-local');
const {CatalogoAdminCandidatoSQLite}=require('../src/domain/catalogo-admin-candidato-sqlite');
const {COOKIE}=require('../src/domain/conta-unica-candidata-sqlite');
const ADMIN='operador-catalogo-unificado-'+('P'.repeat(48));
const SENHA='SenhaFicticiaSomenteTeste2026!';
async function req(base,rota,{method='GET',cookie,csrf,admin=false,body,key}={}){
 const r=await fetch(base+rota,{
  method,headers:{
   ...(cookie?{Cookie:COOKIE+'='+cookie}:{}),
   ...(csrf?{'X-Checkout-Csrf':csrf}:{}),
   ...(admin?{Authorization:'Bearer '+ADMIN}:{}),
   ...(key?{'Idempotency-Key':key}:{}),
   ...(body?{'Content-Type':'application/json'}:{})
  },
  ...(body?{body:JSON.stringify(body)}:{})
 });
 return {status:r.status,data:await r.json().catch(()=>({})),cookie:r.headers.get('set-cookie')};
}
const produto=(id,valor=9900)=>({
 id,nome:'Produto de ensaio '+id,
 tipo:'PDF',estado:'PUBLICADO',
 descricao:'Curso fictício para testar edição do catálogo administrativo e loja.',
 precoCentavos:valor,entrega:'DOWNLOAD_APOS_CONFIRMACAO',
 fotos:[],detalhes:[],videoApresentacaoUrl:null
});
test('admin edita catálogo efetivo; cotação muda e pedido histórico permanece imutável',async t=>{
 const banco=new DatabaseSync(':memory:');banco.exec('PRAGMA foreign_keys=ON');
 const {app}=criarAppLojaEscritorioCandidato({
  banco,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),segredoOperador:ADMIN,
  termosVersao:'LAB-catalogo-unico-2026',
  termosTexto:'Ensaio de catálogo sem oferta real, pagamentos, posição ou lucro.'
 });
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(done=>server.close(done));banco.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const cadastro=await req(base,'/staging/contas/cadastrar',{method:'POST',body:{
  nome:'Cliente Teste',nick:'Tina',email:'tina@exemplo.invalid',senha:SENHA,aceiteExplicito:true
 }});
 assert.equal(cadastro.status,201);
 const login=await req(base,'/staging/contas/entrar',{method:'POST',body:{
  nick:'Tina',senha:SENHA
 }});
 assert.equal(login.status,200);
 const session={
  cookie:login.cookie.match(new RegExp(COOKIE+'=([a-f0-9]{64})'))[1],
  csrf:login.data.csrf
 };
 const original={itens:[{produtoId:'curso-homologacao-250',quantidade:1}]};
 const primeiraCotacao=await req(base,'/staging/cotacao',{method:'POST',body:original});
 assert.equal(primeiraCotacao.status,200);assert.equal(primeiraCotacao.data.totalCentavos,25000);
 const draft1=await req(base,'/staging/rascunhos',{method:'POST',body:original,
  ...session,key:'catalogo-primeiro-pedido-01'});
 assert.equal(draft1.status,201,JSON.stringify(draft1.data));
 const prep1=await req(base,'/staging/prepedidos',{method:'POST',body:{
  rascunhoId:draft1.data.intencao.pedidoId
 },...session});
 assert.equal(prep1.status,201);
 const draftStale=await req(base,'/staging/rascunhos',{method:'POST',body:original,
  ...session,key:'catalogo-rascunho-obsoleto-01'});
 assert.equal(draftStale.status,201);
 const root='/staging/escritorio-unificado/produtos';
 assert.equal((await req(base,root,{admin:false})).status,401);
 assert.equal((await req(base,root,{method:'POST',body:{produto:produto('pdf-ficticio-99')},
  key:'catalogo-operador-001'})).status,401);
 const list=await req(base,root,{admin:true});
 assert.equal(list.status,200);
 assert.equal(list.data.total,1);
 assert.equal(list.data.registros[0].revisao,0);
 const novo=await req(base,root,{method:'POST',admin:true,key:'catalogo-operador-001',
  body:{produto:produto('pdf-ficticio-99')}});
 assert.equal(novo.status,201,JSON.stringify(novo.data));
 assert.equal(novo.data.produto.id,'pdf-ficticio-99');
 assert.equal(novo.data.revisao,1);
 const replay=await req(base,root,{method:'POST',admin:true,key:'catalogo-operador-001',
  body:{produto:produto('pdf-ficticio-99')}});
 assert.equal(replay.status,200);assert.equal(replay.data.revisao,1);
 assert.equal((await req(base,root,{method:'POST',admin:true,key:'catalogo-operador-001',
  body:{produto:produto('pdf-ficticio-99',10500)}})).status,409);
 assert.equal((await req(base,root,{method:'POST',admin:true,key:'catalogo-operador-999',
  body:{produto:produto('curso-homologacao-250')}})).status,409);
 const publicos=await req(base,'/staging/catalogo');
 assert.equal(publicos.status,200);
 assert.equal(publicos.data.produtos.length,2);
 assert.equal(publicos.data.compraReal,false);
 assert.equal(JSON.stringify(publicos.data).includes('chave_criacao'),false);
 const cotadoNovo=await req(base,'/staging/cotacao',{method:'POST',body:{
  itens:[{produtoId:'pdf-ficticio-99',quantidade:3}]
 }});
 assert.equal(cotadoNovo.data.totalCentavos,29700);
 const produtoOriginal=root+'/curso-homologacao-250';
 const editar=await req(base,produtoOriginal,{method:'PATCH',admin:true,body:{
  revisaoEsperada:0,alteracoes:{precoCentavos:27500,nome:'Curso atualizado de teste',
   descricao:'Preço atualizado somente para novas cotações de homologação.',estado:'PUBLICADO'}
 }});
 assert.equal(editar.status,200,JSON.stringify(editar.data));
 assert.equal(editar.data.revisao,1);
 assert.equal((await req(base,produtoOriginal,{method:'PATCH',admin:true,body:{
  revisaoEsperada:0,alteracoes:{precoCentavos:28000}
 }})).status,409);
 assert.equal((await req(base,produtoOriginal,{method:'PATCH',admin:true,body:{
  revisaoEsperada:1,alteracoes:{id:'outro-produto'}
 }})).status,400);
 assert.equal((await req(base,produtoOriginal,{method:'PATCH',admin:true,body:{
  revisaoEsperada:1,alteracoes:{precoCentavos:-1}
 }})).status,400);
 const cotacaoNova=await req(base,'/staging/cotacao',{method:'POST',body:original});
 assert.equal(cotacaoNova.status,200);
 assert.equal(cotacaoNova.data.totalCentavos,27500);
 const stale=await req(base,'/staging/prepedidos',{method:'POST',
  body:{rascunhoId:draftStale.data.intencao.pedidoId},...session});
 assert.equal(stale.status,409,JSON.stringify(stale.data));
 assert.equal(stale.data.erro,'CATALOGO_ALTERADO_REFAZER_COTACAO');
 const pedidos=await req(base,'/staging/meus-pedidos',{cookie:session.cookie});
 assert.equal(pedidos.status,200);
 assert.equal(pedidos.data.pedidos.length,1);
 assert.equal(pedidos.data.pedidos[0].totalCentavos,25000);
 const historico=await req(base,produtoOriginal+'/historico',{admin:true});
 assert.equal(historico.status,200);
 assert.equal(historico.data.historico.length,1);
 assert.equal(historico.data.historico[0].antes.precoCentavos,25000);
 assert.equal(historico.data.historico[0].depois.precoCentavos,27500);
 assert.throws(()=>banco.prepare('UPDATE akitemm_catalogo_admin_historico SET acao=?').run('ALTERADO'),/historico imutavel/);
 const despublicar=await req(base,root+'/pdf-ficticio-99',{
  method:'PATCH',admin:true,body:{revisaoEsperada:1,alteracoes:{estado:'RASCUNHO'}}
 });
 assert.equal(despublicar.status,200);
 const depois=await req(base,'/staging/catalogo');
 assert.equal(depois.data.produtos.length,1);
 assert.equal((await req(base,'/staging/cotacao',{method:'POST',body:{
  itens:[{produtoId:'pdf-ficticio-99',quantidade:1}]
 }})).status,400);
 const departamento=await req(base,'/staging/escritorio-unificado/departamentos',{admin:true});
 assert.equal(departamento.status,200);
 const produtos=departamento.data.departamentos.find(x=>x.codigo==='PRODUTOS');
 assert.equal(produtos.quantidadeDadosLaboratorio,1);
 assert.equal(produtos.tipo,'CATALOGO_INTEGRADO_LABORATORIO');
 assert.equal((await req(base,'/staging/checkout/finalizar',{method:'POST',body:{}})).status,503);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('catálogo compartilhado persiste revisões no SQLite após reinício',async t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'akitemm-catalogo-admin-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const arquivo=path.join(pasta,'catalogo.sqlite');
 const base=catalogoFicticioCheckout();
 let banco=new DatabaseSync(arquivo);
 banco.exec('PRAGMA foreign_keys=ON');
 let cat=new CatalogoAdminCandidatoSQLite({banco,repositorioBase:base});
 const nova=await cat.criar({produto:produto('curso-persistente-01'),
  chaveIdempotencia:'curso-persistencia-01'});
 assert.equal(nova.revisao,1);
 const alterar=await cat.alterar({
  id:'curso-persistente-01',revisaoEsperada:1,
  alteracoes:{precoCentavos:12345}
 });
 assert.equal(alterar.revisao,2);
 banco.close();
 banco=new DatabaseSync(arquivo);banco.exec('PRAGMA foreign_keys=ON');
 cat=new CatalogoAdminCandidatoSQLite({banco,repositorioBase:base});
 assert.equal((await cat.buscar('curso-persistente-01')).precoCentavos,12345);
 assert.equal((await cat.buscarRegistro('curso-persistente-01')).revisao,2);
 assert.equal(cat.historico('curso-persistente-01').length,2);
 assert.equal((await cat.criar({produto:produto('curso-persistente-01'),
  chaveIdempotencia:'curso-persistencia-01'})).repetida,true);
 assert.equal((await cat.listar()).length,2);
 banco.close();
});
test('catálogo admin é proibido em produção',()=>{
 const db=new DatabaseSync(':memory:'),original=process.env.NODE_ENV;
 process.env.NODE_ENV='production';
 try{assert.throws(()=>new CatalogoAdminCandidatoSQLite({
  banco:db,repositorioBase:catalogoFicticioCheckout()
 }),/CATALOGO_ADMIN_NAO_HOMOLOGADO/);}
 finally{db.close();if(original===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=original;}
});
