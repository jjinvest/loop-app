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
   // Cliente existente entra diretamente; cadastro so no primeiro acesso.
   assert.equal(await page.locator('#painelLogin').isVisible(),true);
   assert.equal(await page.locator('#painelCadastro').isHidden(),true);
   // Screenshot de regressão e medição de layout: nunca "olho" largo/central.
   const medirOlho=async id=>page.evaluate(id=>{
    const campo=document.getElementById(id);
    const botao=document.querySelector('[data-senha="'+id+'"]');
    const a=campo.getBoundingClientRect(),b=botao.getBoundingClientRect();
    return {campo:{x:a.x,right:a.right,top:a.top,bottom:a.bottom,width:a.width},
     botao:{x:b.x,right:b.right,top:b.top,bottom:b.bottom,width:b.width},
     icon:!!botao.querySelector('svg'),
     cssPosition:getComputedStyle(botao).position,
     type:campo.type};
   },id);
   const olho=await medirOlho('senha');
   assert.equal(olho.icon,true,'icone deve ser SVG, nao emoji solto');
   assert.equal(olho.cssPosition,'absolute');
   assert.ok(olho.botao.width>=40&&olho.botao.width<=50,JSON.stringify(olho));
   assert.ok(olho.botao.x>olho.campo.x+olho.campo.width*.65,JSON.stringify(olho));
   assert.ok(Math.abs(olho.botao.right-olho.campo.right)<15,JSON.stringify(olho));
   assert.ok(olho.botao.top>=olho.campo.top-3&&
    olho.botao.bottom<=olho.campo.bottom+3,JSON.stringify(olho));
   await page.screenshot({path:path.join(__dirname,'../artifacts',
    'login-olho-lateral-'+item.nome+'.png'),fullPage:true});
   await page.locator('#mudarParaCadastro').click();
   await page.locator('#painelCadastro').waitFor({state:'visible'});
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
   // O conteúdo da aba precisa VIR ANTES de e-mail, CPF e resumos auxiliares.
   for(const [abaTeste,conteudoTeste] of [
    ['#abaTabuleiro','#conteudoTabuleiro'],
    ['#abaPosicoes','#conteudoPosicoes'],
    ['#abaResumo','#conteudoResumo']
   ]){
    await abrirAba(abaTeste);
    await page.locator(conteudoTeste).waitFor({state:'visible'});
    const frente=await page.evaluate(seletor=>{
     const ativo=document.querySelector(seletor);
     const email=document.getElementById('painelVerificarEmail');
     const cpf=document.getElementById('painelIdentidadeTeste');
     const indicador=document.querySelector('.loop03-corpo>.loop03-indicadores');
     return {
      antesEmail:!!(ativo.compareDocumentPosition(email)&Node.DOCUMENT_POSITION_FOLLOWING),
      antesCpf:!!(ativo.compareDocumentPosition(cpf)&Node.DOCUMENT_POSITION_FOLLOWING),
      indicadoresAntesPainel:!!(indicador.compareDocumentPosition(ativo)&Node.DOCUMENT_POSITION_FOLLOWING),
      primeiroAposAcessoLoja:ativo.previousElementSibling?.classList.contains('barra-conta')
     };
    },conteudoTeste);
    assert.deepEqual(frente,{
     antesEmail:true,antesCpf:true,indicadoresAntesPainel:true,primeiroAposAcessoLoja:true
    },'aba prioritaria em '+item.nome+' '+abaTeste);
    if(item.isMobile){
     await page.waitForFunction(()=>{
      const titulo=document.querySelector('.cliente-integrado .loop03-boasvindas');
      return Math.abs(titulo.getBoundingClientRect().top)<28;
     },null,{timeout:3000});
    }
   }
   const geom=await page.evaluate(()=>{
    const seletores=['.loop03-banner-topo','.loop03-boasvindas',
     '.loop03-indicadores','.barra-conta','#conteudoResumo'];
    const caixas=seletores.map(s=>{
     const r=document.querySelector('.cliente-integrado '+s).getBoundingClientRect();
     return {seletor:s,top:r.top,bottom:r.bottom,height:r.height};
    });
    const botao=document.getElementById('loop03MenuIntegrado');
    const br=botao.getBoundingClientRect();
    const linkLojaMarca=document.querySelector('.cliente-integrado .barra-conta>a');
    return {caixas,raio:getComputedStyle(botao).borderRadius,
     larguraBotao:br.width,alturaBotao:br.height,
     marca:linkLojaMarca.textContent.trim(),destino:linkLojaMarca.getAttribute('href'),
     aria:linkLojaMarca.getAttribute('aria-label')};
   });
   const [faixa,titulo,indicadores,linhaLoja,painel]=geom.caixas;
   assert.equal(geom.marca,'AKITEMM');
   assert.equal(geom.aria,'Abrir loja AKITEMM');
   assert.equal(geom.destino,'/staging/loja');
   assert.ok(faixa.bottom<=titulo.top+2,JSON.stringify(geom));
   assert.ok(titulo.bottom<=indicadores.top+2,JSON.stringify(geom));
   assert.ok(indicadores.bottom<=linhaLoja.top+2,JSON.stringify(geom));
   assert.ok(linhaLoja.bottom<=painel.top+3,JSON.stringify(geom));
   if(item.isMobile){
    assert.ok(faixa.height<125,'banner muito alto: '+JSON.stringify(geom));
    assert.equal(geom.larguraBotao,44);
    assert.equal(geom.alturaBotao,44);
    assert.equal(geom.raio,'50%');
   }
   await page.screenshot({path:path.join(__dirname,'../artifacts',
    'escritorio-resumo-acima-aba-'+item.nome+'.png'),fullPage:true});
   await page.screenshot({path:path.join(__dirname,'../artifacts',
    'aba-escritorio-prioritaria-'+item.nome+'.png'),fullPage:true});
   // A versão LAB permanece no backend, mas o aviso antigo não é mais exibido.
   // Verificar o contrato autenticado em vez de exigir texto removido da UI.
   const termosIdentidade=await page.request.get(base+'/staging/contas/termos-identidade');
   assert.equal(termosIdentidade.status(),200);
   const dadosTermos=await termosIdentidade.json();
   assert.equal(dadosTermos.termosVersao,'LAB-navegador-2026');
   assert.match(dadosTermos.termosTexto,/Prévia apenas para teste de acesso e pedido/);
   assert.equal(await page.locator('#termosCpfTexto').isHidden(),true);
   await page.locator('#cpfTeste').fill(
    item.nome==='pc'?'529.982.247-25':'111.444.777-35');
   await page.locator('#aceiteCpfTeste').check();
   await page.locator('#formCpfTeste button[type=submit]').click();
   await page.locator('#situacaoCpfTeste')
    .filter({hasText:/CPF fictício registrado/}).waitFor();
   assert.equal(await page.locator('#formCpfTeste').isHidden(),true);
   assert.equal(await page.locator('#cpfTeste').inputValue(),'');
   // Compras sao testadas SOMENTE na loja AKITEMM, nao em aba duplicada do LOOP.
   assert.equal(await page.locator('#abaPreparar').count(),0);
   const lojaPrimeiro=await context.newPage();
   lojaPrimeiro.on('pageerror',e=>failures.push(e.message));
   await lojaPrimeiro.goto(base+'/staging/loja',{waitUntil:'domcontentloaded'});
   await lojaPrimeiro.locator('#conteudoLojaLoop').waitFor({state:'visible'});
   await lojaPrimeiro.locator('#catalogoLojaLoop article.produto-loja-loop')
    .filter({hasText:'Curso ficticio para homologacao - R$ 250'})
    .locator('button.akitemm-adicionar').click();
   assert.equal(await lojaPrimeiro.locator('#akitemmTotalItens').innerText(),'1');
   await lojaPrimeiro.locator('#registrarPedidoLoja').click();
   await lojaPrimeiro.locator('#statusPedidoLoja').filter({hasText:/Pedido hom-/}).waitFor();
   await lojaPrimeiro.close();
   await abrirAba('#abaMeusPedidos');
   await page.locator('#atualizarPedidos').click();
   await page.locator('#listaPedidos article.pedido').first().waitFor();
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
   assert.match(await page.locator('#posicoesPainel').innerText(),/Nenhum cartão permite ativar/);
   await abrirAba('#abaLinks');
   await page.waitForFunction(()=>document.getElementById('linkLoja').value.includes('/loja/'));
   assert.ok((await page.locator('#linkLoja').inputValue()).endsWith('/loja/'+item.nick.toLowerCase()));
   assert.ok((await page.locator('#linkEscritorio').inputValue()).endsWith('/escritorio/'+item.nick.toLowerCase()));
   await abrirAba('#abaEquipe');
   await page.locator('#equipeResumo').filter({hasText:'0 cadastro(s)'}).waitFor();
   assert.match(await page.locator('#listaEquipe').innerText(),/ainda não possui cadastros/);
   assert.equal(await page.locator('#redeTotalCadastros').innerText(),'0');
   assert.equal(await page.locator('#redeADistribuirEnsaio').innerText(),'—',
    'não inventar posições disponíveis');
   // Cadastre UMA pessoa de ensaio pelo link do titular e prove o circuito
   // cadastro -> SQLite -> API segura -> lista real no PC e celular.
   const nickIndicado=item.nome==='pc'?'Ciro':'Nina';
   const inscricao=await fetch(base+'/staging/contas/cadastrar',{
    method:'POST',
    headers:{'Content-Type':'application/json',
     'X-AKITEMM-Preview-Indicador':item.nick},
    body:JSON.stringify({
     nome:nickIndicado+' Exemplo',nick:nickIndicado,
     email:nickIndicado.toLowerCase()+'@example.invalid',
     senha:'Abc123xy',aceiteExplicito:true
    })
   });
   assert.equal(inscricao.status,201,await inscricao.text());
   await page.locator('#atualizarEquipe').click();
   const indicado=page.locator('#listaEquipe article.loop03-rede-pessoa');
   await indicado.first().waitFor();
   assert.equal(await indicado.count(),1);
   assert.match(await indicado.first().innerText(),new RegExp('@'+nickIndicado,'i'));
   assert.match(await indicado.first().innerText(),/#0001/);
   assert.match(await indicado.first().innerText(),/Telefone: não disponibilizado/);
   assert.match(await indicado.first().innerText(),/Cadastro realizado/);
   assert.equal(await indicado.first().getAttribute('data-estado'),'vermelho');
   assert.equal(await page.locator('#redeTotalCadastros').innerText(),'1');
   const botaoDetalhes=indicado.first().locator('button.loop03-rede-pessoa-menu');
   await botaoDetalhes.click();
   assert.equal(await botaoDetalhes.getAttribute('aria-expanded'),'true');
   assert.equal(await indicado.first().locator('.loop03-rede-pessoa-detalhes').isVisible(),true);
   await botaoDetalhes.click();
   assert.equal(await botaoDetalhes.getAttribute('aria-expanded'),'false');
   const busca=page.locator('#buscarEquipe');
   await busca.fill('#1');
   await page.locator('#equipeResumo').filter({hasText:'1 resultado(s)'}).waitFor();
   assert.equal(await indicado.count(),1);
   await busca.fill('NaoExiste');
   await page.locator('#equipeResumo').filter({hasText:'0 resultado(s)'}).waitFor();
   assert.match(await page.locator('#listaEquipe').innerText(),/Nenhum cadastro encontrado/);
   await busca.fill(nickIndicado.toLowerCase());
   await page.locator('#equipeResumo').filter({hasText:'1 resultado(s)'}).waitFor();
   assert.equal(await indicado.count(),1);
   await page.screenshot({path:path.join(__dirname,'../artifacts',
    'minha-rede-integrada-'+item.nome+'.png'),fullPage:true});
   await busca.fill('');
   await page.locator('#equipeResumo').filter({hasText:'1 cadastro(s)'}).waitFor();
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
   // Busca administrativa real também no navegador PC/celular.
   await admin.locator('#pesquisaTipoAdmin').selectOption('pedidos');
   await admin.locator('#pesquisaTermoAdmin').fill(item.nick);
   await admin.locator('#pesquisaExecutarAdmin').click();
   await admin.locator('#pesquisaEstadoAdmin').filter({hasText:/resultado\(s\) em pedidos/}).waitFor();
   assert.match(await admin.locator('#pesquisaResultadosAdmin').innerText(),/hom-/);
   await admin.locator('#pesquisaTipoAdmin').selectOption('produtos');
   await admin.locator('#pesquisaTermoAdmin').fill('curso-homologacao-250');
   await admin.locator('#pesquisaExecutarAdmin').click();
   await admin.locator('#pesquisaEstadoAdmin').filter({hasText:/resultado\(s\) em produtos/}).waitFor();
   assert.match(await admin.locator('#pesquisaResultadosAdmin').innerText(),/curso-homologacao-250/);
   await admin.locator('#pesquisaResultadosAdmin').getByRole('button',{name:'Editar no catálogo'}).first().click();
   await admin.waitForFunction(() => document.getElementById('produtoIdAdmin').value==='curso-homologacao-250');
   await admin.locator('#cancelarEdicaoProduto').click();
   await admin.locator('#pesquisaTermoAdmin').fill('produto-inexistente-zz88');
   await admin.locator('#pesquisaExecutarAdmin').click();
   await admin.locator('#pesquisaResultadosAdmin').filter({hasText:'Nenhum registro encontrado.'}).waitFor();
   await admin.locator('#pesquisaLimparAdmin').click();
   assert.equal(await admin.locator('#pesquisaResultadosAdmin').innerText(),'');

   // Provar a operação REAL dos controles editoriais sem redesenhar o admin.
   assert.equal(await admin.locator('#formNovidadesAdmin').count(),1);
   await admin.locator('#novidadeTituloAdmin').fill('LANÇAMENTO '+item.nick);
   await admin.locator('#novidadeTextoAdmin').fill(
    'Comunicado editorial de ensaio: nenhuma gratuidade ou pagamento é ativado.');
   await admin.locator('#novidadeImagemAdmin').setInputFiles({
    name:'novidade-teste.png',mimeType:'image/png',
    buffer:Buffer.from(
     'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+anxrAAAAAElFTkSuQmCC',
     'base64')
   });
   await admin.locator('#novidadeEstadoAdmin').selectOption('PUBLICADA');
   await admin.locator('#novidadeSalvarAdmin').click();
   await admin.locator('#novidadeResultadoAdmin')
    .filter({hasText:/Novidade salva: PUBLICADA/}).waitFor();
   assert.match(await admin.locator('#listaNovidadesAdmin').innerText(),
    new RegExp('LANÇAMENTO '+item.nick));
   assert.equal(await admin.locator('#formPreAdesao').count(),1);
   assert.equal(await admin.locator('#conferirPreAdesao').count(),1);
   await admin.locator('#resumoPreviaFilas')
    .filter({hasText:/Fictícias históricas/}).waitFor();
   assert.match(await admin.locator('#resumoPreviaFilas').innerText(),
    /Projeção de posições fictícias indisponível/);
   assert.equal(await admin.locator('#quadroDepartamentos button').count(),12);
   // Auditoria financeira conserva a tela aprovada e nao libera saldo:
   // mesmo quando nao ha alertas, custos externos seguem pendentes.
   await admin.locator('#consultarCoberturaAkitemm').click();
   await admin.locator('#resumoCoberturaAkitemm')
    .filter({hasText:/Marco Zero financeiro: NÃO APROVADO/}).waitFor();
   assert.match(await admin.locator('#resumoCoberturaAkitemm').innerText(),/CONTADORES DESTA PÁGINA/);
   assert.equal(await admin.locator('#listaCoberturaAkitemm button').count(),2);
   assert.equal(await admin.locator('#listaCoberturaAkitemm')
    .getByRole('button',{name:'Página anterior'}).isDisabled(),true);
   assert.equal(await admin.locator('#consultarCoberturaAkitemm').isDisabled(),false);
   await admin.locator('#conferirBackupOffsite').click();
   await admin.locator('#estadoBackupOffsite').filter({
    hasText:/Backup externo ainda não comprovado neste serviço/
   }).waitFor();
   // Sem credencial Asaas nesta previa: nao permitir falsa conciliacao
   // nem habilitar o botao de lote como se o PSP externo estivesse ligado.
   assert.equal(await admin.locator('#reconciliarPendentesPsp').isDisabled(),true);
   await admin.locator('#consultarPixUnificado').click();
   await admin.locator('#estadoPixUnificado').filter({
    hasText:/faltam credenciais específicas do Asaas Sandbox/
   }).waitFor();
   assert.equal(await admin.locator('#reconciliarPendentesPsp').isDisabled(),true);
   await admin.locator('#quadroDepartamentos button').filter({hasText:'Pedidos'}).click();
   assert.equal(await admin.locator('#filtrarDepartamento').inputValue(),'PEDIDOS');
   // Agora os departamentos devem abrir dados e controles reais, nao apenas missões.
   await admin.locator('#departamentoOperacionalTitulo')
    .filter({hasText:'Pedidos · operação'}).waitFor();
   await admin.locator('#departamentoOperacionalEstado')
    .filter({hasText:/Página 1/}).waitFor();
   assert.match(await admin.locator('#departamentoOperacionalRegistros').innerText(),/hom-/);
   await admin.locator('#quadroDepartamentos button').filter({hasText:'Tabuleiro'}).click();
   await admin.locator('#departamentoOperacionalTitulo')
    .filter({hasText:'Tabuleiro · operação'}).waitFor();
   // Verificar a catraca financeira distinta do giro fisico e o plano
   // de tres bancos nao conectados, nos mesmos painéis PC/celular.
   await admin.locator('#atualizarFluxoFinanceiroAdmin').click();
   await admin.locator('#fluxoFinanceiroEstado')
    .filter({hasText:/Luzes e giros reconciliados/}).waitFor();
   assert.match(await admin.locator('#fluxoFinanceiroBancos').innerText(),
    /Mercado Pago.*Banco Inter.*Terceiro banco/);
   assert.match(await admin.locator('#fluxoFinanceiroMetricas').innerText(),
    /Luzes financeiras acumuladas/);
   assert.match(await admin.locator('#fluxoFinanceiroCofres').innerText(),
    /Centro.*Investimento.*Reserva.*Douradas/s);

   // Apos abrir Tabuleiro, operador cria UMA dourada no mesmo motor,
   // sem tocar em saldo e sem abrir interface paralela.
   await admin.locator('#departamentoOperacionalAcoes')
    .getByRole('button',{name:'Criar 1 bola dourada'}).click();
   await admin.locator('#criarDouradaCiencia').check();
   await admin.locator('#criarDouradaManualEnsaio').click();
   await admin.locator('#statusCriarDouradaAdmin')
    .filter({hasText:/Bola dourada criada.*fila B/}).waitFor();
   await admin.locator('#douradasAtivasAdmin').filter({hasText:/ID interno #/}).waitFor();
   assert.match(await admin.locator('#motorEnsaioResumo').innerText(),/Douradas manuais criadas/);
   assert.equal(await admin.locator('#criarDouradaCiencia').isChecked(),false);
   await admin.locator('#departamentoOperacionalAcoes')
    .getByRole('button',{name:'Configurar horários da catraca'}).click();
   assert.equal(await admin.locator('#formAgendaMotor').isVisible(),true);
   await admin.locator('#quadroDepartamentos button').filter({hasText:'Cofres'}).click();
   await admin.locator('#departamentoOperacionalEstado')
    .filter({hasText:/Operação comercial não habilitada/}).waitFor();
   await admin.locator('#quadroDepartamentos button').filter({hasText:'Pedidos'}).click();
   await admin.locator('#departamentoOperacionalTitulo')
    .filter({hasText:'Pedidos · operação'}).waitFor();

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
   await admin.locator('#listaMissoes').filter({hasText:/Regularizar requisitos de ativação/}).waitFor();
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
   // Custos internos usam o MESMO produto: não vazam para o cliente
   // nem autorizam transferência, lucro ou saque real.
   await admin.locator('#custosProdutoSelecionadoAdmin')
    .filter({hasText:/Produto curso-extra-/}).waitFor();
   await admin.locator('#custoFornecedorAdmin').fill('25.00');
   await admin.locator('#custoFreteAdmin').fill('5.00');
   await admin.locator('#custoPspAdmin').fill('1.50');
   await admin.locator('#custoTributosAdmin').fill('2.00');
   await admin.locator('#resumoMargemProdutoAdmin')
    .filter({hasText:/margem estimada.*R.*65,50/i}).waitFor();
   await admin.locator('#salvarCustoProdutoAdmin').click();
   await admin.locator('#statusCustosProdutoAdmin')
    .filter({hasText:/Custos registrados no SQLite/}).waitFor();
   const custoResp=await admin.request.get(
    base+'/staging/escritorio-unificado/produtos/'+novoProdutoId+'/custos',
    {headers:{Authorization:'Bearer '+'somente-teste-do-navegador-'+('x'.repeat(40))}});
   assert.equal(custoResp.status(),200);
   const custosSalvos=await custoResp.json();
   assert.equal(custosSalvos.custoFornecedorCentavos,2500);
   assert.equal(custosSalvos.margemComercialEstimadaCentavos,6550);
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
    /referência com produtos elegíveis em simulação/);
   assert.equal(await admin.locator('#sinalizacaoProdutoId').inputValue(),'curso-homologacao-250');
   const confAdmin=await admin.request.get(
    base+'/staging/escritorio-unificado/sinalizacao/curso-homologacao-250',
    {headers:{Authorization:'Bearer '+'somente-teste-do-navegador-'+('x'.repeat(40))}}
   );
   assert.equal(confAdmin.status(),200);
   assert.equal((await confAdmin.json()).classificacao,'VERDE','Admin deveria persistir a cor');
   // Configuração editorial na tela de administração REAL, ligada à loja.
   await admin.locator('#configLojaPainelAdmin summary').click();
   await admin.locator('#configResultadoAdmin').filter({hasText:/carregada/}).waitFor();
   await admin.locator('#configSuporteAdmin').fill(
    'Atendimento fictício para ensaio de integração do LOOP '+item.nick);
   const removerBanners=admin.locator('#configBannersAdmin .config-banner-item')
    .getByRole('button',{name:'Remover'});
   while(await removerBanners.count()>0)await removerBanners.first().click();
   await admin.locator('#configAdicionarBannerAdmin').click();
   await admin.locator('#configBannersAdmin [name="titulo"]').fill(
    'Banner conectado '+item.nick);
   await admin.locator('#configBannersAdmin [name="descricao"]').fill(
    'Comunicado de laboratório sem venda real');
   await admin.locator('#configSalvarAdmin').click();
   await admin.locator('#configResultadoAdmin')
    .filter({hasText:/Vitrine e atendimento salvos/}).waitFor();
   const configResposta=await admin.request.get(
    base+'/staging/escritorio-unificado/loja/config',{
     headers:{Authorization:'Bearer '+'somente-teste-do-navegador-'+('x'.repeat(40))}
    });
   assert.equal(configResposta.status(),200);
   const configAdmin=await configResposta.json();
   assert.equal(configAdmin.config.banners.length,1);
   assert.equal(configAdmin.config.banners[0].titulo,'Banner conectado '+item.nick);
   assert.ok(configAdmin.revisao>=1);
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
   await page.locator('#estadoTabuleiroIntegrado').filter({hasText:/Motor V6 conectado ao SQLite/}).waitFor();
   assert.equal(await page.locator('#tabuleiroMotorCentro').innerText(),'#0000');
   assert.equal(await page.locator('#tabuleiroMotorIntegrado .espaco-tabuleiro-demo').count(),7);
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
   // Pre-pedido com quantidade 2: a prova da loja substitui a antiga aba.
   const lojaCotacao=await context.newPage();
   lojaCotacao.on('pageerror',e=>failures.push(e.message));
   await lojaCotacao.goto(base+'/staging/loja',{waitUntil:'domcontentloaded'});
   await lojaCotacao.locator('#conteudoLojaLoop').waitFor({state:'visible'});
   const produtoExtra=lojaCotacao.locator('#catalogoLojaLoop article.produto-loja-loop')
    .filter({hasText:'Curso adicional fictício '+item.nick});
   await produtoExtra.locator('button.akitemm-adicionar').click();
   await produtoExtra.locator('button.akitemm-adicionar').click();
   await lojaCotacao.locator('#totalLojaLoop').filter({hasText:/R\$\s?198,00/}).waitFor();
   await lojaCotacao.locator('#registrarPedidoLoja').click();
   await lojaCotacao.locator('#statusPedidoLoja').filter({hasText:/Pedido hom-/}).waitFor();
   await lojaCotacao.close();
   await page.locator('#atualizarPedidos').click();
   await page.locator('#listaPedidos article.pedido').nth(1).waitFor();
   assert.equal(await page.locator('#listaPedidos article.pedido').count(),2);
   assert.match(await page.locator('#listaPedidos').innerText(),/R\$\s?198,00/);
   await page.screenshot({path:path.join(__dirname,'../artifacts',
    'cliente-pedidos-da-loja-'+item.nome+'.png'),fullPage:true});
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
   await loja.locator('#akitemmBannerConteudo')
    .filter({hasText:'Banner conectado '+item.nick}).waitFor();
   await loja.locator('#akitemmSuporte summary').click();
   await loja.locator('#akitemmTextoSuporte')
    .filter({hasText:'Atendimento fictício para ensaio de integração do LOOP '+item.nick})
    .waitFor();
   // Busca global representa o texto: sem produto mostra vazio explícito.
   await loja.locator('#akitemmBusca').fill('produtoquecomcertezanãoexiste2026');
   assert.equal(await loja.locator('#catalogoLojaLoop article').count(),0);
   assert.match(await loja.locator('#akitemmResultadoProdutos').innerText(),
    /Produto inexistente/);
   // Produto existente: somente o resultado correspondente.
   await loja.locator('[data-akitemm-categoria="fisicos"]').click();
   await loja.locator('#akitemmBusca').fill('Curso adicional fictício '+item.nick);
   assert.equal(await loja.locator('#catalogoLojaLoop article.produto-loja-loop').count(),1,
    'busca global ignora filtro anterior e não mistura produtos');
   await loja.locator('#catalogoLojaLoop article.produto-loja-loop button.akitemm-ver-detalhes').click();
   await loja.locator('#akitemmVisualizacaoProduto').waitFor({state:'visible'});
   assert.equal(await loja.locator('#akitemmAreaProdutos').getAttribute('data-modo'),'detalhe');
   assert.equal(await loja.locator('#catalogoLojaLoop').isVisible(),false);
   assert.equal(await loja.locator('#akitemmModalDetalhes').count(),0,
    'produto selecionado abre na própria página, modal antigo removido');
   assert.match(await loja.locator('#akitemmProdutoInlineConteudo h2').innerText(),
    new RegExp('Curso adicional fictício '+item.nick,'i'));
   assert.ok(await loja.locator('#akitemmProdutoInlineConteudo .akitemm-detalhe-informacoes').isVisible());
   assert.ok(await loja.locator('#akitemmProdutoInlineConteudo .akitemm-detalhe-avaliacoes').isVisible());
   await loja.screenshot({path:path.join(__dirname,'../artifacts',
    'produto-selecionado-inline-'+item.nome+'.png'),fullPage:true});
   await loja.locator('#akitemmVoltarProdutos').click();
   assert.equal(await loja.locator('#akitemmAreaProdutos').getAttribute('data-modo'),'lista');
   assert.equal(await loja.locator('#catalogoLojaLoop article.produto-loja-loop').count(),1);
   await loja.locator('#akitemmBusca').fill('');
   await loja.locator('#akitemmFiltroTodos').click();
   // Ícones não podem cobrir nome/descrição nos quatro cartões.
   const cabecalhoCategoria=await loja.locator('.akitemm-categorias button').evaluateAll(botoes=>
    botoes.map(botao=>{
     const svg=botao.querySelector('svg')?.getBoundingClientRect();
     const titulo=botao.querySelector('strong')?.getBoundingClientRect();
     const legenda=botao.querySelector('small')?.getBoundingClientRect();
     return {iconeDireita:svg?.right,nomeEsquerda:titulo?.left,
      legendaEsquerda:legenda?.left,nomeDireita:titulo?.right,
      botaoDireita:botao.getBoundingClientRect().right};
    })
   );
   assert.equal(cabecalhoCategoria.length,4);
   for(const bloco of cabecalhoCategoria){
    assert.ok(bloco.nomeEsquerda>=bloco.iconeDireita-1,
     'nome não se sobrepõe ao ícone: '+JSON.stringify(bloco));
    assert.ok(bloco.legendaEsquerda>=bloco.iconeDireita-1,
     'descrição não se sobrepõe ao ícone: '+JSON.stringify(bloco));
    assert.ok(bloco.nomeDireita<bloco.botaoDireita,
     'nome não sai do cartão: '+JSON.stringify(bloco));
   }
   await loja.waitForFunction(nick=>{
    const campo=document.getElementById('enderecoDivulgarLojaLoop');
    const botao=document.getElementById('copiarDivulgarLojaLoop');
    return campo?.value.endsWith('/loja/'+nick)&&botao?.disabled===false;
   },item.nick.toLowerCase(),{timeout:10000});
   assert.match(await loja.locator('#statusDivulgarLojaLoop').textContent(),
    /Sem compras ou comissões reais/);
   assert.equal(await loja.locator('#enderecoDivulgarLojaLoop').inputValue(),
    base+'/loja/'+item.nick.toLowerCase());
   // Os quatro botoes originais continuam na MESMA pagina e exibem conteudo
   // consistente com produtos/publicacoes confirmados, tambem no celular.
   assert.equal(await loja.locator('[data-akitemm-categoria]').count(),4);
   await loja.locator('[data-akitemm-categoria="novidades"]').click();
   const anuncio=loja.locator('#novidadesVitrineAkitemm article.akitemm-novidade-publicacao')
    .filter({hasText:'LANÇAMENTO '+item.nick});
   await anuncio.waitFor();
   assert.equal(await anuncio.locator('img').count(),1);
   await anuncio.locator('img').evaluate(async img=>{
    if(!img.complete)await new Promise(resolve=>{
     img.addEventListener('load',resolve,{once:true});
     img.addEventListener('error',resolve,{once:true});
    });
   });
   assert.ok(await anuncio.locator('img').evaluate(img=>img.naturalWidth>0),
    'imagem da novidade precisa carregar na loja');
   await loja.locator('[data-akitemm-categoria="cursos"]').click();
   assert.ok(await loja.locator('#catalogoLojaLoop article.produto-loja-loop').count()>=2);
   assert.equal(await loja.locator('#novidadesVitrineAkitemm').isHidden(),true);
   await loja.locator('[data-akitemm-categoria="fisicos"]').click();
   assert.equal(await loja.locator('#catalogoLojaLoop article.produto-loja-loop').count(),0);
   await loja.locator('[data-akitemm-categoria="mais-vendidos"]').click();
   assert.equal(await loja.locator('#catalogoLojaLoop article.produto-loja-loop').count(),0,
    'ensaios nao sao vendas reais confirmadas');
   await loja.locator('#akitemmFiltroTodos').click();
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
   assert.match(await loja.locator('#statusPedidoLoja').textContent(),
    /sem cobrança gerada pela loja/);
   const pedidosLoja=await loja.evaluate(async()=>{
    const r=await fetch('/staging/vitrine/loja/pedidos',{credentials:'same-origin'});
    return {status:r.status,pedidos:(await r.json()).pedidos};
   });
   assert.equal(pedidosLoja.status,200);
   assert.equal(pedidosLoja.pedidos.length,3);
   assert.ok(pedidosLoja.pedidos.every(p=>p.estadoOperacional==='SEM_COBRANCA_SANDBOX'),
    'todas as leituras devem vir da fonte PSP, não de texto fixo no navegador');
   assert.match(await loja.locator('#pedidosLojaLoop').textContent(),
    /Pré-pedido preparado. Sem cobrança Pix registrada/);
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
