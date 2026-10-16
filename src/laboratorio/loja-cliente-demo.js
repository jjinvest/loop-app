'use strict';
(()=>{
 const el=id=>document.getElementById(id);
 const dinheiro=valor=>new Intl.NumberFormat('pt-BR',{
  style:'currency',currency:'BRL'
 }).format(valor/100);
 const catalogo=[];
 const carrinho=new Map();
 let pedidoEmAndamento=false;
 let referenciaCentavos=25000;

 async function api(caminho,body){
  const resposta=await fetch('/api/laboratorio/participante/'+caminho,{
   method:body===undefined?'GET':'POST',
   credentials:'same-origin',cache:'no-store',
   headers:body===undefined?{}:{
    'Content-Type':'application/json','X-LOOP-LAB':'participante'
   },
   body:body===undefined?undefined:JSON.stringify(body)
  });
  const resultado=await resposta.json();
  if(!resposta.ok){
   const erro=new Error(resposta.status===401?
    'A sessão expirou. Entre pelo Meu Escritório para usar a loja.':
    'A operação não foi concluída: '+(resultado.erro||resposta.status));
   erro.status=resposta.status;
   throw erro;
  }
  return resultado;
 }
 function produto(id){return catalogo.find(p=>p.produtoId===id);}
 function informar(mensagem){el('estadoLojaLoop').textContent=mensagem;}
 function atualizarCarrinho(){
  const destino=el('itensLojaLoop');
  destino.replaceChildren();
  let total=0,totalElegivel=0;
  for(const [id,quantidade] of carrinho){
   const p=produto(id);
   if(!p){carrinho.delete(id);continue;}
   const div=document.createElement('div');
   div.className='item-carrinho-loja';
   const titulo=document.createElement('strong');
   titulo.textContent=p.nome;
   const label=document.createElement('label');
   label.textContent='Quantidade';
   const campo=document.createElement('input');
   campo.type='number';campo.min='1';campo.max='100';campo.step='1';
   campo.value=String(quantidade);campo.setAttribute('aria-label','Quantidade de '+p.nome);
   campo.addEventListener('change',()=>{
    const valor=Number(campo.value);
    if(!Number.isSafeInteger(valor)||valor<1||valor>100){
     campo.value=String(carrinho.get(id));return;
    }
    carrinho.set(id,valor);atualizarCarrinho();
   });
   label.append(campo);
   const subtotal=document.createElement('span');
   subtotal.textContent=dinheiro(p.precoCentavos*quantidade);
   const regra=document.createElement('small');
   regra.className='regra-item-loja-loop';
   if(!p.elegivelLoop)regra.textContent='Este item não conta para posições do LOOP.';
   else if(quantidade<p.quantidadeMinimaLoop)
    regra.textContent='É necessário comprar '+p.quantidadeMinimaLoop+
     ' unidades deste produto no mesmo pedido para contar no LOOP.';
   else regra.textContent='Quantidade suficiente: o subtotal deste item conta para o LOOP.';
   total+=p.precoCentavos*quantidade;
   if(p.elegivelLoop&&quantidade>=p.quantidadeMinimaLoop)
    totalElegivel+=p.precoCentavos*quantidade;
   const remover=document.createElement('button');
   remover.type='button';remover.className='botao-secundario-loja';
   remover.textContent='Remover';
   remover.addEventListener('click',()=>{
    carrinho.delete(id);atualizarCarrinho();
   });
   div.append(titulo,label,subtotal,regra,remover);
   destino.append(div);
  }
  if(!carrinho.size){
   const vazio=document.createElement('p');
   vazio.textContent='Seu carrinho está vazio.';
   destino.append(vazio);
  }
  el('totalLojaLoop').textContent='Total da compra: '+dinheiro(total)+
   ' · Produtos válidos para o LOOP: '+dinheiro(totalElegivel)+
   ' · Mínimo da posição: '+dinheiro(referenciaCentavos)+
   (totalElegivel>=referenciaCentavos?' · Pode gerar uma posição após confirmação':
    ' · Não atinge o mínimo da posição');
  el('registrarPedidoLoja').disabled=!carrinho.size||pedidoEmAndamento;
 }
 function adicionar(p){
  const quantidade=carrinho.get(p.produtoId)||0;
  if(quantidade===0&&carrinho.size>=20){
   el('statusPedidoLoja').textContent='O máximo de produtos diferentes é 20 por pedido.';
   return;
  }
  if(quantidade>=100){
   el('statusPedidoLoja').textContent='O máximo por produto é 100 unidades.';
   return;
  }
  carrinho.set(p.produtoId,quantidade+1);
  el('statusPedidoLoja').textContent=p.nome+' adicionado ao carrinho.';
  atualizarCarrinho();
 }
 function mostrarCatalogo(){
  const destino=el('catalogoLojaLoop');
  destino.replaceChildren();
  el('referenciaLojaLoop').textContent='Referência atual do LOOP: '+
   dinheiro(referenciaCentavos)+' por pedido confirmado.';
  if(!catalogo.length){
   const vazio=document.createElement('p');
   vazio.textContent='Nenhum produto publicado no catálogo de testes.';
   destino.append(vazio);
  }
  for(const p of catalogo){
   const card=document.createElement('article');card.className='produto-loja-loop';
   const tipo=document.createElement('span');tipo.className='tipo-loja-loop';
   tipo.textContent=p.tipo==='PDF'?'Curso PDF':'Produto físico';
   const titulo=document.createElement('h3');titulo.textContent=p.nome;
   const aviso=document.createElement('small');
   aviso.className='tipo-loja-loop';
   aviso.textContent=p.elegivelLoop?
    (p.quantidadeMinimaLoop===1?'Conta para gerar posição no LOOP':
     'Conta para o LOOP somente a partir de '+p.quantidadeMinimaLoop+
      ' unidade(s) no mesmo pedido'):
    'Produto só da loja: não conta para a posição';
   const preco=document.createElement('p');preco.className='preco-loja-loop';
   preco.textContent=dinheiro(p.precoCentavos);
   const botao=document.createElement('button');botao.type='button';
   botao.textContent='Adicionar ao carrinho';
   botao.addEventListener('click',()=>adicionar(p));
   card.append(tipo,titulo,preco,aviso,botao);destino.append(card);
  }
  atualizarCarrinho();
 }
 function mostrarPedidos(pedidos){
  const lista=el('pedidosLojaLoop');lista.replaceChildren();
  if(!pedidos.length){
   const li=document.createElement('li');
   li.textContent='Você ainda não registrou pedidos de teste.';
   lista.append(li);return;
  }
  for(const pedido of pedidos){
   const li=document.createElement('li');
   const titulo=document.createElement('strong');
   titulo.textContent='Pedido '+pedido.pedidoId+' · '+dinheiro(pedido.totalCentavos);
   const itens=document.createElement('small');
   itens.textContent=pedido.itens.map(i=>i.quantidade+' × '+i.nome+
    (i.elegivelLoop&&i.quantidade<i.quantidadeMinimaLoop?
     ' (não alcançou o mínimo do produto para LOOP)':'')).join(' + ')+
    ' · Total válido para LOOP: '+dinheiro(pedido.totalElegivelLoopCentavos);
   const status=document.createElement('span');
   if(pedido.situacaoPagamentoFicticio==='AGUARDANDO_FICTICIO')
    status.textContent='Aguardando confirmação fictícia do laboratório.';
   else if(pedido.situacaoPagamentoFicticio==='ESTORNADO_FICTICIO')
    status.textContent='Estorno fictício registrado; verificar eventual posição.';
   else if(pedido.posicaoCriada)
    status.textContent='Compra qualificada: posição LOOP nº '+
      pedido.posicaoId+' criada. Veja a cor no Meu Escritório.';
   else if(pedido.vendaSomenteLoja)
    status.textContent='Compra de loja confirmada no teste, sem posição LOOP.';
   else status.textContent='Confirmação fictícia registrada; conferência do LOOP pendente.';
   li.append(titulo,itens,status);lista.append(li);
  }
 }
 async function carregarPedidos(){
  const resposta=await api('loja/pedidos');
  mostrarPedidos(resposta.pedidos);
 }
 async function carregarCatalogo(){
  const dados=await api('loja/catalogo');
  catalogo.splice(0,catalogo.length,...dados.produtos);
  referenciaCentavos=dados.referenciaLoopCentavos;
  mostrarCatalogo();
 }
 async function inicializar(){
  try{
   await Promise.all([carregarCatalogo(),carregarPedidos()]);
   el('conteudoLojaLoop').hidden=false;
   informar('Loja de demonstração pronta. Nenhum pagamento real é realizado.');
  }catch(err){
   el('conteudoLojaLoop').hidden=true;
   informar(err.message);
  }
 }
 el('registrarPedidoLoja').addEventListener('click',async()=>{
  if(pedidoEmAndamento||!carrinho.size)return;
  pedidoEmAndamento=true;atualizarCarrinho();
  const status=el('statusPedidoLoja');
  try{
   const itens=[...carrinho].map(([produtoId,quantidade])=>({produtoId,quantidade}));
   const resposta=await api('loja/pedidos',{itens});
   carrinho.clear();
   atualizarCarrinho();
   await carregarPedidos();
   status.textContent='Pedido '+resposta.pedido.pedidoId+
    ' registrado por '+dinheiro(resposta.pedido.totalCentavos)+
    '. Aguarda confirmação fictícia. Nenhuma posição criada neste momento.';
  }catch(err){status.textContent=err.message;}
  finally{pedidoEmAndamento=false;atualizarCarrinho();}
 });
 el('atualizarPedidosLoja').addEventListener('click',()=>{
  carregarPedidos().catch(e=>informar(e.message));
 });
 el('atualizarCatalogoLoja').addEventListener('click',()=>{
  carregarCatalogo().catch(e=>informar(e.message));
 });
 inicializar();
})();