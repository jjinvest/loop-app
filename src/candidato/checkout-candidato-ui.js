'use strict';
// Interface de HOMOLOGACAO LOCAL. Nao existe pagamento, cadastro, CPF ou
// posicao verdadeira. Nunca inserir valores da API via innerHTML.
const API='/staging';
const $=id=>document.getElementById(id);
let csrf=null,aba='conteudoResumo',proximaPaginaEquipe=null,
 paginaPedidos=0,carregamentoPedidos=0;
let telaAcesso='login';
let termosCadastroLidos=null,carregandoTermosCadastro=null;
let posicaoSelecionadaMotor=null;
let somentePosicoesPeloQuadrado=false;
const ABAS=[['abaResumo','conteudoResumo'],['abaTabuleiro','conteudoTabuleiro'],
 ['abaMeusPedidos','conteudoMeusPedidos'],['abaPosicoes','conteudoPosicoes'],
 ['abaEquipe','conteudoEquipe'],['abaLinks','conteudoLinks'],['abaFinanceiro','conteudoFinanceiro'],
 ['abaConta','conteudoConta']];
const moeda=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100);
const dizer=msg=>{$('mensagem').textContent=msg;};
const errosTraduzidos={
 CREDENCIAIS_INVALIDAS:'Nick ou senha incorretos. Confira os dados e tente novamente.',
 CONTA_TEMPORARIAMENTE_BLOQUEADA:'Muitas tentativas incorretas. Aguarde 15 minutos e tente novamente.',
 AUTENTICACAO_TEMPORARIAMENTE_OCUPADA:'Muitos acessos simultâneos. Aguarde um momento e tente novamente.',
 NICK_INVALIDO:'Seu nick deve ter apenas letras, com até 12 caracteres.',
 NOME_INVALIDO:'Confira o nome informado.',
 EMAIL_INVALIDO:'Confira o e-mail informado.',
 SENHA_INVALIDA:'Confira a senha informada.',
 CADASTRO_JA_EXISTENTE:'Este nick ou e-mail já está cadastrado. Use a opção Já tenho cadastro.',
 TERMOS_LAB_NAO_ACEITOS:'Marque a confirmação dos termos para continuar.',
 TERMOS_ALTERADOS_RELER:'Os termos foram atualizados. Leia a versão atual e confirme novamente.',
 CADASTRO_INDISPONIVEL:'O cadastro está indisponível. Tente novamente.',
 RECUPERACAO_EMAIL_INDISPONIVEL:'A recuperação por e-mail ainda não está configurada neste ambiente. Nenhuma senha foi alterada.',
 RECUPERACAO_CODIGO_OU_SENHA_INVALIDOS:'Código incorreto, expirado ou senha inválida. Confira os dados.'
};
function explicarErro(erro){
 return errosTraduzidos[erro.message]||'Não foi possível concluir. Verifique os dados e tente novamente.';
}
function mostrarErroAcesso(tipo,msg){
 const id=tipo==='login'?'erroLogin':'erroCadastro';
 const aviso=$(id);aviso.textContent=msg;aviso.hidden=!msg;
 if(msg)aviso.focus();
}
function selecionarTelaAcesso(tela){
 telaAcesso=tela;
 $('painelLogin').hidden=tela!=='login';
 $('painelCadastro').hidden=tela!=='cadastro';
 $('painelRecuperacao').hidden=tela!=='recuperacao';
 mostrarErroAcesso('login','');
 mostrarErroAcesso('cadastro','');
 dizer('');
 if(tela==='login')$('login').focus();
 else if(tela==='cadastro')$('cadastroNome').focus();
 else $('emailRecuperacao').focus();
}
async function requisitar(rota,{method='GET',body,chave,mutacao=false}={}){
 const resposta=await fetch(API+rota,{method,credentials:'same-origin',
  cache:'no-store',headers:{
   ...(body?{'Content-Type':'application/json'}:{}),
   ...(mutacao?{'X-Checkout-Csrf':csrf}:{}),
   ...(chave?{'Idempotency-Key':chave}:{})
  },...(body?{body:JSON.stringify(body)}:{})
 });
 const dados=await resposta.json().catch(()=>({}));
 if(!resposta.ok){
  if(resposta.status===401&&rota!=='/contas/entrar'&&rota!=='/contas/me')
   mostrarSessao(false);
  const erro=new Error(dados.erro||'SOLICITACAO_INDISPONIVEL');
  erro.status=resposta.status;throw erro;
 }
 return dados;
}
function mostrarSessao(ativa){
 document.body.classList.toggle('loop03-logado',ativa);
 if(!ativa)fecharMenuIntegrado();
 if(!ativa){$('painelVerificarEmail').hidden=true;$('painelIdentidadeTeste').hidden=true;
   $('cpfTeste').value='';$('aceiteCpfTeste').checked=false;}
 $('painelLogin').hidden=ativa||telaAcesso!=='login';
 $('painelCadastro').hidden=ativa||telaAcesso!=='cadastro';
 $('painelRecuperacao').hidden=ativa||telaAcesso!=='recuperacao';
 $('painelConta').hidden=!ativa;
 if(!ativa){csrf=null;
  $('senha').value='';proximaPaginaEquipe=null;paginaPedidos=0;}
}
function mostrarAba(alvo,{somenteMinhas=false}={}){
 if(alvo==='conteudoPosicoes')somentePosicoesPeloQuadrado=somenteMinhas;
 // Prioriza a seção escolhida na ordem REAL do documento, não apenas
 // em CSS: teclado, leitor de tela, PC e celular seguem o mesmo fluxo.
 const selecionado=$(alvo);
 const corpo=$('painelConta')?.querySelector('.loop03-corpo');
 const boasVindas=corpo?.querySelector('.loop03-boasvindas');
 const faixaResumo=corpo?.querySelector('.barra-conta');
 if(selecionado&&faixaResumo&&selecionado.parentElement===corpo){
  // Titulo, quatro indicadores e loja continuam acima da aba escolhida.
  // A aba permanece acima dos blocos auxiliares de confirmacao e identidade.
  faixaResumo.insertAdjacentElement('afterend',selecionado);
 }
 aba=alvo;
 for(const [id,painel] of ABAS){
  const ativo=painel===alvo,botao=$(id);
  botao.setAttribute('aria-selected',String(ativo));
  botao.tabIndex=ativo?0:-1;
  botao.setAttribute('aria-current',ativo?'page':'false');
  $(painel).hidden=!ativo;
 }
 fecharMenuIntegrado();
 // No celular, mostrar os quatro indicadores antes do conteudo selecionado.
 if(window.matchMedia('(max-width: 860px)').matches){
  requestAnimationFrame(()=>{
   if(aba===alvo&&!selecionado.hidden&&boasVindas)
    boasVindas.scrollIntoView({block:'start',behavior:'instant'});
  });
 }
 if(alvo==='conteudoTabuleiro')atualizarTabuleiroIntegrado();
 if(alvo==='conteudoMeusPedidos')atualizarPedidos();
 if(alvo==='conteudoResumo')atualizarResumo();
 if(alvo==='conteudoPosicoes')atualizarPosicoes();
 if(alvo==='conteudoEquipe')atualizarEquipe(0);
 if(alvo==='conteudoLinks')atualizarLinks();
 if(alvo==='conteudoConta')atualizarConta();
}
function exibirPedidos(pedidos){
 const area=$('listaPedidos');area.replaceChildren();
 if(!Array.isArray(pedidos)||pedidos.length===0){
  const p=document.createElement('p');p.textContent='Você ainda não tem pedidos.';
  area.append(p);return;
 }
 const estados={
  SEM_COBRANCA_SANDBOX:'Pedido registrado · sem cobrança',
  PREPARADA:'Pedido preparado · sem cobrança',
  CRIACAO_INDETERMINADA:'Confirmação do pedido em análise',
  PENDENTE_SANDBOX:'Confirmação da simulação pendente',
  RECEBIMENTO_INFORMADO_SANDBOX:'Recebimento simulado informado · sem pagamento real',
  REVERSAO_INFORMADA_SANDBOX:'Pedido em revisão',
  EXIGE_REVISAO:'Pedido em análise'
 };
 for(const pedido of pedidos){
  const artigo=document.createElement('article');artigo.className='pedido';
  const titulo=document.createElement('h3');titulo.textContent='Pedido '+pedido.prepedidoId;
  const resumo=document.createElement('p');
  resumo.textContent=(pedido.itens||[]).map(i=>i.nome+' × '+i.quantidade).join(', ')+
   ' · '+moeda(pedido.totalCentavos);
  const data=document.createElement('p');data.className='subtexto';
  data.textContent='Registrado em '+new Date(pedido.criadoEm).toLocaleString('pt-BR');
  const status=document.createElement('p');status.className='estado';
  status.textContent=estados[pedido.statusHomologacao]||'Acompanhamento do pedido em atualização';
  artigo.append(titulo,resumo,data,status);
  // O backend anuncia apenas PDFs vinculados a ESTE pedido, apos GET PSP
  // de ensaio conferido e sem reversao. Nenhum PDF tem URL publica.
  for(const produtoId of pedido.pdfProdutosDisponiveis||[]){
   const material=(pedido.itens||[]).find(x=>x.produtoId===produtoId&&x.tipo==='PDF');
   if(!material)continue;
   const link=document.createElement('a');
   link.href='/staging/meus-pedidos/'+encodeURIComponent(pedido.prepedidoId)+
    '/pdf/'+encodeURIComponent(produtoId);
   link.textContent='Baixar PDF: '+material.nome;
   link.setAttribute('download','curso-'+produtoId+'.pdf');
   link.className='botao';
   artigo.append(link);
  }
  if(pedido.compraSemNovaPosicao===true){
   const aviso=document.createElement('p');aviso.className='aviso';
   aviso.textContent=pedido.modalidadeDeParticipacao==='SEM_POSICOES_LIMITE'?
    'Compra de produto sem nova posição no LOOP: limite de 10 posições atingido.':
    'Compra comum de produto, sem geração de posição no LOOP.';
   artigo.append(aviso);
  }else if(Number.isSafeInteger(pedido.posicoesReservadas)&&
           pedido.posicoesReservadas>0){
   const detalhe=document.createElement('p');detalhe.className='subtexto';
   detalhe.textContent='Previsão: '+pedido.posicoesReservadas+
    ' posição(ões) pendente(s), ainda não ativada(s).';
   artigo.append(detalhe);
  }
  if(pedido.conferenciaPSPConcluida===true){
   const selo=document.createElement('p');selo.className='subtexto';
   selo.textContent='Recebimento conferido na simulação. Não representa pagamento real.';
   artigo.append(selo);
  }else if(pedido.situacaoOperacional==='WEBHOOK_RECEBIDO_AGUARDANDO_RECONSULTA'){
   const aviso=document.createElement('p');aviso.className='aviso';
   aviso.textContent='Atualização recebida. A confirmação do pedido ainda está em análise.';
   artigo.append(aviso);
  }
  if(pedido.revisaoManualObrigatoria){
   const aviso=document.createElement('p');aviso.className='aviso';
   aviso.textContent='Este pedido precisa de revisão antes de avançar.';
   artigo.append(aviso);
  }
  if(pedido.posicaoPendenteLaboratorio){
   const posicao=document.createElement('p');posicao.className='aviso';
   posicao.textContent='1 posição em análise na demonstração · nenhuma posição real criada.';
   artigo.append(posicao);
  }
  area.append(artigo);
 }
}
async function atualizarPedidos(){
 try{
  const requisicao=++carregamentoPedidos;
  const dados=await requisitar('/meus-pedidos?pagina='+paginaPedidos+'&tamanho=20');
  if(requisicao!==carregamentoPedidos)return;
  const pag=dados.paginacao||{pagina:0,haAnterior:false,haMais:false,total:dados.pedidos.length};
  paginaPedidos=pag.pagina;
  $('pedidosAnterior').disabled=!pag.haAnterior;
  $('pedidosProximo').disabled=!pag.haMais;
  $('pedidosPaginacao').textContent='Página '+(pag.pagina+1)+
   ' · '+pag.total+' pedido(s) no histórico';
  exibirPedidos(dados.pedidos);
  const previa=await requisitar('/minha-previa-filas');
  const resumo=$('minhaPreviaFilas');resumo.replaceChildren();
  const info=document.createElement('p');
  info.textContent='Registros anteriores: '+(previa.meusPendentesHistoricos||0)+
   ' · Estimativa na Fila B: '+(previa.meusSimuladosNaFilaB||0);
  resumo.append(info);
  const pre=await requisitar('/minhas-pre-adesoes');
  const historico=$('minhasPreAdesoes');historico.replaceChildren();
  if(!pre.registros.length){
   const aviso=document.createElement('p');
   aviso.textContent='Nenhuma solicitação anterior.';
   historico.append(aviso);
  }
  for(const registro of pre.registros){
   const artigo=document.createElement('article');artigo.className='pedido';
   const nome=document.createElement('strong'),descricao=document.createElement('p');
   nome.textContent=registro.prepedidoId;
   descricao.textContent=(registro.motivos.length?
     'Solicitação em análise. Consulte o pedido correspondente.':
     'Solicitação registrada para acompanhamento.');
   artigo.append(nome,descricao);historico.append(artigo);
  }

  const recados=await requisitar('/meus-comunicados');
  const area=$('comunicadosCliente');area.replaceChildren();
  if(!recados.comunicados.length){
   const vazio=document.createElement('p');
   vazio.textContent='Nenhum comunicado recebido.';area.append(vazio);
  }
  for(const c of recados.comunicados){
   const item=document.createElement('article');item.className='pedido';
   const id=document.createElement('strong');id.textContent=c.prepedidoId;
   const mensagem=document.createElement('p');mensagem.textContent=c.mensagem;
   item.append(id,mensagem);area.append(item);
  }
  dizer('Pedidos e comunicados atualizados.');
 }catch(e){dizer('Não foi possível carregar seus pedidos. Tente atualizar.');}
}
async function atualizarIdentidadeTeste(){
 const area=$('painelIdentidadeTeste'),form=$('formCpfTeste');
 try{
  const [termos,identidade]=await Promise.all([
   requisitar('/contas/termos-identidade'),
   requisitar('/contas/identidade')
  ]);
  if(!termos.disponivel||!termos.termosTexto||!termos.termosVersao)
   throw Error('TERMOS_NAO_CONFIGURADOS');
  area.hidden=false;
  // Preserva validação de termos no backend, sem renderizar o aviso LAB.
  $('termosCpfTexto').textContent='';
  form.hidden=identidade.registrado===true;
  $('situacaoCpfTeste').textContent=identidade.registrado?
   'CPF fictício registrado (final '+identidade.cpfFinal+'). Aceite armazenado.':
   'Identificação fictícia ainda não registrada.';
  if(identidade.registrado){$('cpfTeste').value='';$('aceiteCpfTeste').checked=false;}
 }catch(e){
  if(e.status===404){area.hidden=true;return;}
  area.hidden=false;form.hidden=true;
  $('situacaoCpfTeste').textContent='Identificação indisponível: '+e.message;
 }
}
async function registrarIdentidadeTeste(ev){
 ev.preventDefault();
 const botao=ev.submitter;botao.disabled=true;
 try{
  if(!$('aceiteCpfTeste').checked)throw Error('ACEITE_TERMOS_OBRIGATORIO');
  await requisitar('/contas/identidade',{
   method:'POST',body:{cpf:$('cpfTeste').value,
    aceiteExplicito:$('aceiteCpfTeste').checked},mutacao:true
  });
  $('cpfTeste').value='';$('aceiteCpfTeste').checked=false;
  await atualizarIdentidadeTeste();
  dizer('Identificação de ensaio vinculada à sua conta.');
 }catch(e){
  $('cpfTeste').value='';
  $('situacaoCpfTeste').textContent='Identificação não registrada: '+e.message;
 }finally{botao.disabled=false;}
}

