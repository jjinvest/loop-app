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
   dialogo.className='akitemm-modal';
   dialogo.id='akitemmOperadorFotosReal';
   document.body.append(dialogo);
  }
  dialogo.replaceChildren();
  const fechar=document.createElement('button');
  fechar.type='button';fechar.className='akitemm-modal-fechar';
  fechar.textContent='×';fechar.setAttribute('aria-label','Fechar');
  fechar.addEventListener('click',()=>dialogo.close());
  const h=document.createElement('h2');h.textContent=titulo;
  const corpo=document.createElement('div');
  const estado=document.createElement('p');
  estado.setAttribute('role','status');
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
 async function vincularQuadradinho(indice,id){
  if(!Number.isSafeInteger(indice)||indice<1||indice>400||!ID.test(id))
   throw Error('QUADRINHO_INVALIDO');
  const [sessao,slots]=await Promise.all([
   fetchJson('/api/admin/comercial/sessao'),
   fetchJson('/api/admin/catalogo-midia/slots')
  ]);
  if(!Array.isArray(slots.slots)||slots.total!==400)
   throw Error('QUADRINHOS_INDISPONIVEIS');
  const atual=slots.slots.find(x=>x.posicao===indice);
  const resposta=await fetchJson(
   '/api/admin/catalogo-midia/slots/'+indice,{
    method:'POST',headers:{'Content-Type':'application/json',
     'X-Loop-Admin-Csrf':sessao.csrfToken},
    body:JSON.stringify({produtoId:id,revisaoEsperada:atual?.revisao||0})
   });
  if(resposta.produtoId!==id||resposta.posicao!==indice)
   throw Error('QUADRINHO_NAO_CONFIRMADO');
  return resposta;
 }
 async function escolherProduto(indice){
  const {corpo,estado}=modal('Espaço '+indice+' da AKITEMM');
  corpo.append(linha('Toque no produto que deseja fotografar. '+
   'Seu cadastro fica na central única; nenhuma venda é criada.'));
  corpo.append(admin());
  try{
   const [r,slots]=await Promise.all([
    fetchJson('/api/admin/catalogo-midia/produtos'),
    fetchJson('/api/admin/catalogo-midia/slots')
   ]);
   if(!Array.isArray(r.produtos)||r.checkoutReal!==false||
      !Array.isArray(slots.slots)||slots.total!==400)
    throw Error('CATALOGO_ADMIN_INCONSISTENTE');
   const ocupado=slots.slots.find(x=>x.posicao===indice);
   if(ocupado){
    dialogo.close();void abrirProduto(ocupado.produtoId);return;
   }
   const vinculados=new Set(slots.slots.map(x=>x.produtoId));
   const itens=r.produtos.filter(p=>
    ID.test(p.produtoId)&&!vinculados.has(p.produtoId));
   if(itens.length){
    const escolha=select('Produto existente',itens.map(p=>[
     p.produtoId,p.nome+' ('+p.produtoId+')'
    ]));
    const botao=document.createElement('button');
    botao.type='button';botao.textContent='Editar produto';
    botao.addEventListener('click',async()=>{
     botao.disabled=true;
     try{
      const id=escolha.s.value;
      await vincularQuadradinho(indice,id);
      dialogo.close();void abrirProduto(id);
     }catch(e){
      estado.textContent='Não foi possível vincular o quadradinho: '+e.message;
     }finally{botao.disabled=false;}
    });
    corpo.append(escolha.label,botao);
   }else estado.textContent='Nenhum produto cadastrado: crie o primeiro abaixo.';
   corpo.append(linha('Ou cadastre uma mercadoria sem sair da loja:'));
   const idLabel=document.createElement('label');
   idLabel.textContent='Código do novo produto (letras minúsculas e hífen)';
   const idNovo=document.createElement('input');
   idNovo.type='text';idNovo.placeholder='produto-exemplo';
   idNovo.maxLength=80;idLabel.append(idNovo);
   const nomeLabel=document.createElement('label');
   nomeLabel.textContent='Nome do produto';
   const nomeNovo=document.createElement('input');
   nomeNovo.type='text';nomeNovo.maxLength=150;nomeLabel.append(nomeNovo);
   const descricaoLabel=document.createElement('label');
   descricaoLabel.textContent='Descrição';
   const descNova=document.createElement('textarea');
   descNova.maxLength=2000;descricaoLabel.append(descNova);
   const criar=document.createElement('button');
   criar.type='button';criar.textContent='Cadastrar produto';
   criar.addEventListener('click',async()=>{
    const codigo=idNovo.value.trim(),titulo=nomeNovo.value.trim();
    if(!ID_NOVO.test(codigo)||titulo.length<2||titulo.length>150){
     estado.textContent='Confira o código e o nome do produto.';return;
    }
    criar.disabled=true;
    try{
     const sessao=await fetchJson('/api/admin/comercial/sessao');
     const x=await fetchJson('/api/admin/comercial/produtos-cadastrar',{
      method:'POST',headers:{'Content-Type':'application/json',
       'X-Loop-Admin-Csrf':sessao.csrfToken},
      body:JSON.stringify({produtoId:codigo,titulo,
       descricao:descNova.value.trim()})
     });
     if(x.produtoId!==codigo||x.ativo!==false)
      throw Error('CADASTRO_NAO_CONFIRMADO');
     await vincularQuadradinho(indice,codigo);
     dialogo.close();void abrirProduto(codigo);
    }catch(e){estado.textContent='Não foi possível cadastrar: '+e.message;}
    finally{criar.disabled=false;}
   });
   corpo.append(idLabel,nomeLabel,descricaoLabel,criar);
   corpo.append(linha('O produto ficará vinculado ao quadradinho '+indice+
    '. Começa como rascunho; a publicação continua na central.'));
  }catch(e){estado.textContent='Não foi possível listar produtos: '+e.message;}
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
