'use strict';
// AKITEMM: loja separada visualmente, compartilhando autenticação e motor
// existentes. Valores e pedidos sempre do servidor SQLite, nunca do navegador.
(()=>{
 const el=id=>document.getElementById(id);
 const dinheiro=centavos=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(centavos/100);
 const catalogo=[],carrinho=new Map();
 let referenciaCentavos=25000,pedidoEmAndamento=false,filtro='todos',configLoja=null,bannerIndice=-1;
 let timerBanner=null,enderecoEntrega=null,quantidadeVitrine=12;
 let avaliacoesDisponiveis=[],avisosGerais=[];
 const vazio=document.createElement.bind(document);
 const inform=msg=>{el('estadoLojaLoop').textContent=msg;};
 const fotoPermitida=src=>typeof src==='string'&&
  /^\/imagens\/catalogo\/[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp)$/.test(src);
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
 function fotoDo(p){
  const src=p?.fotos?.find(fotoPermitida);
  return src||null;
 }
 function miniatura(p,classe){
  const div=document.createElement('div');div.className=classe;
  const src=fotoDo(p);
  if(src){
   const img=document.createElement('img');img.src=src;img.alt=p.nome;img.loading='lazy';
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
  el('registrarPedidoLoja').disabled=!carrinho.size||pedidoEmAndamento;
 }
 function adicionar(p){
  const qtd=carrinho.get(p.produtoId)||0;
  if(!qtd&&carrinho.size>=20){el('statusPedidoLoja').textContent='Máximo de 20 produtos diferentes por pedido.';return;}
  if(qtd>=100){el('statusPedidoLoja').textContent='Máximo de 100 unidades por produto.';return;}
  carrinho.set(p.produtoId,qtd+1);
  el('statusPedidoLoja').textContent=p.nome+' adicionado ao carrinho.';
  atualizarCarrinho();
 }

 async function abrirDetalhes(p){
  const alvo=el('akitemmDetalhesConteudo');alvo.replaceChildren();
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
  const tipo=document.createElement('p');tipo.textContent=p.tipo==='PDF'?'Curso / material digital':'Produto físico';
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
  botao.addEventListener('click',()=>{adicionar(p);el('akitemmModalDetalhes').close();});
  informacoes.append(preco,tipo,descricao,caracteristicas,aviso,botao);
  conteudo.append(galeria,informacoes);alvo.append(conteudo);
  const avaliacoes=document.createElement('section');avaliacoes.className='akitemm-detalhe-avaliacoes';
  const title=document.createElement('h3');title.textContent='Avaliações de compradores';
  const lista=document.createElement('div');lista.textContent='Consultando avaliações…';
  avaliacoes.append(title,lista);alvo.append(avaliacoes);
  el('akitemmModalDetalhes').showModal();
  try{
   const r=await api('loja/avaliacoes/'+encodeURIComponent(p.produtoId));
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
  }catch{lista.textContent='Avaliações temporariamente indisponíveis.';}
 }
 function produtosFiltrados(){
  const termo=el('akitemmBusca').value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  const cfg=configLoja||{};
  return catalogo.filter(p=>{
   if(filtro==='ofertas'&&!(cfg.ofertas||[]).includes(p.produtoId))return false;
   if(filtro==='cursos'&&p.tipo!=='PDF')return false;
   if(filtro==='fisicos'&&p.tipo!=='FISICO')return false;
   if(filtro==='novidades'&&!p.novidade)return false;
   if(filtro==='mais-vendidos'&&!(p.quantidadeVendida>0))return false;
   const texto=[p.nome,p.descricao,...(p.detalhes||[])].join(' ').normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
   return !termo||texto.includes(termo);
  }).sort((a,b)=>filtro==='mais-vendidos'?(b.quantidadeVendida||0)-(a.quantidadeVendida||0):0);
 }
 function escolherFiltro(novo){
  filtro=novo;quantidadeVitrine=12;
  el('akitemmFiltroTodos').classList.toggle('selecionado',novo==='todos');
  el('akitemmFiltroTodos').setAttribute('aria-pressed',String(novo==='todos'));
  el('akitemmFiltroOfertas').classList.toggle('selecionado',novo==='ofertas');
  el('akitemmFiltroOfertas').setAttribute('aria-pressed',String(novo==='ofertas'));
  for(const b of document.querySelectorAll('[data-akitemm-categoria]')){
   b.classList.toggle('ativo',b.dataset.akitemmCategoria===novo);
   b.setAttribute('aria-pressed',String(b.dataset.akitemmCategoria===novo));
  }
  el('tituloCatalogoLoja').textContent=({
   todos:'Produtos em destaque',ofertas:'Ofertas',cursos:'Cursos',
   fisicos:'Produtos físicos',novidades:'Novidades', 'mais-vendidos':'Mais vendidos'
  })[novo]||'Produtos em destaque';
  mostrarCatalogo();
 }
 function mostrarCatalogo(){
  const destino=el('catalogoLojaLoop');destino.replaceChildren();
  const filtrados=produtosFiltrados();
  el('akitemmResultadoProdutos').textContent=filtrados.length?'':(
   catalogo.length?'Nenhum produto encontrado neste filtro.':'Nenhum produto publicado ainda.');
  el('referenciaLojaLoop').textContent='Referência do LOOP para compras elegíveis: '+dinheiro(referenciaCentavos)+
   '. Produtos físicos e digitais podem ou não participar, conforme autorização do administrador.';
  el('akitemmCarregarMais').hidden=filtrados.length<=quantidadeVitrine;
  for(const p of filtrados.slice(0,quantidadeVitrine)){
   const card=document.createElement('article');
   const especial=!!p.eventoId&&p.posicoesPorPedidoLoop>1;
   // Classificação imutável compatível com os testes existentes.
   card.className='produto-loja-loop '+(especial?
    'produto-loja-loop-especial':p.elegivelLoop?
     'produto-loja-loop-elegivel':'produto-loja-loop-nao-elegivel');
   const imagem=miniatura(p,'akitemm-imagem-produto');
   if(especial){
    const tarja=document.createElement('strong');tarja.className='tarja-promocao-especial-loop';tarja.textContent='PROMOÇÃO ESPECIAL';
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
    if(!ev.target.closest('button'))abrirDetalhes(p);
   });
   card.addEventListener('keydown',ev=>{
    if(ev.target===card&&(ev.key==='Enter'||ev.key===' ')){
     ev.preventDefault();abrirDetalhes(p);
    }
   });
   card.append(imagem,dados);destino.append(card);
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
   status.textContent=p.situacaoPagamentoFicticio==='AGUARDANDO_FICTICIO'?
    'Aguardando confirmação fictícia do laboratório.':
    p.situacaoPagamentoFicticio==='ESTORNADO_FICTICIO'?'Estorno fictício registrado.':
     p.posicaoCriada?'Posição LOOP criada após confirmação fictícia.':
      p.vendaSomenteLoja?'Compra confirmada na AKITEMM, sem posição LOOP.':
       'Conferência do LOOP pendente.';
   li.append(nome,info,status);
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
  referenciaCentavos=dados.referenciaLoopCentavos;
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
  if(!img.hidden)img.src='/api/laboratorio/participante/foto-perfil';
  else img.removeAttribute('src');
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
  el('statusDivulgarLojaLoop').textContent=l.ativo?'Link AKITEMM ativo.':'Link disponível após primeira compra confirmada.';
 }
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
  if(fotoPermitida(b.imagemCaminho)){
   const imagem=document.createElement('div');imagem.className='akitemm-banner-arte';
   const img=document.createElement('img');img.src=b.imagemCaminho;img.alt=b.titulo;
   img.style.maxWidth='100%';img.style.maxHeight='185px';img.style.objectFit='contain';
   imagem.append(img);container.append(imagem);
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
   const r=await fetch('/api/laboratorio/loop03/publicacoes',{credentials:'same-origin',cache:'no-store'});
   if(!r.ok)throw Error('indisponível');
   const d=await r.json();
   const lista=Array.isArray(d.publicacoes)?d.publicacoes.filter(x=>x.tipo==='AKITEMM'):[];
   avisosGerais=lista.map(x=>x.titulo+': '+x.descricao);
   atualizarSinoAvaliacoes();
  }catch{
   avisosGerais=[];atualizarSinoAvaliacoes();
  }
 }
 async function inicializar(){
  try{
   await Promise.all([carregarCatalogo(),carregarPedidos(),carregarLinkDivulgacaoLoja(),carregarPerfil(),carregarEntrega()]);
   await Promise.allSettled([carregarConfig(),carregarNotificacoes()]);
   el('conteudoLojaLoop').hidden=false;
   inform('Loja AKITEMM em laboratório: pedidos de teste, sem cobrança ou entrega real.');
  }catch(e){
   el('conteudoLojaLoop').hidden=true;inform(e.message);
  }
 }
 el('akitemmFiltroTodos').addEventListener('click',()=>escolherFiltro('todos'));
 el('akitemmFiltroOfertas').addEventListener('click',()=>escolherFiltro('ofertas'));
 el('akitemmBusca').addEventListener('input',mostrarCatalogo);
 el('akitemmCarregarMais').addEventListener('click',()=>{
  quantidadeVitrine+=12;mostrarCatalogo();
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
 el('akitemmSino').addEventListener('click',()=>{
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
   el('akitemmStatusEntrega').textContent='Endereço salvo para o próximo pedido (laboratório).';
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
  if(!carrinho.size||pedidoEmAndamento)return;
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
   const r=await api('loja/pedidos',{itens});
   carrinho.clear();atualizarCarrinho();await carregarPedidos();
   el('akitemmDetalhesPedidos').open=true;
   el('statusPedidoLoja').textContent='Pedido '+r.pedido.pedidoId+' registrado. Pagamento de laboratório ainda pendente. Nenhum Pix ou código de pagamento real foi gerado.';
  }catch(e){el('statusPedidoLoja').textContent=e.message;}
  finally{pedidoEmAndamento=false;atualizarCarrinho();}
 });
 el('atualizarPedidosLoja').addEventListener('click',()=>carregarPedidos().catch(e=>inform(e.message)));
 el('atualizarCatalogoLoja').addEventListener('click',()=>carregarCatalogo().catch(e=>inform(e.message)));
 inicializar();
})();
