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
   nome:'Comprador Mobile Ficticio',apelido:'TesteUser',email:'mobile@exemplo.invalid',senha
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
  assert.equal(await page.locator('#loop03OpcoesPosicoes .loop03-posicao-vazia').count(),5);
  assert.equal(await page.locator('#loop03OpcoesPosicoes .loop03-status-confirmacao-pendente').count(),1);
  assert.equal(await page.locator('#loop03OpcoesPosicoes .loop03-cpf-cartao').count(),1);
  assert.equal(await page.locator('#loop03OpcoesPosicoes .loop03-check-cartao').count(),6);
  assert.equal(await page.locator('#loop03OpcoesPosicoes .loop03-posicao-vazia .loop03-check-cartao:disabled').count(),5);
  assert.equal(await page.locator('#loop03OpcoesPosicoes .loop03-link-termos').count(),5);
  assert.equal(await page.locator('#loop03OpcoesPosicoes .loop03-adicionar-indicado').count(),6);
  assert.equal(await page.locator('#loop03OpcoesPosicoes .loop03-posicao-vazia + .loop03-adicionar-indicado:disabled').count(),5);
  assert.equal(await page.locator('#loop03DetalhesPosicao').getAttribute('open'),null,
   'Meus Links inicia fechado na tela real de Minhas Posições');
  assert.equal(await page.locator('#loop03DetalhesPosicao summary').innerText(),'Meus Links');
  assert.equal(await page.locator('#loop03LinkEscritorio').isVisible(),false);
  assert.equal(await page.locator('#loop03LinkLoja').isVisible(),false);
  assert.equal(await page.locator('#loop03Sidebar .loop03-identidade-selecionada').isVisible(),false,
   'Rodapé antigo de comprador não pode reaparecer na versão atual');
  assert.equal(await page.locator('#loop03-posicoes>.loop03-contador-rede').count(),1,
   'Substituir faixa antiga pelo mesmo quadro de Minha Rede');
  assert.equal(await page.locator('#loop03-posicoes>.loop03-saldo-indicados').count(),0);
  assert.equal(await page.locator('#loop03PosicoesRedeTotalIndicacoes').innerText(),'0');
  assert.equal(await page.locator('#loop03PosicoesRedeADistribuir').innerText(),'0');
  assert.equal(await page.locator('#loop03PosicoesRedeUtilizadas').innerText(),'0');
  assert.match(await page.locator('#loop03LinkEscritorio').inputValue(),/\/escritorio\/TesteUser$/);
  assert.match(await page.locator('#loop03LinkLoja').inputValue(),/\/loja\/TesteUser$/);
  assert.equal(await page.locator('#loop03CopiarEscritorio').isDisabled(),false);
  assert.equal(await page.locator('#loop03CopiarLoja').isDisabled(),false);
  assert.equal(await page.locator('#loop03OpcoesPosicoes .loop03-indicacoes-curtas').count(),6);
  assert.equal(await page.locator('#loop03OpcoesPosicoes .loop03-posicao-vazia .loop03-indicacoes-curtas').first().innerText(),'Indicações');
  await page.locator('#loop03OpcoesPosicoes [data-loop03-posicao]').first().click();
  await page.locator('#loop03OpcoesPosicoes .loop03-cpf-cartao').fill('11144477735');
  assert.equal(await page.locator('#cpfFicticioParticipante').inputValue(),'11144477735');
  const geometria=await page.locator('#loop03OpcoesPosicoes .loop03-status-confirmacao-pendente').evaluate(el=>{
   const miolo=el.querySelector('.loop03-cartao-miolo').getBoundingClientRect();
   const cpf=el.querySelector('.loop03-cpf-cartao').getBoundingClientRect();
   const divisoria=el.querySelector('.loop03-cartao-resumo').getBoundingClientRect();
   return {mioloFim:miolo.bottom,cpfTopo:cpf.top,cpfFim:cpf.bottom,divisoriaTopo:divisoria.top};
  });
  assert.ok(geometria.cpfTopo>=geometria.mioloFim-2&&geometria.divisoriaTopo>=geometria.cpfFim-2,
   'CPF deve aparecer abaixo da esfera e ANTES da divisória '+JSON.stringify(geometria));
  await page.screenshot({path:path.join(pasta,'MINHAS_POSICOES_ATUAL_MEUS_LINKS_FECHADOS_CELULAR_390.png'),fullPage:true});
  await page.locator('#loop03DetalhesPosicao summary').click();
  assert.equal(await page.locator('#loop03DetalhesPosicao').getAttribute('open'),'');
  assert.equal(await page.locator('#loop03LinkEscritorio').isVisible(),true);
  assert.equal(await page.locator('#loop03LinkLoja').isVisible(),true);
  await page.screenshot({path:path.join(pasta,'MINHAS_POSICOES_ATUAL_MEUS_LINKS_ABERTOS_CELULAR_390.png'),fullPage:true});
  await page.locator('#loop03DetalhesPosicao summary').click();
  assert.equal(await page.locator('#loop03LinkLoja').isVisible(),false);
  // Prova adicional: captura de navegador REAL no COMPUTADOR (não mockup).
  // Titular de laboratório "TesteUser"; nas contas sem nick ambos campos ficam vazios.
  const ctxPosicoesPC=await browser.newContext({viewport:{width:1254,height:900},deviceScaleFactor:1});
  const posicoesPC=await ctxPosicoesPC.newPage();
  await posicoesPC.goto(base+'/laboratorio/participante',{waitUntil:'networkidle'});
  await posicoesPC.locator('#nomeParticipante').fill(titular.nome);
  await posicoesPC.locator('#senhaParticipante').fill(senha);
  await posicoesPC.locator('#botaoEntrarParticipante').click();
  await posicoesPC.locator('#conteudoParticipante').waitFor({state:'visible'});
  await posicoesPC.locator('#loop03Sidebar [data-loop03-aba="posicoes"]').click();
  await posicoesPC.locator('#loop03-posicoes').waitFor({state:'visible'});
  assert.equal(await posicoesPC.locator('#loop03OpcoesPosicoes .loop03-cartao-posicao').count(),6);
  assert.equal(await posicoesPC.locator('#loop03-posicoes .loop03-extras-posicoes').count(),0,
   'Após os dois links, a aba não mostra mais histórico ou informações extras');
  assert.equal(await posicoesPC.locator('#loop03DadosSecundariosPosicoes').isVisible(),false,
   'Dados legados preservados, mas não expostos na aba');
  assert.equal(await posicoesPC.locator('#loop03OpcoesPosicoes .loop03-status-confirmacao-pendente').count(),1);
  assert.match(await posicoesPC.locator('#loop03LinkEscritorio').inputValue(),/\/escritorio\/TesteUser$/);
  assert.match(await posicoesPC.locator('#loop03LinkLoja').inputValue(),/\/loja\/TesteUser$/);
  assert.equal(await posicoesPC.locator('#loop03DetalhesPosicao').getAttribute('open'),null);
  assert.equal(await posicoesPC.locator('#loop03LinkEscritorio').isVisible(),false);
  assert.equal(await posicoesPC.locator('#loop03Sidebar .loop03-identidade-selecionada').isVisible(),false);
  assert.equal(await posicoesPC.locator('#loop03-posicoes>.loop03-contador-rede').count(),1);
  await posicoesPC.screenshot({path:path.join(pasta,'MINHAS_POSICOES_ATUAL_MEUS_LINKS_FECHADOS_PC_1254.png'),fullPage:true});
  await posicoesPC.locator('#loop03DetalhesPosicao summary').click();
  assert.equal(await posicoesPC.locator('#loop03DetalhesPosicao').getAttribute('open'),'');
  assert.equal(await posicoesPC.locator('#loop03LinkEscritorio').isVisible(),true);
  await posicoesPC.screenshot({path:path.join(pasta,'MINHAS_POSICOES_ATUAL_MEUS_LINKS_ABERTOS_PC_1254.png'),fullPage:true});
  await posicoesPC.locator('#loop03DetalhesPosicao summary').click();

  // Clicar quadradinho nao aceita silenciosamente: abre o texto sobre a aba.
  await page.locator('#loop03OpcoesPosicoes .loop03-check-cartao').first().click();
  assert.equal(await page.locator('#loop03TermosFundo').isVisible(),true);
  assert.equal(await page.locator('#loop03OpcoesPosicoes .loop03-check-cartao').first().isChecked(),false);
  assert.match(await page.locator('#loop03TermosTexto').innerText(),/LOOP|regras/i);
  await page.locator('#loop03TermosAceitar').check();
  assert.equal(await page.locator('#loop03TermosFundo').isVisible(),false);
  assert.equal(await page.locator('#loop03OpcoesPosicoes .loop03-check-cartao').first().isChecked(),true);
  assert.equal(await page.locator('#aceiteTermosParticipante').isChecked(),true);
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
  assert.equal(await page.locator('#loop03OpcoesPosicoes .loop03-status-confirmacao-ok').count(),1);
  await posicoesPC.reload({waitUntil:'networkidle'});
  await posicoesPC.locator('#conteudoParticipante').waitFor({state:'visible'});
  await posicoesPC.locator('#loop03Sidebar [data-loop03-aba="posicoes"]').click();
  assert.equal(await posicoesPC.locator('#loop03OpcoesPosicoes .loop03-status-confirmacao-ok').count(),1);
  await posicoesPC.screenshot({path:path.join(pasta,'MINHAS_POSICOES_ATUAL_CONFIRMADA_PC_1254.png'),fullPage:true});
  await ctxPosicoesPC.close();

  assert.equal(await page.locator('#loop03OpcoesPosicoes .loop03-cpf-cartao').count(),1);
  assert.equal(await page.locator('#loop03OpcoesPosicoes .loop03-cpf-protegido').count(),1);
  assert.equal(await page.locator('#loop03OpcoesPosicoes .loop03-check-cartao').first().isChecked(),true);
  assert.equal(await page.locator('#loop03OpcoesPosicoes .loop03-status-confirmacao-ok .loop03-cartao-identidade span:not(.loop03-cartao-nick)').isVisible(),false,
   'Remover texto Fila A abaixo do #ID sem mudar a esfera A');
  assert.equal(await page.locator('.linha-minha-demo .posicao-vermelho').count(),1);
  await page.screenshot({path:path.join(pasta,'escritorio-posicao-ativada.png'),fullPage:true});

  // Percurso do cliente: convidado compra PDF; o titular precisa distribuir.
  const convidado=contas.cadastrar({
   nome:'Ana Oliveira',apelido:'Primeiro',email:'indicado-mobile@exemplo.invalid',
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
  assert.equal(await page.locator('#loop03RedeTotalIndicacoes').innerText(),'0');
  assert.equal(await page.locator('#loop03RedeADistribuir').innerText(),'0');
  assert.equal(await page.locator('#loop03RedeUtilizadas').innerText(),'0');
  const pendenteCompra=page.locator('#loop03ListaEquipe .loop03-equipe-linha')
   .filter({hasText:convidado.nome});
  assert.equal(await pendenteCompra.locator('.loop03-equipe-estado').innerText(),'PENDENTE');
  assert.equal(await pendenteCompra.locator('.loop03-equipe-pendente').count(),1);
  assert.doesNotMatch(await pendenteCompra.locator('.loop03-equipe-informacoes').innerText(),/AGUARDANDO|ATIVO|PENDENTE/);
  await pendenteCompra.getByRole('button',{name:'Escolher posição para '+convidado.nome}).click();
  assert.equal(await pendenteCompra.locator('.loop03-equipe-numeros>button').count(),1);
  assert.equal(await pendenteCompra.locator('.loop03-equipe-numeros>button:enabled').count(),0);
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
  assert.equal(await page.locator('#loop03RedeTotalIndicacoes').innerText(),'1');
  assert.equal(await page.locator('#loop03RedeADistribuir').innerText(),'1');
  const linhaIndicado=page.locator('#loop03ListaEquipe .loop03-equipe-linha')
   .filter({hasText:convidado.nome});
  assert.equal(await linhaIndicado.locator('.loop03-equipe-estado').innerText(),'ATIVO');
  assert.equal(await linhaIndicado.locator('.loop03-equipe-ativo').count(),1);
  await linhaIndicado.getByRole('button',{name:'Escolher posição para '+convidado.nome}).click();
  assert.equal(await linhaIndicado.locator('.loop03-equipe-numeros>button').count(),1);
  await linhaIndicado.getByRole('button',{name:/Posição 1 · #/}).click();
  assert.equal(await linhaIndicado.locator('.loop03-equipe-confirmacao>span').innerText(),
   'Confirmar indicação 1 para primeira posição? Essa escolha será definitiva.');
  assert.equal(await linhaIndicado.getByRole('button',{name:'Confirmar vínculo definitivo'}).isVisible(),true);
  assert.equal(await page.locator('#loop03RedeADistribuir').innerText(),'1');
  await linhaIndicado.getByRole('button',{name:'Cancelar'}).click();
  assert.equal(await linhaIndicado.locator('.loop03-equipe-confirmacao').isVisible(),false);
  assert.equal(await page.locator('#loop03RedeADistribuir').innerText(),'1');
  await linhaIndicado.getByRole('button',{name:/Posição 1 · #/}).click();
  await linhaIndicado.getByRole('button',{name:'Confirmar vínculo definitivo'}).click();
  await page.waitForFunction(()=>document.querySelector('#loop03RedeADistribuir')?.textContent==='0');
  assert.equal(await page.locator('#loop03RedeTotalIndicacoes').innerText(),'1');
  assert.equal(await page.locator('#loop03RedeADistribuir').innerText(),'0');
  assert.equal(await page.locator('#loop03RedeUtilizadas').innerText(),'1');
  const linhaConfirmada=page.locator('#loop03ListaEquipe .loop03-equipe-linha').filter({hasText:convidado.nome});
  assert.doesNotMatch(await linhaConfirmada.locator('.loop03-equipe-informacoes').innerText(),/Vinculad/);
  await linhaConfirmada.getByRole('button',{name:'Escolher posição para '+convidado.nome}).click();
  assert.equal(await linhaConfirmada.locator('.loop03-equipe-numero-vinculado').count(),1);
  assert.equal(await linhaConfirmada.locator('.loop03-equipe-numeros>button:enabled').count(),0);
  await page.screenshot({path:path.join(pasta,'rede-um-indicado-distribuido.png'),fullPage:true});
  // Confere a nova distribuicao +1 sem nomes nos seis cartoes aprovados.
  const novoIndicado=contas.cadastrar({
   nome:'Bruno Santos',apelido:'Segundo',email:'segundo-indicado@exemplo.invalid',
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
  assert.equal(await page.locator('#loop03PosicoesRedeADistribuir').innerText(),'1');
  assert.equal(await page.locator('#loop03PosicoesRedeTotalIndicacoes').innerText(),
   await page.locator('#loop03RedeTotalIndicacoes').innerText());
  assert.equal(await page.locator('#loop03PosicoesRedeADistribuir').innerText(),
   await page.locator('#loop03RedeADistribuir').innerText());
  assert.equal(await page.locator('#loop03PosicoesRedeUtilizadas').innerText(),
   await page.locator('#loop03RedeUtilizadas').innerText());
  assert.equal(await page.locator('#loop03OpcoesPosicoes .loop03-adicionar-indicado').count(),6);
  assert.equal(await page.locator('#loop03OpcoesPosicoes .loop03-adicionar-indicado:enabled').count(),1);
  // O mesmo botão ⋮ deixa atribuir uma SEGUNDA indicação à mesma posição 1;
  // escolher não muda nada até o toque explícito no verde Confirmar.
  await page.screenshot({path:path.join(pasta,'minhas-posicoes-botao-mais-um.png'),fullPage:true});
  await page.locator('#loop03Menu').click();
  await page.locator('#loop03Sidebar [data-loop03-aba="rede"]').click();
  const segundaLinha=page.locator('#loop03ListaEquipe .loop03-equipe-linha')
   .filter({hasText:novoIndicado.nome});
  await segundaLinha.getByRole('button',{name:'Escolher posição para '+novoIndicado.nome}).click();
  await segundaLinha.getByRole('button',{name:/Posição 1 · #/}).click();
  assert.equal(await page.locator('#loop03RedeADistribuir').innerText(),'1');
  assert.equal(await page.locator('#loop03RedeUtilizadas').innerText(),'1');
  await segundaLinha.getByRole('button',{name:'Confirmar vínculo definitivo'}).click();
  await page.waitForFunction(()=>document.querySelector('#loop03RedeADistribuir')?.textContent==='0');
  assert.equal(await page.locator('#loop03RedeUtilizadas').innerText(),'2');
  assert.match(await page.locator('#loop03OpcoesPosicoes').innerText(),/Indicações: 2/);
  const linha2Confirmada=page.locator('#loop03ListaEquipe .loop03-equipe-linha')
   .filter({hasText:novoIndicado.nome});
  await linha2Confirmada.getByRole('button',{name:'Escolher posição para '+novoIndicado.nome}).click();
  assert.equal(await linha2Confirmada.locator('.loop03-equipe-numero-vinculado').count(),1);
  assert.equal(await linha2Confirmada.locator('.loop03-equipe-numeros>button:enabled').count(),0);
  await page.reload({waitUntil:'networkidle'});
  await page.locator('#conteudoParticipante').waitFor({state:'visible'});
  await page.locator('#loop03Menu').click();
  await page.locator('#loop03Sidebar [data-loop03-aba="rede"]').click();
  assert.equal(await page.locator('#loop03RedeUtilizadas').innerText(),'2');
  assert.equal(await page.locator('#loop03RedeADistribuir').innerText(),'0');
  await page.locator('#loop03ListaEquipe .loop03-equipe-linha')
   .filter({hasText:novoIndicado.nome})
   .getByRole('button',{name:'Escolher posição para '+novoIndicado.nome}).click();
  assert.equal(await page.locator('#loop03ListaEquipe .loop03-equipe-linha')
   .filter({hasText:novoIndicado.nome}).locator('.loop03-equipe-numero-vinculado:disabled').count(),1);
  // A barra lateral possui animacao de 0,2 s no mobile: a captura deve
  // mostrar a aba Minha Equipe, nao uma sobreposicao transitoria do menu.
  await page.waitForFunction(()=>
   !document.querySelector('#loop03Sidebar')?.classList.contains('loop03-aberto'));
  await page.waitForTimeout(350);
  // Minha Rede: o quadro principal conta PESSOAS confirmadas, não posições.
  assert.equal(await page.locator('#loop03RedeTotalIndicacoes').innerText(),'2');
  assert.equal(await page.locator('#loop03RedeADistribuir').innerText(),'0');
  assert.equal(await page.locator('#loop03-rede .loop03-contador-rede').count(),1);
  assert.equal(await page.locator('#loop03BuscarIndicado').isVisible(),true);
  assert.equal(await page.locator('#loop03ListaEquipe .loop03-equipe-linha').count(),2);
  // O número da fila vem do estado persistido do motor e serve para buscar.
  const comNumero=page.locator('#loop03ListaEquipe .loop03-equipe-linha[data-numeros-fila]')
   .filter({has:page.locator('.loop03-fila-equipe-b,.loop03-fila-equipe-a')}).first();
  assert.equal(await comNumero.count(),1);
  const nums=await comNumero.getAttribute('data-numeros-fila');
  const primeiroId=nums.split(',')[0];
  assert.match(primeiroId,/^\d+$/);
  assert.match(await comNumero.innerText(),new RegExp('#'+primeiroId));
  // Pesquisa por nome e por ID real, sem inventar sequência da rede.
  await page.locator('#loop03BuscarIndicado').fill('Bruno');
  assert.equal(await page.locator('#loop03ListaEquipe .loop03-equipe-linha:visible').count(),1);
  assert.match(await page.locator('#loop03ListaEquipe .loop03-equipe-linha:visible').innerText(),/Bruno Santos/);
  await page.locator('#loop03BuscarIndicado').fill('#'+primeiroId);
  assert.equal(await page.locator('#loop03ListaEquipe .loop03-equipe-linha:visible').count(),1);
  await page.locator('#loop03BuscarIndicado').fill('nome que nao existe');
  assert.equal(await page.locator('#loop03ListaEquipe .loop03-equipe-linha:visible').count(),0);
  assert.equal(await page.locator('#loop03ResultadoBuscaEquipe').isVisible(),true);
  await page.locator('#loop03BuscarIndicado').fill('');
  assert.equal(await page.locator('#loop03ListaEquipe .loop03-equipe-linha:visible').count(),2);
  assert.equal(await page.locator('#loop03ListaEquipe').evaluate(x=>getComputedStyle(x).overflowY),'auto');
  assert.equal(await page.locator('#loop03LinksRede').evaluate(x=>!!x.closest('#loop03-rede')),false);
  await page.locator('#loop03LinksRede summary').first().click();
  assert.equal(await page.locator('#loop03LinksRede').getAttribute('open'),'');
  assert.equal(await page.locator('#enderecoLinkParticipante').isVisible(),true);
  assert.equal(await page.locator('#enderecoLinkLojaParticipante').isVisible(),true);
  assert.equal(await page.locator('#copiarLinkParticipante').count(),1);
  assert.equal(await page.locator('#copiarLinkLojaParticipante').count(),1);
  const statusCel=page.locator('#statusLinkIndicacaoParticipante');
  assert.equal(await statusCel.locator('.loop03-link-status-linha').count(),2);
  assert.equal(await statusCel.locator('.loop03-link-status-selo').innerText(),'ATIVO');
  assert.equal(await statusCel.locator('.loop03-link-status-ativo').count(),1);
  assert.equal((await statusCel.innerText()).replace(/\s+/g,' ').trim(),
   'Link ATIVO para divulgação. Bonificações somente após CPF e aceitação dos termos.');
  assert.equal(await statusCel.locator('.loop03-link-status-linha').first()
   .evaluate(x=>getComputedStyle(x,'::before').content),'"●"');
  assert.equal(await statusCel.locator('.loop03-link-status-linha').last()
   .evaluate(x=>getComputedStyle(x,'::before').content),'"●"');
  for(const frase of [
   'Meus dois links de indicação','Um único código de indicação, com dois destinos',
   'Meu link para apresentar o Escritório LOOP','Meu link para apresentar a AKITEMM'
  ]){
   assert.equal((await page.locator('#loop03LinksRede').innerText()).includes(frase),false,
    'A frase excluída não deve reaparecer no celular: '+frase);
  }
  assert.equal(await page.locator('#loop03LinksRede .loop03-link-nick-opcional').getAttribute('open'),null);
  await page.screenshot({path:path.join(pasta,'MINHA_REDE_ATUAL_CELULAR_390.png'),fullPage:true});
  // Mesmo DOM e APIs em viewport desktop, sem dashboard fabricado.
  const ctxRedePC=await browser.newContext({viewport:{width:1254,height:900},deviceScaleFactor:1});
  const redePC=await ctxRedePC.newPage();
  redePC.on('pageerror',err=>erros.push('rede PC: '+err.message));
  await redePC.goto(base+'/laboratorio/participante',{waitUntil:'networkidle'});
  await redePC.locator('#nomeParticipante').fill(titular.nome);
  await redePC.locator('#senhaParticipante').fill(senha);
  await redePC.locator('#botaoEntrarParticipante').click();
  await redePC.locator('#conteudoParticipante').waitFor({state:'visible'});
  await redePC.locator('#loop03Sidebar [data-loop03-aba="rede"]').click();
  assert.equal(await redePC.locator('#loop03RedeTotalIndicacoes').innerText(),'2');
  assert.equal(await redePC.locator('#loop03ListaEquipe .loop03-equipe-linha').count(),2);
  await redePC.locator('#loop03BuscarIndicado').fill('Bruno');
  assert.equal(await redePC.locator('#loop03ListaEquipe .loop03-equipe-linha:visible').count(),1);
  await redePC.locator('#loop03BuscarIndicado').fill('');
  await redePC.locator('#loop03LinksRede summary').first().click();
  assert.equal(await redePC.locator('#enderecoLinkLojaParticipante').isVisible(),true);
  assert.equal(await redePC.locator('#enderecoLinkParticipante').isVisible(),true);
  const statusPC=redePC.locator('#statusLinkIndicacaoParticipante');
  assert.equal(await statusPC.locator('.loop03-link-status-linha').count(),2);
  assert.equal(await statusPC.locator('.loop03-link-status-selo').innerText(),'ATIVO');
  assert.equal(await statusPC.locator('.loop03-link-status-ativo').count(),1);
  for(const frase of [
   'Meus dois links de indicação','Um único código de indicação, com dois destinos',
   'Meu link para apresentar o Escritório LOOP','Meu link para apresentar a AKITEMM'
  ]){
   assert.equal((await redePC.locator('#loop03LinksRede').innerText()).includes(frase),false,
    'A frase excluída não deve reaparecer no computador: '+frase);
  }
  await conferirLargura(redePC,1254,'minha-rede-computador',{captura:false});
  await redePC.screenshot({path:path.join(pasta,'MINHA_REDE_ATUAL_COMPUTADOR_1254.png'),fullPage:true});
  await ctxRedePC.close();

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
     n.classList.contains('loop03-fila-id-nick')&&n.querySelector('.loop03-numero-titular')?'POSICAO':
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
    apelido:['CatQuatro','CatCinco','CatSeis','CatSete'][i],email:'catraca-'+i+'@exemplo.invalid',senha
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
  // A vaga vermelha mostra SOMENTE O NICK de quem está autenticado;
  // nomes de cadastro e de terceiros não aparecem sob o #ID.
  const fotoVermelha=await ocupacaoCores({
   conta:contasDaCatraca[3],largura:1254,celular:false,
   nomeArquivo:'TABULEIRO_VERMELHO_IDENTIFICADO_REAL_COMPUTADOR.png'
  });
  assert.equal(fotoVermelha.vagas[5].nome,'CatSete',
   'A pessoa vê só o próprio nick dentro da bolinha vermelha');


  // Dois pedidos verdadeiros do carrinho de laboratório para a MESMA CONTA.
  // Posição 1: UM PDF R$ 250; posição 2: DOIS itens R$ 100 + R$ 150.
  // O HTML do screenshot não é alterado artificialmente com produtos/valores.
  banco.salvar({produto:curso('guia-pdf-posicao','Guia de Exercícios em PDF',25000),revisaoEsperada:0});
  const compradorPosicoes=contas.cadastrar({
   nome:'Comprador Dois Pedidos Exemplo',apelido:'Exemplo',
   email:'dois-pedidos@exemplo.invalid',senha
  });
  for(const [indice,itens] of [
   [[1],[{produtoId:'guia-pdf-posicao',quantidade:1}]],
   [[2],[{produtoId:'curso-mobile-100',quantidade:1},
     {produtoId:'curso-mobile-150',quantidade:1}]]
  ]){
   const id='pedido-aberturas-posicao-'+indice[0];
   const novo=await fetch(base+'/api/admin/carrinho-loop-demo',{
    method:'POST',headers:cabAdmin,
    body:JSON.stringify({pedidoId:id,contaId:compradorPosicoes.contaId,itens})
   });
   assert.equal(novo.status,201,'Carrinho '+indice[0]+': '+await novo.text());
   const confirmacao=await fetch(base+'/api/admin/carrinho-loop-demo/'+id+'/eventos',{
    method:'POST',headers:cabAdmin,
    body:JSON.stringify({eventoId:'confirmar-aberturas-'+indice[0],tipo:'CONFIRMAR_FICTICIO'})
   });
   assert.equal(confirmacao.status,200,'Compra '+indice[0]+': '+await confirmacao.text());
  }
  // Confirmar as duas posições individualmente neste cenário controlado.
  // A captura fica verde e sem o formulário extra de primeira ativação.
  const estadoComprador=ponteCaptura._restaurar();
  const idsComprador=[...estadoComprador.filas.filaA,...estadoComprador.filas.filaB]
   .filter(p=>p.participanteId===compradorPosicoes.contaId&&p.statusAdesao==='PENDENTE')
   .map(p=>p.id).sort((a,b)=>a-b);
  assert.equal(idsComprador.length,2);
  const primeira=adesoesCaptura.ativar({
   contaId:compradorPosicoes.contaId,posicaoId:idsComprador[0],
   cpfFicticio:cpfDeTeste('370000000'),aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'
  });
  assert.deepEqual(primeira.posicoesIds,[idsComprador[0]]);
  const segunda=adesoesCaptura.ativar({
   contaId:compradorPosicoes.contaId,posicaoId:idsComprador[1],
   aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'
  });
  assert.deepEqual(segunda.posicoesIds,[idsComprador[1]]);
  const fotoComAberturas=async(largura,arquivo)=>{
   const ctx=await browser.newContext({viewport:{width:largura,height:900},deviceScaleFactor:1,
    isMobile:largura<600,hasTouch:largura<600});
   const pagina=await ctx.newPage();
   pagina.on('pageerror',err=>erros.push(err.message));
   await pagina.goto(base+'/laboratorio/participante',{waitUntil:'networkidle'});
   await pagina.locator('#nomeParticipante').fill(compradorPosicoes.nome);
   await pagina.locator('#senhaParticipante').fill(senha);
   await pagina.locator('#botaoEntrarParticipante').click();
   await pagina.locator('#conteudoParticipante').waitFor({state:'visible'});
   if(largura<600)await pagina.locator('#loop03Menu').click();
   await pagina.locator('#loop03Sidebar [data-loop03-aba="posicoes"]').click();
   assert.equal(await pagina.locator('#loop03OpcoesPosicoes .loop03-status-confirmacao-ok').count(),2,
    'Dois pedidos e duas confirmações individuais no banco do laboratório');
   // Conferir ainda a posição 1: PDF individual, R$ 250 da compra histórica.
   await pagina.locator('#loop03OpcoesPosicoes .loop03-compra-gatilho').first().click();
   const primeiroDetalhe=largura<600?
    pagina.locator('#loop03CompraMobile:not([hidden])'):
    pagina.locator('#loop03OpcoesPosicoes .loop03-compra-expandida:not([hidden])');
   assert.match(await primeiroDetalhe.innerText(),/Guia de Exercícios em PDF/);
   assert.match(await primeiroDetalhe.innerText(),/R\$\s?250,00/);
   // Abrir régua 1..6 no topo, selecionar o 2, preservar régua aberta.
   await pagina.locator('#loop03AbrirEscolhaPosicao').click();
   assert.equal(await pagina.locator('#loop03SeletorPosicao').isVisible(),true);
   assert.equal(await pagina.locator('#loop03ListaEscolha button').count(),6);
   assert.equal(await pagina.locator('#loop03ListaEscolha button:disabled').count(),4);
   await pagina.locator('#loop03ListaEscolha [data-indice="2"]').click();
   assert.equal(await pagina.locator('#loop03IndicePosicao').innerText(),'2/6');
   assert.equal(await pagina.locator('#loop03SeletorPosicao').isVisible(),true);
   assert.equal(await pagina.locator('#loop03OpcoesPosicoes .loop03-cartao-selecionado').count(),1);
   assert.equal(await pagina.locator('#loop03OpcoesPosicoes .loop03-unidade-posicao').nth(1)
    .locator('.loop03-cartao-selecionado').count(),1);
   // Selecionar o número 2 já abre a compra — não exige segundo clique.
   assert.equal(await pagina.locator('#loop03OpcoesPosicoes .loop03-compra-gatilho').nth(0)
    .getAttribute('aria-expanded'),'false');
   assert.equal(await pagina.locator('#loop03OpcoesPosicoes .loop03-compra-gatilho').nth(1)
    .getAttribute('aria-expanded'),'true');
   const detalhes=largura<600?
    pagina.locator('#loop03CompraMobile:not([hidden])'):
    pagina.locator('#loop03OpcoesPosicoes .loop03-compra-expandida:not([hidden])');
   assert.equal(await detalhes.count(),1);
   assert.equal(await detalhes.locator('.loop03-produto-comprado').count(),2);
   assert.match(await detalhes.innerText(),/Curso Móvel Básico/);
   assert.match(await detalhes.innerText(),/Curso Móvel Completo/);
   assert.match(await detalhes.innerText(),/R\$\s?100,00/);
   assert.match(await detalhes.innerText(),/R\$\s?150,00/);
   assert.match(await detalhes.innerText(),/R\$\s?250,00/);
   // Só um cartão com dados expandidos, e o brilho segue a seleção.
   assert.equal(await pagina.locator('#loop03OpcoesPosicoes .loop03-compra-expandida:not([hidden])').count(),1);
   assert.equal(await pagina.locator('#loop03OpcoesPosicoes .loop03-cartao-selecionado').count(),1);
   // No computador, os vizinhos da mesma fileira não crescem junto.
   if(largura>=600){
    const alturas=await pagina.locator('#loop03OpcoesPosicoes .loop03-cartao-posicao').evaluateAll(els=>
     els.map(el=>Math.round(el.getBoundingClientRect().height)));
    assert.ok(alturas[1]>alturas[0]+35&&alturas[1]>alturas[2]+35,
     'Somente a posição 2 deve crescer: '+JSON.stringify(alturas));
   }
   // Trocar para 1 fecha a 2 e expande automaticamente a compra 1.
   await pagina.locator('#loop03ListaEscolha [data-indice="1"]').click();
   assert.equal(await pagina.locator('#loop03IndicePosicao').innerText(),'1/6');
   assert.equal(await pagina.locator('#loop03OpcoesPosicoes .loop03-compra-gatilho').nth(0)
    .getAttribute('aria-expanded'),'true');
   assert.equal(await pagina.locator('#loop03OpcoesPosicoes .loop03-compra-gatilho').nth(1)
    .getAttribute('aria-expanded'),'false');
   // Retornar à segunda posição: nunca duas compras simultaneamente.
   await pagina.locator('#loop03ListaEscolha [data-indice="2"]').click();
   assert.equal(await pagina.locator('#loop03IndicePosicao').innerText(),'2/6');
   assert.equal(await pagina.locator('#loop03OpcoesPosicoes .loop03-compra-expandida:not([hidden])').count(),1);
   assert.equal(await pagina.locator('#loop03OpcoesPosicoes .loop03-cartao-selecionado').count(),1);
   // Faixa da posição escolhida é um acordeão: fechar e reabrir.
   await pagina.locator('#loop03OpcoesPosicoes .loop03-compra-gatilho').nth(1).click();
   assert.equal(await pagina.locator('#loop03OpcoesPosicoes .loop03-compra-expandida:not([hidden])').count(),0);
   assert.equal(await pagina.locator('#loop03CompraMobile').isVisible(),false);
   await pagina.locator('#loop03OpcoesPosicoes .loop03-compra-gatilho').nth(1).click();
   assert.equal(await pagina.locator('#loop03OpcoesPosicoes .loop03-compra-expandida:not([hidden])').count(),1);
   assert.equal(await pagina.locator('#loop03SeletorPosicao').isVisible(),true);
   // A faixa selecionada deve ser parte do botão, com texto visível,
   // fundo verde e sem corte da área clicável em celular ou computador.
   const faixas=await pagina.locator('#loop03OpcoesPosicoes .loop03-cartao-rotulo')
    .evaluateAll(els=>els.slice(0,3).map(x=>{
     const rect=x.getBoundingClientRect(),css=getComputedStyle(x);
     return {texto:x.textContent.trim(),largura:rect.width,altura:rect.height,
      verde:css.backgroundImage.includes('rgb(7, 93, 66)'),visivel:css.visibility};
    }));
   assert.equal(faixas[0].texto,'POSIÇÃO 1');
   assert.equal(faixas[1].texto,'POSIÇÃO 2');
   for(const n of [0,1]){
    assert.ok(faixas[n].largura>50&&faixas[n].altura>=18&&faixas[n].verde&&
     faixas[n].visivel==='visible',
     'A faixa verde de cada posição precisa ser visível no computador E celular: '+JSON.stringify(faixas));
    assert.equal(await pagina.locator('#loop03OpcoesPosicoes .loop03-cartao-posicao')
     .nth(n).locator('.loop03-cartao-abrir > .loop03-compra-gatilho').count(),1,
     'A faixa colorida deve estar DENTRO do botão funcional, sem sobreposição');
   }
   // Garantir que a faixa e sua escrita cabem inteiras no cartão e no viewport.
   const pintura=await pagina.locator('#loop03OpcoesPosicoes .loop03-compra-gatilho').nth(1)
    .evaluate(el=>{
     const r=el.getBoundingClientRect();
     const card=el.closest('.loop03-cartao-posicao').getBoundingClientRect();
     const centro=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
     return {rotulo:el.textContent.trim(),fundo:getComputedStyle(el).backgroundImage,
      area:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},
      card:{left:card.left,right:card.right,top:card.top,bottom:card.bottom},
      alvos:(centro?.closest('.loop03-cartao-abrir')===el.closest('.loop03-cartao-abrir')),
      viewport:document.documentElement.clientWidth};
    });
   assert.ok(pintura.alvos&&pintura.area.left>=pintura.card.left&&
    pintura.area.right<=pintura.card.right+1&&pintura.area.right<=pintura.viewport,
    'A faixa POSIÇÃO 2 deve estar pintada e clicável sem bordas cortadas: '+JSON.stringify(pintura));
   assert.equal(await pagina.locator('#loop03OpcoesPosicoes .loop03-cartao-posicao').nth(1)
    .locator('.loop03-cartao-abrir').getAttribute('aria-expanded'),'true');
   await conferirLargura(pagina,largura,'aberturas-posicoes-'+largura,{captura:false});
   // Captura fullPage REAL COM DOIS PAINÉIS ABERTOS: seletor + detalhe da compra.
   await pagina.screenshot({path:path.join(pasta,arquivo),fullPage:true});
   await ctx.close();
  };
  await fotoComAberturas(1254,'MINHAS_POSICOES_SELETOR_1A6_E_COMPRA_2_ITENS_PC_1254.png');
  await fotoComAberturas(390,'MINHAS_POSICOES_SELETOR_1A6_E_COMPRA_2_ITENS_CEL_390.png');


  // Foto real de 4 indicações registradas no SQLite de teste, sem placeholders.
  for(const [ordem,nome,nick,cpf] of [
   ['terceira','Carla Pereira','Terceiro','62531497846'],
   ['quarta','Lucas Almeida','Quarto','86742519355']
  ]){
   const usuario=contas.cadastrar({nome,apelido:nick,email:ordem+'@exemplo.invalid',
    senha,codigoIndicador:titular.codigoConvite});
   const pedidoId='pedido-'+ordem+'-indicacao';
   const resposta=await fetch(base+'/api/admin/carrinho-loop-demo',{
    method:'POST',headers:cabAdmin,
    body:JSON.stringify({pedidoId,contaId:usuario.contaId,
     itens:[{produtoId:'curso-mobile-100',quantidade:1},
      {produtoId:'curso-mobile-150',quantidade:1}]})
   });
   assert.equal(resposta.status,201,await resposta.text());
   const confirmado=await fetch(base+'/api/admin/carrinho-loop-demo/'+pedidoId+'/eventos',{
    method:'POST',headers:cabAdmin,
    body:JSON.stringify({eventoId:'evento-'+ordem,tipo:'CONFIRMAR_FICTICIO'})
   });
   assert.equal(confirmado.status,200,await confirmado.text());
   const cx=await browser.newContext({viewport:{width:390,height:812},isMobile:true,hasTouch:true});
   const pag=await cx.newPage();
   pag.on('pageerror',err=>erros.push(ordem+': '+err.message));
   await pag.goto(base+'/laboratorio/participante',{waitUntil:'networkidle'});
   await pag.locator('#nomeParticipante').fill(nome);
   await pag.locator('#senhaParticipante').fill(senha);
   await pag.locator('#botaoEntrarParticipante').click();
   await pag.locator('#conteudoParticipante').waitFor({state:'visible'});
   await pag.locator('#loop03Menu').click();
   await pag.locator('#loop03Sidebar [data-loop03-aba="posicoes"]').click();
   await pag.locator('#loop03OpcoesPosicoes [data-loop03-posicao]').first().click();
   await pag.locator('#cpfFicticioParticipante').fill(cpf);
   await pag.locator('#aceiteTermosParticipante').check();
   await pag.locator('#confirmarAtivacaoParticipante').click();
   await pag.locator('#secaoAtivacaoParticipante').waitFor({state:'hidden'});
   await cx.close();
  }
  for(const [width,filename] of [
   [390,'MINHA_REDE_QUATRO_INDICACOES_NICK_CELULAR.png'],
   [1254,'MINHA_REDE_QUATRO_INDICACOES_NICK_COMPUTADOR.png']
  ]){
   const cx=await browser.newContext({viewport:{width,height:900},
    isMobile:width===390,hasTouch:width===390});
   const pag=await cx.newPage();
   pag.on('pageerror',err=>erros.push('rede '+width+': '+err.message));
   await pag.goto(base+'/laboratorio/participante',{waitUntil:'networkidle'});
   await pag.locator('#nomeParticipante').fill(titular.nome);
   await pag.locator('#senhaParticipante').fill(senha);
   await pag.locator('#botaoEntrarParticipante').click();
   await pag.locator('#conteudoParticipante').waitFor({state:'visible'});
   if(width===390)await pag.locator('#loop03Menu').click();
   await pag.locator('#loop03Sidebar [data-loop03-aba="rede"]').click();
   assert.equal(await pag.locator('#loop03RedeTotalIndicacoes').innerText(),'4');
   assert.equal(await pag.locator('#loop03-rede .loop03-rede-subtotal:not(.loop03-rede-utilizadas) span').innerText(),
    'Indicações a distribuir');
   assert.equal(await pag.locator('#loop03ListaEquipe .loop03-equipe-linha').count(),4);
   assert.deepEqual(await pag.locator('#loop03ListaEquipe .loop03-equipe-avatar').allTextContents(),
    ['1','2','3','4'],'Numerar esferas pela ordem dos cadastros do SQLite');
   assert.deepEqual(await pag.locator('#loop03ListaEquipe .loop03-equipe-linha')
    .evaluateAll(els=>els.map(el=>el.dataset.numeroIndicacao)),
    ['1','2','3','4']);
   assert.equal(await pag.locator('#loop03ListaEquipe .loop03-ordem-indicacao').count(),0);
   assert.equal(await pag.locator('#loop03RedeUtilizadas').innerText(),'2');
   assert.equal(await pag.locator('#loop03RedeADistribuir').innerText(),'2');
   assert.equal(await pag.locator('#loop03ListaEquipe .loop03-equipe-estado.loop03-equipe-ativo').count(),4);
   assert.equal(await pag.locator('#loop03ListaEquipe .loop03-equipe-numeros').count(),4);
   assert.deepEqual(await pag.locator('#loop03ListaEquipe .loop03-equipe-linha>strong').allTextContents(),
    ['Ana Oliveira','Bruno Santos','Carla Pereira','Lucas Almeida']);
   await pag.locator('#loop03LinksRede summary').first().click();
   assert.equal(await pag.locator('#apelidoLinkParticipante').isVisible(),true);
   assert.equal(await pag.locator('#salvarApelidoLinkParticipante').innerText(),'Salvar');
   const campo=await pag.locator('#apelidoLinkParticipante').boundingBox(),
    salvar=await pag.locator('#salvarApelidoLinkParticipante').boundingBox();
   assert.ok(campo&&salvar&&salvar.x>=campo.x+campo.width-1&&
    Math.abs(salvar.y-campo.y)<5,'Nick e Salvar lado a lado');
   if(width===390){
    await pag.locator('#apelidoLinkParticipante').fill('MeuNick');
    await pag.locator('#salvarApelidoLinkParticipante').click();
    await pag.waitForFunction(()=>document.querySelector('#enderecoLinkParticipante')?.value.endsWith('/MeuNick'));
    assert.equal(await pag.locator('#avisoLinkParticipante').textContent(),'',
     'Não mostrar nota técnica de atualização/rastreamento no rodapé');
    assert.equal(await pag.locator('#avisoLinkParticipante').isVisible(),false,
     'Rodapé vazio deve desaparecer após salvar nick');
    assert.equal(await pag.locator('#loop03OpcoesPosicoes .loop03-cartao-nick').first().textContent(),'MeuNick');
    await pag.locator('#loop03Menu').click();
    await pag.locator('#loop03Sidebar [data-loop03-aba="tabuleiro"]').click();
    // A cadeira do titular pode estar no CENTRO ou em uma vaga, não na fila.
    // Conferir a identificação onde o motor realmente a colocou.
    await pag.waitForFunction(()=>[...document.querySelectorAll(
     '#mapaFilaAParticipante .linha-minha-demo .loop03-fila-id-nick,'+
     '#mapaFilaBParticipante .linha-minha-demo .loop03-fila-id-nick,'+
     '#mapaTabuleiroParticipante .espaco-meu-tabuleiro-demo .loop03-ocupante-identidade'
    )].some(el=>el.querySelector('.loop03-fila-nick,.loop03-nome-na-bola')?.textContent==='MeuNick'));
    const identidades=await pag.evaluate(()=>[...document.querySelectorAll(
     '#mapaFilaAParticipante .linha-minha-demo .loop03-fila-id-nick,'+
     '#mapaFilaBParticipante .linha-minha-demo .loop03-fila-id-nick,'+
     '#mapaTabuleiroParticipante .espaco-meu-tabuleiro-demo .loop03-ocupante-identidade'
    )].map(el=>({id:el.querySelector('.selo-posicao-demo')?.textContent,
     nick:el.querySelector('.loop03-fila-nick,.loop03-nome-na-bola')?.textContent})));
    assert.ok(identidades.length>0,'Posição real do titular presente no motor');
    assert.ok(identidades.every(x=>/^#\d+$/.test(x.id)&&x.nick==='MeuNick'),
     'Nick atualizado abaixo do #ID em toda posição própria: '+JSON.stringify(identidades));
    // Outras pessoas têm nick público na fila B; nunca exibir nome civil.
    const filaNick=pag.locator('#mapaFilaBParticipante .loop03-fila-id-nick');
    assert.ok(await filaNick.filter({hasText:'Terceiro'}).count()>0,
     'Nick de indicado ativo também deve aparecer abaixo do #ID da fila B');
    await pag.locator('#loop03Menu').click();
    await pag.locator('#loop03Sidebar [data-loop03-aba="rede"]').click();
   }
   // Capturar no MESMO sistema verdadeiro a janelinha com escolha e a
   // confirmação verde/cancelar, sem efetuar o vínculo do terceiro indicado.
   const terceiraLinha=pag.locator('#loop03ListaEquipe .loop03-equipe-linha').nth(2);
   await terceiraLinha.getByRole('button',{name:'Escolher posição para Carla Pereira'}).click();
   assert.equal(await terceiraLinha.locator('.loop03-equipe-numeros>button').count(),1);
   await terceiraLinha.getByRole('button',{name:/Posição 1 · #/}).click();
   assert.equal(await terceiraLinha.locator('.loop03-equipe-confirmacao>span').innerText(),
    'Confirmar indicação 3 para primeira posição? Essa escolha será definitiva.');
   assert.equal(await terceiraLinha.getByRole('button',{name:'Confirmar vínculo definitivo'}).isVisible(),true);
   assert.equal(await terceiraLinha.getByRole('button',{name:'Cancelar'}).isVisible(),true);
   await conferirLargura(pag,width,'rede-quatro-'+width,{captura:false});
   await pag.screenshot({path:path.join(pasta,filename),fullPage:true});
   await terceiraLinha.getByRole('button',{name:'Cancelar'}).click();
   assert.equal(await pag.locator('#loop03RedeADistribuir').innerText(),'2');
   await cx.close();
  }
  // Estado vermelho exige cadastro SEM compra; não somar à contagem confirmada.
  const semCompra=contas.cadastrar({
   nome:'Cadastro Sem Compra Exemplo',apelido:'SemCompra',
   email:'semcompra@exemplo.invalid',senha,codigoIndicador:titular.codigoConvite
  });
  await page.reload({waitUntil:'networkidle'});
  await page.locator('#conteudoParticipante').waitFor({state:'visible'});
  await page.locator('#loop03Menu').click();
  await page.locator('#loop03Sidebar [data-loop03-aba="rede"]').click();
  const naoAtiva=page.locator('#loop03ListaEquipe .loop03-equipe-linha')
   .filter({hasText:semCompra.nome});
  assert.equal(await naoAtiva.locator('.loop03-equipe-estado').innerText(),'NÃO ATIVO');
  assert.equal(await naoAtiva.locator('.loop03-equipe-avatar').innerText(),'5');
  await page.reload({waitUntil:'networkidle'});
  await page.locator('#conteudoParticipante').waitFor({state:'visible'});
  await page.locator('#loop03Menu').click();
  await page.locator('#loop03Sidebar [data-loop03-aba="rede"]').click();
  assert.deepEqual(await page.locator('#loop03ListaEquipe .loop03-equipe-avatar').allTextContents(),
   ['1','2','3','4','5'],'A sequência histórica persiste após recarregar');
  assert.equal(await naoAtiva.locator('.loop03-equipe-inativo').count(),1);
  assert.equal(await page.locator('#loop03RedeTotalIndicacoes').innerText(),'4');
  assert.equal(await page.locator('#loop03RedeUtilizadas').innerText(),'2');
  assert.equal(await page.locator('#loop03RedeADistribuir').innerText(),'2');
  await naoAtiva.getByRole('button',{name:'Escolher posição para '+semCompra.nome}).click();
  assert.equal(await naoAtiva.locator('.loop03-equipe-numeros>button:enabled').count(),0);
  await page.screenshot({path:path.join(pasta,'REDE_STATUS_NAO_ATIVO_CELULAR_390.png'),fullPage:true});


  // Registros adicionais para a revisão dos QUATRO SELOS na mesma tela.
  // A compra simples de R$100 só ativa o link AMARELO; não gera cadeira.
  const clienteAmarelo=contas.cadastrar({
   nome:'Cliente Link Liberado',apelido:'LinkLivre',
   email:'link-livre@exemplo.invalid',senha,codigoIndicador:titular.codigoConvite
  });
  const pedidoAmarelo='pedido-link-liberado-sem-loop';
  const respostaAmarela=await fetch(base+'/api/admin/carrinho-loop-demo',{
   method:'POST',headers:cabAdmin,
   body:JSON.stringify({pedidoId:pedidoAmarelo,contaId:clienteAmarelo.contaId,
    itens:[{produtoId:'curso-mobile-100',quantidade:1}]})
  });
  assert.equal(respostaAmarela.status,201,await respostaAmarela.text());
  const confirmouAmarelo=await fetch(base+
   '/api/admin/carrinho-loop-demo/'+pedidoAmarelo+'/eventos',{
   method:'POST',headers:cabAdmin,
   body:JSON.stringify({eventoId:'evento-link-liberado',tipo:'CONFIRMAR_FICTICIO'})
  });
  assert.equal(confirmouAmarelo.status,200,await confirmouAmarelo.text());
  assert.equal(!!banco.banco.prepare(
   'SELECT 1 FROM admin_ponte_vendas_loja_sem_loop_demo WHERE conta_id=?'
  ).get(clienteAmarelo.contaId),true,'Compra da loja registrada sem criar posição');

  // Compra qualificada gera cadeira AZUL, mas o convidado ainda não deu CPF.
  const clienteAzul=contas.cadastrar({
   nome:'Cliente Aguardando CPF',apelido:'AguardCPF',
   email:'aguardando-cpf@exemplo.invalid',senha,codigoIndicador:titular.codigoConvite
  });
  const pedidoAzul='pedido-posicao-azul-sem-cpf';
  const respostaAzul=await fetch(base+'/api/admin/carrinho-loop-demo',{
   method:'POST',headers:cabAdmin,
   body:JSON.stringify({pedidoId:pedidoAzul,contaId:clienteAzul.contaId,
    itens:[{produtoId:'curso-mobile-100',quantidade:1},
     {produtoId:'curso-mobile-150',quantidade:1}]})
  });
  assert.equal(respostaAzul.status,201,await respostaAzul.text());
  const confirmouAzul=await fetch(base+
   '/api/admin/carrinho-loop-demo/'+pedidoAzul+'/eventos',{
   method:'POST',headers:cabAdmin,
   body:JSON.stringify({eventoId:'evento-posicao-azul',tipo:'CONFIRMAR_FICTICIO'})
  });
  assert.equal(confirmouAzul.status,200,await confirmouAzul.text());
  for(const [largura,foto] of [
   [390,'MINHA_REDE_QUATRO_STATUS_CELULAR_390.png'],
   [1254,'MINHA_REDE_QUATRO_STATUS_COMPUTADOR_1254.png']
  ]){
   const ctx=await browser.newContext({viewport:{width:largura,height:900},
    isMobile:largura===390,hasTouch:largura===390});
   const tela=await ctx.newPage();
   tela.on('pageerror',erro=>erros.push('cores '+largura+': '+erro.message));
   await tela.goto(base+'/laboratorio/participante',{waitUntil:'networkidle'});
   await tela.locator('#nomeParticipante').fill(titular.nome);
   await tela.locator('#senhaParticipante').fill(senha);
   await tela.locator('#botaoEntrarParticipante').click();
   await tela.locator('#conteudoParticipante').waitFor({state:'visible'});
   if(largura===390)await tela.locator('#loop03Menu').click();
   await tela.locator('#loop03Sidebar [data-loop03-aba="rede"]').click();
   const linhas=tela.locator('#loop03ListaEquipe .loop03-equipe-linha');
   assert.equal(await linhas.count(),7);
   assert.deepEqual(await tela.locator('#loop03ListaEquipe .loop03-equipe-avatar').allTextContents(),
    ['1','2','3','4','5','6','7']);
   assert.equal(await linhas.locator('.loop03-equipe-ativo').count(),4);
   assert.equal(await linhas.locator('.loop03-equipe-inativo').count(),1);
   assert.equal(await linhas.locator('.loop03-equipe-link-ativo').count(),1);
   assert.equal(await linhas.locator('.loop03-equipe-pendente').count(),1);
   assert.equal(await linhas.filter({hasText:clienteAmarelo.nome})
    .locator('.loop03-equipe-estado').innerText(),'LINK ATIVO');
   assert.equal(await linhas.filter({hasText:clienteAzul.nome})
    .locator('.loop03-equipe-estado').innerText(),'PENDENTE');
   assert.equal(await tela.locator('#loop03RedeTotalIndicacoes').innerText(),'4');
   assert.equal(await tela.locator('#loop03RedeADistribuir').innerText(),'2');
   assert.equal(await tela.locator('#loop03RedeUtilizadas').innerText(),'2');
   await conferirLargura(tela,largura,'rede-4-cores-'+largura,{captura:false});
   await tela.screenshot({path:path.join(pasta,foto),fullPage:true});
   // Segunda captura REAL do mesmo painel, rolando apenas a lista interna,
   // para mostrar também os selos AMARELO e AZUL não visíveis no topo.
   await tela.locator('#loop03ListaEquipe').evaluate(el=>{el.scrollTop=el.scrollHeight;});
   await tela.waitForTimeout(120);
   assert.equal(await linhas.filter({hasText:clienteAmarelo.nome})
    .locator('.loop03-equipe-link-ativo').count(),1);
   assert.equal(await linhas.filter({hasText:clienteAzul.nome})
    .locator('.loop03-equipe-pendente').count(),1);
   await tela.screenshot({
    path:path.join(pasta,foto.replace('.png','_PARTE_FINAL.png')),fullPage:true
   });
   await ctx.close();
  }

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