async function atualizarVerificacaoEmail(){
 const res=await requisitar('/contas/me');
 $('painelVerificarEmail').hidden=res.confirmacaoEmailDisponivel!==true||
  res.emailVerificado===true;
}
async function solicitarCodigoEmail(){
 try{
  const r=await requisitar('/contas/email/enviar',{
   method:'POST',body:{},mutacao:true
  });
  if(r.envioDeclaradoPeloProvedor!==true)
   throw Error('ENVIO_NAO_CONFIRMADO');
  dizer('Código enviado pelo provedor de laboratório; confirme-o nesta conta.');
 }catch(e){dizer('Não foi possível enviar o código: '+e.message);}
}
async function confirmarCodigoEmail(e){
 e.preventDefault();
 const botao=$('formConfirmarEmail').querySelector('button');
 botao.disabled=true;
 try{
  const r=await requisitar('/contas/email/confirmar',{
   method:'POST',body:{codigo:$('codigoEmail').value},mutacao:true
  });
  if(r.emailVerificado!==true)throw Error('CODIGO_NAO_CONFIRMADO');
  $('codigoEmail').value='';
  await atualizarVerificacaoEmail();
  dizer('E-mail de laboratório confirmado. CPF e identidade externa continuam pendentes.');
 }catch(e){dizer('Falha ao conferir código: '+e.message);}
 finally{botao.disabled=false;}
}

