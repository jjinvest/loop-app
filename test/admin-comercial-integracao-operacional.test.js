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
const {PedidosComerciaisSQLite}=
 require('../src/producao/pedidos-comerciais-sqlite');
const {ClassificacaoComercialLoopSQLite}=
 require('../src/producao/classificacao-comercial-loop-sqlite');
const {SessaoAdminComercialSQLite}=
 require('../src/producao/sessao-admin-comercial-sqlite');
const {AuditoriaOperacionalSQLite}=
 require('../src/producao/auditoria-operacional-sqlite');
const {ManutencaoComercialSQLite}=
 require('../src/producao/manutencao-comercial-sqlite');
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
 const manutencao=new ManutencaoComercialSQLite({banco,auditoria});
 const catalogo=new CatalogoMultiDistribuidoresSQLite({
  banco,distribuidorHomologado:()=>false,auditoria,manutencao
 });
 const controle=new ControleEconomicoLojaSQLite({banco,auditoria,manutencao});
 new PedidosComerciaisSQLite({banco,chavePedidos:randomBytes(32),
  consultarCotacaoConfiavel:async()=>null,
  consultarPagamentoPsp:async()=>null});
 const classificacaoLoop=new ClassificacaoComercialLoopSQLite({
  banco,auditoria,manutencao
 });
 const sessoes=new SessaoAdminComercialSQLite({
  banco,chaveAdmin:randomBytes(32),credencialAdmin:SENHA_OPERADOR
 });
 const app=criarAppIdentidadeLoop({
  contas,origemHttps:ORIGEM,permitirCadastro:true,
  adminComercial:{catalogo,controle,sessoes,auditoria,manutencao,classificacaoLoop}
 });
 return {banco,app,contas,catalogo,controle,sessoes,auditoria,manutencao,
  classificacaoLoop};
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
  'listaProdutosAdmin','exportarCatalogoAdmin','exportarPedidosAdmin',
  'suspenderComercialAdmin','retomarComercialAdmin','estadoManutencaoAdmin',
  'corProdutoAdmin','corTipoAdmin','salvarCorAdmin','estadoCorAdmin',
  'estadoJornadaComercial','pedidoJornadaAdmin','reprocessarJornadaAdmin',
  'atualizarJornadaAdmin'])
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
 assert.match(codigo,/alterarManutencao/);
 assert.match(codigo,/atualizarJornadaAdmin/);
 assert.match(codigo,/api\/admin\/comercial\/jornada/);
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
 // Sem fornecedor/PSP homologados, nenhum clique habilita compra ou envio.
 assert.equal((await get('/api/admin/comercial/jornada')).status,401);
 assert.equal((await get('/api/admin/comercial/jornada',{
  Cookie:cookieAdmin
 })).status,503);
 assert.equal((await fetch(base+'/api/admin/comercial/jornada/reprocessar',{
  method:'POST',headers:{Cookie:cookieAdmin,Origin:ORIGEM,
   'Content-Type':'application/json'},body:JSON.stringify({
   pedidoId:'PEDIDO_NAO_HOMOLOGADO'
  })
 })).status,403);
 assert.equal((await fetch(base+'/api/admin/comercial/jornada/reprocessar',{
  method:'POST',headers:cab,body:JSON.stringify({
   pedidoId:'PEDIDO_NAO_HOMOLOGADO'
  })
 })).status,423);
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
 const estadoInicial=await get('/api/admin/comercial/manutencao',{Cookie:cookieAdmin});
 assert.equal(estadoInicial.status,200);
 assert.equal((await estadoInicial.json()).suspensa,false);
 assert.equal((await get('/api/admin/comercial/manutencao')).status,401);
 const semPermissao=await post('/manutencao',{
  suspensa:true,revisaoEsperada:0,motivo:'INCIDENTE_OPERACIONAL'
 },{Cookie:cookieAdmin,Origin:ORIGEM,'Content-Type':'application/json'});
 assert.equal(semPermissao.status,403);
 const bloqueou=await post('/manutencao',{
  suspensa:true,revisaoEsperada:0,motivo:'CORRECAO_TECNICA'
 });
 assert.equal(bloqueou.status,200);
 assert.equal((await bloqueou.json()).suspensa,true);
 assert.equal((await post('/ofertas-cadastrar',{
  produtoId:'tenis_001',distribuidorId:'distribuidor_B',
  sku:'SKU_TENIS_2',precoUnitCentavos:22000,prioridade:100
 })).status,423);
 assert.equal((await get('/api/admin/comercial/produtos-valores',{
  Cookie:cookieAdmin
 })).status,200,'consultas administrativas não param');
 assert.equal((await get('/api/admin/comercial/auditoria',{
  Cookie:cookieAdmin
 })).status,200);
 const reabriu=await post('/manutencao',{
  suspensa:false,revisaoEsperada:1,motivo:'RETOMADA_OPERACAO'
 });
 assert.equal(reabriu.status,200);
 assert.equal((await reabriu.json()).revisao,2);
 assert.equal((await post('/ofertas-cadastrar',{
  produtoId:'tenis_001',distribuidorId:'distribuidor_B',
  sku:'SKU_TENIS_2',precoUnitCentavos:22000,prioridade:100
 })).status,201);
 assert.equal(x.auditoria.verificar().integra,true);
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

