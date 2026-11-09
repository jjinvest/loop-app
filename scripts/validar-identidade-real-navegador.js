'use strict';
// Navegador REAL (Chromium PC/celular) sobre a interface aprovada.
// Identidade criada com dados ficticios e mesma sessao no Escritorio/AKITEMM.
// Nao usa banco de laboratorio, checkout, webhook, bancos nem Pix.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {chromium}=require('playwright');
const {MotorLoopIntegradoSQLite}=require('../src/producao/motor-loop-integrado-sqlite');
const {SessaoAdminComercialSQLite,COOKIE_ADMIN}=
 require('../src/producao/sessao-admin-comercial-sqlite');
const {CatalogoMultiDistribuidoresSQLite}=
 require('../src/producao/catalogo-multidistribuidores-sqlite');
const {ControleEconomicoLojaSQLite}=
 require('../src/producao/controle-economico-loja-sqlite');
const {AuditoriaOperacionalSQLite}=
 require('../src/producao/auditoria-operacional-sqlite');
const {ManutencaoComercialSQLite}=
 require('../src/producao/manutencao-comercial-sqlite');
const {IdentidadeClienteLoopReal,COOKIE}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {criarAppIdentidadeLoop}=
 require('../src/producao/servidor-identidade-loop');

const TEXTO='Termos para uma conta de teste de navegação da Loja AKITEMM e do '+
 'Escritório LOOP: os dados deste ensaio são fictícios, os recursos de compras '+
 'e benefícios financeiros reais não estão habilitados, e nenhuma posição real '+
 'nem transferência bancária será realizada. Não é contrato de produção.';