async function atualizarResumo(){
 try{
  const [perfil,pedidos,filas,equipe,motor]=await Promise.all([
   requisitar('/contas/me'),requisitar('/meus-pedidos'),
   requisitar('/minha-previa-filas'),requisitar('/minha-equipe'),
   requisitar('/motor/estado')
  ]);
  $('boasVindas').textContent='Bem-vindo, '+perfil.nome+' · @'+perfil.nick;
  $('loop03NickIntegrado').textContent='@'+perfil.nick;
  $('loop03TotalIntegrado').textContent=String(motor.posicoesAtivasDoTitular)+' / '+
   String(motor.limitePosicoesAtivas);
  $('loop03Giros24Integrado').textContent=String(motor.catraca.giros24h);
  const selecionada=motor.minhasPosicoes.find(x=>x.numero===posicaoSelecionadaMotor);
  if(!selecionada)posicaoSelecionadaMotor=null;
  $('loop03NumeroIntegrado').textContent=selecionada?'#'+selecionada.numero:'—';
  $('resumoEmail').textContent=perfil.emailVerificado?'Confirmado':'Pendente';
  $('linksNick').textContent='Seu nick: @'+perfil.nick;
 }catch(e){dizer('Não foi possível atualizar seus dados. Tente novamente.');}
}
const visualTabuleiro=window.LoopTabuleiroVisual.criar({elemento:$});
async function atualizarTabuleiroIntegrado(){
 const estado=$('estadoTabuleiroIntegrado');
 try{
  const motor=await requisitar('/motor/estado');
  if(motor.origem!=='MOTOR_LOOP_EXISTENTE_COM_SQLITE_DA_CONTA'||
     motor.autorizacaoComercial!==false||motor.dinheiroReal!==false)
   throw Error('FONTE_MOTOR_INCOMPATIVEL');
  visualTabuleiro.preencherFila('motorFilaA',motor.filaA,'A');
  visualTabuleiro.preencherFila('motorFilaB',motor.filaB,'B');
  visualTabuleiro.preencherVaga('tabuleiroMotorCentro',motor.tabuleiro.centro,true);
  motor.tabuleiro.vagas.forEach((p,i)=>
   visualTabuleiro.preencherVaga('tabuleiroMotorVaga'+(i+1),p));
  visualTabuleiro.preencherLuzes(motor.tabuleiro.eventosNoCiclo);
  $('motorContadorEventos').textContent=motor.tabuleiro.eventosNoCiclo+
   ' de 6 eventos neste ciclo';
  $('loop03Giros24Integrado').textContent=String(motor.catraca.giros24h);
  visorCatraca.registrarAgenda(motor.agenda);
  visorCatraca.observar(motor.catraca.giros,
   motor.tabuleiro.eventosNoCiclo);
  const movimento=motor.agenda?.modoExecucao==='STOP'?
   'Movimentos pausados conforme a programação.':
   motor.agenda?.modoExecucao==='AGENDADA'?
    'Movimentos conforme os horários programados.':
    'Acompanhe os movimentos da catraca.';
  estado.textContent=motor.tabuleiro.eventosNoCiclo+
   ' de 6 eventos neste ciclo. '+movimento;
 }catch(e){
  estado.textContent='Não foi possível carregar o tabuleiro. Tente novamente.';
 }
}
function fecharMenuIntegrado(){
 const menu=$('loop03SidebarIntegrado'),botao=$('loop03MenuIntegrado');
 if(menu)menu.classList.remove('loop03-aberto');
 if(botao)botao.setAttribute('aria-expanded','false');
}
function alternarMenuIntegrado(){
 const menu=$('loop03SidebarIntegrado'),botao=$('loop03MenuIntegrado');
 const aberto=menu.classList.toggle('loop03-aberto');
 botao.setAttribute('aria-expanded',String(aberto));
}
// Os cartoes usam EXCLUSIVAMENTE a leitura da propria conta no SQLite.
 // Nao mostram posicoes comerciais nem numero do tabuleiro sem o motor real.
