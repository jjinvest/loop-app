'use strict';
// Regra pura para PLANEJAMENTO DE LABORATORIO: nao e pagamento,
// nao ativa posicoes reais e nao traduz cores da loja em cores de filas.
const PISO_VERDE=25000;
const MAXIMO_ATIVAS=10;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function planejarPosicoesCompraAkitemm(itens,{limiteAtivas=MAXIMO_ATIVAS}={}){
 if(!Array.isArray(itens)||itens.length<1||itens.length>20||
  !Number.isInteger(limiteAtivas)||limiteAtivas<1||limiteAtivas>MAXIMO_ATIVAS)
  falha('ITENS_PLANEJAMENTO_INVALIDOS');
 let valorVerde=0,valorTotal=0,douradas=0,roxas=0,pendenciasRoxo=0;
 const detalhamento=[];
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
  if(cor==='VERDE'&&quantidade>=minimo)valorVerde+=subtotalCentavos;
  if(cor==='DOURADO'){
   const modo=item.modoDourado??'POR_UNIDADE';
   if(!['POR_UNIDADE','POR_PEDIDO'].includes(modo))
    falha('MODO_DOURADO_INVALIDO');
   if(modo==='POR_PEDIDO'){
    const porPedido=item.posicoesPorPedidoDourado;
    if(!Number.isSafeInteger(porPedido)||porPedido<0||porPedido>MAXIMO_ATIVAS)
     falha('REGRA_DOURADO_POR_PEDIDO_INVALIDA');
    if(BigInt(precoUnitarioCentavos)*BigInt(minimo)<BigInt(PISO_VERDE))
     falha('DOURADO_PACOTE_SEM_PISO');
    if(quantidade>=minimo){douradas+=porPedido;quantidadePosicoes=porPedido;}
   }else{
    if(precoUnitarioCentavos<PISO_VERDE)falha('DOURADO_SEM_PISO_UNITARIO');
    if(quantidade>=minimo){douradas+=quantidade;quantidadePosicoes=quantidade;}
   }
  }
  if(cor==='ROXO'&&item.modoRoxo==='POR_PEDIDO'){
   const minimoPedido=item.quantidadeMinimaRoxo;
   const posicoesPedido=item.posicoesPorPedidoRoxo;
   if(!Number.isSafeInteger(minimoPedido)||minimoPedido<1||minimoPedido>50||
      !Number.isSafeInteger(posicoesPedido)||posicoesPedido<0||
      posicoesPedido>MAXIMO_ATIVAS)
    falha('REGRA_ROXO_POR_PEDIDO_INVALIDA');
   // Uma compra de 5 ou 10 tenis qualifica UMA vez, nao por unidade.
   // Um pedido com 4 tenis e compra comum: nao cria posicao nem pendencia.
   if(posicoesPedido===0)pendenciasRoxo+=quantidade;
   else if(quantidade>=Math.max(minimo,minimoPedido)){
    quantidadePosicoes=posicoesPedido;
    roxas+=quantidadePosicoes;
   }
  }else if(cor==='ROXO'){
   if(item.modoRoxo!==undefined&&item.modoRoxo!=='POR_UNIDADE')
    falha('MODO_ROXO_INVALIDO');
   const configuradas=item.posicoesPorUnidadeRoxo??0;
   if(!Number.isSafeInteger(configuradas)||configuradas<0||configuradas>MAXIMO_ATIVAS)
    falha('POSICOES_ROXO_INVALIDAS');
   if(configuradas===0)pendenciasRoxo+=quantidade;
   else if(quantidade>=minimo){
    quantidadePosicoes=configuradas*quantidade;roxas+=quantidadePosicoes;
   }
  }
  detalhamento.push({produtoId,classificacao:cor,quantidade,
   subtotalCentavos,quantidadePosicoes,
   // Preservar assinatura dos planejamentos antigos: o motor compara
   // JSON historico byte a byte antes de vincular qualquer pedido.
   ...(cor==='DOURADO'&&item.modoDourado==='POR_PEDIDO'?
    {modoDourado:'POR_PEDIDO',
     posicoesPorPedidoDourado:item.posicoesPorPedidoDourado}:{}),
   ...(cor==='ROXO'?{modoRoxo:item.modoRoxo||'POR_UNIDADE',
    quantidadeMinimaRoxo:item.modoRoxo==='POR_PEDIDO'?item.quantidadeMinimaRoxo:1}:{}),
   consideradoVerdeCentavos:
   cor==='VERDE'&&quantidade>=minimo?subtotalCentavos:0});
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
  detalhamento,direitosReaisCriados:0,pagamentoConfirmado:false};
}
module.exports={planejarPosicoesCompraAkitemm,PISO_VERDE,MAXIMO_ATIVAS};
