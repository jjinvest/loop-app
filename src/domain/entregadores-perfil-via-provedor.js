'use strict';
// Entregas reais APENAS quando o operador configura credenciais de provedores.
// Nunca imprime, devolve ou armazena o codigo em texto claro.
function criarEntregadoresPerfilAmbiente(env=process.env,buscar=fetch){
 const provedores={};
 if(env.LOOP_LAB_RESEND_API_KEY&&env.LOOP_LAB_RESEND_FROM){
  provedores.EMAIL=async({destino,codigo})=>{
   const r=await buscar('https://api.resend.com/emails',{
    method:'POST',signal:AbortSignal.timeout(10000),
    headers:{Authorization:'Bearer '+env.LOOP_LAB_RESEND_API_KEY,
     'Content-Type':'application/json'},
    body:JSON.stringify({from:env.LOOP_LAB_RESEND_FROM,
     to:[destino],subject:'Código de confirmação — LOOP 3.0',
     text:'Seu código de confirmação de contato é '+codigo+
      '. Ele expira em 10 minutos. Se você não solicitou, ignore.'})
   });
   if(!r.ok)throw Error('FALHA_ENVIO_EMAIL');
  };
 }
 if(env.LOOP_LAB_TWILIO_ACCOUNT_SID&&env.LOOP_LAB_TWILIO_AUTH_TOKEN&&
    env.LOOP_LAB_TWILIO_FROM){
  provedores.TELEFONE=async({destino,codigo})=>{
   const sid=env.LOOP_LAB_TWILIO_ACCOUNT_SID;
   if(!/^AC[a-f0-9]{32}$/i.test(sid))throw Error('CONFIG_SMS_INVALIDA');
   const cred=Buffer.from(sid+':'+env.LOOP_LAB_TWILIO_AUTH_TOKEN).toString('base64');
   const params=new URLSearchParams({To:destino,
    From:env.LOOP_LAB_TWILIO_FROM,
    Body:'LOOP 3.0: código para atualizar seu contato: '+codigo+
     '. Expira em 10 minutos. Não compartilhe.'});
   const r=await buscar('https://api.twilio.com/2010-04-01/Accounts/'+sid+'/Messages.json',{
    method:'POST',signal:AbortSignal.timeout(10000),
    headers:{Authorization:'Basic '+cred,
     'Content-Type':'application/x-www-form-urlencoded'},
    body:params.toString()
   });
   if(!r.ok)throw Error('FALHA_ENVIO_SMS');
  };
 }
 return provedores;
}
module.exports={criarEntregadoresPerfilAmbiente};