async function atualizarPosicoes(){
 const area=$('posicoesPainel');
 try{
  const [dados,motor,identidade,termos]=await Promise.all([
   requisitar('/minha-previa-filas'),requisitar('/motor/estado'),
   requisitar('/contas/identidade').catch(()=>({registrado:false})),
   requisitar('/contas/termos-identidade').catch(()=>({disponivel:false}))
  ]);
  const historicos=Array.isArray(dados.pendencias)?dados.pendencias:[];
  const ativas=Array.isArray(motor.minhasPosicoes)?motor.minhasPosicoes:[];
  const historicosExtras=historicos.filter(h=>
   !ativas.some(p=>p.prepedidoId&&p.prepedidoId===h.prepedidoId));
  const resumo=document.createElement('p');
  resumo.className='subtexto';
  resumo.textContent='Posições em acompanhamento: '+ativas.length+
   '/10 · Pedidos anteriores: '+historicos.length+
   '.';
  const grade=document.createElement('div');
  grade.className='loop03-grade-posicoes-ensaio';
  grade.setAttribute('role','list');
  grade.setAttribute('aria-label',somentePosicoesPeloQuadrado?
   'Posições da própria conta':'Dez espaços de posições da própria conta');
  const estados={
   APENAS_PREVIA_FILA_B_AZUL:'Aguardando confirmação · Fila B',
   EXIGE_REVISAO_PSP:'Pedido em análise',
   SEM_FOTOGRAFIA_HISTORICA:'Informações do pedido em análise',
   OFERTA_HISTORICA_NAO_QUALIFICADA:'Pedido sem posição',
   ACIMA_DEZ_APENAS_PARA_PLANEJAMENTO:'Limite de posições atingido'
  };
  const quantidade= somentePosicoesPeloQuadrado?ativas.length:10;
  for(let i=0;i<quantidade;i++){
   const posicao=ativas[i]||null;
   const registro=somentePosicoesPeloQuadrado?
    null:posicao?null:historicosExtras[i-ativas.length]||null;
   const cartao=document.createElement('article');
   cartao.className='loop03-cartao-posicao-ensaio'+
    (posicao?.pendente||registro?' loop03-cartao-posicao-pendente':'')+
    (posicao?.aceiteIndividualRegistrado?' loop03-cartao-posicao-aceito':'')+
    (posicao?.numero===posicaoSelecionadaMotor?' loop03-cartao-motor-selecionado':'');
   cartao.setAttribute('role','listitem');
   const nome=document.createElement('h3');
   nome.textContent='Posição '+(i+1);
   const numero=document.createElement('strong');
   numero.textContent=posicao?'#'+posicao.numero:
    registro?'AGUARDANDO':'Espaço disponível';
   const status=document.createElement('p');
   status.textContent=posicao?('Local: '+posicao.local+
    (posicao.fila?(somentePosicoesPeloQuadrado?' · Fila ':' ')+posicao.fila:'')+
    ' · Indicações: '+(posicao.indicacoesVinculadas||0)+
    (posicao.pendente?' · aguardando confirmação':'')):
    registro?(estados[registro.estado]||'Registro em revisão'):'Sem posição vinculada';
   cartao.append(nome,numero,status);
   if(posicao?.aceiteIndividualRegistrado){
    const aceite=document.createElement('small');
    aceite.textContent='Termos confirmados · verificação externa ainda pendente.';
    cartao.append(aceite);
   }
   if(posicao?.pendente){
    const formulario=document.createElement('form');
    formulario.className='loop03-form-aceite-posicao';
    const explicacao=document.createElement('small');
    explicacao.textContent=identidade.registrado?
     'CPF já vinculado à conta (final '+identidade.cpfFinal+'). Confirme os termos desta posição.':
     'Cadastre primeiro um CPF fictício na área Minha Conta para habilitar o aceite desta posição.';
    formulario.append(explicacao);
    if(identidade.registrado&&termos.disponivel){
     const rotulo=document.createElement('label');
     const caixa=document.createElement('input');
     caixa.type='checkbox';caixa.required=true;
     rotulo.append(caixa,document.createTextNode(
      ' Li e aceito os termos desta posição (versão '+termos.termosVersao+').'));
     const botaoAceite=document.createElement('button');
     botaoAceite.type='submit';botaoAceite.textContent='Confirmar termos desta posição';
     formulario.append(rotulo,botaoAceite);
     formulario.addEventListener('submit',async ev=>{
      ev.preventDefault();
      if(!caixa.checked)return;
      botaoAceite.disabled=true;
      try{
       const resultado=await requisitar('/motor/posicoes/confirmar-ensaio',{
        method:'POST',mutacao:true,
        body:{posicaoId:posicao.numero,versaoTermos:termos.termosVersao,
         aceiteExplicito:true}
       });
       if(resultado.aceiteIndividualRegistrado!==true)throw Error('ACEITE_NAO_REGISTRADO');
       dizer('Termos confirmados para a posição #'+posicao.numero+'.');
       await atualizarPosicoes();
       if(aba==='conteudoTabuleiro')await atualizarTabuleiroIntegrado();
      }catch(e){dizer('Não foi possível confirmar a posição #'+posicao.numero+': '+e.message);
       botaoAceite.disabled=false;}
     });
    }
    cartao.append(formulario);
   }
   if(posicao){
    const botao=document.createElement('button');botao.type='button';
    botao.textContent='Selecionar esta posição';
    botao.addEventListener('click',()=>{
     posicaoSelecionadaMotor=posicao.numero;
     $('loop03NumeroIntegrado').textContent='#'+posicao.numero;
     atualizarPosicoes();
    });
    cartao.append(botao);
   }else if(registro){
    const origem=document.createElement('small');
    origem.textContent='Pedido de origem: '+String(registro.prepedidoId||'Não identificado');
    cartao.append(origem);
   }
   grade.append(cartao);
  }
  if(somentePosicoesPeloQuadrado&&ativas.length===0){
   const exemplo=document.createElement('article');
   exemplo.className='loop03-cartao-posicao-ensaio';
   exemplo.setAttribute('data-exemplo-visual','true');
   exemplo.setAttribute('role','listitem');
   const titulo=document.createElement('h3');
   titulo.textContent='DEMONSTRAÇÃO — posição fictícia';
   const numero=document.createElement('strong');
   numero.textContent='#EXEMPLO (não é sua posição)';
   const detalhes=document.createElement('p');
   detalhes.textContent='Fila B · Aguardando confirmação · Indicações: 0';
   const avisoExemplo=document.createElement('small');
   avisoExemplo.textContent='Exemplo visual. Você tem 0 posições reais. Nenhuma compra ou giro foi criado.';
   exemplo.append(titulo,numero,detalhes,avisoExemplo);
   grade.append(exemplo);
  }
  const aviso=document.createElement('p');aviso.className='subtexto';
  const fora=Math.max(0,historicosExtras.length-(10-ativas.length));
  aviso.textContent=somentePosicoesPeloQuadrado?
   (ativas.length?'Mostrando apenas suas '+ativas.length+' posição(ões) reais.':
    'Você ainda não possui posições; o cartão acima é só uma demonstração.'):
   fora?'Outros '+fora+' registros permanecem no histórico de pedidos. O limite de 10 aplica-se a posições ativas, não aos pedidos passados.':
   'Acompanhe suas posições nesta área.';
  area.replaceChildren(resumo,grade,aviso);
 }catch(e){
  area.replaceChildren();
  const erro=document.createElement('p');
  erro.textContent='Não foi possível carregar suas posições. Tente atualizar.';
  area.append(erro);
 }
}
let sequenciaEquipe=0,temporizadorBuscaEquipe=null;
function elementoEquipe(tag,classe,texto){
 const el=document.createElement(tag);
 if(classe)el.className=classe;
 if(texto!==undefined)el.textContent=texto;
 return el;
}
function criarBotaoAlocacao(pessoa){
 const botao=elementoEquipe('button','loop03-rede-acao-alocar',
  'Alocar indicação à posição selecionada');
 botao.type='button';
 botao.addEventListener('click',async()=>{
  if(!Number.isSafeInteger(posicaoSelecionadaMotor)){
   dizer('Abra Minhas Posições e escolha qual posição receberá a indicação.');
   return;
  }
  botao.disabled=true;
  try{
   const resultado=await requisitar('/minha-equipe/indicacoes/qualificar-ensaio',{
    method:'POST',mutacao:true,
    body:{indicadoId:pessoa.indicadoId,posicaoAlvoId:posicaoSelecionadaMotor}
   });
   if(resultado.qualificada!==true)throw Error('INDICACAO_NAO_QUALIFICADA');
   dizer('Indicação de ensaio atribuída à posição #'+
    posicaoSelecionadaMotor+' · consulte a fila A no tabuleiro.');
   await atualizarEquipe(0);await atualizarPosicoes();
   if(aba==='conteudoTabuleiro')await atualizarTabuleiroIntegrado();
  }catch(e){
   dizer('Indicação não atribuída: '+e.message+
    '. Confirme o aceite da posição e a compra Pix Sandbox do indicado.');
   botao.disabled=false;
  }
 });
 return botao;
}
function renderizarIndicadoNaRede(pessoa){
 const numero=Number.isSafeInteger(pessoa.numeroCadastro)&&pessoa.numeroCadastro>0?
  pessoa.numeroCadastro:null;
 const validada=pessoa.qualificadaEnsaio===true;
 const possuiPosicao=pessoa.possuiPosicaoDeEnsaio===true;
 const cor=validada?'verde':possuiPosicao?'azul':'vermelho';
 const status=validada?'Vinculada no ensaio':possuiPosicao?
  'Posição em teste':'Cadastro realizado';
 const cartao=elementoEquipe('article','loop03-rede-pessoa');
 cartao.dataset.estado=cor;
 if(numero!==null)cartao.dataset.numeroCadastro=String(numero);
 const cabecalho=elementoEquipe('div','loop03-rede-pessoa-cabecalho');
 const marca=elementoEquipe('span','loop03-rede-pessoa-numero',
  numero!==null?'#'+String(numero).padStart(4,'0'):'#—');
 marca.title='Ordem de cadastro na sua rede, não é o ID da posição.';
 const luz=elementoEquipe('span','loop03-rede-pessoa-luz');
 luz.setAttribute('aria-hidden','true');
 const nome=elementoEquipe('strong','loop03-rede-pessoa-nick','@'+pessoa.nick);
 const statusTxt=elementoEquipe('span','loop03-rede-pessoa-status',status);
 const botao=elementoEquipe('button','loop03-rede-pessoa-menu','⋮');
 botao.type='button';botao.setAttribute('aria-label','Detalhes de @'+pessoa.nick);
 botao.setAttribute('aria-expanded','false');
 const conteudo=elementoEquipe('div','loop03-rede-pessoa-detalhes');
 conteudo.hidden=true;
 const detalhar=()=>{
  const abrir=conteudo.hidden;
  for(const outro of $('listaEquipe').querySelectorAll('.loop03-rede-pessoa-detalhes')){
   outro.hidden=true;
   const toggle=outro.parentElement.querySelector('.loop03-rede-pessoa-menu');
   if(toggle)toggle.setAttribute('aria-expanded','false');
  }
  conteudo.hidden=!abrir;botao.setAttribute('aria-expanded',String(abrir));
 };
 botao.addEventListener('click',detalhar);
 cabecalho.append(marca,luz,nome,statusTxt,botao);
 const info=elementoEquipe('div','loop03-rede-pessoa-info');
 info.append(
  elementoEquipe('span',null,'Telefone: não disponibilizado nesta prévia'),
  elementoEquipe('span',null,'Cadastro: '+new Date(pessoa.registradoEm).toLocaleDateString('pt-BR')),
  elementoEquipe('span',null,'Fila: não informada')
 );
 conteudo.append(elementoEquipe('p','subtexto',
  'Nome civil e telefone exigem autorização de compartilhamento. '+
  'Este cadastro foi feito por seu link e não comprova uma venda comercial.'));
 if(validada){
  conteudo.append(elementoEquipe('p','loop03-rede-pessoa-vinculo',
   'Atribuída à posição de ensaio #'+pessoa.posicaoAlvoId+
   ' · nenhuma comissão real.'));
 }else if(possuiPosicao){
  conteudo.append(criarBotaoAlocacao(pessoa));
 }else{
  conteudo.append(elementoEquipe('p','subtexto',
   'Aguardando compra elegível e conciliação Sandbox do indicado.'));
 }
 cartao.append(cabecalho,info,conteudo);
 return cartao;
}
async function atualizarEquipe(pagina=0){
 const tentativa=++sequenciaEquipe;
 const busca=$('buscarEquipe').value.trim().replace(/^@/,'');
 try{
  const rota='/minha-equipe?pagina='+pagina+(busca?'&busca='+encodeURIComponent(busca):'');
  const dados=await requisitar(rota);
  if(tentativa!==sequenciaEquipe)return;
  if(pagina===0)$('listaEquipe').replaceChildren();
  $('redeTotalCadastros').textContent=String(dados.total);
  $('redeAlocadasEnsaio').textContent=String(dados.indicacoesQualificadas);
  // Não representar pessoas sem pedido conciliado como "a distribuir".
  $('redeADistribuirEnsaio').textContent='—';
  $('equipeResumo').textContent=busca?
   dados.totalFiltrado+' resultado(s) encontrados · '+dados.total+
   ' cadastro(s) na sua rede.':
   dados.total+' cadastro(s) pelo seu link · '+dados.indicacoesQualificadas+
   ' indicação(ões) vinculada(s).';
  if(pagina===0&&dados.totalFiltrado===0){
   const vazio=elementoEquipe('p','loop03-rede-vazia',busca?
    'Nenhum cadastro encontrado. Procure por nick ou número do cadastro.':
    'Sua rede ainda não possui cadastros. Compartilhe o link em Meus Links.');
   $('listaEquipe').append(vazio);
  }
  for(const pessoa of dados.cadastros)$('listaEquipe').append(renderizarIndicadoNaRede(pessoa));
  proximaPaginaEquipe=dados.proximaPagina;
  $('maisEquipe').hidden=proximaPaginaEquipe===null;
 }catch(e){
  if(tentativa!==sequenciaEquipe)return;
  $('equipeResumo').textContent='Não foi possível carregar sua equipe. Tente novamente.';
 }
}
async function atualizarLinks(){
 try{
  const perfil=await requisitar('/contas/me');
  $('linksNick').textContent='Seu nick: @'+perfil.nick;
  $('linkLoja').value=location.origin+'/loja/'+perfil.nick;
  $('linkEscritorio').value=location.origin+'/escritorio/'+perfil.nick;
 }catch(e){dizer('Não foi possível consultar seus links: '+e.message);}
}
async function copiarLink(id){
 const campo=$(id);
 try{
  if(!campo.value)throw Error('LINK_NAO_DISPONIVEL');
  await navigator.clipboard.writeText(campo.value);
  dizer('Link copiado.');
 }catch{
  campo.focus();campo.select();
  dizer('Selecione e copie o link mostrado.');
 }
}
async function atualizarConta(){
 try{
  const perfil=await requisitar('/contas/me');
  $('perfilCliente').textContent='Nome: '+perfil.nome+
   ' · Nick: @'+perfil.nick+
   ' · E-mail: '+(perfil.emailVerificado?'confirmado':'não confirmado')+
   '. Identidade comercial: pendente.';
   $('novoNickGrafia').value=perfil.nick;
   $('avisoGrafiaNick').textContent=perfil.nickGrafiaConfirmada?
    'Grafia confirmada. Para alterar somente as letras maiúsculas e minúsculas, informe sua senha.':
    'Conta antiga: confirme como seu nick deve aparecer e ser digitado no próximo acesso.';
 }catch(e){$('perfilCliente').textContent='Perfil indisponível: '+e.message;}
}
async function confirmarGrafiaNick(e){
 e.preventDefault();
 const botao=$('formGrafiaNick').querySelector('button[type=submit]');
 botao.disabled=true;
 const status=$('estadoGrafiaNick');
 status.textContent='';
 try{
  const resposta=await requisitar('/contas/nick/grafia',{
   method:'POST',mutacao:true,
   body:{novoNick:$('novoNickGrafia').value,
    senhaAtual:$('senhaNickGrafia').value}
  });
  if(resposta.grafiaConfirmada!==true)throw Error('NICK_NAO_CONFIRMADO');
  $('senhaNickGrafia').value='';
  await Promise.all([atualizarConta(),atualizarResumo(),atualizarLinks()]);
  status.textContent='Nick confirmado: @'+resposta.nick+
   '. Nos próximos acessos, use exatamente esta grafia.';
 }catch(err){
  $('senhaNickGrafia').value='';
  status.textContent='Não foi possível confirmar o nick: '+explicarErro(err);
 }finally{botao.disabled=false;}
}
async function trocarSenha(e){
 e.preventDefault();
 const botao=$('formTrocarSenha').querySelector('button');
 botao.disabled=true;
 try{
  const anterior=$('senhaAtual').value,nova=$('novaSenha').value;
  const resultado=await requisitar('/contas/senha',{method:'POST',
   body:{senhaAtual:anterior,novaSenha:nova},mutacao:true});
  if(resultado.senhaAlterada!==true||resultado.todasSessoesRevogadas!==true)
   throw Error('TROCA_SENHA_NAO_CONFIRMADA');
  $('senhaAtual').value='';$('novaSenha').value='';
  mostrarSessao(false);
  dizer('Senha alterada. Todas as sessões foram encerradas; entre com sua nova senha.');
 }catch(err){
  $('senhaAtual').value='';$('novaSenha').value='';
  dizer('Não foi possível alterar a senha: '+err.message);
 }finally{botao.disabled=false;}
}
async function autenticarConta(nick,senha){
 const dados=await requisitar('/contas/entrar',{method:'POST',
  body:{nick,senha}});
 csrf=dados.csrf;mostrarSessao(true);$('senha').value='';
 if(new URLSearchParams(location.search).get('destino')==='loja'){
  location.assign('/loja');return;
 }
 await atualizarVerificacaoEmail();
 await atualizarIdentidadeTeste();
 mostrarAba('conteudoResumo');
 return dados;
}

