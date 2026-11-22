'use strict';
// Usa a vitrine AKITEMM escolhida, mas não consome catálogo, pedidos ou
// saldos de demonstração. Contas reais têm o mesmo nick do Escritório LOOP.
(async()=>{
 const $=id=>document.getElementById(id);
 const nickVisivel=nick=>typeof nick==='string'&&/^(?:vilela|operador)$/i.test(nick)?nick.toUpperCase():nick;
 const informar=msg=>{$('estadoLojaLoop').textContent=msg;};
 // A origem do convite nao e um nick de cliente: permanece ate o cadastro.
 const ref=new URLSearchParams(location.search).get('ref');
 const indicadorNick=typeof ref==='string'&&/^[A-Za-z]{1,12}$/.test(ref)?
  ref.toLowerCase():null;
 const destinoCadastro=()=>'/escritorio?origem=loja&cadastro=1'+
  (indicadorNick?'&ref='+encodeURIComponent(indicadorNick):'');
 const solicitarCadastro=()=>location.assign(destinoCadastro());
 let visitante=true,operadorAtivo=false,clienteNick=null,csrfLoja=null;
 const visaoClienteLoja=new URLSearchParams(location.search)
  .get('visao')==='cliente';
 // A foto segue a credencial exibida: titular vê a sua, operador a sua.
 // A visão de cliente do operador não troca de titular nem deve apagar
 // a foto DO OPERADOR que ele já gravou em sua própria sessão.
 const fotoTitular=$('akitemmFotoTitular');
 let consultaFotoLoja=0,caminhoFotoAtual=null;
 async function sincronizarFotoLoja(){
  if(!fotoTitular)return;
  const consulta=++consultaFotoLoja;
  // A visão demonstrativa do cliente no perfil administrativo NÃO herda
  // a identidade/foto do operador; só clientes autenticados veem sua foto.
  const bloqueado=(visitante&&!operadorAtivo)||
   (operadorAtivo&&visaoClienteLoja);
  const caminho=bloqueado?null:operadorAtivo?
   '/api/admin/operador/foto-perfil':'/api/contas/foto-perfil';
  if(!caminho){
   caminhoFotoAtual=null;fotoTitular.hidden=true;
   fotoTitular.removeAttribute('src');return;
  }
  // Nunca conservar o retrato de outro perfil ao trocar de sessão.
  if(caminhoFotoAtual!==caminho){
   caminhoFotoAtual=caminho;
   fotoTitular.hidden=true;fotoTitular.removeAttribute('src');
  }
  try{
   const r=await fetch(caminho,{credentials:'same-origin',cache:'no-store'});
   if(consulta!==consultaFotoLoja)return;
   if(!r.ok||!['image/jpeg','image/png','image/webp'].includes(
    r.headers.get('content-type')?.split(';')[0])){
    fotoTitular.hidden=true;fotoTitular.removeAttribute('src');return;
   }
   // Duas consultas podem ocorrer juntas no Android (pageshow/focus).
   // A última vence SEM esconder uma imagem já carregada no mesmo perfil.
   const url=caminho+'?revisao='+Date.now()+'-'+consulta;
   fotoTitular.onload=()=>{
    if(consulta===consultaFotoLoja)fotoTitular.hidden=false;
   };
   fotoTitular.onerror=()=>{
    if(consulta===consultaFotoLoja){
     fotoTitular.hidden=true;fotoTitular.removeAttribute('src');
    }
   };
   fotoTitular.src=url;
  }catch{
   if(consulta===consultaFotoLoja){
    fotoTitular.hidden=true;fotoTitular.removeAttribute('src');
   }
  }
 }
 // Quando uma foto é trocada em outra aba do LOOP, refletir na loja
 // assim que o cliente voltar. Sem armazenamento de fotografias no navegador.
 window.addEventListener('pageshow',()=>{void sincronizarFotoLoja();});
 window.addEventListener('focus',()=>{void sincronizarFotoLoja();});
 document.addEventListener('visibilitychange',()=>{
  if(!document.hidden)void sincronizarFotoLoja();
 });
 let carrinhoOcupado=false;
 const quantidadesCarrinho=new Map();
 const pegar=async(url)=>{
  const r=await fetch(url,{credentials:'same-origin',cache:'no-store'});
  if(!r.ok)throw Error('CONSULTA_INDISPONIVEL');
  return r.json();
 };
 function fecharMenus(){
  for(const [id,botao] of [['akitemmDadosConta','akitemmAbrirConta'],
   ['akitemmNotificacoes','akitemmSino']]){
   $(id).hidden=true;$(botao).setAttribute('aria-expanded','false');
  }
 }
 function alternarMenu(id,botao){
  const aberto=$(id).hidden;
  fecharMenus();$(id).hidden=!aberto;
  $(botao).setAttribute('aria-expanded',String(aberto));
  return aberto;
 }
 async function dadosConta(){
  const alvo=$('akitemmDadosContaConteudo');
  if(operadorAtivo){
   alvo.textContent=visaoClienteLoja?
    'Visualização do cliente. Dados pessoais de clientes não são exibidos.':
    'Sessão do operador; os dados dos clientes estão protegidos.';
   $('akitemmEditarConta').href='/administrador';
   $('akitemmEditarConta').textContent='Central do operador';
   return;
  }
  alvo.textContent='Consultando sua conta...';
  try{
   const dados=await pegar('/api/contas/meus-dados');
   if(typeof dados.nick!=='string'||dados.nick!==clienteNick||
      typeof dados.nome!=='string'||typeof dados.email!=='string')
    throw Error('IDENTIDADE_DIVERGENTE');
   if($('akitemmDadosConta').hidden)return;
   alvo.textContent='Nome: '+dados.nome+'\nNick: @'+
    nickVisivel(dados.nick)+'\nE-mail: '+dados.email;
   $('akitemmEditarConta').href='/minha-conta';
  }catch{
   if(!$('akitemmDadosConta').hidden)
    alvo.textContent='Dados indisponíveis. Acesse seu escritório para consultar a conta.';
  }
 }
 async function avisosDaConta(){
  const alvo=$('akitemmNotificacoesConteudo');
  if(operadorAtivo){
   alvo.textContent=visaoClienteLoja?
    'Visualização de cliente: avisos individuais não são exibidos.':
    'Avisos administrativos: consulte a central do operador.';
   return;
  }
  if(visitante){
   alvo.textContent='Entre na conta para consultar avisos e seus pedidos.';
   return;
  }
  alvo.textContent='Consultando seus avisos...';
  try{
   const me=await pegar('/api/contas/me');
   if(me.nick!==clienteNick)throw Error('TITULAR_DIVERGENTE');
   const email=me.emailVerificado===true?'E-mail confirmado.':
    'Confirmação de e-mail pendente.';
   const pedidos=await pegar('/api/loja/pedidos');
   if(pedidos.fonte!=='PEDIDOS_COMERCIAIS_DO_TITULAR'||
      !Number.isSafeInteger(pedidos.paginacao?.total))
    throw Error('HISTORICO_INVALIDO');
   alvo.textContent=email+' '+(pedidos.paginacao.total===0?
    'Nenhum pedido registrado na conta.':
    pedidos.paginacao.total+' pedido(s) no histórico. Consulte Meus pedidos.');
  }catch{
   alvo.textContent='Avisos indisponíveis nesta consulta. Seus dados não foram alterados.';
  }
 }
 $('akitemmAbrirConta').addEventListener('click',()=>{
  if(visitante&&!operadorAtivo){solicitarCadastro();return;}
  if(alternarMenu('akitemmDadosConta','akitemmAbrirConta'))
   void dadosConta();
 });
 $('akitemmSino').addEventListener('click',()=>{
  if(alternarMenu('akitemmNotificacoes','akitemmSino'))
   void avisosDaConta();
 });
 document.addEventListener('click',e=>{
  if(!e.target.closest('#akitemmAbrirConta,#akitemmSino,'+
     '#akitemmDadosConta,#akitemmNotificacoes'))fecharMenus();
 });
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape')fecharMenus();
 });
 const avisarCursos=texto=>{
  const lista=$('akitemmListaMeusCursos');
  lista.replaceChildren();
  const li=document.createElement('li');li.textContent=texto;lista.append(li);
 };
 $('akitemmAtualizarMeusCursos').addEventListener('click',async()=>{
  if(visitante&&!operadorAtivo){solicitarCadastro();return;}
  if(operadorAtivo){
   avisarCursos('O operador não é um comprador. Entre como cliente.');
   return;
  }
  const botao=$('akitemmAtualizarMeusCursos');
  botao.disabled=true;avisarCursos('Consultando a biblioteca...');
  try{
   const estado=await pegar('/api/loja/estado');
   const pedidos=await pegar('/api/loja/pedidos');
   if(estado.contaUnica!==true||estado.checkoutReal!==false||
      pedidos.fonte!=='PEDIDOS_COMERCIAIS_DO_TITULAR')
    throw Error('BIBLIOTECA_INVALIDA');
   avisarCursos('Os pedidos estão vinculados à sua conta. Arquivos digitais só serão liberados após compra e pagamento confirmados; nenhuma entrega digital está habilitada neste momento.');
  }catch{
   avisarCursos('Biblioteca indisponível nesta consulta. Nenhum arquivo foi liberado.');
  }finally{botao.disabled=false;}
 });
 function prepararLinkPessoal(){
  const input=$('enderecoDivulgarLojaLoop');
  const btn=$('copiarDivulgarLojaLoop');
  const valido=!visitante&&!operadorAtivo&&
   typeof clienteNick==='string'&&/^[A-Za-z]{1,12}$/.test(clienteNick);
  input.value=valido?location.origin+'/loja/'+encodeURIComponent(clienteNick):'';
  btn.disabled=!valido;btn.setAttribute('aria-disabled',String(!valido));
  $('statusDivulgarLojaLoop').textContent=valido?
   'Link pessoal ativo para convites e cadastro de indicados.':
   'Entre como cliente para compartilhar seu link pessoal.';
 }
 $('copiarDivulgarLojaLoop').addEventListener('click',async()=>{
  const input=$('enderecoDivulgarLojaLoop');
  if(!input.value||visitante||operadorAtivo)return;
  try{
   if(!navigator.clipboard?.writeText)throw Error('SEM_CLIPBOARD');
   await navigator.clipboard.writeText(input.value);
   $('statusDivulgarLojaLoop').textContent='Link pessoal copiado.';
  }catch{
   input.focus();input.select();
   $('statusDivulgarLojaLoop').textContent=
    'Link selecionado. Use Copiar no seu dispositivo.';
  }
 });
 document.querySelectorAll('[data-akitemm-informacao]').forEach(botao=>{
  botao.addEventListener('click',async()=>{
   const tipo=botao.dataset.akitemmInformacao;
   if(tipo==='contato'){
    const suporte=$('akitemmSuporte');
    suporte.open=true;suporte.scrollIntoView({block:'center'});
    return;
   }
   const nomes={sobre:'Sobre a AKITEMM',privacidade:'Política de Privacidade',
    trocas:'Trocas e Devoluções'};
   if(!Object.hasOwn(nomes,tipo))return;
   const modal=$('akitemmModalInformacao');
   $('akitemmInformacaoTitulo').textContent=nomes[tipo];
   const corpo=$('akitemmInformacaoConteudo');
   corpo.replaceChildren();
   const p=document.createElement('p');
   p.textContent=tipo==='sobre'?
    'AKITEMM · Loja Oficial conectada ao Escritório LOOP 3.0. Produtos são publicados na vitrine. Compras e entregas serão habilitadas após as integrações externas.':
    tipo==='trocas'?
    'A política comercial de trocas e devoluções ainda não foi publicada. O checkout continua bloqueado até a disponibilização das condições oficiais.':
    'Consultando a política de privacidade vigente...';
   corpo.append(p);modal.showModal();
   if(tipo!=='privacidade')return;
   try{
    const docs=await pegar('/api/contas/documentos-leitura');
    const d=docs.privacidade;
    if(docs.financeiroReal!==false||
       typeof d?.texto!=='string'||d.texto.length<100||
       typeof d.versao!=='string'||!/^[a-f0-9]{64}$/.test(d.hash||''))
     throw Error('DOCUMENTOS_INVALIDOS');
    if(modal.open){
     p.style.whiteSpace='pre-wrap';
     p.textContent='Versão '+d.versao+'\n'+d.texto;
    }
   }catch{
    if(modal.open)
     p.textContent='Política indisponível nesta consulta. Consulte os documentos no Escritório.';
   }
  });
 });

 // Atendimento direto da AKITEMM: protocolo próprio, não ligado a marketplaces.
 // O cliente abre e acompanha; só o operador responde.
 function montarAtendimentoAkitemm(){
  const suporte=$('akitemmSuporte');
  if(!suporte)return;
  const texto=$('akitemmTextoSuporte');
  if(texto)texto.textContent='Atendimento da AKITEMM, com protocolo e resposta da equipe.';
  const bot=$('akitemmAbrirChatbot'),statusChat=$('akitemmStatusChatbot');
  if(bot)bot.hidden=true;
  if(statusChat)statusChat.hidden=true;
  const caixa=document.createElement('section');
  caixa.className='akitemm-atendimento-proprio';
  const resultado=document.createElement('p');resultado.setAttribute('role','status');
  resultado.className='akitemm-atendimento-status';
  const atualizar=document.createElement('button');
  atualizar.type='button';atualizar.textContent='Consultar meus atendimentos';
  const conteudo=document.createElement('div');
  caixa.append(atualizar,resultado,conteudo);suporte.append(caixa);
  let carregando=false;
  const linha=(txt,tag='p')=>{
   const x=document.createElement(tag);x.textContent=txt;return x;
  };
  const apresentar=(atendimentos,operador=false)=>{
   conteudo.replaceChildren();
   if(!atendimentos.length){
    conteudo.append(linha('Nenhum atendimento registrado.'));return;
   }
   for(const t of atendimentos){
    const artigo=document.createElement('article');
    artigo.className='akitemm-protocolo-atendimento';
    artigo.append(linha('Protocolo: '+t.protocolo,'strong'));
    artigo.append(linha(t.tipo+' · '+(t.estado==='ABERTO'?
     'Aguardando resposta':'Respondido')));
    if(operador&&t.nick)artigo.append(linha('Conta: @'+t.nick));
    artigo.append(linha('Solicitação: '+t.mensagem));
    if(t.resposta)artigo.append(linha('Resposta AKITEMM: '+t.resposta));
    if(operador&&t.estado==='ABERTO'){
     const label=document.createElement('label');
     label.textContent='Resposta da AKITEMM';
     const campo=document.createElement('textarea');
     campo.maxLength=1500;campo.minLength=10;
     const enviar=document.createElement('button');
     enviar.type='button';enviar.textContent='Responder atendimento';
     label.append(campo);artigo.append(label,enviar);
     enviar.addEventListener('click',async()=>{
      const txt=campo.value.trim();
      if(txt.length<10){
       resultado.textContent='Digite pelo menos 10 caracteres na resposta.';
       campo.focus();return;
      }
      enviar.disabled=true;
      try{
       const sessao=await pegar('/api/admin/comercial/sessao');
       const r=await fetch('/api/admin/akitemm/atendimentos/'+
        encodeURIComponent(t.protocolo)+'/responder',{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json',
         'X-Loop-Admin-Csrf':sessao.csrfToken},
        body:JSON.stringify({resposta:txt})
       });
       const d=await r.json().catch(()=>({}));
       if(!r.ok||d.estado!=='RESPONDIDO')
        throw Error(d.erro||'RESPOSTA_NAO_CONFIRMADA');
       resultado.textContent='Resposta registrada para '+t.protocolo+'.';
       await carregar();
      }catch(e){resultado.textContent='Resposta não enviada: '+e.message;}
      finally{enviar.disabled=false;}
     });
    }
    conteudo.append(artigo);
   }
  };
  async function carregar(){
   if(carregando)return;
   carregando=true;atualizar.disabled=true;
   resultado.textContent='Consultando atendimentos…';
   try{
    const op=await pegar('/api/operador/estado');
    if(op.operador===true){
     const d=await pegar('/api/admin/akitemm/atendimentos');
     if(!Array.isArray(d.atendimentos))throw Error('LISTA_INDISPONIVEL');
     apresentar(d.atendimentos,true);
     resultado.textContent='Atendimentos da loja — visão do operador.';
     return;
    }
    const me=await pegar('/api/contas/me');
    if(typeof me.csrf!=='string'||me.csrf.length<20)
     throw Error('ENTRE_NA_CONTA_PARA_ATENDIMENTO');
    const d=await pegar('/api/loja/atendimentos');
    if(!Array.isArray(d.atendimentos))throw Error('LISTA_INDISPONIVEL');
    apresentar(d.atendimentos,false);
    const form=document.createElement('form');
    form.noValidate=true;
    const tlabel=document.createElement('label');
    tlabel.textContent='Assunto';
    const tipo=document.createElement('select');
    for(const [value,nome] of [
     ['PRODUTO','Dúvida sobre produto'],['PEDIDO','Pedido'],
     ['ENTREGA','Entrega'],['TROCAS','Trocas e devoluções'],
     ['OUTROS','Outros assuntos']
    ]){
     const opt=document.createElement('option');
     opt.value=value;opt.textContent=nome;tipo.append(opt);
    }
    tlabel.append(tipo);
    const mlabel=document.createElement('label');
    mlabel.textContent='Descreva sua dúvida ou solicitação';
    const mensagem=document.createElement('textarea');
    mensagem.required=true;mensagem.minLength=10;mensagem.maxLength=1500;
    mensagem.placeholder='Explique o que precisa, sem informar senhas ou dados bancários.';
    mlabel.append(mensagem);
    const enviar=document.createElement('button');enviar.type='submit';
    enviar.textContent='Abrir atendimento AKITEMM';
    form.append(tlabel,mlabel,enviar);
    conteudo.prepend(form);
    form.addEventListener('submit',async ev=>{
     ev.preventDefault();
     if(mensagem.value.trim().length<10){
      mensagem.setAttribute('aria-invalid','true');
      resultado.textContent='Descreva sua solicitação com pelo menos 10 caracteres.';
      mensagem.focus();mensagem.scrollIntoView({block:'center'});return;
     }
     mensagem.removeAttribute('aria-invalid');
     enviar.disabled=true;
     try{
      const r=await fetch('/api/loja/atendimentos',{
       method:'POST',credentials:'same-origin',
       headers:{'Content-Type':'application/json','X-Loop-Csrf':me.csrf},
       body:JSON.stringify({tipo:tipo.value,mensagem:mensagem.value.trim()})
      });
      const d=await r.json().catch(()=>({}));
      if(!r.ok||d.estado!=='ABERTO')
       throw Error(d.erro||'ATENDIMENTO_NAO_GRAVADO');
      resultado.textContent='Solicitação registrada com protocolo '+d.protocolo+'.';
      await carregar();
     }catch(e){resultado.textContent='Solicitação não registrada: '+e.message;}
     finally{enviar.disabled=false;}
    });
    resultado.textContent='Envie sua solicitação e acompanhe a resposta nesta área.';
   }catch(e){
    conteudo.replaceChildren();
    resultado.textContent='Atendimento disponível para clientes autenticados: '+
     (e.message==='CONSULTA_INDISPONIVEL'?'entre na sua conta.':e.message);
    const link=document.createElement('a');
    link.href='/escritorio';link.textContent='Entrar no Escritório Virtual';
    conteudo.append(link);
   }finally{carregando=false;atualizar.disabled=false;}
  }
  atualizar.addEventListener('click',()=>void carregar());
  suporte.addEventListener('toggle',()=>{if(suporte.open)void carregar();});
 }
 montarAtendimentoAkitemm();
 prepararLinkPessoal();
 // Somente o link do rodapé leva à administração protegida,
 // e apenas quando a sessão de operador é comprovada.
 async function atualizarAtalhoOperadorReal(){
  const linkRodape=document.querySelector('.akitemm-acesso-operador');
  if(!linkRodape)return;
  const exibir=permitido=>{
   operadorAtivo=permitido;
   // Voltar ao LOOP conserva a visão atual, como no botão equivalente.
   const voltarLoop=document.querySelector('.akitemm-voltar');
   if(voltarLoop)voltarLoop.href=permitido?
    '/escritorio?visao='+(visaoClienteLoja?'cliente':'operador'):
    '/minha-conta';
   linkRodape.hidden=!permitido||visaoClienteLoja;
   linkRodape.style.display=permitido&&!visaoClienteLoja?
    'inline-flex':'none';
  };
  try{
   const r=await fetch('/api/operador/estado',{
    credentials:'same-origin',cache:'no-store'
   });
   const d=r.ok?await r.json():null;
   exibir(d?.operador===true);
  }catch{exibir(false);}
 }
 void atualizarAtalhoOperadorReal();
 addEventListener('pageshow',()=>void atualizarAtalhoOperadorReal());
 addEventListener('focus',()=>void atualizarAtalhoOperadorReal());

 // Carrinho interno real: item e quantidade ficam no SQLite do titular.
 // Nao simula dinheiro, preço, frete, pagamento, ordem ou posicao LOOP.
 function renderizarCarrinho(c){
  if(c.fonte!=='CARRINHO_INTERNO_REAL'||c.checkoutReal!==false||
     c.financeiroReal!==false||c.precosConfirmados!==false||
     !Array.isArray(c.itens)||!Number.isSafeInteger(c.quantidadeTotal))
   throw Error('CARRINHO_INCONSISTENTE');
  quantidadesCarrinho.clear();
  const painel=$('itensLojaLoop');painel.replaceChildren();
  for(const item of c.itens){
   if(typeof item.produtoId!=='string'||
      !Number.isSafeInteger(item.quantidade)||item.quantidade<1||
      item.quantidade>50||typeof item.titulo!=='string')
    throw Error('CARRINHO_ITEM_INVALIDO');
   quantidadesCarrinho.set(item.produtoId,item.quantidade);
   const card=document.createElement('article');
   card.className='item-carrinho-loja';
   const icone=document.createElement('span');
   icone.className='akitemm-miniatura-carrinho';
   icone.textContent='▣';icone.setAttribute('aria-hidden','true');
   const infos=document.createElement('div');infos.className='akitemm-item-dados';
   const titulo=document.createElement('strong');titulo.textContent=item.titulo;
   const nota=document.createElement('small');
   nota.textContent=item.publicado?
    'Aguardando cotação real':'Produto temporariamente indisponível';
   infos.append(titulo,nota);
   const controles=document.createElement('div');
   controles.className='akitemm-controle-quantidade';
   const menos=document.createElement('button');
   menos.type='button';menos.textContent='−';
   menos.setAttribute('aria-label','Reduzir quantidade de '+item.titulo);
   const n=document.createElement('span');n.textContent=String(item.quantidade);
   const mais=document.createElement('button');
   mais.type='button';mais.textContent='+';
   mais.setAttribute('aria-label','Aumentar quantidade de '+item.titulo);
   mais.disabled=!item.publicado||item.quantidade>=50;
   menos.addEventListener('click',()=>void alterarCarrinho(
    item.produtoId,item.quantidade-1));
   mais.addEventListener('click',()=>void alterarCarrinho(
    item.produtoId,item.quantidade+1));
   controles.append(menos,n,mais);infos.append(controles);
   const remover=document.createElement('button');
   remover.type='button';remover.className='akitemm-item-remover';
   remover.textContent='×';
   remover.setAttribute('aria-label','Remover '+item.titulo+' do carrinho');
   remover.addEventListener('click',()=>void alterarCarrinho(item.produtoId,0));
   card.append(icone,infos,remover);painel.append(card);
  }
  if(!c.itens.length){
   const p=document.createElement('p');
   p.textContent='Seu carrinho está vazio.';painel.append(p);
  }
  $('akitemmTotalItens').textContent=String(c.quantidadeTotal);
  const total=$('totalLojaLoop');
  const valor=document.createElement('strong');
  valor.textContent='Aguardando cotação';
  total.replaceChildren(document.createTextNode('Subtotal'),valor);
  $('akitemmLimparCarrinho').disabled=!c.itens.length;
 }
 async function atualizarCarrinho(){
  if(visitante||operadorAtivo||!csrfLoja)return;
  try{
   const r=await fetch('/api/loja/carrinho',{
    credentials:'same-origin',cache:'no-store'
   });
   if(!r.ok)throw Error('CARRINHO_INDISPONIVEL');
   renderizarCarrinho(await r.json());
  }catch{
   $('akitemmLimparCarrinho').disabled=true;
   $('itensLojaLoop').textContent=
    'Carrinho indisponível nesta consulta. Nenhum pedido foi criado.';
  }
 }
 async function alterarCarrinho(produtoId,quantidade){
  if(visitante&&!operadorAtivo){solicitarCadastro();return;}
  if(operadorAtivo||!csrfLoja||carrinhoOcupado)return;
  carrinhoOcupado=true;
  for(const b of document.querySelectorAll('#itensLojaLoop button'))b.disabled=true;
  $('statusPedidoLoja').textContent='Salvando carrinho interno...';
  try{
   const r=await fetch('/api/loja/carrinho/itens',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json','X-Loop-Csrf':csrfLoja},
    body:JSON.stringify({produtoId,quantidade})
   });
   if(!r.ok)throw Error('CARRINHO_NAO_SALVO');
   renderizarCarrinho(await r.json());
   $('statusPedidoLoja').textContent=
    'Carrinho salvo na conta. Preços, frete e checkout aguardam integração externa.';
  }catch{
   $('statusPedidoLoja').textContent=
    'Não foi possível salvar o carrinho. Tente novamente.';
   await atualizarCarrinho();
  }finally{carrinhoOcupado=false;}
 }
 $('akitemmLimparCarrinho').addEventListener('click',async()=>{
  if(visitante||operadorAtivo||!csrfLoja||carrinhoOcupado)return;
  carrinhoOcupado=true;
  const btn=$('akitemmLimparCarrinho');
  btn.disabled=true;
  try{
   const r=await fetch('/api/loja/carrinho/limpar',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json','X-Loop-Csrf':csrfLoja},
    body:'{}'
   });
   if(!r.ok)throw Error('LIMPEZA_NAO_CONFIRMADA');
   renderizarCarrinho(await r.json());
   $('statusPedidoLoja').textContent='Carrinho esvaziado. Nenhum pedido foi criado.';
  }catch{
   $('statusPedidoLoja').textContent='Não foi possível limpar o carrinho.';
   await atualizarCarrinho();
  }finally{carrinhoOcupado=false;}
 });
 $('akitemmLimparCarrinho').disabled=true;

 // Nenhuma operação de compra pode ser ativada por código do navegador
 // enquanto não houver backend comercial com fornecedor e PSP homologados.
 for(const seletor of [
  '#akitemmCarregarMais',
  '#registrarPedidoLoja',
  '#akitemmEscolhaLoop input',
  '#copiarDivulgarLojaLoop','#akitemmFormEntrega input',
  '#akitemmFormEntrega button',
  '#akitemmAbrirAvaliacoes','#akitemmEnviarAvaliacao'
 ]){
  for(const elem of document.querySelectorAll(seletor)){
   elem.disabled=true;
   elem.setAttribute('aria-disabled','true');
  }
 }
 // O formulário de endereço já aprovado agora verifica região/frete.
 // Nunca salva endereço como pedido nem tenta acionar pagamento/posições.
 const formEntrega=$('akitemmFormEntrega');
 const statusEntrega=$('akitemmStatusEntrega');
 const botaoEntrega=formEntrega?.querySelector('button[type=submit]');
 const limparAvisoRegional=()=>{
  statusEntrega?.classList.remove('akitemm-alerta-regiao');
  statusEntrega?.setAttribute('role','status');
 };
 const inicializarEntrega=()=>{
  if(!formEntrega||!botaoEntrega||!statusEntrega)return;
  const explicacao=formEntrega.querySelector('p');
  if(explicacao)explicacao.textContent=
   'Informe seu endereço para verificar a entrega. A consulta ainda não finaliza nem registra um pedido.';
  botaoEntrega.textContent='Verificar região e frete';
  const permitir=!visitante&&!operadorAtivo;
  for(const field of formEntrega.querySelectorAll('input,select,textarea')){
   field.disabled=!permitir;
   if(permitir)field.removeAttribute('aria-disabled');
   else field.setAttribute('aria-disabled','true');
  }
  botaoEntrega.disabled=!permitir;
  if(permitir)botaoEntrega.removeAttribute('aria-disabled');
  else botaoEntrega.setAttribute('aria-disabled','true');
  if(!permitir)statusEntrega.textContent=operadorAtivo?
   'A consulta de endereço é exclusiva do cliente.':
   'Entre na sua conta para consultar entrega.';
 };
 if(formEntrega&&botaoEntrega){
  formEntrega.addEventListener('submit',async ev=>{
   ev.preventDefault();
   if(visitante){solicitarCadastro();return;}
   if(operadorAtivo||!csrfLoja){
    statusEntrega.textContent='Entre como cliente para consultar a entrega.';
    return;
   }
   if(!formEntrega.reportValidity())return;
   const cep=formEntrega.elements.namedItem('cep')?.value?.trim();
   if(typeof cep!=='string'||!/^[0-9]{5}-?[0-9]{3}$/.test(cep)){
    statusEntrega.textContent='Informe um CEP válido com 8 números.';return;
   }
   botaoEntrega.disabled=true;
   limparAvisoRegional();
   statusEntrega.textContent='Verificando entrega para o endereço informado...';
   try{
    const resp=await fetch('/api/loja/entrega/verificar-cep',{
     method:'POST',credentials:'same-origin',cache:'no-store',
     headers:{'Content-Type':'application/json','X-Loop-Csrf':csrfLoja},
     body:JSON.stringify({cep})
    });
    const dados=await resp.json().catch(()=>({}));
    if(resp.status===422&&dados.entregaDisponivel===false){
     const quantidade=Array.isArray(dados.produtosForaDaRegiao)?
      dados.produtosForaDaRegiao.length:1;
     statusEntrega.classList.add('akitemm-alerta-regiao');
     statusEntrega.setAttribute('role','alert');
     statusEntrega.textContent=quantidade>1?
      'Infelizmente, alguns produtos do seu carrinho não são entregues neste endereço. Confira outro CEP ou escolha outros produtos.':
      'Infelizmente, este produto não está disponível para entrega no endereço informado. Confira outro CEP ou escolha outro produto.';
     return;
    }
    if(!resp.ok)throw Error(dados.erro||'ENTREGA_NAO_VERIFICADA');
    if(dados.entregaDisponivel!==true||
       dados.checkoutReal!==false||
       dados.autorizaCobranca!==false)
     throw Error('ENTREGA_RESPOSTA_INCONSISTENTE');
    const cidade=String(dados.cidade||'');
    const uf=String(dados.uf||'');
    const inputCidade=formEntrega.elements.namedItem('cidade');
    const inputUf=formEntrega.elements.namedItem('uf');
    if(inputCidade)inputCidade.value=cidade;
    if(inputUf)inputUf.value=uf;
    const valor=Number.isSafeInteger(dados.taxaEntregaPropriaCentavos)&&
     dados.taxaEntregaPropriaCentavos>=0?
     new Intl.NumberFormat('pt-BR',{style:'currency',
      currency:'BRL'}).format(dados.taxaEntregaPropriaCentavos/100):null;
    let mensagem='Região atendida: '+cidade+' / '+uf+'. ';
    if(valor!==null)mensagem+='Taxa de entrega própria: '+valor+'. ';
    if(dados.requerOutraCotacao)
     mensagem+='Outros produtos ainda precisam de cotação de frete. ';
    mensagem+='Esta consulta não cria pedido nem libera pagamento.';
    limparAvisoRegional();
    statusEntrega.textContent=mensagem;
   }catch{
    statusEntrega.textContent=
     'Não foi possível verificar a entrega agora. Nenhum pedido foi criado.';
   }finally{
    botaoEntrega.disabled=visitante||operadorAtivo||!csrfLoja;
   }
  });
  for(const x of formEntrega.querySelectorAll('input[name=cep]')){
   x.addEventListener('input',()=>{
    limparAvisoRegional();statusEntrega.textContent='';
   });
  }
 }
 // Catálogo publicado pela administração, nunca produtos ou preços de demo.
 // Ativar somente os filtros de LEITURA, sem fazer carrinho/compra.
 let produtosPublicados=[],categoria='',cor='',termo='',filtroOfertas=false;
 // Dez abas, quatro fileiras de dez por aba; inicialmente duas
 // fileiras e o restante na expansão, sem recriar CSS ou molduras.
 let abaVitrine=0;
 const expandidas=new Set();
 const CORES=['ROXO','DOURADO','VERDE','CINZA',
  'CINZA','VERDE','DOURADO','ROXO'];
 let coresEspacos=Array.from({length:400},(_,i)=>CORES[i%8]);
 const corEspaco=n=>coresEspacos[n-1];
 const filtrar=()=>{
  const normal=x=>String(x||'').normalize('NFD')
   .replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  const itens=produtosPublicados.filter(p=>
   (!filtroOfertas||p.ofertaAtiva===true)&&
   (!categoria||(categoria==='cursos'&&['CURSO','PDF','DIGITAL'].includes(p.tipo))||
    (categoria==='fisicos'&&p.tipo==='FISICO')||
    (categoria==='novidades'&&p.novidade===true)||
    (categoria==='mais-vendidos'&&p.unidadesConfirmadas>0))&&
   (!cor||p.cor===cor)&&
   (!termo||normal(p.titulo+' '+p.descricao+' '+(p.corDescricao||'')).includes(normal(termo)))
  ).sort((a,b)=>categoria==='mais-vendidos'?
   b.unidadesConfirmadas-a.unidadesConfirmadas||
    a.titulo.localeCompare(b.titulo,'pt-BR'):
   categoria==='novidades'?
    b.criadoEm-a.criadoEm||
     a.titulo.localeCompare(b.titulo,'pt-BR'):0);
  const lista=$('catalogoLojaLoop');
  lista.replaceChildren();
  lista.classList.add('ak-vitrine-horizontal');
  $('akitemmVisualizacaoProduto').hidden=true;
  $('akitemmAreaProdutos').dataset.modo='lista';
  // Os 400 quadrinhos existem independentemente de produtos publicados.
  // Busca textual exige produto real; os demais filtros mantem molduras vazias.
  const filtrada=!!categoria||!!cor||!!termo||filtroOfertas;
  const produtosPorSlot=new Map(produtosPublicados.filter(p=>
   Number.isSafeInteger(p.posicaoVitrine)&&
   p.posicaoVitrine>=1&&p.posicaoVitrine<=400).map(p=>
   [p.posicaoVitrine,p]));
  const idsFiltrados=new Set(itens.map(p=>p.produtoId));
  const slotsVisiveis=Array.from({length:400},(_,i)=>i+1).filter(n=>{
   const produto=produtosPorSlot.get(n);
   if(produto)return idsFiltrados.has(produto.produtoId);
   if(termo)return false;
   return !cor||corEspaco(n)===cor;
  });
  const totalAbas=filtrada?Math.max(1,Math.ceil(slotsVisiveis.length/40)):10;
  if(abaVitrine>=totalAbas)abaVitrine=0;
  let nav=$('akitemmAbasProdutos');
  if(!nav){
   nav=document.createElement('nav');nav.id='akitemmAbasProdutos';
   nav.setAttribute('aria-label','Abas de produtos AKITEMM');
   $('akitemmCarregarMais').after(nav);
  }
  nav.replaceChildren();
  for(let n=0;n<totalAbas;n++){
   const btn=document.createElement('button');
   btn.type='button';btn.textContent=String(n+1);
   btn.setAttribute('aria-label','Aba '+(n+1)+' de '+totalAbas);
   if(n===abaVitrine)btn.setAttribute('aria-current','page');
   btn.addEventListener('click',()=>{
    abaVitrine=n;filtrar();
    $('akitemmAreaProdutos').scrollIntoView({block:'start'});
   });
   nav.append(btn);
  }
  const expandida=expandidas.has(abaVitrine);
  const linhas=expandida?4:2;
  const botaoMais=$('akitemmCarregarMais');
  botaoMais.hidden=filtrada?slotsVisiveis.length<=abaVitrine*40+20:false;
  botaoMais.disabled=false;
  botaoMais.setAttribute('aria-disabled','false');
  botaoMais.textContent=expandida?
   'Mostrar menos produtos ↑':'Mostrar mais produtos ↓';
  const faixas=[];
  for(let linha=0;linha<linhas;linha++){
   const faixa=document.createElement('div');
   faixa.className='ak-faixa-horizontal';
   faixa.tabIndex=0;faixa.setAttribute('role','group');
   faixa.setAttribute('aria-label','Fileira '+(linha+1)+
    ' da aba '+(abaVitrine+1)+'; arraste horizontalmente');
   lista.append(faixa);faixas.push(faixa);
  }
  const inicio=abaVitrine*40,ate=Math.min(slotsVisiveis.length,inicio+linhas*10);
  for(let indice=inicio;indice<ate;indice++){
   const slot=slotsVisiveis[indice];
   const p=produtosPorSlot.get(slot);
   const alvo=faixas[Math.floor((indice-inicio)/10)];
   if(!p){
    const corSlot=corEspaco(slot);
    const card=document.createElement('article');
    card.className='produto-loja-loop akitemm-slot-vazio akitemm-slot-'+
     corSlot.toLowerCase();
    card.dataset.akitemmSlot=String(slot);
    card.tabIndex=0;
    card.setAttribute('aria-label','Espaço '+slot+
     ' disponível para produto na aba '+(abaVitrine+1));
    const imagem=document.createElement('div');
    imagem.className='akitemm-imagem-produto';
    const simbolo=document.createElement('span');
    simbolo.className='akitemm-slot-icone';simbolo.textContent='+';
    simbolo.setAttribute('aria-hidden','true');
    imagem.append(simbolo);
    const detalhes=document.createElement('div');
    detalhes.className='akitemm-dados-produto';
    const titulo=document.createElement('strong');
    titulo.textContent='Espaço disponível';
    const subtitulo=document.createElement('small');
    subtitulo.textContent=filtroOfertas?'Sem oferta publicada':
     categoria?'Aguardando produto desta categoria':
     'Aguardando produto cadastrado';
    detalhes.append(titulo,subtitulo);card.append(imagem,detalhes);
    alvo.append(card);continue;
   }
   const card=document.createElement('article');
   card.className='produto-loja-loop '+(p.cor==='ROXO'?
    'produto-loja-loop-especial':p.cor==='DOURADO'?
     'produto-loja-loop-dourado':p.cor==='VERDE'?
      'produto-loja-loop-elegivel':'produto-loja-loop-nao-elegivel');
   card.dataset.produtoId=p.produtoId;
   card.dataset.akitemmOrdem=String(p.posicaoVitrine);
   card.tabIndex=0;card.setAttribute('role','group');
   card.setAttribute('aria-label','Produto '+p.titulo);
   const imagem=document.createElement('div');
   imagem.className='akitemm-imagem-produto';
   const foto=p.fotos?.find(x=>x&&x.posicao===1)||
    (Array.isArray(p.fotos)?p.fotos[0]:null);
   const esperado='/api/loja/produtos/'+p.produtoId+'/foto/';
   if(foto&&typeof foto.url==='string'&&
      foto.url===esperado+foto.posicao&&
      Number.isSafeInteger(foto.posicao)&&foto.posicao>=1&&foto.posicao<=10){
    const img=document.createElement('img');
    img.src=foto.url;img.alt='Fotografia de '+p.titulo;
    img.loading='lazy';img.decoding='async';imagem.append(img);
   }
   const detalhes=document.createElement('div');
   detalhes.className='akitemm-dados-produto';
   const tipo=document.createElement('p');
   tipo.className='tipo-loja-loop';
   tipo.textContent=p.tipo==='FISICO'?'Produto físico':'Produto';
   const titulo=document.createElement('h3');titulo.textContent=p.titulo;
   const precoAtual=Number.isSafeInteger(p.precoAnunciadoCentavos)&&
    p.precoAnunciadoCentavos>0?p.precoAnunciadoCentavos:null;
   const precoOriginal=Number.isSafeInteger(p.precoOriginalAnunciadoCentavos)&&
    p.precoOriginalAnunciadoCentavos>precoAtual?
     p.precoOriginalAnunciadoCentavos:null;
   const formatarReais=n=>new Intl.NumberFormat('pt-BR',{
    style:'currency',currency:'BRL'}).format(n/100);
   const painelPreco=document.createElement('div');
   painelPreco.className='akitemm-preco-anuncio';
   if(precoAtual!==null){
    if(precoOriginal!==null){
     const anterior=document.createElement('del');
     anterior.textContent=formatarReais(precoOriginal);
     painelPreco.append(anterior);
    }
    const valor=document.createElement('strong');
    valor.textContent=formatarReais(precoAtual);
    painelPreco.append(valor);
    if(precoOriginal!==null){
     const oferta=document.createElement('small');
     oferta.textContent='Preço promocional';
     painelPreco.append(oferta);
    }
   }
   if(p.marcaVitrine){
    const marca=document.createElement('small');
    marca.textContent='Marca: '+p.marcaVitrine;
    painelPreco.append(marca);
   }
   if(typeof p.corDescricao==='string'&&p.corDescricao){
    const corFisica=document.createElement('small');
    corFisica.textContent='Cor do produto: '+p.corDescricao;
    painelPreco.append(corFisica);
   }
   const descricao=document.createElement('p');
   descricao.className='akitemm-descricao';
   descricao.textContent=p.descricao||'Informações comerciais em preparação.';
   const status=document.createElement('p');
   status.textContent='Frete consultado no carrinho · compra indisponível até integração comercial';
   const botao=document.createElement('button');
   botao.type='button';botao.className='botao-secundario-loja';
   botao.textContent='Ver detalhes';
   botao.addEventListener('click',()=>{
    const detalhe=$('akitemmProdutoInlineConteudo');
    const tela=$('akitemmVisualizacaoProduto');
    const area=$('akitemmAreaProdutos');
    detalhe.replaceChildren();
    const topo=document.createElement('h2');topo.textContent=p.titulo;
    detalhe.append(topo);
    const principal=document.createElement('div');
    principal.className='akitemm-detalhe-conteudo';
    const galeria=document.createElement('div');
    galeria.className='akitemm-detalhe-galeria';
    const fotos=(Array.isArray(p.fotos)?p.fotos:[]).filter(f=>
     f&&Number.isSafeInteger(f.posicao)&&f.posicao>=1&&f.posicao<=10&&
     f.url==='/api/loja/produtos/'+p.produtoId+'/foto/'+f.posicao
    ).sort((a,b)=>a.posicao-b.posicao);
    if(fotos.length){
     const destaque=document.createElement('img');
     destaque.className='akitemm-detalhe-foto-principal';
     destaque.src=fotos[0].url;destaque.alt='Foto principal de '+p.titulo;
     galeria.append(destaque);
     if(fotos.length>1){
      const miniaturas=document.createElement('div');
      miniaturas.className='akitemm-detalhe-miniaturas';
      for(const foto of fotos){
       const troca=document.createElement('button');
       troca.type='button';
       troca.setAttribute('aria-label','Ver foto '+foto.posicao+' de '+p.titulo);
       const mini=document.createElement('img');
       mini.src=foto.url;mini.alt='Foto '+foto.posicao;
       mini.loading='lazy';troca.append(mini);
       troca.addEventListener('click',()=>{
        destaque.src=foto.url;
        destaque.alt='Foto '+foto.posicao+' de '+p.titulo;
       });
       miniaturas.append(troca);
      }
      galeria.append(miniaturas);
     }
    }else{
     const aviso=document.createElement('p');
     aviso.textContent='Fotografias ainda não disponíveis.';
     galeria.append(aviso);
    }
    const dados=document.createElement('div');
    dados.className='akitemm-detalhe-dados';
    const valor=document.createElement('div');
    valor.className='akitemm-detalhe-preco';
    if(precoOriginal!==null){
     const anterior=document.createElement('del');
     anterior.textContent=formatarReais(precoOriginal);
     valor.append(anterior);
    }
    const atual=document.createElement('strong');
    atual.textContent=precoAtual!==null?
     formatarReais(precoAtual):'Preço a informar';
    valor.append(atual);dados.append(valor);
    for(const [etiqueta,valor] of [
     ['Produto: ',p.titulo],
     ['Descrição: ',p.descricao||'Em preparação'],
     ['Categoria: ',p.categoriaVitrine||'Não informada'],
     ['Marca: ',p.marcaVitrine||'Não informada'],
     ['Situação: ','Frete e compra dependem da integração comercial.'],
     ['Entrega: ','Informe o endereço no carrinho para verificar a região atendida.'],
     ['Compra: ','Indisponível até liberação comercial.']
    ]){
     const linha=document.createElement('p');
     const forte=document.createElement('strong');forte.textContent=etiqueta;
     linha.append(forte,document.createTextNode(valor));dados.append(linha);
    }
    const adicionar=document.createElement('button');
    adicionar.type='button';adicionar.className='botao-secundario-loja';
    adicionar.textContent='Adicionar ao carrinho';
    adicionar.disabled=operadorAtivo;
    if(operadorAtivo)adicionar.title='Carrinho disponível apenas para clientes';
    adicionar.setAttribute('aria-label','Adicionar '+p.titulo+' ao carrinho');
    const retorno=document.createElement('small');
    retorno.textContent='Sem cotação, cobrança ou pedido até a integração comercial.';
    adicionar.addEventListener('click',()=>{
     if(visitante&&!operadorAtivo){solicitarCadastro();return;}
     const atual=quantidadesCarrinho.get(p.produtoId)||0;
     if(atual>=50){
      retorno.textContent='Limite de 50 unidades por produto.';return;
     }
     void alterarCarrinho(p.produtoId,atual+1);
    });
    dados.append(adicionar,retorno);
    principal.append(galeria,dados);detalhe.append(principal);
    const avaliacoes=document.createElement('section');
    avaliacoes.className='akitemm-detalhe-avaliacoes';
    const h=document.createElement('h3');h.textContent='Avaliações de compradores';
    const lista=document.createElement('div');
    lista.setAttribute('aria-live','polite');
    lista.textContent='Consultando avaliações verificadas...';
    avaliacoes.append(h,lista);detalhe.append(avaliacoes);
    area.dataset.modo='detalhe';
    tela.hidden=false;
    tela.scrollIntoView({block:'start'});
    void (async()=>{
     try{
      const r=await fetch('/api/loja/produtos/'+
       encodeURIComponent(p.produtoId)+'/avaliacoes',{
       credentials:'same-origin',cache:'no-store'
      });
      if(!r.ok)throw Error('AVALIACOES_INDISPONIVEIS');
      const a=await r.json();
      if(tela.hidden||detalhe.querySelector('.akitemm-detalhe-avaliacoes')!==
         avaliacoes)return;
      if(a.origem!=='COMPRAS_VERIFICADAS'||!Array.isArray(a.avaliacoes))
       throw Error('AVALIACOES_INVALIDAS');
      lista.replaceChildren();
      if(!a.avaliacoes.length){
       lista.textContent='Ainda não há avaliações de compras verificadas.';
      }else{
       for(const review of a.avaliacoes){
        if(review.compraVerificada!==true||
           !Number.isSafeInteger(review.nota)||review.nota<1||
           review.nota>5||typeof review.comentario!=='string')
         continue;
        const item=document.createElement('article');
        const nome=document.createElement('strong');
        nome.textContent=review.nome+' · '+review.nota+'/5 estrelas';
        const comentario=document.createElement('p');
        comentario.textContent=review.comentario;
        item.append(nome,comentario);lista.append(item);
       }
      }
     }catch{
      if(!tela.hidden&&detalhe.contains(avaliacoes))
       lista.textContent='Avaliações indisponíveis nesta consulta.';
     }
    })();
   });
   detalhes.append(tipo,titulo,painelPreco,descricao,status,botao);
   // Toque no cartão inteiro abre a ficha para o cliente;
   // o operador mantém o toque para editar sem mudar as molduras.
   card.addEventListener('click',ev=>{
    if(operadorAtivo||ev.target.closest('button,a,input,select,textarea'))return;
    botao.click();
   });
   card.addEventListener('keydown',ev=>{
    if(operadorAtivo||ev.target!==card||
       (ev.key!=='Enter'&&ev.key!==' '))return;
    ev.preventDefault();botao.click();
   });
   card.append(imagem,detalhes);alvo.append(card);
  }
  $('akitemmResultadoProdutos').textContent=filtrada?
   (itens.length?itens.length+' resultado(s) para os filtros selecionados.':
    termo?'Nenhum produto encontrado para esta busca.':
    filtroOfertas?'Nenhuma oferta publicada neste filtro.':
    'Nenhum produto publicado neste filtro.'):
   itens.length+' produto(s) publicado(s); dez abas com quarenta espaços cada.';
  $('akitemmFiltroTodos').setAttribute('aria-pressed',
   String(!categoria&&!cor&&!termo&&!filtroOfertas));
  $('akitemmFiltroOfertas').setAttribute('aria-pressed',String(filtroOfertas));
  for(const b of document.querySelectorAll('[data-akitemm-cor]'))
   b.setAttribute('aria-pressed',String(b.dataset.akitemmCor===cor&&!!cor));
  for(const b of document.querySelectorAll('[data-akitemm-categoria]')){
   const selecionada=b.dataset.akitemmCategoria===categoria&&!!categoria;
   b.setAttribute('aria-pressed',String(selecionada));
   b.classList.toggle('ativo',selecionada);
  }
 };
 $('akitemmCarregarMais').addEventListener('click',()=>{
  if(expandidas.has(abaVitrine))expandidas.delete(abaVitrine);
  else expandidas.add(abaVitrine);
  filtrar();
 });
 const filtroTodos=()=>{
  categoria='';cor='';termo='';filtroOfertas=false;abaVitrine=0;
  $('akitemmBusca').value='';
  filtrar();
 };
 $('akitemmFiltroTodos').addEventListener('click',filtroTodos);
 $('akitemmFiltroOfertas').addEventListener('click',()=>{
  filtroOfertas=!filtroOfertas;abaVitrine=0;filtrar();
 });
 $('akitemmVerTodos').addEventListener('click',filtroTodos);
 $('akitemmVoltarProdutos').addEventListener('click',()=>{
  $('akitemmVisualizacaoProduto').hidden=true;
  $('akitemmAreaProdutos').dataset.modo='lista';
  $('catalogoLojaLoop').scrollIntoView({block:'nearest'});
 });
 $('akitemmBusca').addEventListener('input',e=>{
  termo=e.target.value.trim().slice(0,120);abaVitrine=0;filtrar();
 });
 for(const b of document.querySelectorAll('[data-akitemm-cor]')){
  b.addEventListener('click',()=>{
   cor=cor===b.dataset.akitemmCor?'':b.dataset.akitemmCor;
   abaVitrine=0;filtrar();
  });
 }
 for(const b of document.querySelectorAll('[data-akitemm-categoria]')){
  b.addEventListener('click',()=>{
   categoria=categoria===b.dataset.akitemmCategoria?'':
    b.dataset.akitemmCategoria;abaVitrine=0;filtrar();
  });
 }
 async function atualizarCatalogo(){
  const botao=$('atualizarCatalogoLoja');
  if(botao)botao.disabled=true;
  try{
   const r=await fetch('/api/loja/catalogo',{
    credentials:'same-origin',cache:'no-store'
   });
   if(!r.ok)throw Error('CATALOGO_NAO_HOMOLOGADO');
   const dados=await r.json();
   if(dados.origem!=='CATALOGO_ADMINISTRATIVO_PUBLICADO'||
      dados.checkoutReal!==false||dados.estoqueConfirmado!==false||
      dados.precosNaoHomologados!==true||
      !dados.layoutVazio||!Array.isArray(dados.layoutVazio.cores)||
      dados.layoutVazio.cores.length!==400||
      !Number.isSafeInteger(dados.layoutVazio.revisao)||
      dados.layoutVazio.revisao<1||
      dados.layoutVazio.cores.some(c=>!CORES.includes(c))||
      !Array.isArray(dados.produtos)||dados.produtos.length>400||
      dados.produtos.some(p=>
       typeof p.produtoId!=='string'||typeof p.titulo!=='string'||
       typeof p.descricao!=='string'||p.compravel!==false||
       p.checkoutReal!==false||p.precoCentavos!==null||
       p.estoqueConfirmado!==false||p.tipo!=='FISICO'||
       typeof p.novidade!=='boolean'||
       !Number.isSafeInteger(p.criadoEm)||
       !Number.isSafeInteger(p.unidadesConfirmadas)||
       p.unidadesConfirmadas<0||
       (p.precoAnunciadoCentavos!==undefined&&
         p.precoAnunciadoCentavos!==null&&
         (!Number.isSafeInteger(p.precoAnunciadoCentavos)||
          p.precoAnunciadoCentavos<1))||
       (p.precoOriginalAnunciadoCentavos!==undefined&&
         p.precoOriginalAnunciadoCentavos!==null&&
         (!Number.isSafeInteger(p.precoOriginalAnunciadoCentavos)||
          p.precoOriginalAnunciadoCentavos<=p.precoAnunciadoCentavos))||
       !['CINZA','VERDE','DOURADO','ROXO'].includes(p.cor)))
    throw Error('CATALOGO_FORA_DO_CONTRATO');
   coresEspacos=dados.layoutVazio.cores.slice();
   produtosPublicados=dados.produtos;
   const ativo=produtosPublicados.length>0;
   // Filtros e categorias sao navegação de leitura: funcionam mesmo com
   // catálogo vazio. Apenas checkout e compra continuam indisponíveis.
   for(const node of [
    $('akitemmBusca'),$('akitemmVerTodos'),$('akitemmFiltroOfertas'),
    ...document.querySelectorAll('[data-akitemm-cor]'),
    ...document.querySelectorAll('[data-akitemm-categoria]')
   ]){
    node.disabled=false;
    node.removeAttribute('aria-disabled');
   }
   $('referenciaLojaLoop').textContent=ativo?
    'Produtos da AKITEMM. Preços informados pelo operador são anúncios; frete e checkout aguardam a integração comercial.':
    'Nenhum produto publicado. Compras e pagamentos reais indisponíveis.';
   filtrar();
  }catch{
   produtosPublicados=[];filtrar();
   $('akitemmResultadoProdutos').textContent=
    'Catálogo indisponível. Nenhum produto fictício será exibido.';
  }finally{if(botao)botao.disabled=false;}
 }
 $('atualizarCatalogoLoja').addEventListener('click',
  ()=>void atualizarCatalogo());
 // Atualização interna direta do operador: funciona mesmo durante
 // o estado disabled do botão visível usado para recarregar a loja.
 window.addEventListener('akitemm:catalogo-atualizar',
  ()=>void atualizarCatalogo());

 const progresso=$('progressoMinimoLoop')?.closest('.akitemm-progresso');
 if(progresso)progresso.hidden=true;
 const escolha=$('akitemmEscolhaLoop');
 if(escolha)escolha.hidden=true;
 const cartStatus=$('statusPedidoLoja');
 if(cartStatus)cartStatus.textContent='O checkout real ainda não foi liberado.';
 if($('referenciaLojaLoop'))
  $('referenciaLojaLoop').textContent=
   'Produtos, pedidos e pagamentos reais só estarão disponíveis após integração comercial.';
 if($('akitemmResultadoProdutos'))
  $('akitemmResultadoProdutos').textContent='Nenhum produto comercial disponível.';
 if($('catalogoLojaLoop'))$('catalogoLojaLoop').replaceChildren();
 if($('itensLojaLoop'))$('itensLojaLoop').replaceChildren();
 if($('pedidosLojaLoop'))$('pedidosLojaLoop').replaceChildren();
 if($('totalLojaLoop'))$('totalLojaLoop').textContent='Subtotal R$ 0,00';
 if($('akitemmTotalItens'))$('akitemmTotalItens').textContent='0';
 if($('conteudoLojaLoop'))$('conteudoLojaLoop').hidden=false;
 // Aproveita a seção "Meus Pedidos" já aprovada. Somente dados reais do
 // titular; sem backend comercial conectado não mostra pedidos fictícios.
 async function atualizarPedidos(){
  if(operadorAtivo){
   const pedidos=$('pedidosLojaLoop');
   if(pedidos){
    pedidos.replaceChildren();
    const aviso=document.createElement('li');
    aviso.textContent='Pedidos individuais não são exibidos na visualização do cliente.';
    pedidos.append(aviso);
   }
   return;
  }
  if(visitante){solicitarCadastro();return;}
  const lista=$('pedidosLojaLoop');
  if(!lista)return;
  lista.replaceChildren();
  const botao=$('atualizarPedidosLoja');
  if(botao)botao.disabled=true;
  try{
   const resposta=await fetch('/api/loja/pedidos',{
    credentials:'same-origin',cache:'no-store'
   });
   if(resposta.status===401){solicitarCadastro();return;}
   if(resposta.status===503){
    const item=document.createElement('li');
    item.textContent='Acompanhamento de pedidos reais ainda não habilitado.';
    lista.appendChild(item);return;
   }
   if(!resposta.ok)throw Error('PEDIDOS_INDISPONIVEIS');
   const dados=await resposta.json();
   if(!Array.isArray(dados.pedidos)||
      dados.fonte!=='PEDIDOS_COMERCIAIS_DO_TITULAR')
    throw Error('PEDIDOS_INVALIDOS');
   if(dados.pedidos.length===0){
    const li=document.createElement('li');
    li.textContent='Nenhum pedido comercial registrado nesta conta.';
    lista.appendChild(li);
   }
   const dinheiro=new Intl.NumberFormat('pt-BR',{
    style:'currency',currency:'BRL'
   });
   for(const pedido of dados.pedidos){
    const li=document.createElement('li');
    const remessas=(pedido.remessas||[]).map(x=>
     x.fornecedorId+': '+x.estado
    ).join(' · ');
    li.textContent='Pedido '+pedido.pedidoId+' · '+
     pedido.status+' · '+dinheiro.format(pedido.valorTotalCentavos/100)+
     (remessas?' · Remessas: '+remessas:'');
    lista.appendChild(li);
   }
  }catch{
   const li=document.createElement('li');
   li.textContent='Não foi possível consultar os pedidos agora.';
   lista.appendChild(li);
  }finally{if(botao)botao.disabled=false;}
 }
 const botaoPedidos=$('atualizarPedidosLoja');
 if(botaoPedidos)botaoPedidos.addEventListener('click',()=>{void atualizarPedidos();});
 try{
  // A sessao administrativa autentica o modo da loja mesmo quando o
  // navegador ainda tem um cookie antigo de cliente: nunca misturar perfis.
  await atualizarAtalhoOperadorReal();
  const res=await fetch('/api/contas/me',{
   credentials:'same-origin',cache:'no-store'
  });
  const semCliente=res.status===401||operadorAtivo;
  if(semCliente){
   visitante=!operadorAtivo;clienteNick=null;csrfLoja=null;
   prepararLinkPessoal();
   if($('akitemmNomeTitular'))
    $('akitemmNomeTitular').textContent=visitante?'Visitante':
     visaoClienteLoja?'VISÃO DO CLIENTE':'OPERADOR';
   if(visitante){
    informar('AKITEMM · vitrine aberta'+
     (indicadorNick?' · convite de @'+nickVisivel(indicadorNick):'')+
     '. Para criar sua conta, toque em Minha conta.');
    const conta=$('akitemmEditarConta');
    if(conta)conta.href=destinoCadastro();
    const voltar=document.querySelector('.akitemm-voltar');
    if(voltar)voltar.href=destinoCadastro();
   }else informar(visaoClienteLoja?
    'AKITEMM · visualização pública da loja. Nenhuma conta pessoal foi acessada.':
    'AKITEMM: catálogo do operador. Pagamentos e pedidos de clientes bloqueados.');
  }else{
   visitante=false;
   if(!res.ok)throw Error('IDENTIDADE_INDISPONIVEL');
   const me=await res.json();
   if(typeof me.nick!=='string'||me.financeiroReal!==false)
    throw Error('IDENTIDADE_INCOMPATIVEL');
   clienteNick=me.nick;csrfLoja=me.csrf;prepararLinkPessoal();
   if($('akitemmNomeTitular'))$('akitemmNomeTitular').textContent=nickVisivel(me.nick);
   informar('AKITEMM: loja conectada à sua conta LOOP. Vendas reais ainda não liberadas.');
  }
  // Apenas cliente autenticado pode consultar dados de suas posicoes.
  // Operador nunca se apropria do cookie de um titular anterior.
  if(!operadorAtivo)try{
   const respostaCapacidade=await fetch('/api/loja/capacidade',{
    credentials:'same-origin',cache:'no-store'
   });
   if(respostaCapacidade.ok){
    const capacidade=await respostaCapacidade.json();
    if(capacidade.fonte==='MOTOR_E_RESERVAS_SQLITE'&&
       capacidade.checkoutReal===false&&
       Number.isSafeInteger(capacidade.ativas)&&
       Number.isSafeInteger(capacidade.reservadas)&&
       Number.isSafeInteger(capacidade.disponiveis)&&
       capacidade.ativas+capacidade.reservadas+capacidade.disponiveis===10)
     informar('AKITEMM · capacidade técnica da sua conta: '+
      capacidade.ativas+' posição(ões) ativas, '+
      capacidade.reservadas+' reservada(s), '+
      capacidade.disponiveis+' disponível(is) no motor. '+
      'Checkout e pagamentos reais ainda não habilitados.');
   }
  }catch{
   // Indisponibilidade da leitura nao libera compra nem muda as regras.
  }
  inicializarEntrega();
  await sincronizarFotoLoja();
  if(!semCliente&&!operadorAtivo)await atualizarPedidos();
  else $('pedidosLojaLoop')?.replaceChildren();
  await atualizarCatalogo();
  if(!visitante&&!operadorAtivo)await atualizarCarrinho();
 }catch{
  // A falha de identidade nao fecha a vitrine: dados privados seguem
  // inacessiveis e so a leitura publica de produtos permanece permitida.
  visitante=true;clienteNick=null;csrfLoja=null;prepararLinkPessoal();
  inicializarEntrega();
  await sincronizarFotoLoja();
  informar('AKITEMM · vitrine pública disponível. Entre na sua conta para ações pessoais.');
  if($('conteudoLojaLoop'))$('conteudoLojaLoop').hidden=false;
  await atualizarCatalogo();
 }
})();
