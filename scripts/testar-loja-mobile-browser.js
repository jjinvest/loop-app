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
  banco.salvar({produto:curso('curso-cinza-30','Curso Cinza Comum',3000),revisaoEsperada:0});
  banco.salvar({produto:curso('curso-especial-600','Curso Evento Dourado Roxo',60000),revisaoEsperada:0});
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
  // Captura REAL de filas A e B vazias antes de qualquer compra, sem pessoas falsas.
  const ctxFilasVazias=await browser.newContext({viewport:{width:1254,height:1254},deviceScaleFactor:1});
  const telaFilasVazias=await ctxFilasVazias.newPage();
  await telaFilasVazias.goto(base+'/laboratorio/participante',{waitUntil:'networkidle'});
  await telaFilasVazias.locator('#nomeParticipante').fill(titular.nome);
  await telaFilasVazias.locator('#senhaParticipante').fill(senha);
  await telaFilasVazias.locator('#botaoEntrarParticipante').click();
  await telaFilasVazias.locator('#conteudoParticipante').waitFor({state:'visible'});
  await telaFilasVazias.locator('#loop03Sidebar [data-loop03-aba="tabuleiro"]').click();
  await telaFilasVazias.locator('#loop03-tabuleiro').waitFor({state:'visible'});
  assert.equal(await telaFilasVazias.locator('#mapaFilaAParticipante li').count(),0);
  assert.equal(await telaFilasVazias.locator('#mapaFilaBParticipante li').count(),0);
  await telaFilasVazias.screenshot({path:path.join(pasta,'TABULEIRO_FILAS_VAZIAS_SEM_PESSOAS.png'),fullPage:false});
  await ctxFilasVazias.close();

  // As quatro telas de verdade compartilham a mesma atmosfera animada.
  // A preferencia de acessibilidade cancela o movimento, sem ocultar o painel.
  const cosmos=await page.evaluate(()=>['home','tabuleiro','posicoes','rede'].map(aba=>{
   const secao=document.getElementById('loop03-'+aba);
   const estilo=getComputedStyle(secao,'::before');
   const estrelas=getComputedStyle(secao,'::after');
   return {aba,nebulosa:estilo.animationName,estrelas:estrelas.animationName};
  }));
  for(const efeito of cosmos){
   assert.equal(efeito.nebulosa,'loop30Nebulosa',efeito.aba+' com movimento');
   assert.equal(efeito.estrelas,'loop30Estrelas',efeito.aba+' com estrelas');
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('#loop03-home').evaluate(el=>
   getComputedStyle(el,'::before').animationName),'none');
  await page.emulateMedia({reducedMotion:'no-preference'});
  assert.equal(await page.locator('.espaco-tabuleiro-demo').count(),7);
  assert.equal(await page.locator('.marcos-v6 span').count(),6);
  assert.equal(await page.locator('.marcos-v6 span:nth-child(odd)').count(),3);
  assert.equal(await page.locator('.marcos-v6 span:nth-child(even)').count(),3);
  assert.equal(await page.locator('#loop03RelogioCiclo').innerText(),'--:--:--');
  assert.equal(await page.locator('#loop03-tabuleiro .loop03-explicacao-catraca p').count(),2);
  assert.equal(await page.locator('#mapaFilaAParticipante .fila-vazia-demo').count(),0);
  assert.equal(await page.locator('#mapaFilaBParticipante .fila-vazia-demo').count(),0);
  const destinos=['home','tabuleiro','posicoes','rede','financeiro','/loja'];
  assert.deepEqual(await page.locator('#loop03Sidebar nav > *').evaluateAll(nodes=>
   nodes.map(n=>n.dataset.loop03Aba||n.getAttribute('href'))),destinos);
  assert.equal(await page.locator('#loop03Sidebar nav').getByText(/Ativações/i).count(),0);
  assert.equal(await page.locator('.atalhos-participante').isVisible(),false);
  for(const aba of destinos.slice(0,5)){
   await page.locator('#loop03Menu').click();
   await page.locator('#loop03Sidebar [data-loop03-aba="'+aba+'"]').click();
   await page.locator('#loop03-'+aba).waitFor({state:'visible'});
   assert.equal(await page.locator('.loop03-pagina:not([hidden])').count(),1);
   assert.equal(await page.locator('#loop03Sidebar [data-loop03-aba="'+aba+'"]')
    .getAttribute('aria-current'),'page');
  }
  await page.locator('#loop03Menu').click();
  await page.locator('#loop03Sidebar [data-loop03-aba="home"]').click();
  await page.locator('#loop03Menu').click();
  await page.locator('.loop03-sidebar [data-loop03-aba="posicoes"]').click();
  assert.equal(await page.locator('#loop03OpcoesPosicoes > *').count(),6);
  // Mesmo visual aprovado: 3 posições em cima e 3 embaixo no celular em pé.
  const medir=()=>page.locator('#loop03OpcoesPosicoes > *').evaluateAll(nodes=>
   nodes.map(node=>({x:node.getBoundingClientRect().x,y:node.getBoundingClientRect().y})));
  const pe=await medir();
  assert.equal(pe.length,6);
  assert.ok(Math.abs(pe[0].y-pe[2].y)<2,'3 cartões na primeira linha em pé');
  assert.ok(pe[3].y>pe[2].y+20,'3 cartões na segunda linha em pé');
  assert.ok(Math.abs(pe[3].y-pe[5].y)<2,'3 cartões alinhados embaixo');
  await page.screenshot({path:path.join(pasta,'minhas-posicoes-celular-em-pe-3x2.png'),fullPage:false});
  // Ao girar o mesmo celular, sua lateral reaparece como na tela do computador.
  await page.setViewportSize({width:844,height:390});
  await page.waitForTimeout(260);
  const paisagem=await page.evaluate(()=>{
   const nav=document.getElementById('loop03Sidebar');
   return {position:getComputedStyle(nav).position,
    transform:getComputedStyle(nav).transform,
    left:nav.getBoundingClientRect().x,
    width:nav.getBoundingClientRect().width,
    mainLeft:document.getElementById('loop03-posicoes').getBoundingClientRect().x};
  });
  assert.equal(paisagem.position,'sticky','lateral deitada no mesmo estilo desktop');
  assert.equal(paisagem.transform,'none','lateral visível deitada');
  assert.ok(paisagem.width>110&&paisagem.left<paisagem.mainLeft,'lateral à esquerda');
  const deitado=await medir();
  assert.ok(Math.abs(deitado[0].y-deitado[2].y)<2,'3 em cima deitado');
  assert.ok(deitado[3].y>deitado[2].y+20,'3 embaixo deitado');
  await page.screenshot({path:path.join(pasta,'minhas-posicoes-celular-deitado-3x2.png'),fullPage:false});
  await page.setViewportSize({width:390,height:812});
  await page.waitForTimeout(260);

  // Antes de compras e eventos: zero so com valor confirmado na fonte do laboratorio.
  assert.equal(await page.locator('#loop03Numero').innerText(),'#0000');
  assert.equal(await page.locator('#loop03TotalAtivacoes').innerText(),'0/6');
  assert.equal(await page.locator('#loop03Giros24').innerText(),'0');
  assert.match(await page.locator('#loop03Saldo').innerText(),/^R\$\s*0,00$/);
  // Cada indicador/caminho executa uma navegacao real, sem ligacao apenas decorativa.
  await page.locator('.loop03-indicadores [data-loop03-aba="posicoes"]').first().click();
  assert.equal(await page.locator('#loop03-posicoes').isVisible(),true);
  await page.locator('.loop03-indicadores [data-loop03-aba="posicoes"]').nth(1).click();
  assert.equal(await page.locator('#loop03-posicoes').isVisible(),true);
  await page.locator('.loop03-indicadores [data-loop03-aba="financeiro"]').click();
  assert.equal(await page.locator('#loop03-financeiro').isVisible(),true);
  await page.locator('.loop03-indicadores [data-loop03-aba="tabuleiro"]').click();
  assert.equal(await page.locator('#loop03-tabuleiro').isVisible(),true);
  await page.locator('.loop03-sino').click();
  assert.equal(await page.locator('#loop03-home').isVisible(),true);
  assert.match(await page.locator('#loop03RelogioCiclo').getAttribute('aria-label'),/Aguardando evento válido/);
  await page.locator('#loop03Menu').click();
  await page.locator('.loop03-sidebar [data-loop03-aba="tabuleiro"]').click();
  // Três filtros e seletor verde foram removidos, sem alterar as outras abas.
  assert.equal(await page.locator('.controle-mapa-participante').count(),0);
  assert.equal(await page.locator('#loop03EscolherNoTabuleiro').count(),0);
  assert.equal(await page.locator('#loop03EscolhaTexto').count(),0);
  // Medição real do DOM no celular: roda PRIMEIRO, filas A/B ABAIXO,
  // lado a lado. Centro e seis vagas continuam ligados aos dados reais.
  const medirFilas=async()=>page.evaluate(()=>{
   const box=selector=>{
    const r=document.querySelector(selector).getBoundingClientRect();
    return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};
   };
   return {
    a:box('#loop03-tabuleiro .bloco-fila-participante:first-child'),
    b:box('#loop03-tabuleiro .bloco-fila-participante:last-child'),
    roda:box('#loop03-tabuleiro .loop03-roda')
   };
  });
  const confirmarLadoALado=async largura=>{
   const dim=await medirFilas();
   assert.ok(Math.abs(dim.a.y-dim.b.y)<=3,
    'Fila A/B lado a lado '+largura+'px: '+JSON.stringify(dim));
   assert.ok(dim.a.x+dim.a.width<=dim.b.x+3,
    'Fila A deve ficar à esquerda da B '+largura+'px');
   assert.ok(dim.a.y>=dim.roda.bottom-3 && dim.b.y>=dim.roda.bottom-3,
    'Fila A e Fila B devem ficar ABAIXO do Tabuleiro '+largura+'px: '+JSON.stringify(dim));
  };
  await confirmarLadoALado(390);
  await page.screenshot({
   path:path.join(pasta,'TABULEIRO_CELULAR_FILAS_LADO_A_LADO_REAL.png'),
   fullPage:true
  });
  const botaoFilaA=page.locator('.loop03-cabecalho-fila-a .loop03-abrir-fila');
  const botaoFilaB=page.locator('.loop03-cabecalho-fila-b .loop03-abrir-fila');
  await botaoFilaA.click();
  assert.equal(await botaoFilaA.getAttribute('aria-expanded'),'true');
  assert.ok(await page.locator('.loop03-fila-expandida').evaluate(p=>p.getBoundingClientRect().height>=300),
   'Fila A ampliada precisa ter altura suficiente mesmo sem pessoas');
  await page.screenshot({
   path:path.join(pasta,'TABULEIRO_CELULAR_FILA_A_ABERTA_REAL.png'),
   fullPage:false
  });
  assert.equal(await page.locator('.loop03-fila-expandida').count(),1);
  await page.keyboard.press('Escape');
  assert.equal(await botaoFilaA.getAttribute('aria-expanded'),'false');
  await botaoFilaB.click();
  assert.equal(await botaoFilaB.getAttribute('aria-expanded'),'true');
  assert.ok(await page.locator('.loop03-fila-expandida').evaluate(p=>p.getBoundingClientRect().height>=300),
   'Fila B ampliada precisa ter altura suficiente mesmo sem pessoas');
  await page.screenshot({
   path:path.join(pasta,'TABULEIRO_CELULAR_FILA_B_ABERTA_REAL.png'),
   fullPage:false
  });
  await botaoFilaB.click();
  assert.equal(await botaoFilaB.getAttribute('aria-expanded'),'false');
  await page.locator('.painel-tabuleiro-imersivo').screenshot({
   path:path.join(pasta,'tabuleiro-escritorio-mobile.png')
  });
  for(const width of [320,360,390,412]){
   await validarViewport(page,width,'escritorio');
   await confirmarLadoALado(width);
  }

  // O ADMIN escolhe explicitamente as tres categorias antes de abrir a vitrine.
  const cabShop={'Content-Type':'application/json',Authorization:'Bearer '+admin};
  const cinza=await fetch(base+'/api/admin/carrinho-loop-demo/elegibilidade',{
   method:'POST',headers:cabShop,
   body:JSON.stringify({produtoId:'curso-cinza-30',elegivelLoop:false,revisaoEsperada:1})
  });
  assert.equal(cinza.status,200,await cinza.text());
  const dia=new Date().toISOString().slice(0,10);
  const fim=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  const eventoLoja=await fetch(base+'/api/admin/carrinho-loop-demo/eventos-especiais',{
   method:'POST',headers:cabShop,body:JSON.stringify({
    eventoId:'evento-vitrine-dourada-roxa',produtoId:'curso-especial-600',
    titulo:'Evento Dourado com Roxo AKITEMM',
    descricao:'Compra de um curso especial pode gerar duas posicoes no LOOP',
    quantidadeMinimaLoop:1,posicoesPorPedidoLoop:2,
    dataInicio:dia,dataFim:fim
   })
  });
  assert.equal(eventoLoja.status,201,await eventoLoja.text());
  await page.goto(base+'/laboratorio/loja',{waitUntil:'networkidle'});
  await page.locator('#conteudoLojaLoop').waitFor({state:'visible'});
  // CINZA sem posicoes; VERDE acumula ate 1; DOURADO+ROXO apenas no evento.
  const cinzaCard=page.locator('.produto-loja-loop').filter({hasText:'Curso Cinza Comum'});
  const verdeCard=page.locator('.produto-loja-loop').filter({hasText:'Curso Móvel Básico'});
  const eventoCard=page.locator('.produto-loja-loop').filter({hasText:'Curso Evento Dourado Roxo'});
  assert.equal(await cinzaCard.count(),1);
  assert.equal(await cinzaCard.getAttribute('class'),'produto-loja-loop produto-loja-loop-nao-elegivel');
  assert.equal(await verdeCard.getAttribute('class'),'produto-loja-loop produto-loja-loop-elegivel');
  assert.equal(await eventoCard.getAttribute('class'),'produto-loja-loop produto-loja-loop-especial');
  assert.equal(await eventoCard.locator('.tarja-promocao-especial-loop').innerText(),'PROMOÇÃO ESPECIAL');
  assert.match(await eventoCard.locator('.datas-promocao-especial-loop').innerText(),
   /De \d{4}-\d{2}-\d{2} até \d{4}-\d{2}-\d{2}.*2 posições/);
  const cores=await eventoCard.evaluate(node=>{
   const tarja=node.querySelector('.tarja-promocao-especial-loop');
   return {borda:getComputedStyle(node).borderColor,
    tarja:getComputedStyle(tarja).backgroundImage,
    fundo:getComputedStyle(node).backgroundImage};
  });
  assert.equal(cores.borda,'rgb(232, 188, 88)','Borda de promoção deve ser DOURADA');
  assert.match(cores.tarja,/rgb\(90, 49, 142\)/,'Tarja deve ser ROXA e dourada');
  assert.match(cores.fundo,/rgb\(49, 32, 80\)/,'Fundo deve ser ROXO');
  assert.equal(await eventoCard.locator('.tarja-vermelha-promocao-loop').count(),0);
  // Borda viva de ambas as classes com conteudo estatico e eventos sem
  // piscadas agressivas. A classe CINZA deve permanecer SEM animacao.
  await page.emulateMedia({reducedMotion:'no-preference'});
  const animacoes=await page.evaluate(()=>{
   const leitura=classe=>{
    const card=document.querySelector(classe);
    const before=getComputedStyle(card,'::before');
    return {nome:before.animationName,duracao:before.animationDuration,
     ponteiro:before.pointerEvents,contorno:before.borderRadius};
   };
   return {verde:leitura('.produto-loja-loop-elegivel'),
    ouro:leitura('.produto-loja-loop-especial'),
    cinza:leitura('.produto-loja-loop-nao-elegivel')};
  });
  assert.equal(animacoes.verde.nome,'loop-akitemm-borda-viva');
  assert.equal(animacoes.verde.duracao,'10s');
  assert.equal(animacoes.ouro.nome,'loop-akitemm-borda-viva');
  assert.equal(animacoes.ouro.duracao,'8s');
  assert.equal(animacoes.verde.ponteiro,'none');
  assert.equal(animacoes.ouro.ponteiro,'none');
  assert.equal(animacoes.cinza.nome,'none');
  await page.emulateMedia({reducedMotion:'reduce'});
  const reduzidas=await page.evaluate(()=>({
   verde:getComputedStyle(document.querySelector('.produto-loja-loop-elegivel'),'::before').animationName,
   ouro:getComputedStyle(document.querySelector('.produto-loja-loop-especial'),'::before').animationName
  }));
  assert.equal(reduzidas.verde,'none');
  assert.equal(reduzidas.ouro,'none');
  await page.emulateMedia({reducedMotion:'no-preference'});
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
  await page.locator('.loop03-cabecalho-fila-b .loop03-abrir-fila').click();
  assert.equal(await page.locator('.loop03-cabecalho-fila-b .loop03-abrir-fila').getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('.linha-minha-demo').count(),1);
  assert.match(await page.locator('.linha-minha-demo .loop03-numero-titular')
   .innerText(),/^#\d+$/);
  assert.match(await page.locator('.linha-minha-demo .loop03-numero-titular')
   .getAttribute('aria-label'),/minha posição/);
  assert.match(await page.locator('.linha-minha-demo').getAttribute('class'),/linha-minha-demo/);
  assert.equal(await page.locator('.linha-minha-demo .posicao-azul').count(),1);
  await page.locator('.loop03-cabecalho-fila-b .loop03-abrir-fila').click();
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

  // Percurso do cliente: convidado compra PDF; o titular precisa distribuir.
  const convidado=contas.cadastrar({
   nome:'Indicado Teste Mobile',email:'indicado-mobile@exemplo.invalid',
   senha,codigoIndicador:titular.codigoConvite
  });
  const cabAdmin={'Content-Type':'application/json',Authorization:'Bearer '+admin};
  const compraConvidado=await fetch(base+'/api/admin/carrinho-loop-demo',{
   method:'POST',headers:cabAdmin,
   body:JSON.stringify({pedidoId:'pedido-do-indicado-mobile',contaId:convidado.contaId,
    itens:[{produtoId:'curso-mobile-100',quantidade:1},{produtoId:'curso-mobile-150',quantidade:1}]})
  });
  assert.equal(compraConvidado.status,201,await compraConvidado.text());
  const confirmouConvidado=await fetch(base+
   '/api/admin/carrinho-loop-demo/pedido-do-indicado-mobile/eventos',{
   method:'POST',headers:cabAdmin,
   body:JSON.stringify({eventoId:'evento-indicado-mobile',tipo:'CONFIRMAR_FICTICIO'})
  });
  assert.equal(confirmouConvidado.status,200,await confirmouConvidado.text());
  await page.goto(base+'/laboratorio/participante',{waitUntil:'networkidle'});
  await page.locator('#conteudoParticipante').waitFor({state:'visible'});
  await page.locator('#loop03Menu').click();
  await page.locator('#loop03Sidebar [data-loop03-aba="rede"]').click();
  assert.equal(await page.locator('#loop03RedeTotalPosicoes').innerText(),'1');
  assert.equal(await page.locator('#loop03RedeADistribuir').innerText(),'1');
  await page.screenshot({path:path.join(pasta,'rede-indicado-aguardando.png'),fullPage:true});
  // Outro navegador, outra conta. Ativar a posicao do indicado nao promove o titular.
  const ctxIndicado=await browser.newContext({viewport:{width:390,height:812},
   deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const paginaIndicado=await ctxIndicado.newPage();
  paginaIndicado.on('pageerror',err=>erros.push('convidado: '+err.message));
  await paginaIndicado.goto(base+'/laboratorio/participante',{waitUntil:'networkidle'});
  await paginaIndicado.locator('#nomeParticipante').fill(convidado.nome);
  await paginaIndicado.locator('#senhaParticipante').fill(senha);
  await paginaIndicado.locator('#botaoEntrarParticipante').click();
  await paginaIndicado.locator('#conteudoParticipante').waitFor({state:'visible'});
  await paginaIndicado.locator('#loop03Menu').click();
  await paginaIndicado.locator('#loop03Sidebar [data-loop03-aba="posicoes"]').click();
  await paginaIndicado.locator('#loop03OpcoesPosicoes [data-loop03-posicao]').first().click();
  await paginaIndicado.locator('#cpfFicticioParticipante').fill('52998224725');
  await paginaIndicado.locator('#aceiteTermosParticipante').check();
  await paginaIndicado.locator('#confirmarAtivacaoParticipante').click();
  await paginaIndicado.locator('#secaoAtivacaoParticipante').waitFor({state:'hidden'});
  await ctxIndicado.close();
  await page.reload({waitUntil:'networkidle'});
  await page.locator('#conteudoParticipante').waitFor({state:'visible'});
  await page.locator('#loop03Menu').click();
  await page.locator('#loop03Sidebar [data-loop03-aba="rede"]').click();
  assert.equal(await page.locator('#loop03RedeTotalPosicoes').innerText(),'1');
  assert.equal(await page.locator('#loop03RedeADistribuir').innerText(),'1');
  const linhaIndicado=page.locator('#loop03ListaEquipe .loop03-equipe-linha')
   .filter({hasText:convidado.nome});
  await linhaIndicado.getByRole('button',{name:'Escolher posição para '+convidado.nome}).click();
  await linhaIndicado.getByRole('combobox',{name:'Posição destinatária'}).selectOption('1');
  page.once('dialog',dialog=>dialog.accept());
  await linhaIndicado.getByRole('button',{name:'Confirmar vínculo definitivo'}).click();
  await page.waitForFunction(()=>document.querySelector('#loop03RedeADistribuir')?.textContent==='0');
  assert.equal(await page.locator('#loop03RedeTotalPosicoes').innerText(),'1');
  assert.equal(await page.locator('#loop03RedeADistribuir').innerText(),'0');
  await page.screenshot({path:path.join(pasta,'rede-um-indicado-distribuido.png'),fullPage:true});
  // Confere a nova distribuicao +1 sem nomes nos seis cartoes aprovados.
  const novoIndicado=contas.cadastrar({
   nome:'Segundo Indicado Mobile',email:'segundo-indicado@exemplo.invalid',
   senha,codigoIndicador:titular.codigoConvite
  });
  const pedidoNovo=await fetch(base+'/api/admin/carrinho-loop-demo',{
   method:'POST',headers:cabAdmin,
   body:JSON.stringify({pedidoId:'segundo-indicado-mobile-mais-um',
    contaId:novoIndicado.contaId,
    itens:[{produtoId:'curso-mobile-100',quantidade:1},
     {produtoId:'curso-mobile-150',quantidade:1}]})
  });
  assert.equal(pedidoNovo.status,201,await pedidoNovo.text());
  const confirmNovo=await fetch(base+
   '/api/admin/carrinho-loop-demo/segundo-indicado-mobile-mais-um/eventos',{
   method:'POST',headers:cabAdmin,
   body:JSON.stringify({eventoId:'evento-segundo-indicado-mobile',tipo:'CONFIRMAR_FICTICIO'})
  });
  assert.equal(confirmNovo.status,200,await confirmNovo.text());
  const ctxNovo=await browser.newContext({viewport:{width:390,height:812},
   deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const novaPagina=await ctxNovo.newPage();
  novaPagina.on('pageerror',err=>erros.push('indicado +1: '+err.message));
  await novaPagina.goto(base+'/laboratorio/participante',{waitUntil:'networkidle'});
  await novaPagina.locator('#nomeParticipante').fill(novoIndicado.nome);
  await novaPagina.locator('#senhaParticipante').fill(senha);
  await novaPagina.locator('#botaoEntrarParticipante').click();
  await novaPagina.locator('#conteudoParticipante').waitFor({state:'visible'});
  await novaPagina.locator('#loop03Menu').click();
  await novaPagina.locator('#loop03Sidebar [data-loop03-aba="posicoes"]').click();
  await novaPagina.locator('#loop03OpcoesPosicoes [data-loop03-posicao]').first().click();
  await novaPagina.locator('#cpfFicticioParticipante').fill('12345678909');
  await novaPagina.locator('#aceiteTermosParticipante').check();
  await novaPagina.locator('#confirmarAtivacaoParticipante').click();
  await novaPagina.locator('#secaoAtivacaoParticipante').waitFor({state:'hidden'});
  await ctxNovo.close();
  await page.reload({waitUntil:'networkidle'});
  await page.locator('#conteudoParticipante').waitFor({state:'visible'});
  await page.locator('#loop03Menu').click();
  await page.locator('#loop03Sidebar [data-loop03-aba="posicoes"]').click();
  assert.equal(await page.locator('#loop03SaldoDisponivel').innerText(),'1');
  assert.equal(await page.locator('#loop03OpcoesPosicoes .loop03-adicionar-indicado').count(),1);
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#loop03OpcoesPosicoes .loop03-adicionar-indicado').first().click();
  await page.waitForFunction(()=>document.querySelector('#loop03SaldoDisponivel')?.textContent==='0');
  assert.match(await page.locator('#loop03OpcoesPosicoes').innerText(),/2 indicações válidas/);
  await page.screenshot({path:path.join(pasta,'minhas-posicoes-botao-mais-um.png'),fullPage:true});
  await page.locator('#loop03Menu').click();
  await page.locator('#loop03Sidebar [data-loop03-aba="rede"]').click();
  assert.match(await page.locator('#loop03ListaEquipe .loop03-equipe-linha')
   .filter({hasText:novoIndicado.nome}).innerText(),/Vinculada à posição #1/);
  // A barra lateral possui animacao de 0,2 s no mobile: a captura deve
  // mostrar a aba Minha Equipe, nao uma sobreposicao transitoria do menu.
  await page.waitForFunction(()=>
   !document.querySelector('#loop03Sidebar')?.classList.contains('loop03-aberto'));
  await page.waitForTimeout(350);
  await page.screenshot({path:path.join(pasta,'minha-equipe-duas-atribuicoes.png'),fullPage:true});

  await page.locator('#loop03Menu').click();
  await page.locator('#loop03Sidebar [data-loop03-aba="tabuleiro"]').click();
  await page.locator('.loop03-cabecalho-fila-a .loop03-abrir-fila').click();
  assert.equal(await page.locator('.loop03-cabecalho-fila-a .loop03-abrir-fila').getAttribute('aria-expanded'),'true');
  const promovida=page.locator('#mapaFilaAParticipante .loop03-linha-fila').filter({hasText:'#1'});
  assert.equal(await promovida.count(),1);
  assert.equal(await promovida.locator('.loop03-inicial-fila.loop03-a').innerText(),'A');
  assert.equal(await promovida.locator('.loop03-quantidade-a-direita').innerText(),'2');
  assert.equal(await promovida.locator('.loop03-bonequinho-indicacoes').count(),1);
  assert.equal(await page.locator('#mapaFilaBParticipante .loop03-quantidade-a-direita').count(),0);
  await page.screenshot({path:path.join(pasta,'fila-a-contagem-posicao.png'),fullPage:true});
  await page.locator('.loop03-cabecalho-fila-a .loop03-abrir-fila').click();
  // Quatro capturas REAIS da mesma conta ficticia e mesmo layout funcional.
  // Referencias PNG aprovadas sao arquivos separados, nao estas capturas.
  const ctxQuadros=await browser.newContext({
   viewport:{width:1254,height:1254},deviceScaleFactor:1
  });
  const quatroAbas=await ctxQuadros.newPage();
  quatroAbas.on('pageerror',err=>erros.push('painel quatro abas: '+err.message));
  await quatroAbas.goto(base+'/laboratorio/participante',{waitUntil:'networkidle'});
  await quatroAbas.locator('#nomeParticipante').fill(titular.nome);
  await quatroAbas.locator('#senhaParticipante').fill(senha);
  await quatroAbas.locator('#botaoEntrarParticipante').click();
  await quatroAbas.locator('#conteudoParticipante').waitFor({state:'visible'});
  const fotos=[
   ['home','LOOP_TELA_01_ESCRITORIO_VIRTUAL.png'],
   ['tabuleiro','LOOP_TELA_02_TABULEIRO.png'],
   ['posicoes','LOOP_TELA_03_MINHAS_POSICOES.png'],
   ['rede','LOOP_TELA_04_MINHA_EQUIPE.png']
  ];
  for(const [aba,arquivo] of fotos){
   await quatroAbas.locator('#loop03Sidebar [data-loop03-aba="'+aba+'"]').click();
   await quatroAbas.locator('#loop03-'+aba).waitFor({state:'visible'});
   await quatroAbas.waitForTimeout(170);
   await quatroAbas.screenshot({path:path.join(pasta,arquivo),fullPage:false});
   await quatroAbas.screenshot({path:path.join(pasta,arquivo.replace('.png','_COMPLETA.png')),fullPage:true});
  }
  await ctxQuadros.close();


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

  // Painel real do proprietário: seleção de vaga protegida por chave local.
  await page.goto(base+'/admin/loop03',{waitUntil:'networkidle'});
  await page.locator('#chaveAdminLoop03').fill(admin);
  await page.locator('#formAcessoAdminLoop03 button[type=submit]').click();
  await page.locator('#dadosAdminLoop03').waitFor({state:'visible'});
  assert.equal(await page.locator('#indicacoesConfirmadasAdmin').innerText(),'2');
  assert.equal(await page.locator('#indicacoesVinculadasAdmin').innerText(),'2');
  assert.equal(await page.locator('#indicacoesDisponiveisAdmin').innerText(),'0');
  assert.match(await page.locator('#painelIndicacoesAdmin').innerText(),/três amarelas e uma branca/i);
  assert.equal(await page.locator('#numeroVagaAdmin').innerText(),'6');
  await page.locator('#vagaAdminLoop03').selectOption('4');
  await page.locator('#motivoAdminLoop03').fill('Revisão interna da alternância');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#formRegraAdminLoop03 button[type=submit]').click();
  await page.locator('#numeroVagaAdmin').getByText('4').waitFor();
  assert.match(await page.locator('#listaHistoricoAdminLoop03').innerText(),/Vaga 6 → 4/);
  for(const largura of [320,390,768])await conferirLargura(page,largura,'admin-loop03',{captura:true});
  await page.screenshot({path:path.join(pasta,'escritorio-administrador-mobile.png'),fullPage:true});

  await page.goto(base+'/admin/financeiro-demo',{waitUntil:'networkidle'});
  await page.locator('#chaveFinanceiroDemo').fill(admin);
  await page.locator('#abrirFinanceiroDemo').click();
  await page.locator('#dadosFinanceiroDemo').waitFor({state:'visible'});
  await page.locator('#caixa2CapacidadeFinanceiroDemo').waitFor({state:'visible'});
  await page.waitForFunction(()=>
   /pré-lançamento fictício|Saldo livre/.test(
    document.querySelector('#statusCaixa2FinanceiroDemo')?.textContent||''
   )
  );
  assert.equal(await page.locator('#caixa2LivreFinanceiroDemo').innerText(),'—');
  // Uma resposta coerente pode preencher o painel, mas nao e dinheiro real.
  // Se uma nova conferencia falhar, todos os valores antigos SOMEM.
  const resumoMock={
   fase:'ATIVO',quantidadeDivergencias:0,
   cofreDireitaSimuladoCentavos:50000,
   bonificacoesComprometidasCentavos:2500,
   reservaDouradasComprometidaCentavos:25000,
   gestaoPendenteComprometidaCentavos:10000,
   cofreDireitaDisponivelSimuladoCentavos:12500,
   cofreCentroRestanteSimuladoCentavos:120000
  };
  const urlConcil=base+'/api/admin/circuit-break-v6-demo/ponte/conciliacao';
  await page.route(urlConcil,rota=>rota.fulfill({
   status:200,contentType:'application/json',body:JSON.stringify(resumoMock)
  }));
  await page.locator('#atualizarCaixa2FinanceiroDemo').click();
  await page.waitForFunction(()=>
   document.querySelector('#caixa2LivreFinanceiroDemo')?.textContent==='R$ 125,00' ||
   document.querySelector('#caixa2LivreFinanceiroDemo')?.textContent==='R$ 125,00'
  );
  assert.match(await page.locator('#caixa2BonusFinanceiroDemo').innerText(),/25,00/);
  assert.match(await page.locator('#caixa2DouradasFinanceiroDemo').innerText(),/250,00/);
  await page.unroute(urlConcil);
  await page.route(urlConcil,rota=>rota.fulfill({
   status:503,contentType:'application/json',body:JSON.stringify({erro:'SALDO_INDISPONIVEL'})
  }));
  await page.locator('#atualizarCaixa2FinanceiroDemo').click();
  await page.getByText(/Não foi possível confirmar o saldo do caixa 2/).waitFor();
  for(const nome of [
   '#caixa2BrutoFinanceiroDemo','#caixa2BonusFinanceiroDemo',
   '#caixa2DouradasFinanceiroDemo','#caixa2GestaoFinanceiroDemo',
   '#caixa2LivreFinanceiroDemo','#caixa2CapacidadeFinanceiroDemo',
   '#caixaCentralSeparadoFinanceiroDemo'
  ])assert.equal(await page.locator(nome).innerText(),'—');
  await page.unroute(urlConcil);
  await page.locator('#atualizarCaixa2FinanceiroDemo').click();
  await page.getByText(/Configure o pré-lançamento fictício/).waitFor();
  // Sem reserva demonstrativa, nem o ADMIN pode criar posicao gratuita.
  await page.locator('#criarDouradaManualDemo').click();
  await page.getByText(/Não foi possível criar:.*Configure o pré-lançamento e a reserva demonstrativa/).waitFor();
  assert.equal(await page.locator('#listaDouradasManuaisDemo li').count(),0);
  const douradaNegada=await fetch(base+'/api/admin/ponte-compras-convites-demo/douradas',{
   method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+admin},
   body:JSON.stringify({eventoId:'dourada-sem-reserva-browser'})
  });
  assert.equal(douradaNegada.status,409);
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
  for(const aba of ['home','tabuleiro','posicoes','rede','financeiro']){
   await desktop.locator('#loop03Sidebar [data-loop03-aba="'+aba+'"]').click();
   assert.equal(await desktop.locator('.loop03-pagina:not([hidden])').count(),1);
   assert.equal(await desktop.locator('#loop03-'+aba).isVisible(),true);
   assert.equal(await desktop.locator('#loop03Sidebar nav')
    .getByText(/Ativações/i).count(),0);
  }
  await desktop.goto(base+'/admin/loop03',{waitUntil:'networkidle'});
  await desktop.locator('#chaveAdminLoop03').fill(admin);
  await desktop.locator('#formAcessoAdminLoop03 button[type=submit]').click();
  await desktop.locator('#dadosAdminLoop03').waitFor({state:'visible'});
  assert.equal(await desktop.locator('#numeroVagaAdmin').innerText(),'4');
  for(const largura of [768,1024,1366])
   await conferirLargura(desktop,largura,'escritorio-administrador',{captura:largura===1366});

  await desktop.goto(base+'/laboratorio/loja',{waitUntil:'networkidle'});
  await desktop.locator('#conteudoLojaLoop').waitFor({state:'visible'});
  assert.equal(await desktop.locator('.produto-loja-loop-especial').count(),1);
  assert.equal(await desktop.locator('.produto-loja-loop-elegivel').count(),2);
  assert.equal(await desktop.locator('.produto-loja-loop-nao-elegivel').count(),1);
  assert.equal(await desktop.locator('.produto-loja-loop-especial .tarja-promocao-especial-loop').innerText(),
   'PROMOÇÃO ESPECIAL');
  const desktopBordas=await desktop.evaluate(()=>({
   verde:getComputedStyle(document.querySelector('.produto-loja-loop-elegivel'),'::before').animationName,
   especial:getComputedStyle(document.querySelector('.produto-loja-loop-especial'),'::before').animationName,
   cinza:getComputedStyle(document.querySelector('.produto-loja-loop-nao-elegivel'),'::before').animationName
  }));
  assert.equal(desktopBordas.verde,'loop-akitemm-borda-viva');
  assert.equal(desktopBordas.especial,'loop-akitemm-borda-viva');
  assert.equal(desktopBordas.cinza,'none');
  for(const width of [768,1024,1366])
   await conferirLargura(desktop,width,'loja-desktop',{captura:width===1366});
  await desktop.goto(base+'/admin/financeiro-demo',{waitUntil:'networkidle'});
  await desktop.locator('#chaveFinanceiroDemo').fill(admin);
  await desktop.locator('#abrirFinanceiroDemo').click();
  await desktop.locator('#dadosFinanceiroDemo').waitFor({state:'visible'});
  await desktop.locator('#caixa2CapacidadeFinanceiroDemo').waitFor({state:'visible'});
  await desktop.locator('#atualizarCaixa2FinanceiroDemo').click();
  assert.equal(await desktop.locator('#caixa2BonusFinanceiroDemo').innerText(),'—');
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
   celularEComputador:true,douradaSemReservaBloqueada:true,pedidosCriados:2,
   totalPedidoCentavos:25000,clienteFicticio:true,
   lojaParaEscritorio:true,ativacaoAzulParaVermelho:true,
   indicacaoManualValidadaPeloNavegador:true,contadoresDaRedeValidados:true,
   coresAKITEMMValidadas:true,eventosDouradosRoxosSemTarjaVermelha:true,
   bordasVerdeEDouradoRoxoAnimadas:true,movimentoReduzidoRespeitado:true,
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