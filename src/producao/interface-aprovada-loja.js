'use strict';
// Usa a vitrine AKITEMM escolhida, mas não consome catálogo, pedidos ou
// saldos de demonstração. Contas reais têm o mesmo nick do Escritório LOOP.
(async()=>{
 const $=id=>document.getElementById(id);
 const informar=msg=>{$('estadoLojaLoop').textContent=msg;};
 // Nenhuma operação de compra pode ser ativada por código do navegador
 // enquanto não houver backend comercial com fornecedor e PSP homologados.
 for(const seletor of [
  '[data-akitemm-cor]','[data-akitemm-categoria]',
  '#akitemmFiltroOfertas','#akitemmVerTodos','#akitemmCarregarMais',
  '#akitemmLimparCarrinho','#registrarPedidoLoja',
  '#akitemmEscolhaLoop input',
  '#copiarDivulgarLojaLoop','#akitemmFormEntrega input',
  '#akitemmFormEntrega button','#akitemmBusca',
  '#akitemmAbrirAvaliacoes','#akitemmEnviarAvaliacao'
 ]){
  for(const elem of document.querySelectorAll(seletor)){
   elem.disabled=true;
   elem.setAttribute('aria-disabled','true');
  }
 }
 // Catálogo publicado pela administração, nunca produtos ou preços de demo.
 // Ativar somente os filtros de LEITURA, sem fazer carrinho/compra.
 let produtosPublicados=[],categoria='',cor='',termo='';
 const filtrar=()=>{
  const normal=x=>String(x||'').normalize('NFD')
   .replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  const itens=produtosPublicados.filter(p=>
   (!categoria||(categoria==='fisicos'&&p.tipo==='FISICO')||
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
  $('akitemmVisualizacaoProduto').hidden=true;
  for(const p of itens){
   const card=document.createElement('article');
   card.className='produto-loja-loop';
   const tipo=document.createElement('p');
   tipo.className='tipo-loja-loop';
   tipo.textContent=p.tipo==='FISICO'?'Produto físico':'Produto';
   const titulo=document.createElement('h3');
   titulo.textContent=p.titulo;
   const descricao=document.createElement('p');
   descricao.className='akitemm-descricao';
   descricao.textContent=p.descricao||'Informações comerciais em preparação.';
   const status=document.createElement('p');
   status.textContent='Aguardando fornecedor homologado · compra indisponível';
   const botao=document.createElement('button');
   botao.type='button';
   botao.className='botao-secundario-loja';
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
     const forte=document.createElement('strong');
     forte.textContent=etiqueta;
     linha.append(forte,document.createTextNode(valor));
     detalhe.append(linha);
    }
    $('akitemmVisualizacaoProduto').hidden=false;
   });
   card.append(tipo,titulo,descricao,status,botao);
   lista.append(card);
  }
  $('akitemmResultadoProdutos').textContent=itens.length?
   itens.length+' produto(s) publicado(s), sem checkout habilitado.':
   categoria==='mais-vendidos'?'Ainda não há produtos com vendas confirmadas.':
   categoria==='novidades'?'Ainda não há novidades publicadas.':
   'Nenhum produto encontrado para esta busca ou filtro.';
  $('akitemmFiltroTodos').setAttribute('aria-pressed',
   String(!categoria&&!cor&&!termo));
  for(const b of document.querySelectorAll('[data-akitemm-cor]'))
   b.setAttribute('aria-pressed',String(b.dataset.akitemmCor===cor&&!!cor));
  for(const b of document.querySelectorAll('[data-akitemm-categoria]'))
   b.setAttribute('aria-pressed',
    String(b.dataset.akitemmCategoria===categoria&&!!categoria));
 };
 const filtroTodos=()=>{
  categoria='';cor='';termo='';
  $('akitemmBusca').value='';
  filtrar();
 };
 $('akitemmFiltroTodos').addEventListener('click',filtroTodos);
 $('akitemmVerTodos').addEventListener('click',filtroTodos);
 $('akitemmVoltarProdutos').addEventListener('click',()=>{
  $('akitemmVisualizacaoProduto').hidden=true;
 });
 $('akitemmBusca').addEventListener('input',e=>{
  termo=e.target.value.trim().slice(0,120);filtrar();
 });
 for(const b of document.querySelectorAll('[data-akitemm-cor]')){
  b.addEventListener('click',()=>{
   cor=cor===b.dataset.akitemmCor?'':b.dataset.akitemmCor;
   filtrar();
  });
 }
 for(const b of document.querySelectorAll('[data-akitemm-categoria]')){
  b.addEventListener('click',()=>{
   categoria=categoria===b.dataset.akitemmCategoria?'':
    b.dataset.akitemmCategoria;filtrar();
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
      !Array.isArray(dados.produtos)||dados.produtos.length>100||
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
   for(const node of [
    $('akitemmBusca'),$('akitemmVerTodos'),
    ...document.querySelectorAll('[data-akitemm-cor]'),
    ...document.querySelectorAll('[data-akitemm-categoria]')
   ]){
    node.disabled=!ativo;
    node.setAttribute('aria-disabled',String(!ativo));
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
  const lista=$('pedidosLojaLoop');
  if(!lista)return;
  lista.replaceChildren();
  const botao=$('atualizarPedidosLoja');
  if(botao)botao.disabled=true;
  try{
   const resposta=await fetch('/api/loja/pedidos',{
    credentials:'same-origin',cache:'no-store'
   });
   if(resposta.status===401){location.replace('/escritorio');return;}
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
  if(res.status===401){location.replace('/escritorio');return;}
  if(!res.ok)throw Error('IDENTIDADE_INDISPONIVEL');
  const me=await res.json();
  if(typeof me.nick!=='string'||me.financeiroReal!==false)
   throw Error('IDENTIDADE_INCOMPATIVEL');
  if($('akitemmNomeTitular'))$('akitemmNomeTitular').textContent=me.nick;
  informar('AKITEMM: loja conectada à sua conta LOOP. Vendas reais ainda não liberadas.');
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
  await atualizarPedidos();
  await atualizarCatalogo();
 }catch{
  informar('Não foi possível verificar a conta. Volte ao Escritório LOOP e entre novamente.');
  if($('conteudoLojaLoop'))$('conteudoLojaLoop').hidden=true;
 }
})();
