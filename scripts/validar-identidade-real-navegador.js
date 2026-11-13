'use strict';
// Navegador REAL (Chromium PC/celular) sobre a interface aprovada.
// Identidade criada com dados ficticios e mesma sessao no Escritorio/AKITEMM.
// Nao usa banco de laboratorio, checkout, webhook, bancos nem Pix.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const https=require('node:https');
const {execFileSync}=require('node:child_process');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {chromium}=require('playwright');
const {MotorLoopIntegradoSQLite}=require('../src/producao/motor-loop-integrado-sqlite');
const {SessaoAdminComercialSQLite,COOKIE_ADMIN}=
 require('../src/producao/sessao-admin-comercial-sqlite');
const {CatalogoMultiDistribuidoresSQLite}=
 require('../src/producao/catalogo-multidistribuidores-sqlite');
const {ControleEconomicoLojaSQLite}=
 require('../src/producao/controle-economico-loja-sqlite');
const {AuditoriaOperacionalSQLite}=
 require('../src/producao/auditoria-operacional-sqlite');
const {ManutencaoComercialSQLite}=
 require('../src/producao/manutencao-comercial-sqlite');
const {IdentidadeClienteLoopReal,COOKIE}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {criarAppIdentidadeLoop}=
 require('../src/producao/servidor-identidade-loop');
const {PedidosComerciaisSQLite}=
 require('../src/producao/pedidos-comerciais-sqlite');
const {PreflightCapacidadeCheckoutSQLite}=
 require('../src/producao/preflight-capacidade-checkout-sqlite');
const {ClassificacaoComercialLoopSQLite}=
 require('../src/producao/classificacao-comercial-loop-sqlite');
const {EventosComerciaisLoopSQLite}=
 require('../src/producao/eventos-comerciais-loop-sqlite');
const {PromocaoPedidoMotorEnsaioSQLite}=
 require('../src/producao/promocao-pedido-motor-ensaio-sqlite');
const {PromocaoLotesEnsaioSQLite}=
 require('../src/producao/promocao-lotes-ensaio-sqlite');
const {SincronizadorComercialLoopEnsaioSQLite}=
 require('../src/producao/sincronizador-comercial-loop-ensaio-sqlite');
const {RecuperacaoReservasCheckoutSQLite}=
 require('../src/producao/recuperacao-reservas-checkout-sqlite');
const {criarLeituraComercialSegura}=
 require('../src/producao/montar-comercial-sem-homologacao');
const {TesourariaModularEnsaioSQLite}=
 require('../src/producao/tesouraria-modular-ensaio-sqlite');

const TEXTO='Termos para uma conta de teste de navegação da Loja AKITEMM e do '+
 'Escritório LOOP: os dados deste ensaio são fictícios, os recursos de compras '+
 'e benefícios financeiros reais não estão habilitados, e nenhuma posição real '+
 'nem transferência bancária será realizada. Não é contrato de produção.';
