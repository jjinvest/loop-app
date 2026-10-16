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
  await page.locator('#filtroTodasMapaParticipante').click();
  assert.equal(await page.locator('#filtroTodasMapaParticipante').getAttribute('aria-pressed'),'true');
  await page.locator('#filtroResumoMapaParticipante').click();
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

  await page.locator('#cpfFicticioParticipante').fill('11144477735');
  await page.locator('#aceiteTermosParticipante').check();
  await page.locator('#confirmarAtivacaoParticipante').click();
  await page.locator('#secaoAtivacaoParticipante').waitFor({state:'hidden'});
  assert.equal(await page.locator('.linha-minha-demo .posicao-vermelho').count(),1);
  await page.screenshot({path:path.join(pasta,'escritorio-posicao-ativada.png'),fullPage:true});

  assert.deepEqual(erros,[], 'Erros de execucao no navegador');
  const relatorio={status:'APROVADO',
   tamanhosPx:[320,360,390,412],pedidosCriados:1,
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