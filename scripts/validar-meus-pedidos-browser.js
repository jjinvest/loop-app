'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const {chromium}=require('playwright');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
const assert=require('node:assert/strict');
const {abrirLaboratorio}=require('./lib/laboratorio-http-asaas');

async function validarPosicaoIntegrada(browser,pasta){
 const m=await abrirLaboratorio(path.join(pasta,'posicao-http.sqlite'));
 try{
  const senha='senha-posicao-navegador-2026';
  const conta=m.contas.cadastrar({nome:'Cliente Posicao Integrada',
   email:'posicao-navegador@example.invalid',senha});
  let pedidoId;
  for(const [nome,viewport] of [['pc',{width:1280,height:900}],['celular',{width:390,height:844}]]){
   const contexto=await browser.newContext({viewport});
   try{
    const pagina=await contexto.newPage();
    await pagina.goto(m.base+'/laboratorio/participante');
    await pagina.locator('#nomeParticipante').fill(conta.nome);
    await pagina.locator('#senhaParticipante').fill(senha);
    await pagina.locator('#botaoEntrarParticipante').click();
    await pagina.locator('#conteudoParticipante').waitFor({state:'visible'});
    if(!pedidoId){
     const r=await contexto.request.post(m.base+'/api/laboratorio/participante/loja/pedidos',{
      headers:{'X-LOOP-LAB':'participante'},
      data:{itens:[{produtoId:'curso-lab-250',quantidade:1}]}});
     assert.equal(r.status(),201);pedidoId=(await r.json()).pedido.pedidoId;
     m.confirmar(pedidoId);await m.integracao.automatico.verificar();
    }
    await pagina.reload();
    await pagina.locator('#conteudoParticipante').waitFor({state:'visible'});
    if(viewport.width<600)await pagina.locator('#loop03Menu').click();
    await pagina.locator('[data-loop03-aba="posicoes"]').click();
    const pendente=pagina.locator('#loop03OpcoesPosicoes .loop03-status-confirmacao-pendente');
    await pendente.waitFor({state:'visible'});assert.equal(await pendente.count(),1);
    const resposta=await contexto.request.get(m.base+'/api/laboratorio/participante/minha-conta');
    assert.equal(resposta.status(),200);
    const visao=await resposta.json();
    assert.equal(visao.posicoes.length,1);assert.equal(visao.posicoes[0].statusAdesao,'PENDENTE');
    await pagina.screenshot({path:'artifacts/posicao-asaas-integrada-'+nome+'.png',fullPage:true});
   }finally{await contexto.close();}
  }
  assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM admin_ponte_compras_demo').get().n,1);
  console.log('COMPRA_HTTP_ASAAS_SIMULADO_POSICAO_NAVEGADOR_PC_CELULAR_OK');
  // Limite vigente: todas as dez posicoes do titular precisam ser acessiveis.
  const contexto=await browser.newContext({viewport:{width:1280,height:1000}});
  try{
   const pagina=await contexto.newPage();
   await pagina.goto(m.base+'/laboratorio/participante');
   await pagina.locator('#nomeParticipante').fill(conta.nome);
   await pagina.locator('#senhaParticipante').fill(senha);
   await pagina.locator('#botaoEntrarParticipante').click();
   await pagina.locator('#conteudoParticipante').waitFor({state:'visible'});
   for(let n=2;n<=10;n++){
    const r=await contexto.request.post(m.base+'/api/laboratorio/participante/loja/pedidos',{
     headers:{'X-LOOP-LAB':'participante'},data:{itens:[{produtoId:'curso-lab-250',quantidade:1}]}});
    assert.equal(r.status(),201);m.confirmar((await r.json()).pedido.pedidoId);
    await m.integracao.automatico.verificar();
   }
   await pagina.reload();await pagina.locator('#conteudoParticipante').waitFor({state:'visible'});
   await pagina.locator('[data-loop03-aba="posicoes"]').click();
   await pagina.locator('#loop03OpcoesPosicoes .loop03-cartao-posicao').nth(9).waitFor({state:'visible'});
   assert.equal(await pagina.locator('#loop03OpcoesPosicoes .loop03-cartao-posicao').count(),10);
   assert.equal(await pagina.locator('#loop03OpcoesPosicoes .loop03-status-confirmacao-pendente').count(),10);
   await pagina.screenshot({path:'artifacts/posicoes-dez-integradas-pc.png',fullPage:true});
   console.log('DEZ_POSICOES_DO_TITULAR_VISIVEIS_NAVEGADOR_OK');
  }finally{await contexto.close();}
 }finally{await m.fechar();}
}


