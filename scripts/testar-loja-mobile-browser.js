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
  assert.equal(await telaFilasVazias.locator('#loop03NomeBaixo').innerText(),'');
  assert.equal(await telaFilasVazias.locator('#loop03DadosPosicaoLateral').isVisible(),false);
  assert.equal(await telaFilasVazias.locator('#loop03BoasVindas').innerText(),'Bem-vindo!');
  assert.equal(await telaFilasVazias.locator('#loop03PerfilTopo>span').count(),1);
  assert.equal(await telaFilasVazias.locator('#loop03NotificacoesBotao svg').count(),1);
  await telaFilasVazias.locator('#loop03NotificacoesBotao').click();
  await telaFilasVazias.locator('#loop03ItensNotificacoes').getByText(/Nenhuma notificação por enquanto/).waitFor();
  await telaFilasVazias.locator('#loop03FecharNotificacoes').click();
  assert.equal(await telaFilasVazias.locator('#mapaFilaAParticipante li').count(),0);
  assert.equal(await telaFilasVazias.locator('#mapaFilaBParticipante li').count(),0);
  assert.equal(await telaFilasVazias.locator('#loop03TotalAtivacoes').innerText(),'0/6');
  assert.equal(await telaFilasVazias.locator('#loop03Saldo').innerText(),'—');
  assert.equal(await telaFilasVazias.locator('.loop03-roda .tabuleiro-vaga-6').count(),1);
  await telaFilasVazias.screenshot({path:path.join(pasta,'TABULEIRO_REAL_ATUAL_DESKTOP_1254_ZERADO.png'),fullPage:true});
  await telaFilasVazias.screenshot({path:path.join(pasta,'TABULEIRO_FILAS_VAZIAS_SEM_PESSOAS.png'),fullPage:false});
  await telaFilasVazias.setViewportSize({width:390,height:812});
  await telaFilasVazias.waitForTimeout(100);
  await telaFilasVazias.locator('#loop03NotificacoesBotao').click();
  await telaFilasVazias.locator('#loop03ItensNotificacoes').getByText(/Nenhuma notificação por enquanto/).waitFor();
  assert.equal(await telaFilasVazias.locator('#loop03PainelNotificacoes').isVisible(),true);
  await telaFilasVazias.locator('#loop03FecharNotificacoes').click();
  assert.equal(await telaFilasVazias.locator('#loop03TotalAtivacoes').innerText(),'0/6');
  assert.equal(await telaFilasVazias.locator('#loop03Saldo').innerText(),'—');
  assert.equal(await telaFilasVazias.locator('#mapaFilaAParticipante li').count(),0);
  assert.equal(await telaFilasVazias.locator('#mapaFilaBParticipante li').count(),0);
  await conferirLargura(telaFilasVazias,390,'tabuleiro-real-zerado',{captura:false});
  await telaFilasVazias.screenshot({path:path.join(pasta,'TABULEIRO_REAL_ATUAL_CELULAR_390_ZERADO.png'),fullPage:true});
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
  assert.equal(await page.locator('#loop03Saldo').innerText(),'—');
  assert.equal(await page.locator('#loop03IndicadorFinanceiro').evaluate(el=>el.tagName),'DIV');
  assert.match(await page.locator('#loop03BonusDez').innerText(),/Bônus 10%/);
  // O seletor abre SOBRE o Tabuleiro, sem navegar para Minhas Posições.
  await page.locator('#loop03Menu').click();
  await page.locator('#loop03Sidebar [data-loop03-aba="tabuleiro"]').click();
  // Cada indicador/caminho executa uma acao real, sem ligacao decorativa.
  await page.locator('#loop03AbrirEscolhaPosicao').click();
  assert.equal(await page.locator('#loop03SeletorPosicao').isVisible(),true);
  assert.equal(await page.locator('#loop03-tabuleiro').isVisible(),true);
  assert.equal(await page.locator('#loop03ListaEscolha button').count(),0);
  await page.locator('#loop03ListaEscolha').getByText(/Você ainda não possui posições/).waitFor();
  await page.locator('#loop03FecharEscolha').click();
  // NÚMERO e GIROS sao visores, somente POSIÇÕES abre escolha na tela atual.
  assert.equal(await page.locator('#loop03VisorNumero').evaluate(el=>el.tagName),'DIV');
  assert.equal(await page.locator('#loop03IndicadorGiros').evaluate(el=>el.tagName),'DIV');
  assert.equal(await page.locator('#loop03IndicePosicao').innerText(),'0/6');
  assert.equal(await page.locator('#loop03LetraFila').isVisible(),false);
  assert.equal(await page.locator('#loop03CoroaVisor').isVisible(),false);
  assert.equal(await page.locator('#loop03CoroaTabuleiro').isVisible(),false);
  // O numero da vaga fixa nao pode desaparecer quando a posicao for ocupada.
  // Somente no DOM de teste, sem fabricar clientes, pagamentos ou prints.
  const coresTipografia=await page.evaluate(()=>{
   const resultado={};
   for(const [classe,local,nome] of [['vermelha','tabuleiro-vaga-6','6'],['branca','tabuleiro-vaga-1','1'],['verde','tabuleiro-centro',null]]){
    const esfera=document.querySelector('#loop03-tabuleiro .'+local);
    const wrap=document.createElement('span');
    wrap.className='loop03-ocupante-identidade';
    const num=document.createElement('span');
    num.className='selo-posicao-demo';num.textContent='#TESTE';
    wrap.append(num);
    esfera.append(wrap);
    const estilo=getComputedStyle(wrap);
    const cor=estilo.color;
    const numeroFixo=nome===null?null:getComputedStyle(esfera,'::before').content;
    wrap.remove();
    resultado[classe]={cor,numeroFixo};
   }
   return resultado;
  });
  assert.equal(coresTipografia.vermelha.cor,'rgb(255, 255, 255)');
  assert.equal(coresTipografia.vermelha.numeroFixo,'"6"');
  assert.equal(coresTipografia.branca.cor,'rgb(16, 23, 36)');
  assert.equal(coresTipografia.branca.numeroFixo,'"1"');
  assert.equal(coresTipografia.verde.cor,'rgb(255, 255, 255)');
  // FINANCEIRO do cabecalho e visor, nao e um botao.
  assert.equal(await page.locator('#loop03IndicadorFinanceiro').evaluate(el=>el.tagName),'DIV');
  assert.equal(await page.locator('#loop03DetalheIndicador').isVisible(),false);
  assert.equal(await page.locator('#loop03-tabuleiro').isVisible(),true);
  assert.equal(await page.locator('#loop03IndicadorGiros').evaluate(el=>el.tagName),'DIV');
  assert.equal(await page.locator('#loop03Giros24').innerText(),'0');
  assert.equal(await page.locator('#loop03-tabuleiro').isVisible(),true);
  await page.locator('.loop03-sino').click();
  assert.equal(await page.locator('#loop03PainelNotificacoes').isVisible(),true);
  assert.equal(await page.locator('#loop03NotificacoesBotao').getAttribute('aria-expanded'),'true');
  await page.locator('#loop03ItensNotificacoes').getByText(/Nenhuma notificação por enquanto/).waitFor();
  await page.locator('#loop03FecharNotificacoes').click();
  assert.equal(await page.locator('#loop03PainelNotificacoes').isVisible(),false);
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
  assert.equal(await page.locator('#mapaFilaAParticipante').evaluate(el=>document.activeElement===el),true);
  await botaoFilaB.click();
  assert.equal(await page.locator('#mapaFilaBParticipante').evaluate(el=>document.activeElement===el),true);
  assert.equal(await page.locator('.loop03-fila-expandida').count(),0);
  // O CSS permite rolar dentro das duas listas sem tocar no motor.
  for(const id of ['mapaFilaAParticipante','mapaFilaBParticipante']){
   const st=await page.locator('#'+id).evaluate(el=>{
    const css=getComputedStyle(el);
    return {overflow:css.overflowY,touch:css.touchAction,tab:el.tabIndex};
   });
   assert.equal(st.overflow,'auto');
   assert.equal(st.touch,'pan-y');
   assert.equal(st.tab,0);
  }
  // Teste isolado de rolagem, sem captura e sem gravar nenhum participante:
  // adicionar temporariamente itens SOMENTE no DOM do navegador de teste.
  const testeRolagem=await page.evaluate(()=>{
   const ids=['mapaFilaAParticipante','mapaFilaBParticipante'];
   return ids.map(id=>{
    const el=document.getElementById(id);
    const exemplares=[];
    for(let i=0;i<40;i++){
     const li=document.createElement('li');
     li.textContent='item tecnico transitorio';
     li.style.height='43px';li.style.minHeight='43px';li.style.display='block';
     el.append(li);exemplares.push(li);
    }
    el.scrollTop=el.scrollHeight;
    const rolou=el.scrollTop>0;
    for(const node of exemplares)node.remove();
    el.scrollTop=0;
    return rolou;
   });
  });
  assert.deepEqual(testeRolagem,[true,true]);
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
  assert.equal(await page.locator('#mapaFilaBParticipante').evaluate(el=>document.activeElement===el),true);
  assert.equal(await page.locator('.linha-minha-demo').count(),1);
  assert.match(await page.locator('.linha-minha-demo .loop03-numero-titular')
   .innerText(),/^#\d+$/);
  assert.match(await page.locator('.linha-minha-demo .loop03-numero-titular')
   .getAttribute('aria-label'),/minha posição/);
  assert.match(await page.locator('.linha-minha-demo').getAttribute('class'),/linha-minha-demo/);
  assert.equal(await page.locator('.linha-minha-demo .posicao-azul').count(),1);
  await page.screenshot({path:path.join(pasta,'escritorio-posicao-azul.png'),fullPage:true});

  await page.locator('#loop03Menu').click();
  await page.locator('.loop03-sidebar [data-loop03-aba="posicoes"]').click();
  assert.equal(await page.locator('#loop03OpcoesPosicoes > *').count(),6);
  assert.equal(await page.locator('#loop03OpcoesPosicoes .loop03-posicao-vazia').count(),5);
  assert.equal(await page.locator('#loop03OpcoesPosicoes .loop03-pendencia-ponto').count(),1);
  await page.locator('#loop03OpcoesPosicoes [data-loop03-posicao]').first().click();
  assert.equal(await page.locator('#loop03DadosPosicaoLateral').isVisible(),true);
  assert.equal(await page.locator('#loop03NomeBaixo').innerText(),titular.nome);
  assert.equal(await page.locator('#loop03SituacaoBaixo').isVisible(),false,
   'Identidade inferior: so nome, sem status de fila');
  assert.equal(await page.locator('#loop03TotalAtivacoes').innerText(),'1/6');
  assert.equal(await page.locator('#loop03Numero').innerText(),'#1');
  assert.equal(await page.locator('#loop03IndicePosicao').innerText(),'1/6');
  assert.equal(await page.locator('#loop03CoroaVisor').isVisible(),false);
  // Acompanhamento no tabuleiro: a selecao abre por cima e nao troca a aba.
  await page.locator('#loop03Menu').click();
  await page.locator('#loop03Sidebar [data-loop03-aba="tabuleiro"]').click();
  await page.locator('#loop03AbrirEscolhaPosicao').click();
  assert.equal(await page.locator('#loop03ListaEscolha button').count(),1);
  await page.locator('#loop03ListaEscolha button').click();
  assert.equal(await page.locator('#loop03-tabuleiro').isVisible(),true);
  assert.equal(await page.locator('#loop03IndicePosicao').innerText(),'1/6');
  assert.equal(await page.locator('#loop03DadosPosicaoLateral').isVisible(),true);
  assert.equal(await page.locator('#loop03SituacaoBaixo').isVisible(),false);
  await page.setViewportSize({width:390,height:812});
  if(!await page.locator('#loop03Sidebar').evaluate(el=>el.classList.contains('loop03-aberto')))
   await page.locator('#loop03Menu').click();
  assert.equal(await page.locator('#loop03Sidebar').evaluate(el=>el.classList.contains('loop03-aberto')),true,
   'Captura deve mostrar menu lateral realmente aberto no celular');
  // Aguardar a transicao CSS: class aberta antes do fim do deslizamento.
  await page.waitForFunction(()=>{
   const sidebar=document.getElementById('loop03Sidebar');
   const bounds=sidebar?.getBoundingClientRect();
   return bounds&&bounds.left>=-2&&bounds.right>=180;
  },null,{timeout:5000});
  assert.equal(await page.locator('.loop03-vitrine-lateral').getAttribute('href'),'/loja');
  assert.equal(await page.locator('#loop03VitrineFoto').isVisible(),false,
   'Sem oferta real aprovada, vitrine nao exibe produto demonstrativo');
  assert.equal(await page.locator('#loop03Sidebar .loop03-identidade button').count(),0,
   'Identidade inferior sem botao power');
  await page.screenshot({path:path.join(pasta,'TABULEIRO_LATERAL_ABERTA_REAL_CELULAR_390.png'),fullPage:false});
  await page.locator('#loop03Sidebar [data-loop03-aba="posicoes"]').click();
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
  assert.equal(await page.locator('#mapaFilaAParticipante').evaluate(el=>document.activeElement===el),true);
  const promovida=page.locator('#mapaFilaAParticipante .loop03-linha-fila').filter({hasText:'#1'});
  assert.equal(await promovida.count(),1);
  assert.equal(await promovida.locator('.loop03-inicial-fila.loop03-a').innerText(),'A');
  assert.equal(await promovida.locator('.loop03-quantidade-a-direita').innerText(),'2');
  assert.equal(await promovida.locator('.loop03-bonequinho-indicacoes').count(),1);
  assert.deepEqual(
   await promovida.locator('.loop03-fila-identificacao').evaluate(el=>
    [...el.children].slice(0,3).map(n=>
     n.classList.contains('loop03-numero-titular')?'POSICAO':
     n.classList.contains('loop03-bonequinho-indicacoes')?'BONECO':
     n.classList.contains('loop03-quantidade-a-direita')?'INDICACOES':'OUTRO')),
   ['POSICAO','BONECO','INDICACOES']);
  // Recarregar nao inventa selecao. O usuario escolhe a posicao 1 no proprio Tabuleiro.
  assert.equal(await page.locator('#loop03LetraFila').innerText(),'');
  await page.locator('#loop03AbrirEscolhaPosicao').click();
  await page.locator('#loop03ListaEscolha button').first().click();
  assert.equal(await page.locator('#loop03LetraFila').innerText(),'A');
  assert.equal(await page.locator('#loop03CoroaVisor').isVisible(),false);
  assert.equal(await page.locator('#loop03IndicePosicao').innerText(),'1/6');
  assert.equal(await page.locator('#mapaFilaBParticipante .loop03-quantidade-a-direita').count(),0);
  // Regressao visual: apos clicar na fila e escolher uma posicao, o container
  // nao pode rolar por tras da UI e engolir a parte superior da catraca.
  async function validarCatracaSemCorte(largura){
   await conferirLargura(page,largura,'catraca-selecionada-sem-corte',{captura:false});
   const geo=await page.evaluate(()=>{
    const rect=selector=>{
     const e=document.querySelector(selector),r=e.getBoundingClientRect();
     return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};
    };
    return {
     scroll:document.querySelector('#loop03-tabuleiro').scrollTop,
     overflow:getComputedStyle(document.querySelector('#loop03-tabuleiro')).overflowY,
     roda:rect('#loop03-tabuleiro .loop03-roda'),
     aro:rect('#loop03-tabuleiro .mapa-tabuleiro-posicoes-demo'),
     filaA:rect('#loop03-tabuleiro .loop03-mapa-grade>.bloco-fila-participante:first-child'),
     filaB:rect('#loop03-tabuleiro .loop03-mapa-grade>.bloco-fila-participante:last-child')
    };
   });
   assert.equal(geo.scroll,0,'Painel Tabuleiro nao deve rolar internamente '+largura+': '+JSON.stringify(geo));
   assert.equal(geo.overflow,'clip','Tabuleiro nao pode ser scroll container '+largura);
   assert.ok(geo.aro.top>=geo.roda.top-2,'Topo da catraca nao pode ser cortado '+largura+': '+JSON.stringify(geo));
   assert.ok(geo.aro.bottom<=geo.roda.bottom+2,'Catraca deve caber por inteiro '+largura+': '+JSON.stringify(geo));
   assert.ok(geo.filaA.top>=geo.roda.bottom+4&&geo.filaB.top>=geo.roda.bottom+4,
    'Fila A e B devem ficar abaixo da catraca '+largura+': '+JSON.stringify(geo));
   assert.ok(Math.abs(geo.filaA.top-geo.filaB.top)<=2,
    'Filas alinhadas horizontalmente '+largura+': '+JSON.stringify(geo));
  }
  for(const largura of [320,360,390,412])await validarCatracaSemCorte(largura);
  await page.setViewportSize({width:390,height:812});
  await page.waitForTimeout(120);
  await page.screenshot({path:path.join(pasta,'TABULEIRO_REAL_POSICAO_A_CELULAR_390_SEM_CORTE.png'),fullPage:true});
  await page.screenshot({path:path.join(pasta,'fila-a-contagem-posicao.png'),fullPage:true});
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
   if(aba==='tabuleiro'){
    // MESMO BANCO / MESMO MOTOR: captura de desktop com uma posição real
    // da conta de teste, que foi promovida para A na jornada anterior.
    // Não gerar nem editar uma imagem do visor fora do navegador.
    await quatroAbas.locator('#loop03AbrirEscolhaPosicao').click();
    await quatroAbas.locator('#loop03ListaEscolha button').first().click();
    assert.equal(await quatroAbas.locator('#loop03Numero').innerText(),'#1');
    assert.equal(await quatroAbas.locator('#loop03LetraFila').innerText(),'A');
    assert.equal(await quatroAbas.locator('#loop03IndicePosicao').innerText(),'1/6');
    assert.equal(await quatroAbas.locator('#loop03VisorNumero').evaluate(n=>n.tagName),'DIV');
    await conferirLargura(quatroAbas,1254,'visor-posicao-A-desktop',{captura:false});
    await quatroAbas.screenshot({
     path:path.join(pasta,'TABULEIRO_REAL_COM_POSICAO_A_DESKTOP_1254.png'),fullPage:true
    });
   }
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
  // Operador configura referencia visual via formulario autenticado; nunca gira.
  assert.equal(await desktop.locator('#intervaloAtualRelogioAdmin').innerText(),'Não configurado');
  await desktop.locator('#intervaloRelogioAdmin').fill('30');
  await desktop.locator('#justificativaRelogioAdmin').fill('Referencia operacional de teste sem disparar giros');
  desktop.once('dialog',dialog=>dialog.accept());
  await desktop.locator('#formRelogioAdminLoop03 button[type="submit"]').click();
  await desktop.waitForFunction(()=>document.querySelector('#intervaloAtualRelogioAdmin')?.textContent==='30 min');
  assert.match(await desktop.locator('#statusRelogioAdminLoop03').innerText(),/nenhum giro/i);
  // O mesmo valor gravado no SQLite aparece na tela REAL do cliente.
  await desktop.goto(base+'/laboratorio/participante',{waitUntil:'networkidle'});
  // A sessao continua autenticada no mesmo contexto: login so se ainda visivel.
  if(await desktop.locator('#formEntrarParticipante').isVisible()){
   await desktop.locator('#nomeParticipante').fill(titular.nome);
   await desktop.locator('#senhaParticipante').fill(senha);
   await desktop.locator('#botaoEntrarParticipante').click();
  }
  await desktop.locator('#conteudoParticipante').waitFor({state:'visible'});
  await desktop.locator('#loop03Sidebar [data-loop03-aba="tabuleiro"]').click();
  assert.equal(await desktop.locator('#loop03IntervaloMeta').innerText(),'Referência administrativa: 00:30:00');
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

  // Perfil real (campos e foto persistidos) no mesmo aplicativo de navegador.
  await page.goto(base+'/laboratorio/participante',{waitUntil:'networkidle'});
  if(await page.locator('#formEntrarParticipante').isVisible()){
   await page.locator('#nomeParticipante').fill(titular.nome);
   await page.locator('#senhaParticipante').fill(senha);
   await page.locator('#botaoEntrarParticipante').click();
  }
  await page.locator('#conteudoParticipante').waitFor({state:'visible'});
  const posicoesAntesDoPerfil=await page.locator('#loop03TotalAtivacoes').innerText();
  await page.locator('#loop03PerfilTopo').click();
  assert.equal(await page.locator('#loop03-perfil').isVisible(),true);
  assert.equal(await page.locator('#loop03FundoPerfil').isVisible(),true);
  assert.match(await page.locator('#loop03SituacaoCPF').innerText(),/primeira posição|CPF de teste confirmado/i);
  assert.equal(await page.locator('#loop03PerfilEmail').inputValue(),'mobile@exemplo.invalid');
  // Nao se pode salvar e-mail novo sem confirmar codigo recebido.
  await page.locator('#loop03PerfilEmail').fill('emailnaoverificado@exemplo.invalid');
  await page.locator('#loop03SalvarPerfil').click();
  await page.getByText(/CONTATO_EXIGE_CODIGO/).waitFor();
  await page.locator('[data-verificar-envio="EMAIL"]').click();
  await page.getByText(/envio de código ainda não está conectado/i).waitFor();
  await page.locator('#loop03PerfilEmail').fill('mobile@exemplo.invalid');
  const imagemBase64=await page.evaluate(()=>{
   const c=document.createElement('canvas');c.width=180;c.height=180;
   const x=c.getContext('2d');x.fillStyle='#8e6596';x.fillRect(0,0,180,180);
   x.fillStyle='#fce8c0';x.beginPath();x.arc(90,65,28,0,2*Math.PI);x.fill();
   x.beginPath();x.ellipse(90,146,53,48,0,0,2*Math.PI);x.fill();
   return c.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#loop03PerfilFoto').setInputFiles({
   name:'avatar-de-teste.png',mimeType:'image/png',buffer:Buffer.from(imagemBase64,'base64')
  });
  await page.locator('#loop03PerfilNome').fill('Meu Perfil Personalizado');
  await page.locator('#loop03SalvarPerfil').click();
  await page.getByText(/Perfil atualizado e salvo com sucesso/).waitFor();
  assert.equal(await page.locator('#loop03NomeBaixo').innerText(),'');
  assert.equal(await page.locator('#loop03DadosPosicaoLateral').isVisible(),false);
  assert.equal(await page.locator('#loop03-perfil .loop03-foto-grande img').isVisible(),true);
  assert.equal(await page.locator('#loop03TotalAtivacoes').innerText(),posicoesAntesDoPerfil);
  for(const width of [320,360,390,412]){
   await conferirLargura(page,width,'perfil-cliente-mobile',{captura:width===390});
  }
  await page.screenshot({path:path.join(pasta,'PERFIL_CLIENTE_CELULAR_REAL.png'),fullPage:true});
  await page.reload({waitUntil:'networkidle'});
  await page.locator('#conteudoParticipante').waitFor({state:'visible'});
  await page.locator('#loop03PerfilTopo').click();
  assert.equal(await page.locator('#loop03PerfilNome').inputValue(),'Meu Perfil Personalizado');
  assert.equal(await page.locator('#loop03-perfil .loop03-foto-grande img').isVisible(),true);
  await page.locator('#loop03FecharPerfil').click();
  await page.locator('#loop03Menu').click();
  await page.locator('#loop03Sidebar [data-loop03-aba="tabuleiro"]').click();
  assert.equal(await page.locator('#loop03TotalAtivacoes').innerText(),posicoesAntesDoPerfil);

  // Prova adicional em navegador real DESKTOP com sessao propria e avatar persistido.
  const contextoPerfilDesktop=await browser.newContext({
   viewport:{width:1366,height:900},deviceScaleFactor:1,isMobile:false
  });
  const perfilDesktop=await contextoPerfilDesktop.newPage();
  perfilDesktop.on('pageerror',erro=>erros.push('perfil-desktop: '+erro.message));
  await perfilDesktop.goto(base+'/laboratorio/participante',{waitUntil:'networkidle'});
  await perfilDesktop.locator('#nomeParticipante').fill(titular.nome);
  await perfilDesktop.locator('#senhaParticipante').fill(senha);
  await perfilDesktop.locator('#botaoEntrarParticipante').click();
  await perfilDesktop.locator('#conteudoParticipante').waitFor({state:'visible'});
  await perfilDesktop.locator('#loop03PerfilTopo').click();
  assert.equal(await perfilDesktop.locator('#loop03PerfilNome').inputValue(),'Meu Perfil Personalizado');
  assert.equal(await perfilDesktop.locator('#loop03-perfil .loop03-foto-grande img').isVisible(),true);
  assert.equal(await perfilDesktop.locator('#loop03VerificacaoEMAIL').evaluate(e=>e.open),false);
  await conferirLargura(perfilDesktop,1366,'perfil-cliente-desktop',{captura:true});
  await perfilDesktop.screenshot({path:path.join(pasta,'PERFIL_CLIENTE_COMPUTADOR_REAL.png'),fullPage:true});
  await contextoPerfilDesktop.close();

  // Troca de senha operativa: conta separada, sem compras, sem mexer na Fila.
  const contaSenha=contas.cadastrar({
   nome:'Titular Teste Troca Senha',email:'troca@exemplo.invalid',
   senha:'senha-antiga-laboratorio-2026'
  });
  const contextoSenha=await browser.newContext({
   viewport:{width:390,height:812},isMobile:true,hasTouch:true
  });
  const paginaSenha=await contextoSenha.newPage();
  paginaSenha.on('pageerror',erro=>erros.push('trocar-senha: '+erro.message));
  await paginaSenha.goto(base+'/laboratorio/participante',{waitUntil:'networkidle'});
  await paginaSenha.locator('#nomeParticipante').fill(contaSenha.nome);
  await paginaSenha.locator('#senhaParticipante').fill('senha-antiga-laboratorio-2026');
  await paginaSenha.locator('#botaoEntrarParticipante').click();
  await paginaSenha.locator('#conteudoParticipante').waitFor({state:'visible'});
  await paginaSenha.locator('#loop03PerfilTopo').click();
  await paginaSenha.locator('#loop03TrocarSenha>summary').click();
  assert.equal(await paginaSenha.locator('#loop03FormSenha').isVisible(),true);
  await paginaSenha.locator('#loop03SenhaAtual').fill('senha-incorreta-2026');
  await paginaSenha.locator('#loop03SenhaNova').fill('senha-nova-laboratorio-2026');
  await paginaSenha.locator('#loop03SenhaConfirma').fill('senha-nova-laboratorio-2026');
  await paginaSenha.locator('#loop03SalvarSenha').click();
  await paginaSenha.getByText('Senha atual incorreta. Tente novamente.').waitFor();
  assert.equal(await paginaSenha.locator('#conteudoParticipante').isVisible(),true);
  await paginaSenha.locator('#loop03SenhaAtual').fill('senha-antiga-laboratorio-2026');
  await paginaSenha.locator('#loop03SenhaNova').fill('senha-nova-laboratorio-2026');
  await paginaSenha.locator('#loop03SenhaConfirma').fill('senha-nova-laboratorio-2026');
  await paginaSenha.locator('#loop03SalvarSenha').click();
  await paginaSenha.locator('#formEntrarParticipante').waitFor({state:'visible'});
  await paginaSenha.getByText(/Senha alterada/).waitFor();
  await paginaSenha.locator('#senhaParticipante').fill('senha-antiga-laboratorio-2026');
  await paginaSenha.locator('#botaoEntrarParticipante').click();
  await paginaSenha.getByText(/Credenciais|inválido|invalid/i).waitFor();
  await paginaSenha.locator('#senhaParticipante').fill('senha-nova-laboratorio-2026');
  await paginaSenha.locator('#botaoEntrarParticipante').click();
  await paginaSenha.locator('#conteudoParticipante').waitFor({state:'visible'});
  assert.equal(await paginaSenha.locator('#loop03TotalAtivacoes').innerText(),'0/6');
  await contextoSenha.close();


  // Prova FINAL da catraca ocupada no MOTOR REAL do laboratorio:
  // 7 pedidos confirmados e posicoes individuais ativadas em SQLite.
  // Sem colocar numeros ou participantes artificiais no DOM/screenshot.
  const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
  const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');
  const ponteCaptura=new PonteComprasConvitesDemoSQLite({
   banco:banco.banco,contas,atribuicaoManualPorPosicao:true,
   consultarPagamentoConfiavel:async()=>null
  });
  const adesoesCaptura=new AdesoesPosicoesDemoSQLite({ponte:ponteCaptura});
  const cpfDeTeste=base=>{
   const dv=(valor,n)=>{
    const soma=[...valor].slice(0,n).reduce((a,d,i)=>a+Number(d)*(n+1-i),0);
    const mod=(soma*10)%11;return mod===10?0:mod;
   };
   const d1=dv(base,9),d2=dv(base+String(d1),10);
   return base+String(d1)+String(d2);
  };
  const contasDaCatraca=[];
  for(let i=0;i<4;i++){
   const conta=contas.cadastrar({
    nome:'Participante Ficticio Catraca '+(i+4),
    email:'catraca-'+i+'@exemplo.invalid',senha
   });
   contasDaCatraca.push(conta);
   const pedidoId='pedido-ocupacao-catraca-'+i;
   const venda=await fetch(base+'/api/admin/carrinho-loop-demo',{
    method:'POST',headers:cabAdmin,
    body:JSON.stringify({pedidoId,contaId:conta.contaId,
     itens:[{produtoId:'curso-mobile-100',quantidade:1},
      {produtoId:'curso-mobile-150',quantidade:1}]})
   });
   assert.equal(venda.status,201,'Pedido de teste da catraca '+i+': '+await venda.text());
   const confirmacao=await fetch(base+'/api/admin/carrinho-loop-demo/'+pedidoId+'/eventos',{
    method:'POST',headers:cabAdmin,
    body:JSON.stringify({eventoId:'confirmar-catraca-'+i,tipo:'CONFIRMAR_FICTICIO'})
   });
   assert.equal(confirmacao.status,200,'Confirmacao de teste '+i+': '+await confirmacao.text());
   const sim=ponteCaptura._restaurar();
   const posicao=sim.filas.filaB.find(p=>p.participanteId===conta.contaId);
   assert.ok(posicao&&posicao.statusAdesao==='PENDENTE','Nova posicao azul antes do aceite');
   const ativada=adesoesCaptura.ativar({
    contaId:conta.contaId,posicaoId:posicao.id,
    cpfFicticio:cpfDeTeste(String(260000000+i).padStart(9,'0')),
    aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'
   });
   assert.deepEqual(ativada.posicoesIds,[posicao.id]);
  }
  const respostaTabuleiro=await fetch(base+
   '/api/admin/ponte-compras-convites-demo/preparar-tabuleiro',{
   method:'POST',headers:cabAdmin,body:'{}'
  });
  assert.equal(respostaTabuleiro.status,200,
   'Preparar catraca usando o motor persistido: '+await respostaTabuleiro.text());
  const estadoReal=ponteCaptura._restaurar();
  assert.ok(estadoReal.tabuleiro.centro,'Motor criou o centro com posicao confirmada');
  assert.equal(estadoReal.tabuleiro.vagas.length,6);
  assert.ok(estadoReal.tabuleiro.vagas.every(p=>p&&p.statusAdesao==='ATIVA'&&p.empresa!==true),
   'Seis esferas ocupadas, sem azuis/douradas forjadas');
  const ocupacaoCores=async ({conta,largura,celular,nomeArquivo})=>{
   const ctx=await browser.newContext({
    viewport:{width:largura,height:celular?812:1254},deviceScaleFactor:1,
    isMobile:celular,hasTouch:celular
   });
   const q=await ctx.newPage();
   q.on('pageerror',err=>erros.push('catraca ocupada '+nomeArquivo+': '+err.message));
   await q.goto(base+'/laboratorio/participante',{waitUntil:'networkidle'});
   await q.locator('#nomeParticipante').fill(conta.nome);
   await q.locator('#senhaParticipante').fill(senha);
   await q.locator('#botaoEntrarParticipante').click();
   await q.locator('#conteudoParticipante').waitFor({state:'visible'});
   if(celular)await q.locator('#loop03Menu').click();
   await q.locator('#loop03Sidebar [data-loop03-aba="tabuleiro"]').click();
   await q.locator('#loop03-tabuleiro').waitFor({state:'visible'});
   await q.locator('#loop03AbrirEscolhaPosicao').click();
   await q.locator('#loop03ListaEscolha button').first().click();
   const modelo=await q.evaluate(()=>{
    const centro=document.querySelector('#loop03-tabuleiro .tabuleiro-centro');
    const resultado={vagas:[],centro:{
     id:centro.querySelector('.loop03-ocupante-identidade .selo-posicao-demo')?.textContent,
     nome:centro.querySelector('.loop03-nome-na-bola')?.textContent||'',
     cor:getComputedStyle(centro.querySelector('.loop03-ocupante-identidade')).color
    }};
    for(let i=1;i<=6;i++){
     const esfera=document.querySelector('#loop03-tabuleiro .tabuleiro-vaga-'+i);
     const ocupante=esfera.querySelector('.loop03-ocupante-identidade');
     resultado.vagas.push({
      indice:esfera.querySelector('.loop03-indice-vaga-visivel')?.textContent,
      id:ocupante?.querySelector('.selo-posicao-demo')?.textContent,
      cor:ocupante?getComputedStyle(ocupante).color:null,
      nome:ocupante?.querySelector('.loop03-nome-na-bola')?.textContent||''
     });
    }
    return resultado;
   });
   assert.deepEqual(modelo.vagas.map(x=>x.indice),
    ['1','2','3','4','5','6'],
    'Os numeros fixos 1..6 devem continuar visiveis acima dos #IDs');
   assert.ok(modelo.vagas.every(x=>/^#\d+$/.test(x.id||'')),
    'Todas as vagas ocupadas por identificadores reais do motor');
   assert.equal(modelo.vagas[5].cor,'rgb(255, 255, 255)',
    'Vaga 6 vermelha com texto branco');
   assert.ok(modelo.vagas.slice(0,5).every(x=>x.cor==='rgb(16, 23, 36)'),
    'Vagas brancas com texto preto');
   assert.equal(modelo.centro.cor,'rgb(255, 255, 255)',
    'Centro verde com texto branco');
   assert.equal(await q.locator('#loop03CoroaVisor').isVisible(),true);
   assert.equal(await q.locator('#loop03CoroaTabuleiro').isVisible(),true);
   assert.equal(await q.locator('#loop03LetraFila').isVisible(),false);
   await conferirLargura(q,largura,'catraca-preenchida-'+nomeArquivo,{captura:false});
   await q.screenshot({path:path.join(pasta,nomeArquivo),fullPage:true});
   await ctx.close();
   return modelo;
  };
  const fotoCentroPc=await ocupacaoCores({
   conta:titular,largura:1254,celular:false,
   nomeArquivo:'TABULEIRO_OCUPADO_MOTOR_REAL_COMPUTADOR_1254.png'
  });
  const fotoCentroCel=await ocupacaoCores({
   conta:titular,largura:390,celular:true,
   nomeArquivo:'TABULEIRO_OCUPADO_MOTOR_REAL_CELULAR_390.png'
  });
  assert.deepEqual(fotoCentroPc,fotoCentroCel,'Mesmos dados do motor no PC e celular');
  // A mesma vaga vermelha com NOME DO TITULAR (somente ao proprio titular);
  // nao se publica nome de outra pessoa sem politica e consentimento.
  const fotoVermelha=await ocupacaoCores({
   conta:contasDaCatraca[3],largura:1254,celular:false,
   nomeArquivo:'TABULEIRO_VERMELHO_IDENTIFICADO_REAL_COMPUTADOR.png'
  });
  assert.ok(fotoVermelha.vagas[5].nome.startsWith('Participante Ficticio Catraca'),
   'A pessoa ve seu proprio nome dentro da bolinha vermelha');

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