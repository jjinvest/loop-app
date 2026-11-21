'use strict';
// Consulta de CEP no servidor apenas durante o calculo de entrega.
// Destino fixo, sem URL enviada pelo cliente; falha fechada se indisponivel.
async function localizarCepBrasil(cep,{consulta=globalThis.fetch}={}){
 if(typeof cep!=='string'||!/^\d{5}-?\d{3}$/.test(cep)||
    typeof consulta!=='function'){
  const erro=new Error('ENTREGA_CEP_INVALIDO');erro.codigo=erro.message;
  throw erro;
 }
 const codigo=cep.replace('-','');
 let resposta;
 try{
  resposta=await consulta('https://viacep.com.br/ws/'+codigo+'/json/',{
   method:'GET',redirect:'error',signal:AbortSignal.timeout(5000),
   headers:{Accept:'application/json'}
  });
 }catch{
  const erro=new Error('ENTREGA_CEP_CONSULTA_INDISPONIVEL');
  erro.codigo=erro.message;throw erro;
 }
 if(!resposta?.ok||
    !String(resposta.headers?.get?.('content-type')||'').includes('json')){
  const erro=new Error('ENTREGA_CEP_CONSULTA_INDISPONIVEL');
  erro.codigo=erro.message;throw erro;
 }
 let dados;
 try{dados=await resposta.json();}
 catch{dados=null;}
 if(!dados||dados.erro===true||
    typeof dados.uf!=='string'||!/^[A-Z]{2}$/.test(dados.uf)||
    typeof dados.localidade!=='string'||
    !/^[\p{L} .'-]{2,70}$/u.test(dados.localidade)||
    dados.cep?.replace('-','')!==codigo){
  const erro=new Error('ENTREGA_CEP_NAO_LOCALIZADO');erro.codigo=erro.message;
  throw erro;
 }
 return {uf:dados.uf,cidade:dados.localidade};
}
module.exports={localizarCepBrasil};
