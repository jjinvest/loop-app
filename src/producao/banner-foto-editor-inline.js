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