test('classificação comercial exige administrador, CSRF, revisão e auditoria; manutenção bloqueia',async t=>{
 const x=preparar(t),base=await servir(t,x.app);
 const get=(p,headers={})=>fetch(base+p,{headers,redirect:'manual'});
 const api='/api/admin/comercial';
 assert.equal((await get(api+'/classificacoes')).status,401);
 const login=await fetch(base+'/administrador/entrar',{
  method:'POST',redirect:'manual',
  headers:{Origin:ORIGEM,'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({senha:SENHA_OPERADOR})
 });
 assert.equal(login.status,303);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const session=await get(api+'/sessao',{Cookie:cookie});
 assert.equal(session.status,200);
 const csrf=(await session.json()).csrfToken;
 const headers={Cookie:cookie,Origin:ORIGEM,'Content-Type':'application/json',
  'X-Loop-Admin-Csrf':csrf};
 const post=(p,body,h=headers)=>fetch(base+api+p,{
  method:'POST',headers:h,body:JSON.stringify(body)
 });
 const created=await post('/produtos-cadastrar',{
  produtoId:'curso_teste',titulo:'Produto de teste',descricao:'Sem venda real'
 });
 assert.equal(created.status,201);
 let lista=await get(api+'/classificacoes',{Cookie:cookie});
 assert.equal(lista.status,200);
 let r=await lista.json();
 assert.equal(r.produtos.length,1);
 assert.equal(r.produtos[0].cor,'CINZA');
 assert.equal(r.produtos[0].revisao,0);
 assert.equal(r.produtos[0].publicado,false);
 assert.equal(r.ativacaoFinanceira,false);
 const cfg={cor:'VERDE',minimo:1,roxasPorUnidade:0,revisaoEsperada:0};
 assert.equal((await post('/classificacoes/curso_teste',cfg,{
  Cookie:cookie,Origin:ORIGEM,'Content-Type':'application/json'
 })).status,403);
 assert.equal((await post('/classificacoes/curso_teste',cfg)).status,200);
 assert.equal((await post('/classificacoes/curso_teste',cfg)).status,409);
 assert.equal((await post('/classificacoes/curso_teste',{
  ...cfg,cor:'ROXO',revisaoEsperada:1
 })).status,400);
 const roxo=await post('/classificacoes/curso_teste',{
  ...cfg,cor:'ROXO',roxasPorUnidade:2,revisaoEsperada:1
 });
 assert.equal(roxo.status,200);
 assert.equal((await roxo.json()).revisao,2);
 lista=await get(api+'/classificacoes',{Cookie:cookie});
 r=await lista.json();
 assert.equal(r.produtos[0].cor,'ROXO');
 assert.equal(r.produtos[0].roxasPorUnidade,2);
 assert.equal(r.produtos[0].revisao,2);
 assert.equal(x.auditoria.verificar().integra,true);
 assert.equal(x.auditoria.listar().filter(z=>
  z.acao==='CLASSIFICACAO_PRODUTO_ALTERADA').length,2);
 const pausou=await post('/manutencao',{
  suspensa:true,revisaoEsperada:0,motivo:'CORRECAO_TECNICA'
 });
 assert.equal(pausou.status,200);
 assert.equal((await post('/classificacoes/curso_teste',{
  cor:'CINZA',minimo:1,roxasPorUnidade:0,revisaoEsperada:2
 })).status,423);
 assert.equal((await get(api+'/classificacoes',{Cookie:cookie})).status,200);
 assert.equal((await get(api+'/classificacoes')).status,401);
 assert.equal(x.banco.prepare(
  'SELECT COUNT(*) AS n FROM loja_real_pedidos'
 ).get()?.n??0,0);
 assert.deepEqual(x.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
