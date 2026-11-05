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
  chaveCpfHmac:randomBytes(32),chaveCpfCifra:randomBytes(32),
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
   // A navegacao aprovada e lateral no PC, e em menu recolhido no celular.
   async function abrirAba(id){
    if(item.isMobile){
     const menu=page.locator('#loop03MenuIntegrado');
     if(await menu.getAttribute('aria-expanded')!=='true')await menu.click();
    }
    await page.locator(id).click();
   }
   const failures=[];
   page.on('pageerror',e=>failures.push(e.message));
   await page.goto(base+'/staging/cliente',{waitUntil:'networkidle'});
   assert.equal(await page.locator('#painelLogin').isHidden(),true);
   assert.equal(await page.locator('#painelCadastro').isVisible(),true);
   await page.locator('#mudarParaLogin').click();
   await page.locator('#painelLogin').waitFor({state:'visible'});
   await page.locator('#mudarParaCadastro').click();
   await page.locator('#painelCadastro').waitFor({state:'visible'});
   await page.locator('#cadastroNome').fill(item.nick+' Exemplo');
   await page.locator('#cadastroNick').fill(item.nick);
   await page.locator('#cadastroEmail').fill(item.nick.toLowerCase()+'@example.invalid');
   assert.equal(await page.locator('#cadastroSenha').getAttribute('minlength'),'8');
   assert.equal(await page.locator('#cadastroSenha').getAttribute('maxlength'),'12');
   await page.locator('#cadastroSenha').fill('Abc123xy');
   await page.locator('[data-senha="cadastroSenha"]').click();
   assert.equal(await page.locator('#cadastroSenha').getAttribute('type'),'text');
   await page.locator('[data-senha="cadastroSenha"]').click();
   assert.equal(await page.locator('#cadastroSenha').getAttribute('type'),'password');
   await page.locator('#cadastroTermos').check();
   await page.locator('#formCadastro button[type=submit]').click();
   await page.locator('#mensagem').filter({hasText:/Cadastro concluído/}).waitFor();
   await page.locator('#painelLogin').waitFor({state:'visible'});
   assert.equal(await page.locator('#painelCadastro').isHidden(),true);
   assert.equal(await page.locator('#login').inputValue(),item.nick);
   // Erro de senha visível logo no início, sem divulgar se o nick existe.
   await page.locator('#senha').fill('SenhaErradaDeLaboratorio!');
   await page.locator('#formLogin button[type=submit]').click();
   await page.locator('#erroLogin').filter({hasText:/Nick ou senha incorretos/}).waitFor();
   assert.equal(await page.locator('#erroLogin').isHidden(),false);
   await page.locator('#abrirRecuperacao').click();
   await page.locator('#painelRecuperacao').waitFor({state:'visible'});
   await page.locator('#emailRecuperacao').fill(item.nick.toLowerCase()+'@example.invalid');
   await page.locator('#formSolicitarRecuperacao button[type=submit]').click();
   await page.locator('#estadoRecuperacao').filter({hasText:/ainda não está configurada/}).waitFor();
   assert.equal(await page.locator('#formConcluirRecuperacao').isHidden(),true);
   await page.locator('#voltarLogin').click();
   await page.locator('#painelLogin').waitFor({state:'visible'});
   await page.locator('#senha').fill('Abc123xy');
   await page.locator('[data-senha="senha"]').click();
   assert.equal(await page.locator('#senha').getAttribute('type'),'text');
   await page.locator('[data-senha="senha"]').click();
   await page.locator('#formLogin button[type=submit]').click();
   await page.locator('#painelConta').waitFor({state:'visible'});
   await page.locator('#conteudoResumo').waitFor({state:'visible'});
   assert.equal(await page.locator('#painelLogin').isHidden(),true);
   assert.equal(await page.locator('#abaResumo').getAttribute('aria-selected'),'true');
   await page.locator('#resumoPedidos').filter({hasText:'0'}).waitFor();
   await page.locator('#painelIdentidadeTeste').waitFor({state:'visible'});
   assert.match(await page.locator('#termosCpfTexto').innerText(),/LAB-navegador-2026/);
   await page.locator('#cpfTeste').fill(
    item.nome==='pc'?'529.982.247-25':'111.444.777-35');
   await page.locator('#aceiteCpfTeste').check();
   await page.locator('#formCpfTeste button[type=submit]').click();
   await page.locator('#situacaoCpfTeste')
    .filter({hasText:/CPF fictício registrado/}).waitFor();
   assert.equal(await page.locator('#formCpfTeste').isHidden(),true);
   assert.equal(await page.locator('#cpfTeste').inputValue(),'');
   await abrirAba('#abaPreparar');
   await page.locator('#calcularCotacao').click();
   await page.locator('#mensagem').filter({hasText:/Cotação conferida/}).waitFor();
   await page.locator('#prepararPedido').click();
   await page.locator('#mensagem').filter({hasText:/Pedidos e comunicados atualizados/}).waitFor();
   assert.equal(await page.locator('#listaPedidos article.pedido').count(),1);
   await page.locator('#listaPedidos').getByRole('button',{name:'Ver requisitos de ativação'}).click();
   await page.locator('#listaPedidos').filter({hasText:/BLOQUEADA_PARA_ATIVACAO_DEFINITIVA/}).waitFor();
   assert.match(await page.locator('#listaPedidos').innerText(),/R\$\s?250,00/);
   await abrirAba('#abaResumo');
   await page.locator('#resumoPedidos').filter({hasText:'1'}).waitFor();
   assert.match(await page.locator('#boasVindas').innerText(),new RegExp(item.nick,'i'));
   await page.locator('#atalhoPosicoes').click();
   await page.locator('#posicoesPainel').filter({hasText:/Posicoes comerciais ativas: 0/}).waitFor();
   assert.equal(await page.locator('#posicoesPainel .loop03-cartao-posicao-ensaio').count(),10);
   assert.equal(await page.locator('#posicoesPainel .loop03-cartao-posicao-pendente').count(),0);
   assert.match(await page.locator('#posicoesPainel').innerText(),/Nenhum cartao permite ativar/);
   await abrirAba('#abaLinks');
   await page.waitForFunction(()=>document.getElementById('linkLoja').value.includes('/loja/'));
   assert.ok((await page.locator('#linkLoja').inputValue()).endsWith('/loja/'+item.nick.toLowerCase()));
   assert.ok((await page.locator('#linkEscritorio').inputValue()).endsWith('/escritorio/'+item.nick.toLowerCase()));
   await abrirAba('#abaEquipe');
   await page.locator('#equipeResumo').filter({hasText:'0 cadastro(s)'}).waitFor();
   assert.match(await page.locator('#listaEquipe').innerText(),/ainda não possui cadastros/);
   await page.locator('#equipeVerLinks').click();
   assert.equal(await page.locator('#abaLinks').getAttribute('aria-selected'),'true');
   await abrirAba('#abaFinanceiro');
   assert.match(await page.locator('#estadoFinanceiro').innerText(),/Nenhum saldo comercial/);
   await abrirAba('#abaConta');
   await page.locator('#perfilCliente').filter({hasText:new RegExp(item.nick,'i')}).waitFor();
   assert.match(await page.locator('#perfilCliente').innerText(),new RegExp(item.nick,'i'));
   await abrirAba('#abaMeusPedidos');
   // Também verificar o Escritório do Administrador no MESMO SQLite.
   const admin=await context.newPage();
   admin.on('pageerror',e=>failures.push(e.message));
   await admin.goto(base+'/staging/escritorio-admin',{waitUntil:'networkidle'});
   await admin.locator('#token').fill('somente-teste-do-navegador-'+('x'.repeat(40)));
   await admin.locator('#formAcesso button').click();
   await admin.locator('#administracao').waitFor({state:'visible'});
   assert.equal(await admin.locator('#formPreAdesao').count(),1);
   assert.equal(await admin.locator('#conferirPreAdesao').count(),1);
   await admin.locator('#resumoPreviaFilas')
    .filter({hasText:/Fictícias históricas/}).waitFor();
   assert.match(await admin.locator('#resumoPreviaFilas').innerText(),
    /Projeção de posições fictícias indisponível/);
   assert.equal(await admin.locator('#quadroDepartamentos button').count(),12);
   await admin.locator('#quadroDepartamentos button').filter({hasText:'Pedidos'}).click();
   assert.equal(await admin.locator('#filtrarDepartamento').inputValue(),'PEDIDOS');
   assert.equal(await admin.locator('#alertasOperacionais article.alerta-operacional').count(),0);
   assert.match(await admin.locator('#pedidos').innerText(),/hom-/);
   await admin.locator('#pedidos')
    .getByRole('button',{name:'Conferir pré-adesão'}).first().click();
   await admin.locator('#preAdesaoStatus')
    .filter({hasText:/Revisão pendente/}).waitFor();
   assert.match(await admin.locator('#preAdesaoId').inputValue(),/^hom-/);
   await admin.locator('#conferirGateAtivacao').click();
   await admin.locator('#resultadoGateAtivacao').filter({hasText:/BLOQUEADA_PARA_ATIVACAO_DEFINITIVA/}).waitFor();
   await admin.locator('#criarMissaoGateAtivacao').click();
   await admin.locator('#resultadoGateAtivacao').filter({hasText:/Missão de regularização criada/}).waitFor();
   assert.match(await admin.locator('#listaMissoes').innerText(),/Regularizar requisitos de ativação/);
   await admin.locator('#criarMissaoGateAtivacao').click();
   await admin.locator('#resultadoGateAtivacao').filter({hasText:/já registrada/}).waitFor();
   await admin.locator('#titulo').fill('Revisar pedido do cliente');
   await admin.locator('#descricao').fill('Registrar o atendimento manual deste pré-pedido fictício.');
   await admin.locator('#pedido').selectOption({index:1});
   await admin.locator('#mensagem').fill('Registro de acompanhamento de laboratório para este pedido.');
   await admin.locator('#criarMissao button').click();
   await admin.locator('#estado').filter({hasText:/Missão criada/}).waitFor();
   assert.ok(await admin.locator('#listaMissoes article.pedido').count()>0);
   const novoProdutoId='curso-extra-'+item.nick.toLowerCase();
   await admin.locator('#produtoIdAdmin').fill(novoProdutoId);
   await admin.locator('#produtoNomeAdmin').fill('Curso adicional fictício '+item.nick);
   await admin.locator('#produtoDescricaoAdmin').fill(
    'Material digital de laboratório, sem compra ou pagamento real.');
   await admin.locator('#produtoEstadoAdmin').selectOption('PUBLICADO');
   await admin.locator('#produtoPrecoAdmin').fill('99.00');
   await admin.locator('#formProduto button[type=submit]').click();
   await admin.locator('#resultadoProdutoAdmin').filter({hasText:/Produto salvo/}).waitFor();
   assert.match(await admin.locator('#listaProdutosAdmin').innerText(),/Curso adicional fictício/);
   await admin.locator('#listaProdutosAdmin .produto-admin-item')
    .filter({hasText:'curso-homologacao-250'})
    .getByRole('button',{name:'Cor na loja'}).click();
   await admin.locator('#resultadoSinalizacaoAdmin')
    .filter({hasText:/Configuração visual carregada/}).waitFor();
   await admin.locator('#sinalizacaoClasse').selectOption('VERDE');
   await admin.locator('#sinalizacaoMinimo').fill('1');
   await admin.locator('#formSinalizacaoAdmin button[type=submit]').click();
   await admin.locator('#resultadoSinalizacaoAdmin').filter({hasText:/Cor salva/}).waitFor();
   await admin.locator('#quantidadeSimulada').fill('1');
   await admin.locator('#formSimularQualificacao button[type=submit]').click();
   await admin.locator('#resultadoSimulacao')
    .filter({hasText:/Posições criadas: 0/}).waitFor();
   assert.match(await admin.locator('#resultadoSimulacao').innerText(),
    /referência com produtos verdes em simulação/);
   assert.equal(await admin.locator('#sinalizacaoProdutoId').inputValue(),'curso-homologacao-250');
   const confAdmin=await admin.request.get(
    base+'/staging/escritorio-unificado/sinalizacao/curso-homologacao-250',
    {headers:{Authorization:'Bearer '+'somente-teste-do-navegador-'+('x'.repeat(40))}}
   );
   assert.equal(confAdmin.status(),200);
   assert.equal((await confAdmin.json()).classificacao,'VERDE','Admin deveria persistir a cor');
   await admin.screenshot({path:path.join(__dirname,'../artifacts',
    'escritorio-admin-candidato-'+item.nome+'.png'),fullPage:true});
   await page.locator('#atualizarPedidos').click();
   await page.locator('#minhaPreviaFilas')
    .filter({hasText:/Posições reais: 0/}).waitFor();
   await page.locator('#minhasPreAdesoes')
    .filter({hasText:/Nenhuma pré-adesão fictícia registrada/}).waitFor();
   await page.locator('#comunicadosCliente').filter({
    hasText:/Registro de acompanhamento de laboratório/
   }).waitFor();
   await admin.close();
   // Mesma identidade visual aprovada, uma sessao e uma navegacao, PC/celular.
   await page.locator('#loop03ShellIntegrado').waitFor({state:'visible'});
   assert.equal(await page.locator('#loop03SidebarIntegrado').count(),1);
   if(item.nome==='celular'){
    await page.locator('#loop03MenuIntegrado').click();
    assert.equal(await page.locator('#loop03MenuIntegrado').getAttribute('aria-expanded'),'true');
   }
   await abrirAba('#abaTabuleiro');
   await page.locator('#estadoTabuleiroIntegrado').filter({hasText:/não representa ocupação real/}).waitFor();
   await page.locator('#tabuleiroVerPosicoesIntegrado').click();
   await page.locator('#conteudoPosicoes').waitFor({state:'visible'});
   if(item.nome==='celular')await page.locator('#loop03MenuIntegrado').click();
   await abrirAba('#abaResumo');
   await page.locator('#conteudoResumo').waitFor({state:'visible'});
   const screenshot=path.join(__dirname,'../artifacts',
    'conta-unica-candidato-'+item.nome+'.png');
   await page.screenshot({path:screenshot,fullPage:true});
   await page.reload({waitUntil:'networkidle'});
   await page.locator('#painelConta').waitFor({state:'visible'});
   await abrirAba('#abaMeusPedidos');
   await page.locator('#listaPedidos article.pedido').first().waitFor();
   assert.equal(await page.locator('#listaPedidos article.pedido').count(),1);
   await abrirAba('#abaPreparar');
   await page.locator('#atualizarCatalogo').click();
   await page.locator('#produtoDoCatalogo').selectOption('curso-extra-'+item.nick.toLowerCase());
   await page.locator('#quantidadeDoCatalogo').fill('2');
   await page.locator('#calcularCotacao').click();
   await page.locator('#cotacao').filter({hasText:/R\$\s?198,00/}).waitFor();
   await page.locator('#prepararPedido').click();
   await page.locator('#listaPedidos article.pedido').nth(1).waitFor();
   assert.equal(await page.locator('#listaPedidos article.pedido').count(),2);
   assert.match(await page.locator('#listaPedidos').innerText(),/R\$\s?198,00/);
   await page.screenshot({path:path.join(__dirname,'../artifacts',
    'cliente-catalogo-editavel-'+item.nome+'.png'),fullPage:true});
   await page.reload({waitUntil:'networkidle'});
   await abrirAba('#abaMeusPedidos');
   await page.locator('#listaPedidos article.pedido').nth(1).waitFor();
   assert.equal(await page.locator('#listaPedidos article.pedido').count(),2);
   // A própria vitrine AKITEMM aprovada: mesmo titular, catálogo, carrinho e pré-pedidos.
   const loja=await context.newPage();
   loja.on('pageerror',e=>failures.push(e.message));
   await loja.goto(base+'/staging/loja',{waitUntil:'domcontentloaded'});
   try{
    await loja.locator('#conteudoLojaLoop').waitFor({state:'visible',timeout:15000});
   }catch(err){
    const estado=await loja.locator('#estadoLojaLoop').innerText();
    throw Error('VITRINE_NAO_INICIALIZOU: '+estado+'; ERROS='+JSON.stringify(failures)+'; '+err.message);
   }
   assert.ok(await loja.locator('#catalogoLojaLoop article.produto-loja-loop').count()>=2);
   const estadoVitrine=await loja.evaluate(async()=>{
    const r=await fetch('/staging/vitrine/loja/catalogo',{credentials:'same-origin'});
    return {status:r.status,body:await r.json()};
   });
   assert.equal(estadoVitrine.status,200,JSON.stringify(estadoVitrine));
   const seed=estadoVitrine.body.produtos.find(p=>p.produtoId==='curso-homologacao-250');
   assert.equal(seed?.classeVisual,'VERDE',JSON.stringify(estadoVitrine.body.produtos));
   const classes=await loja.locator('#catalogoLojaLoop article').evaluateAll(
    els=>els.map(e=>({classe:e.className,texto:e.textContent.slice(0,100)}))
   );
   assert.ok(classes.some(x=>x.classe.includes('produto-loja-loop-elegivel')),
    JSON.stringify(classes));
   assert.ok(await loja.locator('#catalogoLojaLoop article.produto-loja-loop-nao-elegivel').count()>=1);
   await loja.locator('#catalogoLojaLoop article.produto-loja-loop')
    .filter({hasText:'Curso adicional fictício '+item.nick})
    .locator('button.akitemm-adicionar').click();
   assert.equal(await loja.locator('#akitemmTotalItens').innerText(),'1');
   await loja.locator('#akitemmAnaliseQualificacao')
    .filter({hasText:/não atinge a referência/}).waitFor();
   await loja.locator('#registrarPedidoLoja').click();
   await loja.locator('#statusPedidoLoja').filter({hasText:/Pedido hom-/}).waitFor();
   await loja.screenshot({path:path.join(__dirname,'../artifacts',
    'vitrine-aprovada-candidato-'+item.nome+'.png'),fullPage:true});
   await loja.close();
   await abrirAba('#abaMeusPedidos');
   await page.locator('#atualizarPedidos').click();
   await page.locator('#listaPedidos article.pedido').nth(2).waitFor();
   assert.equal(await page.locator('#listaPedidos article.pedido').count(),3);
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
