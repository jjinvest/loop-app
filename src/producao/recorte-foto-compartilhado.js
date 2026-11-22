'use strict';
// Recorte opcional compartilhado: LOOP, AKITEMM, banners, produtos e perfis.
// O envio original permanece inalterado se "Recortar foto" nao for utilizado.
(()=>{
 const TIPO=/^image\/(?:jpeg|png|webp)$/;
 const vistos=new WeakSet();
 let entrada=null,imagem=null,arquivoOriginal=null,largura=0,altura=0;
 let arrasto=null,abrindo=false;
 const el=(tag,classe,texto)=>{
  const n=document.createElement(tag);
  if(classe)n.className=classe;
  if(texto)n.textContent=texto;
  return n;
 };
 const dialogo=el('dialog','loop-recorte-dialogo');
 dialogo.id='loopRecorteFotoOpcional';
 dialogo.setAttribute('aria-label','Recortar foto antes de salvar');
 const box=el('div','loop-recorte-caixa');
 const titulo=el('h3',null,'Recortar foto');
 const explicacao=el('p',null,'Ajuste o enquadramento. A foto original não será alterada.');
 const canvas=el('canvas','loop-recorte-canvas');
 canvas.width=640;canvas.height=640;
 const controles=el('div','loop-recorte-controles');
 function seletor(rotulo,opcoes){
  const label=el('label',null,rotulo),select=el('select');
  for(const [valor,texto] of opcoes){
   const opt=el('option',null,texto);
   opt.value=valor;select.append(opt);
  }
  label.append(select);controles.append(label);return select;
 }
 const formato=seletor('Formato do recorte',[
  ['livre','Proporção original'],['1','Quadrado'],
  ['16/9','Banner horizontal'],['4/5','Vertical'],['3/2','Horizontal 3:2']
 ]);
 function controle(nome,min,max,valor,step){
  const label=el('label',null,nome);
  const x=el('input');x.type='range';
  x.min=String(min);x.max=String(max);x.step=String(step);
  x.value=String(valor);label.append(x);controles.append(label);
  x.setAttribute('aria-label',nome);return x;
 }
 const zoom=controle('Aproximar / afastar',1,3,1,0.05);
 const horizontal=controle('Mover para os lados',0,100,50,1);
 const vertical=controle('Mover para cima / baixo',0,100,50,1);
 const estado=el('p','loop-recorte-status');
 estado.setAttribute('role','status');
 const acoes=el('div','loop-recorte-acoes');
 const cancelar=el('button',null,'Cancelar');
 cancelar.type='button';
 const aplicar=el('button','loop-recorte-aplicar','Usar esta foto');
 aplicar.type='button';acoes.append(cancelar,aplicar);
 box.append(titulo,explicacao,canvas,controles,estado,acoes);
 dialogo.append(box);
 const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
 function areaFonte(){
  const proporcao=formato.value==='livre'?largura/altura:
   formato.value.includes('/')?
    Number(formato.value.split('/')[0])/Number(formato.value.split('/')[1]):
    Number(formato.value);
  let fonteL=Math.min(largura,altura*proporcao)/Number(zoom.value);
  let fonteA=fonteL/proporcao;
  fonteL=clamp(fonteL,1,largura);fonteA=clamp(fonteA,1,altura);
  return {x:(largura-fonteL)*Number(horizontal.value)/100,
   y:(altura-fonteA)*Number(vertical.value)/100,
   fonteL,fonteA,proporcao};
 }
 function desenhar(){
  if(!imagem)return;
  const s=areaFonte();
  const pixels=formato.value==='livre'?
   Math.min(1600,Math.max(largura,altura)):1600;
  canvas.width=Math.max(1,Math.round(Math.min(1600,pixels)));
  canvas.height=Math.max(1,Math.round(canvas.width/s.proporcao));
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw Error('EDITOR_DE_IMAGEM_INDISPONIVEL');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(imagem,s.x,s.y,s.fonteL,s.fonteA,
   0,0,canvas.width,canvas.height);
 }
 async function mostrar(input,file){
  if(abrindo||dialogo.open)return;
  abrindo=true;
  try{
   if(!file||!TIPO.test(file.type)||file.size<40||
      file.size>16*1024*1024)throw Error('Selecione JPG, PNG ou WebP de até 16 MB.');
   const data=await new Promise((resolve,reject)=>{
    const leitor=new FileReader();
    leitor.onload=()=>resolve(String(leitor.result||''));
    leitor.onerror=()=>reject(Error('A imagem não pôde ser lida.'));
    leitor.readAsDataURL(file);
   });
   const img=new Image();
   img.src=data;
   await img.decode();
   if(!img.naturalWidth||!img.naturalHeight||
      img.naturalWidth>12000||img.naturalHeight>12000||
      img.naturalWidth*img.naturalHeight>40000000)
    throw Error('Imagem com resolução não permitida.');
   entrada=input;arquivoOriginal=file;
   imagem=img;largura=img.naturalWidth;altura=img.naturalHeight;
   const id=input.id||'',nome=input.closest?.('label')?.textContent||'';
   formato.value=/banner/i.test(id+' '+nome)?'16/9':
    /produto|foto|perfil/i.test(id+' '+nome)?'1':'livre';
   zoom.value='1';horizontal.value='50';vertical.value='50';
   estado.textContent='Arraste a foto ou use os controles para enquadrar.';
   desenhar();dialogo.showModal();
  }catch(e){
   entrada=null;imagem=null;
   // Mensagem clara; nao tocar no arquivo original nem disparar upload.
   window.alert(e?.message||'Não foi possível abrir a foto.');
  }finally{abrindo=false;}
 }
 function limpar(){
  entrada=null;imagem=null;arquivoOriginal=null;arrasto=null;
 }
 cancelar.addEventListener('click',()=>dialogo.close());
 dialogo.addEventListener('close',limpar);
 for(const c of [formato,zoom,horizontal,vertical])
  c.addEventListener('input',desenhar);
 canvas.addEventListener('pointerdown',e=>{
  if(!imagem)return;
  arrasto={x:e.clientX,y:e.clientY,
   horizontal:Number(horizontal.value),vertical:Number(vertical.value)};
  canvas.setPointerCapture?.(e.pointerId);
 });
 canvas.addEventListener('pointermove',e=>{
  if(!arrasto||!imagem)return;
  const r=canvas.getBoundingClientRect();
  horizontal.value=String(clamp(arrasto.horizontal-
   (e.clientX-arrasto.x)*100/Math.max(1,r.width),0,100));
  vertical.value=String(clamp(arrasto.vertical-
   (e.clientY-arrasto.y)*100/Math.max(1,r.height),0,100));
  desenhar();
 });
 for(const ev of ['pointerup','pointercancel'])
  canvas.addEventListener(ev,()=>{arrasto=null;});
 aplicar.addEventListener('click',async()=>{
  if(!imagem||!entrada||!arquivoOriginal)return;
  aplicar.disabled=true;estado.textContent='Preparando recorte...';
  try{
   let blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.9));
   if(blob?.size>4*1024*1024)
    blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.76));
   if(!blob||blob.size<40||blob.size>4*1024*1024)
    throw Error('Imagem grande demais. Reduza o enquadramento.');
   const nome=arquivoOriginal.name.replace(/\.[^.]+$/,'')+'-recorte.jpg';
   const novo=new File([blob],nome,{type:'image/jpeg',lastModified:Date.now()});
   const transferencia=new DataTransfer();
   transferencia.items.add(novo);
   entrada.files=transferencia.files;
   entrada.dispatchEvent(new Event('change',{bubbles:true}));
   dialogo.close();
  }catch(e){estado.textContent=e?.message||'Não foi possível aplicar o recorte.';}
  finally{aplicar.disabled=false;}
 });
 function vincular(input){
  if(vistos.has(input)||input.type!=='file'||!input.accept.includes('image/'))
   return;
  vistos.add(input);
  const botao=el('button','loop-recorte-botao','Recortar foto (opcional)');
  botao.type='button';
  botao.setAttribute('aria-label','Escolher ou recortar uma foto antes de salvar');
  const alvo=input.id==='arquivoFotoPerfil'?
   document.getElementById('loop03AlterarFotoTopo'):null;
  if(alvo)alvo.insertAdjacentElement('afterend',botao);
  else{
   const pai=input.closest('label');
   (pai||input).insertAdjacentElement('afterend',botao);
  }
  botao.addEventListener('click',()=>{
   if(input.files?.[0]){void mostrar(input,input.files[0]);return;}
   // Seleção específica para recorte, sem disparar o upload automático.
   const temporario=el('input');temporario.type='file';
   temporario.accept=input.accept;
   temporario.addEventListener('change',()=>{
    if(temporario.files?.[0])void mostrar(input,temporario.files[0]);
   },{once:true});
   temporario.click();
  });
 }
 function descobrir(){
  for(const input of document.querySelectorAll('input[type=file][accept*="image/"]'))
   vincular(input);
 }
 document.body.append(dialogo);
 descobrir();
 const obs=new MutationObserver(descobrir);
 obs.observe(document.body,{childList:true,subtree:true});
})();
