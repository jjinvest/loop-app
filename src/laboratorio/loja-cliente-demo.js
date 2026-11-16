'use strict';
// AKITEMM: loja separada visualmente, compartilhando autenticação e motor
// existentes. Valores e pedidos sempre do servidor SQLite, nunca do navegador.
(()=>{
 const el=id=>document.getElementById(id);
 const dinheiro=centavos=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(centavos/100);
 const catalogo=[],carrinho=new Map();
 let referenciaCentavos=25000,pedidoEmAndamento=false,filtro='todos',corFiltro=null,configLoja=null,bannerIndice=-1;
 let conviteLoopCheckoutAtivo=false,catalogoRealSemCheckout=false;
 const tamanhoPaginaVitrine=()=>window.matchMedia('(max-width:800px)').matches?4:8;
 let timerBanner=null,enderecoEntrega=null,quantidadeVitrine=tamanhoPaginaVitrine();
 // Vitrine horizontal: 5 abas * 4 fileiras * 10 espaços = 200 posições.
 // Somente duas fileiras são montadas até o usuário expandir a aba.
 const TOTAL_ABAS=5,COLUNAS_FAIXA=10,LINHAS_ABA=4,VAGAS_ABA=40;
 let abaProdutos=0;
 const abasExpandidas=new Set();
 const modoVitrineHorizontal=()=>filtro==='todos'&&!el('akitemmBusca').value.trim();
 let operadorVitrine=false;
 let assinaturaCarrinhoAnterior='';
 let novidadesVitrine=[];
 let avaliacoesDisponiveis=[],avisosGerais=[];
 let produtoAberto=null,versaoDetalhe=0;
 const vazio=document.createElement.bind(document);
 const inform=msg=>{el('estadoLojaLoop').textContent=msg;};
 // Atalho visivel apenas com sessao administrativa autenticada no gateway.
 async function atualizarAtalhoOperadorAkitemm(){
  const atalho=el('akitemmOperadorMais');
  if(!atalho)return;
  atalho.hidden=true;atalho.style.display='none';
  try{
   const resposta=await fetch('/api/operador/estado',{
    credentials:'same-origin',cache:'no-store'
   });
   if(!resposta.ok)return;
   const estado=await resposta.json();
   if(estado?.operador===true){
    operadorVitrine=true;
    atalho.hidden=false;atalho.style.display='inline-flex';
   }
  }catch{}
 }
 void atualizarAtalhoOperadorAkitemm();
 addEventListener('pageshow',()=>void atualizarAtalhoOperadorAkitemm());
 addEventListener('focus',()=>void atualizarAtalhoOperadorAkitemm());
 const fotoPermitida=src=>typeof src==='string'&&
  /^\/imagens\/catalogo\/[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp)$/.test(src);
 const fotoBannerPermitida=src=>fotoPermitida(src)||
  typeof src==='string'&&
  /^\/staging\/vitrine\/loja\/banner-arquivo\/[a-f0-9]{32}$/.test(src);
 async function api(caminho,body){
  const response=await fetch('/api/laboratorio/participante/'+caminho,{
   method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',
   headers:body===undefined?{}:{'Content-Type':'application/json','X-LOOP-LAB':'participante'},
   body:body===undefined?undefined:JSON.stringify(body)
  });
  const data=await response.json();
  if(!response.ok){
   const error=new Error(response.status===401?
    'Sua sessão terminou. Entre novamente pelo Escritório Virtual do LOOP.':
    'Não foi possível concluir: '+(data.erro||response.status));
   error.codigo=data.erro;error.status=response.status;throw error;
  }
  return data;
 }
 function produto(id){return catalogo.find(p=>p.produtoId===id);}
 function corDoProduto(p){
  if(p.classeVisual==='ROXO'||p.classeVisual==='EVENTO'||(!p.classeVisual&&p.eventoId&&p.posicoesPorPedidoLoop>1))return 'ROXO';
  if(p.classeVisual==='DOURADO')return 'DOURADO';
  if(p.classeVisual==='VERDE'||(!p.classeVisual&&p.elegivelLoop))return 'VERDE';
  return 'CINZA';
 }
 function atualizarFiltroCor(){
  for(const botao of document.querySelectorAll('[data-akitemm-cor]')){
   const ativo=botao.dataset.akitemmCor===corFiltro;
   botao.classList.toggle('selecionado',ativo);
   botao.setAttribute('aria-pressed',String(ativo));
  }
 }
 function atualizarBotoesDeFiltro(){
  const todos=filtro==='todos'&&!corFiltro;
  const ofertas=filtro==='ofertas'&&!corFiltro;
  for(const [id,ativo] of [
   ['akitemmFiltroTodos',todos],['akitemmFiltroOfertas',ofertas]
  ]){
   const botao=el(id);
   botao.classList.toggle('selecionado',ativo);
   botao.setAttribute('aria-pressed',String(ativo));
  }
  for(const botao of document.querySelectorAll('[data-akitemm-categoria]')){
   const ativo=!corFiltro&&botao.dataset.akitemmCategoria===filtro;
   botao.classList.toggle('ativo',ativo);
   botao.setAttribute('aria-pressed',String(ativo));
  }
  el('tituloCatalogoLoja').textContent=corFiltro?
   ({CINZA:'Quadrinhos cinzas',VERDE:'Quadrinhos verdes',
     DOURADO:'Quadrinhos dourados',ROXO:'Quadrinhos roxos'})[corFiltro]:
   ({todos:'Produtos em destaque',ofertas:'Ofertas',cursos:'Cursos',
     fisicos:'Produtos físicos',novidades:'Novidades',
     'mais-vendidos':'Mais vendidos'})[filtro]||'Produtos em destaque';
 }
 function escolherCor(cor){
  if(!['CINZA','VERDE','DOURADO','ROXO'].includes(cor))return;
  // Cada cor substitui a categoria, oferta e busca anterior.
  const proximaCor=corFiltro===cor?null:cor;
  fecharDetalhes();
  filtro='todos';corFiltro=proximaCor;
  el('akitemmBusca').value='';
  quantidadeVitrine=tamanhoPaginaVitrine();abaProdutos=0;
  atualizarFiltroCor();atualizarBotoesDeFiltro();
  mostrarCatalogo();
 }
 function fotoDo(p){
  const src=p?.fotos?.find(fotoPermitida);
  return src||null;
 }
 function miniatura(p,classe){
  const div=document.createElement('div');div.className=classe;
  const src=fotoDo(p);
  if(src){
   const img=document.createElement('img');img.src=src;img.alt=p.nome;img.loading='lazy';img.decoding='async';
   div.append(img);
  }else{
   const span=document.createElement('span');span.className='akitemm-imagem-produto-vazia';
   span.textContent='Imagem do produto';div.append(span);
  }
  return div;
 }
 function atualizarCarrinho(){
  const destino=el('itensLojaLoop');destino.replaceChildren();
  let total=0,totalElegivel=0,valorPacoteEspecial=0,quantidadePosicoesEspecial=1,quantidadeTotal=0;
  for(const [id,quantidade] of [...carrinho]){
   const p=produto(id);
   if(!p){carrinho.delete(id);continue;}
   quantidadeTotal+=quantidade;
   total+=p.precoCentavos*quantidade;
   if(p.elegivelLoop&&quantidade>=p.quantidadeMinimaLoop){
    totalElegivel+=p.precoCentavos*quantidade;
    if(p.eventoId&&p.posicoesPorPedidoLoop>1){
     valorPacoteEspecial+=p.precoCentavos*quantidade;
     quantidadePosicoesEspecial=Math.max(quantidadePosicoesEspecial,p.posicoesPorPedidoLoop);
    }
   }
   const div=document.createElement('div');div.className='item-carrinho-loja';
   const imagem=miniatura(p,'akitemm-miniatura-carrinho');
   const info=document.createElement('div');info.className='akitemm-item-dados';
   const title=document.createElement('strong');title.textContent=p.nome;
   const preco=document.createElement('span');preco.className='akitemm-preco-linha';preco.textContent=dinheiro(p.precoCentavos*quantidade);
   const qtd=document.createElement('div');qtd.className='akitemm-controle-quantidade';
   const menos=document.createElement('button');menos.type='button';menos.textContent='−';menos.setAttribute('aria-label','Diminuir quantidade de '+p.nome);
   menos.addEventListener('click',()=>{
    if(quantidade===1)carrinho.delete(id);else carrinho.set(id,quantidade-1);
    atualizarCarrinho();
   });
   const numero=document.createElement('span');numero.textContent=String(quantidade);
   const mais=document.createElement('button');mais.type='button';mais.textContent='+';
   mais.setAttribute('aria-label','Aumentar quantidade de '+p.nome);
   mais.disabled=quantidade>=100;
   mais.addEventListener('click',()=>{if(quantidade<100){carrinho.set(id,quantidade+1);atualizarCarrinho();}});
   qtd.append(menos,numero,mais);
   info.append(title,preco,qtd);
   const remover=document.createElement('button');remover.type='button';remover.className='item-remover akitemm-item-remover';
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
   svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','18');
   svg.setAttribute('height','18');svg.setAttribute('fill','none');
   svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');
   svg.setAttribute('aria-hidden','true');
   for(const caminho of ['M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14','M10 10v7M14 10v7']){
    const p=document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d',caminho);svg.append(p);
   }
   remover.append(svg);
   remover.setAttribute('aria-label','Remover '+p.nome);
   remover.addEventListener('click',()=>{carrinho.delete(id);atualizarCarrinho();});
   div.append(imagem,info,remover);destino.append(div);
  }
  if(!carrinho.size){
   const mensagem=document.createElement('p');mensagem.textContent='Seu carrinho está vazio.';
   mensagem.className='akitemm-carrinho-vazio';destino.append(mensagem);
  }
  el('akitemmTotalItens').textContent=String(quantidadeTotal);
  const subtotal=el('totalLojaLoop');subtotal.replaceChildren(
   document.createTextNode('Subtotal '));
  const strong=document.createElement('strong');strong.textContent=dinheiro(total);subtotal.append(strong);
  // Cálculo dentro do carrinho atual; pedidos passados nunca se acumulam.
  const orientacao=window.EducacaoCarrinhoLoopV6.orientar({
   itens:carrinho.size,totalElegivelCentavos:totalElegivel,referenciaCentavos,
   valorPacoteEspecialCentavos:valorPacoteEspecial,
   quantidadePosicoesPacote:Math.max(2,quantidadePosicoesEspecial)
  });
  el('progressoMinimoLoop').max=orientacao.minimoCentavos;
  el('progressoMinimoLoop').value=orientacao.progressoCentavos;
  el('orientacaoMinimoLoop').textContent=orientacao.mensagem;
  // O dono ainda nao liberou o convite: compra segue como AKITEMM.
  const qualificado=conviteLoopCheckoutAtivo&&totalElegivel>=referenciaCentavos;
  const escolha=el('akitemmEscolhaLoop');
  // Alterou itens/quantidade: a escolha anterior nao vale para outro carrinho.
  const assinatura=JSON.stringify([...carrinho]);
  if(assinatura!==assinaturaCarrinhoAnterior){
   assinaturaCarrinhoAnterior=assinatura;
   for(const opcao of escolha.querySelectorAll('input[name="akitemmParticiparLoop"]'))
    opcao.checked=false;
  }
  if(!qualificado){
   for(const opcao of escolha.querySelectorAll('input[name="akitemmParticiparLoop"]'))
    opcao.checked=false;
  }
  escolha.hidden=!qualificado;
  el('registrarPedidoLoja').disabled=catalogoRealSemCheckout||!carrinho.size||pedidoEmAndamento;
 }
 function adicionar(p){
  if(catalogoRealSemCheckout){
   el('statusPedidoLoja').textContent='Compra disponível após homologação do pagamento.';return;
  }
  const qtd=carrinho.get(p.produtoId)||0;
  if(!qtd&&carrinho.size>=20){el('statusPedidoLoja').textContent='Máximo de 20 produtos diferentes por pedido.';return;}
  if(qtd>=100){el('statusPedidoLoja').textContent='Máximo de 100 unidades por produto.';return;}
  carrinho.set(p.produtoId,qtd+1);
  el('statusPedidoLoja').textContent=p.nome+' adicionado ao carrinho.';
  atualizarCarrinho();
 }

 function fecharDetalhes(){
  if(produtoAberto===null)return;
  produtoAberto=null;versaoDetalhe++;
  el('akitemmAreaProdutos').dataset.modo='lista';
  el('akitemmVisualizacaoProduto').hidden=true;
  el('akitemmProdutoInlineConteudo').replaceChildren();
  el('tituloCatalogoLoja').textContent=({
   todos:'Produtos em destaque',ofertas:'Ofertas',cursos:'Cursos',
   fisicos:'Produtos físicos',novidades:'Novidades',
   'mais-vendidos':'Mais vendidos'
  })[filtro]||'Produtos em destaque';
 }
 async function abrirDetalhes(p){
  const idDaAbertura=++versaoDetalhe;
  produtoAberto=p.produtoId;
  el('akitemmAreaProdutos').dataset.modo='detalhe';
  el('akitemmVisualizacaoProduto').hidden=false;
  el('tituloCatalogoLoja').textContent='Produto selecionado';
  const alvo=el('akitemmProdutoInlineConteudo');alvo.replaceChildren();
  const h=document.createElement('h2');h.textContent=p.nome;alvo.append(h);
  const conteudo=document.createElement('div');conteudo.className='akitemm-detalhe-conteudo';
  const galeria=document.createElement('div');galeria.className='akitemm-detalhe-galeria';
  const principal=document.createElement('div');principal.className='akitemm-detalhe-foto-principal';
  const fotos=(p.fotos||[]).filter(fotoPermitida);
  if(fotos.length){
   const img=document.createElement('img');img.alt='Foto de '+p.nome;img.src=fotos[0];img.loading='eager';principal.append(img);
   const thumbs=document.createElement('div');thumbs.className='akitemm-detalhe-miniaturas';
   fotos.forEach((caminho,i)=>{
    const botao=document.createElement('button');botao.type='button';
    botao.setAttribute('aria-label','Ver foto '+(i+1)+' de '+fotos.length);
    const mini=document.createElement('img');mini.src=caminho;mini.alt='Miniatura '+(i+1);
    mini.loading='lazy';botao.append(mini);
    botao.addEventListener('click',()=>{img.src=caminho;img.alt='Foto '+(i+1)+' de '+p.nome;});
    thumbs.append(botao);
   });
   galeria.append(principal,thumbs);
  }else{
   const aviso=document.createElement('span');aviso.textContent='Fotografias ainda não cadastradas.';
   principal.append(aviso);galeria.append(principal);
  }
  const informacoes=document.createElement('div');informacoes.className='akitemm-detalhe-informacoes';
  const preco=document.createElement('strong');preco.className='akitemm-detalhe-preco';preco.textContent=dinheiro(p.precoCentavos);
  const tipo=document.createElement('p');tipo.textContent=p.tipo==='PDF'?'Curso em PDF':p.tipo==='VIDEO'?'Curso em vídeo':'Produto físico';
  const descricao=document.createElement('section');
  const descH=document.createElement('h3');descH.textContent='Descrição completa';
  const desc=document.createElement('p');desc.textContent=p.descricao||'Descrição ainda não cadastrada.';
  descricao.append(descH,desc);
  const caracteristicas=document.createElement('section');
  const cH=document.createElement('h3');cH.textContent='Características, tamanho e peso';
  caracteristicas.append(cH);
  if(Array.isArray(p.detalhes)&&p.detalhes.length){
   const lista=document.createElement('ul');
   for(const d of p.detalhes){const li=document.createElement('li');li.textContent=d;lista.append(li);}
   caracteristicas.append(lista);
  }else{
   const aviso=document.createElement('p');aviso.textContent='Informações técnicas ainda não cadastradas.';
   caracteristicas.append(aviso);
  }
  const aviso=document.createElement('p');aviso.className='akitemm-regra-detalhes';
  aviso.textContent=p.elegivelLoop?'Elegibilidade LOOP sujeita à regra da compra e confirmação individual.':
   'Compra comum AKITEMM: não gera posição LOOP.';
  const botao=document.createElement('button');botao.type='button';botao.className='akitemm-adicionar';
  botao.textContent='Adicionar ao carrinho';
  botao.addEventListener('click',()=>adicionar(p));
  informacoes.append(preco,tipo,descricao,caracteristicas,aviso,botao);
  conteudo.append(galeria,informacoes);alvo.append(conteudo);
  const avaliacoes=document.createElement('section');avaliacoes.className='akitemm-detalhe-avaliacoes';
  const title=document.createElement('h3');title.textContent='Avaliações de compradores';
  const lista=document.createElement('div');lista.textContent='Consultando avaliações…';
  avaliacoes.append(title,lista);alvo.append(avaliacoes);
  el('akitemmAreaProdutos').scrollIntoView({behavior:'instant',block:'start'});
  try{
   const r=await api('loja/avaliacoes/'+encodeURIComponent(p.produtoId));
   if(produtoAberto!==p.produtoId||idDaAbertura!==versaoDetalhe)return;
   lista.replaceChildren();
   if(!(r.avaliacoes||[]).length){
    const m=document.createElement('p');m.textContent='Nenhuma avaliação publicada para este produto.';
    lista.append(m);
   }else for(const review of r.avaliacoes){
    const item=document.createElement('article');item.className='akitemm-depoimento';
    const estrelas=document.createElement('strong');
    estrelas.textContent='★'.repeat(review.nota)+'☆'.repeat(5-review.nota)+' · Compra avaliada';
    const texto=document.createElement('p');texto.textContent=review.comentario;
    item.append(estrelas,texto);
    const galeriaAvaliacao=document.createElement('div');
    galeriaAvaliacao.className='akitemm-midia-depoimento';
    for(const midia of review.midias||[]){
     if(midia.tipo==='FOTO'){
      const img=document.createElement('img');img.src=midia.url;img.loading='lazy';
      img.alt='Fotografia enviada por comprador e aprovada pela AKITEMM';
      galeriaAvaliacao.append(img);
     }else if(midia.tipo==='VIDEO'){
      const video=document.createElement('video');video.src=midia.url;video.controls=true;
      video.preload='metadata';video.playsInline=true;
      video.setAttribute('aria-label','Vídeo de até 30 segundos enviado por comprador e aprovado');
      galeriaAvaliacao.append(video);
     }
    }
    item.append(galeriaAvaliacao);
    if(fotoPermitida(review.imagemCaminho)){
     const img=document.createElement('img');img.src=review.imagemCaminho;img.loading='lazy';
     img.alt='Foto associada à avaliação publicada';item.append(img);
    }
    lista.append(item);
   }
  }catch{
   if(produtoAberto===p.produtoId&&idDaAbertura===versaoDetalhe)
    lista.textContent='Avaliações temporariamente indisponíveis.';
  }
 }
 function renderizarNovidadesEditorais(){
  const root=el('novidadesVitrineAkitemm');root.replaceChildren();
  root.hidden=filtro!=='novidades';
  if(root.hidden)return;
  const pesquisa=el('akitemmBusca').value.trim().normalize('NFD')
   .replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  for(const n of novidadesVitrine){
   const combinacao=[n.titulo,n.texto].join(' ').normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
   if(pesquisa&&!combinacao.includes(pesquisa))continue;
   const card=document.createElement('article');card.className='akitemm-novidade-publicacao';
   if(n.temImagem&&Number.isSafeInteger(n.id)&&n.id>0){
    const img=document.createElement('img');
    img.src='/staging/vitrine/novidades/'+n.id+'/imagem';
    img.loading='lazy';img.decoding='async';
    img.alt=n.titulo||'Imagem da novidade';
    if(n.larguraImagemPx&&n.alturaImagemPx){
     img.width=n.larguraImagemPx;img.height=n.alturaImagemPx;
    }
    card.append(img);
   }
   const content=document.createElement('div');content.className='akitemm-novidade-conteudo';
   if(n.titulo){const title=document.createElement('h3');title.textContent=n.titulo;content.append(title);}
   if(n.texto){const t=document.createElement('p');t.textContent=n.texto;content.append(t);}
   const ligado=catalogo.find(p=>p.produtoId===n.produtoId);
   if(ligado){
    const botao=document.createElement('button');botao.type='button';
    botao.className='akitemm-ver-detalhes';botao.textContent='Ver produto';
    botao.addEventListener('click',()=>abrirDetalhes(ligado));content.append(botao);
   }
   card.append(content);root.append(card);
  }
 }
 async function carregarNovidadesEditorais(){
  try{
   const resposta=await api('novidades');
   novidadesVitrine=Array.isArray(resposta.itens)?resposta.itens.filter(n=>
    n&&n.estado==='PUBLICADA'&&Number.isSafeInteger(n.id)):[];
  }catch{novidadesVitrine=[];} // Laboratorio legado sem rota: nao falhar a loja.
  renderizarNovidadesEditorais();
 }
 function produtosFiltrados(){
  const termo=el('akitemmBusca').value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  const cfg=configLoja||{};
  return catalogo.filter(p=>{
   if(corFiltro&&corDoProduto(p)!==corFiltro)return false;
   if(filtro==='ofertas'&&!(cfg.ofertas||[]).includes(p.produtoId))return false;
   if(filtro==='cursos'&&!['PDF','VIDEO'].includes(p.tipo))return false;
   if(filtro==='fisicos'&&p.tipo!=='FISICO')return false;
   if(filtro==='novidades'&&!p.novidade)return false;
   if(filtro==='mais-vendidos'&&!(p.quantidadeVendida>0))return false;
   const texto=[p.nome,p.descricao,...(p.detalhes||[])].join(' ').normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
   return !termo||texto.includes(termo);
  }).sort((a,b)=>filtro==='mais-vendidos'?(b.quantidadeVendida||0)-(a.quantidadeVendida||0):0);
 }
 function escolherFiltro(novo,{preservarBusca=false}={}){
  fecharDetalhes();
  // "Todos", "Ofertas" e categorias não herdam uma cor antiga.
  filtro=novo;corFiltro=null;
  if(!preservarBusca)el('akitemmBusca').value='';
  quantidadeVitrine=tamanhoPaginaVitrine();abaProdutos=0;
  atualizarFiltroCor();atualizarBotoesDeFiltro();
  mostrarCatalogo();
 }
 function filtradoNovidadePublicada(){
  if(filtro!=='novidades')return false;
  return !!el('novidadesVitrineAkitemm').childElementCount;
 }
 const CORES_PADRAO_VITRINE=['ROXO','DOURADO','VERDE','CINZA',
  'CINZA','VERDE','DOURADO','ROXO'];
 function coresVitrine(){
  const lista=configLoja?.vitrineSlots;
  return Array.isArray(lista)&&lista.length===200&&
   lista.every(cor=>['ROXO','DOURADO','VERDE','CINZA'].includes(cor))?
   lista:Array.from({length:200},(_,i)=>CORES_PADRAO_VITRINE[i%8]);
 }
 function gradeVitrineMontada(produtos){
  // Cadastro sequencial: cada produto ocupa o próximo quadrinho livre,
  // independentemente da cor. A classificação acompanha o produto.
  const livres=[...produtos];
  const slots=coresVitrine().map((cor,indice)=>{
   const produto=livres.shift()||null;
   return {cor:produto?corDoProduto(produto):cor,indice:indice+1,produto};
  });
  // Produtos restantes continuam acessíveis pela paginação; nada é apagado.
  return [...slots,...livres.map(produto=>({cor:corDoProduto(produto),produto}))];
 }
 function abrirCadastroOperador(id){
  if(!operadorVitrine)return;
  const atalho=el('akitemmOperadorMais');
  if(!atalho||!atalho.href)return;
  const destino=new URL(atalho.href,location.href);
  destino.searchParams.set('produtoEditar',id||'novo');
  location.assign(destino.href);
 }
 function criarSlotVazio({cor,indice}){
  const card=document.createElement('article');
  card.className='produto-loja-loop akitemm-slot-vazio akitemm-slot-'+cor.toLowerCase();
  card.dataset.akitemmSlot=String(indice);
  card.setAttribute('aria-label','Quadrinho '+indice+' '+cor.toLowerCase()+
   ', disponível para cadastro de produto');
  const imagem=document.createElement('div');imagem.className='akitemm-imagem-produto';
  const sim=document.createElement('span');sim.className='akitemm-slot-icone';
  sim.textContent='+';sim.setAttribute('aria-hidden','true');
  imagem.append(sim);
  const dados=document.createElement('div');dados.className='akitemm-dados-produto';
  const titulo=document.createElement('strong');titulo.textContent='Espaço disponível';
  const estado=document.createElement('small');estado.textContent='Aguardando produto cadastrado';
  dados.append(titulo,estado);
  card.append(imagem,dados);
  card.addEventListener('click',()=>abrirCadastroOperador(null));
  return card; // Sem id de produto, preço, botão, checkout ou evento.
 }
 function prepararAbasVitrine(totalAbas=TOTAL_ABAS){
  let nav=el('akitemmAbasProdutos');
  if(!nav){
   nav=document.createElement('nav');
   nav.id='akitemmAbasProdutos';
   nav.setAttribute('aria-label','Páginas dos produtos');
   el('akitemmCarregarMais').after(nav);
  }
  nav.replaceChildren();
  for(let n=0;n<totalAbas;n++){
   const b=document.createElement('button');
   b.type='button';b.textContent=String(n+1);
   b.setAttribute('aria-label','Página '+(n+1)+' de '+totalAbas);
   if(n===abaProdutos)b.setAttribute('aria-current','page');
   b.addEventListener('click',()=>{
    if(abaProdutos===n)return;
    abaProdutos=n;mostrarCatalogo();
    el('akitemmAreaProdutos').scrollIntoView({block:'start',behavior:'auto'});
   });
   nav.append(b);
  }
  return nav;
 }
 function mostrarCatalogo(){
  fecharDetalhes();
  const destino=el('catalogoLojaLoop');destino.replaceChildren();
  renderizarNovidadesEditorais();
  const filtrados=produtosFiltrados();
  const haPublicacoes=filtradoNovidadePublicada();
  const termoBusca=el('akitemmBusca').value.trim();
  el('akitemmResultadoProdutos').textContent=filtrados.length||haPublicacoes?
   (termoBusca?filtrados.length+' produto(s) encontrado(s) para "'+termoBusca+'".':''):
   (termoBusca?'Produto inexistente.':
    filtro==='novidades'?'Nenhuma novidade publicada por enquanto.':
    catalogo.length?'Nenhum produto encontrado neste filtro.':'Nenhum produto publicado ainda.');
  el('referenciaLojaLoop').textContent='Referência do LOOP para compras elegíveis: '+dinheiro(referenciaCentavos)+
   '. Produtos físicos e digitais podem ou não participar, conforme autorização do administrador.';
  // Os oito espaços editáveis continuam visíveis quando uma cor é filtrada.
  // Uma cor mostra apenas os slots correspondentes e seus produtos reais.
  // A busca, categorias e ofertas mostram só mercadorias publicadas.
  const exibirMolduras=filtro==='todos'&&!termoBusca;
  const itens=exibirMolduras?
   gradeVitrineMontada(filtrados).filter(item=>!corFiltro||item.cor===corFiltro):
   filtrados.map(produto=>({cor:corDoProduto(produto),produto}));
  if(corFiltro&&exibirMolduras){
   const livres=itens.filter(item=>!item.produto).length;
   el('akitemmResultadoProdutos').textContent=itens.length?
    itens.length+' quadrinho(s) '+corFiltro.toLowerCase()+
    ' · '+(itens.length-livres)+' produto(s) cadastrado(s) · '+
    livres+' espaço(s) disponível(is).':
    'Nenhum quadrinho desta cor. Altere as cores no painel administrativo.';
  }else if(filtro==='ofertas'&&!filtrados.length&&!haPublicacoes){
   el('akitemmResultadoProdutos').textContent='Nenhuma oferta publicada por enquanto.';
  }
  const horizontal=modoVitrineHorizontal();
  const totalAbas=corFiltro?Math.max(1,Math.ceil(itens.length/VAGAS_ABA)):TOTAL_ABAS;
  if(abaProdutos>=totalAbas)abaProdutos=0;
  const nav=prepararAbasVitrine(totalAbas);nav.hidden=!horizontal;
  destino.classList.toggle('ak-vitrine-horizontal',horizontal);
  let faixas=[];
  let itensExibidos;
  if(horizontal){
   const expandida=abasExpandidas.has(abaProdutos);
   const linhas=expandida?LINHAS_ABA:2;
   const cores=coresVitrine();
   const total=corFiltro?Math.min(linhas*COLUNAS_FAIXA,Math.max(0,itens.length-abaProdutos*VAGAS_ABA)):linhas*COLUNAS_FAIXA;
   itensExibidos=Array.from({length:total},(_,i)=>{
    const indice=abaProdutos*VAGAS_ABA+i;
    return itens[indice]||{indice:indice+1,cor:cores[indice%cores.length],produto:null};
   });
   for(let linha=0;linha<linhas;linha++){
    const faixa=document.createElement('div');
    faixa.className='ak-faixa-horizontal';
    faixa.tabIndex=0;faixa.setAttribute('role','group');
    faixa.setAttribute('aria-label','Fileira '+(linha+1)+' da aba '+(abaProdutos+1)+
     ', dez espaços. Arraste para o lado.');
    destino.append(faixa);faixas.push(faixa);
   }
   el('akitemmCarregarMais').hidden=!!corFiltro&&itens.length<=abaProdutos*VAGAS_ABA+2*COLUNAS_FAIXA;
   el('akitemmCarregarMais').textContent=expandida?'Mostrar menos produtos ↑':'Mostrar mais produtos ↓';
   el('akitemmResultadoProdutos').textContent=corFiltro?
    itens.length+' quadrinho(s) '+corFiltro.toLowerCase()+' · navegue pelas abas e arraste as fileiras.':
    (filtrados.length?filtrados.length+' produto(s) publicado(s) · cinco abas com quarenta espaços cada.':
    'Vitrine com cinco abas e capacidade para duzentos produtos.');
  }else{
   itensExibidos=itens.slice(0,quantidadeVitrine);
   el('akitemmCarregarMais').hidden=itens.length<=quantidadeVitrine;
   el('akitemmCarregarMais').textContent='Mostrar mais produtos ↓';
  }
  for(const [i,item] of itensExibidos.entries()){
   const alvo=horizontal?faixas[Math.floor(i/COLUNAS_FAIXA)]:destino;
   if(!item.produto){alvo.append(criarSlotVazio(item));continue;}
   const p=item.produto;
   const card=document.createElement('article');
   const classe=corDoProduto(p),especial=classe==='ROXO';
   card.className='produto-loja-loop '+(especial?
    'produto-loja-loop-especial':classe==='DOURADO'?
    'produto-loja-loop-dourado':classe==='VERDE'?
     'produto-loja-loop-elegivel':'produto-loja-loop-nao-elegivel');
   card.dataset.produtoId=p.produtoId;
   const imagem=miniatura(p,'akitemm-imagem-produto');
   if(especial){
    const tarja=document.createElement('strong');tarja.className='tarja-promocao-especial-loop';tarja.textContent='EVENTO ESPECIAL';
    imagem.append(tarja);
   }
   const dados=document.createElement('div');dados.className='akitemm-dados-produto';
   const titulo=document.createElement('h3');titulo.textContent=p.nome;
   const descricao=document.createElement('span');descricao.className='akitemm-descricao';
   descricao.textContent=p.descricao||'';
   const preco=document.createElement('p');preco.className='preco-loja-loop';preco.textContent=dinheiro(p.precoCentavos);
   const acoes=document.createElement('div');acoes.className='akitemm-acoes-produto';
   const ver=document.createElement('button');ver.type='button';ver.className='akitemm-ver-detalhes';ver.textContent='Ver detalhes';
   ver.addEventListener('click',()=>abrirDetalhes(p));
   const adicionarBotao=document.createElement('button');adicionarBotao.type='button';
   adicionarBotao.className='akitemm-adicionar';adicionarBotao.textContent='Adicionar';adicionarBotao.setAttribute('aria-label','Adicionar ao carrinho');
   adicionarBotao.disabled=catalogoRealSemCheckout;
   if(catalogoRealSemCheckout)adicionarBotao.textContent='Em breve';
   adicionarBotao.addEventListener('click',()=>adicionar(p));
   acoes.append(ver,adicionarBotao);dados.append(titulo,descricao,preco,acoes);
   if(especial){
    const adicional=document.createElement('small');adicional.className='datas-promocao-especial-loop';
    adicional.textContent=(p.eventoTitulo||'Evento')+' · De '+(p.dataInicio||'—')+' até '+(p.dataFim||'—')+' · '+p.posicoesPorPedidoLoop+' posições';
    dados.append(adicional);
   }
   // Cartão inteiro clicável, sem duplicar o clique dos botões internos.
   card.tabIndex=0;card.setAttribute('role','group');
   card.setAttribute('aria-label','Produto '+p.nome+'. Clique para ver detalhes');
   card.addEventListener('click',ev=>{
    if(!ev.target.closest('button')){
     if(operadorVitrine)abrirCadastroOperador(p.produtoId);
     else abrirDetalhes(p);
    }
   });
   card.addEventListener('keydown',ev=>{
    if(ev.target===card&&(ev.key==='Enter'||ev.key===' ')){
     ev.preventDefault();if(operadorVitrine)abrirCadastroOperador(p.produtoId);
     else abrirDetalhes(p);
    }
   });
   card.append(imagem,dados);alvo.append(card);
  }
  atualizarCarrinho();
 }
 function mostrarPedidos(pedidos){
  const lista=el('pedidosLojaLoop');lista.replaceChildren();
  if(!pedidos.length){const li=document.createElement('li');li.textContent='Você ainda não registrou pedidos de teste.';lista.append(li);return;}
  for(const p of pedidos){
   const li=document.createElement('li'),nome=document.createElement('strong'),info=document.createElement('small'),status=document.createElement('span');
   nome.textContent='Pedido '+p.pedidoId+' · '+dinheiro(p.totalCentavos);
   info.textContent=p.itens.map(i=>i.quantidade+' × '+i.nome).join(' + ');
   const estados={
    SEM_COBRANCA_SANDBOX:'Pré-pedido preparado. Sem cobrança Pix registrada.',
    PREPARADA:'Cobrança de teste preparada, sem confirmação.',
    PENDENTE_SANDBOX:'Cobrança de teste pendente no Asaas Sandbox.',
    CRIACAO_INDETERMINADA:'Cobrança indeterminada. Revisão obrigatória.',
    RECEBIMENTO_INFORMADO_SANDBOX:'Recebimento informado pelo Sandbox, aguardando conferência.',
    WEBHOOK_RECEBIDO_AGUARDANDO_RECONSULTA:'Aviso do Asaas recebido; aguardando GET independente ao Sandbox.',
    RECEBIMENTO_PSP_CONCILIADO:'Recebimento de teste conferido no Asaas Sandbox, sem benefício real.',
    POSICAO_FICTICIA_PENDENTE:'Recebimento de teste conferido; posição de laboratório pendente.',
    EXIGE_REVISAO_SANDBOX:'Revisão manual obrigatória: nenhum benefício liberado.',
    REVERSAO_INFORMADA_SANDBOX:'Reversão no Sandbox. Operação suspensa para revisão.',
    EXIGE_REVISAO:'Revisão manual obrigatória no ambiente de ensaio.'
   };
   status.textContent=estados[p.estadoOperacional]||
    'Pedido de laboratório em verificação. Nenhum pagamento ou posição real.';
   if(p.exigeRevisaoManual)status.textContent=
    'Pagamento de teste exige revisão manual. Sem liberação de posição ou benefício.';
   const acompanhamento=document.createElement('small');
   acompanhamento.textContent=p.conferenciaPSPConcluida?
    'Conferência independente persistida (GET Asaas Sandbox). '+
    'Posições pendentes fictícias: '+(p.posicoesPendentesFicticias||0)+
    ' · posições vinculadas ao motor de ensaio: '+(p.posicoesMotorEnsaio||0)+
    ' · nenhum direito comercial.':
    'Ainda não há confirmação de recebimento por consulta independente ao PSP. '+
    'A loja não realiza consulta externa nesta página.';
   li.append(nome,info,status,acompanhamento);
   for(const item of p.itens){
    const aval=avaliacoesDisponiveis.find(x=>x.pedidoId===p.pedidoId&&x.produtoId===item.produtoId);
    if(!aval)continue;
    const estado=document.createElement('div');estado.className='akitemm-avaliacao-pedido';
    if(aval.statusAvaliacao){
     estado.textContent=aval.statusAvaliacao==='PENDENTE'?'Avaliação enviada; aguardando moderação.':
      aval.statusAvaliacao==='APROVADA'?'Avaliação publicada.':'Avaliação analisada.';
     const midias=aval.midias||[];
     const fotos=midias.filter(x=>x.tipo==='FOTO').length;
     const videos=midias.filter(x=>x.tipo==='VIDEO').length;
     if(aval.statusAvaliacao==='PENDENTE'&&(fotos<3||videos<1)){
      const acrescentar=document.createElement('button');acrescentar.type='button';
      acrescentar.textContent='Adicionar fotos / vídeo ('+fotos+'/3 fotos; '+videos+'/1 vídeo)';
      acrescentar.addEventListener('click',()=>abrirFormularioAvaliacao(aval,true));
      estado.append(acrescentar);
     }
    }else{
     const botao=document.createElement('button');botao.type='button';
     botao.textContent='Avaliar '+item.nome;
     botao.addEventListener('click',()=>abrirFormularioAvaliacao(aval));
     estado.append(botao);
    }
    li.append(estado);
   }
   lista.append(li);
  }
 }
 async function carregarMeusCursos(){
  const lista=el('akitemmListaMeusCursos');
  lista.replaceChildren();
  const linha=texto=>{
   const li=document.createElement('li');li.textContent=texto;
   lista.append(li);return li;
  };
  try{
   const dados=await api('loja/meus-cursos');
   const cursos=Array.isArray(dados.cursos)?dados.cursos:[];
   if(!cursos.length){
    linha(dados.mensagem||'Nenhum curso adquirido disponível nesta conta.');
    return;
   }
   for(const curso of cursos){
    const li=document.createElement('li');
    const nome=document.createElement('strong');
    nome.textContent=curso.titulo;
    const status=document.createElement('small');
    const liberado=curso.situacao==='DISPONIVEL'&&
     typeof curso.urlDownload==='string'&&
     /^\/staging\/meus-pedidos\/hom-[a-f0-9-]{36}\/pdf\/[a-z0-9-]{3,80}$/.test(curso.urlDownload);
    status.textContent=liberado?
     'Arquivo disponível para download.':
     'Aguardando confirmação do pagamento e autorização da entrega.';
    li.append(nome,status);
    if(liberado){
     const baixar=document.createElement('a');
     baixar.href=curso.urlDownload;
     baixar.textContent='Baixar PDF';
     baixar.setAttribute('download','');
     baixar.className='akitemm-atualizar';
     baixar.setAttribute('aria-label','Baixar o curso '+curso.titulo);
     li.append(baixar);
    }
    lista.append(li);
   }
  }catch(e){
   linha(e.status===401?'Entre na sua conta para consultar seus cursos.':
    'Não foi possível consultar seus cursos neste momento.');
  }
 }
 async function carregarPedidos(){
  const [pedidos,avaliacoes]=await Promise.all([
   api('loja/pedidos'),api('loja/avaliacoes/pendentes')
  ]);
  avaliacoesDisponiveis=avaliacoes.itens||[];
  mostrarPedidos(pedidos.pedidos);atualizarSinoAvaliacoes();
 }
 function abrirFormularioAvaliacao(item,somenteMidias=false){
  const form=el('akitemmFormAvaliacao');form.reset();
  form.dataset.pedidoId=item.pedidoId;form.dataset.produtoId=item.produtoId;
  form.dataset.somenteMidias=String(somenteMidias);
  const nota=el('akitemmAvaliacaoNota'),comentario=el('akitemmAvaliacaoComentario');
  nota.disabled=somenteMidias;nota.required=!somenteMidias;
  comentario.disabled=somenteMidias;comentario.required=!somenteMidias;
  const existentes=item.midias||[];
  form.dataset.fotosExistentes=String(existentes.filter(x=>x.tipo==='FOTO').length);
  form.dataset.videoExistente=String(existentes.filter(x=>x.tipo==='VIDEO').length);
  el('akitemmEnviarAvaliacao').textContent=somenteMidias?'Enviar fotos / vídeo':'Enviar minha avaliação';
  el('akitemmAvaliacaoProdutoNome').textContent=item.nome;
  el('akitemmStatusAvaliacao').textContent=somenteMidias?
   'Sua avaliação já está salva. Você ainda pode anexar arquivos enquanto aguarda aprovação.':'';
  atualizarPreviaMidias();
  el('akitemmModalAvaliacao').showModal();
 }
 function atualizarSinoAvaliacoes(){
  const elegiveis=avaliacoesDisponiveis.filter(x=>!x.statusAvaliacao);
  const todos=[...avisosGerais,...elegiveis.map(x=>'Avalie este produto: '+x.nome)];
  el('akitemmContagemSino').textContent=todos.length?String(todos.length):'';
  el('akitemmContagemSino').hidden=!todos.length;
  el('akitemmNotificacoesConteudo').textContent=todos.length?
   todos.join('\n'):'Nenhuma notificação por enquanto.';
  el('akitemmAbrirAvaliacoes').hidden=!elegiveis.length;
 }
 async function carregarCatalogo(){
  const dados=await api('loja/catalogo');
  catalogo.splice(0,catalogo.length,...dados.produtos);
  catalogoRealSemCheckout=dados.catalogoComercialReal===true&&dados.checkoutReal===false;
  if(catalogoRealSemCheckout)carrinho.clear();
  referenciaCentavos=dados.referenciaLoopCentavos;
  conviteLoopCheckoutAtivo=dados.conviteLoopCheckoutAtivo===true;
  mostrarCatalogo();
 }
 async function carregarPerfil(){
  const visao=await api('minha-conta');
  const nome=visao.perfil?.nome||visao.conta?.nome||'';
  const parte=nome.trim().split(/\s+/);
  el('akitemmNomeTitular').textContent=parte.length>1?parte[0]+' '+parte[1].slice(0,1)+'.':(parte[0]||'');
  el('akitemmNomeTitular').title=nome;
  const img=el('akitemmFotoTitular');
  img.hidden=!visao.perfil?.temFoto;
  if(!img.hidden)img.src=window.location.pathname.startsWith('/staging/')?
   '/staging/contas/foto-perfil':'/api/laboratorio/participante/foto-perfil';
  else img.removeAttribute('src');
 }
 async function mostrarDadosConta(){
  const painel=el('akitemmDadosConta'),botao=el('akitemmAbrirConta');
  painel.hidden=!painel.hidden;botao.setAttribute('aria-expanded',String(!painel.hidden));
  if(painel.hidden)return;
  el('akitemmNotificacoes').hidden=true;
  el('akitemmSino').setAttribute('aria-expanded','false');
  const alvo=el('akitemmDadosContaConteudo');
  alvo.textContent='Consultando os dados cadastrados…';
  try{
   const r=await fetch('/staging/contas/resumo-rodape',{
    cache:'no-store',credentials:'same-origin'});
   if(r.status===401){
    alvo.textContent='Você ainda não entrou na sua conta.';
    return;
   }
   if(!r.ok)throw Error('DADOS_INDISPONIVEIS');
   const d=await r.json();
   alvo.textContent='Nome: '+d.nome+'\nNick: @'+d.nick+'\nE-mail: '+d.email;
  }catch{alvo.textContent='Dados indisponíveis. Consulte Minha Conta no LOOP.';}
 }
 async function carregarEntrega(){
  const r=await api('loja/entrega');enderecoEntrega=r.entrega;
  if(!r.entrega)return;
  const form=el('akitemmFormEntrega');
  for(const [k,v] of Object.entries(r.entrega)){
   if(form.elements.namedItem(k))form.elements.namedItem(k).value=v;
  }
  el('akitemmStatusEntrega').textContent='Endereço salvo; você pode alterá-lo para a próxima compra.';
 }
 async function carregarLinkDivulgacaoLoja(){
  const l=await api('meus-links');
  const input=el('enderecoDivulgarLojaLoop');
  input.value=l.linkLoja?location.origin+(l.linkLoja.startsWith('/')?l.linkLoja:'/loja/'+l.apelido):'';
  el('copiarDivulgarLojaLoop').disabled=!l.ativo||!input.value;
  el('statusDivulgarLojaLoop').textContent=l.apenasEnsaio?
   'Link de cadastro de ensaio ativo. Sem compras ou comissões reais.':
   (l.ativo?'Link AKITEMM ativo.':'Link disponível após primeira compra confirmada.');
 }
 function prepararFundoBannerDesktop(){
  if(document.getElementById('akitemmBannerDesktopResponsivo'))return;
  const folha=document.createElement('style');folha.id='akitemmBannerDesktopResponsivo';
  folha.textContent='@media (min-width: 801px){.akitemm-banner-arte{position:relative;overflow:hidden;isolation:isolate;min-width:0;width:100%;display:flex;align-items:center;justify-content:center;background:#101016}.akitemm-banner-fundo-desktop{position:absolute;inset:-24px;background-size:cover;background-position:center;filter:blur(22px) brightness(.52);transform:scale(1.06);pointer-events:none;z-index:-1}.akitemm-banner-arte>img{position:relative;z-index:1;display:block;max-width:100%;height:auto;object-fit:contain}}@media (max-width:800px){.akitemm-banner-fundo-desktop{display:none}}';
  document.head.append(folha);
 }
 prepararFundoBannerDesktop();
 function mostrarBanner(){
  const bann=configLoja?.banners||[];
  if(!bann.length)return;
  const b=bann[bannerIndice%bann.length];
  const container=el('akitemmBannerConteudo');
  container.replaceChildren();
  const titulo=document.createElement('div');titulo.className='akitemm-banner-texto';
  const h=document.createElement('h1');h.textContent=b.titulo;
  const descr=document.createElement('p');descr.textContent=b.descricao;
  titulo.append(h,descr);container.append(titulo);
  if(fotoBannerPermitida(b.imagemCaminho)){
   const imagem=document.createElement('div');imagem.className='akitemm-banner-arte';
   const img=document.createElement('img');img.src=b.imagemCaminho;img.alt=b.titulo;
   img.style.maxWidth='100%';img.style.maxHeight='185px';img.style.objectFit='contain';
   // Em telas largas, a própria arte preenche suavemente as laterais sem cortar o original.
   const fundo=document.createElement('div');fundo.className='akitemm-banner-fundo-desktop';
   fundo.style.backgroundImage='url('+JSON.stringify(b.imagemCaminho)+')';
   fundo.setAttribute('aria-hidden','true');
   imagem.append(fundo,img);container.append(imagem);
  }
  const p=produto(b.produtoId);
  if(p&&b.produtoId){
   const botao=document.createElement('button');botao.type='button';
   botao.textContent='Explorar produto →';botao.className='akitemm-botao-banner';
   botao.style.background='#eabb70';botao.style.color='#0b1318';
   botao.addEventListener('click',()=>abrirDetalhes(p));
   titulo.append(botao);
  }
  const sinal=el('akitemmBannerPontos');
  sinal.textContent=bann.length>1?(bannerIndice+1)+' / '+bann.length:'';
 }
 function selecionarBanner(n){
  const b=configLoja?.banners||[];
  if(!b.length)return;
  bannerIndice=(n+b.length)%b.length;
  mostrarBanner();
 }
 async function carregarConfig(){
  const r=await api('loja/config');configLoja=r.config||null;
  if(!configLoja)return;
  // Os 4 ícones permanecem visíveis no rodapé. Sem URL oficial,
  // não navegam e não fingem que a rede está cadastrada.
  for(const rede of ['instagram','youtube','facebook','whatsapp']){
   const node=document.querySelector('[data-akitemm-rede="'+rede+'"]');
   if(!node)continue;
   const url=configLoja.redes?.[rede]||'';
   if(url){
    node.href=url;node.target='_blank';node.rel='noopener noreferrer';
    node.removeAttribute('aria-disabled');node.removeAttribute('tabindex');
    node.title='Abrir '+node.getAttribute('aria-label');
   }else{
    node.removeAttribute('href');node.removeAttribute('target');node.removeAttribute('rel');
    node.setAttribute('aria-disabled','true');node.setAttribute('tabindex','-1');
    node.title='Link oficial ainda não cadastrado';
   }
  }
  const banners=configLoja.banners||[];
  if(banners.length){
   selecionarBanner(0);
   el('akitemmBannerAnterior').hidden=banners.length<2;
   el('akitemmBannerProximo').hidden=banners.length<2;
   if(timerBanner)clearInterval(timerBanner);
   if(banners.length>1)timerBanner=setInterval(()=>{if(document.visibilityState==='visible')selecionarBanner(bannerIndice+1);},6500);
  }
  const suporte=configLoja.informacoes?.suporte;
  if(suporte)el('akitemmTextoSuporte').textContent=suporte;
  mostrarCatalogo();
 }
 function abrirInformacao(tipo){
  const dict={sobre:'Sobre a AKITEMM',privacidade:'Política de Privacidade',
   trocas:'Trocas e Devoluções',contato:'Fale Conosco'};
  el('akitemmInformacaoTitulo').textContent=dict[tipo];
  el('akitemmInformacaoConteudo').textContent=configLoja?.informacoes?.[tipo]||
   'Conteúdo ainda não publicado pela administração da AKITEMM.';
  el('akitemmModalInformacao').showModal();
 }
 async function carregarNotificacoes(){
  try{
   const r=await fetch('/staging/vitrine/loja/comunicados',{
    credentials:'same-origin',cache:'no-store'});
   if(!r.ok)throw Error('indisponível');
   const d=await r.json();
   const lista=Array.isArray(d.itens)&&d.canal==='AKITEMM'?
    d.itens.filter(x=>x.canal==='AKITEMM'&&x.estado==='PUBLICADO'):[];
   avisosGerais=lista.map(x=>
    (x.formato==='BANNER'?'[BANNER] ':'')+x.titulo+': '+x.corpo);
   atualizarSinoAvaliacoes();
  }catch{
   avisosGerais=[];atualizarSinoAvaliacoes();
  }
 }
 async function inicializar(){
  try{
   await Promise.all([carregarCatalogo(),carregarPedidos(),carregarLinkDivulgacaoLoja(),carregarPerfil(),carregarEntrega()]);
   await Promise.allSettled([carregarConfig(),carregarNotificacoes(),carregarNovidadesEditorais(),carregarMeusCursos()]);
   el('conteudoLojaLoop').hidden=false;
   inform(''); // Avisos de laboratório não são conteúdo da vitrine.
   if(catalogoRealSemCheckout)
    el('statusPedidoLoja').textContent=
     'As compras ainda estão indisponíveis até a liberação do pagamento.';
  }catch(e){
   el('conteudoLojaLoop').hidden=true;inform(e.message);
  }
 }
 for(const botao of document.querySelectorAll('[data-akitemm-cor]'))
  botao.addEventListener('click',()=>escolherCor(botao.dataset.akitemmCor));
 el('akitemmFiltroTodos').addEventListener('click',()=>escolherFiltro('todos'));
 el('akitemmFiltroOfertas').addEventListener('click',()=>escolherFiltro('ofertas'));
 el('akitemmAtualizarMeusCursos').addEventListener('click',()=>carregarMeusCursos());
 el('akitemmBusca').addEventListener('input',()=>{
  if(el('akitemmBusca').value.trim()){
   // Busca global não apaga o texto digitado nem herda filtros anteriores.
   escolherFiltro('todos',{preservarBusca:true});
  }else mostrarCatalogo();
 });
 el('akitemmVoltarProdutos').addEventListener('click',()=>{
  fecharDetalhes();
  el('akitemmBusca').focus({preventScroll:true});
  el('akitemmAreaProdutos').scrollIntoView({block:'start',behavior:'instant'});
 });
 el('akitemmCarregarMais').addEventListener('click',()=>{
  if(modoVitrineHorizontal()){
   if(abasExpandidas.has(abaProdutos))abasExpandidas.delete(abaProdutos);
   else abasExpandidas.add(abaProdutos);
  }else quantidadeVitrine+=tamanhoPaginaVitrine();
  mostrarCatalogo();
 });
 el('akitemmAbrirAvaliacoes').addEventListener('click',()=>{
  el('akitemmNotificacoes').hidden=true;
  el('akitemmSino').setAttribute('aria-expanded','false');
  el('akitemmDetalhesPedidos').open=true;
  el('akitemmDetalhesPedidos').scrollIntoView({behavior:'smooth',block:'center'});
 });

 let urlsPrevia=[];
 function liberarPreviaMidias(){
  for(const url of urlsPrevia)URL.revokeObjectURL(url);
  urlsPrevia=[];
 }
 function atualizarPreviaMidias(){
  const destino=el('akitemmPreviaMidias');if(!destino)return;
  liberarPreviaMidias();destino.replaceChildren();
  const imagens=[...el('akitemmFotosAvaliacao').files];
  const videoArquivo=el('akitemmVideoAvaliacao').files[0];
  for(const arquivo of imagens){
   const img=document.createElement('img'),url=URL.createObjectURL(arquivo);
   urlsPrevia.push(url);img.src=url;img.alt='Prévia da fotografia '+arquivo.name;
   destino.append(img);
  }
  if(videoArquivo){
   const video=document.createElement('video'),url=URL.createObjectURL(videoArquivo);
   urlsPrevia.push(url);video.src=url;video.preload='metadata';video.controls=true;
   video.playsInline=true;video.setAttribute('aria-label','Prévia do vídeo selecionado');
   destino.append(video);
  }
 }
 function duracaoVideoSelecionado(arquivo){
  return new Promise((resolve,reject)=>{
   const url=URL.createObjectURL(arquivo),video=document.createElement('video');
   let encerrado=false;
   const timer=setTimeout(()=>concluir(new Error('Não foi possível validar o vídeo. Selecione um MP4 curto.')),10000);
   function concluir(err,segundos){
    if(encerrado)return;
    encerrado=true;clearTimeout(timer);URL.revokeObjectURL(url);
    video.removeAttribute('src');video.load();
    err?reject(err):resolve(segundos);
   }
   video.preload='metadata';
   video.onloadedmetadata=()=>{
    const segundos=video.duration;
    if(!Number.isFinite(segundos)||segundos<=0||segundos>30)
     concluir(new Error('O vídeo precisa ter até 30 segundos.'));
    else concluir(null,segundos);
   };
   video.onerror=()=>concluir(new Error('Vídeo inválido. Use MP4 de até 30 segundos.'));
   video.src=url;
  });
 }
 async function enviarArquivoAvaliacao({pedidoId,produtoId,arquivo,tipo}){
  const caminho='/api/laboratorio/participante/loja/avaliacoes/'+
   encodeURIComponent(pedidoId)+'/'+encodeURIComponent(produtoId)+'/midias';
  const resp=await fetch(caminho,{method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{'Content-Type':arquivo.type,'X-LOOP-LAB':'participante',
    'X-AKITEMM-MIDIA-TIPO':tipo},body:arquivo});
  const dados=await resp.json().catch(()=>({}));
  if(!resp.ok)throw new Error('Falha no envio de '+arquivo.name+': '+(dados.erro||resp.status));
  return dados;
 }
 el('akitemmFotosAvaliacao').addEventListener('change',atualizarPreviaMidias);
 el('akitemmVideoAvaliacao').addEventListener('change',atualizarPreviaMidias);
 el('akitemmModalAvaliacao').addEventListener('close',liberarPreviaMidias);

 el('akitemmFormAvaliacao').addEventListener('submit',async ev=>{
  ev.preventDefault();
  const form=ev.currentTarget;
  if(!form.reportValidity())return;
  const botao=el('akitemmEnviarAvaliacao');
  const fotos=[...el('akitemmFotosAvaliacao').files];
  const video=el('akitemmVideoAvaliacao').files[0]||null;
  const pendente=el('akitemmStatusAvaliacao');
  const soArquivos=form.dataset.somenteMidias==='true';
  const fotosExistentes=Number(form.dataset.fotosExistentes||0);
  const videoExistente=Number(form.dataset.videoExistente||0);
  if(fotos.length+fotosExistentes>3){
   pendente.textContent='Limite: até três fotos por avaliação.';return;
  }
  if(video&&videoExistente){
   pendente.textContent='Só é permitido um vídeo por avaliação.';return;
  }
  if(soArquivos&&!fotos.length&&!video){
   pendente.textContent='Escolha pelo menos uma foto ou um vídeo para enviar.';return;
  }
  for(const foto of fotos){
   if(!['image/jpeg','image/png','image/webp'].includes(foto.type)||foto.size>3*1024*1024){
    pendente.textContent='Cada foto deve ser JPEG, PNG ou WebP, até 3 MB.';return;
   }
  }
  if(video){
   if(video.type!=='video/mp4'||video.size>25*1024*1024){
    pendente.textContent='Use um MP4 de até 25 MB e 30 segundos.';return;
   }
   try{await duracaoVideoSelecionado(video);}
   catch(e){pendente.textContent=e.message;return;}
  }
  botao.disabled=true;
  try{
   if(!soArquivos){
    await api('loja/avaliacoes',{
     pedidoId:form.dataset.pedidoId,produtoId:form.dataset.produtoId,
     nota:Number(el('akitemmAvaliacaoNota').value),
     comentario:el('akitemmAvaliacaoComentario').value
    });
    form.dataset.somenteMidias='true';
    el('akitemmAvaliacaoNota').disabled=true;
    el('akitemmAvaliacaoComentario').disabled=true;
    botao.textContent='Concluir anexos';
   }
   let i=0;
   for(const foto of fotos){
    pendente.textContent='Enviando foto '+(++i)+' de '+fotos.length+'…';
    await enviarArquivoAvaliacao({
     pedidoId:form.dataset.pedidoId,produtoId:form.dataset.produtoId,
     arquivo:foto,tipo:'FOTO'
    });
   }
   if(video){
    pendente.textContent='Enviando vídeo de até 30 segundos…';
    await enviarArquivoAvaliacao({
     pedidoId:form.dataset.pedidoId,produtoId:form.dataset.produtoId,
     arquivo:video,tipo:'VIDEO'
    });
   }
   pendente.textContent='Avaliação e anexos recebidos. Tudo permanecerá privado até a moderação.';
   el('akitemmFotosAvaliacao').value='';
   el('akitemmVideoAvaliacao').value='';
   atualizarPreviaMidias();
   await carregarPedidos();
  }catch(e){
   pendente.textContent=e.message+' A avaliação já salva não será duplicada; se necessário, reabra pelo histórico para completar os anexos.';
   await carregarPedidos().catch(()=>{});
  }
  finally{botao.disabled=false;}
 });
 el('akitemmVerTodos').addEventListener('click',()=>{
  el('akitemmBusca').value='';escolherFiltro('todos');
  el('catalogoLojaLoop').scrollIntoView({block:'nearest',behavior:'smooth'});
 });
 for(const botao of document.querySelectorAll('[data-akitemm-categoria]'))
  botao.addEventListener('click',()=>escolherFiltro(botao.dataset.akitemmCategoria));
 el('akitemmLimparCarrinho').addEventListener('click',()=>{carrinho.clear();atualizarCarrinho();});
 el('akitemmBannerAnterior').addEventListener('click',()=>selecionarBanner(bannerIndice-1));
 el('akitemmBannerProximo').addEventListener('click',()=>selecionarBanner(bannerIndice+1));
 el('akitemmAbrirConta').addEventListener('click',mostrarDadosConta);
 el('akitemmSino').addEventListener('click',()=>{
  el('akitemmDadosConta').hidden=true;
  el('akitemmAbrirConta').setAttribute('aria-expanded','false');
  void carregarNotificacoes();
  const painel=el('akitemmNotificacoes');painel.hidden=!painel.hidden;
  el('akitemmSino').setAttribute('aria-expanded',String(!painel.hidden));
 });
 for(const b of document.querySelectorAll('[data-akitemm-informacao]'))
  b.addEventListener('click',()=>abrirInformacao(b.dataset.akitemmInformacao));
 el('akitemmFormEntrega').addEventListener('submit',async ev=>{
  ev.preventDefault();const f=ev.currentTarget;
  if(!f.reportValidity())return;
  const dados=Object.fromEntries(new FormData(f));
  try{
   const r=await api('loja/entrega',dados);
   enderecoEntrega=r.entrega;
   el('akitemmStatusEntrega').textContent='Endereço de ensaio gravado na sua conta. Será vinculado ao pré-pedido físico, sem frete ou entrega real.';
  }catch(e){el('akitemmStatusEntrega').textContent=e.message;}
 });
 el('copiarDivulgarLojaLoop').addEventListener('click',async()=>{
  if(el('copiarDivulgarLojaLoop').disabled)return;
  try{
   await navigator.clipboard.writeText(el('enderecoDivulgarLojaLoop').value);
   el('statusDivulgarLojaLoop').textContent='Link copiado.';
  }catch{
   el('enderecoDivulgarLojaLoop').focus();el('enderecoDivulgarLojaLoop').select();
   el('statusDivulgarLojaLoop').textContent='Selecione e copie o endereço.';
  }
 });
 el('registrarPedidoLoja').addEventListener('click',async()=>{
  if(catalogoRealSemCheckout){
   el('statusPedidoLoja').textContent='Checkout real ainda não homologado.';return;
  }
  if(!carrinho.size||pedidoEmAndamento)return;
  const escolha=el('akitemmEscolhaLoop');
  const opcao=escolha.querySelector('input[name="akitemmParticiparLoop"]:checked');
  if(!escolha.hidden&&!opcao){
   el('statusPedidoLoja').textContent='Escolha sim ou não: você gostaria de participar do LOOP?';
   escolha.querySelector('input[name="akitemmParticiparLoop"]').focus();
   return;
  }
  const participarLoop=!escolha.hidden&&opcao?.value==='sim';
  const fisicos=[...carrinho.keys()].some(id=>produto(id)?.tipo==='FISICO');
  if(fisicos&&!enderecoEntrega){
   el('akitemmEntrega').open=true;
   el('akitemmStatusEntrega').textContent='Cadastre e salve o endereço antes de finalizar a compra de produtos físicos.';
   el('akitemmEntrega').scrollIntoView({block:'center',behavior:'smooth'});
   return;
  }
  pedidoEmAndamento=true;atualizarCarrinho();
  try{
   const itens=[...carrinho].map(([produtoId,quantidade])=>({produtoId,quantidade}));
   // Convite oculto: requisicao original, sem mudar a regra automatica.
   const r=await api('loja/pedidos',conviteLoopCheckoutAtivo?
    {itens,participarLoop}:{itens});
   carrinho.clear();atualizarCarrinho();await carregarPedidos();
   el('akitemmDetalhesPedidos').open=true;
   el('statusPedidoLoja').textContent='Pedido '+r.pedido.pedidoId+' registrado'+
    (conviteLoopCheckoutAtivo?
     ' ('+(r.pedido.participarLoop?'participação no LOOP escolhida':'compra somente AKITEMM')+')':
     '')+
    '. Pré-pedido salvo sem cobrança gerada pela loja. Consulte Meus pedidos para acompanhar o estado persistido no Asaas Sandbox.';
  }catch(e){el('statusPedidoLoja').textContent=e.message;}
  finally{pedidoEmAndamento=false;atualizarCarrinho();}
 });
 el('atualizarPedidosLoja').addEventListener('click',()=>carregarPedidos().catch(e=>inform(e.message)));
 el('atualizarCatalogoLoja').addEventListener('click',()=>carregarCatalogo().catch(e=>inform(e.message)));
 // Mesmo operador em AKITEMM e LOOP: apenas consulta do cookie
 // assinado no gateway, sem duplicar senha nem liberar endpoints.
 async function atualizarAtalhoOperador(){
  const a=el('akitemmOperadorMais');
  if(!a)return;
  a.hidden=true;a.style.display='none';
  try{
   const r=await fetch('/staging/operador/estado',{
    method:'GET',credentials:'same-origin',cache:'no-store'
   });
   if(!r.ok)return;
   const d=await r.json();
   if(d.operador===true){
    operadorVitrine=true;
    a.hidden=false;a.style.display='inline-flex';
   }
  }catch{}
 }
 void atualizarAtalhoOperador();
 addEventListener('pageshow',()=>void atualizarAtalhoOperador());
 addEventListener('focus',()=>void atualizarAtalhoOperador());
 inicializar();
})();