async function entrar(e){
 e.preventDefault();
 const botao=$('formLogin').querySelector('button[type=submit]');
 botao.disabled=true;dizer('Validando conta de homologação...');
 try{
  await autenticarConta($('login').value,$('senha').value);
  mostrarErroAcesso('login','');
  dizer('Bem-vindo ao seu Escritório. Seus dados estão disponíveis nas abas.');
 }catch(err){mostrarErroAcesso('login',explicarErro(err));}
 finally{botao.disabled=false;}
}

async function sair(){
 try{await requisitar('/contas/sair',{method:'POST',mutacao:true});}
 catch(e){dizer('Falha ao encerrar: '+e.message);return;}
 mostrarSessao(false);$('listaPedidos').replaceChildren();$('comunicadosCliente').replaceChildren();$('minhaPreviaFilas').replaceChildren();$('minhasPreAdesoes').replaceChildren();
 dizer('Sessão de homologação encerrada.');
}
async function restaurarSessao(){
 try{
  const s=await requisitar('/contas/me');csrf=s.csrf;
  mostrarSessao(true);
  await atualizarVerificacaoEmail();
  await atualizarIdentidadeTeste();
  dizer('Sua sessão foi restaurada.');
  mostrarAba('conteudoResumo');
 }catch(e){mostrarSessao(false);dizer('');}
}
async function carregarTermosCadastro(){
 if(carregandoTermosCadastro)return carregandoTermosCadastro;
 const botao=$('formCadastro').querySelector('button[type=submit]');
 termosCadastroLidos=null;
 $('cadastroTermos').checked=false;
 $('cadastroTermos').disabled=true;
 botao.disabled=true;
 carregandoTermosCadastro=(async()=>{
  try{
   const dados=await requisitar('/contas/termos-cadastro');
   if(dados.somenteEnsaio!==true||dados.cadastroRealHabilitado!==false||
      typeof dados.termosVersao!=='string'||!dados.termosVersao.startsWith('LAB-')||
      typeof dados.termosTexto!=='string'||dados.termosTexto.length<40||
      typeof dados.termosHash!=='string'||!/^[a-f0-9]{64}$/.test(dados.termosHash))
    throw Error('TERMOS_NAO_CONFIGURADOS');
   $('versaoTermosCadastro').textContent='';
   $('textoTermosCadastro').textContent=dados.termosTexto;
   termosCadastroLidos={versao:dados.termosVersao,hash:dados.termosHash};
   $('cadastroTermos').disabled=false;
   botao.disabled=false;
  }catch{
   $('versaoTermosCadastro').textContent='Termos indisponíveis';
   $('textoTermosCadastro').textContent=
    'Não é possível concluir o cadastro sem apresentar os termos. Tente abrir o cadastro novamente.';
  }finally{carregandoTermosCadastro=null;}
 })();
 return carregandoTermosCadastro;
}

