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
   const habilitado=['abaConta','abaEquipe','abaLinks'].includes(tab.id)||
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
   estado.textContent=p.estado==='QUALIFICACAO_ENSAIO'?
    'Indicação qualificada em ensaio · posição #'+p.posicaoDestinoEnsaio:
    p.estado==='COMPRA_ENSAIO_SEM_QUALIFICACAO'?
    'Compra em ensaio · aguardando qualificação':
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
   $('resumoEquipe').textContent=String(dados.total);
   $('redeAlocadasEnsaio').textContent=String(
    dados.resumo?.qualificadasEmEnsaio??0);
   $('redeADistribuirEnsaio').textContent=String(
    dados.resumo?.comprasAguardandoQualificacaoEnsaio??0);
   $('equipeResumo').textContent=dados.total+
    ' cadastro(s) pelo seu link · '+(dados.resumo?.comprasEmEnsaio??0)+
    ' compra(s) em ensaio · '+(dados.resumo?.qualificadasEmEnsaio??0)+
    ' indicação(ões) qualificadas em ensaio. Sem bonificação real.';
   exibirRede();
  }catch{
   $('equipeResumo').textContent='Sua rede não pôde ser consultada.';
  }finally{redePaginando=false;}
 }
 let painelMotorPreparado=false;
 function prepararAbasMotor(){
  if(painelMotorPreparado)return;
  painelMotorPreparado=true;
  $('boasVindas').textContent='Sua conta está conectada ao Escritório LOOP e à Loja AKITEMM.';
  $('resumoPedidos').textContent='—';
  $('resumoEquipe').textContent='—';
  for(const id of ['atualizarTabuleiroIntegrado','atualizarPosicoes']){
   $(id).addEventListener('click',()=>void carregarMotor());
  }
  $('atualizarResumo').addEventListener('click',()=>{
   void carregarDados();void carregarMotor();
  });
  $('tabuleiroVerPosicoesIntegrado').addEventListener('click',
   ()=>$('abaPosicoes').click());
  $('atalhoPosicoes').addEventListener('click',
   ()=>$('abaPosicoes').click());
  $('atalhoLoja').addEventListener('click',()=>location.assign('/loja'));
  $('atalhoPedidos').disabled=true;
  $('posicoesVerPedidos').disabled=true;
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
 function textoPosicao(p){
  return p&&Number.isSafeInteger(p.numero)&&p.numero>0?
   '#'+p.numero:'—';
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
    ' · Posições de ensaio por compra: '+
    (d.eventosComerciais?.promovidasSomenteEmEnsaio??0)+
    ' · Em revisão por estorno: '+
    (d.eventosComerciais?.emRevisaoPorEstornoEnsaio??0)+
    ' · Catraca (ensaio): '+d.catraca.estado+
    ' · Giros: '+d.catraca.giros+' · Eventos do ciclo: '+
    d.tabuleiro.eventosNoCiclo+'/6 · Pedidos comerciais pendentes: '+
    aguardando+' · Movimentação real indisponível.';
   $('loopResumoMotor').textContent=texto;
   $('estadoTabuleiroIntegrado').textContent=texto;
   $('motorFilaA').textContent=d.filaA+' posição(ões) em validação interna';
   $('motorFilaB').textContent=d.filaB+' posição(ões) em validação interna';
   $('tabuleiroMotorCentro').textContent=textoPosicao(d.tabuleiro.centro);
   for(let i=0;i<6;i++){
    const pos=d.tabuleiro.vagas[i],el=$('tabuleiroMotorVaga'+(i+1));
    el.textContent=textoPosicao(pos);
    el.title=pos?.minha?'Minha posição':'Espaço do tabuleiro';
    const luz=$('motorBolinha'+(i+1));
    luz.style.opacity=i<d.tabuleiro.eventosNoCiclo?'1':'.25';
    luz.setAttribute('aria-label','Evento '+(i+1)+
     (i<d.tabuleiro.eventosNoCiclo?' contabilizado':' aguardando'));
   }
   $('motorContadorEventos').textContent=d.tabuleiro.eventosNoCiclo+
    '/6 eventos de validação interna';
   $('resumoPosicoes').textContent=String(d.minhasPosicoes.length);
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
   }
   const painel=$('posicoesPainel');
   painel.replaceChildren();
   if(!d.minhasPosicoes.length){
    const vazio=document.createElement('p');
    vazio.textContent='Nenhuma posição ativa. Não há compras nem pagamentos reais habilitados.';
    painel.appendChild(vazio);
   }else{
    const grade=document.createElement('div');
    grade.className='loop03-grade-posicoes';
    for(const pos of d.minhasPosicoes.filter(p=>
     !posicaoSelecionada||String(p.numero)===posicaoSelecionada)){
     const card=document.createElement('article');
     card.className='loop03-unidade-posicao';
     const corpo=document.createElement('div');
     corpo.className='loop03-cartao-posicao';
     const id=document.createElement('strong');
     id.textContent='#'+pos.numero;
     const etapa=document.createElement('p');
     etapa.textContent=pos.local+' · '+pos.indicacoesQualificadasEnsaio+
      ' indicação(ões) em ensaio · pedido de ensaio '+
      pos.pedidoDeOrigemEnsaio+' · sem direito financeiro real';
     corpo.append(id,etapa);card.appendChild(corpo);grade.appendChild(card);
    }
    painel.appendChild(grade);
   }
  }catch{
   $('loopResumoMotor').textContent=
    'Motor interno indisponível. Não há transações reais.';
   $('estadoTabuleiroIntegrado').textContent='Estado indisponível; nenhum giro autorizado.';
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
   if(tab.id==='abaTabuleiro'||tab.id==='abaPosicoes')void carregarMotor();
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
 $('loop03MenuIntegrado').addEventListener('click',()=>{
  const sidebar=$('loop03SidebarIntegrado');
  const aberto=sidebar.classList.toggle('loop03-aberto');
  $('loop03MenuIntegrado').setAttribute('aria-expanded',String(aberto));
 });
 void requisitar('/me').then(s=>painelConta(s)).catch(()=>mostrarLogin('login'));
})();
