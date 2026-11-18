'use strict';
// JORNADA TECNICA DESCARTAVEL DA INTERFACE REAL.
// Comeca com ZERO produtos em banco efemero; NAO cadastra mercadoria AKITEMM,
// NAO toca Railway, NAO cria pagamento, saldo, pedido ou posicao LOOP.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const https=require('node:https');
const {once}=require('node:events');
const {execFileSync}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {chromium}=require('playwright');
const {IdentidadeClienteLoopReal}=require('../src/producao/identidade-cliente-loop-sqlite');
const {CatalogoMultiDistribuidoresSQLite}=require('../src/producao/catalogo-multidistribuidores-sqlite');
const {ControleEconomicoLojaSQLite}=require('../src/producao/controle-economico-loja-sqlite');
const {SessaoAdminComercialSQLite}=require('../src/producao/sessao-admin-comercial-sqlite');
const {AuditoriaOperacionalSQLite}=require('../src/producao/auditoria-operacional-sqlite');
const {ManutencaoComercialSQLite}=require('../src/producao/manutencao-comercial-sqlite');
const {criarCatalogoMercadoriasReal}=require('../src/producao/catalogo-mercadorias-real');
const {criarAppIdentidadeLoop}=require('../src/producao/servidor-identidade-loop');
const FOTO=Buffer.from(
 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DAAMIM/4EAAB/uBfsL2WiLAAAAAElFTkSuQmCC',
 'base64');
const SENHA='OperadorDeTesteIsoladoUnico-2026-MuitoLongo';
const DOC='Documentos da conta descartavel usados somente para verificar o registro do primeiro produto na interface, com pagamentos inteiramente desabilitados.';

