'use strict';
/* Modo operador: utiliza somente rotas administrativas protegidas no gateway.
 * As telas do cliente e os dados financeiros não são modificados aqui. */
(()=>{
 const prefix='/staging/escritorio-unificado';let operador=false,dialogo=null,gravando=false;
 const estilo=document.createElement('style');
 estilo.textContent='body.operador-na-tela #akitemmBannerConteudo,body.operador-na-tela .produto-loja-loop,body.operador-na-tela .loop03-banner-item,body.operador-na-tela #atualizarTabuleiroIntegrado{cursor:pointer;outline-offset:3px}body.operador-na-tela #akitemmBannerConteudo:hover,body.operador-na-tela .produto-loja-loop:hover,body.operador-na-tela .loop03-banner-item:hover,body.operador-na-tela #atualizarTabuleiroIntegrado:hover{outline:2px dashed #c5a15e}#modoOperadorDialog{width:min(92vw,530px);max-height:85dvh;overflow:auto;border:1px solid #c5a15e;border-radius:15px;background:#151921;color:#f5f1e8;padding:20px}#modoOperadorDialog::backdrop{background:#000b}#modoOperadorDialog h2{margin:0 0 15px;color:#dfbf76}#modoOperadorDialog form{display:grid;gap:10px}#modoOperadorDialog label{display:grid;gap:5px}#modoOperadorDialog input,#modoOperadorDialog textarea,#modoOperadorDialog select{box-sizing:border-box;width:100%;background:#282e37;color:white;padding:9px;border:1px solid #777;border-radius:7px;font:inherit}#modoOperadorDialog textarea{min-height:70px}#modoOperadorDialog button{background:#c5a15e;color:#131313;border:0;border-radius:8px;padding:9px;font:inherit;font-weight:bold}#modoOperadorDialog button:disabled{opacity:.6}#modoOperadorDialog .mensagem-operador{min-height:20px;color:#f1d69e;white-space:pre-wrap}';
 document.head.append(estilo);
 function abrir(titulo){
  if(!dialogo){dialogo=document.createElement('dialog');dialogo.id='modoOperadorDialog';document.body.append(dialogo);}
  dialogo.replaceChildren();
  const fechar=document.createElement('button');fechar.textContent='Fechar';fechar.type='button';fechar.style.float='right';fechar.addEventListener('click',()=>dialogo.close());
  const h=document.createElement('h2');h.textContent=titulo;
  const form=document.createElement('form');form.addEventListener('submit',e=>e.preventDefault());
  const estado=document.createElement('p');estado.className='mensagem-operador';estado.setAttribute('role','status');
  dialogo.append(fechar,h,form,estado);dialogo.showModal();return {form,estado};
 }
 function campo(form,label,tipo='text',valor='',opcoes=[]){
  const l=document.createElement('label');l.textContent=label;
  const input=document.createElement(tipo==='textarea'?'textarea':tipo==='select'?'select':'input');
  if(tipo==='select')for(const [valor,texto] of opcoes){const o=document.createElement('option');o.value=valor;o.textContent=texto;input.append(o);}
  else if(tipo!=='textarea')input.type=tipo;
  if(tipo==='file')input.accept='image/png,image/jpeg,image/webp';
  else input.value=valor===null?'':String(valor);
  l.append(input);form.append(l);return input;
 }
 function comando(form,texto,fn){
  const b=document.createElement('button');b.type='button';b.textContent=texto;form.append(b);
  b.addEventListener('click',async()=>{
   if(gravando)return;gravando=true;b.disabled=true;
   try{await fn();}catch(e){const x=dialogo?.querySelector('.mensagem-operador');if(x)x.textContent='Alteração não realizada: '+e.message;}
   finally{gravando=false;b.disabled=false;}
  });
 }
 async function api(rota,{method='GET',json,arquivo,headers={}}={}){
  const r=await fetch(prefix+rota,{method,credentials:'same-origin',cache:'no-store',
   headers:{...(json!==undefined?{'Content-Type':'application/json'}:{}),...(arquivo?{'Content-Type':arquivo.type}:{}),...headers},
   ...(json!==undefined?{body:JSON.stringify(json)}:arquivo?{body:arquivo}:{})});
  const dados=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(dados.erro||'SERVICO_INDISPONIVEL');return dados;
 }
 function imagem(arquivo,max){
  if(!arquivo)throw Error('Escolha uma foto.');
  if(!['image/png','image/jpeg','image/webp'].includes(arquivo.type)||arquivo.size<40||arquivo.size>max)
   throw Error('Foto inválida. Use JPEG, PNG ou WebP no tamanho permitido.');
 }
 async function bannerLoop(slot){
  const {form,estado}=abrir('Editar banner '+slot+' do LOOP');
  const dados=await api('/banners-escritorio');
  const atual=dados.slots?.find(x=>x.slot===slot);
  if(!atual)throw Error('Banner não localizado.');
  const foto=campo(form,'Nova foto do banner (até 4 MB)','file');
  const ajuste=campo(form,'Enquadramento da foto','select',atual.enquadramento||'INTEIRA',
   [['INTEIRA','Foto inteira dentro da moldura'],['PREENCHER','Preencher a moldura']]);
  comando(form,'Salvar foto',async()=>{
   imagem(foto.files?.[0],4*1024*1024);
   await api('/banners-escritorio/'+slot+'/imagem',{method:'PUT',arquivo:foto.files[0],
    headers:{'X-Banner-Revisao-Esperada':String(atual.revisao),'X-Banner-Enquadramento':ajuste.value}});
   estado.textContent='Foto gravada no banco do LOOP.';location.reload();
  });
  if(atual.temImagem)comando(form,'Excluir foto',async()=>{
   if(!confirm('Excluir esta foto?'))return;
   await api('/banners-escritorio/'+slot+'/imagem',{method:'DELETE',
    headers:{'X-Banner-Revisao-Esperada':String(atual.revisao)}});
   location.reload();
  });
 }
 async function bannerLoja(){
  const {form,estado}=abrir('Editar banner da AKITEMM');
  const d=await api('/loja/config');const conf=structuredClone(d.config);
  const valor=document.getElementById('akitemmBannerPontos')?.textContent||'';
  const num=Number(valor.split('/')[0].trim())||1;
  const i=conf.banners.length?Math.min(num-1,conf.banners.length-1):0;
  const atual=conf.banners[i]||{titulo:'AKITEMM',descricao:'',produtoId:'',imagemCaminho:''};
  const titulo=campo(form,'Título','text',atual.titulo);
  const descricao=campo(form,'Descrição','textarea',atual.descricao);
  const foto=campo(form,'Nova foto (até 4 MB)','file');
  comando(form,'Salvar banner na loja',async()=>{
   if(titulo.value.trim().length<3||titulo.value.length>90||descricao.value.length>250)
    throw Error('Confira o título e a descrição.');
   const registro={...atual,titulo:titulo.value.trim(),descricao:descricao.value};
   if(foto.files?.[0]){
    imagem(foto.files[0],4*1024*1024);
    const upload=await api('/loja/banner-arquivo',{method:'POST',arquivo:foto.files[0]});
    registro.imagemCaminho=upload.imagemCaminho;
   }
   conf.banners[i]=registro;
   await api('/loja/config',{method:'PUT',json:{config:conf,revisaoEsperada:d.revisao}});
   estado.textContent='Banner salvo.';location.reload();
  });
 }
 async function produto(id){
  const {form,estado}=abrir('Editar produto da AKITEMM');
  const r=await api('/produtos/'+encodeURIComponent(id));const p=r.produto;
  const nome=campo(form,'Nome do produto','text',p.nome);
  const desc=campo(form,'Descrição','textarea',p.descricao);
  const preco=campo(form,'Preço (R$)','text',p.precoCentavos==null?'':(p.precoCentavos/100).toFixed(2).replace('.',','));
  const foto=campo(form,'Foto principal (até 3 MB)','file');
  comando(form,'Salvar alterações',async()=>{
   const val=preco.value.trim();const cent=val?Math.round(Number(val.replace(',','.'))*100):null;
   if(!nome.value.trim()||(val&&(!Number.isSafeInteger(cent)||cent<0)))throw Error('Nome ou preço inválido.');
   const arquivo=foto.files?.[0];if(arquivo)imagem(arquivo,3*1024*1024);
   await api('/produtos/'+encodeURIComponent(id),{method:'PATCH',
    json:{alteracoes:{nome:nome.value.trim(),descricao:desc.value,precoCentavos:cent},revisaoEsperada:r.revisao}});
   if(arquivo){
    try{
     const fotos=await api('/produtos/'+encodeURIComponent(id)+'/fotos');
     const versao=fotos.fotos?.find(x=>x.posicao===1)?.versao||0;
     await api('/produtos/'+encodeURIComponent(id)+'/fotos/1',{method:'POST',arquivo,
      headers:{'X-Foto-Versao-Esperada':String(versao)}});
    }catch(e){estado.textContent='Dados salvos, mas a foto não: '+e.message;return;}
   }
   estado.textContent='Produto salvo no catálogo.';location.reload();
  });
 }
 async function catraca(){
  const {form,estado}=abrir('Controlar a catraca do LOOP');
  const [m,d]=await Promise.all([api('/motor/estado'),api('/motor/agenda')]);
  const a=d.agenda||d;
  const info=document.createElement('p');info.textContent='Catraca: '+(m.catraca?.estado||'—')+
   '. Estes comandos usam o motor existente; não criam pagamentos.';form.append(info);
  comando(form,'Iniciar catraca',async()=>{
   if(!confirm('Iniciar a catraca?'))return;
   await api('/motor/catraca',{method:'POST',json:{acao:'ABRIR'}});
   estado.textContent='Catraca iniciada.';
  });
  comando(form,'Pausar catraca',async()=>{
   if(!confirm('Pausar a catraca?'))return;
   await api('/motor/catraca',{method:'POST',json:{acao:'PAUSAR'}});
   estado.textContent='Catraca pausada.';
  });
  const modo=campo(form,'Modo','select',a.modoExecucao||'MANUAL',
   [['MANUAL','Manual'],['AGENDADA','Agendada'],['NATURAL','Livre'],['STOP','Parada']]);
  const inicio=campo(form,'Abertura','time',a.abertura||'09:00');
  const fim=campo(form,'Fechamento','time',a.fechamento||'18:00');
  const intervalo=campo(form,'Intervalo (minutos)','number',a.intervaloMinutos||10);
  const meta=campo(form,'Meta diária de centros (0 = sem meta)','number',a.metaLotes?.quantidade||0);
  const data=campo(form,'Data da meta (opcional)','date',a.metaLotes?.dataAlvo||'');
  comando(form,'Salvar programação',async()=>{
   const salvo=await api('/motor/agenda',{method:'POST',json:{
    ativo:modo.value==='AGENDADA',modoExecucao:modo.value,
    abertura:inicio.value,fechamento:fim.value,
    intervaloMinutos:Number(intervalo.value),metaQuantidade:Number(meta.value),
    metaDataAlvo:data.value||null,excecaoData:a.excecaoData||null,
    excecaoFechamento:a.excecaoFechamento||null
   }});
   if(!salvo.configurada)throw Error('O motor não confirmou a programação.');
   estado.textContent='Programação gravada no motor.';
  });
 }
 async function verificar(){
  let ok=false;
  try{const r=await fetch('/staging/operador/estado',{credentials:'same-origin',cache:'no-store'});
   if(r.ok)ok=(await r.json()).operador===true;}catch{}
  operador=ok;document.body.classList.toggle('operador-na-tela',ok);
  const acesso=document.querySelector('.akitemm-acesso-operador');
  if(acesso){acesso.hidden=!ok;acesso.style.display=ok?'inline-flex':'none';}
  document.getElementById('akitemmOperadorMais')?.remove();
  document.getElementById('loopOperadorMais')?.remove();
 }
 document.addEventListener('click',e=>{
  if(!operador||dialogo?.contains(e.target))return;
  const prod=e.target.closest('.produto-loja-loop[data-produto-id]');
  const loja=e.target.closest('#akitemmBannerConteudo');
  const horario=e.target.closest('#atualizarTabuleiroIntegrado,#relogioTabuleiroIntegrado');
  const banner=e.target.closest('.loop03-banner-item');
  if(!prod&&!loja&&!horario&&!banner)return;
  e.preventDefault();e.stopImmediatePropagation();
  const processo=prod?produto(prod.dataset.produtoId):loja?bannerLoja():horario?catraca():
   bannerLoop([...document.querySelectorAll('.loop03-banner-item')].indexOf(banner)+1);
  void processo.catch(err=>{const s=dialogo?.querySelector('.mensagem-operador');if(s)s.textContent='Não foi possível abrir: '+err.message;});
 },true);
 addEventListener('loop:operador-entrou',()=>void verificar());
 addEventListener('loop:operador-saiu',()=>{
  operador=false;document.body.classList.remove('operador-na-tela');
  const link=document.querySelector('.akitemm-acesso-operador');
  if(link){link.hidden=true;link.style.display='none';}
  if(dialogo?.open)dialogo.close();
 });
 void verificar();addEventListener('pageshow',()=>void verificar());addEventListener('focus',()=>void verificar());
})();