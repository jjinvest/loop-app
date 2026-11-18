'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {criarGatewayPublicoReal}=
 require('../scripts/iniciar-gateway-publico-real-loop');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {SessaoAdminComercialSQLite}=
 require('../src/producao/sessao-admin-comercial-sqlite');
const {CatalogoMultiDistribuidoresSQLite}=
 require('../src/producao/catalogo-multidistribuidores-sqlite');
const {ControleEconomicoLojaSQLite}=
 require('../src/producao/controle-economico-loja-sqlite');
const {criarAppIdentidadeLoop}=
 require('../src/producao/servidor-identidade-loop');
const {renderizarInterfaceAprovada,renderizarLojaAprovada}=
 require('../src/producao/interface-aprovada-loop');
const REAL='https://loop.com.br';
const DOC='O cliente aceita o cadastro unico para acessar AKITEMM e LOOP. '+
 'Este ensaio isolado nao cria creditos nem permite pagamentos reais.';
const ADMIN='SenhaOperadorDeEnsaioComTrintaCaracteres_2026!';

test('gateway e identidade reais end-to-end: mesmas telas, cookies, CSRF e operador separado',async t=>{
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
 const sessoes=new SessaoAdminComercialSQLite({
  banco,chaveAdmin:randomBytes(32),credencialAdmin:ADMIN
 });
 const catalogo=new CatalogoMultiDistribuidoresSQLite({
  banco,distribuidorHomologado:()=>false
 });
 const controle=new ControleEconomicoLojaSQLite({banco});
 const app=criarAppIdentidadeLoop({
  contas,origemHttps:REAL,permitirCadastro:false,
  adminComercial:{sessoes,catalogo,controle},
  catalogoVitrine:{banco,listarVitrinePreparacao:({limite})=>{
   assert.equal(limite,400);
   return [{produtoId:'produto-real',
    titulo:'Mercadoria cadastrada sem preço homologado',
    descricao:'Apenas preparação interna',
    tipo:'FISICO',cor:'CINZA',
    criadoEm:Date.now(),unidadesConfirmadas:0,
    precoCentavos:null,estoqueConfirmado:false,
    compravel:false,checkoutReal:false,fotos:[]}];
  }}
 });
 const real=app.listen(0,'127.0.0.1');
 await once(real,'listening');
 const gateway=criarGatewayPublicoReal({
  urlIdentidadeReal:'http://127.0.0.1:'+real.address().port,
  origemReal:REAL,testeLoopback:true
 });
 gateway.listen(0,'127.0.0.1');
 await once(gateway,'listening');
 t.after(async()=>{
  await new Promise(ok=>gateway.close(ok));
  await new Promise(ok=>real.close(ok));
 });
 const base='http://127.0.0.1:'+gateway.address().port;
 const get=(p,h={})=>fetch(base+p,{headers:h,redirect:'manual'});
 const post=(p,body,headers={})=>fetch(base+p,{
  method:'POST',redirect:'manual',
  headers:{Origin:base,'Content-Type':'application/json',...headers},
  body:JSON.stringify(body)
 });
 assert.equal((await get('/api/contas/me')).status,401);
 assert.equal((await get('/loja')).status,401);
 assert.equal((await get('/api/operador/estado')).status,200);
 const tela=await get('/escritorio');
 assert.equal(tela.status,200);
 assert.equal(await tela.text(),renderizarInterfaceAprovada());
 assert.equal((await get('/api/contas/documentos')).status,503,
  'cadastro publico continua fechado em operacao interna real');
 assert.equal((await get('/api/contas/captcha-cadastro')).status,503);
 assert.equal((await post('/api/contas/cadastrar',{})).status,503);
 const criar=await contas.cadastrar({
  nome:'Cliente Teste',nick:'Cliente',email:'cliente@example.invalid',
  senha:'SenhaBemForteDeEnsaio2026!Numero1',
  aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:contas.documentos().termos.versao,
  hashTermos:contas.documentos().termos.hash,
  versaoPrivacidade:contas.documentos().privacidade.versao,
  hashPrivacidade:contas.documentos().privacidade.hash
 });
 assert.ok(criar);
 const login=await post('/api/contas/entrar',{
  nick:'Cliente',senha:'SenhaBemForteDeEnsaio2026!Numero1'
 });
 assert.equal(login.status,200);
 const cookieCliente=login.headers.get('set-cookie').split(';')[0];
 assert.match(cookieCliente,/^loop_real_s=[a-f0-9]{64}$/);
 const conta=await get('/api/contas/me',{Cookie:cookieCliente});
 assert.equal(conta.status,200);
 assert.equal((await conta.json()).nick,'cliente');
 const loja=await get('/loja',{Cookie:cookieCliente});
 assert.equal(loja.status,200);
 assert.equal(await loja.text(),renderizarLojaAprovada());
 const vitrine=await get('/api/loja/catalogo',{Cookie:cookieCliente});
 assert.equal(vitrine.status,200);
 const produtos=await vitrine.json();
 assert.equal(produtos.produtos.length,1);
 assert.equal(produtos.produtos[0].produtoId,'produto-real');
 assert.equal(produtos.produtos[0].compravel,false);
 assert.equal(produtos.produtos[0].precoCentavos,null);
 assert.equal(produtos.checkoutReal,false);
 assert.equal((await get('/api/operador/estado',{Cookie:cookieCliente})).status,200);
 assert.equal((await get('/api/admin/comercial/sessao',{Cookie:cookieCliente})).status,401);
 const op=await post('/api/operador/entrar',{nick:'operador',senha:ADMIN});
 assert.equal(op.status,200);
 const cookieOp=op.headers.get('set-cookie').split(';')[0];
 assert.match(cookieOp,/^akitemm_real_admin_v1=[a-f0-9]{64}$/);
 const admin=await get('/api/admin/comercial/sessao',{Cookie:cookieOp});
 assert.equal(admin.status,200);
 assert.ok((await admin.json()).csrfToken.length>=24);
 assert.equal((await get('/api/contas/me',{Cookie:cookieOp})).status,401);
 assert.equal((await get('/api/loja/pedidos',{Cookie:cookieOp})).status,401);
 assert.equal((await get('/loja',{Cookie:cookieOp})).status,200);
 assert.equal((await get('/api/loja/catalogo',{Cookie:cookieOp})).status,200);
 assert.equal((await get('/identidade/assets/operador-fotos.js')).status,200);
 assert.equal((await get('/staging/cliente')).status,410);
 assert.equal((await get('/internal/loop/tabuleiro')).status,404);
 assert.equal(banco.prepare('PRAGMA quick_check').get().quick_check,'ok');
});
