'use strict';
// Acoes acionadas pelo toque nas molduras JA APROVADAS da loja.
// Este script nao muda layout, CSS, cores ou cadastro de clientes.
// Mesmo cookie de operador da central real; CSRF em cada escrita.
(()=>{
 // IDs legados do catálogo central conservam letras maiúsculas e _.
 const ID=/^[A-Za-z0-9_-]{1,80}$/;
 const ID_NOVO=/^[a-z0-9-]{3,80}$/;
 let operador=false,dialogo=null,aberto=false;
 const fetchJson=async(rota,opcoes={})=>{
  const res=await fetch(rota,{
   credentials:'same-origin',cache:'no-store',...opcoes
  });
  const dados=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(dados.erro||'SERVICO_INDISPONIVEL');
  return dados;
 };
 async function verificarOperador(){
  try{
   const r=await fetchJson('/api/operador/estado');
   operador=r.operador===true;
  }catch{operador=false;}
  sincronizarEditorOfertas();
 }
 function sincronizarEditorOfertas(){
  const id='akitemmGerenciarOfertasReal';
  const atual=document.getElementById(id);
  if(!operador){atual?.remove();return;}
  if(atual)return;
  const filtro=document.getElementById('akitemmFiltroOfertas');
  if(!filtro)return;
  const botao=document.createElement('button');
  botao.type='button';botao.id=id;botao.className='akitemm-chip';
  botao.textContent='Gerenciar ofertas';
  botao.setAttribute('aria-label','Cadastrar ofertas na AKITEMM como operador');
  botao.addEventListener('click',()=>void abrirEditorOfertas());
  filtro.insertAdjacentElement('afterend',botao);
 }
 function modal(titulo){
  if(!dialogo){
   dialogo=document.createElement('dialog');
   dialogo.className='akitemm-modal akitemm-operador-editor';
   dialogo.id='akitemmOperadorFotosReal';
   document.body.append(dialogo);
  }
  dialogo.replaceChildren();
  const fechar=document.createElement('button');
  fechar.type='button';fechar.className='akitemm-modal-fechar';
  fechar.textContent='×';fechar.setAttribute('aria-label','Fechar');
  fechar.addEventListener('click',()=>dialogo.close());
  const h=document.createElement('h2');h.textContent=titulo;
  const corpo=document.createElement('div');corpo.className='akitemm-editor-corpo';
  const estado=document.createElement('p');
  estado.setAttribute('role','status');estado.className='akitemm-editor-status';
  dialogo.append(fechar,h,corpo,estado);
  dialogo.showModal();return {corpo,estado};
 }
 const linha=texto=>{
  const p=document.createElement('p');p.textContent=texto;return p;
 };
 const admin=()=>{
  const a=document.createElement('a');a.href='/administrador';
  a.textContent='Abrir cadastro de produtos na central do operador';
  return a;
 };
 const select=(nome,opcoes)=>{
  const label=document.createElement('label');
  label.textContent=nome;
  const s=document.createElement('select');
  for(const [valor,texto] of opcoes){
   const op=document.createElement('option');op.value=valor;
   op.textContent=texto;s.append(op);
  }
  label.append(s);return {label,s};
 };
 // Usa a API comercial REAL da central, com o mesmo cookie de OPERADOR e CSRF.
 // Ofertas criadas aqui ficam em RASCUNHO e nao liberam venda, PIX ou posicao.
 async function abrirEditorOfertas(){
  if(!operador)return;
  const {corpo,estado}=modal('Ofertas · AKITEMM');
  corpo.append(linha('Cadastre uma oferta comercial para um produto existente. '+
   'Ela ficará em rascunho até a aprovação do distribuidor. '+
   'Nenhuma compra ou pagamento será liberado.'));
  const link=document.createElement('a');
  link.href='/administrador#formNovaOferta';
  link.textContent='Abrir cadastro de ofertas na central do operador';
  corpo.append(link);
  try{
   const [sessao,lista]=await Promise.all([
    fetchJson('/api/admin/comercial/sessao'),
    fetchJson('/api/admin/comercial/produtos-cadastrados')
   ]);
   if(typeof sessao.csrfToken!=='string'||sessao.csrfToken.length<24||
      !Array.isArray(lista.produtos))
    throw Error('CADASTRO_COMERCIAL_INDISPONIVEL');
   const produtos=lista.produtos.filter(p=>ID.test(p.produtoId));
   if(!produtos.length){
    estado.textContent='Nenhum produto cadastrado. Crie primeiro um produto '+
     'tocando em um quadrinho vazio como operador ou usando a central.';
    return;
   }
   const form=document.createElement('form');
   form.autocomplete='off';
   const produto=select('Produto cadastrado',produtos.map(p=>[
    p.produtoId,p.titulo+' ('+p.produtoId+')'
   ]));
   form.append(produto.label);
   const campo=(titulo,{maxLength=80,placeholder='',tipo='text'}={})=>{
    const label=document.createElement('label');
    label.textContent=titulo;
    const input=document.createElement('input');
    input.type=tipo;input.required=true;input.maxLength=maxLength;
    if(placeholder)input.placeholder=placeholder;
    label.append(input);form.append(label);
    return input;
   };
   const distribuidor=campo('Código do distribuidor');
   const sku=campo('SKU do distribuidor');
   const preco=campo('Preço de venda (R$)',{
    maxLength:14,placeholder:'0,00'
   });
   preco.inputMode='decimal';
   const prioridade=campo('Prioridade (1 = maior)',{tipo:'number'});
   prioridade.min='1';prioridade.max='9999';prioridade.value='100';
   const salvar=document.createElement('button');
   salvar.type='submit';salvar.textContent='Salvar oferta como rascunho';
   form.append(salvar);corpo.append(form);
   form.addEventListener('submit',async ev=>{
    ev.preventDefault();
    const textoPreco=preco.value.trim();
    if(!ID.test(distribuidor.value.trim())||!ID.test(sku.value.trim())||
       !/^(?:0|[1-9][0-9]{0,7})(?:[,.][0-9]{1,2})?$/.test(textoPreco)){
     estado.textContent='Confira distribuidor, SKU e preço em reais.';return;
    }
    const centavos=Math.round(Number(textoPreco.replace(',','.'))*100);
    const ordem=Number(prioridade.value);
    if(!Number.isSafeInteger(centavos)||centavos<=0||
       !Number.isSafeInteger(ordem)||ordem<1||ordem>9999){
     estado.textContent='Preço ou prioridade inválidos.';return;
    }
    salvar.disabled=true;estado.textContent='Gravando oferta no catálogo real...';
    try{
     const dados=await fetchJson('/api/admin/comercial/ofertas-cadastrar',{
      method:'POST',headers:{'Content-Type':'application/json',
       'X-Loop-Admin-Csrf':sessao.csrfToken},
      body:JSON.stringify({
       produtoId:produto.s.value,distribuidorId:distribuidor.value.trim(),
       sku:sku.value.trim(),precoUnitCentavos:centavos,prioridade:ordem
      })
     });
     if(dados.produtoId!==produto.s.value||dados.ofertaAtiva!==false)
      throw Error('OFERTA_NAO_CONFIRMADA');
     form.reset();prioridade.value='100';
     estado.textContent='Oferta gravada como rascunho na central real. '+
      'A vitrine não anuncia ofertas não aprovadas.';
    }catch(e){
     estado.textContent='Oferta não gravada: '+e.message;
    }finally{salvar.disabled=false;}
   });
  }catch(e){estado.textContent='Cadastro de ofertas indisponível: '+e.message;}
 }

 const campoTexto=(form,titulo,{tipo='text',maxLength=150,placeholder='',valor=''}={})=>{
  const label=document.createElement('label');label.textContent=titulo;
  const entrada=document.createElement(tipo==='textarea'?'textarea':'input');
  if(tipo!=='textarea')entrada.type=tipo;
  entrada.maxLength=maxLength;entrada.placeholder=placeholder;
  entrada.value=valor;label.append(entrada);form.append(label);return entrada;
 };
 const escolhaCor=form=>select('Cor do produto',[
  ['CINZA','Cinza'],['VERDE','Verde'],['DOURADO','Dourado'],
  ['ROXO','Roxo']
 ]);
 const slugManual=()=> 'manual-'+Date.now().toString(36)+'-'+
  Math.random().toString(36).slice(2,8).padEnd(6,'0');
 // Recorte quadrado feito no aparelho. Não modifica cores nem o original salvo.
 function editarFoto(form){
  const caixa=document.createElement('section');
  const label=document.createElement('label');
  label.className='akitemm-escolher-foto';
  label.textContent='Escolher foto do celular';
  const input=document.createElement('input');
  input.type='file';input.accept='image/jpeg,image/png,image/webp';
  label.append(input);caixa.append(label);
  const aviso=linha('JPEG, PNG ou WebP. Você pode ajustar o enquadramento antes de salvar.');
  caixa.append(aviso);
  const previa=document.createElement('canvas');
  previa.width=640;previa.height=640;
  previa.className='akitemm-foto-previa';previa.hidden=true;
  caixa.append(previa);
  const ajustes=document.createElement('div');
  ajustes.className='akitemm-foto-ajustes';ajustes.hidden=true;
  const controles=[];
  for(const [titulo,valor,min,max] of [
   ['Aproximar / afastar','1','1','3'],
   ['Mover para os lados','50','0','100'],
   ['Mover para cima / baixo','50','0','100']
  ]){
   const l=document.createElement('label');l.textContent=titulo;
   const x=document.createElement('input');x.type='range';
   x.min=min;x.max=max;x.step=titulo.startsWith('Aproximar')?'0.05':'1';
   x.value=valor;l.append(x);ajustes.append(l);controles.push(x);
  }
  caixa.append(ajustes);form.append(caixa);
  let imagem=null,carregando=null;
  const redesenhar=()=>{
   if(!imagem)return;
   const zoom=Number(controles[0].value);
   const lado=Math.min(imagem.naturalWidth,imagem.naturalHeight)/zoom;
   const x=(imagem.naturalWidth-lado)*Number(controles[1].value)/100;
   const y=(imagem.naturalHeight-lado)*Number(controles[2].value)/100;
   const contexto=previa.getContext('2d');
   if(!contexto)throw Error('EDICAO_FOTO_INDISPONIVEL');
   contexto.fillStyle='#ffffff';contexto.fillRect(0,0,640,640);
   contexto.drawImage(imagem,x,y,lado,lado,0,0,640,640);
  };
  for(const x of controles)x.addEventListener('input',redesenhar);
  input.addEventListener('change',()=>{
   imagem=null;previa.hidden=true;ajustes.hidden=true;
   const foto=input.files?.[0];
   if(!foto)return;
   if(!['image/jpeg','image/png','image/webp'].includes(foto.type)||
      foto.size<40||foto.size>15*1024*1024){
    aviso.textContent='Selecione uma foto JPEG, PNG ou WebP de até 15 MB.';
    input.value='';return;
   }
   const url=URL.createObjectURL(foto);
   carregando=new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
     URL.revokeObjectURL(url);
     if(img.naturalWidth<50||img.naturalHeight<50){
      reject(Error('FOTO_RESOLUCAO_BAIXA'));return;
     }
     imagem=img;previa.hidden=false;ajustes.hidden=false;
     redesenhar();aviso.textContent='Ajuste o enquadramento. A foto será cortada, sem alterar as cores.';
     resolve();
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('FOTO_NAO_ABRIU'));};
    img.src=url;
   });
   carregando.catch(()=>{aviso.textContent='Não foi possível abrir a imagem. Escolha outra foto.';});
  });
  return {
   temFoto:()=>Boolean(input.files?.length),
   obter:async()=>{
    if(carregando)await carregando;
    if(!imagem)return null;
    redesenhar();
    const blob=await new Promise(resolve=>previa.toBlob(resolve,'image/jpeg',0.87));
    if(!blob||blob.size<40||blob.size>3*1024*1024)
     throw Error('FOTO_PROCESSADA_INVALIDA');
    return blob;
   }
  };
 }
 async function salvarFoto(id,csrf,blob,posicao=1){
  const lista=await fetchJson('/api/admin/catalogo-midia/produtos/'+id+'/fotos');
  const versao=lista.fotos?.find(f=>f.posicao===posicao)?.versao||0;
  const resposta=await fetch('/api/admin/catalogo-midia/produtos/'+id+
   '/fotos/'+posicao,{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'image/jpeg','X-Loop-Admin-Csrf':csrf,
     'X-Foto-Versao-Esperada':String(versao)},body:blob
   });
  const retorno=await resposta.json().catch(()=>({}));
  if(!resposta.ok)throw Error(retorno.erro||'FOTO_NAO_GRAVADA');
  return retorno;
 }
 async function salvarCor(id,csrf,cor){
  const regras=await fetchJson('/api/admin/comercial/classificacoes');
  const anterior=regras.produtos?.find(r=>r.produtoId===id);
  if(!anterior)throw Error('CLASSIFICACAO_INDISPONIVEL');
  if(anterior.cor===cor)return anterior;
  return fetchJson('/api/admin/comercial/classificacoes/'+id,{
   method:'POST',headers:{'Content-Type':'application/json',
    'X-Loop-Admin-Csrf':csrf},
   body:JSON.stringify({cor,minimo:anterior.minimo,
    roxasPorUnidade:anterior.roxasPorUnidade,
    revisaoEsperada:anterior.revisao})
  });
 }
 async function publicarFoto(id,csrf){
  return fetchJson('/api/admin/catalogo-midia/produtos/'+id+'/publicacao',{
   method:'POST',headers:{'Content-Type':'application/json',
    'X-Loop-Admin-Csrf':csrf},body:JSON.stringify({ativo:true})
  });
 }
 const atualizarLoja=()=>document.getElementById('atualizarCatalogoLoja')?.click();
 async function vincularQuadradinho(indice,id){
  if(!Number.isSafeInteger(indice)||indice<1||indice>400||!ID.test(id))
   throw Error('QUADRINHO_INVALIDO');
  const [sessao,slots]=await Promise.all([
   fetchJson('/api/admin/comercial/sessao'),
   fetchJson('/api/admin/catalogo-midia/slots')
  ]);
  if(!Array.isArray(slots.slots)||slots.total!==400)
   throw Error('QUADRINHOS_INDISPONIVEIS');
  const ocupados=new Set(slots.slots.map(x=>x.posicao));
  const destino=ocupados.has(indice)?
   Array.from({length:400},(_,i)=>i+1).find(n=>!ocupados.has(n)):indice;
  if(!destino)throw Error('VITRINE_SEM_ESPACO');
  const atual=slots.slots.find(x=>x.posicao===destino);
  const resposta=await fetchJson(
   '/api/admin/catalogo-midia/slots/'+destino,{
    method:'POST',headers:{'Content-Type':'application/json',
     'X-Loop-Admin-Csrf':sessao.csrfToken},
    body:JSON.stringify({produtoId:id,revisaoEsperada:atual?.revisao||0})
   });
  if(resposta.produtoId!==id||resposta.posicao!==destino)
   throw Error('QUADRINHO_NAO_CONFIRMADO');
  return resposta;
 }
 async function escolherProduto(indice){
  if(!Number.isSafeInteger(indice)||indice<1||indice>400)return;
  const {corpo,estado}=modal('Cadastrar produto · AKITEMM');
  corpo.append(linha('Cadastro manual. Foto, nome e cor no mesmo lugar. '+
   'Distribuidor e SKU não são obrigatórios.'));
  const form=document.createElement('form');form.autocomplete='off';
  const nome=campoTexto(form,'Nome do produto',{placeholder:'Ex.: Camiseta preta'});
  nome.required=true;
  const desc=campoTexto(form,'Descrição (opcional)',{tipo:'textarea',
   maxLength:2000,placeholder:'Escreva como deseja apresentar o produto'});
  const cor=escolhaCor();
  form.append(cor.label);
  const foto=editarFoto(form);
  const opcoes=document.createElement('details');
  const resumo=document.createElement('summary');
  resumo.textContent='Código do produto (opcional)';
  opcoes.append(resumo);
  const codigo=campoTexto(opcoes,'Código interno',
   {maxLength:80,placeholder:'Gerado automaticamente se ficar vazio'});
  form.append(opcoes);
  const criar=document.createElement('button');
  criar.type='submit';criar.textContent='Salvar produto e colocar na vitrine';
  form.append(criar);corpo.append(form);
  const vinculo=document.createElement('details');
  const resumoExistente=document.createElement('summary');
  resumoExistente.textContent='Usar um produto que já cadastrei';
  vinculo.append(resumoExistente);corpo.append(vinculo);
  try{
   const [r,slots]=await Promise.all([
    fetchJson('/api/admin/catalogo-midia/produtos'),
    fetchJson('/api/admin/catalogo-midia/slots')
   ]);
   if(!Array.isArray(r.produtos)||r.checkoutReal!==false||
      !Array.isArray(slots.slots)||slots.total!==400)
    throw Error('CATALOGO_ADMIN_INCONSISTENTE');
   const vinculados=new Set(slots.slots.map(x=>x.produtoId));
   const existentes=r.produtos.filter(p=>ID.test(p.produtoId)&&
    !vinculados.has(p.produtoId));
   if(existentes.length){
    const seletor=select('Produto existente',existentes.map(p=>[
     p.produtoId,p.nome+' ('+p.estado.toLowerCase()+')'
    ]));
    const abrir=document.createElement('button');abrir.type='button';
    abrir.className='akitemm-editor-secundario';
    abrir.textContent='Editar produto existente';
    abrir.addEventListener('click',async()=>{
     abrir.disabled=true;
     try{
      await vincularQuadradinho(indice,seletor.s.value);
      dialogo.close();void abrirProduto(seletor.s.value);
     }catch(e){estado.textContent='Não foi possível abrir: '+e.message;}
     finally{abrir.disabled=false;}
    });
    vinculo.append(seletor.label,abrir);
   }else{
    const vazio=linha('Nenhum produto avulso aguardando edição.');
    vinculo.append(vazio);
   }
  }catch(e){estado.textContent='Produtos existentes indisponíveis: '+e.message;}
  form.addEventListener('submit',async ev=>{
   ev.preventDefault();
   if(aberto)return;
   const titulo=nome.value.trim();
   const informado=codigo.value.trim(),id=informado||slugManual();
   if(!ID_NOVO.test(id)||titulo.length<2||titulo.length>150){
    estado.textContent='Informe um nome válido. Confira também o código opcional.';
    return;
   }
   aberto=true;criar.disabled=true;estado.textContent='Salvando no catálogo real...';
   let criado=false;
   try{
    const imagem=await foto.obter();
    const sessao=await fetchJson('/api/admin/comercial/sessao');
    const csrf=sessao.csrfToken;
    if(typeof csrf!=='string')throw Error('OPERADOR_SESSAO_INVALIDA');
    const produto=await fetchJson('/api/admin/comercial/produtos-cadastrar',{
     method:'POST',headers:{'Content-Type':'application/json',
      'X-Loop-Admin-Csrf':csrf},
     body:JSON.stringify({produtoId:id,titulo,descricao:desc.value.trim()})
    });
    if(produto.produtoId!==id||produto.ativo!==false)
     throw Error('CADASTRO_NAO_CONFIRMADO');
    criado=true;
    await vincularQuadradinho(indice,id);
    await salvarCor(id,csrf,cor.s.value);
    if(imagem){
     await salvarFoto(id,csrf,imagem,1);
     await publicarFoto(id,csrf);
     atualizarLoja();
     estado.textContent='Produto e foto salvos. O item agora aparece nos primeiros espaços da vitrine.';
     criar.textContent='Produto salvo';
    }else{
     estado.textContent='Produto salvo sem foto, como rascunho. Selecione uma imagem para publicar.';
     criar.textContent='Produto salvo';
    }
    criar.disabled=true;
    const editar=document.createElement('button');
    editar.type='button';editar.className='akitemm-editor-secundario';
    editar.textContent='Continuar editando este produto';
    editar.addEventListener('click',()=>{dialogo.close();void abrirProduto(id);});
    corpo.append(editar);
   }catch(e){
    estado.textContent=(criado?'Produto criado, mas edição incompleta: ':
     'Não foi possível salvar: ')+e.message+
     (criado?' Abra o produto existente para continuar.':'');
    if(!criado)criar.disabled=false;
   }finally{aberto=false;}
  });
 }
 async function abrirProduto(id){
  if(!ID.test(id)){
   const {corpo,estado}=modal('Produto da AKITEMM');
   corpo.append(admin());
   estado.textContent='Este código de produto precisa de normalização '+
    'auditada para aceitar fotos, sem alterar o cadastro antigo.';
   return;
  }
  const {corpo,estado}=modal('Editar produto · '+id);
  const nomeLabel=document.createElement('label');
  nomeLabel.textContent='Nome do produto';
  const nome=document.createElement('input');nome.type='text';
  nome.maxLength=150;nomeLabel.append(nome);
  const descLabel=document.createElement('label');
  descLabel.textContent='Descrição';
  const descricao=document.createElement('textarea');
  descricao.maxLength=2000;descLabel.append(descricao);
  const salvarDados=document.createElement('button');
  salvarDados.type='button';salvarDados.textContent='Salvar nome e descrição';
  salvarDados.disabled=true;
  corpo.append(nomeLabel,descLabel,salvarDados);
  const campo=select('Posição da foto (1 a 10)',Array.from({length:10},(_,i)=>[
   String(i+1),'Foto '+(i+1)
  ]));
  const label=document.createElement('label');
  label.textContent='Escolher imagem JPEG, PNG ou WebP (até 3 MB)';
  const arquivo=document.createElement('input');arquivo.type='file';
  arquivo.accept='image/jpeg,image/png,image/webp';
  label.append(arquivo);
  const lista=document.createElement('p');
  const botao=document.createElement('button');
  botao.type='button';botao.textContent='Salvar foto do produto';
  botao.disabled=true;
  corpo.append(campo.label,label,lista,botao);
  try{
   const [sessao,galeria,dados]=await Promise.all([
    fetchJson('/api/admin/comercial/sessao'),
    fetchJson('/api/admin/catalogo-midia/produtos/'+id+'/fotos'),
    fetchJson('/api/admin/catalogo-midia/produtos/'+id)
   ]);
   if(typeof sessao.csrfToken!=='string'||sessao.csrfToken.length<24||
      !Array.isArray(galeria.fotos)||
      !Number.isSafeInteger(dados.revisao)||dados.revisao<1)
    throw Error('OPERADOR_SESSAO_INVALIDA');
   nome.value=dados.nome;descricao.value=dados.descricao;
   let revisaoAtual=dados.revisao;
   salvarDados.disabled=false;
   salvarDados.addEventListener('click',async()=>{
    if(aberto)return;
    const titulo=nome.value.trim();
    if(titulo.length<2||titulo.length>150||descricao.value.length>2000){
     estado.textContent='Confira o nome e a descrição.';return;
    }
    aberto=true;salvarDados.disabled=true;
    try{
     const res=await fetchJson(
      '/api/admin/catalogo-midia/produtos/'+id,{
       method:'PATCH',headers:{'Content-Type':'application/json',
        'X-Loop-Admin-Csrf':sessao.csrfToken},
       body:JSON.stringify({titulo,descricao:descricao.value.trim(),
        revisaoEsperada:revisaoAtual})
      });
     if(res.produtoId!==id||!Number.isSafeInteger(res.revisao))
      throw Error('PRODUTO_NAO_CONFIRMADO');
     revisaoAtual=res.revisao;
     estado.textContent='Nome e descrição salvos no catálogo real.';
     document.getElementById('atualizarCatalogoLoja')?.click();
    }catch(e){estado.textContent='Não foi possível salvar: '+e.message;}
    finally{aberto=false;salvarDados.disabled=false;}
   });
   lista.textContent=galeria.fotos.length+' foto(s) gravada(s). '+
    'Escolha a posição para acrescentar ou substituir com revisão segura.';
   botao.disabled=false;
   botao.addEventListener('click',async()=>{
    if(aberto)return;
    const file=arquivo.files?.[0],pos=Number(campo.s.value);
    if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||
       file.size<40||file.size>3*1024*1024||
       !Number.isSafeInteger(pos)||pos<1||pos>10){
     estado.textContent='Selecione JPEG, PNG ou WebP com até 3 MB.';
     return;
    }
    aberto=true;botao.disabled=true;estado.textContent='Gravando foto no catálogo real...';
    try{
     const versao=galeria.fotos.find(f=>f.posicao===pos)?.versao||0;
     const res=await fetch(
      '/api/admin/catalogo-midia/produtos/'+id+'/fotos/'+pos,{
       method:'POST',credentials:'same-origin',cache:'no-store',
       headers:{'Content-Type':file.type,
        'X-Loop-Admin-Csrf':sessao.csrfToken,
        'X-Foto-Versao-Esperada':String(versao)},body:file
      });
     const d=await res.json().catch(()=>({}));
     if(!res.ok)throw Error(d.erro||'FOTO_NAO_GRAVADA');
     estado.textContent='Foto '+pos+' salva. O produto foi preservado.';
     dialogo.close();
     document.getElementById('atualizarCatalogoLoja')?.click();
    }catch(e){
     estado.textContent='Não foi possível salvar: '+e.message+
      '. Atualize a galeria antes de tentar novamente.';
    }finally{aberto=false;botao.disabled=false;}
   });
  }catch(e){
   botao.disabled=true;
   estado.textContent='Edição indisponível: '+e.message;
  }
 }
 // Não captura os controles de filtros nem o botão de detalhes.
 // O cliente normal continua com o comportamento aprovado.
 document.addEventListener('click',ev=>{
  if(!operador||dialogo?.contains(ev.target))return;
  const card=ev.target.closest(
   '#catalogoLojaLoop .produto-loja-loop[data-produto-id],'+
   '#catalogoLojaLoop .akitemm-slot-vazio[data-akitemm-slot]'
  );
  if(!card||ev.target.closest('button,a'))return;
  ev.preventDefault();ev.stopImmediatePropagation();
  if(card.dataset.produtoId)void abrirProduto(card.dataset.produtoId);
  else void escolherProduto(Number(card.dataset.akitemmSlot));
 },true);
 document.addEventListener('keydown',ev=>{
  if(!operador||!['Enter',' '].includes(ev.key))return;
  const card=ev.target.closest(
   '#catalogoLojaLoop .produto-loja-loop[data-produto-id],'+
   '#catalogoLojaLoop .akitemm-slot-vazio[data-akitemm-slot]'
  );
  if(!card||ev.target!==card)return;
  ev.preventDefault();
  if(card.dataset.produtoId)void abrirProduto(card.dataset.produtoId);
  else void escolherProduto(Number(card.dataset.akitemmSlot));
 },true);
 void verificarOperador();
 addEventListener('pageshow',()=>void verificarOperador());
 addEventListener('focus',()=>void verificarOperador());
 addEventListener('loop:operador-entrou',()=>void verificarOperador());
 addEventListener('loop:operador-saiu',()=>{
  operador=false;sincronizarEditorOfertas();
  if(dialogo?.open)dialogo.close();
 });
})();
