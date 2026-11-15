'use strict';
// Apenas visibilidade; permissao continua validada no servidor.
(()=>{
 const links=[...document.querySelectorAll('[data-atalho-operador]')];
 if(!links.length)return;
 let pedido=0;
 async function consultar(){
  const atual=++pedido;
  try{
   const resposta=await fetch('/api/admin/operador-sessao',{
    credentials:'same-origin',cache:'no-store'
   });
   const dados=resposta.ok?await resposta.json():{operador:false};
   if(atual!==pedido)return;
   for(const link of links)link.hidden=dados.operador!==true;
  }catch{
   if(atual===pedido)for(const link of links)link.hidden=true;
  }
 }
 window.addEventListener('pageshow',consultar);
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')consultar();
 });
 consultar();
})();