async function cadastrar(e){
 e.preventDefault();
 if(!termosCadastroLidos||!$('cadastroTermos').checked){
  mostrarErroAcesso('cadastro','Leia e confirme os termos exibidos para criar a conta.');
  return;
 }
 const botao=$('formCadastro').querySelector('button');
 const senha=$('cadastroSenha').value;
 const confirmacao=$('cadastroConfirmarSenha').value;
 const telefone=$('cadastroTelefone').value.replace(/[^0-9]/g,'');
 if(senha!==confirmacao){
  mostrarErroAcesso('cadastro','A confirmação da senha deve ser idêntica.');
  return;
 }
 if(!/^(?:[0-9]{10,11}|55[0-9]{10,11})$/.test(telefone)){
  mostrarErroAcesso('cadastro','Informe um telefone válido com DDD.');
  return;
 }
 botao.disabled=true;
 try{
  const nick=$('cadastroNick').value;
  const r=await requisitar('/contas/cadastrar',{method:'POST',
   body:{
    nome:$('cadastroNome').value,
    nick,email:$('cadastroEmail').value,telefone,senha,confirmarSenha:confirmacao,
    aceiteExplicito:$('cadastroTermos').checked,
    termosVersaoAceita:termosCadastroLidos.versao,
    termosHashAceito:termosCadastroLidos.hash
   }
  });
  if(r.contaCriada!==true||r.pagamentoPermitido!==false)
   throw Error('CADASTRO_INCOMPATIVEL');
  $('login').value=nick;
  $('cadastroSenha').value='';$('cadastroConfirmarSenha').value='';
  selecionarTelaAcesso('login');
  dizer('Cadastro concluído. Agora entre com seu nick e a senha que você escolheu.');
 }catch(e){
  mostrarErroAcesso('cadastro',explicarErro(e));
  if(e.message==='TERMOS_ALTERADOS_RELER'){
   $('cadastroTermos').checked=false;
   void carregarTermosCadastro();
  }
 }finally{botao.disabled=!termosCadastroLidos;}
}

