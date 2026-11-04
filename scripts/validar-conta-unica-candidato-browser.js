'use strict';
// Browser verdadeiro PC/celular do candidato: cadastre, faça login,
// prepare pré-pedido e consulte Meus Pedidos sem PSP nem benefícios reais.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {chromium}=require('playwright');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {once}=require('node:events');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'akitemm-candidato-browser-'));
 const db=new DatabaseSync(path.join(dir,'candidato.sqlite'));
 db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL');
 const {app}=criarAppLojaEscritorioCandidato({
  banco:db,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  segredoOperador:'somente-teste-do-navegador-'+('x'.repeat(40)),
  termosVersao:'LAB-navegador-2026',
  termosTexto:'Prévia apenas para teste de acesso e pedido, sem pagamento ou posição real.'
 });
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 let browser;
 try{
  const base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  fs.mkdirSync(path.join(__dirname,'../artifacts'),{recursive:true});
  for(const item of [
   {nome:'pc',viewport:{width:1380,height:850},isMobile:false,nick:'Rita'},
   {nome:'celular',viewport:{width:390,height:844},isMobile:true,nick:'Lia'}
  ]){
   const context=await browser.newContext({
    viewport:item.viewport,isMobile:item.isMobile,deviceScaleFactor:1
   });
   const page=await context.newPage();
   const failures=[];
   page.on('pageerror',e=>failures.push(e.message));
   await page.goto(base+'/staging/cliente',{waitUntil:'networkidle'});
   await page.locator('#cadastroNome').fill(item.nick+' Exemplo');
   await page.locator('#cadastroNick').fill(item.nick);
   await page.locator('#cadastroEmail').fill(item.nick.toLowerCase()+'@example.invalid');
   await page.locator('#cadastroSenha').fill('SenhaFicticiaIsolada2026!');
   await page.locator('#cadastroTermos').check();
   await page.locator('#formCadastro button[type=submit]').click();
   await page.locator('#mensagem').filter({hasText:/Conta fictícia criada/}).waitFor();
   await page.locator('#login').fill(item.nick);
   await page.locator('#senha').fill('SenhaFicticiaIsolada2026!');
   await page.locator('#formLogin button[type=submit]').click();
   await page.locator('#painelConta').waitFor({state:'visible'});
   await page.locator('#calcularCotacao').click();
   await page.locator('#mensagem').filter({hasText:/Cotação conferida/}).waitFor();
   await page.locator('#prepararPedido').click();
   await page.locator('#mensagem').filter({hasText:/Pedidos e comunicados atualizados/}).waitFor();
   assert.equal(await page.locator('#listaPedidos article.pedido').count(),1);
   assert.match(await page.locator('#listaPedidos').innerText(),/R\$\s?250,00/);
   // Também verificar o Escritório do Administrador no MESMO SQLite.
   const admin=await context.newPage();
   admin.on('pageerror',e=>failures.push(e.message));
   await admin.goto(base+'/staging/escritorio-admin',{waitUntil:'networkidle'});
   await admin.locator('#token').fill('somente-teste-do-navegador-'+('x'.repeat(40)));
   await admin.locator('#formAcesso button').click();
   await admin.locator('#administracao').waitFor({state:'visible'});
   assert.match(await admin.locator('#pedidos').innerText(),/hom-/);
   await admin.locator('#titulo').fill('Revisar pedido do cliente');
   await admin.locator('#descricao').fill('Registrar o atendimento manual deste pré-pedido fictício.');
   await admin.locator('#pedido').selectOption({index:1});
   await admin.locator('#mensagem').fill('Registro de acompanhamento de laboratório para este pedido.');
   await admin.locator('#criarMissao button').click();
   await admin.locator('#estado').filter({hasText:/Missão criada/}).waitFor();
   assert.ok(await admin.locator('#listaMissoes article.pedido').count()>0);
   await admin.screenshot({path:path.join(__dirname,'../artifacts',
    'escritorio-admin-candidato-'+item.nome+'.png'),fullPage:true});
   await page.locator('#atualizarPedidos').click();
   await page.locator('#comunicadosCliente').filter({
    hasText:/Registro de acompanhamento de laboratório/
   }).waitFor();
   await admin.close();
   const screenshot=path.join(__dirname,'../artifacts',
    'conta-unica-candidato-'+item.nome+'.png');
   await page.screenshot({path:screenshot,fullPage:true});
   await page.reload({waitUntil:'networkidle'});
   await page.locator('#painelConta').waitFor({state:'visible'});
   assert.equal(await page.locator('#listaPedidos article.pedido').count(),1);
   assert.deepEqual(failures,[]);
   console.log('LOOP_CANDIDATO_BROWSER_'+item.nome.toUpperCase()+
    '=CADASTRO_LOGIN_PEDIDO_ESCRITORIO_COMPARTILHADO_SEM_FINANCEIRO_REAL');
   await context.close();
  }
 }finally{
  if(browser)await browser.close();
  await new Promise(done=>server.close(done));
  db.close();
  fs.rmSync(dir,{recursive:true,force:true});
 }
})().catch(e=>{console.error('LOOP_CANDIDATO_BROWSER_FALHOU',e);process.exitCode=1;});
