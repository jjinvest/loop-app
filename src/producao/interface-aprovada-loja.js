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
  '#akitemmEscolhaLoop input','#atualizarPedidosLoja',
  '#copiarDivulgarLojaLoop','#akitemmFormEntrega input',
  '#akitemmFormEntrega button','#akitemmBusca',
  '#akitemmAbrirAvaliacoes','#akitemmEnviarAvaliacao'
 ]){
  for(const elem of document.querySelectorAll(seletor)){
   elem.disabled=true;
   elem.setAttribute('aria-disabled','true');
  }
 }
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
 }catch{
  informar('Não foi possível verificar a conta. Volte ao Escritório LOOP e entre novamente.');
  if($('conteudoLojaLoop'))$('conteudoLojaLoop').hidden=true;
 }
})();
