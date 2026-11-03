'use strict';
// Adaptador de transportador para prova de posse de e-mail.
// Nenhuma chave, token, código ou endereço é escrito em logs.
// Retorno true significa ACEITE da API, não entrega final na caixa postal.
const ENDPOINT='https://api.resend.com/emails';
const EMAIL=/^[^\s@<>]{1,64}@[^\s@<>]{1,180}$/;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function criarTransporteEmailVerificacaoResend({
 apiKey,remetente,fetchImpl=fetch,timeoutMs=10000
}={}){
 if(typeof apiKey!=='string'||!/^re_[A-Za-z0-9_\-]{8,}$/.test(apiKey)||
    apiKey.length>300)
  falha('EMAIL_PROVEDOR_CHAVE_INVALIDA');
 if(typeof remetente!=='string'||!EMAIL.test(remetente)||
    remetente.length>254||!remetente.toLowerCase().endsWith('.resend.dev')&&
    remetente.toLowerCase().endsWith('@resend.dev'))
  falha('EMAIL_REMETENTE_NAO_CONFIGURADO');
 if(typeof fetchImpl!=='function'||!Number.isSafeInteger(timeoutMs)||
    timeoutMs<1000||timeoutMs>30000)
  falha('EMAIL_TRANSPORTE_CONFIGURACAO_INVALIDA');
 return async function enviar({para,codigo,expiraEm}={}){
  if(typeof para!=='string'||!EMAIL.test(para)||para.length>254||
     typeof codigo!=='string'||!/^[0-9]{8}$/.test(codigo)||
     !Number.isSafeInteger(expiraEm)||expiraEm<=0)
   falha('EMAIL_MENSAGEM_INVALIDA');
  // O corpo contém apenas a verificação; não promove remuneração, bônus,
  // ou registra o código em URL navegável.
  const payload={
   from:remetente,to:[para],
   subject:'AKITEMM — confirme seu e-mail',
   text:'Código de confirmação: '+codigo+
    '\nVálido por 15 minutos. Se você não solicitou, ignore este e-mail.'+
    '\nEste código não confirma pagamento nem identidade civil.'
  };
  let response;
  try{
   response=await fetchImpl(ENDPOINT,{
    method:'POST',redirect:'error',
    headers:{
     'Authorization':'Bearer '+apiKey,
     'Content-Type':'application/json',
     'Accept':'application/json'
    },
    body:JSON.stringify(payload),
    signal:AbortSignal.timeout(timeoutMs)
   });
  }catch{
   // Sem retry automático: uma resposta perdida após o POST pode ser
   // indeterminada. O chamador bloqueia a ativação da prova.
   falha('EMAIL_ENTREGA_INDETERMINADA');
  }
  if(!response||![200,201,202].includes(response.status))
   falha('EMAIL_PROVEDOR_NAO_ACEITOU');
  let json;
  try{json=await response.json();}catch{falha('EMAIL_PROVEDOR_RESPOSTA_INVALIDA');}
  if(typeof json?.id!=='string'||!/^[-a-zA-Z0-9_]{8,128}$/.test(json.id))
   falha('EMAIL_PROVEDOR_RESPOSTA_INVALIDA');
  return true;
 };
}
module.exports={criarTransporteEmailVerificacaoResend};