async function validarEscritorio(browser,pasta){
 // Admin verdadeiro em Chromium sobre SQLite compartilhado e duas compras HTTP.
 // Um PSP desconhecido exige alerta, enquanto outra compra gera uma posicao.
 const m=await abrirLaboratorio(path.join(pasta,'escritorio-integrado.sqlite'));
 try{
  const senha='senha-escritorio-visual-laboratorio';
  const idPedidos=[];
  for(const [nome,email] of [
   ['Cliente Escritorio Confirmado','escritorio-confirmado@example.invalid'],
   ['Cliente Escritorio Revisao','escritorio-revisao@example.invalid']
  ]){
   const usuario=m.contas.cadastrar({nome,email,senha});
   const {cookie}=await m.http('/entrar',{body:{nome,senha}});
   const pedido=(await m.http('/loja/pedidos',{cookie,status:201,
    body:{itens:[{produtoId:'curso-lab-250',quantidade:1}]}})).data.pedido.pedidoId;
   idPedidos.push(pedido);
  }
  m.confirmar(idPedidos[0]);
  await m.integracao.conciliador.processar(idPedidos[0]);
  m.banco.prepare("UPDATE lab_psp_http_fixture SET status='FUTURE_PSP_STATUS' WHERE pedido=?")
   .run('LOOPLAB-'+idPedidos[1]);
  await m.integracao.cobrancas.conferir(idPedidos[1]);
  const antes=m.banco.prepare('SELECT total_changes() n').get().n;
  for(const [nome,viewport] of [
   ['pc',{width:1280,height:900}],['celular',{width:390,height:844}]
  ]){
   const contexto=await browser.newContext({viewport});
   try{
    const pagina=await contexto.newPage();
    await pagina.goto(m.base+'/admin/loop03');
    assert.equal(await pagina.locator('#dadosAdminLoop03').isHidden(),true);
    await pagina.locator('#chaveAdminLoop03').fill('administrador-local-ficticio-2026-123456789');
    await pagina.locator('#formAcessoAdminLoop03 button[type=submit]').click();
    await pagina.locator('#dadosAdminLoop03').waitFor({state:'visible',timeout:15000});
    assert.equal(await pagina.locator('#chaveAdminLoop03').inputValue(),'');
    assert.equal((await pagina.locator('#asaasCobrancasAdmin').innerText()).trim(),'2');
    assert.equal((await pagina.locator('#asaasRecebimentosAdmin').innerText()).trim(),'1');
    assert.equal((await pagina.locator('#asaasPedidosComPosicaoAdmin').innerText()).trim(),'1');
    assert.equal((await pagina.locator('#asaasStatusDesconhecidoAdmin').innerText()).trim(),'1');
    assert.equal((await pagina.locator('#asaasReconsultasDivergentesAdmin').innerText()).trim(),'0');
    assert.match(await pagina.locator('#asaasRevisaoGeralAdmin').innerText(),/SIM/);
    assert.equal((await pagina.locator('#clientesTotalDepartamento').innerText()).trim(),'2');
    assert.equal((await pagina.locator('#marcoZeroEstadoAdmin').innerText()).trim(),'NÃO LIBERADO');
    assert.equal((await pagina.locator('#marcoZeroExternosAdmin').innerText()).trim(),'6');
    assert.equal((await pagina.locator('#marcoZeroAlertasAdmin').innerText()).trim(),'1');
    assert.equal(await pagina.locator('#marcoZeroGatesExternosAdmin .status-linha').count(),6);
    const provisoes=pagina.locator('#marcoZeroTecnicosAdmin .status-linha')
      .filter({hasText:'Coerencia local de ciclos, eventos e parcelas previstas'});
    assert.equal(await provisoes.count(),1);
    assert.equal((await provisoes.locator('strong').innerText()).trim(),'SEM_OPERACOES');
    assert.match(await pagina.locator('#marcoZeroStatusAdmin').innerText(),/NÃO autorizados/);
    assert.equal((await pagina.locator('#clientesLoopDepartamento').innerText()).trim(),'1');
    assert.equal((await pagina.locator('#finOpCiclosAdmin').innerText()).trim(),'0');
    assert.match(await pagina.locator('#asaasBancoRealAdmin').innerText(),/Não homologada/);
    assert.match(await pagina.locator('#finOpBancarioAdmin').innerText(),/R\$ 0,00/);
    await pagina.screenshot({path:'artifacts/escritorio-integrado-'+nome+'.png',fullPage:true});
    await pagina.locator('#sairAdminLoop03').click();
    assert.equal(await pagina.locator('#dadosAdminLoop03').isHidden(),true);
    assert.equal(await pagina.locator('#situacaoPainel').innerText(),'SEM AUTENTICAÇÃO');
   }finally{await contexto.close();}
  }
  assert.equal(m.banco.prepare('SELECT total_changes() n').get().n,antes,
   'Navegar no Escritorio nao pode gravar operacoes');
  assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM admin_ponte_compras_demo').get().n,1);
  assert.equal(m.ponte._restaurar().giros,0);
  assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
  console.log('ESCRITORIO_PAGAMENTOS_CLIENTES_FINANCEIRO_CHROMIUM_PC_CELULAR_OK');
 }finally{await m.fechar();}
}

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
  await validarPosicaoIntegrada(browser,pasta);
  await validarEscritorio(browser,pasta);
 }finally{
  if(browser)await browser.close();
  servidor.kill('SIGTERM');
  fs.rmSync(pasta,{recursive:true,force:true});
 }
}
executar().catch(e=>{console.error(e);process.exitCode=1;});