async function main(){
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 const contas=new IdentidadeClienteLoopReal({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TERMO-2026',texto:TEXTO},
  privacidade:{versao:'LOOP-PRIVACIDADE-2026',texto:TEXTO},
  enviarEmail:async()=>true
 });
 const docs=contas.documentos(),nick='DozeLetrasAB';
 assert.equal(nick.length,12);
 const cliente=await contas.cadastrar({
  nome:'Pessoa de Ensaio',nick,email:'teste@example.invalid',
  senha:'SenhaDoEnsaio2026!',aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
  versaoPrivacidade:docs.privacidade.versao,
  hashPrivacidade:docs.privacidade.hash
 });
 const motorLoop=new MotorLoopIntegradoSQLite({banco});
 motorLoop.registrarCompraEnsaio({
  titularId:cliente.titularId,pedidoId:'pedido-browser'
 });
 const auditoria=new AuditoriaOperacionalSQLite({
  banco,chaveAuditoria:randomBytes(32)
 });
 const manutencao=new ManutencaoComercialSQLite({banco,auditoria});
 const catalogo=new CatalogoMultiDistribuidoresSQLite({
  banco,distribuidorHomologado:()=>false,auditoria,manutencao
 });
 const controle=new ControleEconomicoLojaSQLite({banco,auditoria,manutencao});
 const sessoes=new SessaoAdminComercialSQLite({banco,
  chaveAdmin:randomBytes(32),
  credencialAdmin:'CredencialAdministrativaIsolada2026!Teste'
 });
 const admin=sessoes.autenticar('CredencialAdministrativaIsolada2026!Teste');
 const login=await contas.entrar({nick,senha:'SenhaDoEnsaio2026!'});
 const app=criarAppIdentidadeLoop({
  contas,motorLoop,origemHttps:'https://contas.example.invalid',
  permitirCadastro:true,
  adminComercial:{auditoria,manutencao,catalogo,controle,sessoes}
 });
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 let browser=null;
 try{
  const pasta=path.join(process.cwd(),'artifacts');
  fs.mkdirSync(pasta,{recursive:true});
  browser=await chromium.launch({headless:true});
  for(const item of [
   {nome:'pc',largura:1440,altura:900},
   {nome:'celular',largura:390,altura:844}
  ]){
   const contexto=await browser.newContext({
    viewport:{width:item.largura,height:item.altura},
    deviceScaleFactor:1
   });
   // Localhost é HTTP no ensaio; o cookie de prova é injetado SOMENTE
   // no navegador de teste. O login real em produção usa HTTPS+Secure.
   await contexto.addCookies([{
    name:COOKIE,value:login.token,url:base,
    httpOnly:true,secure:false,sameSite:'Strict'
   },{
    name:COOKIE_ADMIN,value:admin.token,url:base,
    httpOnly:true,secure:false,sameSite:'Strict'
   }]);
   const page=await contexto.newPage();
   page.setDefaultTimeout(15000);
   await page.goto(base+'/escritorio',{waitUntil:'domcontentloaded'});
   await page.locator('#painelConta').waitFor({state:'visible'});
   assert.equal(await page.locator('#cadastroNick').getAttribute('maxlength'),'12');
   assert.equal(await page.locator('#login').getAttribute('maxlength'),'12');
   assert.equal(await page.locator('#perfilCliente').isVisible(),true);
   assert.match(await page.locator('#perfilCliente').innerText(),/dozeletrasab/);
   const menuLoja=page.locator('.loop03-atalho-loja');
   const barraLoja=page.locator('.barra-conta a.loop03-loja-prata');
   assert.equal(await menuLoja.getAttribute('href'),'/loja');
   assert.equal(await barraLoja.getAttribute('href'),'/loja');
   assert.equal(await page.locator('#abaFinanceiro').isDisabled(),true);
   assert.equal(await page.locator('#abaTabuleiro').isDisabled(),false);
   assert.equal(await page.locator('#abaPosicoes').isDisabled(),false);
   await page.locator('#loopResumoMotor').filter({hasText:/Fila B: 1/}).waitFor();
   await page.locator('#abaTabuleiro').click();
   await page.locator('#conteudoTabuleiroEstadoMotor')
    .filter({hasText:/Eventos do ciclo: 0\/6/}).waitFor();
   await page.locator('#abaPosicoes').click();
   await page.locator('#conteudoPosicoesEstadoMotor')
    .filter({hasText:/#1 \(FILA_B\)/}).waitFor();
   await page.locator('#abaConta').click();
   assert.equal(await page.locator('#painelIdentidadeTeste').isHidden(),true);
   await page.screenshot({
    path:path.join(pasta,'identidade-real-escritorio-'+item.nome+'.png'),
    fullPage:true
   });
   await barraLoja.click();
   await page.waitForURL(url=>url.pathname==='/loja');
   await page.locator('#conteudoLojaLoop').waitFor({state:'visible'});
   assert.equal(await page.locator('#akitemmNomeTitular').innerText(),
    nick.toLowerCase());
   assert.equal(await page.locator('#registrarPedidoLoja').isDisabled(),true);
   assert.equal(await page.locator('#akitemmBusca').isDisabled(),true);
   assert.match(await page.locator('#statusPedidoLoja').innerText(),
    /checkout real ainda não foi liberado/i);
   assert.equal(await page.locator('#catalogoLojaLoop').innerText(),'');
   assert.match(await page.locator('#estadoLojaLoop').innerText(),
    /conta LOOP.*Vendas reais ainda não liberadas/i);
   await page.screenshot({
    path:path.join(pasta,'identidade-real-loja-'+item.nome+'.png'),
    fullPage:true
   });
   await page.locator('a.akitemm-voltar').click();
   await page.waitForURL(url=>url.pathname==='/escritorio');
   await page.locator('#painelConta').waitFor({state:'visible'});
   // A tela administrativa consulta a MESMA base e exige outro cookie.
   await page.goto(base+'/administrador',{waitUntil:'domcontentloaded'});
   await page.locator('#loopAdminEstado')
    .filter({hasText:/Fila B: 1/}).waitFor();
   assert.equal(await page.locator('#atualizarLoopAdmin').isVisible(),true);
   await page.screenshot({
    path:path.join(pasta,'identidade-real-admin-'+item.nome+'.png'),
    fullPage:true
   });
   await contexto.close();
  }
  assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  console.log('NAVEGADOR_IDENTIDADE_REAL=PC_E_CELULAR_APROVADOS_SEM_CHECKOUT');
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
  banco.close();
 }
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1});