function alternarVisibilidade(botao){
 const campo=$(botao.dataset.senha);
 if(!campo)return;
 const visivel=campo.type==='password';
 campo.type=visivel?'text':'password';
 botao.setAttribute('aria-pressed',String(visivel));
 botao.setAttribute('aria-label',visivel?'Ocultar senha':'Mostrar senha');
 botao.title=visivel?'Ocultar senha':'Mostrar senha';
 campo.focus({preventScroll:true});
}
async function solicitarRecuperacao(e){
 e.preventDefault();
 const botao=$('formSolicitarRecuperacao').querySelector('button[type=submit]');
 botao.disabled=true;
 const estado=$('estadoRecuperacao');
 estado.textContent='Solicitando envio de código...';
 try{
  await requisitar('/contas/recuperar-senha',{method:'POST',
   body:{email:$('emailRecuperacao').value}});
  estado.textContent='Se o e-mail estiver cadastrado, você receberá um código. Confira também a caixa de spam.';
  $('formConcluirRecuperacao').hidden=false;
 }catch(err){
  estado.textContent=explicarErro(err);
  $('formConcluirRecuperacao').hidden=true;
 }finally{botao.disabled=false;estado.focus();}
}
async function confirmarRecuperacao(e){
 e.preventDefault();
 const botao=$('formConcluirRecuperacao').querySelector('button[type=submit]');
 botao.disabled=true;
 const estado=$('estadoRecuperacao');
 try{
  const resultado=await requisitar('/contas/redefinir-senha',{method:'POST',
   body:{email:$('emailRecuperacao').value,codigo:$('codigoRecuperacao').value,
    novaSenha:$('senhaRecuperacao').value}});
  if(resultado.senhaRedefinida!==true||resultado.todasSessoesRevogadas!==true)
   throw Error('RECUPERACAO_CODIGO_OU_SENHA_INVALIDOS');
  $('codigoRecuperacao').value='';$('senhaRecuperacao').value='';
  $('formConcluirRecuperacao').hidden=true;
  selecionarTelaAcesso('login');
  dizer('Senha redefinida. Entre com seu nick e sua nova senha.');
 }catch(err){
  $('codigoRecuperacao').value='';
  $('senhaRecuperacao').value='';
  estado.textContent=explicarErro(err);
  estado.focus();
 }finally{botao.disabled=false;}
}