async function principal(){
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-operador-zero-'));
 const chave=path.join(pasta,'https.key');
 const cert=path.join(pasta,'https.crt');
 execFileSync('openssl',['req','-x509','-nodes','-newkey','rsa:2048',
  '-keyout',chave,'-out',cert,'-days','1','-subj','/CN=127.0.0.1',
  '-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 let app,server,browser;
 let midia,catalogo;
 try{
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
  catalogo=new CatalogoMultiDistribuidoresSQLite({
   banco,auditoria,manutencao,distribuidorHomologado:()=>false
  });
  const controle=new ControleEconomicoLojaSQLite({banco,auditoria,manutencao});
  const sessoes=new SessaoAdminComercialSQLite({
   banco,chaveAdmin:randomBytes(32),credencialAdmin:SENHA
  });
  midia=criarCatalogoMercadoriasReal({
   arquivo:path.join(pasta,'catalogo.sqlite'),
   tokenRaiz:'f'.repeat(64),
   buscarProdutoCompartilhado:id=>
    catalogo.buscarProdutoAdministrativo({produtoId:id})
  });
  const catalogoMidiaLeitura={
   banco:midia.repo.banco,
   listarVitrinePreparacao:args=>midia.listarVitrinePreparacao(args),
   listarFotosProdutoCompartilhado:args=>
    midia.listarFotosProdutoCompartilhado(args),
   abrirFotoPublicada:args=>midia.abrirFotoPublicada(args)
  };
  server=https.createServer({
   key:fs.readFileSync(chave),cert:fs.readFileSync(cert)
  },(req,res)=>app(req,res));
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const base='https://127.0.0.1:'+server.address().port;
  app=criarAppIdentidadeLoop({
   contas,origemHttps:base,permitirCadastro:false,
   catalogoVitrine:{
    banco,listarVitrinePreparacao:args=>catalogo.listarVitrinePreparacao(args)
   },
   catalogoMidiaLeitura,
   adminComercial:{
    sessoes,controle,catalogo,auditoria,manutencao,catalogoMidia:midia
   }
  });
  browser=await chromium.launch({headless:true});
  const ctx=await browser.newContext({
   ignoreHTTPSErrors:true,
   viewport:{width:390,height:844},deviceScaleFactor:1,
   isMobile:true,hasTouch:true
  });
  const page=await ctx.newPage();
  page.setDefaultTimeout(12000);
  await page.goto(base+'/escritorio',{waitUntil:'domcontentloaded'});
  const token=await page.evaluate(async senha=>{
   const res=await fetch('/api/operador/entrar',{
    method:'POST',headers:{'Content-Type':'application/json'},
    credentials:'same-origin',body:JSON.stringify({nick:'operador',senha})
   });
   if(!res.ok)throw Error('LOGIN_OPERADOR_FALHOU_'+res.status);
   return (await res.json()).operador;
  },SENHA);
  assert.equal(token,true);
  await page.goto(base+'/loja',{waitUntil:'domcontentloaded'});
  await page.locator('#conteudoLojaLoop').waitFor({state:'visible'});
  await page.locator('#akitemmOperadorMais').waitFor({state:'visible'});
  const vazio=await page.evaluate(async()=>{
   const res=await fetch('/api/loja/catalogo',{credentials:'same-origin'});
   if(!res.ok)throw Error('CATALOGO_INDISPONIVEL_'+res.status);
   return res.json();
  });
  assert.equal(vazio.produtos.length,0);
  assert.equal(vazio.total,0);
  assert.equal(vazio.checkoutReal,false);
  assert.equal(await page.locator('#catalogoLojaLoop .akitemm-slot-vazio').count(),20);
  assert.equal(await page.locator('#catalogoLojaLoop [data-produto-id]').count(),0);
  // Primeiro clique: abre o operador no MESMO quadradinho aprovado.
  await page.locator('#catalogoLojaLoop [data-akitemm-slot="1"]').click();
  await page.locator('#akitemmOperadorFotosReal[open]').waitFor();
  await page.locator('#akitemmOperadorFotosReal').getByText(
   'Nenhum produto cadastrado: crie o primeiro abaixo.'
  ).waitFor();
  const m=page.locator('#akitemmOperadorFotosReal');
  await m.locator('input[type=text]').first().fill('primeiro-produto');
  await m.locator('input[type=text]').nth(1).fill('Produto de ensaio de operador');
  await m.locator('textarea').first().fill('Descricao de teste temporaria');
  await m.getByRole('button',{name:'Cadastrar produto'}).click();
  await m.getByRole('heading',{name:'Editar produto · primeiro-produto'}).waitFor();
  const produto=catalogo.buscarProdutoAdministrativo({
   produtoId:'primeiro-produto'
  });
  assert.equal(produto.titulo,'Produto de ensaio de operador');
  assert.equal(produto.ativo,false);
  const mapa=await page.evaluate(async()=>{
   const res=await fetch('/api/admin/catalogo-midia/slots',{
    credentials:'same-origin'
   });
   if(!res.ok)throw Error('MAPA_DO_OPERADOR_INDISPONIVEL');
   return res.json();
  });
  assert.equal(mapa.total,400);
  assert.equal(mapa.slots.length,1);
  assert.equal(mapa.slots[0].posicao,1);
  // Foto enviada pela mesma sessao, pela interface que o usuario toca.
  await m.locator('input[type=file]').setInputFiles({
   name:'imagem-prova.png',mimeType:'image/png',buffer:FOTO
  });
  await m.getByRole('button',{name:'Salvar foto do produto'}).click();
  await m.waitFor({state:'hidden'});
  const foto=midia.fotos.listar('primeiro-produto');
  assert.equal(foto.fotos.length,1);
  assert.equal(foto.fotos[0].posicao,1);
  // Produto RASCUNHO deve ficar oculto ao comprador até publicação legítima.
  const aindaVazio=await page.evaluate(async()=>{
   const res=await fetch('/api/loja/catalogo',{credentials:'same-origin'});
   return res.json();
  });
  assert.equal(aindaVazio.produtos.length,0);
  // Publicacao abaixo e somente no SQLite DESCARTAVEL de teste.
  catalogo.ativarProduto({produtoId:'primeiro-produto',ativo:true});
  await page.locator('#atualizarCatalogoLoja').click();
  await page.locator('#catalogoLojaLoop [data-produto-id="primeiro-produto"]').waitFor();
  const publicado=await page.evaluate(async()=>{
   const res=await fetch('/api/loja/catalogo',{credentials:'same-origin'});
   return res.json();
  });
  assert.equal(publicado.produtos.length,1);
  assert.equal(publicado.produtos[0].precoCentavos,null);
  assert.equal(publicado.produtos[0].compravel,false);
  assert.equal(publicado.checkoutReal,false);
  assert.equal(publicado.produtos[0].fotos.length,1);
  assert.equal((await page.request.get(
   base+publicado.produtos[0].fotos[0].url,{
    ignoreHTTPSErrors:true
   })).status(),200);
  assert.equal(await page.locator('#registrarPedidoLoja').isDisabled(),true);
  assert.equal(banco.prepare('PRAGMA quick_check').get().quick_check,'ok');
  console.log('OPERADOR_VITRINE_REAL_VALIDADO_EM_BANCO_DESCARTAVEL: ZERO -> RASCUNHO -> FOTO -> PUBLICADO_SEM_COMPRA');
 }finally{
  if(browser)await browser.close();
  if(server)await new Promise(ok=>server.close(ok));
  if(midia)midia.fechar();
  banco.close();
  fs.rmSync(pasta,{recursive:true,force:true});
 }
}
principal().catch(e=>{
 console.error('FALHA_OPERADOR_ZERO_PRODUTOS: '+(e?.stack||String(e)));
 process.exitCode=1;
});
