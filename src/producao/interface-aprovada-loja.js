'use strict';
// Usa a vitrine AKITEMM escolhida, mas não consome catálogo, pedidos ou
// saldos de demonstração. Contas reais têm o mesmo nick do Escritório LOOP.
(async()=>{
 const $=id=>document.getElementById(id);
 const nickVisivel=nick=>typeof nick==='string'&&/^(?:vilela|operador)$/i.test(nick)?nick.toUpperCase():nick;
 const informar=msg=>{$('estadoLojaLoop').textContent=msg;};
 // A origem do convite nao e um nick de cliente: permanece ate o cadastro.
 const ref=new URLSearchParams(location.search).get('ref');
 const indicadorNick=typeof ref==='string'&&/^[A-Za-z]{1,12}$/.test(ref)?
  ref.toLowerCase():null;
 const destinoCadastro=()=>'/escritorio?origem=loja&cadastro=1'+
  (indicadorNick?'&ref='+encodeURIComponent(indicadorNick):'');
 const solicitarCadastro=()=>location.assign(destinoCadastro());
 let visitante=true,operadorAtivo=false;
 // A navegacao na vitrine publica independe de login. Acao privada pede conta.
 $('akitemmAbrirConta')?.addEventListener('click',()=>{
  if(visitante)solicitarCadastro();
 });
 $('akitemmAtualizarMeusCursos')?.addEventListener('click',()=>{
  if(visitante)solicitarCadastro();
 });
 // Quando a vitrine real está no domínio principal, o mesmo cookie
 // de operador do gateway permite exibir o + sem duplicar permissões.
 async function atualizarAtalhoOperadorReal(){
  const atalho=$('akitemmOperadorMais');
  const linkRodape=document.querySelector('.akitemm-acesso-operador');
  if(!atalho&&!linkRodape)return;
  const exibir=permitido=>{
   operadorAtivo=permitido;
   for(const link of [atalho,linkRodape]){
    if(!link)continue;
    link.hidden=!permitido;
    link.style.display=permitido?'inline-flex':'none';
   }
  };
  try{
   const r=await fetch('/api/operador/estado',{
    credentials:'same-origin',cache:'no-store'
   });
   const d=r.ok?await r.json():null;
   exibir(d?.operador===true);
  }catch{exibir(false);}
 }
 void atualizarAtalhoOperadorReal();
 addEventListener('pageshow',()=>void atualizarAtalhoOperadorReal());
 addEventListener('focus',()=>void atualizarAtalhoOperadorReal());
 // Nenhuma operação de compra pode ser ativada por código do navegador
 // enquanto não houver backend comercial com fornecedor e PSP homologados.
 for(const seletor of [
  '#akitemmCarregarMais',
  '#akitemmLimparCarrinho','#registrarPedidoLoja',
  '#akitemmEscolhaLoop input',
  '#copiarDivulgarLojaLoop','#akitemmFormEntrega input',
  '#akitemmFormEntrega button',
  '#akitemmAbrirAvaliacoes','#akitemmEnviarAvaliacao'
 ]){
  for(const elem of document.querySelectorAll(seletor)){
   elem.disabled=true;
   elem.setAttribute('aria-disabled','true');
  }
 }
 // Catálogo publicado pela administração, nunca produtos ou preços de demo.
 // Ativar somente os filtros de LEITURA, sem fazer carrinho/compra.
 let produtosPublicados=[],categoria='',cor='',termo='',filtroOfertas=false;
 // Cinco abas, quatro fileiras de dez por aba; inicialmente duas
 // fileiras e o restante na expansão, sem recriar CSS ou molduras.
 let abaVitrine=0;
 const expandidas=new Set();
 const CORES=['ROXO','DOURADO','VERDE','CINZA',
  'CINZA','VERDE','DOURADO','ROXO'];
 const filtrar=()=>{
  const normal=x=>String(x||'').normalize('NFD')
   .replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  const itens=produtosPublicados.filter(p=>
   (!filtroOfertas||p.ofertaAtiva===true)&&
   (!categoria||(categoria==='cursos'&&['CURSO','PDF','DIGITAL'].includes(p.tipo))||
    (categoria==='fisicos'&&p.tipo==='FISICO')||
    (categoria==='novidades'&&p.novidade===true)||
    (categoria==='mais-vendidos'&&p.unidadesConfirmadas>0))&&
   (!cor||p.cor===cor)&&
   (!termo||normal(p.titulo+' '+p.descricao).includes(normal(termo)))
  ).sort((a,b)=>categoria==='mais-vendidos'?
   b.unidadesConfirmadas-a.unidadesConfirmadas||
    a.titulo.localeCompare(b.titulo,'pt-BR'):
   categoria==='novidades'?
    b.criadoEm-a.criadoEm||
     a.titulo.localeCompare(b.titulo,'pt-BR'):0);
  const lista=$('catalogoLojaLoop');
  lista.replaceChildren();
  lista.classList.add('ak-vitrine-horizontal');
  $('akitemmVisualizacaoProduto').hidden=true;
  // Os 200 quadrinhos existem independentemente de produtos publicados.
  // Busca textual exige produto real; os demais filtros mantem molduras vazias.
  const filtrada=!!categoria||!!cor||!!termo||filtroOfertas;
  const produtosPorSlot=new Map(produtosPublicados.filter(p=>
   Number.isSafeInteger(p.posicaoVitrine)&&
   p.posicaoVitrine>=1&&p.posicaoVitrine<=200).map(p=>
   [p.posicaoVitrine,p]));
  const idsFiltrados=new Set(itens.map(p=>p.produtoId));
  const slotsVisiveis=Array.from({length:200},(_,i)=>i+1).filter(n=>{
   const produto=produtosPorSlot.get(n);
   if(produto)return idsFiltrados.has(produto.produtoId);
   if(termo)return false;
   return !cor||CORES[(n-1)%CORES.length]===cor;
  });
  const totalAbas=filtrada?Math.max(1,Math.ceil(slotsVisiveis.length/40)):5;
  if(abaVitrine>=totalAbas)abaVitrine=0;
  let nav=$('akitemmAbasProdutos');
  if(!nav){
   nav=document.createElement('nav');nav.id='akitemmAbasProdutos';
   nav.setAttribute('aria-label','Abas de produtos AKITEMM');
   $('akitemmCarregarMais').after(nav);
  }
  nav.replaceChildren();
  for(let n=0;n<totalAbas;n++){
   const btn=document.createElement('button');
   btn.type='button';btn.textContent=String(n+1);
   btn.setAttribute('aria-label','Aba '+(n+1)+' de '+totalAbas);
   if(n===abaVitrine)btn.setAttribute('aria-current','page');
   btn.addEventListener('click',()=>{
    abaVitrine=n;filtrar();
    $('akitemmAreaProdutos').scrollIntoView({block:'start'});
   });
   nav.append(btn);
  }
  const expandida=expandidas.has(abaVitrine);
  const linhas=expandida?4:2;
  const botaoMais=$('akitemmCarregarMais');
  botaoMais.hidden=filtrada?slotsVisiveis.length<=abaVitrine*40+20:false;
  botaoMais.disabled=false;
  botaoMais.setAttribute('aria-disabled','false');
  botaoMais.textContent=expandida?
   'Mostrar menos produtos ↑':'Mostrar mais produtos ↓';
  const faixas=[];
  for(let linha=0;linha<linhas;linha++){
   const faixa=document.createElement('div');
   faixa.className='ak-faixa-horizontal';
   faixa.tabIndex=0;faixa.setAttribute('role','group');
   faixa.setAttribute('aria-label','Fileira '+(linha+1)+
    ' da aba '+(abaVitrine+1)+'; arraste horizontalmente');
   lista.append(faixa);faixas.push(faixa);
  }
  const inicio=abaVitrine*40,ate=Math.min(slotsVisiveis.length,inicio+linhas*10);
  for(let indice=inicio;indice<ate;indice++){
   const slot=slotsVisiveis[indice];
   const p=produtosPorSlot.get(slot);
   const alvo=faixas[Math.floor((indice-inicio)/10)];
   if(!p){
    const corSlot=CORES[(slot-1)%CORES.length];
    const card=document.createElement('article');
    card.className='produto-loja-loop akitemm-slot-vazio akitemm-slot-'+
     corSlot.toLowerCase();
    card.dataset.akitemmSlot=String(slot);
    card.tabIndex=0;
    card.setAttribute('aria-label','Espaço '+slot+
     ' disponível para produto na aba '+(abaVitrine+1));
    const imagem=document.createElement('div');
    imagem.className='akitemm-imagem-produto';
    const simbolo=document.createElement('span');
    simbolo.className='akitemm-slot-icone';simbolo.textContent='+';
    simbolo.setAttribute('aria-hidden','true');
    imagem.append(simbolo);
    const detalhes=document.createElement('div');
    detalhes.className='akitemm-dados-produto';
    const titulo=document.createElement('strong');
    titulo.textContent='Espaço disponível';
    const subtitulo=document.createElement('small');
    subtitulo.textContent=filtroOfertas?'Sem oferta publicada':
     categoria?'Aguardando produto desta categoria':
     'Aguardando produto cadastrado';
    detalhes.append(titulo,subtitulo);card.append(imagem,detalhes);
    alvo.append(card);continue;
   }
   const card=document.createElement('article');
   card.className='produto-loja-loop '+(p.cor==='ROXO'?
    'produto-loja-loop-especial':p.cor==='DOURADO'?
     'produto-loja-loop-dourado':p.cor==='VERDE'?
      'produto-loja-loop-elegivel':'produto-loja-loop-nao-elegivel');
   card.dataset.produtoId=p.produtoId;
   card.tabIndex=0;card.setAttribute('role','group');
   card.setAttribute('aria-label','Produto '+p.titulo);
   const imagem=document.createElement('div');
   imagem.className='akitemm-imagem-produto';
   const foto=p.fotos?.find(x=>x&&x.posicao===1)||
    (Array.isArray(p.fotos)?p.fotos[0]:null);
   const esperado='/api/loja/produtos/'+p.produtoId+'/foto/';
   if(foto&&typeof foto.url==='string'&&
      foto.url===esperado+foto.posicao&&
      Number.isSafeInteger(foto.posicao)&&foto.posicao>=1&&foto.posicao<=10){
    const img=document.createElement('img');
    img.src=foto.url;img.alt='Fotografia de '+p.titulo;
    img.loading='lazy';img.decoding='async';imagem.append(img);
   }
   const detalhes=document.createElement('div');
   detalhes.className='akitemm-dados-produto';
   const tipo=document.createElement('p');
   tipo.className='tipo-loja-loop';
   tipo.textContent=p.tipo==='FISICO'?'Produto físico':'Produto';
   const titulo=document.createElement('h3');titulo.textContent=p.titulo;
   const descricao=document.createElement('p');
   descricao.className='akitemm-descricao';
   descricao.textContent=p.descricao||'Informações comerciais em preparação.';
   const status=document.createElement('p');
   status.textContent='Aguardando fornecedor homologado · compra indisponível';
   const botao=document.createElement('button');
   botao.type='button';botao.className='botao-secundario-loja';
   botao.textContent='Ver detalhes';
   botao.addEventListener('click',()=>{
    const detalhe=$('akitemmProdutoInlineConteudo');
    detalhe.replaceChildren();
    for(const [etiqueta,valor] of [
     ['Produto: ',p.titulo],
     ['Descrição: ',p.descricao||'Em preparação'],
     ['Situação: ','Sem preço, estoque ou frete homologados.'],
     ['Compra: ','Indisponível até liberação comercial.']
    ]){
     const linha=document.createElement('p');
     const forte=document.createElement('strong');forte.textContent=etiqueta;
     linha.append(forte,document.createTextNode(valor));detalhe.append(linha);
    }
    $('akitemmVisualizacaoProduto').hidden=false;
   });
   detalhes.append(tipo,titulo,descricao,status,botao);
   card.append(imagem,detalhes);alvo.append(card);
  }
  $('akitemmResultadoProdutos').textContent=filtrada?
   (itens.length?itens.length+' resultado(s) para os filtros selecionados.':
    termo?'Nenhum produto encontrado para esta busca.':
    filtroOfertas?'Nenhuma oferta publicada neste filtro.':
    'Nenhum produto publicado neste filtro.'):
   itens.length+' produto(s) publicado(s); cinco abas com quarenta espaços cada.';
  $('akitemmFiltroTodos').setAttribute('aria-pressed',
   String(!categoria&&!cor&&!termo&&!filtroOfertas));
  $('akitemmFiltroOfertas').setAttribute('aria-pressed',String(filtroOfertas));
  for(const b of document.querySelectorAll('[data-akitemm-cor]'))
   b.setAttribute('aria-pressed',String(b.dataset.akitemmCor===cor&&!!cor));
  for(const b of document.querySelectorAll('[data-akitemm-categoria]')){
   const selecionada=b.dataset.akitemmCategoria===categoria&&!!categoria;
   b.setAttribute('aria-pressed',String(selecionada));
   b.classList.toggle('ativo',selecionada);
  }
 };
 $('akitemmCarregarMais').addEventListener('click',()=>{
  if(expandidas.has(abaVitrine))expandidas.delete(abaVitrine);
  else expandidas.add(abaVitrine);
  filtrar();
 });
 const filtroTodos=()=>{
  categoria='';cor='';termo='';filtroOfertas=false;abaVitrine=0;
  $('akitemmBusca').value='';
  filtrar();
 };
 $('akitemmFiltroTodos').addEventListener('click',filtroTodos);
 $('akitemmFiltroOfertas').addEventListener('click',()=>{
  filtroOfertas=!filtroOfertas;abaVitrine=0;filtrar();
 });
 $('akitemmVerTodos').addEventListener('click',filtroTodos);
 $('akitemmVoltarProdutos').addEventListener('click',()=>{
  $('akitemmVisualizacaoProduto').hidden=true;
 });
 $('akitemmBusca').addEventListener('input',e=>{
  termo=e.target.value.trim().slice(0,120);abaVitrine=0;filtrar();
 });
 for(const b of document.querySelectorAll('[data-akitemm-cor]')){
  b.addEventListener('click',()=>{
   cor=cor===b.dataset.akitemmCor?'':b.dataset.akitemmCor;
   abaVitrine=0;filtrar();
  });
 }
 for(const b of document.querySelectorAll('[data-akitemm-categoria]')){
  b.addEventListener('click',()=>{
   categoria=categoria===b.dataset.akitemmCategoria?'':
    b.dataset.akitemmCategoria;abaVitrine=0;filtrar();
  });
 }
 async function atualizarCatalogo(){
  const botao=$('atualizarCatalogoLoja');
  if(botao)botao.disabled=true;
  try{
   const r=await fetch('/api/loja/catalogo',{
    credentials:'same-origin',cache:'no-store'
   });
   if(!r.ok)throw Error('CATALOGO_NAO_HOMOLOGADO');
   const dados=await r.json();
   if(dados.origem!=='CATALOGO_ADMINISTRATIVO_PUBLICADO'||
      dados.checkoutReal!==false||dados.estoqueConfirmado!==false||
      dados.precosNaoHomologados!==true||
      !Array.isArray(dados.produtos)||dados.produtos.length>200||
      dados.produtos.some(p=>
       typeof p.produtoId!=='string'||typeof p.titulo!=='string'||
       typeof p.descricao!=='string'||p.compravel!==false||
       p.checkoutReal!==false||p.precoCentavos!==null||
       p.estoqueConfirmado!==false||p.tipo!=='FISICO'||
       typeof p.novidade!=='boolean'||
       !Number.isSafeInteger(p.criadoEm)||
       !Number.isSafeInteger(p.unidadesConfirmadas)||
       p.unidadesConfirmadas<0||
       !['CINZA','VERDE','DOURADO','ROXO'].includes(p.cor)))
    throw Error('CATALOGO_FORA_DO_CONTRATO');
   produtosPublicados=dados.produtos;
   const ativo=produtosPublicados.length>0;
   // Filtros e categorias sao navegação de leitura: funcionam mesmo com
   // catálogo vazio. Apenas checkout e compra continuam indisponíveis.
   for(const node of [
    $('akitemmBusca'),$('akitemmVerTodos'),$('akitemmFiltroOfertas'),
    ...document.querySelectorAll('[data-akitemm-cor]'),
    ...document.querySelectorAll('[data-akitemm-categoria]')
   ]){
    node.disabled=false;
    node.removeAttribute('aria-disabled');
   }
   $('referenciaLojaLoop').textContent=ativo?
    'Produtos publicados pela AKITEMM. Preços, estoque e compras dependem de homologação dos fornecedores.':
    'Nenhum produto publicado. Compras e pagamentos reais indisponíveis.';
   filtrar();
  }catch{
   produtosPublicados=[];filtrar();
   $('akitemmResultadoProdutos').textContent=
    'Catálogo indisponível. Nenhum produto fictício será exibido.';
  }finally{if(botao)botao.disabled=false;}
 }
 $('atualizarCatalogoLoja').addEventListener('click',
  ()=>void atualizarCatalogo());

 const progresso=$('progressoMinimoLoop')?.closest('.akitemm-progresso');
 if(progresso)progresso.hidden=true;
 const escolha=$('akitemmEscolhaLoop');
 if(escolha)escolha.hidden=true;
 const cartStatus=$('statusPedidoLoja');
 if(cartStatus)cartStatus.textContent='O checkout real ainda não foi liberado.';
 if($('referenciaLojaLoop'))
  $('referenciaLojaLoop').textContent=
   'Produtos, pedidos e pagamentos reais só estarão disponíveis após integração comercial.';
 if($('akitemmResultadoProdutos'))
  $('akitemmResultadoProdutos').textContent='Nenhum produto comercial disponível.';
 if($('catalogoLojaLoop'))$('catalogoLojaLoop').replaceChildren();
 if($('itensLojaLoop'))$('itensLojaLoop').replaceChildren();
 if($('pedidosLojaLoop'))$('pedidosLojaLoop').replaceChildren();
 if($('totalLojaLoop'))$('totalLojaLoop').textContent='Subtotal R$ 0,00';
 if($('akitemmTotalItens'))$('akitemmTotalItens').textContent='0';
 if($('conteudoLojaLoop'))$('conteudoLojaLoop').hidden=false;
 // Aproveita a seção "Meus Pedidos" já aprovada. Somente dados reais do
 // titular; sem backend comercial conectado não mostra pedidos fictícios.
 async function atualizarPedidos(){
  if(visitante){solicitarCadastro();return;}
  const lista=$('pedidosLojaLoop');
  if(!lista)return;
  lista.replaceChildren();
  const botao=$('atualizarPedidosLoja');
  if(botao)botao.disabled=true;
  try{
   const resposta=await fetch('/api/loja/pedidos',{
    credentials:'same-origin',cache:'no-store'
   });
   if(resposta.status===401){solicitarCadastro();return;}
   if(resposta.status===503){
    const item=document.createElement('li');
    item.textContent='Acompanhamento de pedidos reais ainda não habilitado.';
    lista.appendChild(item);return;
   }
   if(!resposta.ok)throw Error('PEDIDOS_INDISPONIVEIS');
   const dados=await resposta.json();
   if(!Array.isArray(dados.pedidos)||
      dados.fonte!=='PEDIDOS_COMERCIAIS_DO_TITULAR')
    throw Error('PEDIDOS_INVALIDOS');
   if(dados.pedidos.length===0){
    const li=document.createElement('li');
    li.textContent='Nenhum pedido comercial registrado nesta conta.';
    lista.appendChild(li);
   }
   const dinheiro=new Intl.NumberFormat('pt-BR',{
    style:'currency',currency:'BRL'
   });
   for(const pedido of dados.pedidos){
    const li=document.createElement('li');
    const remessas=(pedido.remessas||[]).map(x=>
     x.fornecedorId+': '+x.estado
    ).join(' · ');
    li.textContent='Pedido '+pedido.pedidoId+' · '+
     pedido.status+' · '+dinheiro.format(pedido.valorTotalCentavos/100)+
     (remessas?' · Remessas: '+remessas:'');
    lista.appendChild(li);
   }
  }catch{
   const li=document.createElement('li');
   li.textContent='Não foi possível consultar os pedidos agora.';
   lista.appendChild(li);
  }finally{if(botao)botao.disabled=false;}
 }
 const botaoPedidos=$('atualizarPedidosLoja');
 if(botaoPedidos)botaoPedidos.addEventListener('click',()=>{void atualizarPedidos();});
 try{
  const res=await fetch('/api/contas/me',{
   credentials:'same-origin',cache:'no-store'
  });
  const semCliente=res.status===401;
  if(semCliente){
   await atualizarAtalhoOperadorReal();
   visitante=!operadorAtivo;
   if($('akitemmNomeTitular'))
    $('akitemmNomeTitular').textContent=visitante?'Visitante':'OPERADOR';
   if(visitante){
    informar('AKITEMM · vitrine aberta'+
     (indicadorNick?' · convite de @'+nickVisivel(indicadorNick):'')+
     '. Para criar sua conta, toque em Minha conta.');
    const conta=$('akitemmEditarConta');
    if(conta)conta.href=destinoCadastro();
    const voltar=document.querySelector('.akitemm-voltar');
    if(voltar)voltar.href=destinoCadastro();
   }else informar('AKITEMM: catálogo do operador. Pagamentos e pedidos de clientes bloqueados.');
  }else{
   visitante=false;
   if(!res.ok)throw Error('IDENTIDADE_INDISPONIVEL');
   const me=await res.json();
   if(typeof me.nick!=='string'||me.financeiroReal!==false)
    throw Error('IDENTIDADE_INCOMPATIVEL');
   if($('akitemmNomeTitular'))$('akitemmNomeTitular').textContent=nickVisivel(me.nick);
   informar('AKITEMM: loja conectada à sua conta LOOP. Vendas reais ainda não liberadas.');
  }
  // Apenas estado do servidor, sem habilitar controles de compra desativados.
  try{
   const respostaCapacidade=await fetch('/api/loja/capacidade',{
    credentials:'same-origin',cache:'no-store'
   });
   if(respostaCapacidade.ok){
    const capacidade=await respostaCapacidade.json();
    if(capacidade.fonte==='MOTOR_E_RESERVAS_SQLITE'&&
       capacidade.checkoutReal===false&&
       Number.isSafeInteger(capacidade.ativas)&&
       Number.isSafeInteger(capacidade.reservadas)&&
       Number.isSafeInteger(capacidade.disponiveis)&&
       capacidade.ativas+capacidade.reservadas+capacidade.disponiveis===10)
     informar('AKITEMM · capacidade técnica da sua conta: '+
      capacidade.ativas+' posição(ões) ativas, '+
      capacidade.reservadas+' reservada(s), '+
      capacidade.disponiveis+' disponível(is) no motor. '+
      'Checkout e pagamentos reais ainda não habilitados.');
   }
  }catch{
   // Indisponibilidade da leitura nao libera compra nem muda as regras.
  }
  if(!semCliente)await atualizarPedidos();
  else $('pedidosLojaLoop')?.replaceChildren();
  await atualizarCatalogo();
 }catch{
  // A falha de identidade nao fecha a vitrine: dados privados seguem
  // inacessiveis e so a leitura publica de produtos permanece permitida.
  visitante=true;
  informar('AKITEMM · vitrine pública disponível. Entre na sua conta para ações pessoais.');
  if($('conteudoLojaLoop'))$('conteudoLojaLoop').hidden=false;
  await atualizarCatalogo();
 }
})();
