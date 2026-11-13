'use strict';
// Vitrine visual APROVADA servida no candidato LOCAL, não no servidor comercial.
// Código original de loja preservado; apenas a cópia de laboratório usa SQLite
// das mesmas contas, produtos, pré-pedidos e Escritórios.
const fs=require('node:fs'),path=require('node:path');
const express=require('express');
const {entradaValida,cotarCheckoutPublico}=require('../domain/cotacao-checkout-publico');
const {SinalizacaoVitrineCandidatoSQLite}=require('../domain/sinalizacao-vitrine-candidato-sqlite');
const {OfertasCompostasCandidatoSQLite}=require('../domain/ofertas-compostas-candidato-sqlite');
const {CustosProdutoAdminCandidatoSQLite}=require('../domain/custos-produtos-admin-candidato-sqlite');
const {LivroLuzesFinanceirasCandidatoSQLite}=require('../domain/livro-luzes-financeiras-candidato-sqlite');
const {simularQualificacaoCandidato}=require('../domain/simulador-qualificacao-carrinho-candidato');
const {consultarPedido}=require('../domain/relatorio-homologacao-checkout-staging');
const DIR=path.join(__dirname,'../laboratorio');
function fail(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function createVitrineCandidata({app,banco,catalogo,contas,intencoes,prePedidos,autorizarOperador,novidades,enderecoEntrega,configLoja,materialPdf,videoProduto,fotosProduto,avaliacoes}={}){
 if(process.env.NODE_ENV==='production')fail('VITRINE_LAB_NAO_HOMOLOGADA');
 if(!app?.get||!app?.post||!app?.patch||catalogo?.db!==banco||
    typeof contas?.sessao!=='function'||typeof prePedidos?.preparar!=='function'||
    typeof intencoes?.criar!=='function'||typeof autorizarOperador!=='function'||
    novidades?.banco!==banco||enderecoEntrega?.banco!==banco||
    configLoja?.banco!==banco)
  fail('INTEGRACAO_VITRINE_INCOMPLETA');
 const sinalizacao=new SinalizacaoVitrineCandidatoSQLite({banco,catalogo});
 const ofertasCompostas=new OfertasCompostasCandidatoSQLite({banco,catalogo});
 sinalizacao.ofertasCompostas=ofertasCompostas;
 // Mesma base de checkout, catálogo, custos internos, fila e escritorio.
 const custosProduto=new CustosProdutoAdminCandidatoSQLite({banco,catalogo,sinalizacao});
 const livroLuzes=new LivroLuzesFinanceirasCandidatoSQLite({banco});
 sinalizacao.custosProduto=custosProduto;
 sinalizacao.livroLuzes=livroLuzes;
 // Todas as novas rotas de pré-pedido usam o mesmo registro transacional.
 prePedidos.definirFotografiaClassificacao(args=>{
  // Mesmo COMMIT do prepedido: classificação + endereço físico cifrado.
  const escolha=args.ofertaCompostaCotada;
  const opcoes=escolha===undefined?{}:
   escolha===null?{ofertaId:null}:
   {ofertaId:escolha.id,revisaoEsperada:escolha.revisao};
  const fotografia=sinalizacao.gravarFotografiaPrepedido({
   ...args,ofertasCompostas:ofertasCompostas.fotografar(args.itens,opcoes)
  });
  enderecoEntrega.vincularPrepedido(args);
  // Congela custos e referencia das posicoes no MESMO COMMIT do checkout.
  // Mudancas futuras do cadastro nao reescrevem pedidos antigos.
  livroLuzes.congelarCustosPedido({...args,fotografia});
  // Mesmo COMMIT: cada PDF entregue fica vinculado a versao imutavel.
  materialPdf.vincularPedido(args);
  return fotografia;
 });
 const sessao=req=>contas.sessao(req);
 const csrf=req=>contas.autorizarMutacao(req);
 const autorizarCliente=(req,res,next)=>{
  if(process.env.NODE_ENV==='production')
   return res.status(503).json({erro:'VITRINE_NAO_HOMOLOGADA'});
  const s=sessao(req);
  if(!s)return res.status(401).json({erro:'SESSAO_AUSENTE'});
  req.titularVitrine=s.titularId;next();
 };
 // Não altera HTML nem CSS do site comercial. URLs só da cópia de teste.
 const original=fs.readFileSync(path.join(DIR,'loja-cliente-demo.html'),'utf8');
 const html=original
  .replace('href="/escritorio"','href="/staging/cliente"')
  .replace('href="/laboratorio/loja.css"','href="/staging/assets/loja-aprovada.css"')
  .replace('src="/laboratorio/educacao-carrinho.js"',
   'src="/staging/assets/educacao-carrinho.js"')
  .replace('src="/laboratorio/loja.js"','src="/staging/assets/loja-aprovada.js"')
  .replace('<main class="loja-loop">',
   '<main class="loja-loop"><p class="akitemm-estado">PRÉVIA LOCAL: sem pagamentos, posições, bônus, entregas ou giros reais. As cores são demonstrativas.</p>')
  .replace('<div id="catalogoLojaLoop" class="produtos-loja-loop"></div>',
   '<section id="akitemmPacotesCompostos" aria-label="Pacotes com vários produtos" hidden>'+
   '<h3>Pacotes combinados</h3><p>Escolha o conjunto de produtos configurado pela loja, sem cobrança real.</p>'+
   '<div id="akitemmGradePacotes" class="produtos-loja-loop"></div></section>'+
   '<div id="catalogoLojaLoop" class="produtos-loja-loop"></div>')
  .replace('<p id="orientacaoMinimoLoop" role="status"></p>',
   '<p id="orientacaoMinimoLoop" role="status"></p><p id="akitemmAnaliseQualificacao" role="status" class="akitemm-regra-referencia">Simulação sem benefícios financeiros; adicione itens para conferir.</p>');
 if(original===html||html.includes('src="/laboratorio/loja.js"'))
  fail('MARCADOR_HTML_VITRINE_DESATUALIZADO');
 const origemJs=fs.readFileSync(path.join(DIR,'loja-cliente-demo.js'),'utf8');
 const ant="headers:body===undefined?{}:{'Content-Type':'application/json','X-LOOP-LAB':'participante'},";
 const novo="headers:body===undefined?{}:{'Content-Type':'application/json','X-LOOP-LAB':'participante',\n   'X-Checkout-Csrf':csrfCandidato||'',...(caminho==='loja/pedidos'?{\n   'Idempotency-Key':chavePedidoCandidato||(chavePedidoCandidato='vitrine-'+crypto.randomUUID())}:{})},";
 const marcador="adicional.textContent=(p.eventoTitulo||'Evento')+' · De '+(p.dataInicio||'—')+' até '+(p.dataFim||'—')+' · '+p.posicoesPorPedidoLoop+' posições';";
 if(!origemJs.includes(ant)||!origemJs.includes(marcador)||
    !origemJs.includes('const catalogo=[],carrinho=new Map();')||
    !origemJs.includes('const data=await response.json();')||
    !origemJs.includes("const classe=corDoProduto(p),especial=classe==='ROXO';"))
  fail('CONTRATO_JS_VITRINE_MUDOU_REVISAR_ADAPTADOR');
 const js=origemJs
  .replace("fetch('/api/laboratorio/participante/'+caminho,{",
   "fetch('/staging/vitrine/'+caminho,{")
  .replace('const catalogo=[],carrinho=new Map();',
   'const catalogo=[],carrinho=new Map();let csrfCandidato=null,chavePedidoCandidato=null,ofertasCompostas=[],pacoteEscolhido=null;')
  .replace(ant,novo)
  .replace('const data=await response.json();',
   "const data=await response.json();\n  if(caminho==='minha-conta'&&response.ok){csrfCandidato=data.csrf||null;atualizarPreviaQualificacao();}\n  if(caminho==='loja/pedidos'&&(response.ok||[400,409].includes(response.status)))chavePedidoCandidato=null;")
  .replace('function atualizarCarrinho(){',"let seqPrevia=0;\n async function atualizarPreviaQualificacao(){\n  const id=++seqPrevia;\n  const campo=el('akitemmAnaliseQualificacao');\n  if(!campo)return;\n  if(!carrinho.size){campo.textContent='Prévia de laboratório. Adicione produtos; nenhuma posição será criada.';return;}\n  if(!csrfCandidato){campo.textContent='Conferindo sessão para simulação...';return;}\n  try{\n   const response=await fetch('/staging/vitrine/simular-qualificacao',{\n    method:'POST',credentials:'same-origin',cache:'no-store',\n    headers:{'Content-Type':'application/json','X-LOOP-LAB':'participante',\n     'X-Checkout-Csrf':csrfCandidato},\n    body:JSON.stringify({itens:[...carrinho].map(([produtoId,quantidade])=>({produtoId,quantidade})),\n     ofertaCompostaId:pacoteEscolhido?.id||null,\n     ...(pacoteEscolhido?{ofertaCompostaRevisao:pacoteEscolhido.revisao}:{})})\n   });\n   const dados=await response.json();\n   if(id!==seqPrevia)return;\n   campo.textContent=response.ok?dados.mensagem:\n    'Prévia não disponível: '+(dados.erro||response.status)+'. Nenhum benefício foi criado.';\n  }catch{if(id===seqPrevia)campo.textContent='Prévia temporariamente indisponível. Nenhum benefício foi criado.';}\n }\n function atualizarCarrinho(){\n  if(pacoteEscolhido){\n   const escolhido=ofertasCompostas.find(o=>o.id===pacoteEscolhido.id);\n   if(!escolhido||escolhido.revisao!==pacoteEscolhido.revisao||\n      !escolhido.itens.every(i=>(carrinho.get(i.produtoId)||0)>=i.quantidade))\n    pacoteEscolhido=null;\n  }\n  atualizarPreviaQualificacao();")
  .replace("const informacoes=document.createElement('div');informacoes.className='akitemm-detalhe-informacoes';",
   "if(p.videoApresentacaoLocal===true){const video=document.createElement('video');"+
   "video.controls=true;video.preload='metadata';video.playsInline=true;"+
   "video.setAttribute('aria-label','Vídeo de apresentação do produto');"+
   "video.style.width='100%';video.style.maxHeight='360px';"+
   "video.src='/staging/vitrine/loja/produtos/'+encodeURIComponent(p.produtoId)+'/video';"+
   "galeria.append(video);}"+
   "const informacoes=document.createElement('div');informacoes.className='akitemm-detalhe-informacoes';")
  .replace(String.raw`  /^\/imagens\/catalogo\/[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp)$/.test(src);`,
   String.raw`  (/^\/imagens\/catalogo\/[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp)$/.test(src)||`+
   String.raw`/^\/staging\/vitrine\/loja\/produtos\/[a-z0-9-]{3,80}\/foto\/(?:10|[1-9])$/.test(src));`)
  .replace("const caminho='/api/laboratorio/participante/loja/avaliacoes/'+",
   "const caminho='/staging/vitrine/loja/avaliacoes/'+")
  .replace("'X-AKITEMM-MIDIA-TIPO':tipo},body:arquivo});",
   "'X-AKITEMM-MIDIA-TIPO':tipo,'X-Checkout-Csrf':csrfCandidato||''},body:arquivo});")
  .replace('if(quantidade<100)','if(quantidade<50)')
  .replace('if(qtd>=100)','if(qtd>=50)')
  .replace('Máximo de 100 unidades por produto.','Máximo de 50 unidades por produto neste laboratório.')
  .replace("tarja.textContent='EVENTO ESPECIAL'","tarja.textContent='OFERTA ROXA'")
  .replace(marcador,
   "adicional.textContent='Oferta ROXA configurável · sem posições ou benefícios reais';")
  .replace('catalogo.splice(0,catalogo.length,...dados.produtos);',
   'catalogo.splice(0,catalogo.length,...dados.produtos);ofertasCompostas=dados.ofertasCompostas||[];')
  .replace('const assinatura=JSON.stringify([...carrinho]);',
   'const assinatura=JSON.stringify([[...carrinho],pacoteEscolhido?.id||null,pacoteEscolhido?.revisao||null]);')
  .replace('if(assinatura!==assinaturaCarrinhoAnterior){',
   'if(assinatura!==assinaturaCarrinhoAnterior){chavePedidoCandidato=null;')
  .replace('     {itens,participarLoop}:{itens});',
   '     {itens,participarLoop,ofertaCompostaId:pacoteEscolhido?.id||null,...(pacoteEscolhido?{ofertaCompostaRevisao:pacoteEscolhido.revisao}:{})}:{itens,ofertaCompostaId:pacoteEscolhido?.id||null,...(pacoteEscolhido?{ofertaCompostaRevisao:pacoteEscolhido.revisao}:{})});')
  .replace('carrinho.clear();atualizarCarrinho();await carregarPedidos();',
   'carrinho.clear();pacoteEscolhido=null;atualizarCarrinho();await carregarPedidos();')
  .replace('function mostrarCatalogo(){',`
 function renderizarPacotesCompostos(){
  const secao=el('akitemmPacotesCompostos'),grade=el('akitemmGradePacotes');
  grade.replaceChildren();
  const busca=el('akitemmBusca').value.trim().toLowerCase();
  const pacotes=ofertasCompostas.filter(o=>
   (!corFiltro||o.cor===corFiltro)&&
   (filtro==='todos'||filtro==='ofertas'||!!corFiltro)&&
   (!busca||(o.nome+' '+o.itens.map(i=>i.nome).join(' ')).toLowerCase().includes(busca)));
  secao.hidden=pacotes.length===0;
  for(const oferta of pacotes){
   const card=document.createElement('article');
   card.className='produto-loja-loop';
   const corpo=document.createElement('div');corpo.className='akitemm-dados-produto';
   const titulo=document.createElement('h3');titulo.textContent=oferta.nome;
   const resumo=document.createElement('p');resumo.textContent=oferta.itens.map(i=>
    i.quantidade+' × '+i.nome).join(' + ');
   const cor=document.createElement('small');cor.textContent=
    'Quadrado '+oferta.cor+' · '+oferta.posicoesPorPedido+
    ' posição(ões) previstas por pedido qualificado (laboratório)';
   const preco=document.createElement('p');preco.className='preco-loja-loop';
   preco.textContent=dinheiro(oferta.precoPacoteCentavos);
   const botao=document.createElement('button');botao.type='button';
   botao.className='akitemm-adicionar';botao.textContent='Escolher este pacote';
   botao.dataset.akitemmPacote=oferta.id;
   botao.addEventListener('click',()=>{
    const proximo=new Map(carrinho);
    for(const parte of oferta.itens){
     if(!produto(parte.produtoId)){
      el('statusPedidoLoja').textContent='Produto do pacote indisponível; atualize a loja.';return;
     }
     const atual=proximo.get(parte.produtoId)||0;
     if(atual+parte.quantidade>50||(!atual&&proximo.size>=20)){
      el('statusPedidoLoja').textContent='O pacote excede o limite do carrinho; ajuste as quantidades.';return;
     }
     proximo.set(parte.produtoId,atual+parte.quantidade);
    }
    carrinho.clear();
    for(const [id,qtd] of proximo)carrinho.set(id,qtd);
    pacoteEscolhido={id:oferta.id,revisao:oferta.revisao};
    el('statusPedidoLoja').textContent=oferta.nome+' selecionado. Esta oferta define a regra do pacote no pedido.';
    atualizarCarrinho();
   });
   corpo.append(titulo,resumo,cor,preco,botao);card.append(corpo);grade.append(card);
  }
 }
 function mostrarCatalogo(){`)
  .replace("const destino=el('catalogoLojaLoop');destino.replaceChildren();",
   "const destino=el('catalogoLojaLoop');destino.replaceChildren();renderizarPacotesCompostos();");
 app.get('/staging/loja',(req,res)=>{
  if(!sessao(req))return res.redirect(302,'/staging/cliente');
  return res.type('html').send(html);
 });
 app.get('/staging/assets/loja-aprovada.css',(_req,res)=>
  res.type('css').sendFile(path.join(DIR,'loja-cliente-demo.css')));
 app.get('/staging/assets/educacao-carrinho.js',(_req,res)=>
  res.type('js').sendFile(path.join(DIR,'educacao-carrinho-loop-v6.js')));
 app.get('/staging/assets/loja-aprovada.js',(_req,res)=>
  res.type('js').send(js));
 app.get('/staging/vitrine/minha-conta',autorizarCliente,(req,res)=>{
  const p=contas.perfil(req.titularVitrine);
  return res.json({perfil:{nome:p.nome,temFoto:false},
   conta:{nick:p.nick},csrf:sessao(req).csrf,laboratorio:true});
 });
 // Mesmo site original. Publicações opcionais da seção Novidades.
 app.get('/staging/vitrine/novidades',autorizarCliente,(_req,res)=>{
  try{return res.json({itens:novidades.listar({publicadas:true}),
   semBeneficioAutomatico:true});}
  catch(e){return res.status(503).json({erro:e.codigo||'NOVIDADES_INDISPONIVEIS'});}
 });
 app.get('/staging/vitrine/novidades/:id/imagem',autorizarCliente,(req,res)=>{
  try{
   const r=novidades.imagem({id:Number(req.params.id),publicada:true});
   return res.type(r.mime).set('Cache-Control','private, no-store').send(r.bytes);
  }catch(e){return res.status(404).json({erro:'NOVIDADE_IMAGEM_INDISPONIVEL'});}
 });
 app.get('/staging/vitrine/loja/catalogo',autorizarCliente,
  async(req,res)=>{
   try{
    const lista=(await catalogo.listar()).filter(p=>p.estado==='PUBLICADO');
    const pacotes=await ofertasCompostas.publicas();
    return res.json({produtos:lista.map(p=>({...sinalizacao.decorar(p),
     fotos:[...fotosProduto.listar(p.id).fotos.map(x=>
      '/staging/vitrine/loja/produtos/'+p.id+'/foto/'+x.posicao),...p.fotos],
     videoApresentacaoLocal:videoProduto.estado(p.id).arquivoAnexado})),
     ofertasCompostas:pacotes,
     referenciaLoopCentavos:25000,conviteLoopCheckoutAtivo:false,
     laboratorio:true,posicoesReais:0});
   }catch{return res.status(503).json({erro:'VITRINE_INDISPONIVEL'});}
  });


 app.get('/staging/vitrine/loja/produtos/:id/foto/:posicao',
  autorizarCliente,async(req,res)=>{
   try{
    const p=await catalogo.buscar(req.params.id);
    if(!p||p.estado!=='PUBLICADO')
     return res.status(404).json({erro:'FOTO_NAO_DISPONIVEL'});
    const img=fotosProduto.abrir(p.id,Number(req.params.posicao));
    return res.set({'Cache-Control':'private, no-store',
     'X-Robots-Tag':'noindex, nofollow'}).type(img.mime).send(img.dados);
   }catch(e){return res.status(e.codigo==='FOTO_INTEGRIDADE_INVALIDA'?503:404)
    .json({erro:'FOTO_NAO_DISPONIVEL'});}
  });

 app.get('/staging/vitrine/loja/produtos/:id/video',
  autorizarCliente,async(req,res)=>{
   try{
    const p=await catalogo.buscar(req.params.id);
    if(!p||p.estado!=='PUBLICADO')
     return res.status(404).json({erro:'VIDEO_NAO_DISPONIVEL'});
    const arquivo=videoProduto.abrir(p.id);
    const bytes=arquivo.conteudo;
    const faixa=req.get('range');
    res.set({'Content-Type':'video/mp4','Accept-Ranges':'bytes',
     'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow',
     'Content-Disposition':'inline'});
    if(faixa){
     const m=/^bytes=(\d+)-(\d*)$/.exec(faixa);
     if(!m)return res.status(416).set('Content-Range','bytes */'+bytes.length).end();
     const inicio=Number(m[1]),fim=m[2]?Number(m[2]):bytes.length-1;
     if(!Number.isSafeInteger(inicio)||!Number.isSafeInteger(fim)||
        inicio>=bytes.length||fim<inicio||fim>=bytes.length)
      return res.status(416).set('Content-Range','bytes */'+bytes.length).end();
     res.status(206).set('Content-Range',
      'bytes '+inicio+'-'+fim+'/'+bytes.length);
     return res.send(bytes.subarray(inicio,fim+1));
    }
    return res.send(bytes);
   }catch(e){return res.status(e.codigo==='VIDEO_INTEGRIDADE_INVALIDA'?503:404)
    .json({erro:'VIDEO_NAO_DISPONIVEL'});}
  });

 const simular=async(req,res)=>{
  if(!req.is('application/json')||!req.body||Array.isArray(req.body))
   return res.status(415).json({erro:'JSON_OBRIGATORIO'});
  try{return res.json(await simularQualificacaoCandidato({
   entrada:req.body,catalogo,sinalizacao,ofertasCompostas}));
  }catch(e){return res.status(e.codigo==='PRODUTO_INDISPONIVEL_PARA_COTACAO'?404:400)
   .json({erro:e.codigo||'SIMULACAO_INVALIDA'});}
 };
 app.post('/staging/vitrine/simular-qualificacao',autorizarCliente,(req,res,next)=>{
  if(req.get('x-loop-lab')!=='participante'||!csrf(req))
   return res.status(403).json({erro:'MUTACAO_NAO_AUTORIZADA'});
  next();
 },simular);
 app.post('/staging/escritorio-unificado/simular-qualificacao',
  autorizarOperador,simular);
 app.get('/staging/vitrine/loja/pedidos',autorizarCliente,(req,res)=>{
  try{
   const titularId=req.titularVitrine;
   const pedidos=prePedidos.listar({titularId}).map(p=>{
    // Mesmo estado SQLite lido pelo Escritório e pelo administrador.
    // Leitura não chama o Asaas nem gera posição, bônus ou pagamento.
    const estado=consultarPedido({banco,prepedidoId:p.prepedidoId,titularId});
    if(!estado)fail('PREPEDIDO_SEM_ESTADO_PSP');
    return {
     pedidoId:p.prepedidoId,prepedidoId:p.prepedidoId,itens:p.itens,
     totalCentavos:p.totalCentavos,
     estadoOperacional:estado.estadoOperacional,
     estadoSandbox:estado.estadoSandbox,
     conferenciaPSPConcluida:estado.conferenciaPSPConcluida,
     exigeRevisaoManual:estado.exigeRevisaoManual,
     ultimoStatusPSP:estado.ultimoStatusPSP,
     ultimoGETPSPPersistidoEm:estado.ultimoGETPSPPersistidoEm,
     posicoesPendentesFicticias:estado.posicoesPendentesFicticias,
     posicoesMotorEnsaio:estado.posicoesMotorEnsaio,
     consultaPSPExecutadaNestaLeitura:false,
     posicaoCriada:false,vendaSomenteLoja:true,semCompraReal:true
    };
   });
   return res.json({pedidos,laboratorio:true,pagamentoReal:false});
  }catch{return res.status(503).json({erro:'PEDIDOS_INDISPONIVEIS'});}
 });
 app.post('/staging/vitrine/loja/pedidos',autorizarCliente,
  async(req,res)=>{
   if(req.get('x-loop-lab')!=='participante'||!csrf(req))
    return res.status(403).json({erro:'MUTACAO_NAO_AUTORIZADA'});
   if(!req.is('application/json')||!req.body||Array.isArray(req.body)||
      typeof req.body!=='object'||Object.keys(req.body).some(k=>
       !['itens','ofertaCompostaId','ofertaCompostaRevisao'].includes(k)))
    return res.status(400).json({erro:'CORPO_PEDIDO_INVALIDO'});
   const key=req.get('idempotency-key');
   if(typeof key!=='string'||!/^[a-zA-Z0-9_-]{16,128}$/.test(key))
    return res.status(400).json({erro:'CHAVE_IDEMPOTENCIA_OBRIGATORIA'});
   try{
    const entrada={itens:entradaValida({itens:req.body.itens}).map(x=>({
     produtoId:x.produtoId,quantidade:x.quantidade
    })),
     ...(Object.hasOwn(req.body,'ofertaCompostaId')?
      {ofertaCompostaId:req.body.ofertaCompostaId}:{}),
     ...(Object.hasOwn(req.body,'ofertaCompostaRevisao')?
      {ofertaCompostaRevisao:req.body.ofertaCompostaRevisao}:{})};
    let intent=intencoes.consultarPorChave({
     titularId:req.titularVitrine,chaveIdempotencia:key,entrada});
    if(!intent){
     const cotacao=await cotarCheckoutPublico({
      repositorio:catalogo,entrada:{itens:entrada.itens}});
     const pacotes=ofertasCompostas.fotografar(cotacao.itens,{
      ofertaId:entrada.ofertaCompostaId,
      revisaoEsperada:entrada.ofertaCompostaRevisao??null});
     // O servidor persiste a escolha/revisao na cotacao imutavel,
     // nao apenas na sessao nem em estado mutavel da vitrine.
     const cotacaoComEscolha={...cotacao,
      ofertaCompostaCotada:pacotes.length?
       {id:pacotes[0].id,revisao:pacotes[0].revisao}:null};
     intent=intencoes.criar({
      titularId:req.titularVitrine,chaveIdempotencia:key,
      entrada,cotacao:cotacaoComEscolha
     }).intencao;
    }
    const r=await prePedidos.preparar({
     titularId:req.titularVitrine,rascunhoId:intent.pedidoId,
     repositorioCatalogo:catalogo});
    return res.status(r.repetido?200:201).json({
     pedido:{pedidoId:r.prepedido.prepedidoId,
      totalCentavos:r.prepedido.totalCentavos,participarLoop:false,
      posicoesReais:0},repetido:r.repetido,pagamentoReal:false,
     posicoesCriadas:0,semCompraReal:true});
   }catch(e){
    return res.status(['CHAVE_IDEMPOTENCIA_CONFLITANTE',
     'CATALOGO_ALTERADO_REFAZER_COTACAO',
     'OFERTA_COMPOSTA_ALTERADA_REFAZER_COTACAO'].includes(e.codigo)?409:
     e.codigo==='OFERTA_COMPOSTA_NAO_DISPONIVEL_NO_CARRINHO'?409:
     e.codigo==='PRODUTO_INDISPONIVEL_PARA_COTACAO'?404:400)
     .json({erro:e.codigo||'PEDIDO_INVALIDO',pagamentoReal:false});
   }
  });
 app.get('/staging/vitrine/loja/avaliacoes/pendentes',
  autorizarCliente,(req,res)=>res.json(avaliacoes.itensAvaliaveis(req.titularVitrine)));
 app.get('/staging/vitrine/loja/entrega',autorizarCliente,(req,res)=>{
  try{return res.json(enderecoEntrega.consultar(req.titularVitrine));}
  catch{return res.status(503).json({erro:'ENDERECO_CONSULTA_INDISPONIVEL'});}
 });
 app.post('/staging/vitrine/loja/entrega',autorizarCliente,(req,res)=>{
  if(req.get('x-loop-lab')!=='participante'||!csrf(req))
   return res.status(403).json({erro:'MUTACAO_NAO_AUTORIZADA'});
  if(!req.is('application/json'))
   return res.status(415).json({erro:'JSON_OBRIGATORIO'});
  try{return res.json(enderecoEntrega.salvar(req.titularVitrine,req.body));}
  catch(e){return res.status(400).json({erro:e.codigo||'ENDERECO_INVALIDO'});}
 });
 app.get('/staging/vitrine/meus-links',autorizarCliente,(req,res)=>{
  // Fonte unica de identidade: o link da loja usa o mesmo nick do Escritório.
  // Só atribui cadastros de LAB pelo gateway assinado, nunca bonificação real.
  try{
   const perfil=contas.perfil(req.titularVitrine);
   return res.json({ativo:true,linkLoja:'/loja/'+perfil.nick,
    linkEscritorio:'/escritorio/'+perfil.nick,apelido:perfil.nick,
    apenasEnsaio:true,indicadoQualificado:false,semComissaoReal:true});
  }catch{return res.status(503).json({erro:'LINK_INDICACAO_INDISPONIVEL'});}
 });
 app.get('/staging/vitrine/loja/config',autorizarCliente,(_req,res)=>{
  try{
   const c=configLoja.consultarComRevisao();
   return res.json({config:c.config,revisao:c.revisao,
    apenasEnsaio:true,semOfertasComerciais:true});
  }catch{return res.status(503).json({erro:'CONFIG_LOJA_INDISPONIVEL'});}
 });
 app.get('/staging/vitrine/loja/avaliacoes/midias/:id',
  autorizarCliente,(req,res)=>{
   try{
    const x=avaliacoes.abrirMidia({
     id:Number(req.params.id),titularId:req.titularVitrine
    });
    return res.set({'Cache-Control':'private, no-store',
     'X-Robots-Tag':'noindex, nofollow'}).type(x.mime).send(x.bytes);
   }catch{return res.status(404).json({erro:'MIDIA_NAO_ENCONTRADA'});}
  });
 app.get('/staging/vitrine/loja/avaliacoes/:produtoId',
  autorizarCliente,async(req,res)=>{
   const p=await catalogo.buscar(req.params.produtoId);
   if(!p||p.estado!=='PUBLICADO')
    return res.status(404).json({erro:'PRODUTO_NAO_ENCONTRADO'});
   try{return res.json(avaliacoes.publicadas(p.id));}
   catch{return res.status(400).json({erro:'AVALIACOES_INDISPONIVEIS'});}
  });
 app.post('/staging/vitrine/loja/avaliacoes',
  autorizarCliente,(req,res)=>{
   if(req.get('x-loop-lab')!=='participante'||!csrf(req))
    return res.status(403).json({erro:'MUTACAO_NAO_AUTORIZADA'});
   if(!req.is('application/json')||!req.body||
      Object.keys(req.body).sort().join(',')!=='comentario,nota,pedidoId,produtoId')
    return res.status(400).json({erro:'AVALIACAO_INVALIDA'});
   try{
    const r=avaliacoes.criar({
     titularId:req.titularVitrine,...req.body
    });
    return res.status(201).json(r);
   }catch(e){return res.status(e.codigo==='AVALIACAO_INVALIDA'?400:409)
    .json({erro:e.codigo||'AVALIACAO_INDISPONIVEL'});}
  });
 app.post('/staging/vitrine/loja/avaliacoes/:pedidoId/:produtoId/midias',
  autorizarCliente,
  express.raw({type:['image/jpeg','image/png','image/webp','video/mp4'],
   limit:'25mb',inflate:false}),
  (req,res)=>{
   if(req.get('x-loop-lab')!=='participante'||!csrf(req))
    return res.status(403).json({erro:'MUTACAO_NAO_AUTORIZADA'});
   if(!Buffer.isBuffer(req.body)||!
      ['image/jpeg','image/png','image/webp','video/mp4'].includes(req.get('content-type')))
    return res.status(415).json({erro:'MIDIA_MIME_INVALIDO'});
   try{
    const r=avaliacoes.anexar({
     titularId:req.titularVitrine,
     pedidoId:req.params.pedidoId,produtoId:req.params.produtoId,
     tipo:req.get('x-akitemm-midia-tipo'),mime:req.get('content-type'),
     bytes:req.body
    });
    return res.status(201).json(r);
   }catch(e){return res.status(e.codigo==='MIDIA_INVALIDA'||
     e.codigo==='VIDEO_DURACAO_INVALIDA'||e.codigo==='FOTO_INVALIDA'?400:409)
    .json({erro:e.codigo||'MIDIA_INDISPONIVEL'});}
  });
 app.use((err,req,res,next)=>{
  if(req.path?.startsWith('/staging/vitrine/loja/avaliacoes/')&&
     req.path.endsWith('/midias')&&err.type==='entity.too.large')
   return res.status(413).json({erro:'MIDIA_GRANDE_DEMAIS'});
  next(err);
 });
 // Cadastro de pacotes por varios SKUs: o operador configura sem alterar
 // a identidade de cada item nem gerar pagamento ou estoque ficticio.
 app.get('/staging/escritorio-unificado/ofertas-compostas',
  autorizarOperador,(_req,res)=>{
   try{return res.json({ofertas:ofertasCompostas.listar(),apenasEnsaio:true});}
   catch(e){return res.status(503).json({erro:e.codigo||'OFERTAS_INDISPONIVEIS'});}
  });
 app.get('/staging/escritorio-unificado/ofertas-compostas/:id/historico',
  autorizarOperador,(req,res)=>{
   try{return res.json({historico:ofertasCompostas.historico(req.params.id)});}
   catch(e){return res.status(400).json({erro:e.codigo||'OFERTA_INVALIDA'});}
  });
 app.put('/staging/escritorio-unificado/ofertas-compostas/:id',
  autorizarOperador,async(req,res)=>{
   if(!req.is('application/json'))
    return res.status(415).json({erro:'JSON_OBRIGATORIO'});
   try{
    const oferta=await ofertasCompostas.salvar(req.params.id,req.body);
    return res.json({oferta,apenasEnsaio:true,posicoesReais:0});
   }catch(e){
    return res.status(e.codigo==='CONFLITO_REVISAO'?409:
     e.codigo==='OFERTA_COMPOSTA_PRODUTO_INDISPONIVEL'?404:400)
     .json({erro:e.codigo||'OFERTA_INVALIDA',pagamentoReal:false});
   }
  });
 app.get('/staging/escritorio-unificado/sinalizacao/:id',
  autorizarOperador,(req,res)=>{
   try{return res.json(sinalizacao.consultar(req.params.id));}
   catch(e){return res.status(400).json({erro:e.codigo||'SINALIZACAO_INVALIDA'});}
  });
 app.patch('/staging/escritorio-unificado/sinalizacao/:id',
  autorizarOperador,async(req,res)=>{
   if(!req.is('application/json'))
    return res.status(415).json({erro:'JSON_OBRIGATORIO'});
   try{return res.json(await sinalizacao.atualizar(req.params.id,req.body));}
   catch(e){return res.status(e.codigo==='CONFLITO_REVISAO'?409:
    e.codigo==='PRODUTO_NAO_ENCONTRADO'?404:400)
    .json({erro:e.codigo||'SINALIZACAO_INVALIDA'});}
  });
 app.get('/staging/escritorio-unificado/sinalizacao/:id/historico',
  autorizarOperador,(req,res)=>{
   try{return res.json({historico:sinalizacao.historico(req.params.id)});}
   catch(e){return res.status(400).json({erro:e.codigo||'SINALIZACAO_INVALIDA'});}
  });
 return sinalizacao;
}
module.exports={createVitrineCandidata};
