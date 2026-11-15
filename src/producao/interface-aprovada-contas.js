'use strict';
// Usa DOM, classes e identidade visual já aprovados do escritório LOOP.
// Não há catálogo, motor ou dinheiro "mock" nesta conta: áreas ainda não
// homologadas ficam inativas, sem exibir saldos ou posições fictícias.
(()=>{
 const $=id=>document.getElementById(id);
 const API='/api/contas';
 let csrf=null,documentos=null,carregando=false,tela='login';
 let captchaCadastroId=null,captchaObrigatorio=false;
 let captchaLoginAtivo=false,captchaLoginId=null;
 const ref=new URLSearchParams(location.search).get('ref');
 const indicadorNick=typeof ref==='string'&&/^[A-Za-z]{1,12}$/.test(ref)?
  ref.toLowerCase():null;
 let titularesIndicados=[],redePaginando=false;
 let posicaoSelecionada='';
 let nickResumoReal='';
 let posicoesResumoReal=[],popupPosicoesRealAberto=false;
 let sequenciaLeituraFilas=0;
 let filaSelecionada=null;
 const carregarPaginaFila={A:null,B:null};
 let finOrigemReal='BONUS_INDICACAO',ensaioFinanceiroAtivo=false;
 let somentePosicoesPeloQuadrado=false,proximaAbaVemDoQuadrado=false;
 let origemLinks=null;
 const codigos={
  CREDENCIAIS_INVALIDAS:'Confira seu nick e sua senha.',
  SENHA_ATUAL_INCORRETA:'Senha atual incorreta.',
  CONTA_BLOQUEADA:'Muitas tentativas. Aguarde 15 minutos.',
  ACESSO_TEMPORARIAMENTE_LIMITADO:'Muitos acessos. Aguarde um momento.',
  CADASTRO_EXISTENTE:'Este nick ou e-mail já está cadastrado.',
  NICK_INVALIDO:'O nick deve ter de 1 a 12 letras.',
  NOME_INVALIDO:'Verifique seu nome.',
  EMAIL_INVALIDO:'Verifique o e-mail informado.',
  SENHA_INVALIDA:'Escolha uma senha de 12 a 128 caracteres.',
  CONFIRMACAO_SENHA_INVALIDA:'Confirme a senha escolhida.',
  CPF_INVALIDO:'Confira o CPF informado.',
  TELEFONE_INVALIDO:'Confira o telefone com DDD.',
  CONTATO_CADASTRO_INCOMPLETO:'Informe CPF e telefone.',
  DOCUMENTOS_ALTERADOS_RELER:'Documentos atualizados. Leia e aceite a versão atual.',
  CAPTCHA_INVALIDO:'Confira o código de verificação e tente outro.',
  CAPTCHA_LOGIN_OBRIGATORIO:'Confirme o código de segurança para entrar novamente.',
  CAPTCHA_OCUPADO:'Proteção contra robôs temporariamente ocupada. Atualize o código.',
  CODIGO_INVALIDO:'Código inválido ou expirado.',
  SENHA_NOVA_DEVE_SER_DIFERENTE:'A nova senha deve ser diferente.',
  CADASTRO_INATIVO:'A abertura do cadastro ainda não foi autorizada.',
  OPERACAO_INDISPONIVEL:'Esta operação ainda não está disponível.',
  ENVIO_EMAIL_NAO_CONFIRMADO:'Não foi possível confirmar o envio do código.',
  CSRF_INVALIDO:'Sua sessão expirou. Entre novamente.',
  INDICADOR_INVALIDO:'O link de convite contém um nick inválido.',
  INDICADOR_NAO_ENCONTRADO:'Este convite não pertence a uma conta cadastrada.',
  AUTOINDICACAO_PROIBIDA:'Não é possível indicar a própria conta.'
 };
 const erro=e=>codigos[e?.message]||
  'Não foi possível concluir esta operação. Confira os dados e tente novamente.';
 const dizer=msg=>{$('mensagem').textContent=msg;};
 async function requisitar(rota,{method='GET',body,csrfObrigatorio=false}={}){
  const res=await fetch(API+rota,{
   method,credentials:'same-origin',cache:'no-store',
   headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),
    ...(csrfObrigatorio?{'X-Loop-Csrf':csrf}:{})},
   ...(body!==undefined?{body:JSON.stringify(body)}:{})
  });
  const dados=await res.json().catch(()=>({}));
  if(!res.ok){const e=new Error(dados.erro||'OPERACAO_INDISPONIVEL');
   e.status=res.status;throw e;}
  return dados;
 }
 function mostrarLogin(t){
  tela=t;
  $('painelLogin').hidden=t!=='login';
  $('painelCadastro').hidden=t!=='cadastro';
  $('painelRecuperacao').hidden=t!=='recuperacao';
  $('painelConta').hidden=true;
  document.body.classList.remove('loop03-logado');
  fecharDadosRodapeReal();
  $('loop03RodapeFilaIntegrado').hidden=true;
  $('loop03RodapeCoroaIntegrado').hidden=true;
  $('erroLogin').hidden=true;$('erroCadastro').hidden=true;
  const aviso=$('cadastroIndicadorAviso');
  if(aviso){
   aviso.hidden=!indicadorNick;
   aviso.textContent=indicadorNick?
    'Cadastro pelo convite de @'+indicadorNick+
    '. A indicação só será válida após uma compra confirmada.':'';
  }
 }
 function fecharDadosRodapeReal(){
  $('loop03DadosRapidos').hidden=true;
  $('loop03AbrirPerfil').setAttribute('aria-expanded','false');
  for(const id of ['loop03PerfilNome','loop03PerfilNick',
   'loop03PerfilEmail','loop03PerfilCpf'])$(id).textContent='—';
  $('loop03PerfilLinhaCpf').hidden=true;
 }
 async function alternarDadosRodapeReal(){
  const painel=$('loop03DadosRapidos');
  if(!painel.hidden){fecharDadosRodapeReal();return;}
  painel.hidden=false;$('loop03AbrirPerfil').setAttribute('aria-expanded','true');
  try{
   const d=await requisitar('/meus-dados');
   if(painel.hidden)return;
   for(const [id,chave] of [['loop03PerfilNome','nome'],
    ['loop03PerfilNick','nick'],['loop03PerfilEmail','email']])
    $(id).textContent=typeof d[chave]==='string'?d[chave]:'—';
   const ok=d.cpfConfirmado===true&&
    typeof d.cpfExibicao==='string'&&d.cpfExibicao.length>0;
   $('loop03PerfilLinhaCpf').hidden=!ok;
   $('loop03PerfilCpf').textContent=ok?d.cpfExibicao:'—';
  }catch{
   if(!painel.hidden)$('loop03PerfilNome').textContent='Dados indisponíveis.';
  }
 }
 function sincronizarFotoRodapeReal(){
  const topo=$('loop03ImagemFotoTopo'),rodape=$('loop03ImagemFotoRodape');
  // O serviço real ainda não possui custódia de fotos. Não depender
  // de elemento removido do HTML por esse adaptador.
  const ok=!!topo&&!topo.hidden&&!!topo.getAttribute('src');
  if(ok)rodape.src=topo.src;else rodape.removeAttribute('src');
  rodape.hidden=!ok;$('loop03AvatarRodapeVazio').hidden=ok;
 }
 async function apresentarAceiteMigrado(s){
  document.getElementById('loopAceiteMigrado')?.remove();
  if(s.aceiteDocumentosDefinitivosPendente!==true)return;
  const area=document.createElement('section');
  area.id='loopAceiteMigrado';
  area.setAttribute('role','dialog');
  area.setAttribute('aria-modal','true');
  area.setAttribute('aria-label','Atualização dos documentos da sua conta');
  Object.assign(area.style,{position:'fixed',inset:'0',zIndex:'9999',
   overflowY:'auto',padding:'24px',background:'#11141d',color:'#f7f1da'});
  const titulo=document.createElement('h2');
  titulo.textContent='Atualização dos documentos do LOOP';
  const msg=document.createElement('p');
  msg.textContent='Seu cadastro e sua indicação foram preservados. Leia e confirme os documentos oficiais para continuar. Não é necessário se cadastrar novamente.';
  const status=document.createElement('p');
  status.setAttribute('role','status');
  area.append(titulo,msg,status);
  document.body.append(area);
  try{
   const docs=await requisitar('/documentos');
   for(const tipo of ['privacidade','termos']){
    const bloco=document.createElement('details');bloco.open=true;
    const resumo=document.createElement('summary');
    resumo.textContent=tipo==='termos'?'Termos de Uso':'Política de Privacidade';
    const texto=document.createElement('p');
    texto.textContent=docs[tipo].texto;
    texto.style.whiteSpace='pre-wrap';
    bloco.append(resumo,texto);area.append(bloco);
   }
   const form=document.createElement('form');
   const labels=[];
   for(const nome of ['Li e aceito a Política de Privacidade e os Termos de Uso.']){
    const label=document.createElement('label');
    const cb=document.createElement('input');cb.type='checkbox';cb.required=true;
    label.append(cb,document.createTextNode(' '+nome));
    labels.push(cb);form.append(label);
   }
   const btn=document.createElement('button');btn.type='submit';
   btn.textContent='Confirmar documentos e entrar';
   form.append(btn);area.append(form);
   form.addEventListener('submit',async ev=>{
    ev.preventDefault();
    if(labels.some(x=>!x.checked))return;
    btn.disabled=true;
    try{
     const resp=await requisitar('/aceitar-documentos',{
      method:'POST',csrfObrigatorio:true,
      body:{aceiteTermos:true,aceitePrivacidade:true,
       versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
       versaoPrivacidade:docs.privacidade.versao,
       hashPrivacidade:docs.privacidade.hash}
     });
     if(resp.documentosConfirmados!==true)throw Error('DOCUMENTOS_ALTERADOS_RELER');
     area.remove();dizer('Documentos confirmados. Sua conta original foi preservada.');
    }catch(e){status.textContent=erro(e);btn.disabled=false;}
   });
  }catch(e){status.textContent='Não foi possível carregar os documentos. '+erro(e);}
 }
 function painelConta(s){
  csrf=s.csrf;
  void apresentarAceiteMigrado(s);
  $('painelLogin').hidden=true;
  $('painelCadastro').hidden=true;
  $('painelRecuperacao').hidden=true;
  $('painelConta').hidden=false;
  document.body.classList.add('loop03-logado');
  fecharDadosRodapeReal();
  sincronizarFotoRodapeReal();
  nickResumoReal=s.nick;
  $('loop03NickIntegrado').textContent='@'+s.nick;
  posicoesResumoReal=[];posicaoSelecionada='';
  atualizarSituacaoRodapeReal();
  $('perfilCliente').textContent='Nick: '+s.nick+
   (s.emailVerificado?' · E-mail confirmado':' · Confirme seu e-mail');
  $('painelVerificarEmail').hidden=s.emailVerificado;
  $('painelIdentidadeTeste').hidden=true;
  $('conteudoConta').hidden=false;
  // A fonte é o endpoint autenticado do mesmo SQLite, não dados LAB.
  if(s.motorLoopInterno===true){
   prepararAbasMotor();
   $('loopEstadoIntegrado').hidden=false;
   void carregarMotor();
  }else $('loopEstadoIntegrado').hidden=true;
  const ensaioAtivo=s.tesourariaEnsaioAtiva===true;
  ensaioFinanceiroAtivo=ensaioAtivo;
  const blocoEnsaio=$('tesourariaEnsaioModulo');
  if(blocoEnsaio)blocoEnsaio.hidden=!ensaioAtivo;
  if(ensaioAtivo)void carregarFinanceiroEnsaio();
  // Preservar a mesma estrutura visual; não permitir navegação para
  // funções que ainda dependem exclusivamente do LAB.
  for(const tab of document.querySelectorAll('[role=tab]')){
   const ativo=tab.id===(s.motorLoopInterno===true?'abaResumo':'abaConta');
   const habilitado=['abaConta','abaEquipe','abaLinks','abaMeusPedidos'].includes(tab.id)||
    (s.motorLoopInterno===true&&
    ['abaResumo','abaTabuleiro','abaPosicoes','abaEquipe','abaLinks'].includes(tab.id))||
    tab.id==='abaFinanceiro';
   tab.disabled=!habilitado;tab.setAttribute('aria-selected',String(ativo));
   tab.setAttribute('aria-current',ativo?'page':'false');
   tab.tabIndex=ativo?0:-1;
   const alvo=tab.getAttribute('aria-controls');
   if(alvo&&$(alvo))$(alvo).hidden=!ativo;
   if(!habilitado)tab.title='Disponível após liberação operacional';
   else tab.removeAttribute('title');
  }
  if($('abaEquipe'))$('abaEquipe').disabled=false;
  if($('abaLinks'))$('abaLinks').disabled=false;
  // O placar superior aprovado deve permanecer visivel no PC e no celular.
  const indicators=document.querySelector('.loop03-indicadores');
  if(indicators)indicators.hidden=false;
  // Mesma sessão permite visitar a AKITEMM em modo somente leitura.
  // O backend continua protegendo /loja por cookie e bloqueia checkout.
  for(const acessoLoja of document.querySelectorAll(
   '.loop03-atalho-loja, .barra-conta a.loop03-loja-prata'
  )){
   acessoLoja.setAttribute('href','/loja');
   acessoLoja.removeAttribute('aria-disabled');
   acessoLoja.title='Abrir Loja AKITEMM (compras ainda indisponíveis)';
  }
  prepararRede();
  preencherLinks(s.nick);
  void carregarRede();
  void carregarDados();
 }
 let redePreparada=false;
 function prepararRede(){
  if(redePreparada)return;
  redePreparada=true;
  $('atualizarEquipe')?.addEventListener('click',()=>void carregarRede());
  $('maisEquipe').addEventListener('click',()=>void carregarRede({mais:true}));
  $('buscarEquipe').addEventListener('input',()=>exibirRede());
  $('equipeVerLinks').addEventListener('click',()=>$('abaLinks').click());
  for(const [botao,campo] of [
   ['copiarLinkEscritorio','linkEscritorio'],
   ['copiarLinkLoja','linkLoja']
  ]){
   $(botao).addEventListener('click',async()=>{
    const valor=$(campo).value;
    if(!valor)return;
    try{
     await navigator.clipboard.writeText(valor);
     dizer('Link copiado.');
    }catch{
     $(campo).focus();$(campo).select();
     dizer('Link selecionado. Use copiar no seu dispositivo.');
    }
   });
  }
 }
 function preencherLinks(nick){
  const endereco=location.origin,identificador=encodeURIComponent(nick);
  origemLinks={loja:endereco+'/convite/loja?ref='+identificador,
   escritorio:endereco+'/escritorio?ref='+identificador};
  $('linkLoja').value=origemLinks.loja;
  $('linkEscritorio').value=origemLinks.escritorio;
  $('linksNick').textContent='Links da conta @'+nick;
 }
 function exibirRede(){
  const alvo=$('listaEquipe');
  alvo.replaceChildren();
  const filtro=$('buscarEquipe').value.toLowerCase().trim().replace(/^@/,'');
  const dados=titularesIndicados.filter(p=>
   p.nick.toLowerCase().includes(filtro)||
   (Number.isSafeInteger(p.numeroCadastro)&&
    String(p.numeroCadastro)===filtro.replace(/^#/,''))
  );
  if(!dados.length){
   const aviso=document.createElement('p');
   aviso.textContent='Nenhum cadastro encontrado por esse nick ou número.';
   alvo.appendChild(aviso);return;
  }
  const texto=(tag,cls,value)=>{
   const el=document.createElement(tag);
   if(cls)el.className=cls;
   el.textContent=value;return el;
  };
  for(const p of dados){
   const card=texto('article','loop03-rede-pessoa','');
   card.dataset.estado='vermelho';
   const cab=texto('div','loop03-rede-pessoa-cabecalho','');
   const n=Number.isSafeInteger(p.numeroCadastro)&&p.numeroCadastro>0?
    '#'+String(p.numeroCadastro).padStart(4,'0'):'#—';
   cab.append(
    texto('span','loop03-rede-pessoa-numero',n),
    texto('span','loop03-rede-pessoa-luz',''),
    texto('strong','loop03-rede-pessoa-nick','@'+p.nick),
    texto('span','loop03-rede-pessoa-status','Cadastro realizado')
   );
   const infos=texto('div','loop03-rede-pessoa-info','');
   const tel=typeof p.telefone==='string'&&/^[1-9][0-9][0-9]{8,9}$/.test(p.telefone)?
    p.telefone:null;
   if(tel){
    const span=texto('span',null,'Telefone: ');
    const a=texto('a',null,tel);
    a.href='tel:+55'+tel;
    a.setAttribute('aria-label','Ligar para @'+p.nick);
    span.append(a);infos.append(span);
   }else infos.append(texto('span',null,'Telefone: contato não informado'));
   const registro=new Date(p.registradoEm);
   const valido=Number.isFinite(registro.getTime());
   infos.append(
    texto('span',null,'Cadastro: '+(valido?
     registro.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}):'não informado')),
    texto('span',null,'Horário: '+(valido?
     registro.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',
      hour12:false,timeZone:'America/Sao_Paulo'}):'não informado')+' (Brasília)'),
    texto('span',null,'Fila: '+(p.filaCadastro==='B'?'B':'não informada'))
   );
   const mensagem=texto('p','loop03-rede-pessoa-vinculo',
    'Aguardando confirmação de ativação no LOOP.');
   card.append(cab,infos,mensagem);
   alvo.append(card);
  }
 }
 async function carregarRede({mais=false}={}){
  if(redePaginando)return;
  redePaginando=true;
  if(!mais)titularesIndicados=[];
  try{
   const dados=await requisitar('/minha-rede'+(mais?
    '?offset='+titularesIndicados.length:''));
   if(!Array.isArray(dados.indicados)||!Number.isSafeInteger(dados.total)||
      dados.financeiroReal!==false)throw Error('REDE_DIVERGENTE');
   titularesIndicados=mais?
    titularesIndicados.concat(dados.indicados):dados.indicados;
   $('maisEquipe').hidden=!dados.temMais;
   $('redeTotalCadastros').textContent=String(dados.total);
   $('redeAlocadasEnsaio').textContent=String(
    dados.resumo?.qualificadasEmEnsaio??0);
   $('redeADistribuirEnsaio').textContent=String(
    dados.resumo?.comprasAguardandoQualificacaoEnsaio??0);
   $('equipeResumo').textContent=dados.total+
    ' cadastro(s) pelo seu link.';
   exibirRede();
  }catch{
   $('equipeResumo').textContent='Sua rede não pôde ser consultada.';
  }finally{redePaginando=false;}
 }
 let painelMotorPreparado=false;
 const visorCatraca=window.LoopVisorCatraca.criar({elemento:$});
 const visualTabuleiro=window.LoopTabuleiroVisual.criar({elemento:$});
 let consultaPedidosEmCurso=0,paginaPedidosReal=0,totalPedidosReal=null;
 async function carregarPedidos(pagina=paginaPedidosReal){
  if(!Number.isSafeInteger(pagina)||pagina<0)return;
  const token=++consultaPedidosEmCurso;
  const painel=$('listaPedidos');painel.textContent='Consultando seu histórico...';
  $('pedidosAnterior').disabled=true;$('pedidosProximo').disabled=true;
  try{
   const resposta=await fetch('/api/loja/pedidos?pagina='+pagina,{
    credentials:'same-origin',cache:'no-store'
   });
   if(!resposta.ok)throw Error('HISTORICO_INDISPONIVEL');
   const d=await resposta.json(),p=d.paginacao;
   if(d.fonte!=='PEDIDOS_COMERCIAIS_DO_TITULAR'||
      d.checkoutRealHabilitadoPorEstaConsulta!==false||
      !Array.isArray(d.pedidos)||d.pedidos.length>20||
      !p||p.pagina!==pagina||p.tamanho!==20||
      !Number.isSafeInteger(p.total)||p.total<0||
      typeof p.haAnterior!=='boolean'||typeof p.haMais!=='boolean')
    throw Error('PEDIDOS_ORIGEM_INVALIDA');
   if(token!==consultaPedidosEmCurso)return;
   paginaPedidosReal=pagina;
   totalPedidosReal=p.total;
   $('pedidosAnterior').disabled=!p.haAnterior;
   $('pedidosProximo').disabled=!p.haMais;
   painel.replaceChildren();
   $('pedidosPaginacao').textContent='Página '+(pagina+1)+
    ' · '+totalPedidosReal+' pedido(s) no histórico';
   if(!d.pedidos.length){
    painel.textContent='Nenhum pedido comercial nesta conta.';
    return;
   }
   const real=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
   for(const pedido of d.pedidos){
    if(typeof pedido.pedidoId!=='string'||typeof pedido.status!=='string'||
       !Array.isArray(pedido.remessas)||pedido.remessas.length>25)
     throw Error('PEDIDO_INVALIDO');
    const card=document.createElement('article');
    card.className='pedido';
    const titulo=document.createElement('h3');
    titulo.textContent='Pedido '+pedido.pedidoId;
    const texto=document.createElement('p');
    texto.className='subtexto';
    const valor=Number.isSafeInteger(pedido.valorTotalCentavos)&&
     pedido.valorTotalCentavos>=0?
     real.format(pedido.valorTotalCentavos/100):'Valor em revisão';
    texto.textContent=pedido.status+' · '+valor;
    card.append(titulo,texto);
    for(const envio of pedido.remessas){
     const linha=document.createElement('p');
     linha.className='subtexto';
     linha.textContent='Remessa '+String(envio.fornecedorId||'—')+
      ' · '+String(envio.estado||'AGUARDANDO_SEPARACAO');
     card.append(linha);
    }
    painel.append(card);
   }
  }catch{
   if(token!==consultaPedidosEmCurso)return;
   painel.textContent='Histórico comercial indisponível. A consulta '+
    'não realiza compras nem pagamentos.';
   $('pedidosPaginacao').textContent='Consulta indisponível';
  }
 }

 function fecharPopupReal(){
  popupPosicoesRealAberto=false;
  $('seletorPosicoesResumo').hidden=true;
  $('loop03IrPosicoesIntegrado').setAttribute('aria-expanded','false');
 }
 // Rodapé da mesma tela: nick e localização da posição selecionada
 // (ou a primeira ativa), sem transferir ID/indicações do placar superior.
 function atualizarSituacaoRodapeReal(posicoes=posicoesResumoReal){
  const lista=Array.isArray(posicoes)?posicoes:[];
  const pos=lista.find(p=>String(p.numero)===posicaoSelecionada)||
   [...lista].sort((a,b)=>a.numero-b.numero)[0];
  const local=typeof pos?.local==='string'?pos.local:'';
  const dentro=local==='CENTRO'||/^VAGA_[1-6]$/.test(local);
  const fila=local==='FILA_A'?'A':local==='FILA_B'?'B':
   local==='FILA'&&(pos?.fila==='A'||pos?.fila==='B')?pos.fila:null;
  const rotulo=$('loop03RodapeFilaIntegrado');
  rotulo.textContent=fila?'Fila '+fila:'';
  rotulo.hidden=!fila;
  $('loop03RodapeCoroaIntegrado').hidden=!dentro;
 }
 function atualizarTopoPosicaoReal(){
  const i=posicoesResumoReal.findIndex(p=>String(p.numero)===posicaoSelecionada);
  const p=i<0?null:posicoesResumoReal[i];
  $('loop03NumeroIntegrado').textContent=p?'#'+(i+1):'—';
  $('loop03StatusPosicao').textContent=p?
   ('@'+nickResumoReal+' · Fila '+(p.fila==='A'||p.fila==='B'?p.fila:'não definida')+
    ' · Indicações: '+(p.indicacoesVinculadas||0)+
    ' · '+(p.local||'Em acompanhamento')+' · ID #'+p.numero):'';
  atualizarSituacaoRodapeReal();
 }
 function preencherPopupReal(){
  if(!popupPosicoesRealAberto)return;
  const lista=$('opcoesPosicoesResumo');lista.replaceChildren();
  $('avisoPosicoesResumo').textContent=posicoesResumoReal.length?
   'Escolha a posição que aparecerá no placar superior.':
   'Você ainda não possui posições para selecionar.';
  posicoesResumoReal.forEach((p,i)=>{
   const botao=document.createElement('button');
   botao.type='button';botao.textContent=String(i+1);
   botao.setAttribute('aria-label','Posição '+(i+1)+' · ID #'+p.numero);
   botao.setAttribute('aria-pressed',String(String(p.numero)===posicaoSelecionada));
   botao.addEventListener('click',()=>{
    posicaoSelecionada=String(p.numero);
    fecharPopupReal();
    atualizarTopoPosicaoReal();
    void carregarMotor();
    if($('conteudoFinanceiro').hidden===false&&!ensaioFinanceiroAtivo)
     void carregarFinanceiroReal();
   });
   lista.appendChild(botao);
  });
 }
 const formatarDinheiroReal=centavos=>
  new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(centavos/100);
 function finSelecionarOrigemReal(origem){
  finOrigemReal=origem;
  $('finEscolherBonus').setAttribute('aria-pressed',String(origem==='BONUS_INDICACAO'));
  $('finEscolherPosicoes').setAttribute('aria-pressed',String(origem==='POSICOES'));
  $('finSaqueResposta').textContent='';
 }
 async function carregarFinanceiroReal(){
  for(const id of ['finIndicadosValidos','finSaldoBonus','finSaldoSelecionado',
   'finSaldoPosicoes','finBonusSaque','finPosicoesSaque'])
   $(id).textContent='—';
  $('estadoFinanceiro').textContent='Consultando livro financeiro…';
  try{
   const pos=posicoesResumoReal.find(p=>String(p.numero)===posicaoSelecionada);
   const url='/api/financeiro/me'+(pos?'?posicaoId='+encodeURIComponent(pos.numero):'');
   const resposta=await fetch(url,{credentials:'same-origin',cache:'no-store'});
   if(!resposta.ok)throw Error('FIN_LIVRO_NAO_DISPONIVEL');
   const d=await resposta.json();
   if(d.origem!=='LIVRO_FINANCEIRO_REAL'||d.saqueRealHabilitado!==false||
      d.minimoSaqueCentavos!==2500||d.taxaSaquePercentual!==0)
    throw Error('FIN_RESPOSTA_DIVERGENTE');
   if(d.saldosLiberados!==true){
    $('estadoFinanceiro').textContent=
     'Livro financeiro preparado. Valores serão apresentados somente após comprovação externa.';
    return;
   }
   const valor=v=>Number.isSafeInteger(v)&&v>=0?formatarDinheiroReal(v):'—';
   $('finIndicadosValidos').textContent=Number.isSafeInteger(d.indicadosValidos)?
    String(d.indicadosValidos):'—';
   $('finSaldoBonus').textContent=valor(d.saldoBonusCentavos);
   // No saque por posição, usar somente o saldo individual do mesmo
   // ID confirmado pelo livro financeiro, nunca o agregado da conta.
   const saldoPosicaoAtual=pos&&d.posicaoSelecionadaId===pos.numero?
    valor(d.saldoPosicaoSelecionadaCentavos):'—';
   $('finSaldoSelecionado').textContent=saldoPosicaoAtual;
   $('finSaldoPosicoes').textContent=valor(d.saldoTotalPosicoesCentavos);
   $('finBonusSaque').textContent=valor(d.saldoBonusCentavos);
   $('finPosicoesSaque').textContent=saldoPosicaoAtual;
   $('estadoFinanceiro').textContent='Saldos provenientes do livro financeiro real.';
  }catch{
   $('estadoFinanceiro').textContent=
    'Livro financeiro indisponível; não é possível exibir valores não comprovados.';
  }
 }
 async function finHistoricoReal(){
  const painel=$('finHistorico'),btn=$('finAbrirHistorico');
  if(!painel.hidden){
   painel.hidden=true;btn.setAttribute('aria-expanded','false');return;
  }
  painel.hidden=false;btn.setAttribute('aria-expanded','true');
  $('finHistoricoMensagem').textContent='Consultando lançamentos…';
  $('finHistoricoItens').replaceChildren();
  try{
   const r=await fetch('/api/financeiro/historico',{
    credentials:'same-origin',cache:'no-store'});
   if(!r.ok)throw Error('FIN_HISTORICO_INDISPONIVEL');
   const d=await r.json();
   if(d.origem!=='LIVRO_FINANCEIRO_REAL'||!Array.isArray(d.registros))
    throw Error('FIN_HISTORICO_INVALIDO');
   const ul=document.createElement('ul');
   for(const x of d.registros){
    if(typeof x.descricao!=='string'||!Number.isSafeInteger(x.valorCentavos))
     throw Error('FIN_LANCAMENTO_INVALIDO');
    const li=document.createElement('li');
    li.textContent=x.descricao+' · '+formatarDinheiroReal(x.valorCentavos);
    ul.append(li);
   }
   $('finHistoricoItens').append(ul);
   $('finHistoricoMensagem').textContent=d.registros.length?
    'Lançamentos confirmados:':'Sem lançamentos financeiros comprovados.';
  }catch{
   $('finHistoricoMensagem').textContent=
    'Histórico indisponível. Nenhuma movimentação será inventada.';
  }
 }
 async function finSaqueReal(e){
  e.preventDefault();
  const resposta=$('finSaqueResposta'),campo=$('finValorSaque');
  const valor=Number(campo.value);
  if(!Number.isFinite(valor)||valor<25||valor>100000000||
     Math.abs(valor*100-Math.round(valor*100))>0.000001){
   resposta.textContent='Informe um valor válido de pelo menos R$ 25,00.';
   return;
  }
  const botao=$('finSolicitarSaque');
  botao.disabled=true;
  try{
   const r=await fetch('/api/financeiro/saques',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json','X-Loop-Csrf':csrf},
    body:JSON.stringify({origem:finOrigemReal,
     valorCentavos:Math.round(valor*100)})
   });
   if(!r.ok){
    resposta.textContent='Saque indisponível até a homologação bancária. Nenhum Pix foi enviado.';
    return;
   }
   // Só aceitar confirmação assinada do livro real, nunca "200" isolado.
   const d=await r.json();
   resposta.textContent=d.saqueConfirmado===true&&
    typeof d.comprovanteId==='string'&&d.comprovanteId.length>0?
    'Saque registrado: '+d.comprovanteId:
    'Nenhum pagamento confirmado.';
  }catch{resposta.textContent='Saque indisponível. Nenhum Pix foi enviado.';}
  finally{botao.disabled=false;}
 }
 function prepararAbasMotor(){
  if(painelMotorPreparado)return;
  painelMotorPreparado=true;
  visorCatraca.iniciar();
  window.setInterval(()=>{
   if(!document.hidden&&$('conteudoTabuleiro')?.hidden===false)
    void carregarMotor();
  },15000);
    for(const id of ['atualizarTabuleiroIntegrado','atualizarPosicoes']){
   $(id)?.addEventListener('click',()=>void carregarMotor());
  }
    $('tabuleiroVerPosicoesIntegrado').addEventListener('click',
   ()=>$('abaPosicoes').click());
      // A aba de pedidos usa o livro comercial deste titular, nunca o LAB.
  // O placar superior seleciona uma posição sem mudar a aba atual.
  const abrir=$('loop03IrPosicoesIntegrado'),popup=$('seletorPosicoesResumo');
  abrir.addEventListener('click',()=>{
   popupPosicoesRealAberto=!popupPosicoesRealAberto;
   popup.hidden=!popupPosicoesRealAberto;
   abrir.setAttribute('aria-expanded',String(popupPosicoesRealAberto));
   if(popupPosicoesRealAberto)preencherPopupReal();
  });
  document.addEventListener('click',e=>{
   if(popupPosicoesRealAberto&&!popup.contains(e.target)&&
      !abrir.contains(e.target))fecharPopupReal();
  });
  document.addEventListener('keydown',e=>{
   if(popupPosicoesRealAberto&&e.key==='Escape'){
    fecharPopupReal();abrir.focus();
   }
  });
  const seletor=$('seletorPosicaoMotor');
  if(seletor)seletor.addEventListener('change',()=>{
   posicaoSelecionada=seletor.value;
   void carregarMotor();
  });
 }
 async function carregarFinanceiroEnsaio(){
  const caixa=$('tesourariaEnsaioSaldo');
  if(!caixa||$('tesourariaEnsaioModulo')?.hidden)return;
  try{
   const r=await fetch('/api/loop/tesouraria-ensaio',{
    credentials:'same-origin',cache:'no-store'
   });
   if(!r.ok)throw Error('ENSAIO_INDISPONIVEL');
   const d=await r.json();
   if(d.financeiroReal!==false||d.producaoHabilitada!==false||
      !Number.isSafeInteger(d.saldoFicticioDisponivelCentavos)||
      !Number.isSafeInteger(d.saldoFicticioReservadoCentavos))
    throw Error('ENSAIO_RESPOSTA_INVALIDA');
   const dinheiro=new Intl.NumberFormat('pt-BR',{
    style:'currency',currency:'BRL'
   });
   caixa.textContent='Disponivel ficticio: '+
    dinheiro.format(d.saldoFicticioDisponivelCentavos/100)+
    ' · Reservado ficticio: '+
    dinheiro.format(d.saldoFicticioReservadoCentavos/100)+
    ' · Saques simulados: '+d.saques.length;
   $('estadoFinanceiro').textContent=
    'SIMULACAO — sem pagamento bancario, sem saldo financeiro real.';
  }catch{
   caixa.textContent='Tesouraria de ensaio indisponivel.';
  }
 }
 // Conecta o aceite individual da posicao azul diretamente a conta autenticada.
 // O texto completo dos termos e obrigatorio; nunca armazenar CPF na UI.
 function renderizarAceiteAzulEnsaio(card,pos){
  const form=document.createElement('form');
  form.className='loop03-aceite-posicao';
  form.autocomplete='off';
  const descricao=document.createElement('p');
  descricao.textContent='Posição azul pendente · confirmação individual em ensaio. '+
   'A posição segue na fila mesmo sem confirmar. Não há crédito financeiro real.';
  const detalhes=document.createElement('details');
  const sum=document.createElement('summary');
  sum.textContent='Ler os termos da confirmação';
  const termosTexto=document.createElement('p');
  termosTexto.textContent='Carregando termos vigentes...';
  detalhes.append(sum,termosTexto);
  const nomeCampo='cpfPosicao'+pos.numero;
  const label=document.createElement('label');
  label.textContent='CPF da posição #'+pos.numero+' (11 números)';
  label.htmlFor=nomeCampo;
  const cpf=document.createElement('input');
  cpf.id=nomeCampo;cpf.name='cpf';cpf.type='text';
  cpf.inputMode='numeric';cpf.pattern='[0-9]{11}';
  cpf.maxLength=11;cpf.required=true;cpf.autocomplete='off';
  const confirmar=document.createElement('label');
  const aceite=document.createElement('input');
  aceite.type='checkbox';aceite.required=true;
  confirmar.append(aceite,document.createTextNode(
   ' Li os termos acima e confirmo somente esta posição em ensaio.'));
  const botao=document.createElement('button');
  botao.type='submit';botao.textContent='Confirmar posição azul';
  botao.disabled=true;
  const retorno=document.createElement('p');
  retorno.setAttribute('role','status');
  let termos=null;
  form.append(descricao,detalhes,label,cpf,confirmar,botao,retorno);
  card.appendChild(form);
  void requisitar('/documentos').then(d=>{
   if(d.financeiroReal!==false||!d.termos||
      !/^[a-f0-9]{64}$/.test(d.termos.hash)||
      typeof d.termos.versao!=='string'||
      typeof d.termos.texto!=='string'||d.termos.texto.length<100)
    throw Error('DOCUMENTOS_INVALIDOS');
   termos=d.termos;
   termosTexto.textContent='Versão: '+termos.versao+'\n'+termos.texto;
   botao.disabled=false;
  }).catch(()=>{
   detalhes.open=true;termosTexto.textContent='Termos indisponíveis. Tente atualizar a página.';
   retorno.textContent='Não é possível confirmar sem ler os termos vigentes.';
  });
  form.addEventListener('submit',ev=>{
   ev.preventDefault();
   if(!termos||!aceite.checked||!csrf)return;
   botao.disabled=true;
   retorno.textContent='Registrando confirmação desta posição...';
   void fetch('/api/loop/posicoes/'+pos.numero+'/confirmar-ensaio',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json','X-Loop-Csrf':csrf},
    body:JSON.stringify({cpf:cpf.value,aceiteExplicito:true,
     versaoTermos:termos.versao,hashTermos:termos.hash})
   }).then(async r=>{
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(d.erro||'CONFIRMACAO_AZUL_INDISPONIVEL');
    if(d.financeiroReal!==false||d.estado!=='ACEITE_ENSAIO')
     throw Error('CONFIRMACAO_AZUL_RESPOSTA_INVALIDA');
    cpf.value='';aceite.checked=false;
    retorno.textContent='Confirmação individual registrada em ensaio; '+
     'sem validação externa de identidade ou valores reais.';
    await carregarMotor();
   }).catch(e=>{
    cpf.value='';
    retorno.textContent='Não foi possível confirmar: '+(codigos[e.message]||e.message);
    botao.disabled=false;
   });
  });
 }

 // A mesma caixa de Fila A/B aprovada recebe somente números reais,
 // sem nomes de terceiros e sem trocar o formato ou a paleta.

 // O quadro aprovado é o controle: clicável mesmo com zero posições.
 // Selecionar é apenas leitura. Nunca cria fila, número, compra ou giro.
 function selecionarQuadroFila(fila){
  filaSelecionada=filaSelecionada===fila?null:fila;
  for(const tipo of ['A','B']){
   const ativa=filaSelecionada===tipo;
   $('quadroMotorFila'+tipo).classList.toggle('loop03-fila-selecionada',ativa);
   $('abrirMotorFila'+tipo).setAttribute('aria-expanded',String(ativa));
   $('motorFila'+tipo+'Detalhes').hidden=!ativa;
  }
  if(filaSelecionada&&typeof carregarPaginaFila[filaSelecionada]==='function')
   void carregarPaginaFila[filaSelecionada]();
 }
 for(const fila of ['A','B']){
  $('abrirMotorFila'+fila).addEventListener('click',()=>selecionarQuadroFila(fila));
  $('quadroMotorFila'+fila).addEventListener('click',evento=>{
   // Clique fora dos controles, em qualquer área livre da caixa.
   if(evento.target.closest('button')||
      evento.target.closest('.loop03-fila-paginada'))return;
   selecionarQuadroFila(fila);
  });
 }
 async function atualizarFilasAncoradas(_posicoes,_totais){
  // Fila em ordem real: 1º ao 10º visíveis e páginas de 30 ao abrir.
  // A prioridade A/B é calculada exclusivamente pelo motor.
  const sequencia=++sequenciaLeituraFilas;
  await Promise.all(['A','B'].map(async fila=>{
   const id='motorFila'+fila,area=$(id);
   const painel=$('motorFila'+fila+'Detalhes');
   carregarPaginaFila[fila]=null;
   painel.replaceChildren();
   const base='/api/loop/fila?fila='+fila+'&desdeInicio=1';
   const consultar=async pagina=>{
    const r=await fetch(base+'&pagina='+pagina,{
     credentials:'same-origin',cache:'no-store'
    });
    if(!r.ok)throw Error('FILA_INDISPONIVEL');
    const d=await r.json();
    if(d.fonte!=='IDENTIDADE_E_MOTOR_MESMO_SQLITE'||d.fila!==fila||
       !Number.isSafeInteger(d.total)||d.total<0||
       !Array.isArray(d.janela)||d.janela.length>10||
       !Array.isArray(d.pagina)||d.pagina.length>30||
       d.janela.some((p,i)=>p.ordem!==i+1)||
       d.pagina.some((p,i)=>p.ordem!==pagina*30+i+1))
     throw Error('FILA_RESPOSTA_INVALIDA');
    return d;
   };
   try{
    const visao=await consultar(0);
    if(sequencia!==sequenciaLeituraFilas)return;
    visualTabuleiro.preencherFila(id,visao.janela,fila);
    if(visao.total===0){
     const vazio=document.createElement('p');
     vazio.className='subtexto';vazio.textContent='Fila vazia.';
     painel.append(vazio);return;
    }
    const situacao=document.createElement('p');
    situacao.className='loop03-fila-ordem-propria';
    situacao.textContent='Primeiros '+Math.min(10,visao.total)+
     ' lugares · total '+visao.total+' na Fila '+fila;
    area.append(situacao);
    const titulo=document.createElement('p');
    titulo.className='subtexto';
    titulo.textContent='Fila '+fila+' na ordem de espera (30 lugares por página):';
    const paginas=document.createElement('div');
    const mais=document.createElement('button');
    mais.type='button';mais.className='loop03-fila-expandir';
    mais.textContent='Carregar mais posições';
    const estado=document.createElement('small');
    estado.setAttribute('role','status');
    painel.append(titulo,paginas,mais,estado);
    let proxima=0,emCurso=false;
    const carregarPagina=async()=>{
     if(emCurso||proxima===null)return;
     emCurso=true;mais.disabled=true;
     estado.textContent='Consultando sequência da Fila '+fila+'…';
     try{
      const paginaAtual=proxima,d=paginaAtual===0?visao:
       await consultar(paginaAtual);
      if(sequencia!==sequenciaLeituraFilas)return;
      const paginaDiv=document.createElement('div');
      paginaDiv.id='paginaFila'+fila+'Numero'+paginaAtual;
      const cabecalho=document.createElement('p');
      cabecalho.className='loop03-fila-ordem-propria';
      cabecalho.textContent='Página '+(paginaAtual+1)+' · lugares '+
       (paginaAtual*30+1)+' a '+Math.min((paginaAtual+1)*30,d.total);
      const linhas=document.createElement('div');
      linhas.id='paginaFila'+fila+'Linhas'+paginaAtual;
      paginaDiv.append(cabecalho,linhas);
      paginas.append(paginaDiv);
      if(d.pagina.length)visualTabuleiro.preencherFila(linhas.id,d.pagina,fila);
      proxima=d.proximaPagina;
      mais.hidden=proxima===null;
      estado.textContent=proxima===null?'Fim da fila.':'Página '+(paginaAtual+1)+' carregada.';
     }catch{
      estado.textContent='Não foi possível carregar esta página. Tente novamente.';
     }finally{emCurso=false;mais.disabled=false;}
    };
    carregarPaginaFila[fila]=carregarPagina;
    mais.addEventListener('click',()=>void carregarPagina());
    if(filaSelecionada===fila)void carregarPagina();
   }catch{
    if(sequencia!==sequenciaLeituraFilas)return;
    const aviso=document.createElement('p');
    aviso.className='subtexto';
    aviso.textContent='Ordem da Fila '+fila+' temporariamente indisponível.';
    painel.append(aviso);
   }
  }));
 }
 async function carregarMotor(){
  try{
   const r=await fetch('/api/loop/estado',{
    credentials:'same-origin',cache:'no-store'
   });
   if(!r.ok)throw Error('MOTOR_INDISPONIVEL');
   const d=await r.json();
   if(d.fonte!=='IDENTIDADE_E_MOTOR_MESMO_SQLITE'||
      d.financeiroReal!==false||!Array.isArray(d.minhasPosicoes)||
      !d.tabuleiro||!Array.isArray(d.tabuleiro.vagas)||
      d.tabuleiro.vagas.length!==6)
    throw Error('MOTOR_RESPOSTA_INVALIDA');
   if(d.somenteLeitura!==true||d.compraRealHabilitada!==false||
      d.catracaClientePodeGirar!==false||
      !d.redeResumo||d.redeResumo.financeiroReal!==false)
    throw Error('ESCRITORIO_RESPOSTA_INCONSISTENTE');
   const aguardando=d.eventosComerciais?.aguardandoConciliacao??0;
   const texto='Fila A: '+d.filaA+' · Fila B: '+d.filaB+
    ' · Ciclo atual: '+d.tabuleiro.eventosNoCiclo+
    ' de 6 eventos. Acompanhe suas posições e o tabuleiro.'+
    (aguardando>0?' Pedidos em análise: '+aguardando+'.':'');
   $('loopResumoMotor').textContent=texto;
   // O contador ja aparece na roda; nao repetir indicadores no rodape.
   $('estadoTabuleiroIntegrado').textContent='';
   $('estadoTabuleiroIntegrado').hidden=true;
   // Mesmo componente de fila, círculo e luzes usado pelo laboratório.
   // O backend definitivo expõe somente contagens de terceiros.
   visualTabuleiro.preencherFila('motorFilaA',d.filaA,'A');
   visualTabuleiro.preencherFila('motorFilaB',d.filaB,'B');
   const titularPorNumero=new Map(
    d.minhasPosicoes.map(p=>[p.numero,p])
   );
   const visao=p=>{
    if(!p||p.minha!==true)return p;
    const propria=titularPorNumero.get(p.numero);
    return {...p,
     pendente:propria?.estadoAdesao==='PENDENTE',
     aceiteEnsaio:propria?.estadoAdesao==='ACEITE_ENSAIO'};
   };
   visualTabuleiro.preencherVaga('tabuleiroMotorCentro',
    visao(d.tabuleiro.centro),true);
   for(let i=0;i<6;i++)
    visualTabuleiro.preencherVaga('tabuleiroMotorVaga'+(i+1),
     visao(d.tabuleiro.vagas[i]));
   visualTabuleiro.preencherLuzes(d.tabuleiro.eventosNoCiclo);
   visorCatraca.registrarAgenda(d.agenda);
   visorCatraca.observar(d.catraca.giros,d.tabuleiro.eventosNoCiclo);
   $('motorContadorEventos').textContent=d.tabuleiro.eventosNoCiclo+
    ' de 6 eventos neste ciclo';
   $('loop03TotalIntegrado').textContent=String(d.minhasPosicoes.length)+
    ' / '+String(d.limitePosicoesAtivas);
   // So exibir giros das ultimas 24h quando a fonte realmente os informar.
   const giros24h=d.catraca?.giros24h;
   $('loop03Giros24Integrado').textContent=
    Number.isSafeInteger(giros24h)&&giros24h>=0?String(giros24h):'—';
   const seletor=$('seletorPosicaoMotor');
   const seletorRotulo=$('rotuloSeletorPosicaoMotor');
   if(seletor){
    posicoesResumoReal=d.minhasPosicoes.filter(p=>
     Number.isSafeInteger(p.numero)).sort((a,b)=>a.numero-b.numero);
    if(popupPosicoesRealAberto)preencherPopupReal();
    const opcoes=d.minhasPosicoes.map(p=>String(p.numero));
    if(!opcoes.includes(posicaoSelecionada))posicaoSelecionada='';
    atualizarSituacaoRodapeReal(posicoesResumoReal);
    seletor.replaceChildren();
    const geral=document.createElement('option');
    geral.value='';geral.textContent='Todas as posições';
    seletor.appendChild(geral);
    for(const n of opcoes){
     const opt=document.createElement('option');
     opt.value=n;opt.textContent='Posição #'+n;
     seletor.appendChild(opt);
    }
    seletor.value=posicaoSelecionada;
    if(seletorRotulo)seletorRotulo.hidden=opcoes.length===0;
    const selecionadaResumo=d.minhasPosicoes.find(p=>
     String(p.numero)===posicaoSelecionada);
    $('loop03NumeroIntegrado').textContent=
     selecionadaResumo?'#'+posicaoSelecionada:'—';
    $('loop03StatusPosicao').textContent=selecionadaResumo?
     ('@'+nickResumoReal+
      ' · Fila '+(selecionadaResumo.fila==='A'||selecionadaResumo.fila==='B'?
       selecionadaResumo.fila:'não definida')+
      ' · Indicações: '+(selecionadaResumo.indicacoesVinculadas||0)+
      ' · '+(selecionadaResumo.local||'Em acompanhamento')+
      ' · ID #'+selecionadaResumo.numero):
     '';
   }
   // A quantidade de cartões deriva do MESMO limite enviado pelo motor;
   // não esconder vagas vazias nem fabricar posições/pedidos.
   // Sem posição · Espaço disponível é o estado neutro dos dez quadros.
   const capacidade=d.limitePosicoesAtivas;
   if(!Number.isSafeInteger(capacidade)||capacidade<1||
      capacidade>1000||d.minhasPosicoes.length>capacidade)
    throw Error('CAPACIDADE_MOTOR_INVALIDA');
   const ordenadas=[...d.minhasPosicoes].sort((a,b)=>a.numero-b.numero);
   if(ordenadas.some((p,i)=>!Number.isSafeInteger(p.numero)||
       p.numero<1||(i>0&&p.numero===ordenadas[i-1].numero)))
    throw Error('POSICAO_REPETIDA_OU_INVALIDA');
   const painel=$('posicoesPainel');
   painel.replaceChildren();
   const grade=document.createElement('div');
   grade.className='loop03-grade-posicoes';
   // Só mostrar um cartão quando o titular selecionar sua posição;
   // na visão geral renderizar todos os espaços disponíveis até o limite.
   const slots=somentePosicoesPeloQuadrado?ordenadas:
    posicaoSelecionada?ordenadas.filter(p=>String(p.numero)===posicaoSelecionada):
    Array.from({length:capacidade},(_,i)=>ordenadas[i]||null);
   const criarLinhaDetalhe=(pai,rotulo,valor)=>{
    const linha=document.createElement('div');
    linha.className='loop03-posicao-detalhe-linha';
    const nome=document.createElement('dt');nome.textContent=rotulo;
    const texto=document.createElement('dd');texto.textContent=valor;
    linha.append(nome,texto);pai.append(linha);
   };
   const moedaPosicao=centavos=>Number.isSafeInteger(centavos)&&centavos>=0?
    formatarDinheiroReal(centavos):'Aguardando dados comprovados';
   for(let i=0;i<slots.length;i++){
    const pos=slots[i];

    const card=document.createElement('article');
    card.className='loop03-unidade-posicao';
    const corpo=document.createElement('div');
    corpo.className='loop03-cartao-posicao';
    const confirmado=pos?.confirmacaoExternaVerificada===true&&
     pos?.estadoAdesao==='CONFIRMADA';
    const pendente=Boolean(pos)&&!confirmado;
    corpo.classList.add(!pos?'loop03-posicao-vazia':
     confirmado?'loop03-status-confirmada':'loop03-status-pendente');
    const cabecalho=document.createElement('div');
    cabecalho.className='loop03-posicao-cabecalho';
    const rotulo=document.createElement('strong');
    const vaga=somentePosicoesPeloQuadrado||posicaoSelecionada?
     ordenadas.findIndex(p=>p.numero===pos.numero)+1:i+1;
    rotulo.textContent='Posição '+vaga;
    const luz=document.createElement('span');
    luz.className='loop03-posicao-luz '+(!pos?'loop03-posicao-luz-inativa':
     confirmado?'loop03-posicao-luz-verde':'loop03-posicao-luz-vermelha');
    luz.setAttribute('role','img');
    luz.setAttribute('aria-label',!pos?'Espaço disponível, luz apagada':
     confirmado?'Luz verde, posição confirmada':'Luz vermelha, confirmação pendente');
    cabecalho.append(rotulo,luz);
    corpo.append(cabecalho);
    const id=document.createElement('strong');
    id.className='loop03-posicao-id';
    id.textContent=pos?'#'+pos.numero:'Espaço disponível';
    corpo.append(id);
    const status=document.createElement('small');
    status.className='loop03-posicao-situacao';
    if(!pos)status.textContent='Sem posição vinculada';
    else if(confirmado)status.textContent='Confirmada';
    else if(pos.estadoAdesao==='REVISAR_PSP'||pos.local==='EM_REVISAO_PSP')
     status.textContent='Pedido em revisão';
    else if(pos.estadoAdesao==='ACEITE_ENSAIO')
     status.textContent='Aceite registrado · validação pendente';
    else status.textContent='Aguardando confirmação';
    corpo.append(status);
    if(pos){
     const resumo=document.createElement('small');
     resumo.className='loop03-posicao-resumo-curto';
     resumo.textContent=(pos.local?.startsWith('FILA_')?
      'Fila '+pos.local.slice(-1):pos.local||'Local a confirmar')+
      ' · '+pos.indicacoesQualificadasEnsaio+' indicação(ões)';
     corpo.append(resumo);
     const detalhes=document.createElement('details');
     detalhes.className='loop03-posicao-detalhes';
     const abrir=document.createElement('summary');
     abrir.textContent='Ver detalhes';
     detalhes.append(abrir);
     const dados=document.createElement('dl');
     dados.className='loop03-posicao-dados';
     criarLinhaDetalhe(dados,'Número da posição','#'+pos.numero);
     criarLinhaDetalhe(dados,'Local no LOOP',pos.local?.startsWith('FILA_')?
      'Fila '+pos.local.slice(-1):String(pos.local||'Em acompanhamento'));
     criarLinhaDetalhe(dados,'Situação da confirmação',status.textContent);
     const origem=pos.origemComercial||{};
     criarLinhaDetalhe(dados,'Pedido de origem',typeof origem.pedidoId==='string'?
      origem.pedidoId:'Não identificado');
     const produtos=Array.isArray(origem.itens)?origem.itens:[];
     if(produtos.length){
      for(const item of produtos){
       const titulo=typeof item.titulo==='string'&&item.titulo.trim()?
        item.titulo:'Produto sem nome vinculado'+
        (item.sku?' (SKU '+item.sku+')':'');
       const qtd=Number.isSafeInteger(item.quantidade)?item.quantidade:0;
       criarLinhaDetalhe(dados,'Produto que gerou a compra',
        titulo+' · '+qtd+' unidade(s)'+
        (Number.isSafeInteger(item.precoUnitarioCentavos)?
         ' · '+moedaPosicao(item.precoUnitarioCentavos)+' cada':''));
      }
     }else criarLinhaDetalhe(dados,'Produto que gerou a posição',
      'Ainda não identificado no livro do pedido');
     criarLinhaDetalhe(dados,'Valor do pedido',
      moedaPosicao(origem.valorTotalPedidoCentavos));
     criarLinhaDetalhe(dados,'Base registrada no motor (ensaio)',
      moedaPosicao(origem.valorBaseMotorEnsaioCentavos));
     criarLinhaDetalhe(dados,'Indicações qualificadas (ensaio)',
      String(pos.indicacoesQualificadasEnsaio));
     criarLinhaDetalhe(dados,'Movimentação financeira',
      'Sem crédito financeiro disponível');
     const saldo=document.createElement('div');
     saldo.className='loop03-posicao-saldo';
     saldo.textContent='Saldo individual: aguardando comprovação.';
     dados.append(saldo);
     detalhes.append(dados);
     let saldoConsultado=false;
     detalhes.addEventListener('toggle',async()=>{
      if(!detalhes.open||saldoConsultado)return;
      saldoConsultado=true;
      try{
       const r=await fetch('/api/financeiro/me?posicaoId='+pos.numero,{
        credentials:'same-origin',cache:'no-store'
       });
       if(!r.ok)throw Error('SALDO_NAO_DISPONIVEL');
       const d=await r.json();
       if(d.origem!=='LIVRO_FINANCEIRO_REAL'||
          d.posicaoSelecionadaId!==pos.numero)
        throw Error('SALDO_FONTE_INVALIDA');
       if(d.saldosLiberados===true&&
          Number.isSafeInteger(d.saldoPosicaoSelecionadaCentavos)&&
          d.saldoPosicaoSelecionadaCentavos>=0)
        saldo.textContent='Saldo individual confirmado: '+
         moedaPosicao(d.saldoPosicaoSelecionadaCentavos);
       else saldo.textContent='Saldo individual: aguardando liberação financeira.';
      }catch{
       saldoConsultado=false;
       saldo.textContent='Saldo individual indisponível nesta consulta.';
      }
     });
     corpo.append(detalhes);
    }
    // O aceite azul já existente permanece aqui: não altera a cor
    // para verde, pois a identidade externa continua não verificada.
    card.append(corpo);
    if(pos&&pos.aguardandoCpfTermos&&
       d.confirmacaoAzulEnsaioDisponivel===true)
     renderizarAceiteAzulEnsaio(card,pos);
    grade.appendChild(card);
   }
   if(somentePosicoesPeloQuadrado&&ordenadas.length===0){
    const exemplo=document.createElement('article');
    exemplo.className='loop03-unidade-posicao';
    exemplo.setAttribute('data-exemplo-visual','true');
    const corpo=document.createElement('div');
    corpo.className='loop03-cartao-posicao';
    const titulo=document.createElement('strong');
    titulo.textContent='DEMONSTRAÇÃO — posição fictícia';
    const numero=document.createElement('p');
    numero.textContent='#EXEMPLO (não é sua posição)';
    const dados=document.createElement('p');
    dados.textContent='Fila B · Aguardando confirmação · Indicações: 0';
    const aviso=document.createElement('small');
    aviso.textContent='Exemplo visual. Você tem 0 posições reais. Nenhuma compra ou giro foi criado.';
    corpo.append(titulo,numero,dados,aviso);
    exemplo.append(corpo);grade.appendChild(exemplo);
   }
   painel.appendChild(grade);
   void atualizarFilasAncoradas(d.minhasPosicoes,{A:d.filaA,B:d.filaB});
  }catch{
   $('loopResumoMotor').textContent=
    'Não foi possível carregar as posições. Tente atualizar.';
   $('estadoTabuleiroIntegrado').textContent=
    'Não foi possível atualizar o tabuleiro. Tente novamente.';
   $('estadoTabuleiroIntegrado').hidden=false;
   $('posicoesPainel').textContent='Posições temporariamente indisponíveis.';
  }
 }
 for(const tab of document.querySelectorAll('[role=tab]')){
  tab.addEventListener('click',()=>{
   if(tab.disabled)return;
   for(const outro of document.querySelectorAll('[role=tab]')){
    const ativo=outro===tab;
    outro.setAttribute('aria-selected',String(ativo));
    outro.setAttribute('aria-current',ativo?'page':'false');
    outro.tabIndex=ativo?0:-1;
    const alvo=$(outro.getAttribute('aria-controls'));
    if(alvo)alvo.hidden=!ativo;
   }
   if(tab.id==='abaPosicoes'){
    somentePosicoesPeloQuadrado=proximaAbaVemDoQuadrado;
    proximaAbaVemDoQuadrado=false;
   }
   if(tab.id==='abaTabuleiro'||tab.id==='abaPosicoes')void carregarMotor();
   if(tab.id==='abaMeusPedidos')void carregarPedidos();
   if(tab.id==='abaFinanceiro'){
    if(ensaioFinanceiroAtivo)void carregarFinanceiroEnsaio();
    else void carregarFinanceiroReal();
   }
   const lateral=$('loop03SidebarIntegrado');
   if(lateral?.classList.contains('loop03-aberto')){
    lateral.classList.remove('loop03-aberto');
    $('loop03MenuIntegrado').setAttribute('aria-expanded','false');
   }
  });
 }
 async function carregarDados(){
  try{
   const dados=await requisitar('/meus-dados');
   if($('resumoEmail'))$('resumoEmail').textContent=dados.emailVerificado?'Confirmado':'Pendente';
   $('perfilCliente').textContent='Nome: '+dados.nome+' · Nick: '+dados.nick+
    ' · E-mail: '+dados.email+
    (dados.emailVerificado?' (confirmado)':' (pendente)')+
    ' · Termos: '+dados.documentosAceitos.termos.versao+
    ' · Privacidade: '+dados.documentosAceitos.privacidade.versao;
  }catch(e){dizer(erro(e));}
 }
 function documentosHabilitados(ok){
  $('cadastroTermos').disabled=!ok;

  $('formCadastro').querySelector('button[type=submit]').disabled=!ok;
  if(!ok){
   $('cadastroTermos').checked=false;

  }
 }
 async function atualizarCaptchaCadastro(){
  captchaCadastroId=null;
  $('captchaCadastroResposta').value='';
  $('captchaCadastroImagem').removeAttribute('src');
  if(!captchaObrigatorio)return;
  $('captchaCadastroEstado').textContent='Gerando verificação...';
  try{
   const dados=await requisitar('/captcha-cadastro');
   if(typeof dados.captchaId!=='string'||
      !/^[a-f0-9]{48}$/.test(dados.captchaId)||
      typeof dados.captchaImagem!=='string'||
      !/^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/.test(dados.captchaImagem))
    throw Error('CAPTCHA_INVALIDO');
   captchaCadastroId=dados.captchaId;
   $('captchaCadastroImagem').src=dados.captchaImagem;
   $('captchaCadastroEstado').textContent='Digite o código exibido. Ele expira em 2 minutos e 30 segundos.';
  }catch{
   $('captchaCadastroEstado').textContent='Não foi possível gerar o código. Toque em Outro código.';
  }
 }
 async function carregarDocumentos(){
  if(carregando)return;
  carregando=true;documentos=null;documentosHabilitados(false);
  captchaCadastroId=null;captchaObrigatorio=false;
  $('captchaCadastroArea').hidden=true;
  $('textoTermosCadastro').textContent='Consultando termos...';
  $('textoPrivacidadeCadastro').textContent='Consultando política...';
  try{
   const dados=await requisitar('/documentos');
   const ok=o=>o&&typeof o.texto==='string'&&o.texto.length>=100&&
    typeof o.versao==='string'&&typeof o.hash==='string'&&
    /^[a-f0-9]{64}$/.test(o.hash);
   if(!ok(dados.termos)||!ok(dados.privacidade)||
      dados.financeiroReal!==false)throw Error('DOCUMENTOS_INVALIDOS');
   $('versaoTermosCadastro').textContent='Versão: '+dados.termos.versao;
   $('textoTermosCadastro').textContent=dados.termos.texto;
   $('versaoPrivacidadeCadastro').textContent='Versão: '+dados.privacidade.versao;
   $('textoPrivacidadeCadastro').textContent=dados.privacidade.texto;
   documentos=dados;
   captchaObrigatorio=dados.captchaObrigatorio===true;
   $('captchaCadastroArea').hidden=!captchaObrigatorio;
   if(captchaObrigatorio)await atualizarCaptchaCadastro();
   documentosHabilitados(true);
  }catch(e){
   $('textoTermosCadastro').textContent='Termos indisponíveis.';
   $('textoPrivacidadeCadastro').textContent='Política de privacidade indisponível.';
   dizer(erro(e));
  }finally{carregando=false;}
 }
 function onForm(id,run){
  $(id).addEventListener('submit',async ev=>{
   ev.preventDefault();
   const botao=ev.currentTarget.querySelector('button[type=submit]');
   if(botao.disabled)return;
   botao.disabled=true;
   try{await run();}
   catch(e){dizer(erro(e));}
   finally{
    botao.disabled=id==='formCadastro'?!documentos:false;
   }
  });
 }
 const solicitarEnsaio=$('tesourariaEnsaioSolicitar');
 if(solicitarEnsaio)solicitarEnsaio.addEventListener('click',async()=>{
  if(solicitarEnsaio.disabled||$('tesourariaEnsaioModulo')?.hidden)return;
  const valor=Number($('tesourariaEnsaioValor').value);
  const centavos=Math.round(valor*100);
  if(!Number.isSafeInteger(centavos)||centavos<2500||
     Math.abs(centavos/100-valor)>1e-8){
   $('tesourariaEnsaioStatus').textContent='Valor ficticio invalido.';
   return;
  }
  solicitarEnsaio.disabled=true;
  try{
   const id='ENSAIO_'+crypto.randomUUID().replaceAll('-','');
   const r=await fetch('/api/loop/tesouraria-ensaio/saques',{
    method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json','X-Loop-Csrf':csrf},
    body:JSON.stringify({
     saqueId:id,chaveIdempotencia:id,valorCentavos:centavos
    })
   });
   if(!r.ok)throw Error('SIMULACAO_RECUSADA');
   const dados=await r.json();
   if(dados.financeiroReal!==false)throw Error('RESPOSTA_INVALIDA');
   $('tesourariaEnsaioStatus').textContent=
    'Solicitacao ficticia registrada: '+dados.estado+
    '. Nenhum Pix real sera executado.';
   await carregarFinanceiroEnsaio();
  }catch{
   $('tesourariaEnsaioStatus').textContent=
    'Saque ficticio indisponivel. Nenhum dinheiro foi movimentado.';
  }finally{solicitarEnsaio.disabled=false;}
 });
 async function atualizarCaptchaLogin(){
  captchaLoginAtivo=true;captchaLoginId=null;
  $('captchaLoginArea').hidden=false;
  $('captchaLoginResposta').value='';
  $('captchaLoginImagem').removeAttribute('src');
  $('captchaLoginEstado').textContent='Gerando código para a próxima tentativa...';
  try{
   const r=await requisitar('/captcha-login');
   if(!/^[a-f0-9]{48}$/.test(r.captchaId)||
      !/^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/.test(r.captchaImagem))
    throw Error('CAPTCHA_INVALIDO');
   captchaLoginId=r.captchaId;
   $('captchaLoginImagem').src=r.captchaImagem;
   $('captchaLoginEstado').textContent='Digite o código antes de tentar entrar.';
  }catch{
   $('captchaLoginEstado').textContent='Não foi possível carregar o código. Toque em Outro código.';
  }
 }
 onForm('formLogin',async()=>{
  const body={nick:$('login').value,senha:$('senha').value};
  if(captchaLoginAtivo){
   if(!captchaLoginId||!/^[A-Za-z2-9]{6}$/.test($('captchaLoginResposta').value.trim()))
    throw Error('CAPTCHA_LOGIN_OBRIGATORIO');
   body.captchaId=captchaLoginId;
   body.captchaResposta=$('captchaLoginResposta').value.trim().toUpperCase();
  }
  try{
   const login=await requisitar('/entrar',{method:'POST',body});
   captchaLoginAtivo=false;captchaLoginId=null;
   $('captchaLoginArea').hidden=true;$('captchaLoginResposta').value='';
   $('senha').value='';
   painelConta(login);dizer('Bem-vindo ao Escritório LOOP.');
  }catch(e){
   if(['CREDENCIAIS_INVALIDAS','CAPTCHA_LOGIN_OBRIGATORIO',
     'CAPTCHA_INVALIDO'].includes(e.message))await atualizarCaptchaLogin();
   throw e;
  }
 });
 $('captchaLoginAtualizar').addEventListener('click',()=>void atualizarCaptchaLogin());
 $('captchaCadastroAtualizar').addEventListener('click',()=>void atualizarCaptchaCadastro());
 onForm('formCadastro',async()=>{
  if(!documentos||!$('cadastroTermos').checked)
   throw Error('DOCUMENTOS_ALTERADOS_RELER');
  if(captchaObrigatorio&&(!captchaCadastroId||
     !/^[A-Za-z2-9]{6}$/.test($('captchaCadastroResposta').value.trim())))
   throw Error('CAPTCHA_INVALIDO');
  if($('cadastroSenha').value!==$('cadastroConfirmarSenha').value)
   throw Error('CONFIRMACAO_SENHA_INVALIDA');
  try{
   const resposta=await requisitar('/cadastrar',{method:'POST',body:{
    nome:$('cadastroNome').value,nick:$('cadastroNick').value,
    cpf:$('cadastroCpf').value,telefone:$('cadastroTelefone').value,
    email:$('cadastroEmail').value,senha:$('cadastroSenha').value,
    ...(indicadorNick?{indicadorNick}:{}),
    aceiteTermos:true,aceitePrivacidade:true,
    versaoTermos:documentos.termos.versao,hashTermos:documentos.termos.hash,
    versaoPrivacidade:documentos.privacidade.versao,
    hashPrivacidade:documentos.privacidade.hash,
    ...(captchaObrigatorio?{
     captchaId:captchaCadastroId,
     captchaResposta:$('captchaCadastroResposta').value.trim().toUpperCase()
    }:{})
   }});
   if(resposta.contaCriada!==true||resposta.pagamentoReal!==false)
    throw Error('OPERACAO_INDISPONIVEL');
  }catch(e){
   if(e.message==='DOCUMENTOS_ALTERADOS_RELER')await carregarDocumentos();
   if(captchaObrigatorio)await atualizarCaptchaCadastro();
   throw e;
  }
  $('login').value=$('cadastroNick').value;
  for(const id of ['cadastroSenha','cadastroConfirmarSenha','cadastroCpf',
   'cadastroTelefone'])$(id).value='';
  mostrarLogin('login');
  dizer('Cadastro concluído'+(indicadorNick?
   ' pelo link de @'+indicadorNick:'')+
   '. Entre com seu nick e senha no Escritório LOOP.');
 });
 onForm('formSolicitarRecuperacao',async()=>{
  await requisitar('/senha/solicitar',{method:'POST',
   body:{email:$('emailRecuperacao').value}});
  $('formConcluirRecuperacao').hidden=false;
  $('estadoRecuperacao').textContent=
   'Se o e-mail estiver cadastrado, você receberá um código.';
 });
 onForm('formConcluirRecuperacao',async()=>{
  await requisitar('/senha/confirmar',{method:'POST',body:{
   email:$('emailRecuperacao').value,codigo:$('codigoRecuperacao').value,
   novaSenha:$('senhaRecuperacao').value
  }});
  $('codigoRecuperacao').value='';$('senhaRecuperacao').value='';
  mostrarLogin('login');dizer('Senha alterada. Entre novamente.');
 });
 onForm('formTrocarSenha',async()=>{
  const resposta=await requisitar('/senha/trocar',{
   method:'POST',csrfObrigatorio:true,body:{
    senhaAtual:$('senhaAtual').value,novaSenha:$('novaSenha').value
   }
  });
  if(resposta.senhaAlterada!==true||resposta.sessoesRevogadas!==true)
   throw Error('OPERACAO_INDISPONIVEL');
  csrf=null;$('senhaAtual').value='';$('novaSenha').value='';
  mostrarLogin('login');dizer('Senha alterada; entre novamente.');
 });
 $('mudarParaCadastro').addEventListener('click',()=>{
  mostrarLogin('cadastro');void carregarDocumentos();
 });
 $('mudarParaLogin').addEventListener('click',()=>mostrarLogin('login'));
 $('abrirRecuperacao').addEventListener('click',()=>mostrarLogin('recuperacao'));
 $('voltarLogin').addEventListener('click',()=>mostrarLogin('login'));
 $('loop03AbrirPerfil').addEventListener('click',()=>void alternarDadosRodapeReal());
 const fotoTopoReal=$('loop03ImagemFotoTopo');
 if(fotoTopoReal)new MutationObserver(sincronizarFotoRodapeReal).observe(fotoTopoReal,{
  attributes:true,attributeFilter:['src','hidden']
 });
 sincronizarFotoRodapeReal();
 $('sair').addEventListener('click',async()=>{
  try{
   await requisitar('/sair',{method:'POST',body:{},csrfObrigatorio:true});
   csrf=null;mostrarLogin('login');dizer('Sessão encerrada.');
  }catch(e){dizer(erro(e));}
 });
 $('solicitarCodigoEmail').addEventListener('click',async()=>{
  $('solicitarCodigoEmail').disabled=true;
  try{
   await requisitar('/email/solicitar',{
    method:'POST',body:{},csrfObrigatorio:true
   });
   dizer('Se o envio foi aceito, seu código chegará por e-mail.');
  }catch(e){dizer(erro(e));}
  finally{$('solicitarCodigoEmail').disabled=false;}
 });
 onForm('formConfirmarEmail',async()=>{
  const resultado=await requisitar('/email/confirmar',{
   method:'POST',csrfObrigatorio:true,
   body:{codigo:$('codigoEmail').value}
  });
  if(resultado.emailVerificado!==true)throw Error('CODIGO_INVALIDO');
  const s=await requisitar('/me');painelConta(s);
  $('codigoEmail').value='';dizer('E-mail confirmado.');
 });
 for(const botao of document.querySelectorAll('[data-senha]')){
  botao.addEventListener('click',()=>{
   const campo=$(botao.dataset.senha);
   if(!campo)return;
   const mostrar=campo.type==='password';campo.type=mostrar?'text':'password';
   botao.setAttribute('aria-pressed',String(mostrar));
  });
 }
 $('atualizarPedidos')?.addEventListener('click',()=>void carregarPedidos());
 $('pedidosAnterior').addEventListener('click',()=>{
  if(paginaPedidosReal>0)void carregarPedidos(paginaPedidosReal-1);
 });
 $('pedidosProximo').addEventListener('click',()=>{
  if(totalPedidosReal!==null&&
     (paginaPedidosReal+1)*20<totalPedidosReal)
   void carregarPedidos(paginaPedidosReal+1);
 });
 // Financeiro real: botão de escolha, pedido protegido e histórico de
 // lançamentos do próprio titular. Sem integração Pix, nenhum saque ocorre.
 $('finEscolherBonus').addEventListener('click',()=>finSelecionarOrigemReal('BONUS_INDICACAO'));
 $('finEscolherPosicoes').addEventListener('click',()=>finSelecionarOrigemReal('POSICOES'));
 $('finAbrirHistorico').addEventListener('click',()=>void finHistoricoReal());
 $('finFormSaque').addEventListener('submit',e=>void finSaqueReal(e));
 for(const id of ['posicoesVerPedidos']){
  const botao=$(id);if(botao)botao.addEventListener('click',()=>{
   const aba=$('abaMeusPedidos');if(!aba.disabled)aba.click();
  });
 }
 $('loop03MenuIntegrado').addEventListener('click',()=>{
  const sidebar=$('loop03SidebarIntegrado');
  const aberto=sidebar.classList.toggle('loop03-aberto');
  $('loop03MenuIntegrado').setAttribute('aria-expanded',String(aberto));
 });
 // Mesmo carrossel de banners da primeira aba na interface protegida.
 const pistaResumo=$('loop03PistaBanners');
 const pontosResumo=[...document.querySelectorAll('[data-banner-resumo]')];
 if(pistaResumo&&pontosResumo.length===4){
  let indice=0,interagindo=false;
  const marcar=i=>{
   indice=i;
   pontosResumo.forEach((b,j)=>b.setAttribute('aria-current',String(i===j)));
  };
  const mover=i=>{
   marcar(i);
   pistaResumo.scrollTo({left:pistaResumo.clientWidth*i,
    behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
  };
  pontosResumo.forEach((b,i)=>b.addEventListener('click',()=>{
   interagindo=true;mover(i);
  }));
  pistaResumo.addEventListener('scroll',()=>{
   if(pistaResumo.clientWidth>0)
    marcar(Math.min(pontosResumo.length-1,Math.max(0,Math.round(
     pistaResumo.scrollLeft/pistaResumo.clientWidth))));
  },{passive:true});
  pistaResumo.addEventListener('pointerdown',()=>{interagindo=true;});
  pistaResumo.addEventListener('focusin',()=>{interagindo=true;});
  pistaResumo.addEventListener('focusout',()=>{interagindo=false;});
  pistaResumo.addEventListener('pointerleave',()=>{interagindo=false;});
  setInterval(()=>{
   if(document.hidden||$('conteudoResumo').hidden||interagindo||
    matchMedia('(prefers-reduced-motion:reduce)').matches)return;
   mover((indice+1)%pontosResumo.length);
  },6500);
  addEventListener('resize',()=>pistaResumo.scrollTo({
   left:pistaResumo.clientWidth*indice,behavior:'instant'
  }));
 }
 void requisitar('/me').then(s=>painelConta(s)).catch(()=>mostrarLogin('login'));
})();
