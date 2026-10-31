'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const {chromium}=require('playwright');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');

async function executar(){
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-pedidos-browser-'));
 const arquivo=path.join(pasta,'clientes.sqlite');
 const banco=new DatabaseSync(arquivo);
 const contas=new ContasParticipantesDemoSQLite({banco});
 const pedidos=new PedidosTitularidadeDemoSQLite({banco,contas});
 const conta=contas.cadastrar({nome:'Cliente de Homologacao',email:'homologacao@example.invalid',senha:'SenhaLaboratorio123'});
 pedidos.preparar({pedidoId:'PEDIDO-HOMOLOGACAO-250',contaId:conta.contaId,produtoId:'curso-pdf',valorCentavos:25000});
 banco.close();
 const porta=34567;
 const servidor=spawn(process.execPath,['src/server.js'],{env:{...process.env,PORT:String(porta),LOOP_CLIENTES_LAB:'SIM',LOOP_CLIENTES_LAB_SQLITE:arquivo},stdio:'pipe'});
 let browser;
 try{
  let pronto=false;
  for(let i=0;i<70;i++){
   if(servidor.exitCode!==null)throw Error('Servidor encerrou antes de iniciar');
   try{const r=await fetch('http://127.0.0.1:'+porta+'/health');if(r.ok){pronto=true;break;}}catch{}
   await new Promise(r=>setTimeout(r,200));
  }
  if(!pronto)throw Error('Servidor nao iniciou');
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1});
  await page.goto('http://127.0.0.1:'+porta+'/cliente-demo.html');
  await page.locator('#abrirPedidos').click();
  await page.locator('#cadastroClienteLab [name=nome]').fill('Cliente Novo Navegador');
  await page.locator('#cadastroClienteLab [name=email]').fill('navegador@example.invalid');
  await page.locator('#cadastroClienteLab [name=senha]').fill('SenhaNovaNavegador123');
  await page.locator('#cadastroClienteLab button[type=submit]').click();
  await page.getByText('Conta de laboratorio cadastrada.').waitFor({timeout:10000});
  if(await page.locator('#loginClienteLab [name=nome]').inputValue()!=='Cliente Novo Navegador')
    throw Error('Cadastro nao preencheu o nome no login');
  await page.locator('#loginClienteLab [name=nome]').fill('Cliente de Homologacao');
  await page.locator('#loginClienteLab [name=senha]').fill('SenhaLaboratorio123');
  await page.locator('#loginClienteLab button[type=submit]').click();
  await page.getByText('PEDIDO-HOMOLOGACAO-250').waitFor({timeout:10000});
  const texto=await page.locator('#listaPedidos').innerText();
  if(!texto.includes('R$ 250,00')&&!texto.includes('R$ 250,00'))throw Error('Valor nao exibido: '+texto);
  fs.mkdirSync('artifacts',{recursive:true});
  await page.screenshot({path:'artifacts/meus-pedidos-real.png',fullPage:true});
  console.log('MEUS_PEDIDOS_BROWSER_SQLITE_OK');
 }finally{
  if(browser)await browser.close();
  servidor.kill('SIGTERM');
  fs.rmSync(pasta,{recursive:true,force:true});
 }
}
executar().catch(e=>{console.error(e);process.exitCode=1;});