$('mudarParaLogin').addEventListener('click',()=>selecionarTelaAcesso('login'));
$('abrirRecuperacao').addEventListener('click',()=>{
 $('formConcluirRecuperacao').hidden=true;
 $('estadoRecuperacao').textContent='';
 selecionarTelaAcesso('recuperacao');
});
$('voltarLogin').addEventListener('click',()=>selecionarTelaAcesso('login'));
$('formSolicitarRecuperacao').addEventListener('submit',solicitarRecuperacao);
$('formConcluirRecuperacao').addEventListener('submit',confirmarRecuperacao);
for(const botao of document.querySelectorAll('[data-senha]'))
 botao.addEventListener('click',()=>alternarVisibilidade(botao));
$('mudarParaCadastro').addEventListener('click',()=>{
 selecionarTelaAcesso('cadastro');
 if(!termosCadastroLidos)void carregarTermosCadastro();
});
$('formLogin').addEventListener('input',()=>mostrarErroAcesso('login',''));
$('formCadastro').addEventListener('input',()=>mostrarErroAcesso('cadastro',''));
$('formCadastro').addEventListener('submit',cadastrar);
$('solicitarCodigoEmail').addEventListener('click',solicitarCodigoEmail);
$('formConfirmarEmail').addEventListener('submit',confirmarCodigoEmail);
$('formLogin').addEventListener('submit',entrar);
$('formCpfTeste').addEventListener('submit',registrarIdentidadeTeste);
$('atualizarPedidos').addEventListener('click',()=>atualizarPedidos());
$('pedidosAnterior').addEventListener('click',()=>{
 if(paginaPedidos>0){paginaPedidos--;atualizarPedidos();}
});
$('pedidosProximo').addEventListener('click',()=>{
 paginaPedidos++;atualizarPedidos();
});
$('sair').addEventListener('click',sair);
const visorCatraca=window.LoopVisorCatraca.criar({elemento:$});
visorCatraca.iniciar();


$('atualizarTabuleiroIntegrado').addEventListener('click',atualizarTabuleiroIntegrado);
// Ao abrir o tabuleiro, mostrar luzes e filas que mudaram por venda
// conciliada e agendamento. Polling e somente GET, sem evento financeiro.
setInterval(()=>{
 if(aba==='conteudoTabuleiro'&&csrf!==null&&!document.hidden)
  void atualizarTabuleiroIntegrado();
},15000);

$('tabuleiroVerPosicoesIntegrado').addEventListener('click',()=>mostrarAba('conteudoPosicoes'));
$('loop03IrPosicoesIntegrado').addEventListener('click',()=>mostrarAba('conteudoPosicoes',{somenteMinhas:true}));
$('loop03MenuIntegrado').addEventListener('click',alternarMenuIntegrado);
document.addEventListener('keydown',e=>{if(e.key==='Escape')fecharMenuIntegrado();});
$('atualizarResumo').addEventListener('click',atualizarResumo);
$('atualizarPosicoes').addEventListener('click',atualizarPosicoes);
$('atualizarEquipe').addEventListener('click',()=>atualizarEquipe(0));
$('buscarEquipe').addEventListener('input',()=>{
 clearTimeout(temporizadorBuscaEquipe);
 temporizadorBuscaEquipe=setTimeout(()=>atualizarEquipe(0),220);
});
$('maisEquipe').addEventListener('click',()=>{
 if(proximaPaginaEquipe!==null)atualizarEquipe(proximaPaginaEquipe);
});
$('equipeVerLinks').addEventListener('click',()=>mostrarAba('conteudoLinks'));
$('atalhoPedidos').addEventListener('click',()=>mostrarAba('conteudoMeusPedidos'));
$('atalhoPosicoes').addEventListener('click',()=>mostrarAba('conteudoPosicoes'));
$('atalhoLoja').addEventListener('click',()=>{location.href='/staging/loja';});
$('posicoesVerPedidos').addEventListener('click',()=>mostrarAba('conteudoMeusPedidos'));
$('financeiroVerPedidos').addEventListener('click',()=>mostrarAba('conteudoMeusPedidos'));
$('copiarLinkLoja').addEventListener('click',()=>copiarLink('linkLoja'));
$('copiarLinkEscritorio').addEventListener('click',()=>copiarLink('linkEscritorio'));
$('formTrocarSenha').addEventListener('submit',trocarSenha);
$('formGrafiaNick').addEventListener('submit',confirmarGrafiaNick);
for(const [btn,section] of ABAS){
 $(btn).addEventListener('click',()=>mostrarAba(section));
}
restaurarSessao();
