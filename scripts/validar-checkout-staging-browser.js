'use strict';
// Prova real de UI em Chromium PC/celular no servidor do checkout staging.
// Conta, pedido e produto ficticios. NAO entrega ou autoriza pagamento.
const {chromium}=require('playwright');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {criarAppCheckoutStagingLocal,provisionarContaEnsaio}=
 require('../src/laboratorio/servidor-checkout-staging-local');
async function executar(){
 if(process.env.NODE_ENV==='production')
  throw Error('BROWSER_STAGING_PROIBIDO_EM_PRODUCAO');
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-staging-ui-browser-'));
 const arquivo=path.join(pasta,'contas.sqlite');
 const login='conta-browser-staging',senha='SenhaFicticiaClienteBrowser2026!';
 let db=null,servidor=null,browser=null;
 try{
  await provisionarContaEnsaio({arquivo,nomeLogin:login,senha,autorizado:true});
  db=new DatabaseSync(arquivo);
  db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;');
  const {app}=criarAppCheckoutStagingLocal({banco:db});
  servidor=app.listen(0,'127.0.0.1');
  await once(servidor,'listening');
  const base='http://127.0.0.1:'+servidor.address().port;
  browser=await chromium.launch({headless:true});
  fs.mkdirSync('artifacts',{recursive:true});
  for(const [nome,viewport] of [
   ['pc',{width:1280,height:900}],
   ['celular',{width:390,height:844}]
  ]){
   const contexto=await browser.newContext({viewport});
   const erros=[];
   try{
    const pagina=await contexto.newPage();
    pagina.on('pageerror',e=>erros.push(e.message));
    await pagina.goto(base+'/staging/cliente');
    await pagina.getByText('Entre com uma conta de teste provisionada pelo operador.').waitFor();
    assert.equal(await pagina.locator('dialog').count(),0,'Meus Pedidos e aba, nao popup');
    assert.equal(await pagina.locator('#painelLogin').isVisible(),true);
    await pagina.locator('#login').fill(login);
    await pagina.locator('#senha').fill(senha);
    await pagina.locator('#formLogin button[type=submit]').click();
    await pagina.locator('#painelConta').waitFor({state:'visible'});
    const tab=pagina.getByRole('tab',{name:'Meus Pedidos'});
    await tab.click();
    await pagina.locator('#conteudoMeusPedidos').waitFor({state:'visible'});
    if(nome==='pc'){
     await pagina.getByRole('tab',{name:'Preparar pedido'}).click();
     await pagina.getByRole('button',{name:'Conferir cotação'}).click();
     await pagina.getByText('Total da cotação fictícia: R$ 250,00').waitFor();
     await pagina.getByRole('button',{name:'Preparar pré-pedido de teste'}).click();
     await pagina.locator('.pedido').first().waitFor();
     const texto=await pagina.locator('#listaPedidos').innerText();
     assert.match(texto,/250,00/);
     assert.match(texto,/sem cobrança/i);
    }else{
     await pagina.locator('.pedido').first().waitFor();
     const texto=await pagina.locator('#listaPedidos').innerText();
     assert.match(texto,/250,00/);
     assert.match(texto,/sem cobrança/i);
     const largura=await pagina.evaluate(()=>({
      viewport:window.innerWidth,documento:document.documentElement.scrollWidth
     }));
     assert.ok(largura.documento<=largura.viewport+2,
      'pagina deve caber no celular: '+JSON.stringify(largura));
    }
    assert.equal(await tab.getAttribute('aria-selected'),'true');
    await pagina.screenshot({
     path:'artifacts/checkout-staging-meus-pedidos-'+nome+'.png',fullPage:true
    });
    await pagina.reload();
    await pagina.locator('#conteudoMeusPedidos').waitFor({state:'visible'});
    await pagina.locator('.pedido').first().waitFor();
    assert.equal(await pagina.locator('.pedido').count(),1);
    assert.equal(await pagina.locator('#painelLogin').isHidden(),true);
    assert.deepEqual(erros,[]);
   }finally{await contexto.close();}
  }
  const q=db.prepare('PRAGMA integrity_check').get();
  assert.equal(q.integrity_check,'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare(
   'SELECT COUNT(*) AS n FROM akitemm_checkout_prepedidos_staging'
  ).get().n,1);
  assert.equal(db.prepare(
   'SELECT COUNT(*) AS n FROM akitemm_prepedido_asaas_sandbox_staging'
  ).get().n,0,'nenhuma cobranca Sandbox nem real pela UI');
  console.log('CHECKOUT_STAGING_UI_ABA_MEUS_PEDIDOS_PC_CELULAR_HTTP_SQLITE_OK');
 }finally{
  if(browser)await browser.close();
  if(servidor)await new Promise(resolve=>servidor.close(resolve));
  if(db)db.close();
  fs.rmSync(pasta,{recursive:true,force:true});
 }
}
executar().catch(e=>{console.error(e);process.exitCode=1;});
