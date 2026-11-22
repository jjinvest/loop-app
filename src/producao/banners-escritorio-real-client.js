'use strict';
// Editor dinâmico do LOOP REAL. Não toca na vitrine AKITEMM.
(()=>{
 const pista=document.getElementById('loop03PistaBanners');
 if(!pista)return;
 const molduras=[...pista.querySelectorAll('.loop03-banner-item')];
 if(molduras.length!==4)return;
 // O carrossel original e o dinâmico não devem acionar relógios de rolagem simultâneos.
 pista.dataset.carrosselDinamico='true';
 const area=pista.closest('.loop03-banners-resumo');
 if(!area)return;
 let dados=null,operador=false,gravando=false,slotEditor=1;
 let indice=0,interagindoAte=0,bloquearCliqueAte=0,inicioGesto=null;
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
  '<button type="button" id="loop03BannerExcluirReal" class="banner-real-excluir">Excluir foto</button>'+
  '<button type="button" id="loop03BannerDescartarEspacoReal" class="banner-real-descartar" hidden>🗑 Descartar espaço</button></div>'+
  '</form>';
 document.body.append(dialogo);
 const arquivo=dialogo.querySelector('#loop03BannerArquivoReal');
 const previa=dialogo.querySelector('#loop03BannerPreviaReal');
 const status=dialogo.querySelector('#loop03BannerEditorStatus');
 const salvarBotao=dialogo.querySelector('#loop03BannerSalvarReal');
 const excluirBotao=dialogo.querySelector('#loop03BannerExcluirReal');
 const descartarBotao=dialogo.querySelector('#loop03BannerDescartarEspacoReal');
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
  // Os espaços descartados não devem deixar cartões fantasmas no carrossel.
  const slotsAtuais=new Set(dados.slots.map(x=>x.slot));
  for(let i=molduras.length-1;i>=0;i--){
   const m=molduras[i],n=Number(m.dataset.bannerSlot);
   if(n>4&&!slotsAtuais.has(n)){m.remove();molduras.splice(i,1);}
  }
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
   if(slot.slot>4){
    let lixeira=moldura.querySelector('.loop03-banner-lixeira');
    if(!lixeira){
     lixeira=document.createElement('button');
     lixeira.type='button';lixeira.className='loop03-banner-lixeira';
     lixeira.innerHTML='<span aria-hidden="true">🗑</span>';
     lixeira.title='Descartar espaço do banner '+slot.slot;
     lixeira.setAttribute('aria-label','Descartar espaço do banner '+slot.slot);
     lixeira.addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();
      void descartarEspaco(slot.slot);
     });
     moldura.append(lixeira);
    }
    lixeira.hidden=!editavel;
    lixeira.style.display=editavel?'grid':'none';
   }
   const img=moldura.querySelector('[data-banner-imagem]');
   // Operador edita todos os espaços; cliente só vê banners publicados.
   const mostrar=editavel||slot.publicado;
   moldura.hidden=!mostrar;
   moldura.style.display=mostrar?'block':'none';
   moldura.querySelector('.banner-mosaico')?.remove();
   const quadros=Number(slot.colunas)||1;
   if(quadros>1&&(editavel||slot.publicado)){
    img.hidden=true;img.removeAttribute('src');
    const grade=document.createElement('div');
    grade.className='banner-mosaico';
    grade.style.setProperty('--banner-quadros',String(quadros));
    grade.dataset.modo=slot.modo||'PREENCHER';
    for(let pos=1;pos<=quadros;pos++){
     const f=slot.fotos?.[pos-1];
     const quadro=document.createElement('div');
     quadro.className='banner-mosaico-celula';
     if(f?.temImagem){
      const im=document.createElement('img');
      im.alt='Foto '+pos+' do banner '+slot.slot;
      im.loading='eager';
      im.src='/api/loop/banners/'+slot.slot+'/foto/'+pos+
       '?rev='+slot.revisao;
      quadro.append(im);
     }else if(editavel)quadro.textContent='Foto '+pos+' · adicionar';
     grade.append(quadro);
    }
    moldura.append(grade);
   }else if(!slot.temImagem||(!editavel&&!slot.publicado)){
    // Cliente nunca recebe espaços vazios ou mosaicos incompletos.
    img.hidden=true;img.removeAttribute('src');
   }else{
    img.setAttribute('data-enquadramento',slot.modo||'INTEIRA');
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
  descartarBotao.hidden=slotEditor<=4;
  descartarBotao.style.display=slotEditor<=4?'none':'inline-flex';
  descartarBotao.disabled=slotEditor<=4;
  if(!dialogo.open)dialogo.showModal();
 }
 async function descartarEspaco(numero){
  if(!podeEditar()||gravando||!Number.isSafeInteger(numero)||numero<=4)return;
  const item=dados?.slots?.find(x=>x.slot===numero);
  if(!item)return;
  if(!window.confirm(
   'Descartar o espaço '+numero+' do LOOP? As fotos e o formato dele '+
   'também serão excluídos. Os quatro banners originais serão preservados.'
  ))return;
  gravando=true;
  if(dialogo.open)descartarBotao.disabled=true;
  try{
   const sessao=await solicitar('/api/admin/comercial/sessao');
   if(typeof sessao.csrfToken!=='string'||sessao.csrfToken.length<20)
    throw Error('SESSAO_OPERADOR_INVALIDA');
   const r=await solicitar('/api/admin/loop/banners/'+numero,{
    method:'DELETE',
    headers:{
     'X-Loop-Admin-Csrf':sessao.csrfToken,
     'X-Banner-Revisao-Esperada':String(item.revisao)
    }
   });
   if(!Array.isArray(r.slots)||r.slots.some(x=>x.slot===numero))
    throw Error('BANNER_ESPACO_NAO_EXCLUIDO');
   dados=r;
   if(dialogo.open)dialogo.close();
   indice=Math.max(0,indice-1);
   renderizar();
  }catch(e){
   window.alert('Não foi possível descartar o espaço: '+e.message);
   await carregar();
  }finally{
   gravando=false;
   descartarBotao.disabled=false;
  }
 }
 descartarBotao.addEventListener('click',()=>void descartarEspaco(slotEditor));
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
  if(!item||item===botao||e.target.closest('.loop03-banner-lixeira')||
     !podeEditar()||Date.now()<bloquearCliqueAte)return;
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
 pista.addEventListener('pointerdown',e=>{inicioGesto=e.clientX;});
 pista.addEventListener('pointerup',e=>{
  if(inicioGesto!==null&&Math.abs(e.clientX-inicioGesto)>20)
   bloquearCliqueAte=Date.now()+500;
  inicioGesto=null;
 });
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
  if(gravando||!dialogo.open||!podeEditar())return;
  const atual=dados?.slots?.find(x=>x.slot===slotEditor);
  if(!atual){status.textContent='Banner indisponível. Atualize a página.';return;}
  const n=Number(colunas.value),arquivos=[arquivo,...extras];
  const selecionados=arquivos.slice(0,n).some(x=>x.files?.length);
  const layoutMudou=atual.colunas!==n||atual.modo!==modo.value;
  if(!remover&&!selecionados&&!layoutMudou){
   status.textContent='Escolha uma foto ou mude o formato do banner.';return;
  }
  gravando=true;salvarBotao.disabled=true;excluirBotao.disabled=true;
  try{
   const token=await solicitar('/api/admin/comercial/sessao');
   if(typeof token.csrfToken!=='string'||token.csrfToken.length<20)
    throw Error('SESSAO_OPERADOR_INVALIDA');
   const auth={'X-Loop-Admin-Csrf':token.csrfToken};
   let estado=atual;
   const executar=async(url,method,body,mime)=>{
    const resposta=await solicitar(url,{
     method,headers:{...auth,
      'X-Banner-Revisao-Esperada':String(estado.revisao),
      ...(mime?{'Content-Type':mime}:{})},
     ...(body!==undefined?{body}:{})
    });
    dados=resposta;
    estado=dados.slots?.find(x=>x.slot===slotEditor);
    if(!estado)throw Error('BANNER_NAO_CONFIRMADO');
   };
   const base='/api/admin/loop/banners/'+slotEditor;
   if(remover){
    await executar(base+'/imagem','DELETE');
    status.textContent='Foto principal excluída.';
   }else{
    if(layoutMudou){
     await executar(base+'/layout','POST',
      JSON.stringify({colunas:n,modo:modo.value,
       revisaoEsperada:estado.revisao}),'application/json');
    }
    for(let i=0;i<n;i++){
     const foto=arquivos[i].files?.[0];
     if(!foto)continue;
     status.textContent='Preparando foto '+(i+1)+' de '+n+'...';
     const pronta=await prepararFotoBanner(foto);
     await executar(i===0?base+'/imagem':base+'/foto/'+(i+1),
      'PUT',pronta,'image/jpeg');
    }
    status.textContent=estado.publicado?
     'Banner salvo e publicado com '+n+' foto(s).':
     'Formato salvo. Envie as fotos que faltam para publicar.';
    arquivos.forEach(x=>{x.value='';});
   }
   renderizar();
  }catch(e){
   status.textContent='Não foi possível concluir: '+e.message;
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
