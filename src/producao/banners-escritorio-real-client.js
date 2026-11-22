'use strict';
// Editor dos quatro banners do LOOP REAL. Não toca na vitrine AKITEMM.
(()=>{
 const pista=document.getElementById('loop03PistaBanners');
 if(!pista)return;
 const molduras=[...pista.querySelectorAll('.loop03-banner-item')];
 if(molduras.length!==4)return;
 const area=pista.closest('.loop03-banners-resumo');
 if(!area)return;
 let dados=null,operador=false,gravando=false,slotEditor=1;
 const solicitar=async(url,opts={})=>{
  const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opts});
  const corpo=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(corpo.erro||'BANNERS_INDISPONIVEIS');
  return corpo;
 };
 const botao=document.createElement('button');
 botao.id='loop03BannerMaisReal';
 botao.className='banner-real-mais';
 botao.type='button';botao.textContent='+';
 botao.title='Adicionar ou trocar imagem do banner LOOP';
 botao.setAttribute('aria-label','Editar imagem deste banner do LOOP');
 botao.hidden=true;area.append(botao);
 const dialogo=document.createElement('dialog');
 dialogo.id='loop03BannerFormularioReal';
 dialogo.className='banner-real-formulario';
 dialogo.innerHTML='<form method="dialog" class="banner-real-caixa">'+
  '<div class="banner-real-cabecalho"><h3 id="loop03BannerTituloEditor">Banner LOOP</h3>'+
  '<button type="submit" class="banner-real-fechar" aria-label="Fechar">×</button></div>'+
  '<p class="banner-real-explicacao">Escolha a arte. O enquadramento é automático e mostra a imagem inteira.</p>'+
  '<label class="banner-real-arquivo">Foto do banner (JPG, PNG ou WebP)'+
  '<input id="loop03BannerArquivoReal" type="file" accept="image/jpeg,image/png,image/webp"></label>'+
  '<img id="loop03BannerPreviaReal" class="banner-real-previa" alt="Prévia da foto" hidden>'+
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
 function slotAtual(){
  if(!pista.clientWidth)return 1;
  return Math.min(4,Math.max(1,1+Math.round(
   pista.scrollLeft/pista.clientWidth)));
 }
 function exibirEditor(){
  botao.hidden=!(operador&&document.body.classList.contains('loop03-modo-operador'));
  if(!botao.hidden)botao.setAttribute('aria-label',
   'Editar banner '+slotAtual()+' do LOOP');
 }
 function renderizar(){
  for(let i=0;i<4;i++){
   const img=molduras[i].querySelector('[data-banner-imagem="'+(i+1)+'"]');
   const slot=dados?.slots?.[i];
   if(!img||!slot?.temImagem){
    if(img){img.hidden=true;img.removeAttribute('src');}
    continue;
   }
   img.setAttribute('data-enquadramento','INTEIRA');
   const src='/api/loop/banners/'+slot.slot+'/imagem?rev='+slot.revisao;
   // Um img oculto com loading=lazy nao inicia a requisicao: a foto
   // fica gravada no SQLite, mas nunca aparece depois de recarregar.
   // Exibir a moldura e forcar carregamento real antes de aguardar onload.
   img.loading='eager';
   img.onload=()=>{img.hidden=false;};
   img.onerror=()=>{img.hidden=true;};
   img.hidden=false;
   if(img.getAttribute('src')!==src)img.src=src;
  }
  exibirEditor();
 }
 async function carregar(){
  try{
   const x=await solicitar('/api/loop/banners');
   if(x.quantidadeMaxima!==4||!Array.isArray(x.slots)||
      x.slots.length!==4||x.slots.some((s,i)=>s.slot!==i+1))
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
  exibirEditor();
  await carregar();
 }
 function abrir(){
  if(!operador||botao.hidden||gravando)return;
  slotEditor=slotAtual();
  dialogo.querySelector('#loop03BannerTituloEditor').textContent=
   'Banner '+slotEditor+' · LOOP';
  arquivo.value='';previa.hidden=true;previa.removeAttribute('src');
  status.textContent='';
  excluirBotao.disabled=!dados?.slots?.[slotEditor-1]?.temImagem;
  if(!dialogo.open)dialogo.showModal();
 }
 botao.addEventListener('click',e=>{e.preventDefault();abrir();});
 pista.addEventListener('scroll',exibirEditor,{passive:true});
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
  const slot=dados?.slots?.[slotEditor-1],foto=arquivo.files?.[0];
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
   if(resultado.quantidadeMaxima!==4||resultado.slots?.length!==4)
    throw Error('BANNER_NAO_CONFIRMADO');
   dados=resultado;renderizar();
   status.textContent=remover?'Foto excluída do LOOP.':'Foto salva no LOOP.';
   if(!remover)arquivo.value='';
   excluirBotao.disabled=!dados.slots[slotEditor-1].temImagem;
  }catch(e){
   status.textContent='Não foi possível salvar: '+e.message;
   await carregar();
  }finally{
   gravando=false;salvarBotao.disabled=false;
   excluirBotao.disabled=!dados?.slots?.[slotEditor-1]?.temImagem;
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
