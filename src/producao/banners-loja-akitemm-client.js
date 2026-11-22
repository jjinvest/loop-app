'use strict';
// Banners dinâmicos REAIS da AKITEMM, sem alterar a estrutura aprovada.
// Arquivos só são enviados pela sessão autenticada do operador.
(()=>{
 const area=document.querySelector('.akitemm-banner');
 if(!area)return;
 const conteudo=area.querySelector('#akitemmBannerConteudo');
 const pontos=area.querySelector('#akitemmBannerPontos');
 const esquerda=area.querySelector('#akitemmBannerAnterior');
 const direita=area.querySelector('#akitemmBannerProximo');
 if(!conteudo||!pontos||!esquerda||!direita)return;
 const visao=new URLSearchParams(location.search).get('visao');
 const visaoCliente=visao==='cliente',visaoOperador=visao==='operador';
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
 const mosaico=document.createElement('div');
 mosaico.className='banner-mosaico akitemm-mosaico';
 mosaico.hidden=true;
 foto.insertAdjacentElement('afterend',mosaico);
 const adicionarVisual=document.createElement('button');
 adicionarVisual.type='button';adicionarVisual.className='akitemm-banner-adicionar';
 adicionarVisual.textContent='＋ Adicionar novo banner';
 adicionarVisual.setAttribute('aria-label','Criar mais um banner da AKITEMM');
 adicionarVisual.addEventListener('click',()=>void criarBanner());
 const mais=document.createElement('button');
 mais.type='button';mais.id='akitemmBannerMaisReal';
 mais.className='banner-real-mais';mais.textContent='+';
 mais.title='Cadastrar ou trocar banner da AKITEMM';
 mais.setAttribute('aria-label','Editar banner da AKITEMM');
 mais.hidden=true;area.append(mais);
 const dialogo=document.createElement('dialog');
 dialogo.id='akitemmBannerFormularioReal';
 dialogo.className='banner-real-formulario';
 const caixa=document.createElement('div');caixa.className='banner-real-caixa';
 const topo=document.createElement('div');topo.className='banner-real-cabecalho';
 const titulo=document.createElement('h3');titulo.textContent='Banner AKITEMM';
 const fechar=document.createElement('button');fechar.type='button';
 fechar.className='banner-real-fechar';fechar.textContent='×';
 fechar.setAttribute('aria-label','Fechar formulário');
 fechar.addEventListener('click',()=>dialogo.close());
 dialogo.addEventListener('close',()=>rodar());
 topo.append(titulo,fechar);
 const explicacao=document.createElement('p');
 explicacao.className='banner-real-explicacao';
 explicacao.textContent='Toque nas fotos para adicionar ou ajustar.';
 const linhaColunas=document.createElement('label');
 linhaColunas.className='banner-real-arquivo';
 linhaColunas.textContent='Formato do banner';
 const colunas=document.createElement('select');
 colunas.id='akitemmBannerColunasReal';
 for(const [valor,t] of [['1','1 foto comprida'],['2','2 quadros lado a lado'],
  ['3','3 quadros lado a lado']]){
  const op=document.createElement('option');op.value=valor;op.textContent=t;
  colunas.append(op);
 }
 linhaColunas.append(colunas);
 const linhaModo=document.createElement('label');
 linhaModo.className='banner-real-arquivo';
 linhaModo.textContent='Enquadramento';
 const modo=document.createElement('select');
 modo.id='akitemmBannerModoReal';
 for(const [valor,t] of [['PREENCHER','Preencher os quadrinhos'],
  ['INTEIRA','Mostrar foto inteira']]){
  const op=document.createElement('option');op.value=valor;op.textContent=t;
  modo.append(op);
 }
 linhaModo.append(modo);
 linhaModo.classList.add('banner-editor-modo-oculto');
 const rotulo=document.createElement('label');
 rotulo.className='banner-real-arquivo';
 rotulo.textContent='Foto do quadro 1 (JPG, PNG ou WebP)';
 const escolher=document.createElement('input');
 escolher.id='akitemmBannerArquivoOperador';escolher.type='file';
 escolher.accept='image/jpeg,image/png,image/webp';
 rotulo.append(escolher);
 const previa=document.createElement('img');
 previa.id='akitemmBannerPreviaReal';previa.className='banner-real-previa';
 previa.alt='Prévia do banner AKITEMM';previa.hidden=true;
 previa.classList.add('banner-editor-previa-oculta');
 const fotosExtras=[2,3].map(n=>{
  const linha=document.createElement('label');
  linha.className='banner-real-arquivo banner-foto-extra';
  linha.dataset.posicao=String(n);
  linha.textContent='Foto do quadro '+n;
  const arquivo=document.createElement('input');
  arquivo.type='file';arquivo.id='akitemmBannerArquivo'+n;
  arquivo.accept='image/jpeg,image/png,image/webp';
  linha.append(arquivo);
  return {linha,arquivo};
 });
 function mostrarCampos(){
  fotosExtras.forEach(x=>{
   const visivel=Number(x.linha.dataset.posicao)<=Number(colunas.value);
   x.linha.hidden=!visivel;
   x.linha.style.display=visivel?'flex':'none';
  });
  const atual=current();
  lixeirasFotos.forEach((b,i)=>{
   b.hidden=!operador||i+1>Number(colunas.value)||
    !atual?.fotos?.[i]?.temImagem;
  });
 }
 colunas.addEventListener('change',mostrarCampos);
 const controles=document.createElement('div');
 controles.id='akitemmBannerControlesOperador';
 controles.className='banner-real-acoes';
 const botoes=[['foto','Salvar banner'],['anterior','Mover para esquerda'],
  ['proximo','Mover para direita'],['remover','Excluir foto']];
 for(const [acao,texto] of botoes){
  const b=document.createElement('button');b.type='button';
  b.dataset.acao=acao;b.textContent=texto;
  if(acao==='foto')b.className='banner-real-salvar';
  if(acao==='remover')b.className='banner-real-excluir';
  controles.append(b);
 }
 const estado=document.createElement('p');estado.id='akitemmBannerStatus';
 estado.setAttribute('role','status');
 fotosExtras.forEach((x,i)=>x.arquivo.addEventListener('change',()=>{
  if(x.arquivo.files?.[0])
   estado.textContent='Foto '+(i+2)+' selecionada. Clique em Salvar banner.';
 }));
 const lixeirasFotos=[escolher,...fotosExtras.map(x=>x.arquivo)].map((input,i)=>{
  const b=document.createElement('button');
  b.type='button';b.className='banner-foto-lixeira';
  b.textContent='🗑 Excluir foto '+(i+1);b.hidden=true;
  b.setAttribute('aria-label','Excluir foto '+(i+1)+' deste banner');
  b.addEventListener('click',()=>void removerFotoIndividual(current()?.slot,i+1));
  input.parentElement.insertAdjacentElement('afterend',b);
  return b;
 });
 caixa.append(topo,explicacao,linhaColunas,linhaModo,
  rotulo,previa,...fotosExtras.map(x=>x.linha),estado,controles);
 dialogo.append(caixa);document.body.append(dialogo);
 lixeirasFotos.forEach(b=>b.classList.add('banner-editor-lixeira-oculta'));
 controles.querySelector('[data-acao="remover"]').classList.add('banner-editor-acoes-excluir-oculto');
 const fotosEditor=fotosNoProprioQuadro({dialogo,antes:rotulo,
  inputs:[escolher,...fotosExtras.map(x=>x.arquivo)],colunas,status:estado,
  razao:2.2,slot:()=>current(),
  urlFoto:pos=>'/api/loja/banners/'+current()?.slot+'/foto/'+pos+
   '?rev='+(current()?.revisao||0),
  apagar:pos=>removerFotoIndividual(current()?.slot,pos)});
 colunas.addEventListener('change',()=>{
  modo.value=Number(colunas.value)>1?'PREENCHER':'INTEIRA';
  fotosEditor.pintar();
 });
 let leitorFoto=0;
 function abrirFormulario(pos=0){
  if(!operador||bloqueio||!slots)return;
  const atual=current();if(!atual)return;
  if(atual.adicionar){void criarBanner();return;}
  titulo.textContent='Banner '+atual.slot+' · AKITEMM';
  escolher.value='';previa.hidden=true;previa.removeAttribute('src');
  fotosEditor.limpar();
  colunas.value=String(atual.colunas||1);
  modo.value=atual.modo||(atual.colunas===1?'INTEIRA':'PREENCHER');
  mostrarCampos();fotosEditor.pintar();
  estado.textContent='';
  if(!dialogo.open){parar();dialogo.showModal();}
   if(pos)fotosEditor.abrir(pos);
 }
 mais.addEventListener('click',e=>{e.preventDefault();abrirFormulario();});
 function visiveis(){
  if(!slots)return [];
  if(operador)return [...slots,{slot:slots.at(-1).slot+1,adicionar:true}];
  const imagens=slots.filter(s=>s.publicado);
  return imagens.length?imagens:[slots[0]];
 }
 function current(){return visiveis()[indice]||null;}
 function parar(){if(intervalo!==null)clearInterval(intervalo);intervalo=null;}
 function rodar(){
  parar();
  if(document.hidden||dialogo.open)return;
  const publicadas=visiveis().filter(x=>x.publicado);
  if(publicadas.length>1)intervalo=setInterval(()=>{
   if(document.hidden||dialogo.open)return;
   const visao=visiveis(),atual=visao[indice];
   const lugar=publicadas.findIndex(x=>x.slot===atual?.slot);
   const proxima=publicadas[(lugar+1)%publicadas.length];
   indice=visao.findIndex(x=>x.slot===proxima.slot);
   renderizar();
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
  const imagem=slot.publicado===true,adicionando=slot.adicionar===true;
  const quadros=Number(slot.colunas)||1;
  const exibirMosaico=quadros>1&&(imagem||operador)&&!adicionando;
  foto.hidden=!imagem||quadros>1;
  mosaico.hidden=!exibirMosaico;
  mosaico.replaceChildren();
  if(exibirMosaico){
   mosaico.style.setProperty('--banner-quadros',String(quadros));
   mosaico.dataset.modo=slot.modo||'PREENCHER';
   for(let pos=1;pos<=quadros;pos++){
    const sub=slot.fotos?.[pos-1],quadro=document.createElement('div');
    quadro.className='banner-mosaico-celula';
     quadro.dataset.fotoPosicao=String(pos);
    if(sub?.temImagem){
     const im=document.createElement('img');
     im.alt='Foto '+pos+' do banner '+slot.slot;
     im.src='/api/loja/banners/'+slot.slot+'/foto/'+pos+
      '?rev='+slot.revisao;
     quadro.append(im);
     if(operador){
      const b=document.createElement('button');
      b.type='button';b.className='banner-foto-lixeira-quadro';
      b.textContent='🗑';b.title='Excluir apenas a foto '+pos;
      b.setAttribute('aria-label','Excluir foto '+pos+' do banner '+slot.slot);
      b.addEventListener('click',e=>{
       e.preventDefault();e.stopPropagation();
       void removerFotoIndividual(slot.slot,pos);
      });
      quadro.append(b);
     }
    }else if(operador)quadro.textContent='Foto '+pos+' · adicionar';
    mosaico.append(quadro);
   }
  }
  area.classList.toggle('akitemm-banner-com-foto',imagem);
  if(imagem){
   const caminho='/api/loja/banners/'+slot.slot+'/imagem?revisao='+
    (slot.atualizadoEm||slot.revisao);
   if(foto.getAttribute('src')!==caminho)foto.src=caminho;
   foto.style.objectFit=slot.modo==='PREENCHER'?'cover':'contain';
   foto.alt='Banner '+slot.slot+' da AKITEMM';
  }else foto.removeAttribute('src');
  conteudo.style.display=(imagem||slot.slot!==1||adicionando)?'none':'';
  placeholder.hidden=exibirMosaico||imagem||(!adicionando&&slot.slot===1);
  if(!placeholder.hidden){
   if(adicionando)placeholder.replaceChildren(adicionarVisual);
   else placeholder.textContent='Banner '+slot.slot+
    (operador?' · toque para colocar a imagem':' · AKITEMM');
  }
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
   b.textContent=item.adicionar?'+':String(item.slot);
   b.setAttribute('aria-label','Mostrar banner '+item.slot);
   b.setAttribute('aria-current',String(i===indice));
   b.addEventListener('click',()=>selecionar(i));
   pontos.append(b);
  });
  mais.hidden=true; // o + fica somente no fim do carrossel
  if(!operador&&dialogo.open)dialogo.close();
  if(operador){
   const acao=n=>controles.querySelector('[data-acao="'+n+'"]');
   mais.setAttribute('aria-label','Editar banner '+slot.slot+' da AKITEMM');
   acao('foto').textContent='Salvar banner '+slot.slot;
   acao('foto').disabled=adicionando||bloqueio;
   acao('anterior').disabled=adicionando||slot.slot===1||bloqueio;
   acao('proximo').disabled=adicionando||
    slot.slot===slots[slots.length-1].slot||bloqueio;
   acao('remover').disabled=adicionando||!slot.temImagem||bloqueio;
  }
 }
 async function carregar(){
  try{
   const dados=await requisitar('/api/loja/banners');
   if(!Number.isSafeInteger(dados.quantidadeMaxima)||
      dados.quantidadeMaxima<4||!Array.isArray(dados.slots)||
      dados.slots.length<4||
      dados.slots.some((x,i)=>!Number.isSafeInteger(x.slot)||
       (i>0&&x.slot<=dados.slots[i-1].slot)||
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
  operador=false;
  try{
   const r=await requisitar('/api/operador/estado');
   if(r.operador===true&&!visaoCliente){
    if(visaoOperador)operador=true;
    else{
     // Sem escolha explicita: nunca mostrar edicao na conta cliente.
     const cliente=await fetch('/api/contas/me',{
      credentials:'same-origin',cache:'no-store'
     });
     operador=cliente.status===401;
    }
   }
  }catch{operador=false;}
  renderizar();await carregar();
 }
 async function criarBanner(){
  if(!operador||bloqueio)return;
  bloqueio=true;parar();
  try{
   const sessao=await requisitar('/api/admin/comercial/sessao');
   if(typeof sessao.csrfToken!=='string')throw Error('SESSAO_OPERADOR_INVALIDA');
   const r=await requisitar('/api/admin/akitemm/banners/adicionar',{
    method:'POST',headers:{'X-Loop-Admin-Csrf':sessao.csrfToken}
   });
   if(!Array.isArray(r.slots)||!Number.isSafeInteger(r.novoSlot))
    throw Error('BANNER_NAO_CRIADO');
   slots=r.slots;
   indice=slots.findIndex(x=>x.slot===r.novoSlot);
   bloqueio=false;renderizar();
   abrirFormulario();
  }catch(e){
   estado.textContent='Não foi possível criar o banner: '+e.message;
   await carregar();
  }finally{bloqueio=false;rodar();}
 }
 async function removerFotoIndividual(numero,pos){
  if(bloqueio||!operador||!Number.isSafeInteger(numero)||
     ![1,2,3].includes(pos))return;
  const item=slots?.find(x=>x.slot===numero);
  if(!item?.fotos?.[pos-1]?.temImagem)return;
  if(!window.confirm('Excluir só a foto '+pos+' do banner '+numero+
    '? As demais fotos serão preservadas.'))return;
  bloqueio=true;parar();
  lixeirasFotos.forEach(b=>{b.disabled=true;});
  try{
   const sessao=await requisitar('/api/admin/comercial/sessao');
   if(typeof sessao.csrfToken!=='string'||sessao.csrfToken.length<20)
    throw Error('SESSAO_OPERADOR_INVALIDA');
   const base='/api/admin/akitemm/banners/'+numero;
   const resp=await requisitar(base+(pos===1?'/imagem':'/foto/'+pos),{
    method:'DELETE',headers:{
     'X-Loop-Admin-Csrf':sessao.csrfToken,
     'X-Banner-Revisao-Esperada':String(item.revisao)
    }
   });
   if(!Array.isArray(resp.slots))throw Error('BANNER_NAO_CONFIRMADO');
   slots=resp.slots;
   if(dialogo.open)estado.textContent='Foto '+pos+' excluída.';
   renderizar();
  }catch(e){
   const msg='Não foi possível excluir a foto: '+e.message;
   if(dialogo.open)estado.textContent=msg;
   else window.alert(msg);
   await carregar();
  }finally{
   bloqueio=false;lixeirasFotos.forEach(b=>{b.disabled=false;});
   renderizar();if(dialogo.open){mostrarCampos();fotosEditor.pintar();}rodar();
  }
 }
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

 async function salvarComposicao(){
  if(bloqueio||!operador||!current()||current().adicionar)return;
  const atual=current(),n=Number(colunas.value);
  const inputs=[escolher,...fotosExtras.map(x=>x.arquivo)];
  const fotos=inputs.slice(0,n);
  const layoutMudou=atual.colunas!==n||atual.modo!==modo.value;
  if(!layoutMudou&&!fotosEditor.novas(n)){
   estado.textContent='Escolha uma foto ou mude o formato do banner.';return;
  }
  bloqueio=true;parar();
  controles.querySelectorAll('button').forEach(b=>{b.disabled=true;});
  try{
   const sessao=await requisitar('/api/admin/comercial/sessao');
   if(typeof sessao.csrfToken!=='string'||sessao.csrfToken.length<20)
    throw Error('SESSAO_OPERADOR_INVALIDA');
   const auth={'X-Loop-Admin-Csrf':sessao.csrfToken};
   const base='/api/admin/akitemm/banners/'+atual.slot;
   let escolhido=atual;
   async function executar(url,method,body,mime){
    const r=await requisitar(url,{method,headers:{
     ...auth,'X-Banner-Revisao-Esperada':String(escolhido.revisao),
     ...(mime?{'Content-Type':mime}:{})},
     ...(body===undefined?{}:{body})
    });
    slots=r.slots;
    escolhido=slots.find(x=>x.slot===atual.slot);
    if(!escolhido)throw Error('BANNER_NAO_CONFIRMADO');
   }
   if(layoutMudou){
    estado.textContent='Salvando formato dos quadros...';
    await executar(base+'/layout','POST',JSON.stringify({
     colunas:n,modo:modo.value,revisaoEsperada:escolhido.revisao
    }),'application/json');
   }
   for(let i=0;i<n;i++){
    const foto=fotosEditor.arquivo(i+1);
    if(!foto)continue;
    estado.textContent='Preparando foto '+(i+1)+' de '+n+'...';
    const pronta=await prepararFotoBanner(foto);
    estado.textContent='Salvando foto '+(i+1)+' de '+n+'...';
    await executar(i===0?base+'/imagem':base+'/foto/'+(i+1),
     'PUT',pronta,'image/jpeg');
   }
   estado.textContent=escolhido.publicado?
    'Banner salvo e publicado. Os quadros vazios podem ser preenchidos depois.':
    'Formato salvo. Envie ao menos uma foto para exibir o banner.';
   fotosEditor.limpar();
   indice=slots.findIndex(x=>x.slot===atual.slot);
   renderizar();
  }catch(e){
   estado.textContent='Não foi possível salvar: '+e.message;
   await carregar();
  }finally{bloqueio=false;renderizar();rodar();}
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
    headers['X-Banner-Enquadramento']='INTEIRA';
   }else if(acao==='remover')method='DELETE';
   else{
    method='POST';headers['Content-Type']='application/json';
    if(acao==='trocar'){
     const destino=slot.slot+direcao,outra=slots.find(x=>x.slot===destino);
     if(!outra)throw Error('BANNER_ORDEM_INVALIDA');
     url=base+'/trocar';
     body=JSON.stringify({origem:slot.slot,destino,
      revisaoOrigem:slot.revisao,revisaoDestino:outra.revisao});
    }else throw Error('BANNER_ACAO_INVALIDA');
   }
   const resultado=await requisitar(url,{method,headers,body});
   if(!Array.isArray(resultado.slots)||resultado.slots.length<4)
    throw Error('BANNER_GRAVACAO_NAO_CONFIRMADA');
   slots=resultado.slots;
   if(acao==='trocar')indice=slots.findIndex(x=>x.slot===slot.slot+direcao);
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
  if(!f){previa.hidden=true;return;}
  if(!['image/jpeg','image/png','image/webp'].includes(f.type)||
     f.size<40||f.size>16*1024*1024){
   estado.textContent='Escolha JPG, PNG ou WebP com até 16 MB.';
   escolher.value='';previa.hidden=true;return;
  }
  estado.textContent='Imagem pronta para salvar.';
  const atual=++leitorFoto,leitor=new FileReader();
  leitor.onload=()=>{
   if(atual!==leitorFoto)return;
   previa.src=String(leitor.result);previa.hidden=false;
  };
  leitor.onerror=()=>{estado.textContent='Não foi possível abrir a imagem.';};
  leitor.readAsDataURL(f);
 });
 controles.addEventListener('click',e=>{
  const botao=e.target.closest('button[data-acao]');
  if(!botao||!operador||bloqueio)return;
  const acao=botao.dataset.acao;
  if(acao==='foto'){
   void salvarComposicao();return;
  }
  if(acao==='remover'&&!window.confirm(
   'Excluir somente a foto 1? As outras fotos continuam no banner.'))return;
  if(acao==='anterior'||acao==='proximo')
   void salvar('trocar',null,acao==='anterior'?-1:1);
  else if(acao==='remover')void removerFotoIndividual(current()?.slot,1);
  else void salvar(acao);
 });
 area.addEventListener('click',e=>{
  if(!operador||bloqueio||Date.now()<bloquearCliqueAte||
     e.target.closest('button,input,a'))return;
  const cel=e.target.closest('.banner-mosaico-celula');
  abrirFormulario(Number(cel?.dataset.fotoPosicao)||(e.target===foto?1:0));
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
 function fotosNoProprioQuadro(op){
 const {dialogo,antes,inputs,colunas,status,slot,urlFoto,apagar,razao}=op;
 const pendentes=new Map(),miniaturas=new Map();
 const grade=document.createElement('div');grade.className='banner-editor-grade';
 antes.before(grade);
 const tiles=inputs.map((input,index)=>{
  const pos=index+1;
  input.parentElement.classList.add('banner-editor-arquivo-oculto');
  const cel=document.createElement('div');cel.className='banner-editor-celula';
  cel.tabIndex=0;cel.setAttribute('role','button');
  cel.setAttribute('aria-label','Adicionar ou ajustar foto '+pos);
  const img=document.createElement('img');img.alt='Foto '+pos;img.hidden=true;
  const sinal=document.createElement('span');sinal.className='banner-editor-sinal';
  const nome=document.createElement('span');nome.className='banner-editor-nome';
  nome.textContent='Foto '+pos;
  const lixo=document.createElement('button');lixo.type='button';
  lixo.className='banner-editor-lixeira';lixo.textContent='🗑';
  lixo.setAttribute('aria-label','Excluir somente foto '+pos);
  lixo.addEventListener('click',async e=>{
   e.stopPropagation();e.preventDefault();
   const salva=slot()?.fotos?.[index]?.temImagem===true;
   pendentes.delete(pos);miniaturas.delete(pos);input.value='';
   if(salva)await apagar(pos);
   pintar();
  });
  cel.append(img,sinal,nome,lixo);
  const acionar=()=>pendentes.has(pos)||slot()?.fotos?.[index]?.temImagem?
   void abrirRecorte(pos):input.click();
  cel.addEventListener('click',e=>{if(!e.target.closest('button'))acionar();});
  cel.addEventListener('keydown',e=>{
   if(e.target!==cel||!['Enter',' '].includes(e.key))return;
   e.preventDefault();acionar();
  });
  input.addEventListener('change',()=>{
   const f=input.files?.[0];if(!f)return;
   if(!['image/jpeg','image/png','image/webp'].includes(f.type)||
      f.size<40||f.size>16*1024*1024){
    status.textContent='Escolha JPG, PNG ou WebP de até 16 MB.';
    input.value='';return;
   }
   pendentes.set(pos,f);
   const reader=new FileReader();
   reader.onload=()=>{
    if(pendentes.get(pos)!==f)return;
    miniaturas.set(pos,String(reader.result||''));pintar();
   };
   reader.onerror=()=>{status.textContent='Não foi possível ler a foto.';};
   reader.readAsDataURL(f);
  });
  grade.append(cel);
  return {cel,img,sinal,lixo,pos};
 });
 const painel=document.createElement('div');
 painel.className='banner-editor-painel';painel.hidden=true;
 painel.innerHTML='<section class="banner-editor-ajuste">'+
  '<header><strong>Ajustar foto</strong><button type="button" data-acao="cancelar" aria-label="Fechar">×</button></header>'+
  '<canvas aria-label="Arraste para enquadrar a foto"></canvas>'+
  '<label>Ampliar <input type="range" min="100" max="300" value="100" step="1"></label>'+
  '<footer><button type="button" data-acao="trocar">Trocar</button>'+
  '<button type="button" data-acao="cancelar">Cancelar</button>'+
  '<button type="button" data-acao="aplicar">Aplicar</button></footer></section>';
 dialogo.append(painel);
 const canvas=painel.querySelector('canvas'),zoom=painel.querySelector('input');
 let crop=null,seq=0;
 const dataURL=blob=>new Promise((ok,fail)=>{
  const r=new FileReader();r.onload=()=>ok(String(r.result||''));
  r.onerror=()=>fail(Error('Foto indisponível'));
  r.readAsDataURL(blob);
 });
 function desenhar(){
  if(!crop)return;
  const img=crop.imagem,w=canvas.width,h=canvas.height;
  const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)return;
  const escala=Math.max(w/img.naturalWidth,h/img.naturalHeight)*crop.zoom;
  const dw=escala*img.naturalWidth,dh=escala*img.naturalHeight;
  const maxX=Math.max(0,(dw-w)/2),maxY=Math.max(0,(dh-h)/2);
  crop.x=Math.max(-maxX,Math.min(maxX,crop.x));
  crop.y=Math.max(-maxY,Math.min(maxY,crop.y));
  ctx.fillStyle='#10141d';ctx.fillRect(0,0,w,h);
  ctx.drawImage(img,(w-dw)/2+crop.x,(h-dh)/2+crop.y,dw,dh);
 }
 async function abrirRecorte(pos){
  const ticket=++seq;
  try{
   let b=pendentes.get(pos);
   if(!b){
    const r=await fetch(urlFoto(pos),{credentials:'same-origin',cache:'no-store'});
    if(!r.ok)throw Error('Não foi possível abrir a foto.');
    b=await r.blob();
   }
   const im=new Image();im.src=await dataURL(b);await im.decode();
   if(ticket!==seq)return;
   if(!im.naturalWidth||!im.naturalHeight)throw Error('Imagem inválida.');
   canvas.width=1000;canvas.height=Math.round(1000*Number(colunas.value)/razao);
   zoom.value='100';
   crop={pos,imagem:im,zoom:1,x:0,y:0,arrasto:null};
   painel.hidden=false;desenhar();
  }catch(e){status.textContent='Erro ao ajustar: '+e.message;}
 }
 function fechar(){seq++;crop=null;painel.hidden=true;}
 canvas.addEventListener('pointerdown',e=>{
  if(!crop)return;
  e.preventDefault();canvas.setPointerCapture(e.pointerId);
  crop.arrasto={id:e.pointerId,x:e.clientX,y:e.clientY};
 });
 canvas.addEventListener('pointermove',e=>{
  if(!crop?.arrasto||crop.arrasto.id!==e.pointerId)return;
  e.preventDefault();
  const r=canvas.getBoundingClientRect();
  if(!r.width||!r.height)return;
  crop.x+=(e.clientX-crop.arrasto.x)*canvas.width/r.width;
  crop.y+=(e.clientY-crop.arrasto.y)*canvas.height/r.height;
  crop.arrasto={id:e.pointerId,x:e.clientX,y:e.clientY};
  desenhar();
 });
 function soltar(e){if(crop?.arrasto?.id===e.pointerId)crop.arrasto=null;}
 canvas.addEventListener('pointerup',soltar);
 canvas.addEventListener('pointercancel',soltar);
 zoom.addEventListener('input',()=>{
  if(crop){crop.zoom=Number(zoom.value)/100;desenhar();}
 });
 painel.addEventListener('click',async e=>{
  const acao=e.target.closest('[data-acao]')?.dataset.acao;
  if(!acao||!crop)return;
  if(acao==='cancelar'){fechar();return;}
  if(acao==='trocar'){
   const pos=crop.pos;fechar();inputs[pos-1].click();return;
  }
  if(acao==='aplicar'){
   const pos=crop.pos;
   const foto=await new Promise(ok=>canvas.toBlob(ok,'image/jpeg',.87));
   if(!foto){status.textContent='Não foi possível gerar a foto.';return;}
   pendentes.set(pos,foto);
   miniaturas.set(pos,canvas.toDataURL('image/jpeg',.8));
   status.textContent='Foto '+pos+' ajustada. Salve o banner.';
   fechar();pintar();
  }
 });
 dialogo.addEventListener('close',fechar);
 function pintar(){
  grade.style.setProperty('--colunas',String(colunas.value));
  tiles.forEach(({cel,img,sinal,lixo,pos})=>{
   cel.hidden=pos>Number(colunas.value);
   const salva=slot()?.fotos?.[pos-1]?.temImagem===true;
   const src=miniaturas.get(pos)||(salva?urlFoto(pos):'');
   img.hidden=!src;
   if(src&&img.getAttribute('src')!==src)img.src=src;
   if(!src)img.removeAttribute('src');
   sinal.textContent=src?'✎':'＋';
   lixo.hidden=!salva&&!pendentes.has(pos);
  });
 }
 return {
  pintar,
  abrir:pos=>{
   if(pendentes.has(pos)||slot()?.fotos?.[pos-1]?.temImagem)
    void abrirRecorte(pos);
   else inputs[pos-1]?.click();
  },
  novas:n=>[...pendentes.keys()].some(x=>x<=n),
  arquivo:pos=>pendentes.get(pos)||null,
  limpar:()=>{pendentes.clear();miniaturas.clear();inputs.forEach(x=>x.value='');pintar();}
 };
}
 void atualizarAcesso();
})();
