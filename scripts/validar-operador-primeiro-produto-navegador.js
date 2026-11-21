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
    credentials:'same-origin',body:JSON.stringify({nick:'operador',senha})
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
  // Cadastro manual direto no quadradinho, com foto e cor no mesmo painel.
  const m=page.locator('#akitemmOperadorFotosReal');
  const criarProduto=async({slot,codigo,nome,cor})=>{
   await page.locator('#catalogoLojaLoop [data-akitemm-slot="'+slot+'"]').click();
   await m.waitFor({state:'visible'});
   await m.getByRole('heading',{name:'Cadastrar produto · AKITEMM'}).waitFor();
   await m.getByRole('textbox',{name:'Nome do produto'}).fill(nome);
   await m.locator('textarea').first().fill('Descrição de teste temporária');
   await m.getByLabel('Categoria (opcional)').fill('Calçados');
   await m.getByLabel('Marca (opcional)').fill('Marca própria');
   await m.getByLabel('Preço normal (R$)').fill('299,90');
   await m.getByLabel('Preço promocional (R$) — opcional').fill('249,90');
   await m.getByLabel('Quantidade disponível (opcional)').fill('12');
   const codigoArea=m.locator('details').filter({hasText:'Código do produto'});
   await codigoArea.locator('summary').click();
   await codigoArea.locator('input').fill(codigo);
   await m.getByLabel('Cor do produto').selectOption(cor);
   await m.locator('input[type=file]').setInputFiles({
    name:'imagem-prova.png',mimeType:'image/png',buffer:FOTO
   });
   await m.getByRole('button',{name:'Salvar produto e colocar na vitrine'}).click();
   await m.getByText('Produto e foto salvos.',{exact:false}).waitFor({
    timeout:15000
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
  await criarProduto({slot:2,codigo:'segundo-produto',
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
  const inicio=await alca.boundingBox();
  const destino=await page.locator(
   '#catalogoLojaLoop [data-produto-id="primeiro-produto"]'
  ).boundingBox();
  assert.ok(inicio&&destino,'origem e alvo precisam estar na tela');
  const cdps=await ctx.newCDPSession(page);
  const p1={x:inicio.x+inicio.width/2,y:inicio.y+inicio.height/2};
  const p2={x:destino.x+Math.min(24,destino.width/4),
   y:destino.y+destino.height/2};
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
  await page.getByText('Produto movido para 1º.',{exact:false}).waitFor({
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
