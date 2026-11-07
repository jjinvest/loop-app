'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {CatalogoMultiDistribuidoresSQLite}=
 require('../src/producao/catalogo-multidistribuidores-sqlite');
const {ControleEconomicoLojaSQLite}=
 require('../src/producao/controle-economico-loja-sqlite');
const {SessaoAdminComercialSQLite}=
 require('../src/producao/sessao-admin-comercial-sqlite');
const {AuditoriaOperacionalSQLite}=
 require('../src/producao/auditoria-operacional-sqlite');
const {criarAppIdentidadeLoop}=
 require('../src/producao/servidor-identidade-loop');
const ORIGEM='https://loja.example.invalid';
const SENHA_OPERADOR='CredencialPrivadaSomenteTeste2026!Segredo';
const DOC='Termos técnicos de ensaio para as contas do LOOP e Loja AKITEMM. '+
 'Nenhuma cobrança ou comissão está ativa nesta fase de desenvolvimento.';
function preparar(t){
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 t.after(()=>banco.close());
 const contas=new IdentidadeClienteLoopReal({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TERMOS-2026',texto:DOC},
  privacidade:{versao:'LOOP-PRIV-2026',texto:DOC},
  enviarEmail:async()=>true
 });
 const auditoria=new AuditoriaOperacionalSQLite({
  banco,chaveAuditoria:randomBytes(32)
 });
 const catalogo=new CatalogoMultiDistribuidoresSQLite({
  banco,distribuidorHomologado:()=>false,auditoria
 });
 const controle=new ControleEconomicoLojaSQLite({banco,auditoria});
 const sessoes=new SessaoAdminComercialSQLite({
  banco,chaveAdmin:randomBytes(32),credencialAdmin:SENHA_OPERADOR
 });
 const app=criarAppIdentidadeLoop({
  contas,origemHttps:ORIGEM,permitirCadastro:true,
  adminComercial:{catalogo,controle,sessoes,auditoria}
 });
 return {banco,app,contas,catalogo,controle,sessoes,auditoria};
}
async function servir(t,app){
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 return 'http://127.0.0.1:'+server.address().port;
}
test('admin aprovado: login distinto, cadastrar produto/oferta, editar preços e custos, CSV e sair',async t=>{
 const x=preparar(t),base=await servir(t,x.app);
 const get=(p,h={})=>fetch(base+p,{headers:h,redirect:'manual'});
 const adminPagina=await get('/administrador');
 assert.equal(adminPagina.status,303);
 assert.equal(adminPagina.headers.get('location'),'/administrador/entrar');
 const loginPage=await get('/administrador/entrar');
 assert.equal(loginPage.status,200);
 const txt=await loginPage.text();
 assert.match(txt,/Acesso do administrador/);
 assert.doesNotMatch(txt,/CredencialPrivadaSomenteTeste2026/);
 const autorizado=await fetch(base+'/administrador/entrar',{
  method:'POST',redirect:'manual',
  headers:{Origin:ORIGEM,'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({senha:SENHA_OPERADOR})
 });
 assert.equal(autorizado.status,303);
 assert.equal(autorizado.headers.get('location'),'/administrador');
 const setCookie=autorizado.headers.get('set-cookie');
 assert.match(setCookie,/akitemm_real_admin_v1=/);
 assert.match(setCookie,/HttpOnly; Secure; SameSite=Strict; Path=\//);
 const cookieAdmin=setCookie.split(';')[0];
 const htmlRes=await get('/administrador',{Cookie:cookieAdmin});
 assert.equal(htmlRes.status,200);
 const html=await htmlRes.text();
 for(const campo of ['formNovoProduto','formNovaOferta',
  'formEconomiaProduto','salvarPrecoAdmin','salvarCustoAdmin',
  'listaProdutosAdmin','exportarCatalogoAdmin','exportarPedidosAdmin'])
  assert.match(html,new RegExp('id="'+campo+'"'),campo);
 assert.match(html,/src="\/identidade\/assets\/admin-comercial.js"/);
 assert.doesNotMatch(html,/src="\/staging\/assets\/admin.js"/);
 assert.doesNotMatch(html,/laboratório · SEM VENDAS REAIS/i);
 const js=await get('/identidade/assets/admin-comercial.js',{Cookie:cookieAdmin});
 assert.equal(js.status,200);
 const codigo=await js.text();
 assert.match(codigo,/salvarNovoProduto/);
 assert.match(codigo,/salvarNovaOferta/);
 assert.match(codigo,/salvarPrecoAdmin/);
 assert.match(codigo,/salvarCustoAdmin/);
 assert.match(codigo,/formEconomiaProduto/);
 assert.doesNotMatch(codigo,/require\('node:fs'\)/);
 assert.equal((await get('/identidade/assets/admin-comercial.js')).status,401);
 assert.equal((await get('/api/admin/comercial/produtos-valores')).status,401);
 const sess=await get('/api/admin/comercial/sessao',{Cookie:cookieAdmin});
 assert.equal(sess.status,200);
 const admin=await sess.json();
 assert.equal(admin.area,'ADMIN_COMERCIAL');
 assert.equal(admin.pagamentosHabilitados,false);
 const cab={
  Cookie:cookieAdmin,Origin:ORIGEM,
  'Content-Type':'application/json','X-Loop-Admin-Csrf':admin.csrfToken
 };
 const post=(p,body,headers=cab)=>fetch(base+'/api/admin/comercial'+p,{
  method:'POST',headers,body:JSON.stringify(body)
 });
 const cadastro=await post('/produtos-cadastrar',{
  produtoId:'tenis_001',titulo:'Tênis esportivo',descricao:'Produto físico sem venda liberada'
 });
 assert.equal(cadastro.status,201);
 assert.equal((await cadastro.json()).ativo,false);
 const oferta=await post('/ofertas-cadastrar',{
  produtoId:'tenis_001',distribuidorId:'distribuidor_A',sku:'SKU_TENIS_1',
  precoUnitCentavos:18900,prioridade:100
 });
 assert.equal(oferta.status,201);
 assert.equal((await oferta.json()).ofertaAtiva,false);
 const ofertas=await get('/api/admin/comercial/produtos-valores',{
  Cookie:cookieAdmin
 });
 assert.equal(ofertas.status,200);
 let dados=await ofertas.json();
 assert.equal(dados.ofertas.length,1);
 assert.equal(dados.ofertas[0].custoFornecedorCentavos,null);
 assert.equal(dados.ofertas[0].precoVendaCentavos,18900);
 const list=await get('/api/admin/comercial/produtos-cadastrados',{
  Cookie:cookieAdmin
 });
 assert.equal(list.status,200);
 assert.equal((await list.json()).produtos[0].quantidadeDistribuidores,1);
 const semCsrf=await post('/produtos-valores/tenis_001/distribuidor_A',{
  custoUnitCentavos:12500,revisaoEsperada:0
 },{
  Cookie:cookieAdmin,Origin:ORIGEM,'Content-Type':'application/json'
 });
 assert.equal(semCsrf.status,403);
 const custo=await post('/produtos-valores/tenis_001/distribuidor_A',{
  custoUnitCentavos:12500,revisaoEsperada:0
 });
 assert.equal(custo.status,200);
 assert.equal((await custo.json()).diferencaBrutaCentavos,6400);
 const preco=await post('/produtos-preco/tenis_001/distribuidor_A',{
  precoAnteriorCentavos:18900,precoVendaCentavos:19900,
  revisaoPrecoEsperada:0
 });
 assert.equal(preco.status,200);
 dados=await preco.json();
 assert.equal(dados.precoVendaCentavos,19900);
 assert.equal(dados.custoFornecedorCentavos,12500);
 assert.equal(dados.diferencaBrutaCentavos,7400);
 const auditoria=await get('/api/admin/comercial/auditoria',{
  Cookie:cookieAdmin
 });
 assert.equal(auditoria.status,200);
 const historico=await auditoria.json();
 assert.equal(historico.auditoriaIntegra,true);
 assert.equal(historico.totalHistorico,4);
 assert.deepEqual(historico.eventos.map(e=>e.acao),[
  'PRECO_VENDA_ALTERADO','CUSTO_FORNECEDOR_ALTERADO',
  'OFERTA_RASCUNHO_CRIADA','PRODUTO_CRIADO'
 ]);
 assert.equal(JSON.stringify(historico).includes('CredencialPrivada'),false);
 assert.equal((await get('/api/admin/comercial/auditoria')).status,401);
 const concorrente=await post('/produtos-preco/tenis_001/distribuidor_A',{
  precoAnteriorCentavos:18900,precoVendaCentavos:10900,
  revisaoPrecoEsperada:0
 });
 assert.equal(concorrente.status,409);
 const csv=await get('/api/admin/comercial/contador/catalogo.csv',{
  Cookie:cookieAdmin
 });
 assert.equal(csv.status,200);
 assert.match(await csv.text(),/"tenis_001";"distribuidor_A"/);
 assert.equal((await get('/api/admin/comercial/contador/catalogo.csv')).status,401);
 assert.deepEqual(x.catalogo.listarVitrine(),[],
  'cadastro administrativo nunca cria venda sem aprovação do distribuidor');
 const saiu=await fetch(base+'/api/admin/sair',{
  method:'POST',headers:{
   Cookie:cookieAdmin,Origin:ORIGEM,'X-Loop-Admin-Csrf':admin.csrfToken
  }
 });
 assert.equal(saiu.status,200);
 assert.equal((await get('/api/admin/comercial/produtos-valores',{
  Cookie:cookieAdmin
 })).status,401);
 assert.equal(x.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('credencial do cliente não é administrativa e falhas de login são limitadas',async t=>{
 const x=preparar(t),base=await servir(t,x.app);
 const form=senha=>fetch(base+'/administrador/entrar',{
  method:'POST',redirect:'manual',
  headers:{Origin:ORIGEM,'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({senha})
 });
 const documentos=x.contas.documentos();
 await x.contas.cadastrar({
  nome:'Cliente Exemplo',nick:'Cliente',email:'cliente@example.invalid',
  senha:'SenhaApenasCliente2026!',
  aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:documentos.termos.versao,
  hashTermos:documentos.termos.hash,
  versaoPrivacidade:documentos.privacidade.versao,
  hashPrivacidade:documentos.privacidade.hash
 });
 const sessaoCliente=await x.contas.entrar({
  nick:'Cliente',senha:'SenhaApenasCliente2026!'
 });
 assert.equal((await fetch(base+'/api/admin/comercial/produtos-valores',{
  headers:{Cookie:'loop_real_s='+sessaoCliente.token}
 })).status,401);
 assert.equal((await fetch(base+'/administrador',{
  headers:{Cookie:'loop_real_s='+sessaoCliente.token},redirect:'manual'
 })).status,303);
 for(let i=0;i<5;i++)assert.equal((await form('senha_errada')).status,401);
 assert.equal((await form(SENHA_OPERADOR)).status,429);
 assert.equal((await fetch(base+'/api/admin/comercial/sessao')).status,401);
});
