'use strict';
// CONTRATO DEFINITIVO DE ROTAS: loja publica e convite nao podem ser
// convertidos em login antecipado por refatoracao, homologacao ou deploy.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const path=require('node:path');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {criarAppIdentidadeLoop}=
 require('../src/producao/servidor-identidade-loop');
const {renderizarLojaAprovada}=
 require('../src/producao/interface-aprovada-loop');
const origem='https://akitemmloop.com.br';
const texto='Documento de integracao para o teste de rotas publicas. '+
 'A loja oferece produtos publicados e cadastro por acao do visitante.';
const ler=arquivo=>fs.readFileSync(path.join(__dirname,'..',arquivo),'utf8');
test('contrato definitivo: loja abre sem nick; convite vai para a loja e nao para login',async t=>{
 const banco=new DatabaseSync(':memory:');
 const contas=new IdentidadeClienteLoopReal({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TERMOS-CONTRATO-v1',texto},
  privacidade:{versao:'LOOP-PRIVACIDADE-CONTRATO-v1',texto},
  enviarEmail:async()=>true
 });
 const app=criarAppIdentidadeLoop({
  contas,origemHttps:origem,permitirCadastro:false,
  // Apenas produtos publicados; nenhum pedido, saldo, preco ou pagamento.
  catalogoVitrine:{banco,listarVitrinePreparacao:()=>[]}
 });
 const srv=app.listen(0,'127.0.0.1');
 await once(srv,'listening');
 t.after(async()=>{await new Promise(done=>srv.close(done));banco.close();});
 const base='http://127.0.0.1:'+srv.address().port;
 const acessar=(p,options={})=>fetch(base+p,{redirect:'manual',...options});
 const inicio=await acessar('/loja');
 assert.equal(inicio.status,200,'o dominio publico nunca pede sessao para a vitrine');
 const html=await inicio.text();
 assert.ok(html.includes('id="catalogoLojaLoop"'));
 assert.match(html,/src="\/identidade\/assets\/loja\.js\?rev=[a-f0-9]{16}"/);
 const vitrineConvite=await acessar('/loja?ref=VILELA');
 assert.equal(vitrineConvite.status,200,'a vitrine pelo link indicado e a mesma');
 assert.equal(await vitrineConvite.text(),html,'convite nao pode criar tela paralela');
 const catalogo=await acessar('/api/loja/catalogo');
 assert.equal(catalogo.status,200,'somente catalogo publicado e publico');
 const dados=await catalogo.json();
 assert.equal(dados.origem,'CATALOGO_ADMINISTRATIVO_PUBLICADO');
 assert.equal(dados.checkoutReal,false);
 assert.deepEqual(dados.produtos,[]);
 for(const privada of ['/api/loja/pedidos','/api/loja/estado',
  '/api/loja/capacidade','/api/contas/me']){
  const r=await acessar(privada);
  assert.equal(r.status,401,privada+' precisa de login real');
 }
 const docs=contas.documentos();
 await contas.cadastrar({
  nome:'Ana do Convite',nick:'Ana',email:'ana@example.invalid',
  senha:'SenhaFicticia2026!',
  aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
  versaoPrivacidade:docs.privacidade.versao,hashPrivacidade:docs.privacidade.hash
 });
 const conviteLoja=await acessar('/loja/ANA');
 assert.equal(conviteLoja.status,303);
 assert.equal(conviteLoja.headers.get('location'),'/loja?ref=ana');
 const conviteEscritorio=await acessar('/escritorio/ANA');
 assert.equal(conviteEscritorio.status,303);
 assert.equal(conviteEscritorio.headers.get('location'),'/escritorio?ref=ana');
 const legado=await acessar('/convite/loja?ref=Ana');
 assert.equal(legado.status,303);
 assert.equal(legado.headers.get('location'),'/loja?ref=Ana');
 const falso=await acessar('/loja/ZzzNaoExiste');
 assert.equal(falso.status,404,'o backend nao inventa indicadores');
});
test('contrato definitivo: cadastro so apos acao e convite preservado sem liberar pagamento',()=>{
 const loja=ler('src/producao/interface-aprovada-loja.js');
 const conta=ler('src/producao/interface-aprovada-contas.js');
 const servidor=ler('src/producao/servidor-identidade-loop.js');
 const html=renderizarLojaAprovada();
 assert.ok(html.includes('id="akitemmAbrirConta"'));
 assert.ok(html.includes('id="registrarPedidoLoja" disabled'));
 assert.ok(loja.includes("location.assign(destinoCadastro())"));
 assert.ok(loja.includes("indicadorNick?'&ref='+encodeURIComponent(indicadorNick):''"));
 assert.ok(loja.includes("if(visitante){solicitarCadastro();return;}"));
 assert.ok(loja.includes("visitante=!operadorAtivo"));
 assert.ok(!loja.includes("if(!operadorAtivo){location.replace('/escritorio');return;}"));
 assert.ok(conta.includes("parametrosEntrada.get('cadastro')==='1'"));
 assert.ok(conta.includes("mostrarLogin('cadastro')"));
 assert.ok(conta.includes("...(indicadorNick?{indicadorNick}:{})"));
 assert.ok(servidor.includes("app.get('/api/loja/catalogo',(_req,res)=>"));
 assert.ok(servidor.includes("app.get('/api/loja/pedidos',protegido,"));
 assert.ok(servidor.includes("app.get('/api/loja/estado',protegido,"));
 assert.ok(servidor.includes("app.get('/api/loja/capacidade',protegido,"));
});
