'use strict';
(()=>{
 const e=id=>document.getElementById(id);
 const path=location.pathname;
 const semIndicacao=path==='/laboratorio/cadastro';
 const estado=e('estadoConvite');
 const form=e('formConviteCliente');
 async function api(rota,body){
  const resp=await fetch('/api/laboratorio/convite/'+rota,{
   method:body===undefined?'GET':'POST',
   credentials:'same-origin',cache:'no-store',
   headers:body===undefined?{}:{'Content-Type':'application/json','X-LOOP-LAB':'convite'},
   body:body===undefined?undefined:JSON.stringify(body)
  });
  const data=await resp.json();
  if(!resp.ok)throw new Error(data.erro||'Falha ao validar convite');
  return data;
 }
 (async()=>{
  try{
   if(semIndicacao){
    estado.textContent='Cadastro espontâneo: você pode participar sem convite. Seu link próprio começa inativo até a primeira compra de qualquer valor.';
    form.hidden=false;return;
   }
   const info=await api('estado?link='+encodeURIComponent(path));
   if(!info.ativo){
    estado.textContent='Este link ainda não está ativo. O indicador precisa primeiro comprar um produto na loja.';
    return;
   }
   estado.textContent='Convite de '+info.nomeIndicador+
    '. Cadastre-se para receber seu próprio link, inicialmente inativo.';
   form.hidden=false;
  }catch(err){estado.textContent=err.message;}
 })();
 form.addEventListener('submit',async ev=>{
  ev.preventDefault();
  const botao=e('criarConviteCliente');botao.disabled=true;
  try{
   const criado=await api('cadastrar',{
    nome:e('nomeConvite').value,email:e('emailConvite').value,
    telefone:e('telefoneConvite').value,senha:e('senhaConvite').value,
    link:semIndicacao?null:path
   });
   form.hidden=true;e('senhaConvite').value='';
   estado.textContent='Cadastro fictício realizado. Seu link foi criado, mas fica inativo até a primeira compra de qualquer valor. Entre pelo Escritório Virtual.';
  }catch(err){estado.textContent=err.message;}
  finally{botao.disabled=false;e('senhaConvite').value='';}
 });
})();