async function conferirLayoutReal(page,secao,{mobile=false}={}){
 const original=page.viewportSize();
 for(const largura of mobile?[320,360,390,412]:[768,1024,1440]){
  await page.setViewportSize({width:largura,height:844});
  const m=await page.evaluate(()=>({
   viewport:innerWidth,html:document.documentElement.scrollWidth,
   corpo:document.body.scrollWidth
  }));
  assert.ok(m.html<=m.viewport+1&&m.corpo<=m.viewport+1,
   'Tela real '+secao+' em '+largura+'px possui corte horizontal: '+
   JSON.stringify(m));
 }
 await page.setViewportSize(original);
}
async function main(){
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 const contas=new IdentidadeClienteLoopReal({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),
  termos:{versao:'LOOP-TERMO-2026',texto:TEXTO},
  privacidade:{versao:'LOOP-PRIVACIDADE-2026',texto:TEXTO},
  enviarEmail:async()=>true
 });
 const docs=contas.documentos(),nick='DozeLetrasAB';
 assert.equal(nick.length,12);
 const cliente=await contas.cadastrar({
  nome:'Pessoa de Ensaio',nick,email:'teste@example.invalid',
  senha:'SenhaDoEnsaio2026!',aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
  versaoPrivacidade:docs.privacidade.versao,
  hashPrivacidade:docs.privacidade.hash
 });
 const motorLoop=new MotorLoopIntegradoSQLite({banco});
 motorLoop.registrarCompraEnsaio({
  titularId:cliente.titularId,pedidoId:'pedido-browser'
 });
 const auditoria=new AuditoriaOperacionalSQLite({
  banco,chaveAuditoria:randomBytes(32)
 });
 const manutencao=new ManutencaoComercialSQLite({banco,auditoria});
 const catalogo=new CatalogoMultiDistribuidoresSQLite({
  banco,distribuidorHomologado:()=>false,auditoria,manutencao
 });
 const controle=new ControleEconomicoLojaSQLite({banco,auditoria,manutencao});
 const sessoes=new SessaoAdminComercialSQLite({banco,
  chaveAdmin:randomBytes(32),
  credencialAdmin:'CredencialAdministrativaIsolada2026!Teste'
 });
 const admin=sessoes.autenticar('CredencialAdministrativaIsolada2026!Teste');
 const login=await contas.entrar({nick,senha:'SenhaDoEnsaio2026!'});
 // O ensaio utiliza o e-mail de teste confirmado; sem enviar mensagens.
 banco.prepare('UPDATE loop_real_contas SET email_confirmado_em=? WHERE id=?')
  .run(Date.now(),cliente.titularId);
 // Mesmas classes e banco das telas reais, com PSP estritamente simulado.
 const cotacoes=new Map();
 const chavePedidos=randomBytes(32);
 const cotacaoConfiavel=async({cotacaoId})=>cotacoes.get(cotacaoId);
 const pspEnsaio=async({pedidoId})=>{
  const pedido=banco.prepare(
   'SELECT valor_total_centavos FROM loja_real_pedidos WHERE pedido_id=?'
  ).get(pedidoId);
  return {pedidoId,pagamentoId:'PSP_'+pedidoId,moeda:'BRL',
   status:'CONFIRMADO',valorCentavos:pedido?.valor_total_centavos};
 };
 const basePedidos=()=>({banco,chavePedidos,
  consultarCotacaoConfiavel:cotacaoConfiavel,
  consultarPagamentoPsp:pspEnsaio});
 new PedidosComerciaisSQLite(basePedidos());
 const classificacaoLoop=new ClassificacaoComercialLoopSQLite({banco});
 const eventosComerciais=new EventosComerciaisLoopSQLite({
  banco,classificacaoLoop
 });
 const promocao=new PromocaoPedidoMotorEnsaioSQLite({
  banco,motor:motorLoop,classificacaoLoop,chaveCpfEnsaio:randomBytes(32)
 });
 const lotes=new PromocaoLotesEnsaioSQLite({
  banco,motor:motorLoop,classificacaoLoop,aceiteAzul:promocao.aceiteAzul
 });
 const integradorComercialEnsaio=new SincronizadorComercialLoopEnsaioSQLite({
  banco,motor:motorLoop,classificacaoLoop,promocao,lotes
 });
 const preflightCapacidade=new PreflightCapacidadeCheckoutSQLite({
  banco,motor:motorLoop,classificacaoLoop
 });
 const pedidosComerciais=new PedidosComerciaisSQLite({
  ...basePedidos(),eventosComerciais,classificacaoLoop,
  integradorComercialEnsaio,preflightCapacidade
 });
 const leituraComercial=criarLeituraComercialSegura({
  banco,pedidos:pedidosComerciais
 });
 const tesourariaEnsaio=new TesourariaModularEnsaioSQLite({banco});
 const recuperacaoReservas=new RecuperacaoReservasCheckoutSQLite({
  banco,preflight:preflightCapacidade,pedidos:pedidosComerciais
 });
 // Testar HTTPS real e Origin idêntico ao configurado, sem reescrever headers.
 const pastaTls=fs.mkdtempSync(path.join(os.tmpdir(),'loop-navegador-https-'));
 const arquivoChave=path.join(pastaTls,'chave-teste.pem');
 const arquivoCert=path.join(pastaTls,'cert-teste.pem');
 execFileSync('openssl',['req','-x509','-nodes','-newkey','rsa:2048',
  '-keyout',arquivoChave,'-out',arquivoCert,'-days','1',
  '-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],
 {stdio:'ignore'});
 let app=null;
 const server=https.createServer({
  key:fs.readFileSync(arquivoChave),
  cert:fs.readFileSync(arquivoCert)
 },(req,res)=>app(req,res));
 server.listen(0,'127.0.0.1');
 await once(server,'listening');
 const base='https://127.0.0.1:'+server.address().port;
 app=criarAppIdentidadeLoop({
  contas,motorLoop,origemHttps:base,
  permitirCadastro:true,preflightCapacidade,
  pedidosComerciais:leituraComercial.leituraPedidos,
  remessasOutbox:leituraComercial.leituraRemessas,
  catalogoVitrine:{banco,listarVitrinePreparacao:params=>catalogo.listarVitrinePreparacao(params)},
  tesourariaEnsaio,
  aceitePosicaoAzulEnsaio:integradorComercialEnsaio,
  adminComercial:{auditoria,manutencao,catalogo,controle,sessoes,
   classificacaoLoop,integradorComercialEnsaio,recuperacaoReservas}
 });
 let browser=null;
 try{
  const pasta=path.join(process.cwd(),'artifacts');
  fs.mkdirSync(pasta,{recursive:true});
  browser=await chromium.launch({headless:true});
  for(const item of [
   {nome:'pc',largura:1440,altura:900},
   {nome:'celular',largura:390,altura:844}
  ]){
   // Convite público da Loja -> cadastro do Escritório, sem cookie.
   const novoNick=item.nome==='pc'?'BravoPc':'BravoCelular';
   const convite=await browser.newContext({
    viewport:{width:item.largura,height:item.altura},
    deviceScaleFactor:1,ignoreHTTPSErrors:true
   });
   const cadastro=await convite.newPage();
   cadastro.setDefaultTimeout(15000);
   await cadastro.goto(base+'/convite/loja?ref='+nick);
   await cadastro.waitForURL(url=>url.pathname==='/escritorio'&&
    url.searchParams.get('ref')===nick);
   await cadastro.locator('#mudarParaCadastro').click();
   await cadastro.locator('#cadastroIndicadorAviso').filter({
    hasText:'@'+nick.toLowerCase()
   }).waitFor({state:'visible'});
   await cadastro.locator('#cadastroNome').fill('Pessoa Convidada');
   await cadastro.locator('#cadastroNick').fill(novoNick);
   await cadastro.locator('#cadastroEmail').fill(
    novoNick.toLowerCase()+'@example.invalid');
   await cadastro.locator('#cadastroSenha').fill('SenhaDoEnsaio2026!');
   await cadastro.locator('#cadastroTermos').waitFor({state:'attached'});
   await cadastro.locator('#cadastroTermos').check();
   await cadastro.locator('#cadastroPrivacidade').check();
   await cadastro.locator('#formCadastro button[type=submit]').click();
   await cadastro.locator('#painelLogin').waitFor({state:'visible'});
   assert.equal(contas.listarIndicados(cliente.titularId).total,
    item.nome==='pc'?1:2);
   await convite.close();
   const contexto=await browser.newContext({
    viewport:{width:item.largura,height:item.altura},
    deviceScaleFactor:1,ignoreHTTPSErrors:true
   });
   // Localhost é HTTP no ensaio; o cookie de prova é injetado SOMENTE
   // no navegador de teste. O login real em produção usa HTTPS+Secure.
   await contexto.addCookies([{
    name:COOKIE,value:login.token,url:base,
    httpOnly:true,secure:true,sameSite:'Strict'
   },{
    name:COOKIE_ADMIN,value:admin.token,url:base,
    httpOnly:true,secure:true,sameSite:'Strict'
   }]);
   const page=await contexto.newPage();
   page.setDefaultTimeout(15000);
   await page.goto(base+'/escritorio',{waitUntil:'domcontentloaded'});
   await page.locator('#painelConta').waitFor({state:'visible'});
   assert.equal(await page.locator('#cadastroNick').getAttribute('maxlength'),'12');
   assert.equal(await page.locator('#login').getAttribute('maxlength'),'12');
   assert.equal(await page.locator('#conteudoResumo').isVisible(),true);
   assert.equal(await page.locator('#perfilCliente').isVisible(),false);
   assert.match(await page.locator('#perfilCliente').innerText(),/dozeletrasab/);
   const menuLoja=page.locator('.loop03-atalho-loja');
   const barraLoja=page.locator('.barra-conta a.loop03-loja-prata');
   assert.equal(await menuLoja.getAttribute('href'),'/loja');
   assert.equal(await barraLoja.getAttribute('href'),'/loja');
   assert.equal(await page.locator('#abaFinanceiro').isDisabled(),false);
   assert.equal(await page.locator('#abaTabuleiro').isDisabled(),false);
   assert.equal(await page.locator('#abaPosicoes').isDisabled(),false);
   assert.equal(await page.locator('#abaMeusPedidos').isDisabled(),false);
   await page.locator('#loopResumoMotor').filter({hasText:/Fila B: 1/}).waitFor();
   const geometria=await page.locator('#abaTabuleiro').evaluate(el=>{
    const rect=el.getBoundingClientRect();
    const side=document.getElementById('loop03SidebarIntegrado');
    const box=side.getBoundingClientRect();
    return {largura:innerWidth,
     menu:{x:rect.x,y:rect.y,width:rect.width},
     lateral:{x:box.x,y:box.y,width:box.width},
     classe:side.className,
     transform:getComputedStyle(side).transform};
   });
   console.log('LOOP_GEOMETRIA_MENU_'+item.nome+'='+JSON.stringify(geometria));
   if(item.largura<=860)await page.locator('#loop03MenuIntegrado').click();
   await page.locator('#abaTabuleiro').click();
   const relogio=page.locator('#relogioTabuleiroIntegrado');
   await relogio.waitFor({state:'visible'});
   assert.equal(await relogio.innerText(),'--:--',
    'sem agenda homologada nao anunciar contagem ficticia');
   assert.match(await page.locator('#tituloRelogioTabuleiro').innerText(),
    /AGUARDANDO AGENDA/);
   assert.equal(await page.locator('#celebracaoGiroCatraca').count(),1);
   assert.equal(await page.locator('#celebracaoGiroCatraca').locator('.confete').count(),0);
   assert.equal(await page.locator('#conteudoTabuleiro').getByText(
    'Mesmo motor V6 e mesmo SQLite',{exact:false}).count(),0);
   await page.locator('#estadoTabuleiroIntegrado')
    .filter({hasText:/Ciclo atual: 0 de 6 eventos/}).waitFor();
   assert.equal(await page.locator('#tabuleiroMotorCentro').innerText(),'#0000');
   assert.equal(await page.locator('#motorFilaB .loop03-linha-fila').count(),1);
   assert.ok((await page.locator('#motorFilaB').innerText())
    .includes('1 posição(ões) em validação interna'));
   assert.equal(await page.locator('#motorFilaB .loop03-inicial-fila').innerText(),'B');
   assert.equal(await page.locator('#motorBolinha1').getAttribute('aria-label'),
    'Evento 1 aguardando');
   assert.equal(await page.locator('#motorBolinha6')
    .evaluate(el=>el.classList.contains('loop03-marcador-aceso')),false);
   if(item.largura<=860)await page.locator('#loop03MenuIntegrado').click();
   await page.locator('#abaPosicoes').click();
   await page.locator('#posicoesPainel').filter({hasText:/#1.*FILA_B/}).waitFor();
   assert.equal(await page.locator('#posicoesPainel .loop03-unidade-posicao').count(),10,
    'a aba mostra os dez espaços, mesmo com uma só posição');
   assert.equal(await page.locator('#posicoesPainel .loop03-posicao-vazia').count(),9);
   assert.match(await page.locator('#posicoesPainel .loop03-unidade-posicao').last().innerText(),
    /Posição 10.*Sem posição/);
   if(item.largura<=860)await page.locator('#loop03MenuIntegrado').click();
   await page.locator('#abaFinanceiro').click();
   const diagnosticoTesouraria=await page.evaluate(async()=>{
    const r=await fetch('/api/loop/tesouraria-ensaio',{cache:'no-store'});
    const d=await r.json().catch(()=>({}));
    return {http:r.status,erro:d.erro||null,
     saldo:d.saldoFicticioDisponivelCentavos??null,
     valor:document.getElementById('tesourariaEnsaioSaldo').textContent,
     oculto:document.getElementById('tesourariaEnsaioModulo').hidden};
   });
   console.log('DIAGNOSTICO_FINANCEIRO_'+item.nome+'='+
    JSON.stringify(diagnosticoTesouraria));
   await page.locator('#tesourariaEnsaioSaldo').filter({
    hasText:/Disponivel ficticio: R\$\s*0,00/
   }).waitFor();
   assert.match(await page.locator('#estadoFinanceiro').innerText(),
    /SIMULACAO.*sem pagamento bancario/i);
   await page.locator('#tesourariaEnsaioSolicitar').click();
   await page.locator('#tesourariaEnsaioStatus').filter({
    hasText:/Saque ficticio indisponivel.*Nenhum dinheiro foi movimentado/
   }).waitFor();
   assert.equal(tesourariaEnsaio.verificar().integridade,'OK');
   if(item.largura<=860)await page.locator('#loop03MenuIntegrado').click();
   await page.locator('#abaEquipe').click();
   await page.locator('#equipeResumo').filter({
    hasText:/cadastro\(s\) pelo seu link/
   }).waitFor();
   assert.match(await page.locator('#listaEquipe').innerText(),
    new RegExp(novoNick,'i'));
   if(item.largura<=860)await page.locator('#loop03MenuIntegrado').click();
   await page.locator('#abaLinks').click();
   assert.match(await page.locator('#linkLoja').inputValue(),
    /\/convite\/loja\?ref=dozeletrasab/);
   assert.match(await page.locator('#linkEscritorio').inputValue(),
    /\/escritorio\?ref=dozeletrasab/);
   if(item.largura<=860)await page.locator('#loop03MenuIntegrado').click();
   await page.locator('#abaConta').click();
   assert.equal(await page.locator('#perfilCliente').isVisible(),true);
   assert.equal(await page.locator('#painelIdentidadeTeste').isHidden(),true);
   await page.screenshot({
    path:path.join(pasta,'identidade-real-escritorio-'+item.nome+'.png'),
    fullPage:true
   });
   await barraLoja.click();
   await page.waitForURL(url=>url.pathname==='/loja');
   await page.locator('#conteudoLojaLoop').waitFor({state:'visible'});
   assert.equal(await page.locator('#akitemmNomeTitular').innerText(),
    nick.toLowerCase());
   assert.equal(await page.locator('#registrarPedidoLoja').isDisabled(),true);
   assert.equal(await page.locator('#akitemmBusca').isDisabled(),true);
   assert.match(await page.locator('#statusPedidoLoja').innerText(),
    /checkout real ainda não foi liberado/i);
   assert.equal(await page.locator('#catalogoLojaLoop').innerText(),'');
   assert.match(await page.locator('#estadoLojaLoop').innerText(),
    /capacidade técnica da sua conta.*Checkout e pagamentos reais ainda não habilitados/i);
   await page.screenshot({
    path:path.join(pasta,'identidade-real-loja-'+item.nome+'.png'),
    fullPage:true
   });
   await page.locator('a.akitemm-voltar').click();
   await page.waitForURL(url=>url.pathname==='/escritorio');
   await page.locator('#painelConta').waitFor({state:'visible'});
   // A tela administrativa consulta a MESMA base e exige outro cookie.
   await page.goto(base+'/administrador',{waitUntil:'domcontentloaded'});
   await page.locator('#loopAdminEstado')
    .filter({hasText:/Fila B: 1/}).waitFor();
   assert.equal(await page.locator('#atualizarLoopAdmin').isVisible(),true);
   await page.screenshot({
    path:path.join(pasta,'identidade-real-admin-'+item.nome+'.png'),
    fullPage:true
   });
   await contexto.close();
  }
  // Prova de ponta a ponta das FUNCIONALIDADES recentes na mesma UI
  // aprovada: pedido -> PSP ensaio -> 2 posicoes douradas -> aceite
  // individual na tela -> admin sincroniza/prepara e consulta reservas.
  catalogo.criarProduto({
   produtoId:'produtoBrowserDourado',
   titulo:'Produto ficticio dourado para prova de navegador'
  });
  catalogo.vincularOferta({
   produtoId:'produtoBrowserDourado',distribuidorId:'DIST_BROWSER',
   sku:'SKU_BROWSER_DOURADO',precoUnitCentavos:25000
  });
  classificacaoLoop.configurarProduto({
   produtoId:'produtoBrowserDourado',cor:'DOURADO',autorizado:true
  });
  catalogo.ativarProduto({produtoId:'produtoBrowserDourado',ativo:true});
  const endereco={destinatario:'Pessoa de Ensaio',cep:'27250010',
   logradouro:'Rua de Ensaio',numero:'2',bairro:'Centro',
   cidade:'Volta Redonda',uf:'RJ',complemento:''};
  const cotacaoId='COTACAO_BROWSER_DOURADO_2026';
  cotacoes.set(cotacaoId,{
   cotacaoId,titularId:cliente.titularId,cepDestino:endereco.cep,
   status:'APROVADA',expiraEm:Date.now()+600000,
   grupos:[{fornecedorId:'DIST_BROWSER',freteCentavos:1000,
    itens:[{sku:'SKU_BROWSER_DOURADO',precoUnitCentavos:25000,
     quantidade:2}]}]
  });
  const compra=await pedidosComerciais.criarPedido({
   titularId:cliente.titularId,cotacaoId,
   chaveIdempotencia:'BROWSER_COMPRA_DOURADA_UNICA_2026',
   enderecoEntrega:endereco
  });
  assert.equal(compra.status,'AGUARDANDO_PAGAMENTO');
  assert.equal(preflightCapacidade.consultar({
   titularId:cliente.titularId
  }).reservadas,2);
  const confirmado=await pedidosComerciais.confirmarPagamento({
   pedidoId:compra.pedidoId
  });
  assert.equal(confirmado.confirmado,true);
  assert.equal(confirmado.integracaoInternaEnsaio?.novasPosicoes,2);
  assert.equal(motorLoop.consultar({
   titularId:cliente.titularId
  }).minhasPosicoes.length,3);
  assert.equal(preflightCapacidade.consultar({
   titularId:cliente.titularId
  }).reservadas,0);
  for(const visual of [
   {nome:'pc',largura:1440,altura:900,mobile:false},
   {nome:'celular',largura:390,altura:844,mobile:true}
  ]){
   const contexto=await browser.newContext({
    viewport:{width:visual.largura,height:visual.altura},
    deviceScaleFactor:1,ignoreHTTPSErrors:true,
    isMobile:visual.mobile,hasTouch:visual.mobile
   });
   await contexto.addCookies([
    {name:COOKIE,value:login.token,url:base,
     httpOnly:true,secure:true,sameSite:'Strict'},
    {name:COOKIE_ADMIN,value:admin.token,url:base,
     httpOnly:true,secure:true,sameSite:'Strict'}
   ]);
   const pagina=await contexto.newPage();
   pagina.setDefaultTimeout(15000);
   const erros=[];
   pagina.on('pageerror',e=>erros.push(e.message));
   await pagina.goto(base+'/escritorio');
   const diagnostico=await pagina.evaluate(async()=>{
    const resposta=await fetch('/api/loop/estado',{cache:'no-store'});
    const d=await resposta.json().catch(()=>({}));
    return {http:resposta.status,erro:d.erro||null,
     filaB:d.filaB??null,quantidadePosicoes:d.minhasPosicoes?.length??null};
   });
   console.log('DIAGNOSTICO_ESTADO_CLIENTE_'+visual.nome+'='+
    JSON.stringify(diagnostico));
   await conferirLayoutReal(pagina,'escritorio-'+visual.nome,{mobile:visual.mobile});
   await pagina.locator('#loopResumoMotor').filter({
    hasText:new RegExp('Fila B: '+diagnostico.filaB)
   }).waitFor();
   if(visual.mobile)await pagina.locator('#loop03MenuIntegrado').click();
   await pagina.locator('#abaMeusPedidos').click();
   await pagina.locator('#listaPedidos').filter({hasText:compra.pedidoId}).waitFor();
   assert.match(await pagina.locator('#listaPedidos').innerText(),
    /APROVADO_PARA_EXPEDICAO/);
   assert.equal(await pagina.locator('#resumoPedidos').innerText(),'1');
   assert.ok((await pagina.locator('#pedidosPaginacao').innerText())
    .includes('Página 1 · 1 pedido(s) no histórico'));
   assert.equal(await pagina.locator('#pedidosAnterior').isDisabled(),true);
   assert.equal(await pagina.locator('#pedidosProximo').isDisabled(),true);
   if(visual.mobile)await pagina.locator('#loop03MenuIntegrado').click();
   await pagina.locator('#abaPosicoes').click();
   const confirmarAzul=pagina.locator('#posicoesPainel form.loop03-aceite-posicao');
   const aguardados=visual.mobile?1:2;
   await confirmarAzul.first().locator('button[type=submit]').waitFor({
    state:'visible'
   });
   assert.equal(await pagina.locator('#posicoesPainel .loop03-unidade-posicao').count(),10,
    'a lista mista mantém todos os espaços disponíveis');
   assert.equal(await pagina.locator('#posicoesPainel .loop03-posicao-vazia').count(),7,
    'três posições ocupadas não escondem sete vagas');
   assert.equal(await confirmarAzul.count(),aguardados,
    'cada posicao pendente precisa ter seu proprio aceite');
   const form=confirmarAzul.first();
   await form.locator('details summary').click();
   await form.locator('input[name=cpf]').fill('52998224725');
   await form.locator('input[type=checkbox]').check();
   await form.locator('button[type=submit]').click();
   await pagina.waitForFunction(quantidade=>
    document.querySelectorAll(
     '#posicoesPainel form.loop03-aceite-posicao'
    ).length===quantidade,aguardados-1);
   assert.equal(lotes.verificar().aceitesIndividuaisEnsaio,
    visual.mobile?2:1);
   const estadoCliente=await pagina.evaluate(async()=>{
    const r=await fetch('/api/loop/estado',{cache:'no-store'});
    return r.json();
   });
   assert.equal(estadoCliente.minhasPosicoes.length,3);
   assert.equal(estadoCliente.minhasPosicoes.filter(
    x=>x.estadoAdesao==='ACEITE_ENSAIO').length,visual.mobile?2:1);
   await pagina.screenshot({
    path:path.join(pasta,'integrado-posicoes-azul-'+visual.nome+'.png'),
    fullPage:true
   });
   if(visual.mobile)await pagina.locator('#loop03MenuIntegrado').click();
   await pagina.locator('#abaTabuleiro').click();
   await pagina.locator('#estadoTabuleiroIntegrado').filter({
    hasText:new RegExp('Fila B: '+diagnostico.filaB)
   }).waitFor();
   assert.equal(await pagina.locator('#motorContadorEventos').innerText(),
    motorLoop.consultar().tabuleiro.eventosNoCiclo+' de 6 eventos neste ciclo');
   const centroPersistido=estadoCliente.tabuleiro?.centro;
   const centroEsperado=centroPersistido?
    (centroPersistido.dourada? 
     (centroPersistido.numeroVisual?'#'+centroPersistido.numeroVisual:'●'):
     '#'+centroPersistido.numero):'#0000';
   assert.equal(await pagina.locator('#tabuleiroMotorCentro').innerText(),
    centroEsperado,'centro segue o estado do motor, nao um valor fixo');
   assert.equal(await pagina.locator('#motorBolinha6')
    .evaluate(el=>el.classList.contains('loop03-marcador-aceso')),false);
   assert.equal(await pagina.locator('#motorFilaB .loop03-linha-fila').count(),1);
   await pagina.screenshot({
    path:path.join(pasta,'integrado-tabuleiro-'+visual.nome+'.png'),
    fullPage:true
   });
   await pagina.goto(base+'/loja');
   await pagina.locator('#akitemmDetalhesPedidos summary').click();
   await pagina.locator('#atualizarPedidosLoja').click();
   await pagina.locator('#pedidosLojaLoop').filter({
    hasText:compra.pedidoId
   }).waitFor({state:'visible'});
   assert.equal(await pagina.locator('#pedidosLojaLoop li').count(),1);
   const loja=pagina.locator('#estadoLojaLoop');
   await conferirLayoutReal(pagina,'loja-'+visual.nome,{mobile:visual.mobile});
   await loja.filter({hasText:/capacidade técnica da sua conta/}).waitFor();
   await pagina.waitForFunction(()=>!document.getElementById('akitemmBusca').disabled);
   assert.equal(await pagina.locator('#catalogoLojaLoop .produto-loja-loop').count(),1);
   await pagina.locator('#catalogoLojaLoop .produto-loja-loop button').click();
   assert.match(await pagina.locator('#akitemmProdutoInlineConteudo').innerText(),
    /Sem preço, estoque ou frete homologados/);
   await pagina.locator('#akitemmVoltarProdutos').click();
   await pagina.locator('#akitemmBusca').fill('inexistente xyz');
   await pagina.locator('#akitemmResultadoProdutos').filter({
    hasText:/Nenhum produto encontrado/
   }).waitFor();
   assert.equal(await pagina.locator('#catalogoLojaLoop .produto-loja-loop')
    .count(),0);
   await pagina.locator('#akitemmFiltroTodos').click();
   await pagina.locator('[data-akitemm-cor="DOURADO"]').click();
   assert.equal(await pagina.locator('#catalogoLojaLoop .produto-loja-loop')
    .count(),1);
   await pagina.locator('#atualizarCatalogoLoja').click();
   await pagina.locator('#akitemmFiltroTodos').click();
   await pagina.locator('[data-akitemm-categoria="novidades"]').click();
   assert.equal(await pagina.locator('#catalogoLojaLoop .produto-loja-loop').count(),1);
   await pagina.locator('#akitemmFiltroTodos').click();
   await pagina.locator('[data-akitemm-categoria="mais-vendidos"]').click();
   assert.equal(await pagina.locator('#catalogoLojaLoop .produto-loja-loop').count(),1);
   await pagina.locator('#akitemmFiltroTodos').click();
   assert.equal(await pagina.locator('#catalogoLojaLoop .produto-loja-loop')
    .count(),1);
   assert.equal(await pagina.locator('#registrarPedidoLoja').isDisabled(),true);
   assert.equal(await pagina.locator('#akitemmBusca').isEnabled(),true);
   await pagina.screenshot({
    path:path.join(pasta,'integrado-loja-'+visual.nome+'.png'),
    fullPage:true
   });
   await pagina.goto(base+'/administrador');
   const integrado=pagina.locator('#integracaoQualificadaEstado');
   await integrado.filter({hasText:/Confirmadas: 1/}).waitFor();
   assert.equal(await pagina.locator('#sincronizarComprasLoop').isEnabled(),true);
   await pagina.locator('#sincronizarComprasLoop').click();
   await integrado.filter({hasText:/Sincronizado:/}).waitFor();
   await pagina.locator('#atualizarReservasVencidasAdmin').click();
   await pagina.locator('#estadoReservasVencidasAdmin').filter({
    hasText:/Reservas de pedidos sem posição: 0/
   }).waitFor();
   if(visual.nome==='pc'){
    await pagina.locator('#prepararTabuleiroLoop').click();
    await integrado.filter({hasText:/Eventos: 1\/6/}).waitFor();
   }else{
    await pagina.locator('#atualizarLoopAdmin').click();
    await pagina.locator('#loopAdminEstado').filter({hasText:/Fila B:/}).waitFor();
    await pagina.locator('#atualizarJornadaAdmin').click();
    await pagina.locator('#estadoJornadaComercial').filter({
     hasText:/aguardam homologação|AGUARDA_PROVEDORES/
    }).waitFor();
    assert.equal(await pagina.locator('#reprocessarJornadaAdmin').isDisabled(),
     true);
   }
   await conferirLayoutReal(pagina,'admin-'+visual.nome,{mobile:visual.mobile});
   const tamanho=await pagina.evaluate(()=>({
    largura:window.innerWidth,
    conteudo:document.documentElement.scrollWidth,
    corpo:document.body.scrollWidth
   }));
   assert.ok(tamanho.conteudo<=tamanho.largura+1,
    'Painel administrativo sem corte horizontal: '+JSON.stringify(tamanho));
   await pagina.screenshot({
    path:path.join(pasta,'integrado-admin-'+visual.nome+'.png'),
    fullPage:true
   });
   assert.deepEqual(erros,[],
    'Nenhuma excecao JavaScript no navegador aprovado '+visual.nome);
   await contexto.close();
  }
  assert.equal(lotes.verificar().aceitesIndividuaisEnsaio,2);
  assert.equal(motorLoop.consultar().tabuleiro.eventosNoCiclo,1);
  console.log('NAVEGADOR_REAL_INTEGRADO=PC_E_CELULAR_CONTROLES_COM_PSP_ENSAIO');
  assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  console.log('NAVEGADOR_IDENTIDADE_REAL=PC_E_CELULAR_APROVADOS_SEM_CHECKOUT');
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(pastaTls,{recursive:true,force:true});
  banco.close();
 }
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1});
