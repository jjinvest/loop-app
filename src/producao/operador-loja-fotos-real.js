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
  prepararAlcas();
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
  const destino=Array.from({length:400},(_,i)=>i+1)
   .find(n=>!ocupados.has(n));
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
    (p.estado==='RASCUNHO'||!vinculados.has(p.produtoId)));
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
      if(!vinculados.has(seletor.s.value))
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
    await salvarCor(id,csrf,cor.s.value);
    if(imagem){
     await salvarFoto(id,csrf,imagem,1);
     await vincularQuadradinho(indice,id);
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
   estado.textContent='Este código precisa de uma conferência para edição segura.';
   return;
  }
  const {corpo,estado}=modal('Editar produto · AKITEMM');
  const form=document.createElement('form');
  form.autocomplete='off';
  const nome=campoTexto(form,'Nome do produto');
  const descricao=campoTexto(form,'Descrição (opcional)',{
   tipo:'textarea',maxLength:2000
  });
  const cor=escolhaCor();
  form.append(cor.label);
  const foto=editarFoto(form);
  const galeriaFotos=select('Foto do produto',Array.from({length:10},(_,i)=>[
   String(i+1),i===0?'Foto principal':'Foto '+(i+1)
  ]));
  form.append(galeriaFotos.label);
  const salvarDados=document.createElement('button');
  salvarDados.type='submit';salvarDados.textContent='Salvar nome e descrição';
  form.append(salvarDados);
  const salvarImagem=document.createElement('button');
  salvarImagem.type='button';salvarImagem.textContent='Salvar foto e publicar na vitrine';
  form.append(salvarImagem);
  const salvarClassificacao=document.createElement('button');
  salvarClassificacao.type='button';
  salvarClassificacao.className='akitemm-editor-secundario';
  salvarClassificacao.textContent='Salvar cor do produto';
  form.append(salvarClassificacao);
  const ordemBox=document.createElement('section');
  const ordemLabel=campoTexto(ordemBox,
   'Ordem na vitrine (visível só para o operador)',{
    tipo:'number',valor:'1'
   });
  ordemLabel.min='1';ordemLabel.step='1';
  const mover=document.createElement('button');mover.type='button';
  mover.className='akitemm-editor-secundario';
  mover.textContent='Mover produto para esta posição';
  const detalheOrdem=linha('A vitrine continua sem lacunas. Todas as cores ficam misturadas.');
  ordemBox.append(mover,detalheOrdem);form.append(ordemBox);
  corpo.append(form);
  let revisaoAtual=null,csrf=null,slotsAtuais=[],estaPublicado=false;
  const verificar=()=>{if(!csrf||revisaoAtual===null)
   throw Error('OPERADOR_EDICAO_INDISPONIVEL');};
  const travar=(valor)=>{
   salvarDados.disabled=valor;salvarImagem.disabled=valor;
   salvarClassificacao.disabled=valor;mover.disabled=valor;
  };
  const consultaOrdem=async()=>{
   const o=await fetchJson('/api/admin/catalogo-midia/slots');
   if(!Array.isArray(o.slots)||o.total!==400)
    throw Error('ORDEM_VITRINE_INDISPONIVEL');
   slotsAtuais=o.slots;
   const indice=slotsAtuais.findIndex(x=>x.produtoId===id);
   const posicao=indice+1;
   ordemLabel.max=String(Math.max(1,slotsAtuais.length));
   ordemLabel.value=String(posicao>0?posicao:slotsAtuais.length+1);
   mover.disabled=posicao===0;
   detalheOrdem.textContent=posicao?
    'Posição '+posicao+' de '+slotsAtuais.length+
     '. Alterar a ordem não muda a classificação do produto.':
    'Ainda não está na sequência. Ao publicar, entra no próximo espaço.';
  };
  try{
   travar(true);
   const [sessao,dados,regras]=await Promise.all([
    fetchJson('/api/admin/comercial/sessao'),
    fetchJson('/api/admin/catalogo-midia/produtos/'+id),
    fetchJson('/api/admin/comercial/classificacoes')
   ]);
   if(typeof sessao.csrfToken!=='string'||sessao.csrfToken.length<24||
      !Number.isSafeInteger(dados.revisao)||dados.revisao<1)
    throw Error('OPERADOR_SESSAO_INVALIDA');
   csrf=sessao.csrfToken;revisaoAtual=dados.revisao;
   nome.value=dados.nome;descricao.value=dados.descricao;
   estaPublicado=dados.estado==='PUBLICADO';
   const regra=regras.produtos?.find(r=>r.produtoId===id);
   if(regra)cor.s.value=regra.cor;
   await consultaOrdem();
   travar(false);
   const botoesAtualizar=async(tarefa,mensagem)=>{
    if(aberto)return;
    aberto=true;travar(true);estado.textContent='Salvando alterações...';
    try{
     verificar();
     await tarefa();
     estado.textContent=mensagem;
     atualizarLoja();
    }catch(e){estado.textContent='Não foi possível salvar: '+e.message;}
    finally{aberto=false;travar(false);}
   };
   form.addEventListener('submit',ev=>{
    ev.preventDefault();
    const titulo=nome.value.trim();
    if(titulo.length<2||titulo.length>150||
       descricao.value.length>2000){
     estado.textContent='Confira o nome e a descrição.';return;
    }
    void botoesAtualizar(async()=>{
     const res=await fetchJson('/api/admin/catalogo-midia/produtos/'+id,{
      method:'PATCH',headers:{'Content-Type':'application/json',
       'X-Loop-Admin-Csrf':csrf},
      body:JSON.stringify({titulo,descricao:descricao.value.trim(),
       revisaoEsperada:revisaoAtual})
     });
     if(res.produtoId!==id||!Number.isSafeInteger(res.revisao))
      throw Error('PRODUTO_NAO_CONFIRMADO');
     revisaoAtual=res.revisao;
    },'Nome e descrição salvos.');
   });
   salvarClassificacao.addEventListener('click',()=>{
    void botoesAtualizar(async()=>{await salvarCor(id,csrf,cor.s.value);},
     'Cor atualizada; filtros da loja respeitam a nova classificação.');
   });
   salvarImagem.addEventListener('click',()=>{
    void botoesAtualizar(async()=>{
     const imagem=await foto.obter();
     if(!imagem)throw Error('ESCOLHA_UMA_FOTO');
     const posicaoFoto=Number(galeriaFotos.s.value);
     await salvarFoto(id,csrf,imagem,posicaoFoto);
     if(!slotsAtuais.some(x=>x.produtoId===id))
      await vincularQuadradinho(1,id);
     if(!estaPublicado){
      await publicarFoto(id,csrf);
      estaPublicado=true;
     }
     await consultaOrdem();
    },'Foto gravada. Produto disponível na vitrine, sem liberar checkout.');
   });
   mover.addEventListener('click',()=>{
    void botoesAtualizar(async()=>{
     const atual=slotsAtuais.find(x=>x.produtoId===id);
     const destino=Number(ordemLabel.value);
     if(!atual||!Number.isSafeInteger(destino)||
       destino<1||destino>slotsAtuais.length)
      throw Error('ESCOLHA_UMA_POSICAO_VALIDA');
     await fetchJson('/api/admin/catalogo-midia/reordenar-vitrine',{
      method:'POST',headers:{'Content-Type':'application/json',
       'X-Loop-Admin-Csrf':csrf},
      body:JSON.stringify({produtoId:id,novaPosicao:destino,
       revisaoEsperada:atual.revisao})
     });
     await consultaOrdem();
    },'Ordem alterada. Os outros produtos foram encaixados na sequência.');
   });
  }catch(e){
   travar(true);
   estado.textContent='Edição indisponível: '+e.message;
  }
 }

 // Arrastar e soltar e exclusivo do operador; visitantes apenas navegam.
 // No celular, use a alca: o resto do card continua com a rolagem natural.
 let arrasto=null,alvoVisual=null,suprimirCliqueAte=0,animacao=null;
 let anuncioArrasto=null;
 const avisarArrasto=mensagem=>{
  if(!anuncioArrasto){
   anuncioArrasto=document.createElement('div');
   anuncioArrasto.className='akitemm-arrasto-aviso';
   anuncioArrasto.setAttribute('role','status');
   anuncioArrasto.setAttribute('aria-live','polite');
   document.body.append(anuncioArrasto);
  }
  anuncioArrasto.textContent=mensagem;
 };
 const posicaoCard=c=>{
  const p=Number(c?.dataset?.akitemmOrdem);
  return Number.isSafeInteger(p)&&p>=1&&p<=400?p:null;
 };
 function prepararAlcas(){
  const lista=document.getElementById('catalogoLojaLoop');
  if(!lista)return;
  if(!operador){
   for(const c of lista.querySelectorAll('.akitemm-ordenavel')){
    c.classList.remove('akitemm-ordenavel');
    c.querySelector('.akitemm-alca-arrastar')?.remove();
   }
   return;
  }
  for(const c of lista.querySelectorAll(
   '.produto-loja-loop[data-produto-id][data-akitemm-ordem]')){
   if(c.classList.contains('akitemm-ordenavel'))continue;
   c.classList.add('akitemm-ordenavel');
   const alca=document.createElement('button');
   alca.type='button';alca.className='akitemm-alca-arrastar';
   alca.textContent='⠿';
   alca.title='Segure e arraste para mudar a ordem';
   alca.setAttribute('aria-label','Arrastar produto da posição '+
    posicaoCard(c)+'; toque para editar a posição numericamente');
   alca.addEventListener('click',ev=>{
    ev.preventDefault();ev.stopPropagation();
    if(Date.now()<suprimirCliqueAte)return;
    void abrirProduto(c.dataset.produtoId);
   });
   c.append(alca);
  }
 }
 const observarCatalogo=()=>{
  const lista=document.getElementById('catalogoLojaLoop');
  if(!lista)return;
  const observer=new MutationObserver(()=>prepararAlcas());
  observer.observe(lista,{subtree:true,childList:true});
  prepararAlcas();
 };
 function destacarDestino(card,lado){
  if(alvoVisual&&alvoVisual!==card){
   alvoVisual.classList.remove('akitemm-arrasto-alvo');
   delete alvoVisual.dataset.akitemmLado;
  }
  alvoVisual=card;
  if(card){
   card.classList.add('akitemm-arrasto-alvo');
   card.dataset.akitemmLado=lado;
  }
 }
 function desfazerArrasto(){
  if(arrasto?.temporizador)clearTimeout(arrasto.temporizador);
  arrasto?.origem?.classList.remove('akitemm-arrastando');
  arrasto?.fantasma?.remove();
  destacarDestino(null,'');
  if(animacao){cancelAnimationFrame(animacao);animacao=null;}
  arrasto=null;
 }
 function apontarDestino(){
  if(!arrasto?.ativo)return;
  const abaixo=document.elementFromPoint(arrasto.x,arrasto.y);
  const card=abaixo?.closest?.(
   '#catalogoLojaLoop .produto-loja-loop[data-produto-id][data-akitemm-ordem]');
  if(!card||card===arrasto.origem){
   destacarDestino(null,'');return;
  }
  const rect=card.getBoundingClientRect();
  destacarDestino(card,arrasto.x<rect.left+rect.width/2?'antes':'depois');
 }
 function flutuarArrasto(){
  if(!arrasto?.ativo)return;
  const d=arrasto;
  d.fantasma.style.left=(d.x+14)+'px';
  d.fantasma.style.top=(d.y+15)+'px';
  apontarDestino();
 }
 function iniciarArrasto(){
  if(!arrasto||arrasto.ativo||!operador)return;
  const d=arrasto;d.ativo=true;
  const nome=d.origem.querySelector('h3')?.textContent||'Produto';
  const fantasma=document.createElement('div');
  fantasma.className='akitemm-arrasto-fantasma';
  fantasma.textContent=nome;
  const original=d.origem.querySelector('img');
  if(original){
   const imagem=original.cloneNode(false);
   imagem.removeAttribute('id');fantasma.prepend(imagem);
  }
  document.body.append(fantasma);d.fantasma=fantasma;
  d.origem.classList.add('akitemm-arrastando');
  avisarArrasto('Arraste e solte sobre outro produto para mudar a posição.');
  flutuarArrasto();
  const rolar=()=>{
   if(!arrasto?.ativo)return;
   const ponto=document.elementFromPoint(d.x,d.y);
   const faixa=ponto?.closest?.('.ak-faixa-horizontal');
   if(faixa){
    const r=faixa.getBoundingClientRect();
    if(d.x<r.left+47)faixa.scrollLeft-=14;
    else if(d.x>r.right-47)faixa.scrollLeft+=14;
   }
   if(d.y<65)window.scrollBy(0,-10);
   else if(d.y>window.innerHeight-65)window.scrollBy(0,10);
   apontarDestino();
   animacao=requestAnimationFrame(rolar);
  };
  animacao=requestAnimationFrame(rolar);
 }
 function soltarArrasto(){
  const d=arrasto,alvo=alvoVisual,lado=alvo?.dataset.akitemmLado;
  if(!d)return;
  const teveArrasto=d.ativo;
  const origem=d.origem.dataset.produtoId;
  const numeroOrigem=posicaoCard(d.origem);
  const numeroAlvo=posicaoCard(alvo);
  desfazerArrasto();
  if(!teveArrasto)return;
  suprimirCliqueAte=Date.now()+700;
  if(!alvo||!numeroOrigem||!numeroAlvo||numeroAlvo===numeroOrigem){
   avisarArrasto('Nenhuma alteração. Solte sobre outro produto.');return;
  }
  const destino=numeroOrigem<numeroAlvo?
   numeroAlvo-(lado==='antes'?1:0):
   numeroAlvo+(lado==='antes'?0:1);
  if(destino===numeroOrigem){
   avisarArrasto('O produto já está nessa posição.');return;
  }
  avisarArrasto('Salvando a nova ordem dos produtos...');
  void (async()=>{
   try{
    const [sessao,slots]=await Promise.all([
     fetchJson('/api/admin/comercial/sessao'),
     fetchJson('/api/admin/catalogo-midia/slots')
    ]);
    if(!operador||!Array.isArray(slots.slots)||
       typeof sessao.csrfToken!=='string')
     throw Error('OPERADOR_SESSAO_INVALIDA');
    const registro=slots.slots.find(r=>r.produtoId===origem);
    // Nunca ordenar por um item inexistente nem por um cadastro temporario.
    if(!registro)throw Error('PRODUTO_SEM_POSICAO_SALVA');
    if(destino<1||destino>slots.slots.length)
     throw Error('DESTINO_AINDA_NAO_SALVO');
    const resposta=await fetchJson('/api/admin/catalogo-midia/reordenar-vitrine',{
     method:'POST',headers:{'Content-Type':'application/json',
      'X-Loop-Admin-Csrf':sessao.csrfToken},
     body:JSON.stringify({produtoId:origem,novaPosicao:destino,
      revisaoEsperada:registro.revisao})
    });
    if(resposta.produtoId!==origem||resposta.posicao!==destino)
     throw Error('ORDENACAO_NAO_CONFIRMADA');
    avisarArrasto('Produto movido para '+destino+
     'º. Os demais foram reorganizados.');
    atualizarLoja();
   }catch(e){
    avisarArrasto('A ordem não foi alterada: '+e.message+
     '. Use a posição numérica no editor se precisar.');
   }
  })();
 }
 document.addEventListener('pointerdown',ev=>{
  if(!operador||arrasto||dialogo?.open||ev.button!==0)return;
  const carta=ev.target.closest?.(
   '#catalogoLojaLoop .produto-loja-loop[data-produto-id][data-akitemm-ordem]');
  if(!carta||!posicaoCard(carta))return;
  const alca=ev.target.closest('.akitemm-alca-arrastar');
  if(ev.pointerType==='touch'&&!alca)return;
  if(ev.target.closest('button,a,input,textarea,select')&&!alca)return;
  arrasto={origem:carta,id:ev.pointerId,ativo:false,
   x:ev.clientX,y:ev.clientY,inicioX:ev.clientX,inicioY:ev.clientY,
   tipo:ev.pointerType,fantasma:null,temporizador:null};
  if(alca){
   ev.preventDefault();
   arrasto.temporizador=setTimeout(()=>iniciarArrasto(),190);
  }
 },true);
 document.addEventListener('pointermove',ev=>{
  const d=arrasto;
  if(!d||ev.pointerId!==d.id)return;
  d.x=ev.clientX;d.y=ev.clientY;
  const distancia=Math.hypot(d.x-d.inicioX,d.y-d.inicioY);
  if(!d.ativo&&distancia>(d.tipo==='mouse'?7:12))
   iniciarArrasto();
  if(d.ativo){
   ev.preventDefault();flutuarArrasto();
  }
 },{capture:true,passive:false});
 document.addEventListener('pointerup',ev=>{
  if(!arrasto||ev.pointerId!==arrasto.id)return;
  soltarArrasto();
 },true);
 document.addEventListener('pointercancel',ev=>{
  if(arrasto&&ev.pointerId===arrasto.id)desfazerArrasto();
 },true);
 window.addEventListener('blur',desfazerArrasto);
 // Não captura os controles de filtros nem o botão de detalhes.
 // O cliente normal continua com o comportamento aprovado.
 document.addEventListener('click',ev=>{
  if(Date.now()<suprimirCliqueAte){
   ev.preventDefault();ev.stopImmediatePropagation();return;
  }
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
 if(document.readyState==='loading')
  document.addEventListener('DOMContentLoaded',observarCatalogo,{once:true});
 else observarCatalogo();
 addEventListener('pageshow',()=>void verificarOperador());
 addEventListener('focus',()=>void verificarOperador());
 addEventListener('loop:operador-entrou',()=>void verificarOperador());
 addEventListener('loop:operador-saiu',()=>{
  operador=false;sincronizarEditorOfertas();prepararAlcas();desfazerArrasto();
  if(dialogo?.open)dialogo.close();
 });
})();
