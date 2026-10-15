'use strict';

// Padrao de referencia do LOOP, fixado pelo idealizador em 15/10/2026.
// Valores em centavos: somente calculos de laboratorio, sem caixa real.
// Nao alterar historico ja confirmado por uma mudanca de configuracao.
const VALOR_PADRAO_LOOP_CENTAVOS=25000;
const VENDAS_POR_CICLO=5;
const EVENTOS_PARTICIPANTE=3;
const EVENTOS_EMPRESA=2;
const VALOR_CICLO_PARTICIPANTE_CENTAVOS=VALOR_PADRAO_LOOP_CENTAVOS*EVENTOS_PARTICIPANTE;
const VALOR_CICLO_EMPRESA_CENTAVOS=VALOR_PADRAO_LOOP_CENTAVOS*EVENTOS_EMPRESA;

function centavos(x,campo,{positivo=false}={}){
 if(!Number.isSafeInteger(x)||x<0||(positivo&&x===0)){
  throw new TypeError(campo+' deve ser inteiro nao negativo em centavos');
 }
 return x;
}
function somar(a,b,campo){
 const s=a+b;
 if(!Number.isSafeInteger(s))throw new RangeError(campo+' excedeu limite numerico');
 return s;
}
// Uma confirmacao de um PEDIDO = UMA posicao, mesmo com varios itens.
// Somente planejamento: nunca confirma pagamento nem insere na fila.
function analisarCarrinhoSimulado({itens,taxasETributosCentavos=0,
 margemMinimaCentavos=0}={}){
 if(!Array.isArray(itens)||itens.length<1||itens.length>50){
  throw new TypeError('Carrinho de teste precisa de 1 a 50 itens');
 }
 centavos(taxasETributosCentavos,'Taxas');
 centavos(margemMinimaCentavos,'Margem minima');
 let precoTotalCentavos=0,custoFornecedorCentavos=0,unidades=0;
 for(const [i,item] of itens.entries()){
  if(!item||typeof item!=='object'||Array.isArray(item)||
    typeof item.produtoId!=='string'||!/^[a-z0-9-]{3,80}$/.test(item.produtoId)){
   throw new TypeError('Produto de teste invalido na posicao '+i);
  }
  const qtd=item.quantidade;
  if(!Number.isSafeInteger(qtd)||qtd<1||qtd>100){
   throw new TypeError('Quantidade de teste invalida');
  }
  centavos(item.precoUnitarioCentavos,'Preco do produto',{positivo:true});
  centavos(item.custoUnitarioCentavos,'Custo do fornecedor');
  precoTotalCentavos=somar(precoTotalCentavos,
   item.precoUnitarioCentavos*qtd,'Total do pedido');
  custoFornecedorCentavos=somar(custoFornecedorCentavos,
   item.custoUnitarioCentavos*qtd,'Custo de fornecedor');
  unidades=somar(unidades,qtd,'Unidades');
 }
 if(!Number.isSafeInteger(precoTotalCentavos)||
  !Number.isSafeInteger(custoFornecedorCentavos)){
  throw new RangeError('Multiplicacao monetaria excedeu limite numerico');
 }
 const sobraComercialCentavos=precoTotalCentavos-
  VALOR_PADRAO_LOOP_CENTAVOS-custoFornecedorCentavos-taxasETributosCentavos;
 const atingeValorReferencia=precoTotalCentavos>=VALOR_PADRAO_LOOP_CENTAVOS;
 const cobreCustos=atingeValorReferencia&&
  sobraComercialCentavos>=margemMinimaCentavos;
 return {
  modo:'ANALISE_MATEMATICA_DE_CARRINHO_FICTICIO',
  referenciaLoopCentavos:VALOR_PADRAO_LOOP_CENTAVOS,
  precoTotalCentavos,custoFornecedorCentavos,taxasETributosCentavos,
  margemMinimaCentavos,sobraComercialCentavos,
  atingeValorReferencia,cobreCustos,
  botaoCheckoutPodeAparecerPeloValor:atingeValorReferencia,
  resultadoComercialNaoNegativo:cobreCustos,
  alertaMargemInsuficiente:!cobreCustos,
  elegivelNaSimulacao:atingeValorReferencia, // trava comercial: minimo de R$250, apenas.
  // Margem fica como alerta admin e nao bloqueia o carrinho do cliente.
  itensDistintos:itens.length,unidades,projecaoPosicoesSeConfirmado:1,
  criacaoRealDePosicao:false,pagamentoReal:false,
  contemplacaoOuSaqueReal:false
 };
}
module.exports={VALOR_PADRAO_LOOP_CENTAVOS,VENDAS_POR_CICLO,
 EVENTOS_PARTICIPANTE,EVENTOS_EMPRESA,
 VALOR_CICLO_PARTICIPANTE_CENTAVOS,VALOR_CICLO_EMPRESA_CENTAVOS,
 analisarCarrinhoSimulado};
