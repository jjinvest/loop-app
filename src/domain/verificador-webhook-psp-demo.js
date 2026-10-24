'use strict';

// Verificador generico de ASSINATURAS FICTICIAS para testes locais.
// NAO IMPLEMENTA NENHUM FORMATO OU CREDENCIAL DE PSP REAL.
// A assinatura protege os bytes originais do corpo, nao JSON serializado novamente.
const {createHmac,timingSafeEqual}=require('node:crypto');

const JANELA_SEGUNDOS=300;
const TAMANHO_MAXIMO=4096;
const CAMPOS=Object.freeze([
  'eventoId','pagamentoId','tipo','valorCentavos','moeda','ambiente'
]);
function erro(codigo,mensagem){
  const e=new Error(mensagem);
  e.codigo=codigo;
  return e;
}
function validarSegredoDemo(segredo){
  if(typeof segredo!=='string'||segredo.length<32||segredo.length>1024){
    throw new Error('LOOP_WEBHOOK_DEMO_SECRET deve ter entre 32 e 1024 caracteres');
  }
  return segredo;
}
function assinarMensagemDemo({segredo,timestamp,corpoBruto}={}){
  validarSegredoDemo(segredo);
  if(!Number.isSafeInteger(timestamp)||timestamp<=0||!Buffer.isBuffer(corpoBruto)){
    throw new Error('Parametros de assinatura de teste invalidos');
  }
  return 'sha256='+createHmac('sha256',segredo)
    .update(String(timestamp)+'.','utf8')
    .update(corpoBruto)
    .digest('hex');
}

function verificarMensagemDemo({
  segredo,timestamp,assinatura,corpoBruto,agoraSegundos=Math.floor(Date.now()/1000)
}={}){
  validarSegredoDemo(segredo);
  if(!Buffer.isBuffer(corpoBruto)||corpoBruto.length<2||
     corpoBruto.length>TAMANHO_MAXIMO){
    throw erro('CORPO_INVALIDO','Corpo bruto de mensagem demo ausente ou excessivo');
  }
  if(typeof timestamp!=='string'||!/^\d{10,11}$/.test(timestamp)){
    throw erro('ASSINATURA_INVALIDA','Carimbo de data demo invalido');
  }
  const t=Number(timestamp);
  if(!Number.isSafeInteger(t)||!Number.isSafeInteger(agoraSegundos)||
     Math.abs(agoraSegundos-t)>JANELA_SEGUNDOS){
    throw erro('ASSINATURA_INVALIDA','Mensagem demo fora da janela de tempo');
  }
  if(typeof assinatura!=='string'||!/^sha256=[a-f0-9]{64}$/.test(assinatura)){
    throw erro('ASSINATURA_INVALIDA','Formato de assinatura demo invalido');
  }
  const recebido=Buffer.from(assinatura.slice(7),'hex');
  const esperado=Buffer.from(assinarMensagemDemo({segredo,timestamp:t,corpoBruto}).slice(7),'hex');
  if(recebido.length!==esperado.length||!timingSafeEqual(recebido,esperado)){
    throw erro('ASSINATURA_INVALIDA','Assinatura demo incorreta');
  }
  let corpo;
  try{corpo=JSON.parse(corpoBruto.toString('utf8'));}
  catch{throw erro('CORPO_INVALIDO','JSON demo invalido');}
  if(!corpo||typeof corpo!=='object'||Array.isArray(corpo)||
     Object.keys(corpo).length!==CAMPOS.length||
     Object.keys(corpo).some(k=>!CAMPOS.includes(k))){
    throw erro('CORPO_INVALIDO','Campos inesperados ou ausentes no evento demo');
  }
  if(typeof corpo.eventoId!=='string'||typeof corpo.pagamentoId!=='string'||
     !/^[a-z0-9][a-z0-9-]{2,62}$/.test(corpo.eventoId)||
     !/^[a-z0-9][a-z0-9-]{2,62}$/.test(corpo.pagamentoId)||
     !['CONFIRMAR_FICTICIO','ESTORNAR_FICTICIO'].includes(corpo.tipo)||
     !Number.isSafeInteger(corpo.valorCentavos)||corpo.valorCentavos<1||
     corpo.moeda!=='BRL'||corpo.ambiente!=='laboratorio'){
    throw erro('CORPO_INVALIDO','Evento demo nao corresponde ao contrato estrito');
  }
  return Object.freeze({
    eventoId:corpo.eventoId,pagamentoId:corpo.pagamentoId,
    tipo:corpo.tipo,valorCentavos:corpo.valorCentavos
  });
}

module.exports={
  verificarMensagemDemo,assinarMensagemDemo,validarSegredoDemo,
  JANELA_SEGUNDOS,TAMANHO_MAXIMO
};
