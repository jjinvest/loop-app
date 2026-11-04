'use strict';
// Chromium sobre HTTP/SQLite locais; PSP inteiramente ficticio, sem rede externa.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomBytes}=require('node:crypto'),{once}=require('node:events');
const {DatabaseSync}=require('node:sqlite');
const {chromium}=require('playwright');
const {criarAppLojaEscritorioCandidato}=require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=require('../src/laboratorio/servidor-checkout-staging-local');
const {cotarCheckoutPublico}=require('../src/domain/cotacao-checkout-publico');
const {COOKIE}=require('../src/domain/conta-unica-candidata-sqlite');
(async()=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-convergencia-browser-'));
 const banco=new DatabaseSync(path.join(pasta,'convergencia.sqlite'));
 banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL');
 const adminToken='operador-ficticio-convergencia-'+('X'.repeat(48));
 const webhookToken='callback-ficticio-convergencia-'+('Y'.repeat(48));
 let status='RECEIVED',gets=0,prepedidoId;
 const pagamentoId='pay_CONVERGENCIABROWSER01';
 const provedor={ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  async criarCobrancaPix(){return {ambiente:this.ambiente,pagamentoId,valorCentavos:25000,status:'PENDING'};},
  async consultarCobranca(){gets++;return {pagamentoId,status,valorCentavos:25000,
   billingType:'PIX',externalReference:'LOOPLAB-'+prepedidoId,clienteAsaasId:'cus_CONVERGENCIABROWSER01'};}
 };
 const catalogo=catalogoFicticioCheckout();
 const m=criarAppLojaEscritorioCandidato({banco,repositorioCatalogo:catalogo,
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),segredoOperador:adminToken,
  webhookHomologacaoToken:webhookToken,provedorReconsultaSandbox:provedor,
  operacoesSandboxAutorizadas:true,termosVersao:'LAB-convergencia-browser',
  termosTexto:'Ensaio ficticio sem direitos, pagamentos ou posicoes reais.'});
 let server,browser;
 try{
  const senha='SenhaFicticiaConvergencia2026!';
  const conta=await m.contas.cadastrar({nome:'Cliente Convergencia',nick:'Nara',
   email:'convergencia@example.invalid',senha,aceiteExplicito:true,
   termosVersao:'LAB-convergencia-browser',
   termosTexto:'Ensaio ficticio sem direitos, pagamentos ou posicoes reais.'});
  const sessao=await m.contas.entrar({nick:'Nara',senha});
  await m.sinalizacaoVitrine.atualizar('curso-homologacao-250',{
   classificacao:'VERDE',quantidadeMinimaLoop:1,revisaoEsperada:0});
  const entrada={itens:[{produtoId:'curso-homologacao-250',quantidade:1}]};
  const cotacao=await cotarCheckoutPublico({repositorio:catalogo,entrada});
  const draft=m.intencoes.criar({titularId:conta.titularId,
   chaveIdempotencia:'convergencia-browser-001',entrada,cotacao});
  prepedidoId=(await m.prePedidos.preparar({titularId:conta.titularId,
   rascunhoId:draft.intencao.pedidoId,repositorioCatalogo:catalogo})).prepedido.prepedidoId;
  m.ponte.preparar({titularId:conta.titularId,prepedidoId,clienteAsaasId:'cus_CONVERGENCIABROWSER01'});
  await m.ponte.enviarUmaVez({titularId:conta.titularId,prepedidoId,provedor,execucaoLiberada:true});
  const eventoId='evt_CONVERGENCIABROWSER01';
  m.inbox.registrar({cabecalhoToken:webhookToken,corpoBruto:Buffer.from(JSON.stringify({
   id:eventoId,event:'PAYMENT_RECEIVED',payment:{id:pagamentoId,status:'RECEIVED',
    billingType:'PIX',value:250,externalReference:'LOOPLAB-'+prepedidoId}}))});
  await m.worker.processar({eventoId,provedor,execucaoLiberada:true});
  m.posicoes.projetar({titularId:conta.titularId,prepedidoId,eventoId,execucaoLiberada:true});
  server=m.app.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  fs.mkdirSync('artifacts',{recursive:true});
  for(const [nome,viewport] of [['pc',{width:1380,height:850}],['celular',{width:390,height:844}]]){
   status='RECEIVED';await m.ponte.conferir({titularId:conta.titularId,prepedidoId,provedor});
   const contexto=await browser.newContext({viewport});
   try{
    await contexto.addCookies([{name:COOKIE,value:sessao.token,url:base,sameSite:'Strict'}]);
    const cliente=await contexto.newPage(),admin=await contexto.newPage(),erros=[];
    cliente.on('pageerror',e=>erros.push(e.message));admin.on('pageerror',e=>erros.push(e.message));
    const getsAntes=gets;
    await cliente.goto(base+'/staging/cliente');
    await cliente.locator('#painelConta').waitFor({state:'visible'});
    await cliente.locator('#abaMeusPedidos').click();
    await cliente.locator('#listaPedidos').filter({hasText:/Pagamento fictício conferido/}).waitFor();
    await admin.goto(base+'/staging/escritorio-admin');
    await admin.locator('#token').fill(adminToken);
    await admin.locator('#formAcesso button').click();
    await admin.locator('#administracao').waitFor({state:'visible'});
    const conciliados=admin.locator('#indicadores .indicador').filter({hasText:'PSP conciliados'}).locator('strong');
    await conciliados.filter({hasText:/^1$/}).waitFor();
    assert.equal(gets,getsAntes,'navegacao nao consulta PSP');
    status='PENDING';await m.ponte.conferir({titularId:conta.titularId,prepedidoId,provedor});
    const consultasAntes=gets,mudancasAntes=banco.prepare('SELECT total_changes() n').get().n;
    await cliente.locator('#atualizarPedidos').click();
    await cliente.locator('#listaPedidos').filter({hasText:/Revisão manual obrigatória/}).waitFor();
    assert.doesNotMatch(await cliente.locator('#listaPedidos').innerText(),/Pagamento fictício conferido/);
    await admin.locator('#atualizar').click();
    await conciliados.filter({hasText:/^0$/}).waitFor();
    const historico=admin.locator('#indicadores .indicador').filter({hasText:'Posições fictícias'}).locator('strong');
    assert.equal((await historico.innerText()).trim(),'1');
    assert.equal(gets,consultasAntes);assert.equal(banco.prepare('SELECT total_changes() n').get().n,mudancasAntes);
    assert.deepEqual(erros,[]);
    await cliente.screenshot({path:'artifacts/convergencia-psp-cliente-'+nome+'.png',fullPage:true});
    await admin.screenshot({path:'artifacts/convergencia-psp-admin-'+nome+'.png',fullPage:true});
    // O teto da previa global nao pode derrubar o resto do Escritorio.
    // A massa artificial e descartada; nao representa compras homologadas.
    banco.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
    try{
     const inserir=banco.prepare(`INSERT INTO akitemm_prepedido_posicoes_pendentes_sandbox_staging
      (id,prepedido_id,titular_id,pagamento_id,evento_id,valor_centavos,estado,criado_em)
      VALUES(?,?,?,?,?,25000,'PENDENTE_DE_CONFIRMACAO_CLIENTE_SANDBOX',?)`);
     for(let i=0;i<1001;i++)inserir.run('pos-volume-'+i,
      'hom-'+String(i).padStart(36,'0'),'titular-00000000-0000-0000-0000-000000000001',
      'pay_VOLUME'+i,'evt_VOLUME'+i,'2026-11-04T00:00:00.000Z');
     const antes=banco.prepare('SELECT total_changes() n').get().n;
     await admin.locator('#atualizar').click();
     await admin.locator('#resumoPreviaFilas').filter({hasText:/indisponível acima de 1.000/}).waitFor();
     assert.equal(await admin.locator('#posicoesPreviaFilas').locator(':scope > *').count(),0);
     assert.equal(await admin.locator('#quadroDepartamentos button').count(),12);
     assert.equal((await conciliados.innerText()).trim(),'0');
     assert.equal(await admin.locator('#administracao').isVisible(),true);
     await admin.locator('#historicoPosicoesAtualizar').click();
     await admin.locator('#resumoHistoricoPosicoes').filter({hasText:/Página 1 · 25 registro/}).waitFor();
     const primeiro=await admin.locator('#historicoPosicoes').innerText();
     await admin.locator('#historicoPosicoesProximo').click();
     await admin.locator('#resumoHistoricoPosicoes').filter({hasText:/Página 2 · 25 registro/}).waitFor();
     assert.notEqual(await admin.locator('#historicoPosicoes').innerText(),primeiro);
     await admin.locator('#historicoPosicoesAnterior').click();
     await admin.locator('#resumoHistoricoPosicoes').filter({hasText:/Página 1 · 25 registro/}).waitFor();
     assert.equal(await admin.locator('#historicoPosicoes').innerText(),primeiro);
     await admin.locator('#historicoPosicoes').scrollIntoViewIfNeeded();
     await admin.screenshot({path:'artifacts/historico-posicoes-paginado-'+nome+'.png',fullPage:true});
     const respostaCliente=cliente.waitForResponse(r=>
      r.url().endsWith('/staging/minha-previa-filas')&&r.status()===200);
     await cliente.locator('#atualizarPedidos').click();
     await respostaCliente;
     await cliente.locator('#mensagem').filter({hasText:/Pedidos e comunicados atualizados/}).waitFor();
     assert.equal(await cliente.locator('#listaPedidos article.pedido').count(),1);
     assert.equal(banco.prepare('SELECT total_changes() n').get().n,antes);
     assert.equal(gets,consultasAntes);assert.deepEqual(erros,[]);
    }finally{banco.exec('ROLLBACK; PRAGMA foreign_keys=ON');}
   }finally{await contexto.close();}
  }
  assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
  console.log('LOOP_CONVERGENCIA_PSP_BROWSER_PC_CELULAR_OK');
 }finally{
  if(browser)await browser.close();
  if(server)await new Promise(r=>server.close(r));
  banco.close();fs.rmSync(pasta,{recursive:true,force:true});
 }
})().catch(e=>{console.error('LOOP_CONVERGENCIA_PSP_BROWSER_FALHOU',e);process.exitCode=1;});
