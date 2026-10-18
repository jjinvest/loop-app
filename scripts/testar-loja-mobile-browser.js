'use strict';

// Teste end-to-end com Chromium em viewport de telefone.
// Execucao somente via GitHub Actions/laboratorio, sem compradores reais.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {once}=require('node:events');
const {chromium}=require('playwright');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');

const pasta=path.join(__dirname,'..','artifacts','mobile-loop');
fs.mkdirSync(pasta,{recursive:true});
const senha='senha-ficticia-tela-mobile-2026';
const admin='chave-admin-mobile-lab-2026-1234567890';
const centavos=valor=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(valor/100);

function curso(id,nome,valor){
 return {id,nome,tipo:'PDF',estado:'PUBLICADO',
  descricao:'Curso inventado para simular a compra pelo navegador',
  precoCentavos:valor,entrega:'DOWNLOAD_APOS_CONFIRMACAO',
  fotos:[],videoApresentacaoUrl:null,detalhes:[]};
}
async function validarViewport(page,largura,rotulo){
 await page.setViewportSize({width:largura,height:812});
 await page.waitForTimeout(70);
 const medicao=await page.evaluate(()=>{
  const html=document.documentElement;
  return {janela:window.innerWidth,conteudo:html.scrollWidth,
   centro:document.querySelectorAll('.tabuleiro-centro').length,
   vagas:document.querySelectorAll('.tabuleiro-vaga-1, .tabuleiro-vaga-2, .tabuleiro-vaga-3, .tabuleiro-vaga-4, .tabuleiro-vaga-5, .tabuleiro-vaga-6').length,
   colunas:(getComputedStyle(document.querySelector('#mapaTabuleiroParticipante'))
    .gridTemplateColumns.split(' ').length)};
 });
 assert.ok(medicao.conteudo<=medicao.janela+1,
  rotulo+' '+largura+'px: rolagem horizontal inesperada '+
  JSON.stringify(medicao));
 assert.equal(medicao.centro,1,rotulo+' centro unico');
 assert.equal(medicao.vagas,6,rotulo+' seis vagas');
 assert.equal(medicao.colunas,3,rotulo+' tabuleiro em tres colunas');
 await page.screenshot({path:path.join(pasta,rotulo+'-'+largura+'px.png'),fullPage:true});
}
async function conferirLargura(page,largura,rotulo,{captura=false}={}){
 await page.setViewportSize({width:largura,height:812});
 await page.waitForTimeout(55);
 const tamanho=await page.evaluate(()=>({
  viewport:window.innerWidth,
  html:document.documentElement.scrollWidth,
  body:document.body.scrollWidth,
  controlesEstourando:[...document.querySelectorAll('input,select,button,a')].filter(e=>{
   if(!e.getClientRects().length)return false;
   // Menu lateral fechado fica intencionalmente fora da viewport.
   if(e.closest('.loop03-sidebar:not(.loop03-aberto)') &&
      window.matchMedia('(max-width:860px)').matches)return false;
   const r=e.getBoundingClientRect();
   return r.left < -2||r.right>window.innerWidth+2;
  }).slice(0,4).map(e=>({tag:e.tagName,id:e.id||null,classe:e.className||null}))
 }));
 assert.ok(tamanho.html<=tamanho.viewport+1&&tamanho.body<=tamanho.viewport+1,
  rotulo+' '+largura+'px: rolagem horizontal '+JSON.stringify(tamanho));
 assert.deepEqual(tamanho.controlesEstourando,[],
  rotulo+' '+largura+'px: controles fora da viewport');
 if(captura)await page.screenshot({
  path:path.join(pasta,rotulo+'-'+largura+'px.png'),fullPage:false
 });
}
async function main(){
 let banco,servidor,browser,page;
 try{
  banco=new RepositorioCatalogoSQLite({caminho:':memory:'});
  banco.salvar({produto:curso('curso-mobile-100','Curso Móvel Básico',10000),revisaoEsperada:0});
  banco.salvar({produto:curso('curso-mobile-150','Curso Móvel Completo',15000),revisaoEsperada:0});
  const contas=new ContasParticipantesDemoSQLite({banco:banco.banco});
  const titular=contas.cadastrar({
   nome:'Comprador Mobile Ficticio',email:'mobile@exemplo.invalid',senha
  });
  servidor=criarAppAdminLaboratorio({repositorio:banco,segredo:admin})
   .listen(0,'127.0.0.1');
  await once(servidor,'listening');
  const base='http://127.0.0.1:'+servidor.address().port;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const contexto=await browser.newContext({
   viewport:{width:390,height:812},deviceScaleFactor:1,
   isMobile:true,hasTouch:true
  });
  page=await contexto.newPage();
  const erros=[];
  page.on('pageerror',erro=>erros.push(erro.message));
  await page.goto(base+'/laboratorio/participante',{waitUntil:'networkidle'});
  await page.locator('#nomeParticipante').fill(titular.nome);
  await page.locator('#senhaParticipante').fill(senha);
  await page.locator('#botaoEntrarParticipante').click();
  await page.locator('#conteudoParticipante').waitFor({state:'visible'});
  assert.equal(await page.locator('.espaco-tabuleiro-demo').count(),7);
  assert.equal(await page.locator('.marcos-v6 span').count(),6);
  assert.equal(await page.locator('.marcos-v6 span:nth-child(odd)').count(),3);
  assert.equal(await page.locator('.marcos-v6 span:nth-child(even)').count(),3);
  await page.locator('#loop03Menu').click();
  await page.locator('.loop03-sidebar [data-loop03-aba="posicoes"]').click();
  assert.equal(await page.locator('#loop03OpcoesPosicoes > *').count(),6);
  assert.equal(await page.locator('#loop03Numero').innerText(),'#0000');
  assert.equal(await page.locator('#loop03TotalAtivacoes').innerText(),'6/6');
  await page.locator('#loop03Menu').click();
  await page.locator('.loop03-sidebar [data-loop03-aba="tabuleiro"]').click();
  await page.locator('#filtroTodasMapaParticipante').click();
  assert.equal(await page.locator('#filtroTodasMapaParticipante').getAttribute('aria-pressed'),'true');
  await page.locator('#filtroResumoMapaParticipante').click();
  await page.locator('.painel-tabuleiro-imersivo').screenshot({
   path:path.join(pasta,'tabuleiro-escritorio-mobile.png')
  });
  for(const width of [320,360,390,412])await validarViewport(page,width,'escritorio');

  await page.goto(base+'/laboratorio/loja',{waitUntil:'networkidle'});
  await page.locator('#conteudoLojaLoop').waitFor({state:'visible'});
  await page.locator('.produto-loja-loop').filter({hasText:'Curso Móvel Básico'})
   .getByRole('button',{name:'Adicionar ao carrinho'}).click();
  await page.locator('.produto-loja-loop').filter({hasText:'Curso Móvel Completo'})
   .getByRole('button',{name:'Adicionar ao carrinho'}).click();
  assert.equal(await page.locator('.item-carrinho-loja').count(),2);
  assert.ok((await page.locator('#totalLojaLoop').innerText()).includes(centavos(25000)));
  for(const width of [320,360,390,412]){
   await page.setViewportSize({width,height:812});
   await page.waitForTimeout(50);
   const tamanho=await page.evaluate(()=>({
    viewport:window.innerWidth,conteudo:document.documentElement.scrollWidth
   }));
   assert.ok(tamanho.conteudo<=tamanho.viewport+1,
    'loja '+width+'px: rolagem horizontal '+JSON.stringify(tamanho));
   await page.screenshot({path:path.join(pasta,'loja-'+width+'px.png'),fullPage:true});
  }
  await page.locator('#registrarPedidoLoja').click();
  // A lista inclui um texto vazio inicial; aguardar especificamente
  // o pedido criado evita a condicao de corrida da atualizacao da tela.
  await page.locator('#pedidosLojaLoop li')
   .filter({hasText:'Aguardando confirmação fictícia'}).first().waitFor();
  assert.match(await page.locator('#pedidosLojaLoop').innerText(),/Aguardando confirmação fictícia/);
  const registro=banco.banco.prepare(
   'SELECT pedido_id AS id,total_centavos AS total FROM admin_carrinho_loop_demo LIMIT 1'
  ).get();
  assert.equal(registro.total,25000);
  let pedidoStatus=await fetch(base+'/api/admin/carrinho-loop-demo/'+registro.id+'/eventos',{
   method:'POST',
   headers:{'Content-Type':'application/json',Authorization:'Bearer '+admin},
   body:JSON.stringify({eventoId:'evento-mobile-confirmado',
    tipo:'CONFIRMAR_FICTICIO'})
  });
  assert.equal(pedidoStatus.status,200);
  assert.equal((await pedidoStatus.json()).integracao.posicaoCriada,true);

  await page.goto(base+'/laboratorio/participante#tituloMapaParticipante',{
   waitUntil:'networkidle'
  });
  await page.locator('#conteudoParticipante').waitFor({state:'visible'});
  await page.locator('#filtroMinhasMapaParticipante').click();
  assert.equal(await page.locator('.linha-minha-demo').count(),1);
  assert.match(await page.locator('.linha-minha-demo').innerText(),/Minha/);
  assert.match(await page.locator('.linha-minha-demo').getAttribute('class'),/linha-minha-demo/);
  assert.equal(await page.locator('.linha-minha-demo .posicao-azul').count(),1);
  await page.screenshot({path:path.join(pasta,'escritorio-posicao-azul.png'),fullPage:true});

  await page.locator('#loop03Menu').click();
  await page.locator('.loop03-sidebar [data-loop03-aba="posicoes"]').click();
  assert.equal(await page.locator('#loop03OpcoesPosicoes > *').count(),6);
  assert.equal(await page.locator('#loop03OpcoesPosicoes .loop03-posicao-vazia').count(),5);
  assert.equal(await page.locator('#loop03OpcoesPosicoes .loop03-pendencia-ponto').count(),1);
  await page.locator('#loop03OpcoesPosicoes [data-loop03-posicao]').first().click();
  assert.equal(await page.locator('#loop03TotalAtivacoes').innerText(),'1/6');
  assert.equal(await page.locator('#loop03Numero').innerText(),'#1');
  await page.locator('#cpfFicticioParticipante').fill('11144477735');
  await page.locator('#aceiteTermosParticipante').check();
  await page.locator('#confirmarAtivacaoParticipante').click();
  await page.locator('#secaoAtivacaoParticipante').waitFor({state:'hidden'});
  assert.equal(await page.locator('#loop03OpcoesPosicoes .loop03-pendencia-ponto').count(),0);
  assert.equal(await page.locator('.linha-minha-demo .posicao-vermelho').count(),1);
  await page.screenshot({path:path.join(pasta,'escritorio-posicao-ativada.png'),fullPage:true});

  // Uma plataforma, não telas exclusivas de telefone: validar desktop real.
  // Mobile: visita também a prévia pública e todos os painéis administrativos.
  await page.goto(base+'/',{waitUntil:'networkidle'});
  assert.equal(await page.locator('.tabuleiro .vaga').count(),6);
  assert.equal(await page.locator('.tabuleiro .v6').count(),1);
  assert.equal(await page.locator('.marcos span').count(),6);
  assert.equal(await page.locator('.marcos span:nth-child(odd)').count(),3);
  assert.equal(await page.locator('.marcos span:nth-child(even)').count(),3);
  const coresMarcos=await page.evaluate(()=>{
   const odd=getComputedStyle(document.querySelector('.marcos span:first-child')).backgroundImage;
   const even=getComputedStyle(document.querySelector('.marcos span:nth-child(2)')).backgroundImage;
   return {odd,even,tema:[...document.styleSheets].some(s=>s.href?.includes('loop-futurista-v6.css'))};
  });
  assert.equal(coresMarcos.tema,true,'Tema metálico não carregou na apresentação');
  assert.notEqual(coresMarcos.odd,coresMarcos.even,'Roxo e preto devem ser visualmente distintos');
  for(const width of [320,390,768])
   await conferirLargura(page,width,'home-mobile',{captura:width===320});
  await page.setViewportSize({width:390,height:812});
  await page.locator('.painel-tabuleiro-loop').screenshot({
   path:path.join(pasta,'tabuleiro-publico-mobile.png')
  });

  await page.goto(base+'/admin/financeiro-demo',{waitUntil:'networkidle'});
  await page.locator('#chaveFinanceiroDemo').fill(admin);
  await page.locator('#abrirFinanceiroDemo').click();
  await page.locator('#dadosFinanceiroDemo').waitFor({state:'visible'});
  await page.locator('#criarDouradaManualDemo').click();
  await page.locator('#listaDouradasManuaisDemo li').first().waitFor();
  assert.match(await page.locator('#listaDouradasManuaisDemo').innerText(),/Posição #2/);
  await page.locator('#centroFinanceiroDemo').selectOption('dourado');
  await page.locator('#abrirFinanceiroDemo').click();
  await page.locator('#dadosFinanceiroDemo').waitFor({state:'visible'});
  assert.match(await page.locator('#cofresLoopFinanceiroDemo').innerText(),/dourad/i);
  for(const width of [320,390,768])
   await conferirLargura(page,width,'admin-financeiro-mobile',{captura:width===320});

  for(const rota of [
   ['/admin','admin-catalogo'],
   ['/admin/escritorio-demo','admin-escritorio'],
   ['/admin/cadastro-participantes-demo','admin-cadastros'],
   ['/produto.html?id=curso-mobile-100','produto-publico']
  ]){
   await page.goto(base+rota[0],{waitUntil:'networkidle'});
   for(const width of [320,390])
    await conferirLargura(page,width,rota[1]+'-mobile',{captura:width===320});
  }
  // Browser de computador, sem emular toque ou dispositivo móvel.
  const desktopCtx=await browser.newContext({
   viewport:{width:1366,height:900},deviceScaleFactor:1,isMobile:false
  });
  const desktop=await desktopCtx.newPage();
  desktop.on('pageerror',erro=>erros.push('desktop: '+erro.message));
  await desktop.goto(base+'/laboratorio/participante',{waitUntil:'networkidle'});
  await desktop.locator('#nomeParticipante').fill(titular.nome);
  await desktop.locator('#senhaParticipante').fill(senha);
  await desktop.locator('#botaoEntrarParticipante').click();
  await desktop.locator('#conteudoParticipante').waitFor({state:'visible'});
  for(const width of [768,1024,1366]){
   await conferirLargura(desktop,width,'escritorio-desktop',{captura:width===1366});
   assert.equal(await desktop.locator('.tabuleiro-vaga-6').count(),1);
  }
  await desktop.goto(base+'/laboratorio/loja',{waitUntil:'networkidle'});
  await desktop.locator('#conteudoLojaLoop').waitFor({state:'visible'});
  for(const width of [768,1024,1366])
   await conferirLargura(desktop,width,'loja-desktop',{captura:width===1366});
  await desktop.goto(base+'/admin/financeiro-demo',{waitUntil:'networkidle'});
  await desktop.locator('#chaveFinanceiroDemo').fill(admin);
  await desktop.locator('#abrirFinanceiroDemo').click();
  await desktop.locator('#dadosFinanceiroDemo').waitFor({state:'visible'});
  for(const width of [768,1024,1366])
   await conferirLargura(desktop,width,'admin-financeiro-desktop',{captura:width===1366});
  for(const [rota,rotulo] of [
   ['/','home-desktop'],
   ['/admin','admin-catalogo-desktop'],
   ['/admin/escritorio-demo','admin-escritorio-desktop'],
   ['/admin/cadastro-participantes-demo','admin-cadastro-desktop'],
   ['/produto.html?id=curso-mobile-100','produto-publico-desktop']
  ]){
   await desktop.goto(base+rota,{waitUntil:'networkidle'});
   await conferirLargura(desktop,1366,rotulo,{captura:true});
   if(rota==='/')assert.equal(await desktop.locator('.tabuleiro .vaga').count(),6);
  }
  await desktop.goto(base+'/',{waitUntil:'networkidle'});
  await desktop.locator('.painel-tabuleiro-loop').screenshot({
   path:path.join(pasta,'tabuleiro-publico-desktop.png')
  });
  await desktopCtx.close();

  assert.deepEqual(erros,[], 'Erros de execucao no navegador');
  const relatorio={status:'APROVADO',
   tamanhosPx:[320,360,390,412,768,1024,1366],
   paginasVerificadas:['home','escritorio-participante','loja','admin-financeiro',
    'admin-catalogo','admin-escritorio','admin-cadastro','produto'],
   celularEComputador:true,douradaCriadaPeloNavegador:true,pedidosCriados:1,
   totalPedidoCentavos:25000,clienteFicticio:true,
   lojaParaEscritorio:true,ativacaoAzulParaVermelho:true,
   semRolagemHorizontal:true,imagens:fs.readdirSync(pasta).filter(x=>x.endsWith('.png'))};
  fs.writeFileSync(path.join(pasta,'resultado.json'),JSON.stringify(relatorio,null,2)+'\n');
  process.stdout.write('MOBILE_LOOP_RESULTADO='+JSON.stringify(relatorio)+'\n');
 }catch(erro){
  if(page){
   try{await page.screenshot({path:path.join(pasta,'erro-visual-mobile.png'),fullPage:true});}
   catch{}
  }
  fs.writeFileSync(path.join(pasta,'erro.txt'),String(erro.stack||erro));
  throw erro;
 }finally{
  if(browser)await browser.close();
  if(servidor)await new Promise(resolve=>servidor.close(resolve));
  if(banco)banco.fechar();
 }
}
main().catch(erro=>{
 process.stderr.write('FALHA_TESTE_BROWSER_MOBILE_LOOP: '+(erro.stack||erro)+'\n');
 process.exitCode=1;
});