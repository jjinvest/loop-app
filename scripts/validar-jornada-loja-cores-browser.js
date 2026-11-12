'use strict';
// Jornada simulada do operador ao comprador na MESMA loja: 12 produtos,
// 4 cores, indicacao via link assinado, fotos, filtros, scroll PC/celular,
// compra de 5 tenis ROXOS e fotografia imutavel para o motor.
// Banco e pagamentos produtivos nao sao usados.
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {once}=require('node:events');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {criarGateway}=require('./servidor-escritorio-preview-railway');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const ADMIN='jornada-operador-'+('M'.repeat(48));
const GATE='jornada-acesso-'+('P'.repeat(32));
const GATE_ADMIN='jornada-senha-admin-'+('Q'.repeat(32));
const SENHA='SenhaFicticiaJornada2026';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DAAMIM/4EAAB/uBfsL2WiLAAAAAElFTkSuQmCC','base64');
(async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 const ctx=criarAppLojaEscritorioCandidato({
  banco:db,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  segredoOperador:ADMIN,termosVersao:'LAB-jornada-cliente-2026',
  termosTexto:'Ensaio sem pagamento real e sem expedir produtos.'
 });
 const backend=ctx.app.listen(0,'127.0.0.1');
 await once(backend,'listening');
 const gateway=criarGateway({portaInterna:backend.address().port,
  senhaAcesso:GATE,senhaAdmin:GATE_ADMIN,segredoOperador:ADMIN,
  validarNickIndicador:nick=>ctx.equipe.existeNick(nick),
  permitirOrigemHttpLoopback:true});
 gateway.listen(0,'127.0.0.1');
 await once(gateway,'listening');
 const base='http://127.0.0.1:'+gateway.address().port;
 const local='http://127.0.0.1:'+backend.address().port;
 const adminHeaders={Authorization:'Bearer '+ADMIN};
 const basic='Basic '+Buffer.from('acesso:'+GATE).toString('base64');
 let browser;
 try{
  async function apiAdmin(rota,{method='GET',body,key,bytes,mime,extra={}}={}){
   const response=await fetch(local+'/staging/escritorio-unificado'+rota,{
    method,headers:{...adminHeaders,...(body?{'Content-Type':'application/json'}:{}),
     ...(key?{'Idempotency-Key':key}:{}),...(bytes?{'Content-Type':mime}:{}),...extra},
    ...(body?{body:JSON.stringify(body)}:bytes?{body:bytes}:{})
   });
   const json=await response.json();
   assert.ok(response.ok,method+' '+rota+' '+response.status+' '+JSON.stringify(json));
   return json;
  }
  const cadastro=await fetch(base+'/staging/contas/cadastrar',{
   method:'POST',headers:{Authorization:basic,'Content-Type':'application/json'},
   body:JSON.stringify({nome:'Ana Indicadora',nick:'Ana',
    email:'ana.indicadora@example.invalid',senha:SENHA,aceiteExplicito:true})
  });
  assert.equal(cadastro.status,201,await cadastro.text().catch(()=>'')); 
  const produtos=[];
  for(const cor of ['CINZA','VERDE','DOURADO','ROXO']){
   for(let i=0;i<3;i++){
    const id='jornada-'+cor.toLowerCase()+'-'+i;
    const nome=cor==='ROXO'&&i===0?'Tênis Roxo — pacote de cinco':
     'Jornada '+cor+' produto '+(i+1);
    const precoCentavos=cor==='DOURADO'?30000:cor==='ROXO'?12000:10000;
    const produto={id,nome,tipo:'FISICO',estado:'PUBLICADO',
     descricao:'Produto de prova visual, sem venda ou entrega real.',
     precoCentavos,entrega:'FORNECEDOR_INTEGRADO',
     fotos:[],detalhes:[],videoApresentacaoUrl:null};
    await apiAdmin('/produtos',{method:'POST',key:'jornada-completa-'+id,body:{produto}});
    const sinalizacao={classificacao:cor,quantidadeMinimaLoop:1,revisaoEsperada:0};
    if(cor==='ROXO'){
     if(i===0)Object.assign(sinalizacao,{
      modoRoxo:'POR_PEDIDO',quantidadeMinimaRoxo:5,posicoesPorPedidoRoxo:1
     });
     else sinalizacao.posicoesPorUnidadeRoxo=i+1;
    }
    await apiAdmin('/sinalizacao/'+id,{method:'PATCH',body:sinalizacao});
    if(i===0){
     await apiAdmin('/produtos/'+id+'/fotos/1',{
      method:'POST',bytes:png,mime:'image/png',
      extra:{'X-Foto-Versao-Esperada':'0'}
     });
    }
    produtos.push({id,cor,nome});
   }
  }
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  fs.mkdirSync(path.join(__dirname,'../artifacts'),{recursive:true});
  for(const device of [
   {nome:'pc',viewport:{width:1366,height:820},isMobile:false,nick:'Bruna'},
   {nome:'celular',viewport:{width:390,height:844},isMobile:true,nick:'Celia'}
  ]){
   const context=await browser.newContext({
    viewport:device.viewport,isMobile:device.isMobile,deviceScaleFactor:1,
    httpCredentials:{username:'acesso',password:GATE}
   });
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   // A pessoa chega pelo LINK e nao por uma URL digitada no banco.
   await page.goto(base+'/loja/Ana',{waitUntil:'domcontentloaded'});
   const convite=(await context.cookies()).find(c=>c.name==='akitemm_preview_ref');
   assert.ok(convite,'link precisa fixar indicador assinado no navegador');
   const registrar=await context.request.post(base+'/staging/contas/cadastrar',{
    headers:{Authorization:basic,'Content-Type':'application/json'},
    data:{nome:device.nick+' Cliente',nick:device.nick,
     email:device.nick.toLowerCase()+'@example.invalid',
     senha:SENHA,aceiteExplicito:true}
   });
   assert.equal(registrar.status(),201,await registrar.text());
   const login=await context.request.post(base+'/staging/contas/entrar',{
    headers:{Authorization:basic,'Content-Type':'application/json'},
    data:{nick:device.nick,senha:SENHA}
   });
   assert.equal(login.status(),200,await login.text());
   await page.goto(base+'/staging/loja',{waitUntil:'domcontentloaded'});
   await page.locator('#catalogoLojaLoop article.produto-loja-loop').first()
    .waitFor({state:'visible'});
   // Primeira pagina com doze produtos, mais um PDF legado e paginacao funcional.
   assert.equal(await page.locator('#catalogoLojaLoop article.produto-loja-loop').count(),12);
   assert.ok(await page.locator('#akitemmCarregarMais').isVisible());
   await page.locator('#akitemmCarregarMais').click();
   assert.equal(await page.locator('#catalogoLojaLoop article.produto-loja-loop').count(),13);
   await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
   await page.evaluate(()=>window.scrollTo(0,0));
   const medidas=await page.evaluate(()=>({
    body:document.documentElement.scrollWidth,
    viewport:window.innerWidth,altura:document.documentElement.scrollHeight
   }));
   assert.ok(medidas.body<=medidas.viewport+4,
    'rolagem horizontal inesperada '+device.nome+': '+JSON.stringify(medidas));
   assert.ok(medidas.altura>device.viewport.height,
    'deve existir navegacao vertical no catalogo extenso');
   for(const cor of ['CINZA','VERDE','DOURADO','ROXO']){
    await page.locator('#akitemmFiltroTodos').click();
    await page.locator('[data-akitemm-cor="'+cor+'"]').click();
    assert.equal(await page.locator('[data-akitemm-cor="'+cor+'"]')
     .getAttribute('aria-pressed'),'true');
    const n=await page.locator('#catalogoLojaLoop article.produto-loja-loop').count();
    assert.equal(n,cor==='CINZA'?4:3,'filtro '+cor+' no '+device.nome);
    const classe={
     CINZA:'produto-loja-loop-nao-elegivel',
     VERDE:'produto-loja-loop-elegivel',
     DOURADO:'produto-loja-loop-dourado',
     ROXO:'produto-loja-loop-especial'
    }[cor];
    assert.equal(await page.locator('#catalogoLojaLoop article.'+classe).count(),n);
    const foto=page.locator('#catalogoLojaLoop article.produto-loja-loop')
     .filter({hasText:produtos.find(p=>p.cor===cor&&p.id.endsWith('-0')).nome})
     .locator('.akitemm-imagem-produto img');
    assert.equal(await foto.count(),1,'imagem real do '+cor+' precisa existir');
    await foto.scrollIntoViewIfNeeded();
    await foto.evaluate(async img=>{
     if(!img.complete)await new Promise(ok=>{
      img.addEventListener('load',ok,{once:true});
      img.addEventListener('error',ok,{once:true});
     });
    });
    assert.ok(await foto.evaluate(img=>img.naturalWidth>0),'foto deve carregar: '+cor);
   }
   // Botao de detalhes e carrinho DA PROPRIA VITRINE, nao mock de UI.
   const tenis=page.locator('#catalogoLojaLoop article.produto-loja-loop')
    .filter({hasText:'Tênis Roxo — pacote de cinco'});
   await tenis.locator('button.akitemm-ver-detalhes').click();
   await page.locator('#akitemmVisualizacaoProduto').waitFor({state:'visible'});
   await page.locator('#akitemmVoltarProdutos').click();
   for(let n=0;n<5;n++)await tenis.locator('button.akitemm-adicionar').click();
   assert.equal(await page.locator('#akitemmTotalItens').innerText(),'5');
   await page.locator('#akitemmEntrega summary').click();
   const entrega=page.locator('#akitemmFormEntrega');
   for(const [campo,valor] of Object.entries({
    destinatario:device.nick+' Teste',cep:'27260000',logradouro:'Rua Exemplo',
    numero:'10',bairro:'Centro',cidade:'Volta Redonda',telefone:'21999999999'
   }))await entrega.locator('[name="'+campo+'"]').fill(valor);
   await entrega.locator('[name="uf"]').selectOption('RJ');
   // Se o navegador nao gravar, informar se falhou validacao HTML,
   // sessao/CSRF ou API, sem repetir toda a jornada as cegas.
   const requisicaoEntrega=page.waitForResponse(r=>
    r.url().includes('/staging/vitrine/loja/entrega')&&
    r.request().method()==='POST',{timeout:10000}).catch(()=>null);
   await entrega.locator('button[type=submit]').click();
   const respostaEntrega=await requisicaoEntrega;
   const estadoEntrega=page.locator('#akitemmStatusEntrega');
   if(!respostaEntrega||respostaEntrega.status()!==200){
    const diagnostico={dispositivo:device.nome,
     http:respostaEntrega?.status()||null,
     resposta:respostaEntrega?await respostaEntrega.text().catch(()=>null):null,
     mensagem:await estadoEntrega.textContent(),
     formularioValido:await entrega.evaluate(f=>f.checkValidity()),
     camposInvalidos:await entrega.evaluate(f=>
      [...f.elements].filter(c=>c.willValidate&&!c.checkValidity())
       .map(c=>c.name||c.type)),
     painelAberto:await page.locator('#akitemmEntrega').evaluate(d=>d.open)};
    assert.fail('ENDERECO_BROWSER_NAO_GRAVADO '+JSON.stringify(diagnostico));
   }
   await estadoEntrega.filter({hasText:/Endereço de ensaio gravado/})
    .waitFor({state:'visible',timeout:5000});
   await page.locator('#registrarPedidoLoja').click();
   await page.locator('#statusPedidoLoja').filter({hasText:/Pedido hom-/}).waitFor();
   const meus=await context.request.get(base+'/staging/vitrine/loja/pedidos',{
    headers:{Authorization:basic}
   });
   assert.equal(meus.status(),200);
   const pedidos=(await meus.json()).pedidos;
   assert.equal(pedidos.length,1);
   const pedido=pedidos[0];
   assert.equal(pedido.itens[0].quantidade,5);
   const foto=ctx.sinalizacaoVitrine.consultarFotografiaPrepedido({
    prepedidoId:pedido.pedidoId});
   assert.equal(foto.planejamentoPosicoes.posicoesRoxo,1);
   assert.equal(foto.planejamentoPosicoes.quantidadePosicoesPrevistas,1);
   assert.equal(foto.direitosCriados,0,'nao afirmar pagamento real');
   await page.screenshot({path:path.join(__dirname,'../artifacts',
    'jornada-carrinho-roxo-'+device.nome+'.png'),fullPage:true});
   assert.deepEqual(errors,[]);
   console.log('AKITEMM_JORNADA_'+device.nome.toUpperCase()+
    '=LINK_PRODUTOS_4_CORES_FOTOS_SCROLL_5_TENIS_1_POSICAO_PREVISTA');
   await context.close();
  }
  // Duas pessoas indicadas, ambas entraram pelo mesmo link assinado.
  const titularAna=db.prepare(
   "SELECT id FROM akitemm_conta_unica_candidata WHERE nick='Ana'"
  ).get().id;
  const rede=ctx.equipe.listar({titularId:titularAna});
  assert.equal(rede.total,2,'link tem que vincular ambos os compradores');
  assert.deepEqual(new Set(rede.cadastros.map(p=>p.nick)),
   new Set(['bruna','celia']));
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>gateway.close(ok));
  await new Promise(ok=>backend.close(ok));
  db.close();
 }
})().catch(e=>{console.error('AKITEMM_JORNADA_BROWSER_FALHOU',e);process.exitCode=1;});
