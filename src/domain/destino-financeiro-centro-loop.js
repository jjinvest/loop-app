'use strict';

// Roteamento financeiro FICTICIO pelo titular operacional da posicao central.
// Uma posicao desistente ou de adesao vencida pertence operacionalmente ao
// LOOP; a conta de um cliente real nao recebe suas parcelas 1, 3 e 5.
const DESTINOS=Object.freeze([
 'LOOP_CENTRO','LOOP_ESQUERDA','LOOP_CENTRO',
 'LOOP_DIREITA','LOOP_CENTRO','LOOP_ESQUERDA'
]);
const COFRE_DOURADAS='LOOP_DOURADAS';
function centroDoLoop(posicao){
 return !!posicao&&typeof posicao==='object'&&
  (posicao.titularOperacional==='LOOP_EMPRESA'||posicao.empresa===true||
   ['PRAZO_ENCERRADO','DESISTENTE'].includes(posicao.statusAdesao));
}
function cofreDoEvento({posicaoCentro,ordem}={}){
 if(!Number.isInteger(ordem)||ordem<1||ordem>6)
  throw new RangeError('Evento financeiro exige ordem de 1 a 6');
 return centroDoLoop(posicaoCentro)&&[1,3,5].includes(ordem)?
  COFRE_DOURADAS:DESTINOS[ordem-1];
}
function origemDoCentro(posicao){
 if(!centroDoLoop(posicao))return 'PARTICIPANTE_REAL_SIMULADO';
 return posicao.statusAdesao==='DESISTENTE'?'DESISTENCIA_ASSUMIDA_LOOP':
  posicao.statusAdesao==='PRAZO_ENCERRADO'?'ADESAO_VENCIDA_ASSUMIDA_LOOP':
  'POSICAO_OPERACIONAL_LOOP';
}
module.exports={COFRE_DOURADAS,centroDoLoop,cofreDoEvento,origemDoCentro};
