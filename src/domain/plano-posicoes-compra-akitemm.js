'use strict';
// Regra pura para PLANEJAMENTO DE LABORATORIO: nao e pagamento,
// nao ativa posicoes reais e nao traduz cores da loja em cores de filas.
const PISO_VERDE=25000;
const MAXIMO_ATIVAS=10;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function planejarPosicoesCompraAkitemm(itens,{limiteAtivas=MAXIMO_ATIVAS,
 ofertasCompostas=[]}={}){
 if(!Array.isArray(itens)||itens.length<1||itens.length>20||
  !Number.isInteger(limiteAtivas)||limiteAtivas<1||limiteAtivas>MAXIMO_ATIVAS)
  falha('ITENS_PLANEJAMENTO_INVALIDOS');
 if(!Array.isArray(ofertasCompostas)||ofertasCompostas.length>20)
  falha('OFERTAS_COMPOSTAS_INVALIDAS');
 // As ofertas estao congeladas no prepedido pelo servidor, com preco por SKU.
 // Prevenir dupla contagem de um SKU em mais de um pacote e de cada pacote
 // com a classificacao individual de seus componentes.
 const usados=new Set(),pacotes=[],alocados=new Map();
 const mapa=new Map(itens.map(x=>[x?.produtoId,x]));
 const modoAlocacao=ofertasCompostas.some(x=>Object.hasOwn(x,'quantidadePacotes'));
 if(modoAlocacao&&ofertasCompostas.some(x=>
    !Object.hasOwn(x,'quantidadePacotes')))
  falha('OFERTAS_COMPOSTAS_VERSOES_MISTURADAS');
 for(const pacote of ofertasCompostas){
  if(!pacote||typeof pacote!=='object'||!['CINZA','VERDE','DOURADO','ROXO'].includes(pacote.cor)||
     typeof pacote.id!=='string'||!/^[a-z0-9-]{3,80}$/.test(pacote.id)||
     !Number.isSafeInteger(pacote.revisao)||pacote.revisao<1||
     !Number.isSafeInteger(pacote.posicoesPorPedido)||pacote.posicoesPorPedido<0||
     pacote.posicoesPorPedido>MAXIMO_ATIVAS||
     (pacote.cor==='CINZA'&&pacote.posicoesPorPedido!==0)||
     (pacote.cor==='VERDE'&&pacote.posicoesPorPedido!==1)||
     !Array.isArray(pacote.itens)||pacote.itens.length<2||pacote.itens.length>20||
     (modoAlocacao&&(!Number.isSafeInteger(pacote.quantidadePacotes)||
       pacote.quantidadePacotes<1||pacote.quantidadePacotes>50)))
   falha('OFERTA_COMPOSTA_FOTOGRAFIA_INVALIDA');
  let subtotal=0;
  for(const parte of pacote.itens){
   const item=mapa.get(parte?.produtoId);
   if(!item||(!modoAlocacao&&usados.has(parte.produtoId))||
      !Number.isSafeInteger(parte.quantidade)||parte.quantidade<1||
      parte.quantidade>50||item.quantidade<parte.quantidade||
      (modoAlocacao&&parte.quantidade%pacote.quantidadePacotes!==0)||
      item.precoUnitarioCentavos!==parte.precoUnitarioCentavos||
      parte.subtotalCentavos!==parte.quantidade*parte.precoUnitarioCentavos)
    falha('OFERTA_COMPOSTA_COMPONENTE_INVALIDO');
   const acumulado=(alocados.get(parte.produtoId)||0)+parte.quantidade;
   if(acumulado>item.quantidade)
    falha('OFERTA_COMPOSTA_QUANTIDADE_EXCEDIDA');
   alocados.set(parte.produtoId,acumulado);
   usados.add(parte.produtoId);
   subtotal+=parte.subtotalCentavos;
  }
  if(!Number.isSafeInteger(subtotal)||subtotal!==pacote.totalPacoteCentavos||
     (pacote.cor==='DOURADO'&&pacote.posicoesPorPedido>0&&
      subtotal/(pacote.quantidadePacotes||1)<PISO_VERDE))
   falha('OFERTA_COMPOSTA_VALOR_INVALIDO');
  pacotes.push(pacote);
 }
 let valorVerde=0,valorTotal=0,douradas=0,roxas=0,pendenciasRoxo=0;
 const detalhamento=[];
 for(const pacote of pacotes){
  if(pacote.cor==='VERDE')valorVerde+=pacote.totalPacoteCentavos;
  const repeticoes=pacote.quantidadePacotes||1;
  if(pacote.cor==='DOURADO')douradas+=pacote.posicoesPorPedido*repeticoes;
  if(pacote.cor==='ROXO'){
   roxas+=pacote.posicoesPorPedido*repeticoes;
   if(pacote.posicoesPorPedido===0)pendenciasRoxo++;
  }
 }
 for(const item of itens){
  const {produtoId,quantidade,precoUnitarioCentavos,subtotalCentavos}=item||{};
  if(typeof produtoId!=='string'||!/^[a-z0-9-]{3,80}$/.test(produtoId)||
   !Number.isSafeInteger(quantidade)||quantidade<1||quantidade>50||
   !Number.isSafeInteger(precoUnitarioCentavos)||precoUnitarioCentavos<=0||
   !Number.isSafeInteger(subtotalCentavos)||
   subtotalCentavos!==quantidade*precoUnitarioCentavos)
   falha('ITEM_PLANEJAMENTO_INVALIDO');
  const cor=item.classificacao==='EVENTO'?'ROXO':item.classificacao;
  const minimo=item.minimo??item.quantidadeMinimaLoop??1;
  if(!['CINZA','VERDE','DOURADO','ROXO'].includes(cor)||
   !Number.isSafeInteger(minimo)||minimo<1||minimo>50)
   falha('CLASSIFICACAO_PLANEJAMENTO_INVALIDA');
  valorTotal+=subtotalCentavos;
  if(!Number.isSafeInteger(valorTotal))falha('TOTAL_PLANEJAMENTO_EXCEDIDO');
  let quantidadePosicoes=0;
  const quantidadeLivre=modoAlocacao?
   quantidade-(alocados.get(produtoId)||0):(!usados.has(produtoId)?quantidade:0);
  const subtotalLivre=quantidadeLivre*precoUnitarioCentavos;
  const calcularLivre=quantidadeLivre>0;
  if(calcularLivre&&cor==='VERDE'&&quantidadeLivre>=minimo)
   valorVerde+=subtotalLivre;
  if(calcularLivre&&cor==='DOURADO'){
   const modo=item.modoDourado??'POR_UNIDADE';
   if(!['POR_UNIDADE','POR_PEDIDO'].includes(modo))
    falha('MODO_DOURADO_INVALIDO');
   if(modo==='POR_PEDIDO'){
    const porPedido=item.posicoesPorPedidoDourado;
    if(!Number.isSafeInteger(porPedido)||porPedido<0||porPedido>MAXIMO_ATIVAS)
     falha('REGRA_DOURADO_POR_PEDIDO_INVALIDA');
    if(BigInt(precoUnitarioCentavos)*BigInt(minimo)<BigInt(PISO_VERDE))
     falha('DOURADO_PACOTE_SEM_PISO');
    if(quantidadeLivre>=minimo){douradas+=porPedido;quantidadePosicoes=porPedido;}
   }else{
    if(precoUnitarioCentavos<PISO_VERDE)falha('DOURADO_SEM_PISO_UNITARIO');
    if(quantidadeLivre>=minimo){douradas+=quantidadeLivre;quantidadePosicoes=quantidadeLivre;}
   }
  }
  if(calcularLivre&&cor==='ROXO'&&item.modoRoxo==='POR_PEDIDO'){
   const minimoPedido=item.quantidadeMinimaRoxo;
   const posicoesPedido=item.posicoesPorPedidoRoxo;
   if(!Number.isSafeInteger(minimoPedido)||minimoPedido<1||minimoPedido>50||
      !Number.isSafeInteger(posicoesPedido)||posicoesPedido<0||
      posicoesPedido>MAXIMO_ATIVAS)
    falha('REGRA_ROXO_POR_PEDIDO_INVALIDA');
   // Uma compra de 5 ou 10 tenis qualifica UMA vez, nao por unidade.
   // Um pedido com 4 tenis e compra comum: nao cria posicao nem pendencia.
   if(posicoesPedido===0)pendenciasRoxo+=quantidadeLivre;
   else if(quantidadeLivre>=Math.max(minimo,minimoPedido)){
    quantidadePosicoes=posicoesPedido;
    roxas+=quantidadePosicoes;
   }
  }else if(calcularLivre&&cor==='ROXO'){
   if(item.modoRoxo!==undefined&&item.modoRoxo!=='POR_UNIDADE')
    falha('MODO_ROXO_INVALIDO');
   const configuradas=item.posicoesPorUnidadeRoxo??0;
   if(!Number.isSafeInteger(configuradas)||configuradas<0||configuradas>MAXIMO_ATIVAS)
    falha('POSICOES_ROXO_INVALIDAS');
   if(configuradas===0)pendenciasRoxo+=quantidadeLivre;
   else if(quantidadeLivre>=minimo){
    quantidadePosicoes=configuradas*quantidadeLivre;roxas+=quantidadePosicoes;
   }
  }
  detalhamento.push({produtoId,classificacao:cor,quantidade,
   subtotalCentavos,quantidadePosicoes,
   ...(usados.has(produtoId)?{componentePacoteComposto:true}:{}),
   ...(modoAlocacao&&usados.has(produtoId)?
    {quantidadeAlocadaPacotes:alocados.get(produtoId),
     quantidadeLivre}:{}),
   // Preservar assinatura dos planejamentos antigos: o motor compara
   // JSON historico byte a byte antes de vincular qualquer pedido.
   ...(cor==='DOURADO'&&item.modoDourado==='POR_PEDIDO'?
    {modoDourado:'POR_PEDIDO',
     posicoesPorPedidoDourado:item.posicoesPorPedidoDourado}:{}),
   ...(cor==='ROXO'?{modoRoxo:item.modoRoxo||'POR_UNIDADE',
    quantidadeMinimaRoxo:item.modoRoxo==='POR_PEDIDO'?item.quantidadeMinimaRoxo:1}:{}),
   consideradoVerdeCentavos:
   calcularLivre&&cor==='VERDE'&&quantidadeLivre>=minimo?
    subtotalLivre:0});
 }
 const verdes=valorVerde>=PISO_VERDE?1:0;
 const quantidadePosicoesPrevistas=verdes+douradas+roxas;
 return {apenasPlanejamento:true,limiteAtivas,
  valorTotalCentavos:valorTotal,valorVerdeConsideradoCentavos:valorVerde,
  referenciaVerdeAtingida:verdes===1,
  posicoesVerde:verdes,posicoesDourado:douradas,posicoesRoxo:roxas,
  quantidadePosicoesPrevistas,pendenciasConfiguracaoRoxo:pendenciasRoxo,
  excedeLimitePorPedido:quantidadePosicoesPrevistas>limiteAtivas,
  podeVincularEnsaio:quantidadePosicoesPrevistas>0&&pendenciasRoxo===0&&
   quantidadePosicoesPrevistas<=limiteAtivas,
  detalhamento,
  ...(pacotes.length?{ofertasCompostasPlanejadas:pacotes.map(x=>({
   id:x.id,revisao:x.revisao,cor:x.cor,posicoesPorPedido:x.posicoesPorPedido,
   ...(modoAlocacao?{quantidadePacotes:x.quantidadePacotes}:{}),
   totalPacoteCentavos:x.totalPacoteCentavos
  }))}:{}),
  direitosReaisCriados:0,pagamentoConfirmado:false};
}
module.exports={planejarPosicoesCompraAkitemm,PISO_VERDE,MAXIMO_ATIVAS};
