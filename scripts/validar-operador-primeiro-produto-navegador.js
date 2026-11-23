'use strict';
// JORNADA TECNICA DESCARTAVEL DA INTERFACE REAL.
// Comeca com ZERO produtos em banco efemero; NAO cadastra mercadoria AKITEMM,
// NAO toca Railway, NAO cria pagamento, saldo, pedido ou posicao LOOP.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const https=require('node:https');
const {once}=require('node:events');
const {execFileSync}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {chromium}=require('playwright');
const {IdentidadeClienteLoopReal}=require('../src/producao/identidade-cliente-loop-sqlite');
const {CatalogoMultiDistribuidoresSQLite}=require('../src/producao/catalogo-multidistribuidores-sqlite');
const {ControleEconomicoLojaSQLite}=require('../src/producao/controle-economico-loja-sqlite');
const {SessaoAdminComercialSQLite}=require('../src/producao/sessao-admin-comercial-sqlite');
const {AuditoriaOperacionalSQLite}=require('../src/producao/auditoria-operacional-sqlite');
const {ManutencaoComercialSQLite}=require('../src/producao/manutencao-comercial-sqlite');
const {criarCatalogoMercadoriasReal}=require('../src/producao/catalogo-mercadorias-real');
const {criarAppIdentidadeLoop}=require('../src/producao/servidor-identidade-loop');
const {montarComercialSemHomologacao}=
 require('../src/producao/montar-comercial-sem-homologacao');
const {gerarPngTeste}=require('./fixtures/gerar-png-teste');
const FOTO=gerarPngTeste();
const SENHA='OperadorDeTesteIsoladoUnico-2026-MuitoLongo';
const DOC='Documentos da conta descartavel usados somente para verificar o registro do primeiro produto na interface, com pagamentos inteiramente desabilitados.';

// Prova geometrica sem alterar o HTML, as regras ou o visual aprovado.
async function conferirAcoesSemSobreposicao(page,seletor){
 const original=page.viewportSize();
 try{
  for(const largura of [320,360,390,412]){
   await page.setViewportSize({width:largura,height:844});
   const r=await page.locator(seletor).evaluate(raiz=>{
    const ctrls=[...raiz.querySelectorAll('button,a,summary,[role="button"]')]
     .filter(el=>{const rect=el.getBoundingClientRect();
      return rect.width>8&&rect.height>8&&
       getComputedStyle(el).visibility!=='hidden';})
     .map(el=>({nome:(el.getAttribute('aria-label')||el.textContent||el.id)
      .trim().slice(0,55),box:el.getBoundingClientRect()}));
    const colisao=[];
    for(let i=0;i<ctrls.length;i++)for(let j=i+1;j<ctrls.length;j++){
     const a=ctrls[i],b=ctrls[j];
     const dx=Math.min(a.box.right,b.box.right)-Math.max(a.box.left,b.box.left);
     const dy=Math.min(a.box.bottom,b.box.bottom)-Math.max(a.box.top,b.box.top);
     if(dx>3&&dy>3)colisao.push([a.nome,b.nome,Math.round(dx),Math.round(dy)]);
    }
    return {colisao,largura:document.documentElement.scrollWidth,
     visor:innerWidth};
   });
   assert.deepEqual(r.colisao,[],
    'Sobreposicao em '+seletor+' '+largura+'px: '+JSON.stringify(r));
   assert.ok(r.largura<=r.visor+1,
    'Tela excede largura em '+seletor+' '+largura+'px: '+JSON.stringify(r));
  }
 }finally{await page.setViewportSize(original);}
}

