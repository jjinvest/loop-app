'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
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
const {ManutencaoComercialSQLite}=
 require('../src/producao/manutencao-comercial-sqlite');
const {criarCatalogoMercadoriasReal}=
 require('../src/producao/catalogo-mercadorias-real');
const {criarAppIdentidadeLoop}=
 require('../src/producao/servidor-identidade-loop');
const ORIGEM='https://loja.example.invalid';
const SENHA='CredencialPrivadaSomenteTeste2026!Segredo';
const DOC='Termos exclusivos para testar isolamento da conta LOOP e o acesso '+
 'ao acervo persistente AKITEMM. Nenhuma compra, crédito ou saque é permitido.';
const FOTO=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DAAMIM/4EAAB/uBfsL2WiLAAAAAElFTkSuQmCC','base64');

test('mesmo operador real sobe foto versionada; cliente so ve publicada, sem alterar UI',async t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'akitemm-operador-fotos-'));
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 let catalogoPrincipal=null;
 const midia=criarCatalogoMercadoriasReal({
  arquivo:path.join(pasta,'catalogo-real.sqlite'),
  tokenRaiz:'a'.repeat(64),
  buscarProdutoCompartilhado:id=>catalogoPrincipal?.
   buscarProdutoAdministrativo({produtoId:id})||null
 });
 t.after(()=>{
  midia.fechar();banco.close();
  fs.rmSync(pasta,{recursive:true,force:true});
 });
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
 catalogoPrincipal=catalogo;
 catalogo.criarProduto({produtoId:'bone-cinza',titulo:'Boné Cinza'});
 catalogo.ativarProduto({produtoId:'bone-cinza',ativo:true});
 catalogo.criarProduto({produtoId:'SKU_ANTIGO',titulo:'Código Comercial Antigo'});
 catalogo.ativarProduto({produtoId:'SKU_ANTIGO',ativo:true});
 const controle=new ControleEconomicoLojaSQLite({banco,auditoria,manutencao});
 const sessoes=new SessaoAdminComercialSQLite({
  banco,chaveAdmin:randomBytes(32),credencialAdmin:SENHA
 });
 const produto={id:'tenis-preto-42',nome:'Tênis Preto tamanho 42',
  tipo:'FISICO',estado:'RASCUNHO',descricao:'Produto original AKITEMM',
  precoCentavos:27500,entrega:'ESTOQUE_PROPRIO',
  fotos:[],detalhes:['Numeração 42'],videoApresentacaoUrl:null
 };
 midia.repo.salvar({produto,revisaoEsperada:0});
 const app=criarAppIdentidadeLoop({
  contas,origemHttps:ORIGEM,permitirCadastro:false,
  catalogoVitrine:{
   banco, listarVitrinePreparacao:args=>catalogo.listarVitrinePreparacao(args)
  },
  catalogoMidiaLeitura:{
   banco:midia.repo.banco,
   listarVitrinePreparacao:args=>midia.listarVitrinePreparacao(args),
   listarFotosProdutoCompartilhado:args=>
    midia.listarFotosProdutoCompartilhado(args),
   abrirFotoPublicada:args=>midia.abrirFotoPublicada(args)
  },
  adminComercial:{
   sessoes,controle,catalogo,auditoria,manutencao,catalogoMidia:midia
  }
 });
 const servidor=app.listen(0,'127.0.0.1');
 await once(servidor,'listening');
 t.after(()=>new Promise(ok=>servidor.close(ok)));
 const base='http://127.0.0.1:'+servidor.address().port;
 const get=(url,headers={})=>fetch(base+url,{headers,redirect:'manual'});
 const adminFoto='/api/admin/catalogo-midia/produtos/'+produto.id;
 const vitrineFoto='/api/loja/produtos/'+produto.id+'/foto/1';
 assert.equal((await get(adminFoto+'/fotos')).status,401);
 assert.equal((await get('/api/admin/catalogo-midia/produtos')).status,401);
 assert.equal((await get(vitrineFoto)).status,401);
 const op=await fetch(base+'/api/operador/entrar',{
  method:'POST',headers:{Origin:ORIGEM,'Content-Type':'application/json'},
  body:JSON.stringify({nick:'operador',senha:SENHA})
 });
 assert.equal(op.status,200);
 const cookie=op.headers.get('set-cookie').split(';')[0];
 const estado=await get('/api/operador/estado',{Cookie:cookie});
 assert.deepEqual(await estado.json(),{operador:true});
 // Operador pode visualizar a mesma loja, mas não assume identidade
 // de titular para consultar pedidos, saldo ou finalizar compras.
 const lojaOperador=await get('/loja',{Cookie:cookie});
 assert.equal(lojaOperador.status,200);
 assert.match(await lojaOperador.text(),/identidade\/assets\/operador-fotos\.js/);
 assert.equal((await get('/api/loja/catalogo',{Cookie:cookie})).status,200);
 assert.equal((await get('/api/loja/pedidos',{Cookie:cookie})).status,401);
 assert.equal((await get('/api/contas/me',{Cookie:cookie})).status,401);
 const sessao=await get('/api/admin/comercial/sessao',{Cookie:cookie});
 assert.equal(sessao.status,200);
 const csrf=(await sessao.json()).csrfToken;
 assert.ok(csrf.length>=24);
 const endpoint=adminFoto+'/fotos/1';
 const post=(extra={},body=FOTO)=>fetch(base+endpoint,{
  method:'POST',headers:{Cookie:cookie,Origin:ORIGEM,
   'X-Loop-Admin-Csrf':csrf,'X-Foto-Versao-Esperada':'0',
   'Content-Type':'image/png',...extra},body
 });
 assert.equal((await post({'X-Loop-Admin-Csrf':'errado'})).status,403);
 assert.equal((await post({Origin:'https://forjado.invalid'})).status,403);
 assert.equal((await post({'Content-Type':'image/svg+xml'})).status,415);
 const criado=await post();
 assert.equal(criado.status,201);
 const registro=await criado.json();
 assert.equal(registro.versao,1);
 assert.equal(registro.url,adminFoto+'/foto/1');
 assert.equal(registro.checkoutReal,false);
 assert.equal((await post()).status,409,'nao sobrescrever versao concorrente');
 const semSessao=await fetch(base+endpoint,{
  method:'POST',headers:{Origin:ORIGEM,'Content-Type':'image/png',
   'X-Loop-Admin-Csrf':csrf,'X-Foto-Versao-Esperada':'1'},body:FOTO
 });
 assert.equal(semSessao.status,401);
 const lista=await get(adminFoto+'/fotos',{Cookie:cookie});
 assert.equal(lista.status,200);
 const metas=await lista.json();
 assert.equal(metas.fotos.length,1);
 assert.equal(metas.fotos[0].versao,1);
 assert.equal(metas.fotos[0].posicao,1);
 assert.equal(metas.fotos[0].url,adminFoto+'/foto/1');
 assert.equal((await get(adminFoto+'/foto/1',{Cookie:cookie})).status,200);
 // O produto no banco comercial principal usa o MESMO armazenamento de
 // fotos: não recriar outro registro para guardar sua imagem.
 const produtoPrincipal='/api/admin/catalogo-midia/produtos/bone-cinza';
 assert.equal(midia.repo.buscar('bone-cinza'),null);
 const subirPrincipal=await fetch(base+produtoPrincipal+'/fotos/10',{
  method:'POST',headers:{Cookie:cookie,Origin:ORIGEM,
   'X-Loop-Admin-Csrf':csrf,'X-Foto-Versao-Esperada':'0',
   'Content-Type':'image/png'},body:FOTO
 });
 assert.equal(subirPrincipal.status,201);
 assert.equal(midia.repo.buscar('bone-cinza'),null);
 const produtosAdmin=await get('/api/admin/catalogo-midia/produtos',
  {Cookie:cookie});
 assert.equal(produtosAdmin.status,200);
 const visaoAdmin=await produtosAdmin.json();
 assert.equal(visaoAdmin.produtos.length,3);
 assert.equal(visaoAdmin.produtos.find(p=>p.produtoId==='bone-cinza')
  .quantidadeFotos,1);
 assert.equal(visaoAdmin.produtos.find(p=>p.produtoId==='SKU_ANTIGO')
  .quantidadeFotos,0);
 assert.equal((await get(vitrineFoto,{Cookie:cookie})).status,404,
  'nem o operador visualiza foto de produto nao publicado');
 // A loja continua sem acesso publico e sem foto de rascunho.
 const docs=contas.documentos();
 await contas.cadastrar({nome:'Ana Exemplo',nick:'Ana',
  email:'ana@example.invalid',senha:'SenhaDeEnsaioSegura2026!',
  aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
  versaoPrivacidade:docs.privacidade.versao,
  hashPrivacidade:docs.privacidade.hash});
 const cliente=await fetch(base+'/api/contas/entrar',{
  method:'POST',headers:{Origin:ORIGEM,'Content-Type':'application/json'},
  body:JSON.stringify({nick:'Ana',senha:'SenhaDeEnsaioSegura2026!'})
 });
 assert.equal(cliente.status,200);
 const cookieCliente=cliente.headers.get('set-cookie').split(';')[0];
 assert.equal((await get(vitrineFoto,{Cookie:cookieCliente})).status,404);
 assert.equal((await get(adminFoto+'/fotos',{Cookie:cookieCliente})).status,401);
 midia.repo.atualizar({id:produto.id,revisaoEsperada:1,
  alteracoes:{estado:'PUBLICADO'}});
 const vitrine=await get('/api/loja/catalogo',{Cookie:cookieCliente});
 assert.equal(vitrine.status,200);
 const dados=await vitrine.json();
 assert.equal(dados.produtos.length,3);
 assert.deepEqual(dados.produtos.find(p=>p.produtoId==='SKU_ANTIGO').fotos,[]);
 assert.equal(dados.produtos.find(p=>p.produtoId===produto.id)
  .fotos[0].url,vitrineFoto);
 const bone=dados.produtos.find(p=>p.produtoId==='bone-cinza');
 assert.equal(bone.fotos.length,1);
 assert.equal(bone.fotos[0].posicao,10);
 const fotoBone=await get(bone.fotos[0].url,{Cookie:cookieCliente});
 assert.equal(fotoBone.status,200);
 assert.match(fotoBone.headers.get('content-type'),/^image\/png/);
 assert.ok(dados.produtos.every(p=>p.compravel===false));
 assert.ok(dados.produtos.every(p=>p.precoCentavos===null));
 const visivel=await get(vitrineFoto,{Cookie:cookieCliente});
 assert.equal(visivel.status,200);
 assert.equal((await get(vitrineFoto,{Cookie:cookie})).status,200,
  'operador pode consultar foto publicada sem sessao de cliente');
 assert.match(visivel.headers.get('content-type'),/^image\/png/);
 assert.ok((await visivel.arrayBuffer()).byteLength>60);
 assert.equal((await get('/api/checkout/finalizar',{Cookie:cookieCliente})).status,503);
 assert.equal((await get('/api/loja/produtos/'+produto.id+'/foto/11',
  {Cookie:cookieCliente})).status,404);
 assert.equal(banco.prepare('PRAGMA quick_check').get().quick_check,'ok');
 assert.equal(midia.repo.banco.prepare('PRAGMA quick_check').get().quick_check,'ok');
});
