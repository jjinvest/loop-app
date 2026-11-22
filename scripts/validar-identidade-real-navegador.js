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
const {gerarPngTeste}=require('./fixtures/gerar-png-teste');
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
  // Prova de login UNICO real: formulario Nick/Senha -> mesmo LOOP,
  // AKITEMM e Escritório do Administrador pelo rodape, PC e celular.
  for(const visual of [
   {nome:'pc',largura:1440,altura:900,mobile:false},
   {nome:'celular',largura:390,altura:844,mobile:true}
  ]){
   const contextoOperador=await browser.newContext({
    viewport:{width:visual.largura,height:visual.altura},
    deviceScaleFactor:1,ignoreHTTPSErrors:true,
    isMobile:visual.mobile,hasTouch:visual.mobile
   });
   const operadorPage=await contextoOperador.newPage();
   operadorPage.setDefaultTimeout(15000);
   await operadorPage.goto(base+'/escritorio');
   await operadorPage.locator('#painelLogin').waitFor({state:'visible'});
   // Não deve existir terceiro seletor de foto solto abaixo do login,
   // nem no computador nem no Android. O input pode ficar no body para
   // atender ao toque sobre a foto, mas sua caixa tem de estar fora da tela.
   const entrada=await operadorPage.locator('#arquivoFotoPerfil')
    .evaluate(input=>{
     const s=getComputedStyle(input),r=input.getBoundingClientRect();
     const visivel=s.display!=='none'&&s.visibility!=='hidden'&&
      s.opacity!=='0'&&r.width>0&&r.height>0&&
      r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight;
     return {visivel,foraDoFormulario:input.parentElement===document.body,
      posicao:s.position,opacidade:s.opacity,esquerda:r.left,
      ariaOculto:input.getAttribute('aria-hidden')};
    });
   assert.equal(entrada.visivel,false,
    'O seletor nativo de arquivos não pode aparecer abaixo do login');
   if(entrada.foraDoFormulario){
    assert.equal(entrada.posicao,'fixed');
    assert.equal(entrada.opacidade,'0');
    assert.ok(entrada.esquerda<-1000);
    assert.equal(entrada.ariaOculto,'true');
   }
   assert.equal(await operadorPage.locator(
    'script[src^="/identidade/assets/cliente.js?rev="]').count(),1,
    'A entrada precisa solicitar a versao nova do JS de login');
   await operadorPage.locator('#login').fill('OPERADOR');
   await operadorPage.locator('#senha').fill(
    'CredencialAdministrativaIsolada2026!Teste');
   const olho=operadorPage.locator('.alternar-visibilidade[data-senha="senha"]');
   const segredoDigitado='CredencialAdministrativaIsolada2026!Teste';
   const alternarOlho=async()=>{
    if(visual.mobile){
     const pos=await olho.boundingBox();
     assert.ok(pos&&pos.width>=32&&pos.height>=32,
      'Botão precisa ter alvo de toque no Android');
     const x=pos.x+pos.width/2,y=pos.y+pos.height/2;
     const acertou=await operadorPage.evaluate(({x,y})=>
      document.elementFromPoint(x,y)?.closest(
       'button.alternar-visibilidade[data-senha="senha"]')!==null,{x,y});
     assert.equal(acertou,true,'toque deve atingir o botão, não o campo');
     await operadorPage.touchscreen.tap(x,y);
    }else await olho.click();
   };
   await alternarOlho();
   assert.equal(await operadorPage.locator('#senha').getAttribute('type'),'text');
   assert.equal(await operadorPage.locator('#senha').inputValue(),segredoDigitado,
    'Olho revela a senha completa sem apagá-la');
   assert.equal(await olho.getAttribute('aria-pressed'),'true');
   assert.equal(await olho.getAttribute('aria-label'),'Ocultar senha');
   const segurancaVisual=await operadorPage.locator('#senha').evaluate(el=>
    getComputedStyle(el).webkitTextSecurity||'none');
   assert.notEqual(segurancaVisual,'disc','Campo revelado não pode continuar mascarado');
   await alternarOlho();
   assert.equal(await operadorPage.locator('#senha').getAttribute('type'),'password');
   assert.equal(await operadorPage.locator('#senha').inputValue(),segredoDigitado);
   assert.equal(await olho.getAttribute('aria-pressed'),'false');
   assert.equal(await olho.getAttribute('aria-label'),'Mostrar senha');
   await operadorPage.locator('#formLogin button[type=submit]').click();
   await operadorPage.locator('#loopOperadorAtalhos').waitFor({state:'visible'});
   assert.equal(new URL(operadorPage.url()).pathname,'/escritorio');
   assert.equal(await operadorPage.locator('#loop03NickIntegrado').innerText(),
    'OPERADOR');
   assert.equal(await operadorPage.locator('#abaConta').isDisabled(),false);
   // Aba Minhas Posições do OPERADOR: duas molduras independentes,
   // ambas preenchidas pelo mesmo endpoint autenticado do motor.
   if(visual.mobile)await operadorPage.locator('#loop03MenuIntegrado').click();
   await operadorPage.locator('#abaPosicoes').click();
   await operadorPage.locator('#adminResumoPosicoes .loop03-resumo-quadro')
    .first().waitFor({state:'visible'});
   assert.equal(await operadorPage.locator(
    '#adminResumoPosicoes .loop03-resumo-quadro').count(),2);
   const quadros=await operadorPage.locator('#adminResumoPosicoes')
    .evaluate(area=>{
     const elementos=[...area.querySelectorAll(':scope > .loop03-resumo-quadro')];
     const rect=area.getBoundingClientRect();
     return {display:getComputedStyle(area).display,
      titulos:elementos.map(x=>x.querySelector('h3')?.textContent),
      rotulos:elementos.map(x=>[...x.querySelectorAll(
       '.loop03-resumo-indicador > span')].map(y=>y.textContent)),
      valores:elementos.map(x=>[...x.querySelectorAll(
       '.loop03-resumo-indicador > strong')].map(y=>y.textContent)),
      contidos:elementos.every(x=>{
       const r=x.getBoundingClientRect();
       return r.left>=rect.left-2&&r.right<=rect.right+2;
      })};
    });
   assert.equal(quadros.display,'grid');
   assert.deepEqual(quadros.titulos,['FILAS','TABULEIRO']);
   assert.deepEqual(quadros.rotulos,[
    ['Fila A','Fila B'],['Eventos no ciclo','Centros concluídos']
   ]);
   assert.match(quadros.valores[0][0],/^\d+$/);
   assert.match(quadros.valores[0][1],/^\d+$/);
   assert.match(quadros.valores[1][0],/^\d+ \/ 6$/);
   assert.match(quadros.valores[1][1],/^\d+$/);
   assert.equal(quadros.contidos,true,
    'cartões não podem fugir das molduras no celular');
   await operadorPage.locator('#adminAtualizarPosicoes').click();
   await operadorPage.locator('#adminResumoPosicoes .loop03-resumo-quadro')
    .first().waitFor({state:'visible'});
   assert.equal(await operadorPage.locator(
    '#adminResumoPosicoes .loop03-resumo-quadro').count(),2);
   if(visual.mobile)await operadorPage.locator('#loop03MenuIntegrado').click();
   await operadorPage.locator('#abaResumo').click();
   // As fotos do usuário exigem o MESMO quadro central no operador:
   // CICLOS/24H acima, linha divisória, LUZES/24H abaixo.
   // As pontas continuam com os rótulos exclusivamente administrativos.
   const placarOperador=await operadorPage.locator(
    '.loop03-indicadores').evaluate(painel=>{
    const caixas=[...painel.querySelectorAll(':scope > .loop03-indicador')];
    const meio=caixas[1],partes=[...meio.querySelectorAll('.loop03-placar-metade')];
    const primeira=partes[0],segunda=partes[1];
    const a=primeira?.getBoundingClientRect(),b=segunda?.getBoundingClientRect();
    const divisoria=segunda?getComputedStyle(segunda).borderTopWidth:null;
    return {total:caixas.length,
     pontas:[caixas[0]?.querySelector('small')?.textContent,
      caixas[2]?.querySelector('small')?.textContent],
     topo:primeira?.querySelector('small')?.textContent,
     baixo:segunda?.querySelector('small')?.textContent,
     topoId:primeira?.querySelector('strong')?.id,
     baixoId:segunda?.querySelector('strong')?.id,
     visivel:segunda?getComputedStyle(segunda).display!=='none':false,
     direcao:meio?getComputedStyle(meio).flexDirection:null,
     abaixo:Boolean(a&&b&&b.top>a.top+5),divisoria};
   });
   assert.equal(placarOperador.total,3);
   assert.deepEqual(placarOperador.pontas,
    ['POSIÇÕES NAS FILAS','EVENTOS NO CICLO']);
   assert.equal(placarOperador.topo,'CICLOS / 24H');
   assert.equal(placarOperador.baixo,'LUZES / 24H');
   assert.equal(placarOperador.topoId,'loop03Giros24Integrado');
   assert.equal(placarOperador.baixoId,'loop03LuzesHoraIntegrado');
   assert.equal(placarOperador.visivel,true);
   assert.equal(placarOperador.direcao,'column');
   assert.equal(placarOperador.abaixo,true);
   assert.notEqual(placarOperador.divisoria,'0px');
   assert.equal(await operadorPage.locator('#loop03AlterarFotoTopo').isEnabled(),true);
   // Foto no Android deve abrir o seletor de arquivos pelo TOQUE real
   // no circulo, nao apenas setInputFiles sobre input escondido.
   assert.equal(await operadorPage.locator('body > #arquivoFotoPerfil').count(),1);
   assert.equal(await operadorPage.locator('#arquivoFotoPerfil')
    .evaluate(x=>getComputedStyle(x).opacity),'0',
    'O seletor do operador deve ficar invisível, mas funcional');
   const seletorPromise=operadorPage.waitForEvent('filechooser');
   await operadorPage.locator('#loop03AlterarFotoTopo').click();
   const seletor=await seletorPromise;
   await seletor.setFiles({
    name:'perfil-operador.png',mimeType:'image/png',
    buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DAAMIM/4EAAB/uBfsL2WiLAAAAAElFTkSuQmCC','base64')
   });
   await operadorPage.locator('#loop03ImagemFotoTopo')
    .waitFor({state:'visible'});
   const fotoAutenticada=await operadorPage.evaluate(async()=>{
    const r=await fetch('/api/admin/operador/foto-perfil',{
     credentials:'same-origin',cache:'no-store'
    });
    return {status:r.status,mime:r.headers.get('content-type'),
     tamanho:(await r.blob()).size};
   });
   assert.equal(fotoAutenticada.status,200);
   assert.equal(fotoAutenticada.mime,'image/jpeg',
    'foto da galeria deve ser convertida para JPEG leve antes do upload');
   assert.ok(fotoAutenticada.tamanho>0);
   // Verificar que a foto permanece na conta do operador ao recarregar.
   await operadorPage.reload();
   await operadorPage.locator('#loop03ImagemFotoTopo').waitFor({state:'visible'});
   assert.equal(await operadorPage.locator('body > #arquivoFotoPerfil').count(),1);
   assert.equal(await operadorPage.locator('#abaConta').isDisabled(),false);
   // Teste REAL dos banners com foto JPEG de galeria Android contendo
   // bytes extras após o marcador JPEG: a prévia aparece, mas o arquivo
   // original é rejeitado pelo validador binário. A normalização deve
   // gerar JPEG canônico, salvar, permitir GET e sobreviver a um reload.
   const jpegBase64=await operadorPage.evaluate(()=>{
    const c=document.createElement('canvas');c.width=440;c.height=740;
    const x=c.getContext('2d');x.fillStyle='#221b27';x.fillRect(0,0,440,740);
    x.fillStyle='#e2b659';x.fillRect(40,95,360,510);
    x.fillStyle='#222';x.font='bold 34px sans-serif';
    x.fillText('LOOP',148,370);
    return c.toDataURL('image/jpeg',0.90).split(',')[1];
   });
   const jpegAndroid=Buffer.concat([
    Buffer.from(jpegBase64,'base64'),
    Buffer.from('ANDROID-TRAILING-METADATA')
   ]);
   const revisaoBannerAntes=await operadorPage.evaluate(async()=>{
    const r=await fetch('/api/loop/banners',{credentials:'same-origin',cache:'no-store'});
    const d=await r.json();return d.slots?.[0]?.revisao;
   });
   assert.ok(Number.isSafeInteger(revisaoBannerAntes));
   const bannerEditavel=operadorPage.locator('#loop03PistaBanners .loop03-banner-item[data-banner-slot="1"]');
   await bannerEditavel.waitFor({state:'visible',timeout:12000});
   await bannerEditavel.click();
   await operadorPage.locator('#loop03BannerFormularioReal')
    .waitFor({state:'visible'});
   await operadorPage.locator('#loop03BannerArquivoReal').setInputFiles({
    name:'1001177708.jpg',mimeType:'image/jpeg',buffer:jpegAndroid
   });
   await operadorPage.locator('#loop03BannerPreviaReal')
    .waitFor({state:'visible'});
   await operadorPage.locator('#loop03BannerSalvarReal').click();
   await operadorPage.locator('#loop03BannerEditorStatus')
    .filter({hasText:'Banner salvo e publicado'}).waitFor({state:'visible'});
   const bannerSalvo=await operadorPage.evaluate(async()=>{
    const r=await fetch('/api/loop/banners/1/imagem',{
     credentials:'same-origin',cache:'no-store'
    });
    const a=new Uint8Array(await r.arrayBuffer());
    return {status:r.status,mime:r.headers.get('content-type'),
     tamanho:a.length,inicio:[...a.slice(0,3)],fim:[...a.slice(-2)]};
   });
   assert.equal(bannerSalvo.status,200);
   assert.equal(bannerSalvo.mime,'image/jpeg');
   assert.deepEqual(bannerSalvo.inicio,[255,216,255]);
   assert.deepEqual(bannerSalvo.fim,[255,217]);
   // Segunda passagem: o recorte e opcional e aplicado ANTES de salvar,
   // usando a mesma interface nos banners e produtos do operador.
   await operadorPage.locator('#loop03BannerArquivoReal').setInputFiles({
    name:'1001177708.jpg',mimeType:'image/jpeg',buffer:jpegAndroid
   });
   await operadorPage.locator('#loop03BannerFormularioReal .loop-recorte-botao')
    .first().click();
   const cortar=operadorPage.locator('#loopRecorteFotoOpcional');
   await cortar.waitFor({state:'visible'});
   await cortar.locator('select').selectOption('16/9');
   await cortar.locator('input[type=range]').first().evaluate(el=>{
    el.value='1.20';el.dispatchEvent(new Event('input',{bubbles:true}));
   });
   await cortar.getByRole('button',{name:'Usar esta foto'}).click();
   await cortar.waitFor({state:'hidden'});
   await operadorPage.locator('#loop03BannerSalvarReal').click();
   await operadorPage.locator('#loop03BannerEditorStatus')
    .filter({hasText:'Banner salvo e publicado'}).waitFor({state:'visible'});
   await operadorPage.locator('#loop03BannerFormularioReal .banner-real-fechar').click();
   await operadorPage.reload();
   await operadorPage.locator('[data-banner-imagem="1"]')
    .waitFor({state:'visible',timeout:12000});
   await operadorPage.waitForFunction(()=>{
    const img=document.querySelector('[data-banner-imagem="1"]');
    return img?.complete===true&&img.naturalWidth>0&&!img.hidden;
   },null,{timeout:12000});
   const bannerPersistido=await operadorPage.evaluate(async()=>{
    const r=await fetch('/api/loop/banners',{credentials:'same-origin'});
    const d=await r.json();return {status:r.status,slot:d.slots?.[0]};
   });
   assert.equal(bannerPersistido.status,200);
   assert.equal(bannerPersistido.slot.temImagem,true);
   assert.equal(bannerPersistido.slot.revisao,revisaoBannerAntes+2);
   // Limpeza deste ensaio: a tela dos proximos testes volta ao estado inicial.
   const limpezaBanner=await operadorPage.evaluate(async revisaoEsperada=>{
    const sessao=await fetch('/api/admin/comercial/sessao',{
     credentials:'same-origin',cache:'no-store'
    }).then(r=>r.json());
    return fetch('/api/admin/loop/banners/1/imagem',{
     method:'DELETE',credentials:'same-origin',
     headers:{'X-Loop-Admin-Csrf':sessao.csrfToken,
      'X-Banner-Revisao-Esperada':String(revisaoEsperada)}
    }).then(r=>r.status);
   },bannerPersistido.slot.revisao);
   assert.equal(limpezaBanner,200);
   // Foto do operador somente em modo operador autenticado.
   await operadorPage.goto(base+'/loja?visao=operador',{
    waitUntil:'domcontentloaded'
   });
   assert.equal(await operadorPage.locator('#akitemmAlternarVisao').count(),0);
   await operadorPage.locator('#akitemmFotoTitular')
    .waitFor({state:'visible',timeout:12000});
   assert.equal(await operadorPage.locator('#akitemmFotoTitular')
    .evaluate(img=>new URL(img.src).pathname),
    '/api/admin/operador/foto-perfil');
   // Os dois cookies coexistem: cliente logado continua cliente.
   const loginCliente=await operadorPage.evaluate(async({nick,senha})=>{
    const r=await fetch('/api/contas/entrar',{
     method:'POST',credentials:'same-origin',
     headers:{'Content-Type':'application/json'},
     body:JSON.stringify({nick,senha})
    });
    return r.status;
   },{nick,senha:'SenhaDoEnsaio2026!'});
   assert.equal(loginCliente,200,'cliente precisa manter sua propria sessao');
   for(const rota of ['/loja?visao=cliente','/loja']){
    await operadorPage.goto(base+rota,{waitUntil:'domcontentloaded'});
    await operadorPage.waitForFunction(nick=>
     document.getElementById('akitemmNomeTitular')?.textContent
      ?.toLowerCase()===nick.toLowerCase(),nick);
    assert.equal(await operadorPage.locator('#akitemmFotoTitular').isHidden(),true,
     'foto de operador nao pode aparecer para cliente autenticado');
    assert.equal(await operadorPage.locator('.akitemm-acesso-operador').isHidden(),true);
    assert.equal(await operadorPage.locator('#akitemmGerenciarOfertasReal').count(),0);
    assert.equal(await operadorPage.locator('#akitemmBannerMaisReal').isHidden(),true);
   }
   // A visão operador requer escolha explícita e a sessão autorizada.
   await operadorPage.goto(base+'/loja?visao=operador',{
    waitUntil:'domcontentloaded'
   });
   await operadorPage.locator('#akitemmFotoTitular')
    .waitFor({state:'visible',timeout:12000});
   assert.equal(await operadorPage.locator('#akitemmFotoTitular')
    .evaluate(img=>new URL(img.src).pathname),
    '/api/admin/operador/foto-perfil');
   await operadorPage.goto(base+'/escritorio?visao=operador',{
    waitUntil:'domcontentloaded'
   });
   await operadorPage.locator('#loop03ImagemFotoTopo')
    .waitFor({state:'visible',timeout:12000});
   if(visual.mobile)await operadorPage.locator('#loop03MenuIntegrado').click();
   await operadorPage.locator('#abaTabuleiro').click();
   await operadorPage.locator('#conteudoTabuleiro').waitFor({state:'visible'});
   // Cofres exclusivos do operador, com centro destacado.
   const painelCofres=operadorPage.locator('#loop03CofresOperador');
   await painelCofres.waitFor({state:'visible'});
   await operadorPage.locator('#loop03CofresEstado').filter({
    hasText:/Aguardando conciliação externa/
   }).waitFor({state:'visible'});
   const geometriaCofres=await painelCofres.evaluate(painel=>{
    return [...painel.querySelectorAll('.loop03-cofre')].map(el=>({
     codigo:el.dataset.cofre,largura:el.getBoundingClientRect().width,
     altura:el.getBoundingClientRect().height,
     valor:el.querySelector('.loop03-cofre-valor')?.textContent
    }));
   });
   assert.deepEqual(geometriaCofres.map(x=>x.codigo),
    ['INVESTIMENTO','CENTRAL','RESERVA']);
   assert.ok(geometriaCofres[1].largura>geometriaCofres[0].largura);
   assert.ok(geometriaCofres[1].altura>geometriaCofres[2].altura);
   assert.ok(geometriaCofres.every(x=>x.valor==='—'));
   const saldosCofres=await operadorPage.evaluate(async()=>{
    const r=await fetch('/api/admin/loop/cofres',{credentials:'same-origin'});
    return {status:r.status,d:await r.json()};
   });
   assert.equal(saldosCofres.status,200);
   assert.equal(saldosCofres.d.somenteLeitura,true);
   assert.equal(saldosCofres.d.estado,'AGUARDANDO_CONCILIACAO_EXTERNA');
   assert.equal(saldosCofres.d.cofres.length,3);
   assert.ok(saldosCofres.d.cofres.every(x=>x.saldoCentavos===null));
   await operadorPage.locator('#loop03CofresAtualizar').click();
   await operadorPage.locator('#loop03CofresEstado').filter({
    hasText:/Aguardando conciliação externa/
   }).waitFor();
   await operadorPage.locator('#atualizarTabuleiroIntegrado').click();
   const modal=operadorPage.locator('#loopOperadorCatracaDialog');
   await modal.waitFor({state:'visible'});
   assert.equal(new URL(operadorPage.url()).pathname,'/escritorio',
    'toque no relogio NUNCA navega a outra pagina');
   const campo=(parte,tipo)=>modal.locator('label')
    .filter({hasText:parte}).locator(tipo);
   await modal.getByRole('button',{name:'Escolher abertura'}).click();
   const seletorHorario=operadorPage.locator('#loopOperadorHorarioDialog');
   await seletorHorario.waitFor({state:'visible'});
   for(const nome of ['Limpar','Cancelar','Definir'])
    assert.equal(await seletorHorario.getByRole('button',{name:nome}).isVisible(),true);
   const larguras=await seletorHorario.evaluate(el=>{
    const botoes=[...el.querySelectorAll('.loop-operador-horario-acoes button')];
    return botoes.map(b=>({left:b.getBoundingClientRect().left,
     right:b.getBoundingClientRect().right}));
   });
   assert.ok(larguras.every(b=>b.left>=0&&b.right<=visual.largura+1),
    'Limpar, Cancelar e Definir devem caber dentro da largura do celular');
   await seletorHorario.getByRole('button',{name:'Cancelar'}).click();
   await seletorHorario.waitFor({state:'detached'});
   await campo('Modo','select').selectOption('AUTOMATICA');
   await campo('Abertura','input').fill('09:00');
   await campo('Fechamento','input').fill('18:00');
   await campo('Meta diária de centros','input').fill('5');
   await campo('Data da meta','input').fill('2099-11-22');
   const ritmo=modal.locator('.loop-operador-catraca-resumo');
   await ritmo.getByText('5 centros × 6 = 30 luzes').waitFor();
   assert.match(await ritmo.innerText(),/Cada luz: 18 min/);
   assert.match(await ritmo.innerText(),/Cada centro: 108 min/);
   assert.match(await ritmo.innerText(),/Turno: 09:00–18:00 \(540 min\)/);
   const posicoes=await operadorPage.evaluate(()=>{
    const modal=document.querySelector('#loopOperadorCatracaDialog');
    const resumo=modal.querySelector('.loop-operador-catraca-resumo');
    const salvar=[...modal.querySelectorAll('button')]
     .find(b=>b.textContent==='Salvar programação');
    const topo=resumo.getBoundingClientRect();
    const rodape=salvar.getBoundingClientRect();
    const janela=modal.getBoundingClientRect();
    const campos=modal.querySelector('form');
    const scroll=campos.getBoundingClientRect();
    return {topo:topo.top,rodape:rodape.bottom,
     modalTopo:janela.top,modalFim:janela.bottom,
     viewport:innerHeight,campos:scroll.height,
     scrollavel:campos.scrollHeight>campos.clientHeight};
   });
   assert.ok(posicoes.topo>=posicoes.modalTopo-1&&
    posicoes.rodape<=posicoes.modalFim+1&&
    posicoes.rodape<=posicoes.viewport+1,
    'Resumo e botao Salvar precisam permanecer visiveis sem rolar a pagina');
   if(visual.mobile)assert.equal(posicoes.scrollavel,true,
    'Somente campos internos devem ter rolagem vertical no celular');
   await modal.getByRole('button',{name:'Salvar programação'}).click();
   await modal.locator('.loop-operador-catraca-rodape .mensagem-operador')
    .filter({hasText:'Programação salva e confirmada'}).waitFor();
   assert.match(await modal.locator('.loop-operador-catraca-resumo').innerText(),
    /PROGRAMAÇÃO GRAVADA NO SERVIDOR/);
   const comprovante=operadorPage.locator('#loopOperadorAgendaConfirmada');
   await comprovante.waitFor({state:'visible'});
   assert.match(await comprovante.innerText(),/AGENDADA — AGUARDANDO DATA/);
   assert.match(await comprovante.innerText(),/22\/11\/2099 · 09:00–18:00/);
   assert.match(await comprovante.innerText(),/5 centros · 30 luzes/);
   await modal.getByRole('button',{name:'Fechar'}).click();
   await modal.waitFor({state:'detached'});
   await operadorPage.locator('#atualizarTabuleiroIntegrado').click();
   const reaberto=operadorPage.locator('#loopOperadorCatracaDialog');
   await reaberto.waitFor({state:'visible'});
   assert.equal(await reaberto.locator('label')
    .filter({hasText:'Meta diária de centros'}).locator('input').inputValue(),'5');
   assert.match(await reaberto.locator('.loop-operador-catraca-resumo').innerText(),
    /Cada luz: 18 min/);
   assert.match(await reaberto.locator('.loop-operador-catraca-resumo').innerText(),
    /PROGRAMAÇÃO GRAVADA NO SERVIDOR/);
   assert.equal(await reaberto.locator('label').filter({hasText:'Data da meta'})
    .locator('input').inputValue(),'2099-11-22');
   await reaberto.getByRole('button',{name:'Fechar'}).click();
   await reaberto.waitFor({state:'detached'});
   assert.equal(new URL(operadorPage.url()).pathname,'/escritorio');
   await operadorPage.locator('#loopAcessoAdminMenu:not([hidden])')
    .waitFor({state:'attached'});
   // Acessar loja no papel operador explicitamente, mesmo com conta cliente ativa.
   await operadorPage.goto(base+'/loja?visao=operador');
   await operadorPage.locator('#akitemmNomeTitular').filter({
    hasText:'OPERADOR'
   }).waitFor();
   await operadorPage.locator('footer .akitemm-acesso-operador:not([hidden])')
    .click();
   await operadorPage.waitForURL(url=>url.pathname==='/administrador');
   await operadorPage.locator('#loopAdminEstado').waitFor({state:'visible'});
   await operadorPage.goto(base+'/escritorio');
   await operadorPage.locator('#loopOperadorAtalhos').waitFor({state:'visible'});
   await operadorPage.locator('#loopAcessoAdminMenu').click();
   await operadorPage.waitForURL(url=>url.pathname==='/administrador');
   await operadorPage.goto(base+'/escritorio');
   await operadorPage.locator('#loopOperadorAtalhos').waitFor({state:'visible'});
   if(visual.mobile)await operadorPage.locator('#loop03MenuIntegrado').click();
   // Regressao da sessao expirada: nao deixar o painel do relogio vazio.
   await contextoOperador.clearCookies();
   await operadorPage.locator('#abaTabuleiro').click();
   await operadorPage.locator('#atualizarTabuleiroIntegrado').click();
   await operadorPage.locator('#painelLogin').waitFor({state:'visible'});
   assert.match(await operadorPage.locator('#erroLogin').innerText(),
    /Sessão do operador encerrada/);
   await operadorPage.locator('#login').fill('OPERADOR');
   await operadorPage.locator('#senha').fill(
    'CredencialAdministrativaIsolada2026!Teste');
   await operadorPage.locator('#formLogin button[type=submit]').click();
   await operadorPage.locator('#loopOperadorAtalhos').waitFor({state:'visible'});
   if(visual.mobile)await operadorPage.locator('#loop03MenuIntegrado').click();
   await operadorPage.locator('#sair').click();
   await operadorPage.locator('#painelLogin').waitFor({state:'visible'});
   const encerrado=await operadorPage.evaluate(async()=>{
    const resposta=await fetch('/api/operador/estado',{cache:'no-store'});
    return resposta.json();
   });
   assert.deepEqual(encerrado,{operador:false});
   await contextoOperador.close();
  }
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
   // Os acessos reais base e personalizado entregam a MESMA interface.
   await cadastro.goto(base+'/minha-conta');
   await cadastro.locator('#painelLogin').waitFor({state:'visible'});
   assert.equal(await cadastro.locator('#conviteIndicadorEntrada').count(),0);
   await cadastro.goto(base+'/escritorio');
   await cadastro.locator('#painelLogin').waitFor({state:'visible'});
   assert.equal(await cadastro.locator('#conviteIndicadorEntrada').count(),0);
   await cadastro.goto(base+'/escritorio/'+nick);
   assert.equal(new URL(cadastro.url()).pathname,'/escritorio');
   assert.equal(new URL(cadastro.url()).searchParams.get('ref'),
    nick.toLowerCase(),'o link personalizado deve identificar o indicador');
   await cadastro.locator('#painelLogin').waitFor({state:'visible'});
   assert.equal(await cadastro.locator('#conviteIndicadorEntrada').count(),0);
   await cadastro.locator('#mudarParaCadastro').click();
   await cadastro.locator('#painelCadastro').waitFor({state:'visible'});
   assert.equal(await cadastro.locator('#cadastroIndicador').inputValue(),
    nick.toLowerCase());
   assert.equal(await cadastro.locator('#cadastroIndicadorAviso').count(),0);
   assert.equal(await cadastro.locator('#documentosCadastroDetalhes summary')
    .innerText(),'Ler Termos de Uso e Privacidade');
   assert.equal(await cadastro.locator('#cadastroTermos').evaluate(el=>
    el.closest('label').textContent.trim()),
    'Li e aceito a Política de Privacidade e os Termos de Uso apresentados acima.');
   const prata=await cadastro.locator('.loop03-marca-entrada .loop03-marca-versao')
    .evaluate(el=>getComputedStyle(el).webkitTextFillColor);
   assert.equal(prata,'rgb(225, 232, 243)','3.0 sempre prateado');
   const orientacao=await cadastro.locator('#painelCadastro > p.subtexto')
    .evaluate(el=>getComputedStyle(el).color);
   assert.equal(orientacao,'rgb(238, 233, 225)',
    'orientacao do cadastro legivel no PC e celular');
   const tamanhoQuadrinho=await cadastro.locator('#cadastroTermos')
    .evaluate(el=>({largura:el.getBoundingClientRect().width,
      altura:el.getBoundingClientRect().height}));
   assert.ok(tamanhoQuadrinho.largura>=24&&tamanhoQuadrinho.altura>=24,
    'checkbox de aceite deve ser legivel e tocavel');
   await cadastro.goto(base+'/convite/loja?ref='+nick);
   // goto ja aguarda a resposta final; ler a rota evita espera circular
   // quando a vitrine fica aberta e nao redireciona o visitante ao login.
   const destinoInicial=new URL(cadastro.url());
   assert.equal(destinoInicial.pathname,'/loja',
    'o convite deve abrir a loja; atual: '+cadastro.url());
   assert.equal(destinoInicial.searchParams.get('ref'),nick,
    'o convite deve preservar o indicador ate a escolha de cadastro');
   // O visitante ve primeiro a vitrine publica, antes de cadastrar.
   await cadastro.locator('#conteudoLojaLoop').waitFor({state:'visible'});
   await cadastro.locator('#akitemmAbrirConta').click();
   await cadastro.waitForURL(url=>url.pathname==='/escritorio'&&
    url.searchParams.get('ref')===nick.toLowerCase()&&
    url.searchParams.get('cadastro')==='1');
   await cadastro.locator('#painelCadastro').waitFor({state:'visible'});
   assert.equal(await cadastro.locator('#cadastroIndicador').inputValue(),
    nick.toLowerCase());
   assert.equal(await cadastro.locator('#cadastroIndicadorAviso').count(),0);
   assert.equal(await cadastro.locator('#conviteIndicadorEntrada').count(),0);
   await cadastro.locator('#cadastroNome').fill('Pessoa Convidada');
   await cadastro.locator('#cadastroNick').fill(novoNick);
   await cadastro.locator('#cadastroEmail').fill(
    novoNick.toLowerCase()+'@example.invalid');
   await cadastro.locator('#cadastroCpf').fill(item.nome==='pc'?'52998224725':'11144477735');
   await cadastro.locator('#cadastroTelefone').fill('21988887777');
   await cadastro.locator('#cadastroSenha').fill('SenhaDoEnsaio2026!');
   await cadastro.locator('#cadastroConfirmarSenha').fill('SenhaDoEnsaio2026!');
   await cadastro.locator('#cadastroTelefone').fill('21988887777');
   await cadastro.locator('#cadastroTermos').waitFor({state:'attached'});
   await cadastro.locator('#documentosCadastroDetalhes').waitFor({state:'attached'});
   assert.equal(await cadastro.locator('#cadastroTermos').count(),1);
   await cadastro.locator('#cadastroTermos').check();
   if(await cadastro.locator('#captchaCadastroArea').isVisible()){
    const codigo=await cadastro.locator('#captchaCadastroImagem').evaluate(img=>{
     const svg=atob(img.src.split(',')[1]);
     return [...svg.matchAll(/<text[^>]*>([A-Z0-9])</g)].map(x=>x[1]).join('');
    });
    await cadastro.locator('#captchaCadastroResposta').fill(codigo);
   }
   await cadastro.locator('#formCadastro button[type=submit]').click();
   await cadastro.locator('#painelLogin').waitFor({state:'visible'});
   assert.equal(contas.listarIndicados(cliente.titularId).total,
    item.nome==='pc'?1:2);
   // Prova real tela -> API -> SQLite cifrado, nao apenas formulario valido.
   const contato=banco.prepare([
    'SELECT c.id AS titularId,k.cpf_hmac AS cpfHmac,',
    'k.cpf_ct AS cpfCifra,k.telefone_ct AS telefoneCifra',
    'FROM loop_real_contas c',
    'JOIN loop_real_contatos_cadastro k ON k.titular_id=c.id',
    'WHERE c.nick=?'
   ].join(' ')).get(novoNick);
   assert.ok(contato&&contato.cpfHmac.length===64,
    'CPF e telefone devem persistir no SQLite real da conta '+novoNick);
   assert.ok(!JSON.stringify(contato).includes('52998224725')&&
    !JSON.stringify(contato).includes('11144477735')&&
    !JSON.stringify(contato).includes('21988887777'),
    'Contato em claro nao pode ficar gravado no banco');
   assert.equal(contas.dadosTitular(contato.titularId).telefone,'21988887777');
   assert.equal(contas.dadosTitular(contato.titularId).cpfConfirmado,false);
   // Esta conta convidada ainda não confirmou e-mail: provar o contador
   // de reenvio na mesma interface, sem adulterar a conta já verificada.
   const loginConvite=await contas.entrar({
    nick:novoNick,senha:'SenhaDoEnsaio2026!'
   });
   await convite.addCookies([{
    name:COOKIE,value:loginConvite.token,url:base,
    httpOnly:true,secure:true,sameSite:'Strict'
   }]);
   await cadastro.goto(base+'/escritorio',{waitUntil:'domcontentloaded'});
   await cadastro.locator('#painelConta').waitFor({state:'visible'});
   if(item.largura<=860)
    await cadastro.locator('#loop03MenuIntegrado').click();
   await cadastro.locator('#abaConta').click();
   await cadastro.locator('#painelVerificarEmail').waitFor({state:'visible'});
   await cadastro.locator('#solicitarCodigoEmail').click();
   await cadastro.locator('#contadorReenvioEmail').waitFor({state:'visible'});
   assert.match(await cadastro.locator('#contadorReenvioEmail').innerText(),
    /Reenviar em [12]:[0-5][0-9]/);
   assert.equal(await cadastro.locator('#solicitarCodigoEmail').isDisabled(),true);
   assert.match(await cadastro.locator('#estadoEmailCodigo').innerText(),
    /Solicitação recebida/);
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
   }]);
   const page=await contexto.newPage();
   page.setDefaultTimeout(15000);
   page.on('pageerror',e=>console.log('E2E_PAGE_ERROR='+e.message));
   await page.goto(base+'/escritorio',{waitUntil:'domcontentloaded'});
   await page.locator('#painelConta').waitFor({state:'visible'});
   assert.equal(await page.locator('#cadastroNick').getAttribute('maxlength'),'12');
   assert.equal(await page.locator('#login').getAttribute('maxlength'),'12');
   assert.equal(await page.locator('#conteudoResumo').isVisible(),true);
   // No operador sempre existem quatro espaços base; o cliente não recebe
   // espaços vazios: vê apenas a quantidade de banners completos publicados.
   await page.waitForFunction(()=>
    document.getElementById('loop03PistaBanners')?.dataset.carrosselDinamico==='true');
   const estadoBanners=await page.evaluate(async()=>{
    const r=await fetch('/api/loop/banners',{credentials:'same-origin'});
    if(!r.ok)throw Error('BANNER_ESTADO_INDISPONIVEL');
    return r.json();
   });
   assert.deepEqual(estadoBanners.slots.slice(0,4).map(x=>x.slot),[1,2,3,4],
    'quatro posições originais continuam guardadas para o operador');
   const publicados=estadoBanners.slots.filter(x=>x.publicado).length;
   await page.waitForFunction(esperados=>{
    const pista=document.getElementById('loop03PistaBanners');
    const visiveis=[...pista.querySelectorAll('.loop03-banner-item[data-banner-slot]')]
      .filter(x=>getComputedStyle(x).display!=='none');
    return visiveis.length===esperados;
   },publicados);
   assert.equal(await page.locator('#loop03PistaBanners .loop03-banner-item[data-banner-slot]:visible').count(),publicados,
    'o cliente vê exatamente os banners com fotos completas');
   assert.equal(await page.locator('#loop03BannerMaisReal').isHidden(),true,
    'o cliente não pode criar banners');
   assert.equal(await page.locator('.loop03-banners-pontos button').count(),publicados,
    'os pontos do carrossel seguem o total de fotos publicadas');

   // Cliente troca a foto clicando no retrato do LOOP com Minha Conta fechada.
   // A imagem deve ser salva automaticamente no SQLite real.
   const escolhaFoto=page.waitForEvent('filechooser',{timeout:12000});
   await page.locator('#loop03AlterarFotoTopo').click();
   const escolher=await escolhaFoto;
   await escolher.setFiles({
    name:'foto-perfil.png',mimeType:'image/png',buffer:gerarPngTeste()
   });
   await page.waitForFunction(()=>document.getElementById('statusFotoPerfil')
    ?.textContent.includes('Foto salva no LOOP e disponível também na AKITEMM.'));
   await page.locator('#loop03ImagemFotoTopo').waitFor({state:'visible'});
   const imagemLoop=await page.locator('#loop03ImagemFotoTopo').evaluate(
    img=>({ok:img.complete&&img.naturalWidth>0,src:img.getAttribute('src')})
   );
   assert.equal(imagemLoop.ok,true,'foto salva deve aparecer no LOOP');
   assert.match(imagemLoop.src,/^\/api\/contas\/foto-perfil/);
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
   // Aguardamos o motor preencher a tela aprovada, sem exigir quadro extra.
   await page.locator('#loop03TotalIntegrado')
    .filter({hasText:/[0-9]+\s*\/\s*10/}).waitFor();
   assert.equal(await page.locator('#loopEstadoIntegrado').count(),0);
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
   await page.locator('#motorContadorEventos')
    .filter({hasText:/0 de 6 eventos neste ciclo/}).waitFor();
   assert.equal(await page.locator('#estadoTabuleiroIntegrado').isHidden(),true,
    'sem mensagens duplicadas no rodapé do tabuleiro');
   assert.equal(await page.locator('#tabuleiroMotorCentro').innerText(),'',
    'esfera vazia não mostra marcador fictício');
   assert.equal(await page.locator('#motorFilaB .loop03-linha-fila').count(),1);
   const resumoFilaB=await page.locator('#motorFilaB').textContent();
   assert.ok(resumoFilaB.includes('1º lugar')&&
    await page.locator('#motorFilaB .loop03-linha-fila').count()===1,
    'fila B mostra ordinal paginado real, sem inventar IDs: '+resumoFilaB);
   assert.equal(await page.locator('#motorFilaB .loop03-inicial-fila').innerText(),'1',
    'fila paginada exibe ordinal 1, nunca ID interno ou titular alheio');
   assert.equal(await page.locator('#motorBolinha1').getAttribute('aria-label'),
    'Evento 1 aguardando');
   assert.equal(await page.locator('#motorBolinha6')
    .evaluate(el=>el.classList.contains('loop03-marcador-aceso')),false);
   if(item.largura<=860)await page.locator('#loop03MenuIntegrado').click();
   await page.locator('#abaPosicoes').click();
   await page.locator('#posicoesPainel').filter({hasText:/#1[\s\S]*Fila B/}).waitFor();
   assert.equal(await page.locator('#posicoesPainel .loop03-unidade-posicao').count(),10,
    'a aba mostra os dez espaços, mesmo com uma só posição');
   assert.equal(await page.locator('#posicoesPainel .loop03-posicao-vazia').count(),9);
   assert.match(await page.locator('#posicoesPainel .loop03-unidade-posicao').last().innerText(),
    /Posição 10[\n\r\s\S]*Sem posição/);
   // Cada espaço tem CPF/Termos, sem exigir compra nem inventar aceites.
   const controlesCpf=page.locator('#posicoesPainel .loop03-controles-cpf-termos');
   assert.equal(await controlesCpf.count(),10,
    'dez cartões preservam os controles individuais de CPF/Termos');
   const vazio=page.locator('#posicoesPainel .loop03-unidade-posicao').nth(1);
   await vazio.locator('.loop03-controles-cpf-termos > summary').click();
   assert.equal(await vazio.locator('input[name=cpf]').isDisabled(),true);
   assert.equal(await vazio.locator('input[type=checkbox]').isDisabled(),true);
   assert.equal(await vazio.getByRole('button',{name:'Confirmar CPF e termos'}).isDisabled(),true);
   await vazio.locator('.loop03-documento-posicao > summary').click();
   await vazio.locator('.loop03-documento-posicao p').filter({hasText:/Versão:/})
    .waitFor({state:'visible'});
   assert.ok((await vazio.locator('.loop03-documento-posicao p').innerText()).length>100,
    'texto integral dos termos vigentes sem documento inventado');
   await vazio.locator('.loop03-controles-cpf-termos > summary').click();
   assert.equal(await page.locator('#posicoesPainel .loop03-controles-cpf-termos[open]').count(),0);

   // Confirmar geometria no navegador: tres cartoes lado a lado,
   // quarto na proxima linha, mesmo no telefone em pe.
   await page.locator('#posicoesPainel .loop03-grade-posicoes')
    .waitFor({state:'visible'});
   const gradeMedida=await page.evaluate(()=>{
     // Buscar o elemento e medir no mesmo frame: uma atualizacao de dados
     // nao pode entregar um no desconectado da arvore.
     const el=document.querySelector('#posicoesPainel .loop03-grade-posicoes');
     if(!el)return {display:'AUSENTE',caixas:[]};
     const caixas=[...el.querySelectorAll(':scope > .loop03-unidade-posicao')]
      .slice(0,4).map(n=>{
       const b=n.getBoundingClientRect();
       return {x:b.left,y:b.top,width:b.width};
      });
     return {display:getComputedStyle(el).display,
      conectado:el.isConnected,
      clienteIntegrado:!!el.closest('.cliente-integrado'),
      parentWidth:el.getBoundingClientRect().width,caixas};
    });
   assert.equal(gradeMedida.display,'grid',
    'Minhas Posicoes precisa de display:grid: '+JSON.stringify(gradeMedida));
   assert.equal(gradeMedida.caixas.length,4);
   const [c1,c2,c3,c4]=gradeMedida.caixas;
   assert.ok(c1.x<c2.x&&c2.x<c3.x&&
     Math.abs(c1.y-c2.y)<3&&Math.abs(c2.y-c3.y)<3&&
     c4.y>c1.y+10&&Math.abs(c4.x-c1.x)<3&&
     c1.width<gradeMedida.parentWidth/2,
    'tres cartoes compactos por fileira, nao empilhados');

   if(item.largura<=860)await page.locator('#loop03MenuIntegrado').click();
   await page.locator('#abaFinanceiro').click();
   assert.equal(await page.locator('#conteudoFinanceiro').isVisible(),true);
   assert.equal(await page.locator('#finSaldoSelecionado').innerText(),'—');
   assert.equal(await page.locator('#finSaldoPosicoes').innerText(),'—');
   const minimo=await page.locator('#conteudoFinanceiro .fin-nota').innerText();
   assert.match(minimo,/Valor mínimo para saque: R\$ 25,00 \(fixo\)/);
   const blocoTopo=page.locator('#loop03IrPosicoesIntegrado');
   await blocoTopo.click();
   assert.equal(await page.locator('#seletorPosicoesResumo').isVisible(),true,
    'seletor de posições abre sem sair do Financeiro');
   await page.locator('#opcoesPosicoesResumo button').first().click();
   assert.equal(await page.locator('#conteudoFinanceiro').isVisible(),true,
    'seletor superior não muda de aba');
   assert.equal(await page.locator('#loop03NumeroIntegrado').innerText(),'1ª posição');
   assert.equal(await page.locator('#seletorPosicoesResumo').isHidden(),true);
   await page.locator('#finEscolherPosicoes').click();
   assert.equal(await page.locator('#finEscolherPosicoes').getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('#finEscolherBonus').getAttribute('aria-pressed'),'false');
   await page.locator('#finAbrirHistorico').click();
   assert.equal(await page.locator('#finHistorico').isVisible(),true);
   await page.locator('#finHistoricoMensagem').filter({
    hasText:/Sem lançamentos financeiros comprovados/
   }).waitFor();
   await page.locator('#finAbrirHistorico').click();
   assert.equal(await page.locator('#finHistorico').isHidden(),true);
   await page.locator('#finValorSaque').fill('25');
   await page.locator('#finSolicitarSaque').click();
   await page.locator('#finSaqueResposta').filter({
    hasText:/Saque indisponível até a homologação bancária/
   }).waitFor();
   await conferirLayoutReal(page,'financeiro-'+item.nome,{
    mobile:item.largura<=860
   });
   const finGeometria=await page.evaluate(()=>({
    viewport:innerWidth,html:document.documentElement.scrollWidth,
    campos:[...document.querySelectorAll('#conteudoFinanceiro .fin-indicador')]
     .map(e=>({largura:Math.round(e.getBoundingClientRect().width),
      visivel:e.getBoundingClientRect().width>0}))
   }));
   assert.equal(finGeometria.campos.length,4);
   assert.equal(finGeometria.campos.every(x=>x.visivel),true);
   assert.ok(finGeometria.html<=finGeometria.viewport+1);
   await page.screenshot({path:path.join(
    pasta,'identidade-real-financeiro-'+item.nome+'.png'),fullPage:true});
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
   const indicado=page.locator('#listaEquipe .loop03-rede-pessoa')
    .filter({hasText:new RegExp(novoNick,'i')});
   await indicado.waitFor({state:'visible'});
   assert.equal(await indicado.getAttribute('data-estado'),'vermelho',
    'cadastro pendente nunca e apresentado como qualificado');
   const menu=indicado.locator('.loop03-rede-pessoa-menu');
   assert.equal(await menu.getAttribute('aria-expanded'),'false');
   await menu.click();
   assert.equal(await menu.getAttribute('aria-expanded'),'true');
   const detalhes=indicado.locator('.loop03-rede-pessoa-detalhes');
   await detalhes.waitFor({state:'visible'});
   const botoes=detalhes.locator('.loop03-rede-posicao');
   assert.equal(await botoes.count(),10,
    'Minha Equipe preserva os dez botoes das posicoes');
   for(let n=1;n<=10;n++){
    assert.equal(await botoes.nth(n-1).innerText(),String(n));
    assert.equal(await botoes.nth(n-1).isDisabled(),true,
     'cadastro sem confirmação e qualificação não pode ser vinculado');
   }
   assert.match(await indicado.innerText(),/indicação ainda não é válida/i);
   const check=await page.evaluate(()=>fetch('/api/contas/minha-rede',{
    credentials:'same-origin',cache:'no-store'
   }).then(r=>r.json()));
   const pendente=check.indicados.find(p=>p.nick===novoNick.toLowerCase());
   assert.equal(pendente?.indicacaoValida,false);
   assert.equal(pendente?.posicaoDestinoReservada,null);
   assert.equal(check.resumo.cadastrosConfirmados,0);
   assert.equal(check.resumo.indicacoesVinculadas,0);
   assert.equal(check.resumo.aDistribuir,0);
   assert.ok(await page.locator('#equipeResumo').evaluate(el=>{
    const css=getComputedStyle(el);
    const largura=el.getBoundingClientRect().width;
    const pai=el.parentElement.getBoundingClientRect().width;
    const estiloPai=getComputedStyle(el.parentElement);
    const espaco=Number.parseFloat(estiloPai.paddingLeft||'0')+
     Number.parseFloat(estiloPai.paddingRight||'0')+
     Number.parseFloat(estiloPai.borderLeftWidth||'0')+
     Number.parseFloat(estiloPai.borderRightWidth||'0');
    return css.display==='block'&&largura>200&&
     Math.abs(largura-(pai-espaco))<=6;
   }),'total de cadastros deve ocupar toda a largura do resumo');
   await indicado.locator('.loop03-rede-pessoa-menu').click();
   await detalhes.waitFor({state:'hidden'});
   if(item.largura<=860)await page.locator('#loop03MenuIntegrado').click();
   await page.locator('#abaLinks').click();
   assert.match(await page.locator('#linkLoja').inputValue(),
    /\/loja\/dozeletrasab/);
   assert.match(await page.locator('#linkEscritorio').inputValue(),
    /\/escritorio\/dozeletrasab/);
   if(item.largura<=860)await page.locator('#loop03MenuIntegrado').click();
   await page.locator('#abaConta').click();
   assert.equal(await page.locator('#perfilCliente').isVisible(),true);
   await page.locator('#perfilCliente .loop03-perfil-linha').first()
    .waitFor({state:'visible'});
   assert.equal(await page.locator('#perfilCliente .loop03-perfil-linha').count(),4);
   assert.doesNotMatch(await page.locator('#perfilCliente').innerText(),
    /LOOP-TERMOS-|LOOP-PRIVACIDADE-/);
   // Pelo painel Minha Conta a escolha NÃO grava sozinha; o botão Salvar
   // confirma a troca, usando o mesmo endpoint privado do retrato superior.
   const seletorConta=page.waitForEvent('filechooser',{timeout:12000});
   await page.locator('#formFotoPerfil .loop03-escolher-foto').click();
   await (await seletorConta).setFiles({
    name:'foto-perfil-manual.png',mimeType:'image/png',
    buffer:gerarPngTeste(120,45,65)
   });
   await page.locator('#statusFotoPerfil').filter({
    hasText:'Foto selecionada.'
   }).waitFor({state:'visible'});
   await page.locator('#formFotoPerfil button[type=submit]').click();
   await page.locator('#statusFotoPerfil').filter({
    hasText:'Foto salva no LOOP e disponível também na AKITEMM.'
   }).waitFor({state:'visible'});
   // Esta conta de prova já teve e-mail confirmado: não exibe reenvio.
   assert.equal(await page.locator('#painelVerificarEmail').isHidden(),true);
   assert.equal(await page.locator('#painelIdentidadeTeste').isHidden(),true);
   await page.screenshot({
    path:path.join(pasta,'identidade-real-escritorio-'+item.nome+'.png'),
    fullPage:true
   });
   await barraLoja.click();
   await page.waitForURL(url=>url.pathname==='/loja');
   await page.locator('#conteudoLojaLoop').waitFor({state:'visible'});
   await page.locator('#akitemmNomeTitular').filter({
    hasText:nick.toLowerCase()
   }).waitFor({state:'visible'});
   // Mesmo acabamento de marca entre as duas interfaces: LOOP e aro
   // dourados, versão 3.0 prateada (sem branco integral na loja).
   const identidadeMarca=await page.locator('.akitemm-marca-loop')
    .evaluate(el=>{
     const versao=el.querySelector('em')||el.querySelector('span:last-child');
     const aro=el.querySelector('.akitemm-anel');
     return {
      html:el.outerHTML.slice(0,1100),
      loop:getComputedStyle(el).color,
      versao:versao?getComputedStyle(versao).color:null,
      aro:aro?getComputedStyle(aro,'::before').color:null
     };
    });
   console.log('E2E_MARCA_LOJA='+JSON.stringify(identidadeMarca));
   assert.equal(identidadeMarca.loop,'rgb(247, 195, 93)',
    'LOOP no cabeçalho da loja deve ser dourado');
   assert.equal(identidadeMarca.versao,'rgb(229, 233, 241)',
    '3.0 deve permanecer prateado: '+identidadeMarca.html);
   if(identidadeMarca.aro!==null)
    assert.equal(identidadeMarca.aro,'rgb(247, 195, 93)',
     'símbolo do LOOP deve ser dourado');
   await page.locator('#akitemmFotoTitular').waitFor({state:'visible'});
   const imagemLoja=await page.locator('#akitemmFotoTitular').evaluate(
    img=>({ok:img.complete&&img.naturalWidth>0,src:img.getAttribute('src')})
   );
   assert.equal(imagemLoja.ok,true,
    'foto do LOOP também deve aparecer na AKITEMM no mesmo titular');
   assert.match(imagemLoja.src,/^\/api\/contas\/foto-perfil/);
   // Botoes internos reais da AKITEMM: dados da conta e avisos.
   await page.locator('#akitemmAbrirConta').click();
   assert.equal(await page.locator('#akitemmDadosConta').isVisible(),true);
   await page.locator('#akitemmDadosContaConteudo').filter({
    hasText:/Nome: Pessoa de Ensaio[\s\S]*E-mail: teste@example.invalid/
   }).waitFor({state:'visible'});
   assert.equal(await page.locator('#akitemmAbrirConta').getAttribute('aria-expanded'),'true');
   await page.locator('#akitemmAbrirConta').click();
   assert.equal(await page.locator('#akitemmDadosConta').isHidden(),true);
   await page.locator('#akitemmSino').click();
   await page.locator('#akitemmNotificacoesConteudo').filter({
    hasText:/E-mail confirmado/
   }).waitFor({state:'visible'});
   assert.equal(await page.locator('#akitemmSino').getAttribute('aria-expanded'),'true');
   await page.locator('#akitemmSino').click();
   assert.equal(await page.locator('#akitemmNotificacoes').isHidden(),true);
   // O convite permanece dentro do mesmo painel retrátil aprovado.
   await page.locator('#tituloDivulgarLojaLoop').click();
   const linkPessoal=page.locator('#enderecoDivulgarLojaLoop');
   assert.match(await linkPessoal.inputValue(),/\/loja\/dozeletrasab$/);
   assert.equal(await page.locator('#copiarDivulgarLojaLoop').isEnabled(),true);
   await page.locator('#copiarDivulgarLojaLoop').click();
   await page.locator('#statusDivulgarLojaLoop').filter({
    hasText:/Link pessoal copiado|Link selecionado/
   }).waitFor({state:'visible'});
   await page.locator('#akitemmMeusCursos summary').click();
   await page.locator('#akitemmAtualizarMeusCursos').click();
   await page.locator('#akitemmListaMeusCursos').filter({
    hasText:/nenhum arquivo foi liberado|Biblioteca indisponível|Arquivos digitais|arquivos digitais/i
   }).waitFor({state:'visible'});
   // Rodape tem conteudo real e documento vigente, sem inventar politicas.
   await page.locator('[data-akitemm-informacao="sobre"]').click();
   assert.match(await page.locator('#akitemmInformacaoConteudo').innerText(),
    /Loja Oficial conectada ao Escritório/);
   await page.locator('#akitemmModalInformacao [aria-label="Fechar"]').click();
   await page.locator('[data-akitemm-informacao="privacidade"]').click();
   await page.locator('#akitemmInformacaoConteudo').filter({
    hasText:/LOOP-PRIVACIDADE-2026/
   }).waitFor({state:'visible'});
   await page.locator('#akitemmModalInformacao [aria-label="Fechar"]').click();
   await page.locator('[data-akitemm-informacao="trocas"]').click();
   assert.match(await page.locator('#akitemmInformacaoConteudo').innerText(),
    /política comercial de trocas e devoluções ainda não foi publicada/i);
   await page.locator('#akitemmModalInformacao [aria-label="Fechar"]').click();
   await page.locator('[data-akitemm-informacao="contato"]').click();
   assert.equal(await page.locator('#akitemmSuporte').getAttribute('open'),'');
   assert.equal(await page.locator('#registrarPedidoLoja').isDisabled(),true);
   assert.equal(await page.locator('#akitemmBusca').isDisabled(),false);
   assert.match(await page.locator('#statusPedidoLoja').innerText(),
    /checkout real ainda não foi liberado/i);
   // As dez abas e as molduras são a vitrine aprovada,
   // sem produtos fictícios nem checkout.
   await page.locator('#akitemmAbasProdutos button').first().waitFor({state:'visible'});
   assert.equal(await page.locator('#akitemmAbasProdutos button').count(),10);
   // Controles de leitura respondem mesmo sem produtos publicados.
   assert.equal(await page.locator('#akitemmFiltroOfertas').isDisabled(),false);
   await page.locator('#akitemmFiltroOfertas').click();
   assert.equal(await page.locator('#akitemmFiltroOfertas').getAttribute('aria-pressed'),'true');
   assert.equal((await page.locator('#akitemmResultadoProdutos').innerText()).trim(),'',
    'a vitrine não exibe a mensagem de ausência de ofertas');
   assert.equal(await page.locator('#catalogoLojaLoop .akitemm-slot-vazio').count(),20);
   await page.locator('#akitemmFiltroTodos').click();
   for(const cor of ['CINZA','VERDE','DOURADO','ROXO']){
    const filtro=page.locator('[data-akitemm-cor="'+cor+'"]');
    assert.equal(await filtro.isDisabled(),false);
    await filtro.click();
    assert.equal(await filtro.getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#catalogoLojaLoop .akitemm-slot-vazio').count(),20);
    await page.locator('#akitemmFiltroTodos').click();
   }
   for(const categoria of ['cursos','fisicos','novidades','mais-vendidos']){
    const filtro=page.locator('[data-akitemm-categoria="'+categoria+'"]');
    assert.equal(await filtro.isDisabled(),false);
    await filtro.click();
    assert.equal(await filtro.getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#catalogoLojaLoop .akitemm-slot-vazio').count(),20);
    await page.locator('#akitemmFiltroTodos').click();
   }
   assert.equal(await page.locator('#akitemmAbasProdutos button').count(),10);
   assert.equal(await page.locator('#catalogoLojaLoop .ak-faixa-horizontal').count(),2);
   assert.equal(await page.locator('#catalogoLojaLoop .akitemm-slot-vazio').count(),20);
   assert.equal(await page.locator('#catalogoLojaLoop [data-produto-id]').count(),0);
   const cartoes=await page.evaluate(()=>{
    const faixa=document.querySelector('#catalogoLojaLoop .ak-faixa-horizontal');
    const lista=[...faixa.querySelectorAll('.produto-loja-loop')].slice(0,4)
      .map(el=>{
       const r=el.getBoundingClientRect();
       return {left:r.left,top:r.top,width:r.width,height:r.height};
      });
    const largura=faixa.getBoundingClientRect().width;
    return {lista,largura,larguraTela:innerWidth,
     larguraDocumento:document.documentElement.scrollWidth};
   });
   assert.equal(cartoes.lista.length,4);
   if(item.largura<=900){
    assert.ok(cartoes.lista.every(c=>c.width>=cartoes.largura-14),
     'no celular cada quadrinho usa toda a largura da fileira');
    for(let i=1;i<4;i++)assert.ok(
     cartoes.lista[i].top>=cartoes.lista[i-1].top+cartoes.lista[i-1].height,
     'no celular os quadrinhos ficam um abaixo do outro');
   }else{
    for(let i=1;i<4;i++){
     assert.ok(Math.abs(cartoes.lista[i].top-cartoes.lista[0].top)<3,
      'no computador os quadrinhos ficam na mesma fileira');
     assert.ok(cartoes.lista[i].left>cartoes.lista[i-1].left,
      'no computador os quadrinhos ficam lado a lado');
    }
   }
   assert.ok(cartoes.larguraDocumento<=cartoes.larguraTela+1,
    'vitrine sem transbordamento horizontal');
   await page.locator('#akitemmCarregarMais').click();
   assert.equal(await page.locator('#catalogoLojaLoop .ak-faixa-horizontal').count(),4);
   assert.equal(await page.locator('#catalogoLojaLoop .akitemm-slot-vazio').count(),40);
   await page.locator('#akitemmAbasProdutos button').nth(9).click();
   assert.equal(await page.locator('#catalogoLojaLoop .akitemm-slot-vazio').first()
    .getAttribute('data-akitemm-slot'),'361');
   assert.equal(await page.locator('#akitemmAbasProdutos button[aria-current="page"]')
    .innerText(),'10');
   await page.locator('#akitemmAbasProdutos button').first().click();
   await page.locator('#akitemmCarregarMais').click();
   assert.equal(await page.locator('#catalogoLojaLoop .akitemm-slot-vazio').count(),20);
   assert.match(await page.locator('#estadoLojaLoop').innerText(),
    /capacidade técnica da sua conta.*Checkout e pagamentos reais ainda não habilitados/i);
   await page.screenshot({
    path:path.join(pasta,'identidade-real-loja-'+item.nome+'.png'),
    fullPage:true
   });
   await page.locator('a.akitemm-voltar').click();
   await page.waitForURL(url=>url.pathname==='/minha-conta');
   await page.locator('#painelConta').waitFor({state:'visible'});
   // Ativar operador na mesma sessao de navegador e garantir que
   // nenhum dado de titular seja apresentado como propriedade dele.
   await contexto.addCookies([{
    name:COOKIE_ADMIN,value:admin.token,url:base,
    httpOnly:true,secure:true,sameSite:'Strict'
   }]);
   await page.goto(base+'/escritorio',{waitUntil:'domcontentloaded'});
   await page.locator('#loopOperadorAtalhos').waitFor({state:'visible'});
   assert.equal(await page.locator('#loop03NickIntegrado').innerText(),'OPERADOR');
   assert.equal(await page.locator('#loopAcessoAdminMenu').getAttribute('hidden'),null);
   assert.equal(await page.locator('#abaConta').isDisabled(),false);
   await page.goto(base+'/loja?visao=operador');
   await page.locator('#akitemmNomeTitular').filter({hasText:'OPERADOR'}).waitFor();
   assert.equal(await page.locator('#copiarDivulgarLojaLoop').isDisabled(),true,
    'operador nunca recebe link privado de titular anterior');
   assert.equal(await page.locator('#enderecoDivulgarLojaLoop').inputValue(),'');
   await page.locator('#akitemmAbrirConta').click();
   assert.match(await page.locator('#akitemmDadosContaConteudo').innerText(),
    /Sessão do operador/);
   assert.equal(await page.locator('#akitemmEditarConta').getAttribute('href'),'/administrador');
   await page.locator('#akitemmAbrirConta').click();
   assert.equal(await page.locator('footer .akitemm-acesso-operador').getAttribute('hidden'),null);
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
   await pagina.locator('#loop03TotalIntegrado').filter({
    hasText:String(diagnostico.quantidadePosicoes)+' / 10'
   }).waitFor();
   assert.equal(await pagina.locator('#loopEstadoIntegrado').count(),0);
   if(visual.mobile)await pagina.locator('#loop03MenuIntegrado').click();
   await pagina.locator('#abaMeusPedidos').click();
   await pagina.locator('#listaPedidos').filter({hasText:compra.pedidoId}).waitFor();
   assert.match(await pagina.locator('#listaPedidos').innerText(),
    /Aprovado para expedição/);
   assert.equal(await pagina.locator('.indicadores-cliente').count(),0);
   assert.equal(await pagina.locator('.loop03-indicadores .loop03-indicador').count(),3);
   assert.equal(await pagina.locator('#loop03TotalIntegrado').innerText(),
    String(diagnostico.quantidadePosicoes)+' / 10');
   assert.ok((await pagina.locator('#pedidosPaginacao').innerText())
    .includes('Página 1 · 1 pedido(s) no histórico'));
   assert.equal(await pagina.locator('#pedidosAnterior').isDisabled(),true);
   assert.equal(await pagina.locator('#pedidosProximo').isDisabled(),true);
   assert.equal(await pagina.locator('#pedidosResumo').innerText(),'1 pedido no histórico');
   assert.equal(await pagina.locator('#conteudoMeusPedidos #atualizarPedidos').isVisible(),true);
   await pagina.locator('#listaPedidos .loop03-pedido-remessas > summary').click();
   assert.equal(await pagina.locator('#listaPedidos .loop03-pedido-remessas[open]').count(),1);
   assert.ok((await pagina.locator('#listaPedidos .loop03-pedido-remessas').innerText())
    .includes('Fornecedor'));
   const estiloNavegacao=await pagina.locator('#conteudoMeusPedidos .loop03-pedidos-paginacao')
    .evaluate(el=>getComputedStyle(el).display);
   assert.equal(estiloNavegacao,'grid',
    'a navegação de pedidos não pode empilhar botões grandes');
   if(visual.mobile)await pagina.locator('#loop03MenuIntegrado').click();
   await pagina.locator('#abaPosicoes').click();
   const confirmarAzul=pagina.locator('#posicoesPainel form.loop03-aceite-posicao');
   const aguardados=visual.mobile?1:2;
   // O controle fica recolhido para conservar os três cartões por fileira.
   // A confirmação individual só pode ser tocada após a expansão.
   await pagina.locator('#posicoesPainel .loop03-controles-cpf-termos')
    .filter({has:pagina.locator('form.loop03-aceite-posicao')})
    .first().locator(':scope > summary').click();
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
   await pagina.locator('#motorContadorEventos').filter({
    hasText:/de 6 eventos neste ciclo/
   }).waitFor();
   assert.equal(await pagina.locator('#estadoTabuleiroIntegrado').isHidden(),true,
    'mensagem do rodapé só reaparece diante de erro real');
   assert.equal(await pagina.locator('#motorContadorEventos').innerText(),
    motorLoop.consultar().tabuleiro.eventosNoCiclo+' de 6 eventos neste ciclo');
   const centroPersistido=estadoCliente.tabuleiro?.centro;
   const centroEsperado=centroPersistido?
    (centroPersistido.dourada? 
     (centroPersistido.numeroVisual?'#'+centroPersistido.numeroVisual:'●'):
     '#'+centroPersistido.numero):'';
   assert.equal(await pagina.locator('#tabuleiroMotorCentro').innerText(),
    centroEsperado,'centro segue o estado do motor, nao um valor fixo');
   assert.equal(await pagina.locator('#motorBolinha6')
    .evaluate(el=>el.classList.contains('loop03-marcador-aceso')),false);
   assert.equal(await pagina.locator('#motorFilaB .loop03-linha-fila').count(),
    estadoCliente.filaB,'fila deve refletir a contagem real, sem limite fixo de uma pessoa');
   await pagina.screenshot({
    path:path.join(pasta,'integrado-tabuleiro-'+visual.nome+'.png'),
    fullPage:true
   });
   await pagina.goto(base+'/loja');
   await pagina.waitForFunction(()=>document.getElementById('copiarDivulgarLojaLoop')?.disabled===false);
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
   assert.equal(await pagina.locator('#catalogoLojaLoop .produto-loja-loop[data-produto-id]').count(),1);
   // Mesmo cadastro de entrega do operador, habilitado somente para cliente.
   const diagnosticoEntrega=await pagina.evaluate(async()=>{
    const m=await fetch('/api/contas/me',{credentials:'same-origin'});
    const d=m.ok?await m.json():null;
    const op=await fetch('/api/operador/estado',{
     credentials:'same-origin'
    }).then(r=>r.json());
    return {
     inputDisabled:document.querySelector('#akitemmFormEntrega input[name=cep]')?.disabled,
     botaoDisabled:document.querySelector('#akitemmFormEntrega button[type=submit]')?.disabled,
     status:document.querySelector('#akitemmStatusEntrega')?.textContent,
     cliente:m.status===200,csrfPresente:typeof d?.csrf==='string',
     operador:op.operador===true
    };
   });
   assert.equal(await pagina.locator(
    '#akitemmFormEntrega input[name=cep]').isEnabled(),true,
    'Campo de CEP precisa funcionar como cliente: '+
     JSON.stringify(diagnosticoEntrega));
   assert.equal(await pagina.locator(
    '#akitemmFormEntrega button[type=submit]').isEnabled(),true);
   assert.equal(await pagina.locator('#registrarPedidoLoja').isDisabled(),true);
   const verificacaoInvalida=await pagina.evaluate(async()=>{
    const me=await (await fetch('/api/contas/me',{
     credentials:'same-origin'
    })).json();
    const resp=await fetch('/api/loja/entrega/verificar-cep',{
     method:'POST',headers:{'Content-Type':'application/json',
      'X-Loop-Csrf':me.csrf},
     credentials:'same-origin',body:JSON.stringify({cep:'invalid'})
    });
    return {status:resp.status,dados:await resp.json()};
   });
   assert.equal(verificacaoInvalida.status,400);
   assert.equal(verificacaoInvalida.dados.checkoutReal,false);
   await pagina.locator('#catalogoLojaLoop .produto-loja-loop[data-produto-id] button').click();
   assert.match(await pagina.locator('#akitemmProdutoInlineConteudo').innerText(),
    /Frete e compra dependem da integração comercial/);
   // Aparência idêntica para produto próprio e produto de terceiro.
   const textoVitrine=await pagina.locator(
    '#catalogoLojaLoop .produto-loja-loop[data-produto-id]'
   ).first().innerText();
   assert.doesNotMatch(textoVitrine,/Produto próprio|Fornecedor próprio/);
   // Interface real da restrição regional: a tarja só aparece APÓS CEP.
   // O servidor valida geografia separadamente; este mock prova somente a tela.
   await pagina.locator('#akitemmEntrega summary').click();
   await pagina.route('**/api/loja/entrega/verificar-cep',route=>
    route.fulfill({status:422,contentType:'application/json',
     body:JSON.stringify({
      entregaDisponivel:false,produtosForaDaRegiao:['produto-um'],
      checkoutReal:false,autorizaCobranca:false
     })})
   );
   await pagina.evaluate(()=>{
    const form=document.getElementById('akitemmFormEntrega');
    const campos={
     destinatario:'Pessoa Teste',cep:'20010000',
     logradouro:'Rua Teste',numero:'10',bairro:'Centro',
     cidade:'Rio de Janeiro',uf:'RJ',telefone:'11999999999'
    };
    for(const [nome,valor] of Object.entries(campos)){
     const input=form.elements.namedItem(nome);
     if(input)input.value=valor;
    }
    form.requestSubmit();
   });
   await pagina.locator('#akitemmStatusEntrega.akitemm-alerta-regiao')
    .filter({hasText:'não está disponível para entrega'}).waitFor();
   assert.equal(await pagina.locator('#akitemmStatusEntrega').getAttribute('role'),'alert');
   assert.equal(await pagina.locator('#registrarPedidoLoja').isDisabled(),true);
   await pagina.locator('#akitemmFormEntrega input[name=cep]').fill('27213000');
   assert.equal(await pagina.locator('#akitemmStatusEntrega').evaluate(
    el=>el.classList.contains('akitemm-alerta-regiao')),false);
   await pagina.unroute('**/api/loja/entrega/verificar-cep');
   // Carrinho interno no banco REAL: adicionar, atualizar quantidade,
   // recarregar a loja e esvaziar, sem criar um pedido ou pagamento.
   await pagina.locator('#akitemmProdutoInlineConteudo button[aria-label^="Adicionar "]').click();
   await pagina.locator('#akitemmTotalItens').filter({hasText:'1'})
    .waitFor({state:'visible'});
   assert.equal(await pagina.locator('#itensLojaLoop .item-carrinho-loja').count(),1);
   assert.match(await pagina.locator('#totalLojaLoop').innerText(),/Aguardando cotação/);
   const antes=await pagina.evaluate(()=>fetch('/api/loja/carrinho',{
    credentials:'same-origin',cache:'no-store'
   }).then(r=>r.json()));
   assert.equal(antes.quantidadeTotal,1);
   assert.equal(antes.financeiroReal,false);
   assert.equal(antes.checkoutReal,false);
   await pagina.reload();
   await pagina.locator('#itensLojaLoop .item-carrinho-loja').waitFor({
    state:'visible'
   });
   assert.equal(await pagina.locator('#akitemmTotalItens').innerText(),'1');
   await pagina.locator('#itensLojaLoop [aria-label^="Aumentar quantidade"]').click();
   await pagina.locator('#akitemmTotalItens').filter({hasText:'2'}).waitFor();
   await pagina.locator('#itensLojaLoop [aria-label^="Reduzir quantidade"]').click();
   await pagina.locator('#akitemmTotalItens').filter({hasText:'1'}).waitFor();
   await pagina.locator('#akitemmLimparCarrinho').click();
   await pagina.locator('#akitemmTotalItens').filter({hasText:'0'}).waitFor();
   assert.equal(await pagina.locator('#itensLojaLoop .item-carrinho-loja').count(),0);
   assert.equal(await pagina.locator('#registrarPedidoLoja').isDisabled(),true);
   await pagina.locator('#catalogoLojaLoop .produto-loja-loop[data-produto-id] button').click();
   await pagina.locator('#akitemmVoltarProdutos').click();
   await pagina.locator('#akitemmBusca').fill('inexistente xyz');
   await pagina.locator('#akitemmResultadoProdutos').filter({
    hasText:/Nenhum produto encontrado/
   }).waitFor();
   assert.equal(await pagina.locator('#catalogoLojaLoop .produto-loja-loop[data-produto-id]')
    .count(),0);
   await pagina.locator('#akitemmFiltroTodos').click();
   await pagina.locator('[data-akitemm-cor="DOURADO"]').click();
   assert.equal(await pagina.locator('#catalogoLojaLoop .produto-loja-loop[data-produto-id]')
    .count(),1);
   await pagina.locator('#atualizarCatalogoLoja').click();
   await pagina.locator('#akitemmFiltroTodos').click();
   await pagina.locator('[data-akitemm-categoria="novidades"]').click();
   assert.equal(await pagina.locator('#catalogoLojaLoop .produto-loja-loop[data-produto-id]').count(),1);
   await pagina.locator('#akitemmFiltroTodos').click();
   await pagina.locator('[data-akitemm-categoria="mais-vendidos"]').click();
   assert.equal(await pagina.locator('#catalogoLojaLoop .produto-loja-loop[data-produto-id]').count(),1);
   await pagina.locator('#akitemmFiltroTodos').click();
   assert.equal(await pagina.locator('#catalogoLojaLoop .produto-loja-loop[data-produto-id]')
    .count(),1);
   assert.equal(await pagina.locator('#registrarPedidoLoja').isDisabled(),true);
   assert.equal(await pagina.locator('#akitemmBusca').isEnabled(),true);
   await pagina.screenshot({
    path:path.join(pasta,'integrado-loja-'+visual.nome+'.png'),
    fullPage:true
   });
   // Cliente permanece cliente ate que o cookie administrativo seja validado.
   await contexto.addCookies([{
    name:COOKIE_ADMIN,value:admin.token,url:base,
    httpOnly:true,secure:true,sameSite:'Strict'
   }]);
   await pagina.goto(base+'/escritorio');
   await pagina.locator('#loopOperadorAtalhos').waitFor({state:'visible'});
   assert.equal(await pagina.locator('#loop03NickIntegrado').innerText(),'OPERADOR');
   assert.equal(await pagina.locator('#abaFinanceiro').isDisabled(),false);
   assert.equal(await pagina.locator('#loopAcessoAdminMenu').getAttribute('hidden'),null);
   await pagina.goto(base+'/loja?visao=operador');
   await pagina.locator('#akitemmNomeTitular').filter({hasText:'OPERADOR'}).waitFor();
   assert.equal(await pagina.locator('footer .akitemm-acesso-operador').getAttribute('hidden'),null);
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
