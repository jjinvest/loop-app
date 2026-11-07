'use strict';
// Envio de codigo de recuperacao, sem senha ou dados financeiros no e-mail.
// Exige dominio de remetente verificado e credencial privada no servidor.
const ENDPOINT='https://api.resend.com/emails';
const EMAIL=/^[^\s@<>]{1,64}@[^\s@<>]{1,180}$/;
function criarTransporteRecuperacaoResend({
 apiKey,remetente,fetchImpl=fetch,timeoutMs=10000
}={}){
 if(typeof apiKey!=='string'||!/^re_[A-Za-z0-9_-]{8,}$/.test(apiKey)||
    apiKey.length>300||typeof remetente!=='string'||
    !EMAIL.test(remetente)||typeof fetchImpl!=='function'||
    !Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>30000)
  throw Error('TRANSPORTE_RECUPERACAO_NAO_CONFIGURADO');
 return async({para,codigo,expiraEm}={})=>{
  if(typeof para!=='string'||!EMAIL.test(para)||
     typeof codigo!=='string'||!/^[0-9]{8}$/.test(codigo)||
     !Number.isSafeInteger(expiraEm)||expiraEm<=0)
   throw Error('EMAIL_RECUPERACAO_INVALIDO');
  const payload={
   from:remetente,to:[para],
   subject:'LOOP 3.0 — recuperar acesso ao Escritório Virtual',
   text:'Seu código para recuperar a senha: '+codigo+
    '\nValidade: 15 minutos. Se você não solicitou, ignore esta mensagem.'+
    '\nNunca informe esse código a outra pessoa. Nenhuma compra ou saque é autorizado.'
  };
  let response;
  try{
   response=await fetchImpl(ENDPOINT,{
    method:'POST',redirect:'error',
    headers:{Authorization:'Bearer '+apiKey,
     'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(payload),
    signal:AbortSignal.timeout(timeoutMs)
   });
  }catch{throw Error('EMAIL_RECUPERACAO_TRANSPORTE_INDETERMINADO');}
  if(!response||![200,201,202].includes(response.status))
   throw Error('EMAIL_RECUPERACAO_PROVEDOR_RECUSOU');
  let json;try{json=await response.json();}
  catch{throw Error('EMAIL_RECUPERACAO_RESPOSTA_INVALIDA');}
  if(typeof json?.id!=='string'||!/^[-a-zA-Z0-9_]{8,128}$/.test(json.id))
   throw Error('EMAIL_RECUPERACAO_RESPOSTA_INVALIDA');
  return true;
 };
}
module.exports={criarTransporteRecuperacaoResend};
