'use strict';
// Quatro banners REAIS da AKITEMM, sem alterar a estrutura aprovada.
// Arquivos só são enviados pela sessão autenticada do operador.
(()=>{
 const area=document.querySelector('.akitemm-banner');
 if(!area)return;
 const conteudo=area.querySelector('#akitemmBannerConteudo');
 const pontos=area.querySelector('#akitemmBannerPontos');
 const esquerda=area.querySelector('#akitemmBannerAnterior');
 const direita=area.querySelector('#akitemmBannerProximo');
 if(!conteudo||!pontos||!esquerda||!direita)return;
 const visaoCliente=new URLSearchParams(location.search).get('visao')==='cliente';
 let operador=false,slots=null,indice=0,intervalo=null,bloquearCliqueAte=0;
 let xInicio=null,bloqueio=false;
 const requisitar=async(url,opcoes={})=>{
  const resp=await fetch(url,{credentials:'same-origin',cache:'no-store',...opcoes});
  const dados=await resp.json().catch(()=>({}));
  if(!resp.ok)throw Error(dados.erro||'SERVICO_INDISPONIVEL');
  return dados;
 };
 const foto=document.createElement('img');
 foto.className='akitemm-banner-foto-editavel';
 foto.alt='Imagem do banner AKITEMM';foto.hidden=true;
 conteudo.insertAdjacentElement('afterend',foto);
 const placeholder=document.createElement('div');
 placeholder.className='akitemm-banner-espaco-livre';placeholder.hidden=true;
 foto.insertAdjacentElement('afterend',placeholder);
 const escolher=document.createElement('input');
 escolher.id='akitemmBannerArquivoOperador';escolher.type='file';
 escolher.accept='image/jpeg,image/png,image/webp';escolher.hidden=true;
 area.append(escolher);
 const controles=document.createElement('div');
 controles.id='akitemmBannerControlesOperador';
 controles.className='akitemm-banner-controles-operador';controles.hidden=true;
 const botoes=[['foto','📷 Subir foto'],['anterior','Mover para esquerda'],
  ['proximo','Mover para direita'],['enquadrar','Enquadramento'],
  ['remover','Excluir foto']];
 for(const [acao,texto] of botoes){
  const b=document.createElement('button');b.type='button';
  b.dataset.acao=acao;b.textContent=texto;controles.append(b);
 }
 const estado=document.createElement('p');estado.id='akitemmBannerStatus';
 estado.setAttribute('role','status');controles.append(estado);
 area.insertAdjacentElement('afterend',controles);
 function visiveis(){
  if(!slots)return [];
  if(operador)return slots;
  const imagens=slots.filter(s=>s.temImagem);
  return imagens.length?imagens:[slots[0]];
 }
 function current(){return visiveis()[indice]||null;}
 function parar(){if(intervalo!==null)clearInterval(intervalo);intervalo=null;}
 function rodar(){
  parar();
  if(visiveis().length>1&&!document.hidden)
   intervalo=setInterval(()=>{
    if(document.hidden)return;
    indice=(indice+1)%visiveis().length;renderizar();
   },7500);
 }
 function selecionar(index){
  const lista=visiveis();
  if(!lista.length)return;
  indice=(index+lista.length)%lista.length;renderizar();rodar();
 }
 function renderizar(){
  const lista=visiveis(),slot=current();
  if(!slot)return;
  const imagem=slot.temImagem;
  foto.hidden=!imagem;
  area.classList.toggle('akitemm-banner-com-foto',imagem);
  if(imagem){
   const caminho='/api/loja/banners/'+slot.slot+'/imagem?revisao='+
    (slot.atualizadoEm||slot.revisao);
   if(foto.getAttribute('src')!==caminho)foto.src=caminho;
   foto.style.objectFit=slot.enquadramento==='INTEIRA'?'contain':'cover';
   foto.alt='Banner '+slot.slot+' da AKITEMM';
  }else foto.removeAttribute('src');
  conteudo.style.display=(imagem||slot.slot!==1)?'none':'';
  placeholder.hidden=imagem||slot.slot===1;
  if(!placeholder.hidden)
   placeholder.textContent='Banner '+slot.slot+
    (operador?' · toque para adicionar uma foto':' · AKITEMM');
  area.classList.toggle('akitemm-banner-operador-clicavel',operador);
  area.setAttribute('aria-label',operador?
   'Banner '+slot.slot+' · toque para escolher uma foto':
   'Banner '+slot.slot+' da AKITEMM');
  esquerda.hidden=lista.length<2;
  direita.hidden=lista.length<2;
  const rodizio=area.querySelector('.akitemm-banner-rodizio');
  if(rodizio)rodizio.hidden=lista.length<2;
  pontos.replaceChildren();
  lista.forEach((item,i)=>{
   const b=document.createElement('button');
   b.type='button';b.className='akitemm-banner-ponto';
   b.textContent=String(item.slot);
   b.setAttribute('aria-label','Mostrar banner '+item.slot);
   b.setAttribute('aria-current',String(i===indice));
   b.addEventListener('click',()=>selecionar(i));
   pontos.append(b);
  });
  controles.hidden=!operador;
  if(operador){
   const acao=n=>controles.querySelector('[data-acao="'+n+'"]');
   acao('foto').textContent='📷 '+(imagem?'Trocar foto':'Subir foto')+
    ' · banner '+slot.slot;
   acao('anterior').disabled=slot.slot===1||bloqueio;
   acao('proximo').disabled=slot.slot===4||bloqueio;
   acao('enquadrar').disabled=!imagem||bloqueio;
   acao('remover').disabled=!imagem||bloqueio;
  }
 }
 async function carregar(){
  try{
   const dados=await requisitar('/api/loja/banners');
   if(dados.quantidadeMaxima!==4||!Array.isArray(dados.slots)||
      dados.slots.length!==4||
      dados.slots.some((x,i)=>x.slot!==i+1||
       !Number.isSafeInteger(x.revisao)||typeof x.temImagem!=='boolean'))
    throw Error('BANNERS_RESPOSTA_INVALIDA');
   slots=dados.slots;
   indice=Math.min(indice,visiveis().length-1);
   renderizar();rodar();
  }catch(e){
   if(operador)estado.textContent='Banners indisponíveis: '+e.message;
  }
 }
 async function atualizarAcesso(){
  try{
   const r=await requisitar('/api/operador/estado');
   operador=r.operador===true&&!visaoCliente;
  }catch{operador=false;}
  renderizar();await carregar();
 }
 async function salvar(acao,arquivo=null,direcao=0){
  if(bloqueio||!operador||!current())return;
  bloqueio=true;parar();estado.textContent='Salvando imagem na AKITEMM...';
  controles.querySelectorAll('button').forEach(b=>{b.disabled=true;});
  try{
   const sessao=await requisitar('/api/admin/comercial/sessao');
   if(typeof sessao.csrfToken!=='string'||sessao.csrfToken.length<20)
    throw Error('SESSAO_OPERADOR_INVALIDA');
   const slot=current(),base='/api/admin/akitemm/banners';
   let url=base+'/'+slot.slot+'/imagem';
   const headers={'X-Loop-Admin-Csrf':sessao.csrfToken,
    'X-Banner-Revisao-Esperada':String(slot.revisao)};
   let method,body;
   if(acao==='foto'){
    if(!arquivo||!['image/png','image/jpeg','image/webp'].includes(arquivo.type)||
       arquivo.size<40||arquivo.size>4*1024*1024)
     throw Error('Escolha JPG, PNG ou WebP de até 4 MB.');
    method='PUT';body=arquivo;headers['Content-Type']=arquivo.type;
    headers['X-Banner-Enquadramento']='PREENCHER';
   }else if(acao==='remover')method='DELETE';
   else{
    method='POST';headers['Content-Type']='application/json';
    if(acao==='enquadrar'){
     url=base+'/'+slot.slot+'/enquadramento';
     body=JSON.stringify({revisaoEsperada:slot.revisao,
      enquadramento:slot.enquadramento==='INTEIRA'?'PREENCHER':'INTEIRA'});
    }else if(acao==='trocar'){
     const destino=slot.slot+direcao,outra=slots.find(x=>x.slot===destino);
     if(!outra)throw Error('BANNER_ORDEM_INVALIDA');
     url=base+'/trocar';
     body=JSON.stringify({origem:slot.slot,destino,
      revisaoOrigem:slot.revisao,revisaoDestino:outra.revisao});
    }else throw Error('BANNER_ACAO_INVALIDA');
   }
   const resultado=await requisitar(url,{method,headers,body});
   if(resultado.quantidadeMaxima!==4||
      !Array.isArray(resultado.slots)||resultado.slots.length!==4)
    throw Error('BANNER_GRAVACAO_NAO_CONFIRMADA');
   slots=resultado.slots;
   if(acao==='trocar')indice=Math.min(3,Math.max(0,slot.slot+direcao-1));
   estado.textContent='Banner salvo e atualizado na loja.';
  }catch(e){
   estado.textContent='Não foi possível salvar o banner: '+e.message;
   await carregar();
  }finally{
   bloqueio=false;renderizar();rodar();
  }
 }
 escolher.addEventListener('change',()=>{
  const f=escolher.files?.[0];
  escolher.value='';
  if(f&&operador)void salvar('foto',f);
 });
 controles.addEventListener('click',e=>{
  const botao=e.target.closest('button[data-acao]');
  if(!botao||!operador||bloqueio)return;
  const acao=botao.dataset.acao;
  if(acao==='foto'){escolher.click();return;}
  if(acao==='remover'&&!window.confirm(
   'Remover a foto deste banner? Os outros não serão alterados.'))return;
  if(acao==='anterior'||acao==='proximo')
   void salvar('trocar',null,acao==='anterior'?-1:1);
  else void salvar(acao);
 });
 area.addEventListener('click',e=>{
  if(!operador||bloqueio||Date.now()<bloquearCliqueAte||
     e.target.closest('button,input,a'))return;
  escolher.click();
 });
 esquerda.addEventListener('click',()=>selecionar(indice-1));
 direita.addEventListener('click',()=>selecionar(indice+1));
 area.addEventListener('pointerdown',e=>{xInicio=e.clientX;});
 area.addEventListener('pointerup',e=>{
  if(xInicio===null)return;
  const delta=e.clientX-xInicio;xInicio=null;
  if(Math.abs(delta)>55){
   bloquearCliqueAte=Date.now()+450;
   selecionar(indice+(delta>0?-1:1));
  }
 });
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden)parar();else rodar();
 });
 window.addEventListener('focus',()=>void atualizarAcesso());
 window.addEventListener('pageshow',()=>void atualizarAcesso());
 window.addEventListener('loop:operador-entrou',()=>void atualizarAcesso());
 window.addEventListener('loop:operador-saiu',()=>{
  operador=false;renderizar();void carregar();
 });
 void atualizarAcesso();
})();
