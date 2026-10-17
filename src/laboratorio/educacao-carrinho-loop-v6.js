'use strict';

// Regras publicas de orientacao da AKITEMM. Nenhum custo ou margem da empresa.
// Um pedido e uma unica cobranca; compras de pedidos distintos NAO acumulam.
(function(raiz,criar){
 const api=criar();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(raiz&&typeof window!=='undefined')raiz.EducacaoCarrinhoLoopV6=api;
})(typeof globalThis==='object'?globalThis:null,()=>{
 function validarInteiro(valor,nome){
  if(!Number.isSafeInteger(valor)||valor<0)throw new TypeError(nome+' invalido');
  return valor;
 }
 function orientar({itens=0,totalElegivelCentavos=0,referenciaCentavos=25000,
  valorPacoteEspecialCentavos=0,quantidadePosicoesPacote=6}={}){
  validarInteiro(itens,'itens');
  validarInteiro(totalElegivelCentavos,'totalElegivel');
  validarInteiro(referenciaCentavos,'referencia');
  validarInteiro(valorPacoteEspecialCentavos,'pacote');
  if(referenciaCentavos<1||!Number.isSafeInteger(quantidadePosicoesPacote)||
    quantidadePosicoesPacote<2||quantidadePosicoesPacote>6)
   throw new TypeError('regra de pacote invalida');
  const minimo=valorPacoteEspecialCentavos>0?
   referenciaCentavos*quantidadePosicoesPacote:referenciaCentavos;
  const progresso=Math.min(minimo,
   valorPacoteEspecialCentavos>0?valorPacoteEspecialCentavos:totalElegivelCentavos);
  const falta=Math.max(0,minimo-progresso);
  const dinheiro=n=>new Intl.NumberFormat('pt-BR',{style:'currency',
   currency:'BRL'}).format(n/100);
  const regra='Compras finalizadas em pedidos separados não se acumulam.';
  if(itens===0)return {
   estado:'CARRINHO_VAZIO',minimoCentavos:minimo,
   progressoCentavos:0,faltamCentavos:referenciaCentavos,
   mensagem:'Adicione produtos ao mesmo carrinho. O valor mínimo para uma posição é '+
    dinheiro(referenciaCentavos)+' em produtos elegíveis no mesmo pedido. '+regra
  };
  if(falta>0)return {
   estado:'AINDA_NAO_QUALIFICA',minimoCentavos:minimo,
   progressoCentavos:progresso,faltamCentavos:falta,
   mensagem:'Faltam '+dinheiro(falta)+' em produtos '+
    (valorPacoteEspecialCentavos>0?'do pacote especial ':'elegíveis ')+
    'neste mesmo carrinho para atingir o mínimo da '+
    (valorPacoteEspecialCentavos>0?'modalidade de pacote.':'posição.')+
    ' Você pode adicionar mais itens antes de fechar a compra. '+regra
  };
  return {
   estado:valorPacoteEspecialCentavos>0?'PACOTE_POTENCIAL':'PEDIDO_POTENCIAL',
   minimoCentavos:minimo,progressoCentavos:minimo,faltamCentavos:0,
   mensagem:valorPacoteEspecialCentavos>0?
    'O valor mínimo do pacote especial foi atingido neste pedido. A criação das '+
    quantidadePosicoesPacote+' posições depende do pagamento confirmado e '+
    'das demais regras e vagas do LOOP. '+regra:
    'O mínimo de '+dinheiro(referenciaCentavos)+
    ' foi atingido neste carrinho. Depois de fechar este pedido, uma posição poderá '+
    'ser criada somente após o pagamento confirmado e as demais regras do LOOP. '+regra
  };
 }
 return {orientar};
});