async function principal(){
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-operador-zero-'));
 const chave=path.join(pasta,'https.key');
 const cert=path.join(pasta,'https.crt');
 execFileSync('openssl',['req','-x509','-nodes','-newkey','rsa:2048',
  '-keyout',chave,'-out',cert,'-days','1','-subj','/CN=127.0.0.1',
  '-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 let app,server,browser;
 let midia,catalogo;
 try{
  const contas=new IdentidadeClienteLoopReal({
   banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
   chaveCodigo:randomBytes(32),
   termos:{versao:'LOOP-TERMOS-2026',texto:DOC},
   privacidade:{versao:'LOOP-PRIV-2026',texto:DOC},
   enviarEmail:async()=>true
  });
  const auditoria=new AuditoriaOperacionalSQLite({
   banco,chaveAuditoria:randomBytes(32)
  });
  const manutencao=new ManutencaoComercialSQLite({banco,auditoria});
  catalogo=new CatalogoMultiDistribuidoresSQLite({
   banco,auditoria,manutencao,distribuidorHomologado:()=>false
  });
  const controle=new ControleEconomicoLojaSQLite({banco,auditoria,manutencao});
  const {classificacaoLoop}=montarComercialSemHomologacao({
   banco,chavePedidos:randomBytes(32),auditoria,manutencao,
   catalogoLeitura:catalogo
  });
  const sessoes=new SessaoAdminComercialSQLite({
   banco,chaveAdmin:randomBytes(32),credencialAdmin:SENHA
  });
  midia=criarCatalogoMercadoriasReal({
   arquivo:path.join(pasta,'catalogo.sqlite'),
   tokenRaiz:'f'.repeat(64),
   buscarProdutoCompartilhado:id=>
    catalogo.buscarProdutoAdministrativo({produtoId:id})
  });
  const catalogoMidiaLeitura={
   banco:midia.repo.banco,
   listarVitrinePreparacao:args=>midia.listarVitrinePreparacao(args),
   listarFotosProdutoCompartilhado:args=>
    midia.listarFotosProdutoCompartilhado(args),
   abrirFotoPublicada:args=>midia.abrirFotoPublicada(args)
  };
  server=https.createServer({
   key:fs.readFileSync(chave),cert:fs.readFileSync(cert)
  },(req,res)=>app(req,res));
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const base='https://127.0.0.1:'+server.address().port;
  app=criarAppIdentidadeLoop({
   contas,origemHttps:base,permitirCadastro:false,
   catalogoVitrine:{
    banco,listarVitrinePreparacao:args=>catalogo.listarVitrinePreparacao(args)
   },
   catalogoMidiaLeitura,
   adminComercial:{
    sessoes,controle,catalogo,auditoria,manutencao,
    catalogoMidia:midia,classificacaoLoop
   }
  });
  browser=await chromium.launch({headless:true});
  const ctx=await browser.newContext({
   ignoreHTTPSErrors:true,
   viewport:{width:390,height:844},deviceScaleFactor:1,
   isMobile:true,hasTouch:true
  });
  const page=await ctx.newPage();
  const errosNavegador=[];
  page.on('pageerror',erro=>errosNavegador.push(erro.message));
  page.setDefaultTimeout(12000);
  await page.goto(base+'/escritorio',{waitUntil:'domcontentloaded'});
  const token=await page.evaluate(async senha=>{
   const res=await fetch('/api/operador/entrar',{
    method:'POST',headers:{'Content-Type':'application/json'},
    credentials:'same-origin',body:JSON.stringify({nick:'OPERADOR',senha})
   });
   if(!res.ok)throw Error('LOGIN_OPERADOR_FALHOU_'+res.status);
   return (await res.json()).operador;
  },SENHA);
  assert.equal(token,true);
  await page.goto(base+'/loja',{waitUntil:'domcontentloaded'});
  await page.locator('#conteudoLojaLoop').waitFor({state:'visible'});
  const estadoOperador=await page.evaluate(async()=>{
   const r=await fetch('/api/operador/estado',{
    credentials:'same-origin',cache:'no-store'
   });
   return {status:r.status,corpo:r.ok?await r.json():null};
  });
  assert.equal(estadoOperador.status,200);
  assert.equal(estadoOperador.corpo?.operador,true,
   'o cookie de operador precisa persistir no mesmo dominio da loja');
  await conferirAcoesSemSobreposicao(page,'#akitemmFerramentasOperadorVitrine');
  assert.equal(await page.locator('#akitemmOperadorMais').count(),0,
   'o botao + superior nao existe na loja real');
  await page.locator('footer .akitemm-acesso-operador').waitFor({
   state:'visible',timeout:12000
  }).catch(e=>{
   throw Error('OPERADOR_RODAPE_OCULTO_COM_SESSAO_VALIDA: '+
    JSON.stringify({errosNavegador,operador:true,
     endereco:page.url()})+' '+e.message);
  });
  const vazio=await page.evaluate(async()=>{
   const res=await fetch('/api/loja/catalogo',{credentials:'same-origin'});
   if(!res.ok)throw Error('CATALOGO_INDISPONIVEL_'+res.status);
   return res.json();
  });
  assert.equal(vazio.produtos.length,0);
  assert.equal(vazio.total,0);
  assert.equal(vazio.checkoutReal,false);
  assert.equal(await page.locator('#catalogoLojaLoop .akitemm-slot-vazio').count(),20);
  assert.equal(await page.locator('#catalogoLojaLoop [data-produto-id]').count(),0);
  // No operador, os 20 quadrinhos vazios possuem alça visível e funcional.
  await page.locator(
   '#catalogoLojaLoop [data-akitemm-slot="1"] .akitemm-alca-arrastar'
  ).waitFor({state:'visible'});
  assert.equal(await page.locator(
   '#catalogoLojaLoop .akitemm-slot-vazio .akitemm-alca-arrastar'
  ).count(),20);
  // Ofertas mantém os espaços vazios; não cria promoções fictícias.
  await page.locator('#akitemmFiltroOfertas').click();
  await page.locator('#catalogoLojaLoop .akitemm-slot-vazio .akitemm-alca-arrastar')
   .first().waitFor({state:'visible'});
  assert.equal(await page.locator('#catalogoLojaLoop [data-produto-id]').count(),0);
  await page.locator('#akitemmFiltroTodos').click();
  await page.locator('#catalogoLojaLoop [data-akitemm-slot="1"] .akitemm-alca-arrastar')
   .waitFor({state:'visible'});
  const vazioOriginal=await page.evaluate(async()=>{
   const r=await fetch('/api/admin/catalogo-midia/slots');
   return (await r.json()).layoutVazio;
  });
  // O conteúdo fica abaixo do cabeçalho: é obrigatório rolar até os
  // cartões antes de enviar um toque físico. waitFor(visible) não rola.
  await page.locator(
   '#catalogoLojaLoop [data-akitemm-slot="1"] .akitemm-alca-arrastar'
  ).scrollIntoViewIfNeeded();
  const sessaoTouch=await ctx.newCDPSession(page);
  const puxar=await page.locator(
   '#catalogoLojaLoop [data-akitemm-slot="1"] .akitemm-alca-arrastar'
  ).boundingBox();
  const soltar=await page.locator(
   '#catalogoLojaLoop [data-akitemm-slot="2"]'
  ).boundingBox();
  assert.ok(puxar&&soltar);
  const x1=puxar.x+puxar.width/2,y1=puxar.y+puxar.height/2;
  // No móvel, o centro do segundo cartão horizontal pode ficar FORA da
  // viewport. Soltar sobre a faixa visível evita um gesto impossível.
  const viewport=page.viewportSize();
  const x2=Math.min(soltar.x+Math.min(12,soltar.width/5),
   viewport.width-12);
  const y2=soltar.y+Math.min(soltar.height/2,85);
  assert.ok(x2>soltar.x&&x2<soltar.x+soltar.width,
   'A área de soltura deve estar visível dentro do segundo cartão');
  assert.ok(y1>0&&y1<viewport.height&&y2>0&&y2<viewport.height,
   'Cartões devem estar efetivamente dentro da altura da tela');
  console.log('GESTO_VAZIO='+JSON.stringify({
   larguraViewport:viewport.width,puxar,soltar,x1,y1,x2,y2
  }));
  await sessaoTouch.send('Input.dispatchTouchEvent',{
   type:'touchStart',touchPoints:[{x:x1,y:y1}]
  });
  await new Promise(resolve=>setTimeout(resolve,260));
  for(let i=1;i<=5;i++)await sessaoTouch.send('Input.dispatchTouchEvent',{
   type:'touchMove',touchPoints:[{
    x:x1+(x2-x1)*i/5,y:y1+(y2-y1)*i/5
   }]
  });
  await sessaoTouch.send('Input.dispatchTouchEvent',{
   type:'touchEnd',touchPoints:[]
  });
  await page.getByText('Molduras vazias trocadas entre as posições',{
   exact:false
  }).waitFor({timeout:12000}).catch(async err=>{
   const dados=await page.evaluate(()=>({
    aviso:document.querySelector('.akitemm-arrasto-aviso')?.textContent,
    slots:[...document.querySelectorAll('.akitemm-slot-vazio')].slice(0,3)
     .map(n=>({slot:n.dataset.akitemmSlot,classes:n.className})),
    erros:document.getElementById('akitemmResultadoProdutos')?.textContent
   }));
   throw Error('ARRASTE_VAZIOS_NAO_CONFIRMADO '+JSON.stringify(dados)+
    ' '+err.message);
  });
  await page.waitForFunction(cores=>document.querySelector(
   '#catalogoLojaLoop [data-akitemm-slot="1"]'
  )?.classList.contains('akitemm-slot-'+cores[1].toLowerCase()),
  vazioOriginal.cores);
  const depoisVazios=await page.evaluate(async()=>{
   const r=await fetch('/api/admin/catalogo-midia/slots');
   return (await r.json()).layoutVazio;
  });
  assert.equal(depoisVazios.revisao,vazioOriginal.revisao+1);
  assert.equal(depoisVazios.cores[0],vazioOriginal.cores[1]);
  assert.equal(depoisVazios.cores[1],vazioOriginal.cores[0]);
  assert.deepEqual(depoisVazios.cores.slice().sort(),
   vazioOriginal.cores.slice().sort());
  await page.waitForTimeout(750);
  // Produto ainda não criado: salvar formulário incompleto no SQLite.
  await page.locator('#catalogoLojaLoop [data-akitemm-slot="1"]').click();
  const d0=page.locator('#akitemmOperadorFotosReal');
  await d0.getByRole('heading',{name:'Cadastrar produto · AKITEMM'}).waitFor();
  await d0.getByRole('textbox',{name:'Nome do produto'}).fill('Rascunho não publicado');
  await d0.getByLabel('Cor física do produto (escreva livremente)')
   .fill('Colorido, verde e azul');
  await d0.getByLabel('Preço normal (R$)').fill('350');
  await d0.getByRole('button',{
   name:'Salvar rascunho e continuar depois'
  }).click();
  await d0.getByRole('heading',{
   name:'Produtos não publicados · AKITEMM'
  }).waitFor();
  await d0.getByText('Rascunho não publicado').waitFor();
  assert.equal(await page.locator('#catalogoLojaLoop [data-produto-id]').count(),0);
  await d0.locator('.akitemm-modal-fechar').click();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Produtos não publicados'}).click();
  await d0.getByText('Rascunho não publicado').waitFor();
  await d0.getByRole('button',{name:'Continuar cadastro'}).click();
  assert.equal(await d0.getByRole('textbox',{name:'Nome do produto'}).inputValue(),
   'Rascunho não publicado');
  assert.equal(await d0.getByLabel('Cor física do produto (escreva livremente)')
   .inputValue(),'Colorido, verde e azul');
  assert.equal(await d0.getByLabel('Preço normal (R$)').inputValue(),'350');
  await d0.locator('.akitemm-modal-fechar').click();
  await page.getByRole('button',{name:'Produtos não publicados'}).click();
  page.once('dialog',d=>void d.accept());
  await d0.getByRole('button',{name:'Descartar este rascunho'}).click();
  await d0.getByText('Rascunho descartado.').waitFor();
  await d0.locator('.akitemm-modal-fechar').click();
  // Cadastro manual direto no quadradinho, com foto e cor no mesmo painel.
  const m=page.locator('#akitemmOperadorFotosReal');
  const criarProduto=async({slot,codigo,nome,cor})=>{
   await page.locator('#catalogoLojaLoop [data-akitemm-slot="'+slot+'"]').click();
   await m.waitFor({state:'visible'});
   await m.getByRole('heading',{name:'Cadastrar produto · AKITEMM'}).waitFor();
   await conferirAcoesSemSobreposicao(page,'#akitemmOperadorFotosReal');
   // A ajuda deve mostrar exatamente ONDE corrigir, não só mensagem genérica.
   await m.getByRole('button',{name:'Salvar produto e colocar na vitrine'}).click();
   await m.locator('.akitemm-erros-cadastro:not([hidden])').waitFor();
   assert.equal(await m.getByRole('textbox',{name:'Nome do produto'})
    .getAttribute('aria-invalid'),'true');
   await m.getByRole('button',{name:/Corrigir: Digite o nome do produto/}).click();
   assert.equal(await m.getByRole('textbox',{name:'Nome do produto'})
    .evaluate(x=>document.activeElement===x),true);
   await m.getByRole('textbox',{name:'Nome do produto'}).fill(nome);
   await m.locator('textarea').first().fill('Descrição de teste temporária');
   await m.getByLabel('Categoria (opcional)').fill('Calçados');
   await m.getByLabel('Marca (opcional)').fill('Marca própria');
   await m.getByLabel('Preço normal (R$)').fill('299,90');
   await m.getByLabel('Preço promocional (R$) — opcional').fill('350,00');
   await m.getByRole('button',{name:'Salvar produto e colocar na vitrine'}).click();
   assert.equal(await m.getByLabel('Preço promocional (R$) — opcional')
    .getAttribute('aria-invalid'),'true');
   await m.getByRole('button',{name:/Corrigir: O preço promocional precisa ser menor/}).click();
   assert.equal(await m.getByLabel('Preço promocional (R$) — opcional')
    .evaluate(x=>document.activeElement===x),true);
   await m.getByLabel('Preço promocional (R$) — opcional').fill('249,90');
   await m.getByLabel('Cor física do produto (escreva livremente)')
    .fill('Colorido, azul, preto e branco');
   await m.getByLabel('Quantidade disponível (opcional)').fill('12');
   const codigoArea=m.locator('details').filter({hasText:'Código do produto'});
   await codigoArea.locator('summary').click();
   await codigoArea.locator('input').fill(codigo);
   await m.getByLabel('Classificação comercial LOOP (não é cor física)').selectOption(cor);
   // Faltou capa: NÃO criar produto nem redirecionar para login.
   await m.getByRole('button',{name:'Salvar produto e colocar na vitrine'}).click();
   assert.equal(await m.locator('.akitemm-escolher-foto input').getAttribute('aria-invalid'),'true');
   assert.match(await m.locator('.akitemm-editor-status').textContent(),
    /Escolha uma foto de capa para publicar/);
   assert.equal(await m.locator('.akitemm-recorte-opcional input[type=checkbox]').count(),0);
   await m.locator('input[type=file]').setInputFiles({
    name:'imagem-prova.png',mimeType:'image/png',buffer:FOTO
   });
   await conferirAcoesSemSobreposicao(page,'#akitemmOperadorFotosReal');
   // Enquadramento automático; recorte só se o operador pedir.
   const corte=m.getByRole('button',{name:'Ajustar corte da foto (opcional)'});
   await corte.waitFor({state:'visible'});
   assert.equal(await m.locator('.akitemm-foto-ajustes').isHidden(),true);
   await corte.click();
   await m.getByRole('button',{name:'Usar foto inteira'}).click();
   assert.equal(await m.locator('.akitemm-foto-ajustes').isHidden(),true);
   await m.getByRole('button',{name:'Salvar produto e colocar na vitrine'}).click();
   await m.getByText('Produto e foto salvos na posição ',{exact:false}).waitFor({
    timeout:15000
   }).catch(async e=>{
    const diag=await m.evaluate(d=>({
     status:d.querySelector('.akitemm-editor-status')?.textContent,
     pendencias:d.querySelector('.akitemm-erros-cadastro')?.textContent,
     titulo:d.querySelector('h2')?.textContent
    }));
    throw Error('CADASTRO_PRODUTO_NAO_CONFIRMADO '+JSON.stringify(diag)+
     ' '+e.message);
   });
   await m.locator('.akitemm-modal-fechar').click();
   await page.locator('#catalogoLojaLoop [data-produto-id="'+codigo+'"]')
    .waitFor({state:'visible'});
  };
  await criarProduto({slot:1,codigo:'primeiro-produto',
   nome:'Produto de ensaio de operador',cor:'VERDE'});
  const produto=catalogo.buscarProdutoAdministrativo({
   produtoId:'primeiro-produto'
  });
  assert.equal(produto.titulo,'Produto de ensaio de operador');
  assert.equal(produto.ativo,true);
  assert.equal(midia.fotos.listar('primeiro-produto').fotos.length,1);
  assert.equal(midia.fotos.listar('primeiro-produto').fotos[0].posicao,1);
  const imagemOperador=page.locator(
   '#catalogoLojaLoop [data-produto-id="primeiro-produto"] .akitemm-imagem-produto img');
  await imagemOperador.scrollIntoViewIfNeeded();
  const capaOperador=await imagemOperador.evaluate(async img=>{
   await img.decode();
   return {url:new URL(img.src).pathname,
    largura:img.naturalWidth,altura:img.naturalHeight};
  });
  assert.ok(capaOperador.largura>0&&capaOperador.altura>0,
   'a foto publicada tem que carregar na visao do operador');
  // Mesmo tocando no quadrinho 18, o segundo produto vai para a posição 2.
  await criarProduto({slot:18,codigo:'segundo-produto',
   nome:'Segundo produto de ensaio',cor:'DOURADO'});
  const mapa=await page.evaluate(async()=>{
   const res=await fetch('/api/admin/catalogo-midia/slots',{
    credentials:'same-origin'
   });
   if(!res.ok)throw Error('MAPA_DO_OPERADOR_INDISPONIVEL');
   return res.json();
  });
  assert.equal(mapa.total,400);
  assert.deepEqual(mapa.slots.map(x=>x.produtoId),
   ['primeiro-produto','segundo-produto']);
  const antes=await page.evaluate(async()=>{
   const res=await fetch('/api/loja/catalogo',{credentials:'same-origin'});
   return res.json();
  });
  assert.equal(antes.produtos.length,2);
  assert.equal(antes.produtos[0].precoAnunciadoCentavos,24990);
  assert.equal(antes.produtos[0].precoOriginalAnunciadoCentavos,29990);
  assert.equal(antes.produtos[0].estoqueInformadoOperador,12);
  assert.equal(antes.produtos[0].precoCentavos,null);
  assert.equal(antes.produtos[0].compravel,false);
  assert.equal(antes.checkoutReal,false);
  assert.equal(antes.produtos[0].produtoId,'primeiro-produto');
  assert.equal(antes.produtos[1].produtoId,'segundo-produto');
  // No celular, segurar a alça e arrastar o segundo até o primeiro.
  const alca=page.locator(
   '#catalogoLojaLoop [data-produto-id="segundo-produto"] .akitemm-alca-arrastar'
  );
  await alca.waitFor({state:'visible'});
  // Na lista vertical os produtos ficam um abaixo do outro: centralizar
  // o primeiro cartão deixa ambos na viewport para o gesto CDP de toque.
  await page.evaluate(()=>{
   document.querySelector(
    '#catalogoLojaLoop [data-produto-id="primeiro-produto"]'
   )?.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
  });
  await page.waitForTimeout(100);
  const inicio=await alca.boundingBox();
  const destino=await page.locator(
   '#catalogoLojaLoop [data-produto-id="primeiro-produto"]'
  ).boundingBox();
  assert.ok(inicio&&destino,'origem e alvo precisam estar na tela');
  console.log('GESTO_PRODUTO_POSICOES='+JSON.stringify({
   inicio,destino,viewport:await page.evaluate(()=>({
    largura:innerWidth,altura:innerHeight,
    elementoOrigem:document.elementFromPoint(
     document.querySelector('[data-produto-id="segundo-produto"] .akitemm-alca-arrastar')
      ?.getBoundingClientRect().left+22,
     document.querySelector('[data-produto-id="segundo-produto"] .akitemm-alca-arrastar')
      ?.getBoundingClientRect().top+22
    )?.className||null
   }))
  }));
  const cdps=await ctx.newCDPSession(page);
  const p1={x:inicio.x+inicio.width/2,y:inicio.y+inicio.height/2};
  const p2={x:destino.x+destino.width*0.35,
   y:destino.y+destino.height*0.30};
  await cdps.send('Input.dispatchTouchEvent',{
   type:'touchStart',touchPoints:[p1]
  });
  await new Promise(resolve=>setTimeout(resolve,260));
  for(let i=1;i<=5;i++){
   const fracao=i/5;
   await cdps.send('Input.dispatchTouchEvent',{
    type:'touchMove',touchPoints:[{
     x:p1.x+(p2.x-p1.x)*fracao,
     y:p1.y+(p2.y-p1.y)*fracao
    }]
   });
  }
  await cdps.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const descricaoArrasto=await page.evaluate(()=>({
   aviso:document.querySelector('.akitemm-arrasto-aviso')?.textContent,
   ordenacao:[...document.querySelectorAll(
    '#catalogoLojaLoop [data-produto-id]'
   )].map(x=>x.dataset.produtoId),
   alcas:document.querySelectorAll('.akitemm-alca-arrastar').length
  }));
  console.log('ARRASTE_TOUCH_DIAGNOSTICO='+JSON.stringify(descricaoArrasto));
  await page.getByText('Produto movido para o quadrinho 1.',{exact:false}).waitFor({
   timeout:12000
  });
  await page.waitForTimeout(750);
  const comparacaoOrdem=await page.evaluate(async()=>{
   const resposta=await fetch('/api/loja/catalogo',{cache:'no-store'});
   const api=await resposta.json();
   return {statusApi:resposta.status,
    api:api.produtos?.map(p=>({id:p.produtoId,ordem:p.posicaoVitrine})),
    dom:[...document.querySelectorAll('#catalogoLojaLoop [data-produto-id]')]
     .map(c=>({id:c.dataset.produtoId,ordem:c.dataset.akitemmOrdem})),
    botao:document.getElementById('atualizarCatalogoLoja')?.disabled,
    erro:document.getElementById('akitemmResultadoProdutos')?.textContent
   };
  });
  console.log('COMPARACAO_ORDEM='+JSON.stringify(comparacaoOrdem));
  console.log('ERROS_NAVEGADOR='+JSON.stringify(errosNavegador));
  await page.waitForFunction(()=>{
   const cards=[...document.querySelectorAll(
    '#catalogoLojaLoop [data-produto-id]'
   )].map(c=>c.dataset.produtoId);
   return cards[0]==='segundo-produto'&&cards[1]==='primeiro-produto';
  });
  assert.equal((await page.locator('#catalogoLojaLoop .akitemm-alca-arrastar')
   .count())>=2,true);
  const gravado=await page.evaluate(async()=>{
   const res=await fetch('/api/admin/catalogo-midia/slots',{
    credentials:'same-origin'
   });
   return (await res.json()).slots;
  });
  assert.deepEqual(gravado.map(x=>x.produtoId),
   ['segundo-produto','primeiro-produto']);
  // Correção manual: colocar o produto no quadrinho 18 vazio,
  // manter a ordem publicada e confirmar no banco real.
  const movimentoLivre=await page.evaluate(async()=>{
   const s=await fetch('/api/admin/comercial/sessao',{credentials:'same-origin'});
   const sessao=await s.json();
   const atual=await fetch('/api/admin/catalogo-midia/slots',{
    credentials:'same-origin'
   });
   const slots=(await atual.json()).slots;
   const produto=slots.find(x=>x.produtoId==='primeiro-produto');
   const res=await fetch('/api/admin/catalogo-midia/reordenar-vitrine',{
    method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json',
     'X-Loop-Admin-Csrf':sessao.csrfToken},
    body:JSON.stringify({produtoId:'primeiro-produto',
     novaPosicao:18,revisaoEsperada:produto.revisao})
   });
   return {status:res.status,corpo:await res.json()};
  });
  assert.equal(movimentoLivre.status,200);
  assert.equal(movimentoLivre.corpo.posicao,18);
  assert.equal(movimentoLivre.corpo.manual,true);
  await page.evaluate(()=>window.dispatchEvent(new Event('akitemm:catalogo-atualizar')));
  await page.waitForFunction(()=>document.querySelector(
   '#catalogoLojaLoop [data-produto-id="primeiro-produto"]'
  )?.dataset.akitemmOrdem==='18');
  const registrado=await page.evaluate(async()=>{
   const r=await fetch('/api/loja/catalogo',{cache:'no-store'});
   const dados=await r.json();
   return dados.produtos.map(p=>[p.produtoId,p.posicaoVitrine]);
  });
  assert.deepEqual(registrado,[['segundo-produto',1],['primeiro-produto',18]]);
  // Sem identidade de cliente, o operador não pode comprar.
  assert.equal(await page.locator('#registrarPedidoLoja').isDisabled(),true);
  const publicado=await page.evaluate(async()=>{
   const res=await fetch('/api/loja/catalogo',{credentials:'same-origin'});
   return res.json();
  });
  assert.equal(publicado.produtos.length,2);
  assert.equal(publicado.produtos[0].precoCentavos,null);
  assert.equal(publicado.produtos[0].compravel,false);
  assert.equal(publicado.checkoutReal,false);
  assert.equal(publicado.produtos[0].fotos.length,1);
  assert.equal((await page.request.get(
   base+publicado.produtos[0].fotos[0].url,{
    ignoreHTTPSErrors:true
   })).status(),200);
  assert.equal(await page.locator('#registrarPedidoLoja').isDisabled(),true);

  // Visitante usa a MESMA vitrine real criada pelo operador,
  // mas não recebe controles de administração nem consegue editar.
  const ctxCliente=await browser.newContext({
   ignoreHTTPSErrors:true,viewport:{width:390,height:844},
   deviceScaleFactor:1,isMobile:true,hasTouch:true
  });
  const cliente=await ctxCliente.newPage();
  cliente.setDefaultTimeout(12000);
  await cliente.goto(base+'/loja',{waitUntil:'domcontentloaded'});
  await cliente.locator('#catalogoLojaLoop [data-produto-id="primeiro-produto"]')
   .waitFor({state:'visible'});
  assert.equal(await cliente.locator('.akitemm-alca-arrastar').count(),0);
  const cards=cliente.locator('#catalogoLojaLoop [data-produto-id]');
  assert.equal(await cards.first().getAttribute('data-produto-id'),'segundo-produto');
  const produtoCliente=cliente.locator(
   '#catalogoLojaLoop [data-produto-id="primeiro-produto"]');
  assert.match(await produtoCliente.innerText(),/R\$\s?249,90/);
  const capaCliente=await produtoCliente.locator('.akitemm-imagem-produto img')
   .evaluate(async img=>{
    await img.decode();
    return {url:new URL(img.src).pathname,
     largura:img.naturalWidth,altura:img.naturalHeight};
   });
  assert.deepEqual(capaCliente,capaOperador,
   'cliente e operador devem exibir a mesma fotografia de capa');
  await produtoCliente.locator('.akitemm-imagem-produto').click();
  await cliente.locator('#akitemmVisualizacaoProduto h2')
   .filter({hasText:'Produto de ensaio de operador'}).waitFor();
  assert.match(await cliente.locator('#akitemmProdutoInlineConteudo').innerText(),
   /R\$\s?299,90/);
  assert.match(await cliente.locator('#akitemmProdutoInlineConteudo').innerText(),
   /R\$\s?249,90/);
  await cliente.locator('#akitemmProdutoInlineConteudo .akitemm-detalhe-foto-principal')
   .waitFor({state:'visible'});
  await cliente.locator('#akitemmProdutoInlineConteudo .akitemm-detalhe-avaliacoes')
   .filter({hasText:'Ainda não há avaliações de compras verificadas.'}).waitFor();
  await cliente.locator('#akitemmVoltarProdutos').click();
  await cliente.locator('#catalogoLojaLoop [data-produto-id="primeiro-produto"]')
   .waitFor({state:'visible'});
  assert.equal(await cliente.locator('#akitemmVisualizacaoProduto').isHidden(),true);
  const proibido=await cliente.evaluate(()=>fetch(
   '/api/admin/catalogo-midia/produtos/primeiro-produto/anuncio',
   {credentials:'same-origin'}
  ).then(r=>r.status));
  assert.equal(proibido,401);
  const detalhes=await cliente.evaluate(()=>fetch(
   '/api/loja/produtos/primeiro-produto/avaliacoes'
  ).then(r=>r.json()));
  assert.equal(detalhes.total,0);
  assert.equal(detalhes.origem,'COMPRAS_VERIFICADAS');
  await ctxCliente.close();
  assert.equal(banco.prepare('PRAGMA quick_check').get().quick_check,'ok');
  console.log('OPERADOR_VITRINE_VALIDADO: CADASTRO_MANUAL -> FOTO -> COR -> DRAG_TOUCH -> SQLITE_SEM_COMPRA');
 }finally{
  if(browser)await browser.close();
  if(server)await new Promise(ok=>server.close(ok));
  if(midia)midia.fechar();
  banco.close();
  fs.rmSync(pasta,{recursive:true,force:true});
 }
}
principal().catch(e=>{
 console.error('FALHA_OPERADOR_ZERO_PRODUTOS: '+(e?.stack||String(e)));
 process.exitCode=1;
});
