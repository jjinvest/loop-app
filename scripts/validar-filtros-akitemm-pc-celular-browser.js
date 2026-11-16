'use strict';
// Prova browser real da MESMA vitrine em PC/celular, sem editar dados do site.
// Os produtos desta rotina existem apenas em respostas HTTP locais temporárias.
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {once}=require('node:events');
const {chromium}=require('playwright');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');

const PADRAO=['ROXO','DOURADO','VERDE','CINZA','CINZA','VERDE','DOURADO','ROXO'];
const PRODUTOS=['ROXO','DOURADO','VERDE','CINZA'].map(cor=>({
 produtoId:'produto-'+cor.toLowerCase(),nome:'Produto '+cor.toLowerCase(),
 descricao:'Mercadoria publicada para validar filtro no navegador',
 tipo:'FISICO',estado:'PUBLICADO',classeVisual:cor,detalhes:[],
 precoCentavos:18990,elegivelLoop:false,quantidadeMinimaLoop:1,
 posicoesPorPedidoLoop:0,fotos:[],quantidadeMaxima:50
}));

(async()=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 const senhaOperador='filtro-browser-'+randomBytes(28).toString('hex');
 const contexto=criarAppLojaEscritorioCandidato({
  banco,repositorioCatalogo:catalogoFicticioCheckout(),
  segredoOperador:senhaOperador,
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  termosVersao:'LAB-FILTROS_BROWSER_TEMPORARIO',
  termosTexto:'Somente teste isolado, sem cobrança, sem conta comercial.'
 });
 const server=contexto.app.listen(0,'127.0.0.1');
 await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  for(const dispositivo of [
   {nome:'computador',viewport:{width:1366,height:810},mobile:false,cols:4,inicial:20},
   {nome:'celular',viewport:{width:390,height:844},mobile:true,cols:2,inicial:20}
  ]){
   const contextoPagina=await browser.newContext({
    viewport:dispositivo.viewport,isMobile:dispositivo.mobile,deviceScaleFactor:1
   });
   const pagina=await contextoPagina.newPage();
   const erros=[];
   pagina.on('pageerror',e=>erros.push(e.message));
   let produtos=[],slots=[...PADRAO],ofertas=[];
   await pagina.route('**/staging/vitrine/**',async rota=>{
    const url=new URL(rota.request().url()),p=url.pathname;
    const options={
     status:200,contentType:'application/json',headers:{'cache-control':'no-store'}
    };
    const responder=body=>rota.fulfill({...options,body:JSON.stringify(body)});
    if(p==='/staging/vitrine/loja/comunicados')return rota.continue();
    if(p==='/staging/vitrine/loja/catalogo')return responder({
     produtos,ofertasCompostas:[],catalogoComercialReal:true,checkoutReal:false,
     referenciaLoopCentavos:25000,conviteLoopCheckoutAtivo:false
    });
    if(p==='/staging/vitrine/loja/config')return responder({
     config:{banners:[],ofertas,redes:{},informacoes:{},vitrineSlots:slots},revisao:0
    });
    if(p==='/staging/vitrine/minha-conta')
     return rota.fulfill({...options,status:401,body:'{"erro":"SESSAO_AUSENTE"}'});
    if(p==='/staging/vitrine/loja/pedidos')return responder({pedidos:[]});
    if(p==='/staging/vitrine/loja/avaliacoes/pendentes')return responder({itens:[]});
    if(p==='/staging/vitrine/novidades')return responder({itens:[]});
    return responder({});
   });
   const abrir=async()=>{
    await pagina.goto(base+'/staging/loja',{waitUntil:'domcontentloaded'});
    await pagina.locator('#conteudoLojaLoop').waitFor({state:'visible'});
    await pagina.locator('#catalogoLojaLoop .produto-loja-loop').first()
     .waitFor({state:'visible'});
   };
   const cards=()=>pagina.locator('#catalogoLojaLoop article.produto-loja-loop');
   await abrir();
   const cursos=pagina.locator('#akitemmMeusCursos');
   assert.equal(await cursos.count(),1,'Meus Cursos deve ser o mesmo componente em ambos');
   await cursos.locator('summary').click();
   await pagina.locator('#akitemmListaMeusCursos li').first().waitFor({state:'visible'});
   assert.equal(await pagina.locator('#akitemmListaMeusCursos a[href*="/pdf/"]').count(),0,
    'sem confirmação e compra, não pode surgir link de download');
   await cursos.locator('summary').click();
   assert.equal(await cards().count(),dispositivo.inicial);
   assert.equal(await pagina.locator('#catalogoLojaLoop .akitemm-slot-vazio').count(),
    dispositivo.inicial,'espaços vazios não são anúncios nem compras');
   assert.equal(await pagina.locator('#akitemmAbasProdutos button').count(),10);
   assert.equal(await pagina.locator('#catalogoLojaLoop .ak-faixa-horizontal').count(),2);
   assert.equal(await pagina.locator('#catalogoLojaLoop .ak-faixa-horizontal').first()
    .locator('article').count(),10);
   const geometriaLinha=await pagina.locator('#catalogoLojaLoop .ak-faixa-horizontal')
    .first().evaluate(el=>{
     const card=el.querySelector('article');
     const gap=parseFloat(getComputedStyle(el).columnGap)||0;
     return {
      visiveis:Math.round((el.clientWidth+gap)/(card.getBoundingClientRect().width+gap)),
      desliza:el.scrollWidth>el.clientWidth,
      primeiro:card.dataset.akitemmSlot
     };
    });
   assert.equal(geometriaLinha.visiveis,dispositivo.cols);
   assert.equal(geometriaLinha.desliza,true,'dez cartões devem rolar na horizontal');
   assert.equal(geometriaLinha.primeiro,'1');
   await pagina.locator('#akitemmCarregarMais').click();
   assert.equal(await cards().count(),40,'expansão revela 4 fileiras de 10');
   assert.equal(await pagina.locator('#catalogoLojaLoop .ak-faixa-horizontal').count(),4);
   await pagina.locator('#akitemmAbasProdutos button').nth(1).click();
   assert.equal(await cards().count(),20,'a segunda aba começa com 2 fileiras');
   assert.equal(await pagina.locator('#catalogoLojaLoop .ak-faixa-horizontal').first()
    .locator('article').first().getAttribute('data-akitemm-slot'),'41');
   assert.equal(await pagina.locator('#akitemmAbasProdutos button').nth(1)
    .getAttribute('aria-current'),'page');
   await pagina.locator('#akitemmAbasProdutos button').first().click();
   assert.equal(await cards().count(),40,'voltar mantém expansão da primeira aba');
   await pagina.locator('#akitemmCarregarMais').click();
   assert.equal(await cards().count(),20,'recolher restaura 2 fileiras');
   const legenda=await pagina.locator('.akitemm-legenda-cores').evaluate(e=>
    getComputedStyle(e).gridTemplateColumns.split(' ').length);
   assert.equal(legenda,2,'filtros em duas colunas nos dois dispositivos');

   for(const cor of ['ROXO','DOURADO','VERDE','CINZA']){
    await pagina.locator('[data-akitemm-cor="'+cor+'"]').click();
    assert.equal(await cards().count(),2,
     dispositivo.nome+': só dois quadrinhos '+cor);
    assert.equal(await pagina.locator('#catalogoLojaLoop .akitemm-slot-'+cor.toLowerCase()).count(),2);
    assert.equal(await pagina.locator('[data-akitemm-cor="'+cor+'"]').getAttribute('aria-pressed'),'true');
    assert.equal(await pagina.locator('#akitemmFiltroTodos').getAttribute('aria-pressed'),'false');
    assert.equal(await pagina.locator('#catalogoLojaLoop button').count(),0,
     'quadrinho vazio não é produto nem permite comprar');
   }
   await pagina.locator('#akitemmFiltroTodos').click();
   assert.equal(await cards().count(),dispositivo.inicial);
   assert.equal(await pagina.locator('#akitemmFiltroTodos').getAttribute('aria-pressed'),'true');
   await pagina.locator('#akitemmFiltroOfertas').click();
   assert.equal(await cards().count(),0,'ofertas sem publicação não inventam anúncios');
   assert.equal(await pagina.locator('#akitemmFiltroOfertas').getAttribute('aria-pressed'),'true');
   await pagina.locator('#akitemmFiltroTodos').click();

   // Mudança dos oito slots: estes valores também são editáveis e salvos
   // no SQLite real (testes do repositório). Aqui se prova a atualização da UI.
   slots=['ROXO','ROXO','VERDE','CINZA','ROXO','VERDE','CINZA','DOURADO'];
   await pagina.reload({waitUntil:'domcontentloaded'});
   await pagina.locator('#conteudoLojaLoop').waitFor({state:'visible'});
   await pagina.locator('[data-akitemm-cor="ROXO"]').click();
   assert.equal(await cards().count(),3,
    'mesmo filtro mostra os três slots roxos do administrador em ambas as telas');
   await pagina.locator('#akitemmFiltroTodos').click();

   // Produtos reais no teste local: uma cor classifica um só produto;
   // ele substitui sua moldura e não cria direitos de compra.
   slots=[...PADRAO];produtos=[...PRODUTOS];ofertas=['produto-roxo'];
   await pagina.reload({waitUntil:'domcontentloaded'});
   await pagina.locator('#conteudoLojaLoop').waitFor({state:'visible'});
   for(const cor of ['ROXO','DOURADO','VERDE','CINZA']){
    await pagina.locator('[data-akitemm-cor="'+cor+'"]').click();
    assert.equal(await cards().count(),2);
    assert.equal(await pagina.locator('#catalogoLojaLoop .akitemm-slot-vazio').count(),1);
    assert.equal(await pagina.locator('#catalogoLojaLoop .produto-loja-loop h3')
     .allTextContents().then(a=>a.join('')),'Produto '+cor.toLowerCase());
    const botao=pagina.locator('#catalogoLojaLoop .akitemm-adicionar');
    assert.equal(await botao.count(),1);
    assert.equal(await botao.isDisabled(),true,'checkout comercial continua bloqueado');
   }
   await pagina.locator('#akitemmFiltroOfertas').click();
   assert.equal(await cards().count(),1,'Ofertas somente produto realmente marcado');
   assert.equal(await pagina.locator('#catalogoLojaLoop h3').innerText(),'Produto roxo');
   await pagina.locator('#akitemmFiltroTodos').click();
   assert.equal(await cards().count(),dispositivo.inicial);
   await pagina.locator('#akitemmBusca').fill('produto verde');
   assert.equal(await pagina.locator('#akitemmBusca').inputValue(),'produto verde',
    'a busca não pode apagar o que o visitante digitou');
   assert.equal(await cards().count(),1);
   assert.equal(await pagina.locator('#catalogoLojaLoop h3').innerText(),'Produto verde');
   await pagina.locator('#akitemmFiltroTodos').click();
   assert.equal(await pagina.locator('#akitemmBusca').inputValue(),'');
   assert.equal(await cards().count(),dispositivo.inicial);
   const geometria=await pagina.evaluate(()=>({
    total:document.documentElement.scrollWidth,largura:window.innerWidth
   }));
   assert.ok(geometria.total<=geometria.largura+4,
    'rolagem horizontal indevida no '+dispositivo.nome+': '+JSON.stringify(geometria));

   // A mesma UI de administrador mostra somente a aba escolhida e publica
   // recados reais no SQLite local, sem tocar em Railway nem em clientes.
   const admin=await contextoPagina.newPage();
   const errosAdmin=[];
   admin.on('pageerror',e=>errosAdmin.push(e.message));
   await admin.goto(base+'/staging/escritorio-admin',{waitUntil:'domcontentloaded'});
   assert.equal(await admin.locator('#abasServicosAdmin [role="tab"]').count(),8);
   await admin.locator('#token').fill(senhaOperador);
   await admin.locator('#formAcesso button[type="submit"],#formAcesso button').click();
   await admin.locator('#administracao').waitFor({state:'visible',timeout:12000});
   assert.equal(await admin.locator('#admin-painel-geral').isVisible(),true);
   await admin.locator('#admin-aba-produtos').click();
   assert.equal(await admin.locator('#formProduto').isVisible(),true);
   assert.equal(await admin.locator('#admin-painel-geral').isVisible(),false);
   await admin.locator('#admin-aba-mensagens').click();
   assert.equal(await admin.locator('#formComunicadoAdmin').isVisible(),true);
   assert.equal(await admin.locator('#formProduto').isVisible(),false);
   const tituloTeste='Aviso exclusivo AKITEMM '+dispositivo.nome;
   await admin.locator('#comunicadoCanalAdmin').selectOption('AKITEMM');
   await admin.locator('#comunicadoFormatoAdmin').selectOption('BANNER');
   await admin.locator('#comunicadoTituloAdmin').fill(tituloTeste);
   await admin.locator('#comunicadoCorpoAdmin').fill('Um banner textual de recado, sem produtos.');
   await admin.locator('#comunicadoEstadoAdmin').selectOption('PUBLICADO');
   await admin.locator('#comunicadoSalvarAdmin').click();
   await admin.waitForFunction(()=>
    document.getElementById('comunicadoResultadoAdmin')?.textContent.includes('PUBLICADO'),
    {timeout:12000});
   await pagina.reload({waitUntil:'domcontentloaded'});
   await pagina.locator('#conteudoLojaLoop').waitFor({state:'visible'});
   await pagina.locator('#akitemmSino').click();
   await pagina.waitForFunction(titulo=>
    document.getElementById('akitemmNotificacoesConteudo')?.textContent.includes(titulo),
    tituloTeste,{timeout:12000});
   const geometriaAdmin=await admin.evaluate(()=>({
    total:document.documentElement.scrollWidth,largura:window.innerWidth
   }));
   assert.ok(geometriaAdmin.total<=geometriaAdmin.largura+4,
    'painel deve caber na tela '+dispositivo.nome+': '+JSON.stringify(geometriaAdmin));
   assert.deepEqual(errosAdmin,[],'sem erro JS administrativo em '+dispositivo.nome);
   await admin.close();
   assert.deepEqual(erros,[],'sem erro JavaScript no '+dispositivo.nome);
   console.log('AKITEMM_FILTROS_'+dispositivo.nome.toUpperCase()+
    '=TODOS_OFERTAS_CINZA_VERDE_DOURADO_ROXO_10_ABAS_400_ESPACOS_SEM_CHECKOUT_OK');
   await contextoPagina.close();
  }
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
  banco.close();
 }
})().catch(e=>{console.error('AKITEMM_FILTROS_PC_CELULAR_FALHARAM',e);process.exitCode=1;});
