'use strict';
(()=>{
 const e=id=>document.getElementById(id);
 const path=location.pathname;
 const semIndicacao=path==='/laboratorio/cadastro';
 const linkConvite=path+location.search;
 const destino=(path.startsWith('/loja-vilela/convite/')||path.startsWith('/loja/convite/')||
  /^\/loja\/[A-Za-z0-9_-]+$/.test(path))?'loja':
  (path.startsWith('/escritorio-vilela/convite/')||path.startsWith('/escritorio/convite/'))?'escritorio':
  new URLSearchParams(location.search).get('destino')==='loja'?'loja':'escritorio';
 const prefixo=['/loja/convite/','/escritorio/convite/',
  '/loja-vilela/convite/','/escritorio-vilela/convite/']
  .find(v=>path.startsWith(v))||null;
 const trocaDestino=(para)=>{
  if(semIndicacao)return path;
  if(prefixo)return '/'+(para==='loja'?'loja':'escritorio')+
   '/convite/'+path.slice(prefixo.length);
  if(/^\/(loja|escritorio)\/[A-Za-z0-9_-]+$/.test(path))
   return '/'+(para==='loja'?'loja':'escritorio')+'/'+path.split('/')[2];
  return path+'?destino='+para;
 };
 const titulo=e('tituloDestinoConvite'),descricao=e('descricaoDestinoConvite');
 titulo.textContent=destino==='loja'?'Conheça a AKITEMM':'Conheça o Escritório LOOP';
 e('apresentacaoEmpresaConvite').hidden=destino==='loja';
 descricao.textContent=destino==='loja'?
  'Veja os produtos e os preços da loja antes de fazer seu cadastro.':
  'Conheça a empresa, as regras e a participação pelo Escritório Virtual.';
 e('linkApresentarEscritorioConvite').href=trocaDestino('escritorio');
 e('linkApresentarLojaConvite').href=trocaDestino('loja');
 e('irEscritorioConvite').href=destino==='loja'?
  '/escritorio?destino=loja':'/escritorio';
 e('linkApresentarEscritorioConvite').setAttribute('aria-current',destino==='escritorio'?'page':'false');
 e('linkApresentarLojaConvite').setAttribute('aria-current',destino==='loja'?'page':'false');
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
 async function mostrarVitrine(){
  if(semIndicacao||destino!=='loja')return;
  const secao=e('vitrineConviteLoop');
  secao.hidden=false;
  const lista=e('produtosVitrineConvite');
  lista.replaceChildren();
  e('statusVitrineConvite').textContent='Carregando produtos disponíveis no teste...';
  try{
   const data=await api('vitrine?link='+encodeURIComponent(linkConvite));
   for(const p of data.produtos){
    const item=document.createElement('li'),nome=document.createElement('strong');
    nome.textContent=p.nome+' — '+(p.precoCentavos/100).toLocaleString('pt-BR',{
     style:'currency',currency:'BRL'});
    const detalhe=document.createElement('small');
    detalhe.textContent=p.tipo==='PDF'?'Curso PDF para download de demonstração':'Produto físico de demonstração';
    item.append(nome,detalhe);
    lista.append(item);
   }
   e('statusVitrineConvite').textContent=data.produtos.length?
    'Para comprar, cadastre-se e entre no Escritório Virtual.':
    'Nenhum produto publicado neste momento.';
  }catch(err){e('statusVitrineConvite').textContent=err.message;}
 }
 (async()=>{
  try{
   if(semIndicacao){
    estado.textContent='Cadastro espontâneo: você pode participar sem convite. Seu link próprio começa inativo até a primeira compra de qualquer valor.';
    form.hidden=false;return;
   }
   const info=await api('estado?link='+encodeURIComponent(linkConvite));
   if(!info.ativo){
    estado.textContent='Este link ainda não está ativo. O indicador precisa primeiro comprar um produto na loja.';
    return;
   }
   estado.textContent='Convite de '+info.nomeIndicador+
    '. Cadastre-se para receber seu próprio link, inicialmente inativo.';
   form.hidden=false;
   // A vitrine completa abre somente depois do cadastro e do login.
  }catch(err){estado.textContent=err.message;}
 })();
 form.addEventListener('submit',async ev=>{
  ev.preventDefault();
  const botao=e('criarConviteCliente');botao.disabled=true;
  if(e('senhaConvite').value!==e('confirmarSenhaConvite').value){
   estado.textContent='A confirmação da senha não corresponde.';
   e('confirmarSenhaConvite').focus();botao.disabled=false;return;
  }
  try{
   const criado=await api('cadastrar',{
    nome:e('nomeConvite').value,apelido:e('apelidoConvite').value,email:e('emailConvite').value,
    telefone:e('telefoneConvite').value,senha:e('senhaConvite').value,
    link:semIndicacao?null:linkConvite
   });
   form.hidden=true;
   estado.textContent='Cadastro realizado. Abrindo seu acesso ao LOOP...';
   // O convite grava o indicador na conta. Agora cria a sessao e abre
   // SOMENTE a porta solicitada: AKITEMM ou Escritorio LOOP.
   const resposta=await fetch('/api/laboratorio/participante/entrar',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json','X-LOOP-LAB':'participante'},
    body:JSON.stringify({nome:e('nomeConvite').value,senha:e('senhaConvite').value})
   });
   e('senhaConvite').value='';
   if(!resposta.ok){
    estado.textContent='Cadastro concluído. Faça login pelo Escritório LOOP para acessar sua conta.';
    return;
   }
   location.replace(destino==='loja'?'/loja':'/escritorio');
  }catch(err){estado.textContent=err.message;}
  finally{botao.disabled=false;e('senhaConvite').value='';e('confirmarSenhaConvite').value='';}
 });
})();