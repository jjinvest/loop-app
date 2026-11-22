'use strict';
// Editor dinâmico do LOOP REAL. Não toca na vitrine AKITEMM.
(()=>{
 const pista=document.getElementById('loop03PistaBanners');
 if(!pista)return;
 const molduras=[...pista.querySelectorAll('.loop03-banner-item')];
 if(molduras.length!==4)return;
 const area=pista.closest('.loop03-banners-resumo');
 if(!area)return;
 let dados=null,operador=false,gravando=false,slotEditor=1;
 let indice=0,interagindoAte=0;
 const solicitar=async(url,opts={})=>{
  const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opts});
  const corpo=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(corpo.erro||'BANNERS_INDISPONIVEIS');
  return corpo;
 };
 const botao=document.createElement('button');
 botao.id='loop03BannerMaisReal';
 botao.className='loop03-banner-item loop03-banner-adicionar';
 botao.type='button';botao.textContent='+';
 botao.title='Criar novo banner LOOP';
 botao.setAttribute('aria-label','Adicionar novo banner do LOOP');
 botao.hidden=true;botao.innerHTML='<span aria-hidden="true">＋</span><strong>Adicionar banner</strong>';
 pista.append(botao);
 const pontos=area.querySelector('.loop03-banners-pontos');
 const dialogo=document.createElement('dialog');
 dialogo.id='loop03BannerFormularioReal';
 dialogo.className='banner-real-formulario';
 dialogo.innerHTML='<form method="dialog" class="banner-real-caixa">'+
  '<div class="banner-real-cabecalho"><h3 id="loop03BannerTituloEditor">Banner LOOP</h3>'+
  '<button type="submit" class="banner-real-fechar" aria-label="Fechar">×</button></div>'+
  '<p class="banner-real-explicacao">Escolha o formato e envie até três fotos para um banner.</p>'+
   '<label class="banner-real-arquivo">Formato do banner'+
   '<select id="loop03BannerColunasReal"><option value="1">1 foto comprida</option>'+
   '<option value="2">2 quadros lado a lado</option>'+
   '<option value="3">3 quadros lado a lado</option></select></label>'+
   '<label class="banner-real-arquivo">Enquadramento'+
   '<select id="loop03BannerModoReal"><option value="PREENCHER">Preencher os quadrinhos</option>'+
   '<option value="INTEIRA">Mostrar foto inteira</option></select></label>'+
  '<label class="banner-real-arquivo">Foto do banner (JPG, PNG ou WebP)'+
  '<input id="loop03BannerArquivoReal" type="file" accept="image/jpeg,image/png,image/webp"></label>'+
  '<img id="loop03BannerPreviaReal" class="banner-real-previa" alt="Prévia da foto" hidden>'+
   '<label class="banner-real-arquivo banner-foto-extra" data-posicao="2" hidden>'+
   'Foto do quadro 2<input id="loop03BannerArquivo2" type="file" accept="image/jpeg,image/png,image/webp"></label>'+
   '<label class="banner-real-arquivo banner-foto-extra" data-posicao="3" hidden>'+
   'Foto do quadro 3<input id="loop03BannerArquivo3" type="file" accept="image/jpeg,image/png,image/webp"></label>'+
  '<p id="loop03BannerEditorStatus" role="status"></p>'+
  '<div class="banner-real-acoes">'+
  '<button type="button" id="loop03BannerSalvarReal" class="banner-real-salvar">Salvar banner</button>'+
  '<button type="button" id="loop03BannerExcluirReal" class="banner-real-excluir">Excluir foto</button></div>'+
  '</form>';
 document.body.append(dialogo);
 const arquivo=dialogo.querySelector('#loop03BannerArquivoReal');
 const previa=dialogo.querySelector('#loop03BannerPreviaReal');
 const status=dialogo.querySelector('#loop03BannerEditorStatus');
 const salvarBotao=dialogo.querySelector('#loop03BannerSalvarReal');
 const excluirBotao=dialogo.querySelector('#loop03BannerExcluirReal');
 const colunas=dialogo.querySelector('#loop03BannerColunasReal');
 const modo=dialogo.querySelector('#loop03BannerModoReal');
 const extras=[2,3].map(n=>dialogo.querySelector('#loop03BannerArquivo'+n));
 const camposExtras=[...dialogo.querySelectorAll('.banner-foto-extra')];
 function mostrarCampos(){
  camposExtras.forEach(x=>{
   const visivel=Number(x.dataset.posicao)<=Number(colunas.value);
   x.hidden=!visivel;x.style.display=visivel?'flex':'none';
  });
 }
 colunas.addEventListener('change',mostrarCampos);
 let leitura=0;
 // Fotos da galeria Android podem trazer EXIF, bytes finais extras ou
 // codificação JPEG que a verificação binária estrita do servidor rejeita.
 // Decodificar e reexportar como JPEG padrão (sem recortar a imagem)
 // mantém a validação do servidor, sem ampliar os tipos aceitos por ele.
 async function prepararFotoBanner(foto){
  if(!foto||!['image/jpeg','image/png','image/webp'].includes(foto.type)||
     foto.size<40||foto.size>16*1024*1024)
   throw Error('SELECIONE_IMAGEM_JPG_PNG_WEBP_ATE_16MB');
  const imagem=new Image();
  const src=await new Promise((resolve,reject)=>{
   const leitor=new FileReader();
   leitor.onload=()=>resolve(String(leitor.result||''));
   leitor.onerror=()=>reject(Error('IMAGEM_NAO_PODE_SER_LIDA'));
   leitor.readAsDataURL(foto);
  });
  // Content-Security-Policy da identidade permite data:, mas nao blob:.
  try{
   imagem.src=src;
   try{await imagem.decode();}
   catch{throw Error('IMAGEM_NAO_PODE_SER_ABERTA');}
   const origemLargura=imagem.naturalWidth,origemAltura=imagem.naturalHeight;
   if(!origemLargura||!origemAltura||
      origemLargura>12000||origemAltura>12000||
      origemLargura*origemAltura>40000000)
    throw Error('IMAGEM_DIMENSOES_INVALIDAS');
   const escala=Math.min(1,2600/Math.max(origemLargura,origemAltura));
   let largura=Math.max(1,Math.round(origemLargura*escala));
   let altura=Math.max(1,Math.round(origemAltura*escala));
   const canvas=document.createElement('canvas');
   const contexto=canvas.getContext('2d',{alpha:false});
   if(!contexto)throw Error('IMAGEM_NAO_PODE_SER_PROCESSADA');
   for(let tentativa=0;tentativa<4;tentativa++){
    canvas.width=largura;canvas.height=altura;
    contexto.fillStyle='#ffffff';
    contexto.fillRect(0,0,largura,altura);
    contexto.drawImage(imagem,0,0,largura,altura);
    for(const qualidade of [0.92,0.85,0.76]){
     const convertido=await new Promise(resolve=>
      canvas.toBlob(resolve,'image/jpeg',qualidade));
     if(convertido?.type==='image/jpeg'&&convertido.size>=40&&
        convertido.size<=4*1024*1024)return convertido;
    }
    largura=Math.max(1,Math.round(largura*0.76));
    altura=Math.max(1,Math.round(altura*0.76));
   }
   throw Error('IMAGEM_NAO_CABE_EM_4MB');
  }finally{imagem.src='';}
 }
 function podeEditar(){
  return operador&&document.body.classList.contains('loop03-modo-operador');
 }
 function visiveis(){
  return [...pista.querySelectorAll('.loop03-banner-item')]
   .filter(x=>x.style.display!=='none');
 }
 function slotAtual(){
  const x=visiveis()[indice];
  return x===botao?null:Number(x?.dataset?.bannerSlot)||1;
 }
 function navegar(i){
  const itens=visiveis();
  if(!itens.length)return;
  indice=Math.max(0,Math.min(itens.length-1,i));
  pista.scrollTo({left:pista.clientWidth*indice,
   behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
  for(const [n,p] of [...pontos.children].entries())
   p.setAttribute('aria-current',String(n===indice));
 }
 function renderizar(){
  if(!dados?.slots)return;
  const editavel=podeEditar();
  const publicados=dados.slots.filter(x=>x.temImagem);
  for(const slot of dados.slots){
   let moldura=molduras.find(x=>Number(x.dataset.bannerSlot)===slot.slot);
   if(!moldura){
    if(slot.slot<=4)moldura=molduras[slot.slot-1];
    else{
     moldura=molduras[3].cloneNode(true);
     moldura.classList.add('loop03-banner-extra');
     const imgExtra=moldura.querySelector('[data-banner-imagem]');
     imgExtra.dataset.bannerImagem=String(slot.slot);
     imgExtra.alt='Foto do banner '+slot.slot;
     const nome=moldura.querySelector('strong');
     if(nome)nome.textContent='BANNER '+slot.slot;
     pista.insertBefore(moldura,botao);molduras.push(moldura);
    }
    moldura.dataset.bannerSlot=String(slot.slot);
   }
   const img=moldura.querySelector('[data-banner-imagem]');
   const mostrar=editavel||slot.temImagem||(!publicados.length&&slot.slot===1);
   moldura.hidden=!mostrar;
   moldura.style.display=mostrar?'block':'none';
   if(!slot.temImagem){img.hidden=true;img.removeAttribute('src');}
   else{
    img.setAttribute('data-enquadramento','INTEIRA');
    img.loading='eager';
    img.onload=()=>{img.hidden=false;};
    img.onerror=()=>{img.hidden=true;};
    const src='/api/loop/banners/'+slot.slot+'/imagem?rev='+slot.revisao;
    img.hidden=false;
    if(img.getAttribute('src')!==src)img.src=src;
   }
  }
  botao.hidden=!editavel;
  botao.style.display=editavel?'flex':'none';
  const itens=visiveis();
  pontos.replaceChildren();
  itens.forEach((item,i)=>{
   const p=document.createElement('button');
   p.type='button';p.setAttribute('aria-current',String(i===indice));
   p.setAttribute('aria-label',item===botao?'Adicionar novo banner':
    'Mostrar banner '+(item.dataset.bannerSlot||1));
   p.addEventListener('click',()=>{interagindoAte=Date.now()+9000;navegar(i);});
   pontos.append(p);
  });
  const atual=visiveis().findIndex(x=>x.dataset.bannerSlot===String(slotEditor));
  if(dialogo.open&&atual>=0)indice=atual;
  if(indice>=itens.length)indice=Math.max(0,itens.length-1);
  navegar(indice);
 }
  async function carregar(){
  try{
   const x=await solicitar('/api/loop/banners');
   if(!Number.isSafeInteger(x.quantidadeMaxima)||
      x.quantidadeMaxima<4||!Array.isArray(x.slots)||x.slots.length<4||
      x.slots.some((s,i)=>!Number.isSafeInteger(s.slot)||
       (i>0&&s.slot<=x.slots[i-1].slot)))
    throw Error('BANNERS_RESPOSTA_INVALIDA');
   dados=x;
   renderizar();
  }catch{
   dados=null;renderizar();
  }
 }
 async function checarAcesso(){
  try{
   const r=await solicitar('/api/operador/estado');
   operador=r.operador===true;
  }catch{operador=false;}
  await carregar();
 }
 function abrir(numero){
  if(!podeEditar()||gravando)return;
  slotEditor=numero||slotAtual();
  if(!slotEditor)return;
  dialogo.querySelector('#loop03BannerTituloEditor').textContent=
   'Banner '+slotEditor+' · LOOP';
  arquivo.value='';previa.hidden=true;previa.removeAttribute('src');
  const atual=dados?.slots?.find(x=>x.slot===slotEditor);
  colunas.value=String(atual?.colunas||1);
  modo.value=atual?.modo||(atual?.colunas===1?'INTEIRA':'PREENCHER');
  extras.forEach(x=>{x.value='';});
  mostrarCampos();
  status.textContent='';
  excluirBotao.disabled=!dados?.slots?.find(x=>x.slot===slotEditor)?.temImagem;
  if(!dialogo.open)dialogo.showModal();
 }
 async function adicionar(){
  if(!podeEditar()||gravando)return;
  gravando=true;
  try{
   const token=await solicitar('/api/admin/comercial/sessao');
   if(typeof token.csrfToken!=='string')throw Error('SESSAO_OPERADOR_INVALIDA');
   const r=await solicitar('/api/admin/loop/banners/adicionar',{
    method:'POST',headers:{'X-Loop-Admin-Csrf':token.csrfToken}
   });
   if(!Number.isSafeInteger(r.novoSlot))throw Error('BANNER_NAO_CRIADO');
   dados=r;gravando=false;renderizar();
   indice=visiveis().findIndex(x=>x.dataset.bannerSlot===String(r.novoSlot));
   navegar(indice);
   abrir(r.novoSlot);
  }catch(e){
   gravando=false;
   window.alert('Não foi possível criar o banner: '+e.message);
   await carregar();
  }
 }
 botao.addEventListener('click',e=>{e.preventDefault();void adicionar();});
 pista.addEventListener('click',e=>{
  const item=e.target.closest('.loop03-banner-item');
  if(!item||item===botao||!podeEditar())return;
  e.preventDefault();abrir(Number(item.dataset.bannerSlot));
 });
 pista.addEventListener('scroll',()=>{
  if(pista.clientWidth>0){
   indice=Math.min(visiveis().length-1,Math.max(0,
    Math.round(pista.scrollLeft/pista.clientWidth)));
   for(const [i,p] of [...pontos.children].entries())
    p.setAttribute('aria-current',String(i===indice));
  }
 },{passive:true});
 for(const evento of ['pointerdown','focusin','wheel'])
  pista.addEventListener(evento,()=>{interagindoAte=Date.now()+9000;});
 setInterval(()=>{
  if(document.hidden||dialogo.open||area.closest('[hidden]')||
    Date.now()<interagindoAte||
    matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  const itens=visiveis().filter(x=>x!==botao);
  if(itens.length>1)navegar((indice+1)%itens.length);
 },7500);
 window.addEventListener('resize',()=>navegar(indice));
 // Login de cliente/operador pode acontecer sem recarregar a página.
 // Revalidar a sessão e buscar as quatro fotos após a troca de modo.
 const obs=new MutationObserver(()=>{void checarAcesso();});
 obs.observe(document.body,{attributes:true,attributeFilter:['class']});
 arquivo.addEventListener('change',()=>{
  const f=arquivo.files?.[0];
  if(!f){previa.hidden=true;return;}
  if(!['image/jpeg','image/png','image/webp'].includes(f.type)||
     f.size<40||f.size>16*1024*1024){
   status.textContent='Escolha JPG, PNG ou WebP de até 16 MB.';
   arquivo.value='';previa.hidden=true;return;
  }
  status.textContent='Imagem pronta para salvar.';
  const atual=++leitura,leitor=new FileReader();
  leitor.onload=()=>{
   if(atual!==leitura)return;
   previa.src=String(leitor.result);previa.hidden=false;
  };
  leitor.onerror=()=>{status.textContent='Não foi possível ler a imagem.';};
  leitor.readAsDataURL(f);
 });
 async function gravar(remover){
  if(gravando||!dialogo.open)return;
  if(!operador){
   status.textContent='Acesso do operador não confirmado. Entre novamente como operador.';
   return;
  }
  const slot=dados?.slots?.find(x=>x.slot===slotEditor),foto=arquivo.files?.[0];
  if(!slot){
   status.textContent='Banners indisponíveis para salvar. Atualize a página e tente novamente.';
   void carregar();
   return;
  }
  if(!remover&&(!foto||
     !['image/jpeg','image/png','image/webp'].includes(foto.type)||
     foto.size<40||foto.size>16*1024*1024)){
   status.textContent='Selecione uma foto JPG, PNG ou WebP válida.';return;
  }
  gravando=true;salvarBotao.disabled=true;excluirBotao.disabled=true;
  status.textContent=remover?'Excluindo foto...':'Preparando a imagem automaticamente...';
  try{
   const imagemPronta=remover?null:await prepararFotoBanner(foto);
   status.textContent=remover?'Excluindo foto...':'Salvando banner no LOOP...';
   const token=await solicitar('/api/admin/comercial/sessao');
   if(typeof token.csrfToken!=='string'||token.csrfToken.length<20)
    throw Error('SESSAO_OPERADOR_INVALIDA');
   const caminho='/api/admin/loop/banners/'+slotEditor+'/imagem';
   const headers={'X-Loop-Admin-Csrf':token.csrfToken,
    'X-Banner-Revisao-Esperada':String(slot.revisao)};
   if(!remover)headers['Content-Type']='image/jpeg';
   const resultado=await solicitar(caminho,{
    method:remover?'DELETE':'PUT',headers,
    ...(!remover?{body:imagemPronta}:{})
   });
   if(!Array.isArray(resultado.slots)||!resultado.slots.find(x=>x.slot===slotEditor))
    throw Error('BANNER_NAO_CONFIRMADO');
   dados=resultado;renderizar();
   status.textContent=remover?'Foto excluída do LOOP.':'Foto salva no LOOP.';
   if(!remover)arquivo.value='';
   excluirBotao.disabled=!dados.slots.find(x=>x.slot===slotEditor).temImagem;
  }catch(e){
   status.textContent='Não foi possível salvar: '+e.message;
   await carregar();
  }finally{
   gravando=false;salvarBotao.disabled=false;
   excluirBotao.disabled=!dados?.slots?.find(x=>x.slot===slotEditor)?.temImagem;
  }
 }
 salvarBotao.addEventListener('click',()=>void gravar(false));
 excluirBotao.addEventListener('click',()=>{
  if(window.confirm('Excluir a imagem deste banner LOOP?'))
   void gravar(true);
 });
 window.addEventListener('pageshow',()=>void checarAcesso());
 window.addEventListener('focus',()=>void checarAcesso());
 document.addEventListener('visibilitychange',()=>{
  if(!document.hidden)void checarAcesso();
 });
 void checarAcesso();
})();
