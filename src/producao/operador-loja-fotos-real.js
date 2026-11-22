'use strict';
// Acoes acionadas pelo toque nas molduras JA APROVADAS da loja.
// Este script nao muda layout, CSS, cores ou cadastro de clientes.
// Mesmo cookie de operador da central real; CSRF em cada escrita.
(()=>{
 // IDs legados do catálogo central conservam letras maiúsculas e _.
 const ID=/^[A-Za-z0-9_-]{1,80}$/;
 const ID_NOVO=/^[a-z0-9-]{3,80}$/;
 let operador=false,operadorAutenticado=false,dialogo=null,aberto=false;
 // A visualização de cliente não encerra nem amplia a sessão administrativa.
 // Serve apenas para ocultar as ferramentas e mostrar a vitrine como público.
 const visaoClienteSolicitada=new URLSearchParams(location.search)
  .get('visao')==='cliente';
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
   operadorAutenticado=r.operador===true;
  }catch{operadorAutenticado=false;}
  operador=operadorAutenticado&&!visaoClienteSolicitada;
  sincronizarAlternanciaVisao();
  sincronizarEditorOfertas();
  sinalizarEdicaoBanners();
  prepararAlcas();
 }

 // Quatro banners próprios da AKITEMM. Leitura pública; edição exclusiva
 // ao operador autenticado, sem mudar login, catálogo ou fluxo de pagamentos.
 let bannerSlots=[],bannerAtual=0,bannerTimer=null,emEdicaoBanner=false;
 let bannerConteudoOriginal=null;
 const bannerFotoUrl=slot=>'/api/loja/banners/'+slot.slot+
  '/imagem?v='+slot.revisao;
 const sinalizarEdicaoBanners=()=>{
  const secao=document.querySelector('.akitemm-banner');
  if(!secao)return;
  secao.classList.toggle('akitemm-banner-editavel',operador);
  const botao=document.getElementById('akitemmEditarBannerAtual');
  if(botao)botao.hidden=!operador;
 };
 const validarEstadoBanners=d=>d?.quantidadeMaxima===4&&
  Array.isArray(d.slots)&&d.slots.length===4&&
  d.slots.every((s,i)=>s.slot===i+1&&
   typeof s.temImagem==='boolean'&&
   Number.isSafeInteger(s.revisao)&&s.revisao>=0&&
   ['INTEIRA','PREENCHER'].includes(s.enquadramento));
 const navegarBanner=numero=>{
  bannerAtual=((numero%4)+4)%4;
  const container=document.getElementById('akitemmBannerConteudo');
  const pontos=document.getElementById('akitemmBannerPontos');
  if(!container||bannerSlots.length!==4)return;
  const slot=bannerSlots[bannerAtual];
  container.classList.toggle('akitemm-banner-com-foto',slot.temImagem);
  if(slot.temImagem){
   const img=document.createElement('img');
   img.className='akitemm-banner-imagem';
   img.src=bannerFotoUrl(slot);
   img.alt='Banner '+slot.slot+' da AKITEMM';
   img.loading=bannerAtual===0?'eager':'lazy';
   img.style.objectFit=slot.enquadramento==='PREENCHER'?'cover':'contain';
   container.replaceChildren(img);
  }else if(bannerAtual===0&&bannerConteudoOriginal){
   container.replaceChildren(...bannerConteudoOriginal.map(n=>n.cloneNode(true)));
  }else{
   const p=document.createElement('div');p.className='akitemm-banner-texto';
   const titulo=document.createElement('h1');titulo.textContent='AKITEMM';
   const subtitulo=document.createElement('strong');
   subtitulo.textContent='Banner '+slot.slot;
   const detalhe=document.createElement('p');
   detalhe.textContent='Espaço reservado para uma foto da loja.';
   p.append(titulo,subtitulo,detalhe);container.replaceChildren(p);
  }
  if(pontos){
   pontos.replaceChildren();
   for(let i=0;i<4;i++){
    const botao=document.createElement('button');
    botao.type='button';
    botao.className='akitemm-banner-ponto';
    botao.setAttribute('aria-label','Mostrar banner '+(i+1));
    botao.setAttribute('aria-current',String(i===bannerAtual));
    botao.textContent=String(i+1);
    botao.addEventListener('click',()=>navegarBanner(i));
    pontos.append(botao);
   }
  }
  const etiqueta=document.getElementById('akitemmBannerContagem');
  if(etiqueta)etiqueta.textContent=(bannerAtual+1)+' / 4';
  const secao=document.querySelector('.akitemm-banner');
  if(secao)secao.setAttribute('aria-label','Banner '+(bannerAtual+1)+' de 4 da AKITEMM');
 };
 async function carregarBannersAkitemm(preservar=true){
  const dados=await fetchJson('/api/loja/banners');
  if(!validarEstadoBanners(dados))throw Error('BANNERS_RESPOSTA_INVALIDA');
  bannerSlots=dados.slots;
  navegarBanner(preservar?bannerAtual:0);
 }
 async function editarBannerAtual(){
  if(!operador||emEdicaoBanner||bannerSlots.length!==4)return;
  emEdicaoBanner=true;
  const slot=bannerSlots[bannerAtual],numero=slot.slot;
  const {corpo,estado}=modal('Banner '+numero+' · AKITEMM');
  corpo.append(linha('Toque em selecionar foto para preencher a moldura. '+
   'As quatro fotos aparecem para os clientes na mesma ordem.'));
  const amostra=document.createElement('img');
  amostra.className='akitemm-banner-preview';
  amostra.alt='Prévia da foto do banner '+numero;
  amostra.hidden=!slot.temImagem;
  if(slot.temImagem)amostra.src=bannerFotoUrl(slot);
  corpo.append(amostra);
  const titulo=document.createElement('label');
  titulo.textContent='Escolher foto JPG, PNG ou WebP (até 3 MB)';
  const arquivo=document.createElement('input');
  arquivo.type='file';arquivo.accept='image/jpeg,image/png,image/webp';
  titulo.append(arquivo);corpo.append(titulo);
  const enquadramento=document.createElement('select');
  for(const [valor,label] of [
   ['INTEIRA','Mostrar foto inteira, sem cortar'],
   ['PREENCHER','Preencher toda a moldura (corta as bordas)']
  ]){
   const option=document.createElement('option');
   option.value=valor;option.textContent=label;enquadramento.append(option);
  }
  enquadramento.value=slot.enquadramento;
  const labelEnquadramento=document.createElement('label');
  labelEnquadramento.textContent='Enquadramento';
  labelEnquadramento.append(enquadramento);corpo.append(labelEnquadramento);
  let urlPreview=null;
  arquivo.addEventListener('change',()=>{
   if(urlPreview){URL.revokeObjectURL(urlPreview);urlPreview=null;}
   const foto=arquivo.files?.[0];
   if(foto){
    urlPreview=URL.createObjectURL(foto);
    amostra.src=urlPreview;amostra.hidden=false;
    amostra.style.objectFit=enquadramento.value==='PREENCHER'?'cover':'contain';
   }
  });
  enquadramento.addEventListener('change',()=>{
   amostra.style.objectFit=enquadramento.value==='PREENCHER'?'cover':'contain';
  });
  const botoes=document.createElement('div');botoes.className='akitemm-banner-edicao-botoes';
  const criarBotao=(nome,fn)=>{
   const btn=document.createElement('button');btn.type='button';
   btn.textContent=nome;btn.addEventListener('click',()=>void fn());
   botoes.append(btn);return btn;
  };
  const salvar=criarBotao('Salvar foto',async()=>{
   const foto=arquivo.files?.[0];
   if(!foto||!['image/jpeg','image/png','image/webp'].includes(foto.type)||
      foto.size<40||foto.size>3*1024*1024){
    estado.textContent='Selecione uma imagem JPG, PNG ou WebP de até 3 MB.';
    return;
   }
   await executar('salvar',async token=>fetchJson(
    '/api/admin/akitemm/banners/'+numero,{
     method:'PUT',headers:{
      'Content-Type':foto.type,'X-Loop-Admin-Csrf':token,
      'X-Banner-Revisao-Esperada':String(slot.revisao),
      'X-Banner-Enquadramento':enquadramento.value
     },body:foto
    }));
  });
  const apagar=criarBotao('Remover foto',async()=>{
   if(!slot.temImagem||!window.confirm('Remover a foto do banner '+numero+'?'))return;
   await executar('remover',async token=>fetchJson(
    '/api/admin/akitemm/banners/'+numero,{
     method:'DELETE',headers:{
      'X-Loop-Admin-Csrf':token,
      'X-Banner-Revisao-Esperada':String(slot.revisao)
     }
    }));
  });
  apagar.disabled=!slot.temImagem;
  criarBotao('Mover para a esquerda',async()=>mover(-1));
  criarBotao('Mover para a direita',async()=>mover(1));
  corpo.append(botoes);
  let trabalhando=false;
  async function executar(acao,fn){
   if(trabalhando||!operador)return;
   trabalhando=true;
   for(const btn of botoes.querySelectorAll('button'))btn.disabled=true;
   estado.textContent='Salvando '+acao+'...';
   try{
    const sessao=await fetchJson('/api/admin/comercial/sessao');
    if(typeof sessao.csrfToken!=='string')throw Error('OPERADOR_SESSAO_INVALIDA');
    const resposta=await fn(sessao.csrfToken);
    if(!validarEstadoBanners(resposta))throw Error('BANNERS_RESPOSTA_INVALIDA');
    bannerSlots=resposta.slots;
    navegarBanner(bannerAtual);
    if(urlPreview){URL.revokeObjectURL(urlPreview);urlPreview=null;}
    dialogo.close();
   }catch(e){
    estado.textContent='Não foi possível salvar: '+e.message;
   }finally{
    trabalhando=false;
    for(const btn of botoes.querySelectorAll('button'))btn.disabled=false;
    apagar.disabled=!bannerSlots[bannerAtual]?.temImagem;
   }
  }
  async function mover(direcao){
   const destino=((numero-1+direcao+4)%4)+1;
   const outro=bannerSlots[destino-1];
   if(!outro)return;
   await executar('ordem',async token=>{
    const resposta=await fetchJson('/api/admin/akitemm/banners/trocar',{
     method:'POST',headers:{
      'Content-Type':'application/json','X-Loop-Admin-Csrf':token
     },
     body:JSON.stringify({
      origem:numero,destino,
      revisaoOrigem:slot.revisao,revisaoDestino:outro.revisao
     })
    });
    bannerAtual=destino-1;return resposta;
   });
  }
  dialogo.addEventListener('close',()=>{
   if(urlPreview)URL.revokeObjectURL(urlPreview);
   emEdicaoBanner=false;
  },{once:true});
 }
 function inicializarBannersAkitemm(){
  const secao=document.querySelector('.akitemm-banner');
  const container=document.getElementById('akitemmBannerConteudo');
  if(!secao||!container)return;
  bannerConteudoOriginal=[...container.childNodes].map(n=>n.cloneNode(true));
  const anterior=document.getElementById('akitemmBannerAnterior');
  const proximo=document.getElementById('akitemmBannerProximo');
  if(anterior){anterior.hidden=false;
   anterior.addEventListener('click',()=>navegarBanner(bannerAtual-1));}
  if(proximo){proximo.hidden=false;
   proximo.addEventListener('click',()=>navegarBanner(bannerAtual+1));}
  const botao=document.createElement('button');
  botao.type='button';botao.id='akitemmEditarBannerAtual';
  botao.className='akitemm-banner-botao-editar';
  botao.textContent='Editar foto deste banner';
  botao.setAttribute('aria-label','Editar foto do banner atual como operador');
  botao.addEventListener('click',()=>void editarBannerAtual());
  botao.hidden=true;secao.append(botao);
  secao.addEventListener('click',ev=>{
   if(!operador||ev.target.closest('button')||ev.target.closest('a'))return;
   void editarBannerAtual();
  });
  sinalizarEdicaoBanners();
  void carregarBannersAkitemm(false).catch(()=>{
   // Preservar o banner oficial estático se a leitura pública cair.
   botao.disabled=true;
  });
  bannerTimer=setInterval(()=>{
   if(!document.hidden&&!emEdicaoBanner&&bannerSlots.length===4)
    navegarBanner(bannerAtual+1);
  },6500);
  addEventListener('pageshow',()=>void carregarBannersAkitemm().catch(()=>{}));
 }

 function sincronizarAlternanciaVisao(){
  const id='akitemmAlternarVisao';
  let nav=document.getElementById(id);
  if(!operadorAutenticado){nav?.remove();return;}
  const filtro=document.getElementById('akitemmFiltroOfertas');
  const filtros=filtro?.closest('.akitemm-busca-filtros');
  if(!filtros)return;
  if(!nav){
   nav=document.createElement('nav');
   nav.id=id;
   nav.setAttribute('aria-label','Alternar visão da AKITEMM');
   nav.style.cssText='display:flex;justify-content:center;padding:10px 0 14px';
   filtros.insertAdjacentElement('beforebegin',nav);
  }
  let acao=nav.querySelector('a');
  if(!acao){
   acao=document.createElement('a');
   acao.className='akitemm-chip';
   acao.style.cssText='display:inline-flex;align-items:center;justify-content:center;'+
    'min-height:48px;text-align:center;font-weight:700;text-decoration:none;'+
    'border:1px solid #ba9a68;border-radius:24px;padding:12px 22px;'+
    'background:linear-gradient(110deg,#30271c,#171f2a);color:#f4d9a0';
   nav.append(acao);
  }
  acao.href=visaoClienteSolicitada?'/loja?visao=operador':'/loja?visao=cliente';
  acao.textContent=visaoClienteSolicitada?
   'Visão do Administrador':'Visão do Cliente';
 }
 function sincronizarEditorOfertas(){
  const id='akitemmGerenciarOfertasReal';
  const csvId='akitemmImportarFornecedorCsvReal';
  const suporteId='akitemmAcessarAtendimentosReal';
  const draftsId='akitemmRascunhosProdutosReal';
  const atual=document.getElementById(id);
  const importar=document.getElementById(csvId);
  const suporteBotao=document.getElementById(suporteId);
  const draftsBotao=document.getElementById(draftsId);
  const dica=document.getElementById('akitemmInstrucaoArrastar');
  if(!operador){atual?.remove();importar?.remove();suporteBotao?.remove();draftsBotao?.remove();dica?.remove();return;}
  const filtro=document.getElementById('akitemmFiltroOfertas');
  if(!filtro)return;
  if(!atual){
   const botao=document.createElement('button');
   botao.type='button';botao.id=id;botao.className='akitemm-chip';
   botao.textContent='Gerenciar ofertas';
   botao.setAttribute('aria-label','Cadastrar ofertas na AKITEMM como operador');
   botao.addEventListener('click',()=>void abrirEditorOfertas());
   filtro.insertAdjacentElement('afterend',botao);
  }
  if(!importar){
   const botao=document.createElement('button');
   botao.type='button';botao.id=csvId;botao.className='akitemm-chip';
   botao.textContent='Importar CSV';
   botao.setAttribute('aria-label','Importar catálogo de fornecedor por planilha CSV');
   botao.addEventListener('click',()=>void abrirImportacaoFornecedorCsv());
   (document.getElementById(id)||filtro).insertAdjacentElement('afterend',botao);
  }
  if(!suporteBotao){
   const btn=document.createElement('button');
   btn.type='button';btn.id=suporteId;btn.className='akitemm-chip';
   btn.textContent='Atendimentos AKITEMM';
   btn.setAttribute('aria-label','Abrir protocolos de atendimento da loja como operador');
   btn.addEventListener('click',()=>{
    const painel=document.getElementById('akitemmSuporte');
    if(!painel)return;
    painel.open=true;
    painel.scrollIntoView({block:'center',behavior:'smooth'});
   });
   (document.getElementById(csvId)||filtro).insertAdjacentElement('afterend',btn);
  }
  if(!draftsBotao){
   const btn=document.createElement('button');
   btn.type='button';btn.id=draftsId;btn.className='akitemm-chip';
   btn.textContent='Produtos não publicados';
   btn.setAttribute('aria-label','Ver e retomar produtos não publicados');
   btn.addEventListener('click',()=>void abrirRascunhosNaoPublicados());
   (document.getElementById(suporteId)||filtro).insertAdjacentElement('afterend',btn);
  }
  if(!document.getElementById('akitemmInstrucaoArrastar')){
   const instrucao=document.createElement('p');
   instrucao.id='akitemmInstrucaoArrastar';
   instrucao.className='akitemm-instrucao-arrastar';
   instrucao.textContent='Organizar a vitrine: a alça ⠿ aparece em cada quadrinho, mesmo vazio. Segure e arraste uma moldura vazia sobre outra para trocar suas cores. Produtos já cadastrados podem ser arrastados para qualquer posição livre ou trocados entre si. Produto novo entra automaticamente no primeiro espaço livre: com 10 produtos, o próximo é o 11º, independentemente do quadrinho tocado.';
   (document.getElementById(csvId)||document.getElementById(id)||filtro)
    .insertAdjacentElement('afterend',instrucao);
  }
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


 // Importação funcional por arquivo. Só altera PREÇO ANUNCIADO e quantidade
 // INFORMADA em produtos já cadastrados; nunca ativa checkout nem PSP.
 async function abrirImportacaoFornecedorCsv(){
  if(!operador)return;
  const {corpo,estado}=modal('Fornecedor por planilha CSV');
  corpo.append(linha('Atualize produtos já cadastrados. A planilha usa o código exato do produto na AKITEMM. '+
   'Preço de vitrine não é preço de custo; quantidade informada não equivale a estoque confirmado.'));
  const modelo=document.createElement('a');
  modelo.href='/api/admin/catalogo-midia/fornecedores/csv/modelo';
  modelo.textContent='Baixar modelo CSV (ponto e vírgula)';
  corpo.append(modelo);
  const label=document.createElement('label');
  label.textContent='Escolher arquivo CSV do fornecedor';
  const arquivo=document.createElement('input');
  arquivo.type='file';arquivo.accept='.csv,text/csv';arquivo.required=true;
  label.append(arquivo);corpo.append(label);
  const conferir=document.createElement('button');
  conferir.type='button';conferir.textContent='Conferir alterações';
  corpo.append(conferir);
  const confirmar=document.createElement('button');
  confirmar.type='button';confirmar.textContent='Confirmar importação no catálogo';
  confirmar.hidden=true;corpo.append(confirmar);
  let texto=null,previa=null;
  arquivo.addEventListener('change',()=>{
   texto=null;previa=null;confirmar.hidden=true;
   estado.textContent='Arquivo selecionado. Confira antes de importar.';
  });
  try{
   const sessao=await fetchJson('/api/admin/comercial/sessao');
   const csrf=sessao.csrfToken;
   if(typeof csrf!=='string'||csrf.length<24)
    throw Error('SESSAO_ADMIN_INDISPONIVEL');
   const enviar=async(rota,body,extra={})=>{
    return fetchJson('/api/admin/catalogo-midia/fornecedores/csv/'+rota,{
     method:'POST',headers:{'Content-Type':'text/csv',
      'X-Loop-Admin-Csrf':csrf,...extra},body
    });
   };
   conferir.addEventListener('click',async()=>{
    const selecionado=arquivo.files?.[0];
    if(!selecionado){estado.textContent='Selecione um arquivo .csv.';return;}
    if(selecionado.size>131072||selecionado.size<25){
     estado.textContent='CSV inválido ou acima de 128 KB.';return;
    }
    conferir.disabled=true;confirmar.hidden=true;
    try{
     const carregado=await selecionado.text();
     const resultado=await enviar('previa',carregado);
     if(resultado.gravou!==false||!Array.isArray(resultado.itens)||
        !resultado.itens.length)throw Error('PREVIA_INCONSISTENTE');
     texto=carregado;previa=resultado;
     estado.textContent='Prévia: '+resultado.total+
      ' produto(s) existente(s). Nenhum dado foi alterado. '+
      'Confira códigos, preços de vitrine e quantidades na sua planilha. '+
      'A confirmação irá atualizar esses campos no SQLite real.';
     const detalhes=document.createElement('details');
     const resumo=document.createElement('summary');
     resumo.textContent='Ver itens que serão alterados';
     const lista=document.createElement('ul');
     for(const item of resultado.itens){
      const li=document.createElement('li');
      li.textContent=item.produtoId+' · '+item.fornecedor+
       ' · R$ '+(item.precoCentavos/100).toFixed(2).replace('.',',')+
       ' · '+item.quantidade+' unidade(s)';
      lista.append(li);
     }
     detalhes.append(resumo,lista);
     const anterior=corpo.querySelector('#akitemmPreviaCsv');
     anterior?.remove();
     detalhes.id='akitemmPreviaCsv';corpo.append(detalhes);
     confirmar.hidden=false;
    }catch(err){
     previa=null;texto=null;
     estado.textContent='Planilha não validada: '+err.message;
    }finally{conferir.disabled=false;}
   });
   confirmar.addEventListener('click',async()=>{
    if(!previa||texto===null)return;
    confirmar.disabled=true;
    try{
     const r=await enviar('importar',texto,{
      'X-Loop-Planilha-Hash':previa.hash,
      'X-Loop-Planilha-Versoes':JSON.stringify(
       previa.itens.map(x=>[x.revisaoAnuncio,x.revisaoCanal]))
     });
     if(r.gravou!==true||r.total!==previa.total)
      throw Error('IMPORTACAO_SEM_CONFIRMACAO');
     estado.textContent=r.total+' produto(s) atualizados no catálogo real. '+
      'Preços e quantidades são dados informados; compra e frete continuam protegidos.';
     confirmar.hidden=true;previa=null;texto=null;
     atualizarLoja();
    }catch(err){estado.textContent='Importação não concluída: '+err.message;}
    finally{confirmar.disabled=false;}
   });
  }catch(e){
   conferir.disabled=true;
   estado.textContent='Importação indisponível: '+e.message;
  }
 }
 const campoTexto=(form,titulo,{tipo='text',maxLength=150,placeholder='',valor=''}={})=>{
  const label=document.createElement('label');label.textContent=titulo;
  const entrada=document.createElement(tipo==='textarea'?'textarea':'input');
  if(tipo!=='textarea')entrada.type=tipo;
  entrada.maxLength=maxLength;entrada.placeholder=placeholder;
  entrada.value=valor;label.append(entrada);form.append(label);return entrada;
 };

 // Erros em cada campo: destaque, motivo legível, foco e acesso pelo resumo.
 // A mesma regra é usada em cadastro e edição, sem alterar o cliente.
 function criarGuiaPendencias(form,estado){
  form.noValidate=true;
  const resumo=document.createElement('section');
  resumo.className='akitemm-erros-cadastro';
  resumo.setAttribute('role','alert');
  resumo.setAttribute('aria-live','assertive');
  resumo.hidden=true;
  form.prepend(resumo);
  let ultimos=[];
  const limpar=()=>{
   for(const entrada of ultimos){
    entrada.removeAttribute('aria-invalid');
    const label=entrada.closest('label');
    label?.classList.remove('akitemm-campo-pendente');
    label?.querySelector('.akitemm-campo-erro')?.remove();
   }
   ultimos=[];resumo.replaceChildren();resumo.hidden=true;
  };
  const ir=entrada=>{
   const detalhe=entrada.closest('details');
   if(detalhe)detalhe.open=true;
   entrada.scrollIntoView({block:'center',behavior:'smooth'});
   try{entrada.focus({preventScroll:true});}
   catch{entrada.focus();}
  };
  const mostrar=erros=>{
   limpar();
   if(!erros.length)return true;
   const titulo=document.createElement('strong');
   titulo.textContent='Confira '+erros.length+' campo(s) marcado(s):';
   const lista=document.createElement('ol');
   resumo.append(titulo,lista);
   for(const {entrada,mensagem} of erros){
    if(!entrada)continue;
    entrada.setAttribute('aria-invalid','true');
    const label=entrada.closest('label');
    if(label){
     label.classList.add('akitemm-campo-pendente');
     const pequeno=document.createElement('small');
     pequeno.className='akitemm-campo-erro';
     pequeno.textContent='● '+mensagem;
     label.append(pequeno);
    }
    const linha=document.createElement('li');
    const atalho=document.createElement('button');
    atalho.type='button';atalho.className='akitemm-atalho-erro';
    atalho.textContent='Corrigir: '+mensagem;
    atalho.addEventListener('click',()=>ir(entrada));
    linha.append(atalho);lista.append(linha);
    ultimos.push(entrada);
   }
   resumo.hidden=false;
   estado.textContent='Existem campos marcados. Toque em “Corrigir” para ir ao campo.';
   ir(erros[0].entrada);
   return false;
  };
  form.addEventListener('input',ev=>{
   if(ultimos.includes(ev.target)){
    const label=ev.target.closest('label');
    label?.classList.remove('akitemm-campo-pendente');
    label?.querySelector('.akitemm-campo-erro')?.remove();
    ev.target.removeAttribute('aria-invalid');
   }
  });
  form.addEventListener('change',ev=>{
   if(ultimos.includes(ev.target)){
    const label=ev.target.closest('label');
    label?.classList.remove('akitemm-campo-pendente');
    label?.querySelector('.akitemm-campo-erro')?.remove();
    ev.target.removeAttribute('aria-invalid');
   }
  });
  return {mostrar,limpar};
 }
 const escolhaCor=form=>select('Classificação comercial LOOP (não é cor física)',[
  ['CINZA','Cinza'],['VERDE','Verde'],['DOURADO','Dourado'],
  ['ROXO','Roxo']
 ]);
 const slugManual=()=> 'manual-'+Date.now().toString(36)+'-'+
  Math.random().toString(36).slice(2,8).padEnd(6,'0');
 // Formularios usuais de e-commerce. Preco digitado nunca e convertido
 // automaticamente em cobranca: e apenas a etiqueta da vitrine.
 function camposAnuncio(form){
  const origem=select('Origem e abastecimento',[
   ['PROPRIO','Meu produto — cadastro manual'],
   ['FORNECEDOR_MANUAL','Fornecedor sem API — cadastro e contato'],
   ['PLANILHA_CSV','Planilha CSV — importação de catálogo'],
   ['API_PENDENTE','API direta — requer autorização'],
   ['ERP_PENDENTE','ERP ou hub — requer conexão']
  ]);
  // Sem provedor credenciado, os canais automáticos não fingem funcionar.
  for(const op of origem.s.options){
   if(['API_PENDENTE','ERP_PENDENTE'].includes(op.value))
    op.disabled=true;
  }
  // CSV passa pelo importador real (botão no topo), não por escolher texto.
  origem.s.querySelector('option[value="PLANILHA_CSV"]').disabled=true;
  form.append(origem.label);
  const fornecedorNome=campoTexto(form,'Nome do fornecedor',{
   maxLength:90,placeholder:'Razão social ou nome comercial'
  });
  const fornecedorSku=campoTexto(form,'SKU no fornecedor',{
   maxLength:80,placeholder:'Código do produto na tabela do fornecedor'
  });
  const fornecedorContato=campoTexto(form,'Contato do fornecedor (e-mail ou telefone)',{
   maxLength:160,placeholder:'Canal combinado para enviar pedidos'
  });
  const avisoOrigem=linha('Fornecedor sem API: nome, SKU e contato ficam registrados no catálogo. '+
   'Pedidos não são enviados automaticamente. A planilha CSV é importada pelo botão Importar CSV. '+
   'API e ERP exigem credenciais e autorização; ainda não estão conectados. ' +
   'A AKITEMM é uma loja própria, não uma integração com marketplaces.');
  form.append(avisoOrigem);
  const sincronizarOrigem=()=>{
   const externo=['FORNECEDOR_MANUAL','PLANILHA_CSV'].includes(origem.s.value);
   for(const campo of [fornecedorNome,fornecedorSku,fornecedorContato])
    campo.parentElement.hidden=!externo;
  };
  origem.s.addEventListener('change',sincronizarOrigem);
  sincronizarOrigem();
  let revisaoCanal=0;
  const categoria=campoTexto(form,'Categoria (opcional)',{
   maxLength:70,placeholder:'Ex.: Calçados, roupas, acessórios'
  });
  const marca=campoTexto(form,'Marca (opcional)',{maxLength:70});
  const corDescricao=campoTexto(form,'Cor física do produto (escreva livremente)',{
   maxLength:120,placeholder:'Ex.: azul, preto, colorido, azul e branco, estampado'
  });
  const faixa=document.createElement('fieldset');
  faixa.className='akitemm-editor-precos';
  const legenda=document.createElement('legend');
  legenda.textContent='Preço e promoção';faixa.append(legenda);
  const normal=campoTexto(faixa,'Preço normal (R$)',{
   maxLength:14,placeholder:'Ex.: 299,90'
  });
  normal.inputMode='decimal';
  const promo=campoTexto(faixa,'Preço promocional (R$) — opcional',{
   maxLength:14,placeholder:'Ex.: 249,90'
  });
  promo.inputMode='decimal';
  const nota=linha('A promoção aparecerá como “de / por”. O preço informado é só de exibição; o pagamento ainda depende da integração comercial.');
  faixa.append(nota);form.append(faixa);
  const estoque=campoTexto(form,'Quantidade disponível (opcional)',{
   tipo:'number',maxLength:8,placeholder:'Ex.: 12'
  });
  estoque.min='0';estoque.max='1000000';estoque.step='1';
  const informe=linha('Frete e checkout serão calculados no fluxo de compra quando estiverem conectados. Não exige cadastro de fornecedor para produto próprio.');
  form.append(informe);
  const cents=v=>{
   const t=v.trim();
   if(!t)return null;
   if(!/^(?:0|[1-9][0-9]{0,6})(?:[,.][0-9]{1,2})?$/.test(t))
    throw Error('PRECO_INVALIDO');
   const n=Math.round(Number(t.replace(',','.'))*100);
   if(!Number.isSafeInteger(n)||n<1||n>100000000)
    throw Error('PRECO_INVALIDO');
   return n;
  };
  const deReais=n=>n===null?'':(n/100).toFixed(2).replace('.',',');
  return {
   preencher(d){
    if(!d)return;
    const canal=d.canalFornecedor;
    origem.s.value=canal?.revisao>0?canal.canal:
     d.origem==='API'?'API_PENDENTE':'PROPRIO';
    revisaoCanal=canal?.revisao??0;
    fornecedorNome.value=canal?.fornecedorNome||'';
    fornecedorSku.value=canal?.fornecedorSku||'';
    fornecedorContato.value=canal?.fornecedorContato||'';
    sincronizarOrigem();
    categoria.value=d.categoria||'';
    marca.value=d.marca||'';
    corDescricao.value=d.corDescricao||'';
    normal.value=deReais(d.precoCentavos??null);
    promo.value=deReais(d.promocaoCentavos??null);
    estoque.value=d.quantidade===null?'':String(d.quantidade);
   },
   obter(){
    const precoCentavos=cents(normal.value);
    const promocaoCentavos=cents(promo.value);
    const qtd=estoque.value.trim(),quantidade=qtd===''?null:Number(qtd);
    if(!['PROPRIO','FORNECEDOR_MANUAL','PLANILHA_CSV'].includes(origem.s.value)||
      (promocaoCentavos!==null&&
        (precoCentavos===null||promocaoCentavos>=precoCentavos))||
      (quantidade!==null&&
       (!Number.isSafeInteger(quantidade)||quantidade<0||quantidade>1000000)))
      throw Error('CONFIRA_PRECO_PROMOCIONAL_OU_ESTOQUE');
    const modo=origem.s.value;
    if(modo!=='PROPRIO'&&(!fornecedorNome.value.trim()||
       !fornecedorSku.value.trim()||
       (modo==='FORNECEDOR_MANUAL'&&!fornecedorContato.value.trim())))
     throw Error('INFORME_DADOS_DO_FORNECEDOR');
    if(fornecedorSku.value.trim()&&
       !ID.test(fornecedorSku.value.trim()))
     throw Error('SKU_DO_FORNECEDOR_INVALIDO');
    return {origem:modo==='PROPRIO'?'PROPRIO':'API',
     categoria:categoria.value.trim(),marca:marca.value.trim(),
     corDescricao:corDescricao.value.trim(),
     precoCentavos,promocaoCentavos,quantidade,
     canal:{canal:modo,fornecedorNome:fornecedorNome.value.trim(),
      fornecedorSku:fornecedorSku.value.trim(),
      fornecedorContato:fornecedorContato.value.trim(),
      revisaoEsperada:revisaoCanal}};
   },
   canalGravado(revisao){revisaoCanal=revisao;},
   rascunho(){
    return {origem:origem.s.value,fornecedorNome:fornecedorNome.value,
     fornecedorSku:fornecedorSku.value,fornecedorContato:fornecedorContato.value,
     categoria:categoria.value,marca:marca.value,
     corDescricao:corDescricao.value,precoNormal:normal.value,
     precoPromocional:promo.value,quantidade:estoque.value};
   },
   restaurarRascunho(d){
    if(!d)return;
    for(const [campo,valor] of [
     [origem.s,d.origem],[fornecedorNome,d.fornecedorNome],
     [fornecedorSku,d.fornecedorSku],[fornecedorContato,d.fornecedorContato],
     [categoria,d.categoria],[marca,d.marca],[corDescricao,d.corDescricao],
     [normal,d.precoNormal],[promo,d.precoPromocional],
     [estoque,d.quantidade]])
     if(typeof valor==='string')campo.value=valor;
    sincronizarOrigem();
   },
   validarCampos(){
    const erros=[],adicionar=(entrada,mensagem)=>erros.push({entrada,mensagem});
    const precoValido=v=>!v.trim()||/^(?:0|[1-9][0-9]{0,6})(?:[,.][0-9]{1,2})?$/.test(v.trim());
    if(!['PROPRIO','FORNECEDOR_MANUAL','PLANILHA_CSV'].includes(origem.s.value))
     adicionar(origem.s,'Escolha uma origem disponível e funcional.');
    if(!precoValido(normal.value)||(
      normal.value.trim()&&Number(normal.value.replace(',','.'))<=0))
     adicionar(normal,'Informe um preço normal válido, como 299,90.');
    if(!precoValido(promo.value))
     adicionar(promo,'Informe uma promoção válida, como 249,90.');
    const preco=Number(normal.value.replace(',','.'));
    const promocao=Number(promo.value.replace(',','.'));
    if(promo.value.trim()&&(
       !normal.value.trim()||!Number.isFinite(preco)||promocao>=preco))
     adicionar(promo,'O preço promocional precisa ser menor que o normal.');
    if(estoque.value.trim()&&(
      !Number.isSafeInteger(Number(estoque.value))||
      Number(estoque.value)<0||Number(estoque.value)>1000000))
     adicionar(estoque,'Informe uma quantidade inteira de 0 a 1.000.000.');
    if(corDescricao.value.trim().length>120)
     adicionar(corDescricao,'Descreva a cor em até 120 caracteres.');
    if(origem.s.value==='FORNECEDOR_MANUAL'){
     if(fornecedorNome.value.trim().length<2)
      adicionar(fornecedorNome,'Informe o nome do fornecedor.');
     if(!ID.test(fornecedorSku.value.trim()))
      adicionar(fornecedorSku,'Informe o SKU válido do fornecedor.');
     if(fornecedorContato.value.trim().length<5)
      adicionar(fornecedorContato,'Informe o contato do fornecedor.');
    }
    return erros;
   },
  };
 }
 async function salvarAnuncio(id,csrf,campos,revisaoEsperada){
  const {canal,...anuncio}=campos.obter();
  const salvo=await fetchJson('/api/admin/catalogo-midia/produtos/'+id+'/anuncio',{
   method:'POST',headers:{'Content-Type':'application/json',
    'X-Loop-Admin-Csrf':csrf},
   body:JSON.stringify({...anuncio,revisaoEsperada})
  });
  // O registro de fornecedor é independente da origem técnica legada.
  // Nunca informa "conectado" sem confirmação externa.
  const fornecedor=await fetchJson('/api/admin/catalogo-midia/produtos/'+id+'/canal',{
   method:'POST',headers:{'Content-Type':'application/json',
    'X-Loop-Admin-Csrf':csrf},
   body:JSON.stringify(canal)
  });
  if(!Number.isSafeInteger(fornecedor.revisao)||
     fornecedor.integracaoAutomatica!==false)
   throw Error('CANAL_NAO_CONFIRMADO');
  campos.canalGravado(fornecedor.revisao);
  return salvo;
 }
 // O operador configura o alcance da ENTREGA, sem mudar o anuncio visto pelo cliente.
 function camposEntrega(form){
  const section=document.createElement('details');
  section.className='akitemm-editor-entrega';
  const h=document.createElement('summary');
  h.textContent='Região e entrega própria';section.append(h);
  const modo=select('Onde entregar este produto',[
   ['NACIONAL','Sem restrição regional (entrega normal)'],
   ['VOLTA_REDONDA','Somente Volta Redonda (RJ)'],
   ['MUNICIPIOS','Cidades escolhidas por mim']
  ]);
  section.append(modo.label);
  const cidades=campoTexto(section,
   'Cidades atendidas (separadas por vírgula)',{
    tipo:'textarea',maxLength:1200,
    placeholder:'Ex.: Volta Redonda, Barra Mansa, Resende'
   });
  const uf=select('Estado',[
   ['RJ','Rio de Janeiro'],['SP','São Paulo'],['MG','Minas Gerais'],
   ['ES','Espírito Santo'],['PR','Paraná'],['SC','Santa Catarina'],
   ['RS','Rio Grande do Sul'],['BA','Bahia'],['DF','Distrito Federal'],
   ['GO','Goiás'],['MT','Mato Grosso'],['MS','Mato Grosso do Sul'],
   ['PE','Pernambuco'],['CE','Ceará'],['AL','Alagoas'],
   ['AM','Amazonas'],['AP','Amapá'],['AC','Acre'],['MA','Maranhão'],
   ['PA','Pará'],['PB','Paraíba'],['PI','Piauí'],['RN','Rio Grande do Norte'],
   ['RO','Rondônia'],['RR','Roraima'],['SE','Sergipe'],['TO','Tocantins']
  ]);
  section.append(uf.label);
  const taxa=campoTexto(section,'Taxa de entrega própria (R$)',{
   placeholder:'Ex.: 30,00',maxLength:14
  });
  taxa.inputMode='decimal';
  const nota=linha('Essa taxa só será calculada depois que o cliente informar o endereço. Não aparece na vitrine.');
  section.append(nota);
  form.append(section);
  const sincronizar=()=>{
   const nacional=modo.s.value==='NACIONAL';
   const vr=modo.s.value==='VOLTA_REDONDA';
   cidades.parentElement.hidden=nacional||vr;
   uf.label.hidden=nacional||vr;
   taxa.parentElement.hidden=nacional;
   if(vr){uf.s.value='RJ';cidades.value='Volta Redonda';}
   if(nacional){cidades.value='';taxa.value='';}
  };
  modo.s.addEventListener('change',sincronizar);
  sincronizar();
  const parseMoney=valor=>{
   if(!/^(?:0|[1-9][0-9]{0,4})(?:[,.][0-9]{1,2})?$/.test(valor))
    throw Error('TAXA_ENTREGA_INVALIDA');
   const n=Math.round(Number(valor.replace(',','.'))*100);
   if(!Number.isSafeInteger(n)||n<0||n>1000000)
    throw Error('TAXA_ENTREGA_INVALIDA');
   return n;
  };
  return {
   preencher(d){
    if(!d)return;
    if(d.modo==='NACIONAL'){modo.s.value='NACIONAL';}
    else if(d.uf==='RJ'&&d.municipios?.length===1&&
      d.municipios[0].trim().toLocaleLowerCase('pt-BR')==='volta redonda')
     modo.s.value='VOLTA_REDONDA';
    else modo.s.value='MUNICIPIOS';
    sincronizar();
    if(d.modo==='MUNICIPIOS'){
     uf.s.value=d.uf;
     cidades.value=d.municipios.join(', ');
     taxa.value=(d.taxaCentavos/100).toFixed(2).replace('.',',');
    }
   },
   rascunho(){
    return {entregaModo:modo.s.value,entregaUf:uf.s.value,
     entregaMunicipios:cidades.value,entregaTaxa:taxa.value};
   },
   restaurarRascunho(d){
    if(!d)return;
    if(['NACIONAL','VOLTA_REDONDA','MUNICIPIOS'].includes(d.entregaModo))
     modo.s.value=d.entregaModo;
    sincronizar();
    if(typeof d.entregaUf==='string'&&d.entregaUf)uf.s.value=d.entregaUf;
    if(typeof d.entregaMunicipios==='string')cidades.value=d.entregaMunicipios;
    if(typeof d.entregaTaxa==='string')taxa.value=d.entregaTaxa;
   },
   obter(){
    if(modo.s.value==='NACIONAL')return {
     modo:'NACIONAL',uf:'',municipios:[],taxaCentavos:null};
    const municip=modo.s.value==='VOLTA_REDONDA'?
     ['Volta Redonda']:cidades.value.split(',').map(x=>x.trim()).filter(Boolean);
    if(!municip.length||municip.length>50)
     throw Error('INFORME_MUNICIPIOS_ATENDIDOS');
    const valor=taxa.value.trim();
    if(!valor)throw Error('INFORME_TAXA_ENTREGA_PODE_SER_ZERO');
    return {modo:'MUNICIPIOS',uf:modo.s.value==='VOLTA_REDONDA'?'RJ':uf.s.value,
     municipios:municip,taxaCentavos:parseMoney(valor)};
   }
  };
 }
 async function salvarEntrega(id,csrf,campos,revisaoEsperada){
  return fetchJson('/api/admin/catalogo-midia/produtos/'+id+'/entrega',{
   method:'POST',headers:{'Content-Type':'application/json',
    'X-Loop-Admin-Csrf':csrf},
   body:JSON.stringify({...campos.obter(),revisaoEsperada})
  });
 }
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
   // A CSP da aplicação real autoriza data: e bloqueia blob:.
   // FileReader evita abrir exceções inseguras na política de imagens.
   carregando=new Promise((resolve,reject)=>{
    const leitor=new FileReader();
    const img=new Image();
    img.onload=()=>{
     if(img.naturalWidth<50||img.naturalHeight<50){
      reject(Error('FOTO_RESOLUCAO_BAIXA'));return;
     }
     imagem=img;previa.hidden=false;ajustes.hidden=false;
     redesenhar();aviso.textContent='Ajuste o enquadramento. A foto será cortada, sem alterar as cores.';
     resolve();
    };
    img.onerror=()=>reject(Error('FOTO_NAO_ABRIU'));
    leitor.onerror=()=>reject(Error('FOTO_NAO_LEIDA'));
    leitor.onload=()=>{img.src=String(leitor.result||'');};
    leitor.readAsDataURL(foto);
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
    roxasPorUnidade:cor==='ROXO'?Math.max(1,anterior.roxasPorUnidade||0):0,
    revisaoEsperada:anterior.revisao})
  });
 }
 async function publicarFoto(id,csrf){
  return fetchJson('/api/admin/catalogo-midia/produtos/'+id+'/publicacao',{
   method:'POST',headers:{'Content-Type':'application/json',
    'X-Loop-Admin-Csrf':csrf},body:JSON.stringify({ativo:true})
  });
 }
 const atualizarLoja=()=>window.dispatchEvent(
  new Event('akitemm:catalogo-atualizar'));
 async function vincularQuadradinho(indice,id){
  if(!Number.isSafeInteger(indice)||indice<1||indice>400||!ID.test(id))
   throw Error('QUADRINHO_INVALIDO');
  const sessao=await fetchJson('/api/admin/comercial/sessao');
  if(typeof sessao.csrfToken!=='string')
   throw Error('OPERADOR_SESSAO_INVALIDA');
  // O número tocado ABRE o cadastro, mas NUNCA determina a posição.
  // A escolha é atômica e sequencial no serviço real, sem buracos.
  const resposta=await fetchJson('/api/admin/catalogo-midia/vincular-proximo',{
   method:'POST',headers:{'Content-Type':'application/json',
    'X-Loop-Admin-Csrf':sessao.csrfToken},
   body:JSON.stringify({produtoId:id})
  });
  if(resposta.produtoId!==id||resposta.automatico!==true||
     !Number.isSafeInteger(resposta.posicao)||resposta.posicao<1||
     resposta.posicao>400)throw Error('QUADRINHO_NAO_CONFIRMADO');
  return resposta;
 }
 // Aqui aparecem tanto cadastros reais RASCUNHO como formulários
 // interrompidos antes da criação. Nenhum item desta lista é publicado.
 async function abrirRascunhosNaoPublicados(){
  if(!operador)return;
  const {corpo,estado}=modal('Produtos não publicados · AKITEMM');
  corpo.append(linha('Retome um cadastro sem começar de novo. '+
   'Formulários interrompidos guardam os campos digitados; fotos não enviadas '+
   'precisam ser selecionadas novamente.'));
  try{
   const [salvos,catalogo]=await Promise.all([
    fetchJson('/api/admin/catalogo-midia/rascunhos-formulario'),
    fetchJson('/api/admin/catalogo-midia/produtos')
   ]);
   if(!Array.isArray(salvos.rascunhos)||!Array.isArray(catalogo.produtos))
    throw Error('LISTA_RASCUNHOS_INVALIDA');
   const produtos=catalogo.produtos.filter(x=>x.estado==='RASCUNHO'&&
    ID.test(x.produtoId));
   const formulario=salvos.rascunhos;
   const total=produtos.length+formulario.length;
   let pendentes=total;
   const atualizarQuantidade=()=>{
    estado.textContent=pendentes>0?
     pendentes+' cadastro(s) não publicado(s) localizado(s).':
     'Não existem produtos pendentes neste momento.';
   };
   estado.textContent=total?
    total+' cadastro(s) não publicado(s) localizado(s).':
    'Não existem produtos pendentes neste momento.';
   for(const item of formulario){
    const card=document.createElement('section');
    card.className='akitemm-card-rascunho';
    const titulo=linha(item.campos.titulo.trim()||'Produto sem nome','strong');
    const data=linha('Formulário não finalizado · salvo em '+
     new Date(item.atualizadoEm).toLocaleString('pt-BR'));
    const continuar=document.createElement('button');
    continuar.type='button';continuar.textContent='Continuar cadastro';
    continuar.addEventListener('click',()=>void escolherProduto(1,item));
    const excluir=document.createElement('button');
    excluir.type='button';excluir.textContent='🗑️ Excluir';
    excluir.className='akitemm-lixeira-rascunho';
    // Mantém o nome acessível anterior para teclado e regressão existente.
    excluir.setAttribute('aria-label','Descartar este rascunho');
    excluir.addEventListener('click',async()=>{
     if(!window.confirm('Descartar os dados deste formulário não publicado?'))
      return;
     excluir.disabled=true;
     try{
      const sessao=await fetchJson('/api/admin/comercial/sessao');
      const r=await fetchJson(
       '/api/admin/catalogo-midia/rascunhos-formulario/'+item.id+'/excluir',{
        method:'POST',headers:{'Content-Type':'application/json',
         'X-Loop-Admin-Csrf':sessao.csrfToken},body:'{}'
       });
      if(r.excluido!==true)throw Error('EXCLUSAO_NAO_CONFIRMADA');
      card.remove();pendentes--;atualizarQuantidade();
      estado.textContent='Rascunho descartado. '+estado.textContent;
     }catch(e){estado.textContent='Não foi possível descartar: '+e.message;}
     finally{excluir.disabled=false;}
    });
    card.append(titulo,data,continuar,excluir);corpo.append(card);
   }
   for(const item of produtos){
    const card=document.createElement('section');
    card.className='akitemm-card-rascunho';
    const titulo=document.createElement('strong');
    titulo.textContent=item.nome||item.produtoId;
    const d=linha('Produto cadastrado, mas ainda não publicado · '+item.produtoId);
    const continuar=document.createElement('button');
    continuar.type='button';continuar.textContent='Editar e publicar';
    continuar.addEventListener('click',()=>void abrirProduto(item.produtoId));
    const excluir=document.createElement('button');
    excluir.type='button';
    excluir.className='akitemm-lixeira-rascunho';
    excluir.textContent='🗑️ Excluir';
    excluir.setAttribute('aria-label','Excluir produto não publicado '+(item.nome||item.produtoId));
    excluir.addEventListener('click',async()=>{
     if(!operador)return;
     if(!window.confirm('Excluir o produto não publicado "'+
       (item.nome||item.produtoId)+'" da lista? Produtos publicados não serão afetados.'))
      return;
     excluir.disabled=true;
     try{
      const [sessao,produto]=await Promise.all([
       fetchJson('/api/admin/comercial/sessao'),
       fetchJson('/api/admin/catalogo-midia/produtos/'+item.produtoId)
      ]);
      if(typeof sessao.csrfToken!=='string'||produto.estado!=='RASCUNHO'||
         !Number.isSafeInteger(produto.revisao))
       throw Error('RASCUNHO_NAO_VALIDADO');
      const r=await fetchJson(
       '/api/admin/catalogo-midia/produtos/'+item.produtoId+
       '/excluir-rascunho',{
        method:'POST',headers:{'Content-Type':'application/json',
         'X-Loop-Admin-Csrf':sessao.csrfToken},
        body:JSON.stringify({revisaoEsperada:produto.revisao})
       });
      if(r.excluido!==true||r.arquivado!==true)
       throw Error('EXCLUSAO_NAO_CONFIRMADA');
      card.remove();pendentes--;atualizarQuantidade();
     }catch(e){estado.textContent='Não foi possível excluir: '+e.message;}
     finally{excluir.disabled=false;}
    });
    card.append(titulo,d,continuar,excluir);corpo.append(card);
   }
  }catch(e){estado.textContent='Não foi possível carregar rascunhos: '+e.message;}
 }
 async function escolherProduto(indice,rascunhoInicial=null){
  if(!Number.isSafeInteger(indice)||indice<1||indice>400)return;
  const {corpo,estado}=modal('Cadastrar produto · AKITEMM');
  corpo.append(linha('Cadastro na AKITEMM. Cada campo com erro será marcado e terá um atalho para correção. '+
   'Distribuidor e SKU só são necessários ao escolher fornecedor externo. ' +
   'Ao publicar, o produto entra na primeira posição livre, independentemente do quadrinho tocado.'));
  const form=document.createElement('form');form.autocomplete='off';
  const guia=criarGuiaPendencias(form,estado);
  const nome=campoTexto(form,'Nome do produto',{placeholder:'Ex.: Camiseta preta'});
  nome.required=true;
  const desc=campoTexto(form,'Descrição (opcional)',{tipo:'textarea',
   maxLength:2000,placeholder:'Escreva como deseja apresentar o produto'});
  const anuncio=camposAnuncio(form);
  const entrega=camposEntrega(form);
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
  // Salvar rascunho mesmo com campos incompletos. Nunca publica.
  let rascunhoId=rascunhoInicial?.id||null;
  let revisaoRascunho=rascunhoInicial?.revisao||0;
  let salvarEmCurso=Promise.resolve(),temporizadorRascunho=null;
  let formularioFinalizado=false,formularioAlterado=false;
  const avisoRascunho=linha('Os campos digitados são salvos como rascunho. '+
   'A foto ainda não enviada precisa ser selecionada novamente.');
  avisoRascunho.className='akitemm-estado-rascunho';
  avisoRascunho.setAttribute('role','status');
  form.append(avisoRascunho);
  const capturarRascunho=()=>({
   titulo:nome.value,descricao:desc.value,codigo:codigo.value,
   classificacao:cor.s.value,...anuncio.rascunho(),
   ...entrega.rascunho()
  });
  const salvarRascunho=()=>{
   if(formularioFinalizado)return Promise.resolve();
   clearTimeout(temporizadorRascunho);
   const campos=capturarRascunho();
   const tarefa=async()=>{
    const sessao=await fetchJson('/api/admin/comercial/sessao');
    if(typeof sessao.csrfToken!=='string')
     throw Error('OPERADOR_SESSAO_INVALIDA');
    const salvo=await fetchJson(
     '/api/admin/catalogo-midia/rascunhos-formulario',{
      method:'POST',headers:{'Content-Type':'application/json',
       'X-Loop-Admin-Csrf':sessao.csrfToken},
      body:JSON.stringify({id:rascunhoId,
       revisaoEsperada:revisaoRascunho,campos})
     });
    if(!salvo.id||!Number.isSafeInteger(salvo.revisao))
     throw Error('RASCUNHO_NAO_CONFIRMADO');
    rascunhoId=salvo.id;revisaoRascunho=salvo.revisao;
    avisoRascunho.textContent='Rascunho guardado na AKITEMM. '+
     'Você pode retomá-lo em Produtos não publicados.';
   };
   salvarEmCurso=salvarEmCurso.catch(()=>{}).then(tarefa);
   return salvarEmCurso;
  };
  const falhaRascunho=e=>{
   avisoRascunho.textContent='Rascunho não salvo: '+e.message+
    '. Use “Salvar rascunho” para tentar novamente.';
  };
  const agendarRascunho=()=>{
   if(formularioFinalizado)return;
   formularioAlterado=true;
   clearTimeout(temporizadorRascunho);
   avisoRascunho.textContent='Alterações ainda não salvas...';
   temporizadorRascunho=setTimeout(()=>{
    void salvarRascunho().catch(falhaRascunho);
   },750);
  };
  form.addEventListener('input',agendarRascunho);
  form.addEventListener('change',agendarRascunho);
  // Fechar pelo X também tenta gravar a última alteração, sem publicar.
  dialogo.addEventListener('close',()=>{
   if(!formularioFinalizado&&formularioAlterado){
    clearTimeout(temporizadorRascunho);
    void salvarRascunho().catch(falhaRascunho);
   }
  },{once:true});
  const salvarParcial=document.createElement('button');
  salvarParcial.type='button';salvarParcial.className='akitemm-editor-secundario';
  salvarParcial.textContent='Salvar rascunho e continuar depois';
  salvarParcial.addEventListener('click',async()=>{
   salvarParcial.disabled=true;
   try{
    await salvarRascunho();
    formularioFinalizado=true;
    dialogo.close();void abrirRascunhosNaoPublicados();
   }catch(e){falhaRascunho(e);}
   finally{salvarParcial.disabled=false;}
  });
  form.append(salvarParcial);
  if(rascunhoInicial?.campos){
   const dados=rascunhoInicial.campos;
   nome.value=dados.titulo||'';desc.value=dados.descricao||'';
   codigo.value=dados.codigo||'';
   anuncio.restaurarRascunho(dados);
   entrega.restaurarRascunho(dados);
   if(['CINZA','VERDE','DOURADO','ROXO'].includes(dados.classificacao))
    cor.s.value=dados.classificacao;
   avisoRascunho.textContent='Rascunho recuperado. Confira os campos e '+
    'selecione a foto novamente antes de publicar.';
  }
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
   const ocupadas=new Set(slots.slots.map(x=>x.posicao));
   const primeiraLivre=Array.from({length:400},(_,i)=>i+1)
    .find(n=>!ocupadas.has(n));
   if(!primeiraLivre)throw Error('VITRINE_SEM_ESPACO');
   const numero=linha('Próximo produto: posição '+primeiraLivre+
    '. A posição é automática, mesmo que você tenha clicado no quadrinho '+indice+'.');
   numero.className='akitemm-indicador-proxima-posicao';
   corpo.insertBefore(numero,form);
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
      // Consultar um rascunho não o transforma em produto publicado.
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
   aberto=true;
   // Mostrar cada campo errado imediatamente, sem esperar uma requisição.
   // O salvamento do rascunho não bloqueia a correção visual.
   const titulo=nome.value.trim();
   const informado=codigo.value.trim(),id=informado||slugManual();
   const erros=[];
   if(titulo.length<2||titulo.length>150)
    erros.push({entrada:nome,mensagem:'Digite o nome do produto (2 a 150 caracteres).'});
   if(!ID_NOVO.test(id))
    erros.push({entrada:codigo,mensagem:'Código: use letras minúsculas, números ou hífen (3 a 80 caracteres).'});
   erros.push(...anuncio.validarCampos());
   if(!guia.mostrar(erros)){
    aberto=false;
    void salvarRascunho().catch(falhaRascunho);
    return;
   }
   // Para cadastro válido, confirmar o rascunho primeiro, depois criar.
   try{await salvarRascunho();}
   catch(e){falhaRascunho(e);aberto=false;return;}
   criar.disabled=true;estado.textContent='Salvando no catálogo real...';
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
    await salvarAnuncio(id,csrf,anuncio,0);
    await salvarEntrega(id,csrf,entrega,0);
    if(imagem){
     await salvarFoto(id,csrf,imagem,1);
     const posicaoSalva=await vincularQuadradinho(indice,id);
     await publicarFoto(id,csrf);
     atualizarLoja();
     estado.textContent='Produto e foto salvos na posição '+posicaoSalva.posicao+
      '. A entrada segue a ordem sequencial dos produtos.';
     criar.textContent='Produto salvo';
    }else{
     estado.textContent='Produto salvo sem foto, como rascunho. Selecione uma imagem para publicar.';
     criar.textContent='Produto salvo';
    }
    // Produto agora existe no cadastro real (PUBLICADO ou RASCUNHO).
    // Retirar apenas o formulário temporário, para não duplicar entradas.
    formularioFinalizado=true;
    clearTimeout(temporizadorRascunho);
    if(rascunhoId){
     try{
      await fetchJson('/api/admin/catalogo-midia/rascunhos-formulario/'+
       rascunhoId+'/excluir',{
       method:'POST',headers:{'Content-Type':'application/json',
        'X-Loop-Admin-Csrf':csrf},body:'{}'
      });
     }catch(e){avisoRascunho.textContent=
      'Produto salvo, mas o rascunho anterior ainda precisa ser descartado: '+e.message;}
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
  const guia=criarGuiaPendencias(form,estado);
  const nome=campoTexto(form,'Nome do produto');
  const descricao=campoTexto(form,'Descrição (opcional)',{
   tipo:'textarea',maxLength:2000
  });
  const anuncio=camposAnuncio(form);
  const cor=escolhaCor();
  form.append(cor.label);
  const foto=editarFoto(form);
  const galeriaFotos=select('Foto do produto',Array.from({length:10},(_,i)=>[
   String(i+1),i===0?'Foto principal':'Foto '+(i+1)
  ]));
  form.append(galeriaFotos.label);
  const salvarDados=document.createElement('button');
  salvarDados.type='submit';
  salvarDados.textContent='Salvar dados, preços e cor física';
  form.append(salvarDados);
  const salvarImagem=document.createElement('button');
  salvarImagem.type='button';salvarImagem.textContent='Salvar foto e publicar na vitrine';
  form.append(salvarImagem);
  const salvarClassificacao=document.createElement('button');
  salvarClassificacao.type='button';
  salvarClassificacao.className='akitemm-editor-secundario';
  salvarClassificacao.textContent='Salvar classificação comercial';
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
  const detalheOrdem=linha('A cor física é texto livre. A classificação comercial segue as regras do LOOP.');
  ordemBox.append(mover,detalheOrdem);form.append(ordemBox);
  corpo.append(form);
  let revisaoAtual=null,revisaoAnuncio=0,revisaoEntrega=0,csrf=null,slotsAtuais=[],estaPublicado=false;
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
   const [sessao,dados,regras,precos,entregaDados]=await Promise.all([
    fetchJson('/api/admin/comercial/sessao'),
    fetchJson('/api/admin/catalogo-midia/produtos/'+id),
    fetchJson('/api/admin/comercial/classificacoes'),
    fetchJson('/api/admin/catalogo-midia/produtos/'+id+'/anuncio'),
    fetchJson('/api/admin/catalogo-midia/produtos/'+id+'/entrega')
   ]);
   if(typeof sessao.csrfToken!=='string'||sessao.csrfToken.length<24||
      !Number.isSafeInteger(dados.revisao)||dados.revisao<1)
    throw Error('OPERADOR_SESSAO_INVALIDA');
   csrf=sessao.csrfToken;revisaoAtual=dados.revisao;
   nome.value=dados.nome;descricao.value=dados.descricao;
   anuncio.preencher(precos);revisaoAnuncio=precos.revisao;
   entrega.preencher(entregaDados);revisaoEntrega=entregaDados.revisao;
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
    const erros=[];
    if(titulo.length<2||titulo.length>150)
     erros.push({entrada:nome,mensagem:'Digite o nome do produto (2 a 150 caracteres).'});
    if(descricao.value.length>2000)
     erros.push({entrada:descricao,mensagem:'A descrição aceita até 2.000 caracteres.'});
    erros.push(...anuncio.validarCampos());
    if(!guia.mostrar(erros))return;
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
     const resultado=await salvarAnuncio(id,csrf,anuncio,revisaoAnuncio);
     revisaoAnuncio=resultado.revisao;
     const entregaSalva=await salvarEntrega(id,csrf,entrega,revisaoEntrega);
     revisaoEntrega=entregaSalva.revisao;
     await salvarCor(id,csrf,cor.s.value);
    },'Nome, cor física, preço, promoção e estoque salvos.');
   });
   salvarClassificacao.addEventListener('click',()=>{
    void botoesAtualizar(async()=>{await salvarCor(id,csrf,cor.s.value);},
     'Classificação comercial salva; os filtros seguem as regras do LOOP.');
   });
   salvarImagem.addEventListener('click',()=>{
    void botoesAtualizar(async()=>{
     const imagem=await foto.obter();
     if(!imagem){estado.textContent='Selecione uma foto antes de publicar. O botão de foto está no formulário.';
      const campo=form.querySelector('.akitemm-escolher-foto');
      campo?.scrollIntoView({block:'center',behavior:'smooth'});
      campo?.focus();throw Error('ESCOLHA_UMA_FOTO');
     }
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
 let anuncioArrasto=null,temporizadorAvisoArrasto=null;
 const avisarArrasto=mensagem=>{
  if(temporizadorAvisoArrasto!==null){
   clearTimeout(temporizadorAvisoArrasto);
   temporizadorAvisoArrasto=null;
  }
  if(!anuncioArrasto){
   anuncioArrasto=document.createElement('div');
   anuncioArrasto.className='akitemm-arrasto-aviso';
   anuncioArrasto.setAttribute('role','status');
   anuncioArrasto.setAttribute('aria-live','polite');
   document.body.append(anuncioArrasto);
  }
  anuncioArrasto.textContent=mensagem;
  // O aviso não fica sobre os produtos: desaparece sozinho após quatro segundos.
  // Mensagem mais recente substitui a anterior e reinicia a contagem.
  temporizadorAvisoArrasto=setTimeout(()=>{
   anuncioArrasto?.remove();anuncioArrasto=null;
   temporizadorAvisoArrasto=null;
  },4000);
 };
 const posicaoCard=c=>{
  const p=Number(c?.dataset?.akitemmOrdem||c?.dataset?.akitemmSlot);
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
   '.produto-loja-loop[data-produto-id][data-akitemm-ordem],'+
   '.akitemm-slot-vazio[data-akitemm-slot]')){
   if(c.classList.contains('akitemm-ordenavel'))continue;
   c.classList.add('akitemm-ordenavel');
   const vazio=c.classList.contains('akitemm-slot-vazio');
   // A alça aparece mesmo no quadrinho vazio, sem produto cadastrado.
   for(const imagem of c.querySelectorAll('img'))imagem.draggable=false;
   const alca=document.createElement('button');
   alca.type='button';alca.className='akitemm-alca-arrastar';
   alca.textContent='⠿';
   alca.title=vazio?'Arraste para trocar com outro espaço vazio':
    'Arraste produto para reorganizar a vitrine';
   alca.setAttribute('aria-label',vazio?
    'Arrastar espaço vazio da posição '+posicaoCard(c)+
    '; toque para abrir o cadastro de produto':
    'Segure e arraste produto da posição '+posicaoCard(c)+
    '; toque para editar a posição numericamente');
   alca.addEventListener('click',ev=>{
    ev.preventDefault();ev.stopPropagation();
    if(Date.now()<suprimirCliqueAte)return;
    if(vazio)void escolherProduto(posicaoCard(c));
    else void abrirProduto(c.dataset.produtoId);
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
   '#catalogoLojaLoop .produto-loja-loop[data-produto-id][data-akitemm-ordem],'+
   '#catalogoLojaLoop .akitemm-slot-vazio[data-akitemm-slot]');
  // Produto pode ser solto em produto OU espaço vazio. Moldura vazia
  // continua movendo-se apenas sobre outra moldura vazia.
  if(!card||card===arrasto.origem||
     (arrasto.origem.dataset.akitemmSlot&&!card.dataset.akitemmSlot)){
   destacarDestino(null,'');return;
  }
  const rect=card.getBoundingClientRect();
  destacarDestino(card,card.dataset.akitemmSlot?'trocar':
   arrasto.x<rect.left+rect.width/2?'antes':'depois');
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
  const nome=d.origem.dataset.akitemmSlot?
   'Espaço vazio '+posicaoCard(d.origem):
   d.origem.querySelector('h3')?.textContent||'Produto';
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
  avisarArrasto(d.origem.dataset.akitemmSlot?
   'Arraste até outro espaço vazio para trocar as molduras.':
   'Arraste o produto até outro produto ou quadrinho vazio para escolher onde ele aparece.');
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
   avisarArrasto('Nenhuma alteração. Solte sobre outro quadrinho compatível.');return;
  }
  if(d.origem.dataset.akitemmSlot){
   if(!alvo.dataset.akitemmSlot){
    avisarArrasto('Para trocar molduras vazias, solte sobre outra moldura vazia.');
    return;
   }
   avisarArrasto('Salvando a nova posição das molduras vazias...');
   void (async()=>{
    try{
     const [sessao,slots]=await Promise.all([
      fetchJson('/api/admin/comercial/sessao'),
      fetchJson('/api/admin/catalogo-midia/slots')
     ]);
     if(!operador||!slots.layoutVazio||
        !Number.isSafeInteger(slots.layoutVazio.revisao)||
        typeof sessao.csrfToken!=='string')
      throw Error('OPERADOR_SESSAO_INVALIDA');
     const resposta=await fetchJson(
      '/api/admin/catalogo-midia/trocar-espacos-vazios',{
       method:'POST',headers:{'Content-Type':'application/json',
        'X-Loop-Admin-Csrf':sessao.csrfToken},
       body:JSON.stringify({origem:numeroOrigem,destino:numeroAlvo,
        revisaoEsperada:slots.layoutVazio.revisao})
      });
     if(resposta.confirmado!==true||resposta.origem!==numeroOrigem||
        resposta.destino!==numeroAlvo)
      throw Error('TROCA_VAZIOS_NAO_CONFIRMADA');
     avisarArrasto('Molduras vazias trocadas entre as posições '+
      numeroOrigem+' e '+numeroAlvo+'. Produtos seguem a ordem de cadastro.');
     atualizarLoja();
    }catch(e){
     avisarArrasto('Molduras não alteradas: '+e.message);
    }
   })();
   return;
  }
  const destino=alvo.dataset.akitemmSlot?numeroAlvo:
   numeroOrigem<numeroAlvo?
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
    if(destino<1||destino>400)
     throw Error('DESTINO_FORA_DA_VITRINE');
    const resposta=await fetchJson('/api/admin/catalogo-midia/reordenar-vitrine',{
     method:'POST',headers:{'Content-Type':'application/json',
      'X-Loop-Admin-Csrf':sessao.csrfToken},
     body:JSON.stringify({produtoId:origem,novaPosicao:destino,
      revisaoEsperada:registro.revisao})
    });
    if(resposta.produtoId!==origem||resposta.posicao!==destino)
     throw Error('ORDENACAO_NAO_CONFIRMADA');
    avisarArrasto('Produto movido para o quadrinho '+destino+
     '. Organização manual salva.');
    atualizarLoja();
   }catch(e){
    avisarArrasto('A ordem não foi alterada: '+e.message+
     '. Use a posição numérica no editor se precisar.');
   }
  })();
 }
 document.addEventListener('dragstart',ev=>{
  if(operador&&ev.target.closest?.('#catalogoLojaLoop .akitemm-ordenavel'))
   ev.preventDefault();
 },true);
 document.addEventListener('pointerdown',ev=>{
  if(!operador||arrasto||dialogo?.open||ev.button!==0)return;
  const carta=ev.target.closest?.(
   '#catalogoLojaLoop .produto-loja-loop[data-produto-id][data-akitemm-ordem],'+
   '#catalogoLojaLoop .akitemm-slot-vazio[data-akitemm-slot]');
  if(!carta||!posicaoCard(carta))return;
  const alca=ev.target.closest('.akitemm-alca-arrastar');
  // Toque longo no cartão também inicia a ordem; deslizar continua rolando.
  if(ev.target.closest('button,a,input,textarea,select')&&!alca)return;
  arrasto={origem:carta,id:ev.pointerId,ativo:false,
   x:ev.clientX,y:ev.clientY,inicioX:ev.clientX,inicioY:ev.clientY,
   tipo:ev.pointerType,alca:!!alca,fantasma:null,temporizador:null};
  if(ev.pointerType==='touch'){
   if(alca)ev.preventDefault();
   arrasto.temporizador=setTimeout(()=>iniciarArrasto(),alca?190:350);
  }
 },true);
 document.addEventListener('pointermove',ev=>{
  const d=arrasto;
  if(!d||ev.pointerId!==d.id)return;
  d.x=ev.clientX;d.y=ev.clientY;
  const distancia=Math.hypot(d.x-d.inicioX,d.y-d.inicioY);
  if(!d.ativo&&d.tipo==='touch'&&!d.alca&&distancia>12){
   // Deslize simples rola a vitrine; somente segurar arrasta.
   desfazerArrasto();return;
  }
  if(!d.ativo&&distancia>(d.tipo==='mouse'?7:12)&&
     (d.tipo!=='touch'||d.alca))iniciarArrasto();
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
  document.addEventListener('DOMContentLoaded',inicializarBannersAkitemm,{once:true});
 else inicializarBannersAkitemm();
 if(document.readyState==='loading')
  document.addEventListener('DOMContentLoaded',observarCatalogo,{once:true});
 else observarCatalogo();
 addEventListener('pageshow',()=>void verificarOperador());
 addEventListener('focus',()=>void verificarOperador());
 addEventListener('loop:operador-entrou',()=>void verificarOperador());
 addEventListener('loop:operador-saiu',()=>{
  operador=false;operadorAutenticado=false;
  sincronizarAlternanciaVisao();
  sincronizarEditorOfertas();sinalizarEdicaoBanners();prepararAlcas();desfazerArrasto();
  if(temporizadorAvisoArrasto!==null){
   clearTimeout(temporizadorAvisoArrasto);temporizadorAvisoArrasto=null;
  }
  anuncioArrasto?.remove();anuncioArrasto=null;
  if(dialogo?.open)dialogo.close();
 });
})();
