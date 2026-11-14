'use strict';
// Usa DOM, classes e identidade visual já aprovados do escritório LOOP.
// Não há catálogo, motor ou dinheiro "mock" nesta conta: áreas ainda não
// homologadas ficam inativas, sem exibir saldos ou posições fictícias.
(()=>{
 const $=id=>document.getElementById(id);
 const API='/api/contas';
 let csrf=null,documentos=null,carregando=false,tela='login';
 const ref=new URLSearchParams(location.search).get('ref');
 const indicadorNick=typeof ref==='string'&&/^[A-Za-z]{1,12}$/.test(ref)?
  ref.toLowerCase():null;
 let titularesIndicados=[],redePaginando=false;
 let posicaoSelecionada='';
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
  DOCUMENTOS_ALTERADOS_RELER:'Documentos atualizados. Leia e aceite a versão atual.',
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
  $('erroLogin').hidden=true;$('erroCadastro').hidden=true;
  const aviso=$('cadastroIndicadorAviso');
  if(aviso){
   aviso.hidden=!indicadorNick;
   aviso.textContent=indicadorNick?
    'Cadastro pelo convite de @'+indicadorNick+
    '. A indicação só será válida após uma compra confirmada.':'';
  }
 }
 function painelConta(s){
  csrf=s.csrf;
  $('painelLogin').hidden=true;
  $('painelCadastro').hidden=true;
  $('painelRecuperacao').hidden=true;
  $('painelConta').hidden=false;
  document.body.classList.add('loop03-logado');
  $('loop03NickIntegrado').textContent=s.nick;
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
    (ensaioAtivo&&tab.id==='abaFinanceiro');
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
  const indicators=document.querySelector('.loop03-indicadores');
  if(indicators)indicators.hidden=true;
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
  $('atualizarEquipe').addEventListener('click',()=>void carregarRede());
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
  const filtro=$('buscarEquipe').value.toLowerCase().trim();
  const dados=titularesIndicados.filter(p=>
   p.nick.toLowerCase().includes(filtro));
  if(!dados.length){
   const aviso=document.createElement('p');
   aviso.textContent='Nenhum cadastro encontrado por esse nick.';
   alvo.appendChild(aviso);return;
  }
  for(const p of dados){
   const item=document.createElement('div');
   item.className='loop03-equipe-linha';
   const nick=document.createElement('strong');
   nick.textContent='@'+p.nick;
   const estado=document.createElement('span');
   // Nunca anunciar qualificação de ensaio como compra real.
   estado.textContent=p.estado==='QUALIFICACAO_ENSAIO'?
    'Cadastro vinculado · sem confirmação comercial':
    p.estado==='COMPRA_ENSAIO_SEM_QUALIFICACAO'?
    'Cadastro vinculado · participação em análise':
    'Cadastro registrado · aguardando compra confirmada';
   item.append(nick,estado);alvo.appendChild(item);
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
    ' cadastro(s) pelo seu link. Bonificações somente após confirmação comercial.';
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
 function prepararAbasMotor(){
  if(painelMotorPreparado)return;
  painelMotorPreparado=true;
  visorCatraca.iniciar();
  window.setInterval(()=>{
   if(!document.hidden&&$('conteudoTabuleiro')?.hidden===false)
    void carregarMotor();
  },15000);
    for(const id of ['atualizarTabuleiroIntegrado','atualizarPosicoes']){
   $(id).addEventListener('click',()=>void carregarMotor());
  }
    $('tabuleiroVerPosicoesIntegrado').addEventListener('click',
   ()=>$('abaPosicoes').click());
    $('atalhoLoja').addEventListener('click',()=>location.assign('/loja'));
  // A aba de pedidos usa o livro comercial deste titular, nunca o LAB.
  $('loop03IrPosicoesIntegrado').addEventListener('click',()=>{
   proximaAbaVemDoQuadrado=true;
   $('abaPosicoes').click();
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
   $('estadoTabuleiroIntegrado').textContent=texto;
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
    const opcoes=d.minhasPosicoes.map(p=>String(p.numero));
    if(!opcoes.includes(posicaoSelecionada))posicaoSelecionada='';
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
    $('loop03NumeroIntegrado').textContent=
     posicaoSelecionada?'#'+posicaoSelecionada:'—';
   }
   // A quantidade de cartões deriva do MESMO limite enviado pelo motor;
   // não esconder vagas vazias nem fabricar posições/pedidos.
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
   for(let i=0;i<slots.length;i++){
    const pos=slots[i];
    const card=document.createElement('article');
    card.className='loop03-unidade-posicao';
    const corpo=document.createElement('div');
    corpo.className='loop03-cartao-posicao';
    const rotulo=document.createElement('strong');
    const vaga=somentePosicoesPeloQuadrado||posicaoSelecionada?
     ordenadas.findIndex(p=>p.numero===pos.numero)+1:i+1;
    rotulo.textContent='Posição '+vaga;
    corpo.appendChild(rotulo);
    const detalhe=document.createElement('p');
    if(!pos){
     corpo.classList.add('loop03-posicao-vazia');
     detalhe.textContent='Sem posição · Espaço disponível';
    }else{
     const id=document.createElement('strong');
     id.textContent='#'+pos.numero;
     corpo.appendChild(id);
     detalhe.textContent=pos.local+
      (somentePosicoesPeloQuadrado&&(pos.fila==='A'||pos.fila==='B')?' · Fila '+pos.fila:'')+
      (pos.classeProdutoOrigem?' · Produto '+pos.classeProdutoOrigem:'')+
      ' · '+pos.indicacoesQualificadasEnsaio+
      ' indicação(ões) em verificação. Sem crédito financeiro disponível.';
    }
    corpo.appendChild(detalhe);card.appendChild(corpo);
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
  }catch{
   $('loopResumoMotor').textContent=
    'Não foi possível carregar as posições. Tente atualizar.';
   $('estadoTabuleiroIntegrado').textContent=
    'Não foi possível atualizar o tabuleiro. Tente novamente.';
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
   if(tab.id==='abaFinanceiro')void carregarFinanceiroEnsaio();
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
  $('cadastroPrivacidade').disabled=!ok;
  $('formCadastro').querySelector('button[type=submit]').disabled=!ok;
  if(!ok){
   $('cadastroTermos').checked=false;
   $('cadastroPrivacidade').checked=false;
  }
 }
 async function carregarDocumentos(){
  if(carregando)return;
  carregando=true;documentos=null;documentosHabilitados(false);
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
   documentos=dados;documentosHabilitados(true);
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
 onForm('formLogin',async()=>{
  const login=await requisitar('/entrar',{method:'POST',body:{
   nick:$('login').value,senha:$('senha').value
  }});
  $('senha').value='';
  painelConta(login);dizer('Bem-vindo ao Escritório LOOP.');
 });
 onForm('formCadastro',async()=>{
  if(!documentos||!$('cadastroTermos').checked||
     !$('cadastroPrivacidade').checked)throw Error('DOCUMENTOS_ALTERADOS_RELER');
  try{
   const resposta=await requisitar('/cadastrar',{method:'POST',body:{
    nome:$('cadastroNome').value,nick:$('cadastroNick').value,
    email:$('cadastroEmail').value,senha:$('cadastroSenha').value,
    ...(indicadorNick?{indicadorNick}:{}),
    aceiteTermos:true,aceitePrivacidade:true,
    versaoTermos:documentos.termos.versao,hashTermos:documentos.termos.hash,
    versaoPrivacidade:documentos.privacidade.versao,
    hashPrivacidade:documentos.privacidade.hash
   }});
   if(resposta.contaCriada!==true||resposta.pagamentoReal!==false)
    throw Error('OPERACAO_INDISPONIVEL');
  }catch(e){
   if(e.message==='DOCUMENTOS_ALTERADOS_RELER')await carregarDocumentos();
   throw e;
  }
  $('login').value=$('cadastroNick').value;
  $('cadastroSenha').value='';
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
 $('atualizarPedidos').addEventListener('click',()=>void carregarPedidos());
 $('pedidosAnterior').addEventListener('click',()=>{
  if(paginaPedidosReal>0)void carregarPedidos(paginaPedidosReal-1);
 });
 $('pedidosProximo').addEventListener('click',()=>{
  if(totalPedidosReal!==null&&
     (paginaPedidosReal+1)*20<totalPedidosReal)
   void carregarPedidos(paginaPedidosReal+1);
 });
 for(const id of ['posicoesVerPedidos','financeiroVerPedidos']){
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
 if(pistaResumo&&pontosResumo.length===2){
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
    marcar(Math.min(1,Math.max(0,Math.round(
     pistaResumo.scrollLeft/pistaResumo.clientWidth))));
  },{passive:true});
  pistaResumo.addEventListener('pointerdown',()=>{interagindo=true;});
  pistaResumo.addEventListener('focusin',()=>{interagindo=true;});
  pistaResumo.addEventListener('focusout',()=>{interagindo=false;});
  pistaResumo.addEventListener('pointerleave',()=>{interagindo=false;});
  setInterval(()=>{
   if(document.hidden||$('conteudoResumo').hidden||interagindo||
    matchMedia('(prefers-reduced-motion:reduce)').matches)return;
   mover((indice+1)%2);
  },6500);
  addEventListener('resize',()=>pistaResumo.scrollTo({
   left:pistaResumo.clientWidth*indice,behavior:'instant'
  }));
 }
 void requisitar('/me').then(s=>painelConta(s)).catch(()=>mostrarLogin('login'));
})();
