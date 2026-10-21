'use strict';
// AKITEMM: loja separada visualmente, compartilhando autenticação e motor
// existentes. Valores e pedidos sempre do servidor SQLite, nunca do navegador.
(()=>{
 const el=id=>document.getElementById(id);
 const dinheiro=centavos=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(centavos/100);
 const catalogo=[],carrinho=new Map();
 let referenciaCentavos=25000,pedidoEmAndamento=false,filtro='todos',configLoja=null,bannerIndice=-1;
 let timerBanner=null,enderecoEntrega=null;
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
   remover.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v7M14 10v7"/></svg>';
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
 function abrirDetalhes(p){
  const alvo=el('akitemmDetalhesConteudo');alvo.replaceChildren();
  const h=document.createElement('h2');h.textContent=p.nome;alvo.append(h);
  const src=fotoDo(p);
  if(src){const img=document.createElement('img');img.className='akitemm-modal-imagem';img.src=src;img.alt=p.nome;alvo.append(img);}
  if(p.descricao){
   const parag=document.createElement('p');parag.textContent=p.descricao;alvo.append(parag);
  }
  const tipo=document.createElement('p');
  tipo.textContent=p.tipo==='PDF'?'Curso / material digital':'Produto físico';alvo.append(tipo);
  if(Array.isArray(p.detalhes)&&p.detalhes.length){
   const list=document.createElement('ul');
   for(const d of p.detalhes){const li=document.createElement('li');li.textContent=d;list.append(li);}
   alvo.append(list);
  }
  const preco=document.createElement('strong');preco.textContent=dinheiro(p.precoCentavos);alvo.append(preco);
  const nota=document.createElement('p');
  nota.textContent=p.elegivelLoop?
   'Produto qualificado para o LOOP conforme quantidade e referência da compra; confirmação individual continua obrigatória.':
   'Compra comum na AKITEMM, sem posição no LOOP.';
  alvo.append(nota);
  const botao=document.createElement('button');botao.type='button';botao.className='akitemm-adicionar';
  botao.textContent='Adicionar ao carrinho';botao.addEventListener('click',()=>{adicionar(p);el('akitemmModalDetalhes').close();});
  alvo.append(botao);el('akitemmModalDetalhes').showModal();
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
  filtro=novo;
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
  for(const p of filtrados){
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
   li.append(nome,info,status);lista.append(li);
  }
 }
 async function carregarPedidos(){const r=await api('loja/pedidos');mostrarPedidos(r.pedidos);}
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
  for(const [rede,url] of Object.entries(configLoja.redes||{})){
   const node=document.querySelector('[data-akitemm-rede="'+rede+'"]');
   if(node&&url){node.href=url;node.target='_blank';node.rel='noopener noreferrer';node.hidden=false;}
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
   el('akitemmContagemSino').textContent=lista.length?String(lista.length):'';
   el('akitemmContagemSino').hidden=!lista.length;
   el('akitemmNotificacoesConteudo').textContent=lista.length?
    lista.map(x=>x.titulo+': '+x.descricao).join('\n'):'Nenhuma notificação por enquanto.';
  }catch{el('akitemmNotificacoesConteudo').textContent='Notificações temporariamente indisponíveis.';}
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
