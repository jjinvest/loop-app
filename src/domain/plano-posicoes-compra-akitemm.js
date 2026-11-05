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
   if(precoUnitarioCentavos<PISO_VERDE)falha('DOURADO_SEM_PISO_UNITARIO');
   douradas+=quantidade;quantidadePosicoes=quantidade;
  }
  if(cor==='ROXO'){
   const configuradas=item.posicoesPorUnidadeRoxo??0;
   if(!Number.isSafeInteger(configuradas)||configuradas<0||configuradas>MAXIMO_ATIVAS)
    falha('POSICOES_ROXO_INVALIDAS');
   if(configuradas===0)pendenciasRoxo+=quantidade;
   else {quantidadePosicoes=configuradas*quantidade;roxas+=quantidadePosicoes;}
  }
  detalhamento.push({produtoId,classificacao:cor,quantidade,
   subtotalCentavos,quantidadePosicoes,consideradoVerdeCentavos:
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
