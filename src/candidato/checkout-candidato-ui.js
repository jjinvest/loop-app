'use strict';
// Interface de HOMOLOGACAO LOCAL. Nao existe pagamento, cadastro, CPF ou
// posicao verdadeira. Nunca inserir valores da API via innerHTML.
const API='/staging';
const $=id=>document.getElementById(id);
let csrf=null,aba='conteudoResumo',proximaPaginaEquipe=null,
 paginaPedidos=0,carregamentoPedidos=0;
let telaAcesso='login';
let posicaoSelecionadaMotor=null;
const ABAS=[['abaResumo','conteudoResumo'],['abaTabuleiro','conteudoTabuleiro'],
 ['abaMeusPedidos','conteudoMeusPedidos'],['abaPosicoes','conteudoPosicoes'],
 ['abaEquipe','conteudoEquipe'],['abaLinks','conteudoLinks'],['abaFinanceiro','conteudoFinanceiro'],
 ['abaConta','conteudoConta']];
const moeda=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100);
const dizer=msg=>{$('mensagem').textContent=msg;};
const errosTraduzidos={
 CREDENCIAIS_INVALIDAS:'Nick ou senha incorretos. Confira os dados e tente novamente.',
 CONTA_TEMPORARIAMENTE_BLOQUEADA:'Muitas tentativas incorretas. Aguarde 15 minutos e tente novamente.',
 NICK_INVALIDO:'Seu nick deve ter apenas letras, com até 9 caracteres.',
 NOME_INVALIDO:'Confira o nome informado.',
 EMAIL_INVALIDO:'Confira o e-mail informado.',
 SENHA_INVALIDA:'Confira a senha informada.',
 CADASTRO_JA_EXISTENTE:'Este nick ou e-mail já está cadastrado. Use a opção Já tenho cadastro.',
 TERMOS_LAB_NAO_ACEITOS:'Marque a confirmação dos termos para continuar.',
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
function mostrarAba(alvo){
 aba=alvo;
 for(const [id,painel] of ABAS){
  const ativo=painel===alvo,botao=$(id);
  botao.setAttribute('aria-selected',String(ativo));
  botao.tabIndex=ativo?0:-1;
  botao.setAttribute('aria-current',ativo?'page':'false');
  $(painel).hidden=!ativo;
 }
 fecharMenuIntegrado();
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
  const p=document.createElement('p');p.textContent='Nenhum pré-pedido nesta conta de teste.';
  area.append(p);return;
 }
 const estados={
  SEM_COBRANCA_SANDBOX:'Pré-pedido preparado, sem cobrança',
  PREPARADA:'Preparado para homologação, sem Pix',
  CRIACAO_INDETERMINADA:'Cobrança indeterminada: revisão necessária',
  PENDENTE_SANDBOX:'Cobrança de teste pendente no Sandbox',
  RECEBIMENTO_INFORMADO_SANDBOX:'Recebimento informado pelo Sandbox (não é pagamento real)',
  REVERSAO_INFORMADA_SANDBOX:'Reversão de teste: revisão necessária',
  EXIGE_REVISAO:'Revisão de homologação necessária'
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
  status.textContent=estados[pedido.statusHomologacao]||'Status em verificação (laboratório)';
  artigo.append(titulo,resumo,data,status);
  if(pedido.compraSemNovaPosicao===true){
   const aviso=document.createElement('p');aviso.className='aviso';
   aviso.textContent=pedido.modalidadeDeParticipacao==='SEM_POSICOES_LIMITE'?
    'Compra de produto sem nova posição no LOOP: limite de 10 posições atingido.':
    'Compra comum de produto, sem geração de posição no LOOP.';
   artigo.append(aviso);
  }else if(Number.isSafeInteger(pedido.posicoesReservadas)&&
           pedido.posicoesReservadas>0){
   const detalhe=document.createElement('p');detalhe.className='subtexto';
   detalhe.textContent='Reserva de homologação: '+pedido.posicoesReservadas+
    ' posição(ões) prevista(s), ainda não criada(s) nem ativada(s).';
   artigo.append(detalhe);
  }
  if(pedido.conferenciaPSPConcluida===true){
   const selo=document.createElement('p');selo.className='subtexto';
   selo.textContent='Pagamento fictício conferido por consulta independente ao Asaas Sandbox.';
   artigo.append(selo);
  }else if(pedido.situacaoOperacional==='WEBHOOK_RECEBIDO_AGUARDANDO_RECONSULTA'){
   const aviso=document.createElement('p');aviso.className='aviso';
   aviso.textContent='Aviso do Asaas recebido. A confirmação por consulta independente ainda está pendente.';
   artigo.append(aviso);
  }
  if(pedido.revisaoManualObrigatoria){
   const aviso=document.createElement('p');aviso.className='aviso';
   aviso.textContent='Revisão manual obrigatória. Nenhum benefício será liberado.';
   artigo.append(aviso);
  }
  if(pedido.posicaoPendenteLaboratorio){
   const posicao=document.createElement('p');posicao.className='aviso';
   posicao.textContent='1 posição pendente fictícia de homologação · nenhuma posição real criada.';
   artigo.append(posicao);
  }
  const diagnosticar=document.createElement('button');
  diagnosticar.type='button';diagnosticar.textContent='Ver requisitos de ativação';
  const detalhe=document.createElement('p');detalhe.className='subtexto';
  detalhe.setAttribute('role','status');
  diagnosticar.addEventListener('click',async()=>{
   diagnosticar.disabled=true;
   try{
    const d=await requisitar('/meu-diagnostico-ativacao/'+
     encodeURIComponent(pedido.prepedidoId));
    detalhe.textContent='Situação: '+d.estado+
     '. Pendências: '+d.bloqueios.join(', ')+'.';
   }catch(e){detalhe.textContent='Consulta indisponível: '+e.message;}
   finally{diagnosticar.disabled=false;}
  });
  artigo.append(diagnosticar,detalhe);
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
  info.textContent='Posições fictícias anteriores: '+(previa.meusPendentesHistoricos||0)+
   ' · Hipótese na Fila B: '+(previa.meusSimuladosNaFilaB||0)+
   ' · Posições reais: 0. '+previa.motivo;
  resumo.append(info);
  const pre=await requisitar('/minhas-pre-adesoes');
  const historico=$('minhasPreAdesoes');historico.replaceChildren();
  if(!pre.registros.length){
   const aviso=document.createElement('p');
   aviso.textContent='Nenhuma pré-adesão fictícia registrada.';
   historico.append(aviso);
  }
  for(const registro of pre.registros){
   const artigo=document.createElement('article');artigo.className='pedido';
   const nome=document.createElement('strong'),descricao=document.createElement('p');
   nome.textContent=registro.prepedidoId;
   descricao.textContent='Pré-adesão de laboratório: '+registro.estado+
    '. Posições reais: 0. '+(registro.motivos.length?
     'Exige revisão: '+registro.motivos.join(', '):'Nenhuma revisão de ensaio pendente.');
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
  dizer('Pedidos e comunicados atualizados. Nenhuma compra ou pagamento real.');
 }catch(e){dizer('Não foi possível consultar os pedidos: '+e.message);}
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
  $('termosCpfTexto').textContent='Versão '+termos.termosVersao+': '+termos.termosTexto;
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
   String(motor.limitePosicoesAtivas)+' (ensaio)';
  $('loop03Giros24Integrado').textContent=String(motor.catraca.giros24h);
  const selecionada=motor.minhasPosicoes.find(x=>x.numero===posicaoSelecionadaMotor);
  if(!selecionada)posicaoSelecionadaMotor=null;
  $('loop03NumeroIntegrado').textContent=selecionada?'#'+selecionada.numero:'#0000';
  $('resumoPedidos').textContent=String(pedidos.totalPedidos??pedidos.pedidos?.length??0);
  $('resumoPosicoes').textContent=String(motor.posicoesAtivasDoTitular)+
   ' no motor de ensaio; '+String(filas.meusPendentesHistoricos||0)+' históricos PSP';
  $('resumoEmail').textContent=perfil.emailVerificado?'Confirmado':'Pendente';
  $('resumoEquipe').textContent=String(equipe.total);
  $('linksNick').textContent='Seu nick: @'+perfil.nick;
 }catch(e){dizer('Não foi possível atualizar a visão geral: '+e.message);}
}
function preencherVagaMotor(id,p,centro=false){
 const numero=$(id),bolinha=numero.closest('.espaco-tabuleiro-demo');
 numero.textContent=p?'#'+p.numero:(centro?'#0000':'—');
 numero.classList.toggle('posicao-dourado',Boolean(p?.dourada));
 numero.classList.toggle('posicao-azul',Boolean(p?.pendente));
 numero.classList.toggle('posicao-verde',Boolean(p?.aceiteEnsaio));
 numero.classList.toggle('loop03-iluminada',Boolean(p?.minha));
 bolinha.setAttribute('aria-label',(centro?'Centro':'Vaga do tabuleiro')+
  ': '+(p?('#'+p.numero+' · '+p.status):'vazio')+
  (p?.minha?' · minha posição':''));
}
function preencherFilaMotor(id,itens,tipo){
 const area=$(id);area.replaceChildren();
 if(!itens.length){
  const vazio=document.createElement('p');vazio.className='subtexto';
  vazio.textContent='Fila vazia';area.append(vazio);return;
 }
 for(const p of itens){
  const linha=document.createElement('div');
  linha.className='loop03-linha-fila';
  const inicial=document.createElement('span');
  inicial.className='loop03-inicial-fila '+(p.dourada?'loop03-dourada':
   p.pendente?'loop03-azul':p.aceiteEnsaio?'loop03-verde':tipo==='A'?'loop03-a':'loop03-b');
  inicial.textContent=p.dourada?'●':tipo;
  const conteudo=document.createElement('span');
  conteudo.className='loop03-fila-identificacao';
  const numero=document.createElement('span');
  numero.className='loop03-numero-titular';
  numero.textContent='#'+p.numero;
  conteudo.append(numero);
  if(p.minha){
   const minha=document.createElement('small');minha.textContent='Minha posição · ensaio';
   conteudo.append(minha);
  }
  linha.append(inicial,conteudo);
  area.append(linha);
 }
}
async function atualizarTabuleiroIntegrado(){
 const estado=$('estadoTabuleiroIntegrado');
 try{
  const motor=await requisitar('/motor/estado');
  if(motor.origem!=='MOTOR_LOOP_EXISTENTE_COM_SQLITE_DA_CONTA'||
     motor.autorizacaoComercial!==false||motor.dinheiroReal!==false)
   throw Error('FONTE_MOTOR_INCOMPATIVEL');
  preencherFilaMotor('motorFilaA',motor.filaA,'A');
  preencherFilaMotor('motorFilaB',motor.filaB,'B');
  preencherVagaMotor('tabuleiroMotorCentro',motor.tabuleiro.centro,true);
  motor.tabuleiro.vagas.forEach((p,i)=>
   preencherVagaMotor('tabuleiroMotorVaga'+(i+1),p));
  for(let i=1;i<=6;i++)$('motorBolinha'+i).classList.toggle(
   'loop03-marcador-aceso',i<=motor.tabuleiro.eventosNoCiclo);
  $('motorContadorEventos').textContent=motor.tabuleiro.eventosNoCiclo+
   '/6 eventos válidos de ensaio';
  $('loop03Giros24Integrado').textContent=String(motor.catraca.giros24h);
  estado.textContent='Motor V6 conectado ao SQLite desta conta · '+motor.ordemAlimentacao+
   ' · '+motor.catraca.estado+' · '+motor.catraca.giros+
   ' giros de ensaio. '+
   (motor.agenda?.modoExecucao==='NATURAL'?
    'Modo natural: vendas confirmadas alimentam o movimento sem horário. ':
    motor.agenda?.modoExecucao==='AGENDADA'?
    'Controle de horário: '+motor.agenda.abertura+'–'+
     motor.agenda.fechamentoAplicado+', intervalo '+motor.agenda.intervaloMinutos+
     ' min. ':
    motor.agenda?.modoExecucao==='STOP'?
    'STOP do administrador: a catraca não se move; vendas e filas continuam. ':
    'Catraca sob comando manual de laboratório. ')+
   'Compras Sandbox confirmadas aguardando luz: '+
   (motor.agenda?.aguardandoContabilizacao??0)+
   '. Luzes representam vendas anteriores, nunca compras inventadas. '+
   'Posições e valores comerciais continuam bloqueados.';
 }catch(e){
  estado.textContent='Leitura do motor indisponível: '+e.message+
   '. Não foram apresentados ocupantes ou giros não verificados.';
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
  resumo.textContent='Ativas no motor de ensaio: '+ativas.length+
   '/10 · Registros históricos PSP de laboratório: '+historicos.length+
   ' · Posicoes comerciais ativas: 0.';
  const grade=document.createElement('div');
  grade.className='loop03-grade-posicoes-ensaio';
  grade.setAttribute('role','list');
  grade.setAttribute('aria-label','Dez espaços de posições da própria conta');
  const estados={
   APENAS_PREVIA_FILA_B_AZUL:'Pendente de confirmação · hipótese Fila B',
   EXIGE_REVISAO_PSP:'Pagamento de teste exige revisão',
   SEM_FOTOGRAFIA_HISTORICA:'Falta fotografia histórica',
   OFERTA_HISTORICA_NAO_QUALIFICADA:'Oferta não qualificada',
   ACIMA_DEZ_APENAS_PARA_PLANEJAMENTO:'Acima do limite para planejamento'
  };
  for(let i=0;i<10;i++){
   const posicao=ativas[i]||null,registro=posicao?null:historicosExtras[i-ativas.length]||null;
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
    registro?'PENDENTE · TESTE':'Espaço disponível';
   const status=document.createElement('p');
   status.textContent=posicao?('Motor de ensaio · '+posicao.local+
    (posicao.fila?' '+posicao.fila:'')+
    ' · indicações nesta posição: '+(posicao.indicacoesVinculadas||0)+
    (posicao.pendente?' · aguardando confirmação':'')):
    registro?(estados[registro.estado]||'Registro em revisão'):'Sem posição vinculada';
   cartao.append(nome,numero,status);
   if(posicao?.aceiteIndividualRegistrado){
    const aceite=document.createElement('small');
    aceite.textContent='Aceite desta posição registrado no ensaio · identidade externa não verificada.';
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
      ' Aceito nesta posição os termos de ensaio '+termos.termosVersao+' (sem direitos reais).'));
     const botaoAceite=document.createElement('button');
     botaoAceite.type='submit';botaoAceite.textContent='Confirmar esta posição (ensaio)';
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
       dizer('Aceite de ensaio registrado para a posição #'+posicao.numero+'.');
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
    botao.textContent='Selecionar esta posição de ensaio';
    botao.addEventListener('click',()=>{
     posicaoSelecionadaMotor=posicao.numero;
     $('loop03NumeroIntegrado').textContent='#'+posicao.numero;
     atualizarPosicoes();
    });
    cartao.append(botao);
   }else if(registro){
    const origem=document.createElement('small');
    origem.textContent='Pedido de ensaio: '+String(registro.prepedidoId||'Não identificado');
    cartao.append(origem);
   }
   grade.append(cartao);
  }
  const aviso=document.createElement('p');aviso.className='subtexto';
  const fora=Math.max(0,historicosExtras.length-(10-ativas.length));
  aviso.textContent=fora?
   'Outros '+fora+' registros permanecem no histórico de pedidos. O limite de 10 aplica-se a posições ativas, não aos pedidos passados.':
   'Nenhum cartão permite ativar, girar ou receber valores reais nesta homologação.';
  area.replaceChildren(resumo,grade,aviso);
 }catch(e){
  area.replaceChildren();
  const erro=document.createElement('p');
  erro.textContent='Consulta indisponível: '+e.message;
  area.append(erro);
 }
}
async function atualizarEquipe(pagina=0){
 try{
  const dados=await requisitar('/minha-equipe?pagina='+pagina);
  if(pagina===0)$('listaEquipe').replaceChildren();
  $('equipeResumo').textContent=dados.total+
   ' cadastro(s) pelos links · '+dados.indicacoesQualificadas+
   ' indicação(ões) com compra Sandbox validada · comissões reais: 0.';
  if(pagina===0&&dados.total===0){
   const vazio=document.createElement('p');
   vazio.textContent='Sua equipe ainda não possui cadastros de teste. Compartilhe o link em Meus Links.';
   $('listaEquipe').append(vazio);
  }
  for(const pessoa of dados.cadastros){
   const linha=document.createElement('p');
   linha.className='pedido';
   linha.textContent='@'+pessoa.nick+' · Cadastro em '+
    new Date(pessoa.registradoEm).toLocaleString('pt-BR');
   $('listaEquipe').append(linha);
   if(pessoa.qualificadaEnsaio===true){
    const status=document.createElement('small');
    status.textContent='Indicação de ensaio atribuída à posição #'+
     pessoa.posicaoAlvoId+' · sem comissão real.';
    $('listaEquipe').append(status);
   }else if(pessoa.possuiPosicaoDeEnsaio===true){
    const botao=document.createElement('button');
    botao.type='button';
    botao.textContent='Alocar indicação à posição selecionada';
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
      await atualizarEquipe(0);
      await atualizarPosicoes();
      if(aba==='conteudoTabuleiro')await atualizarTabuleiroIntegrado();
     }catch(e){
      dizer('Indicação não atribuída: '+e.message+
       '. Confirme o aceite da posição e a compra Pix Sandbox do indicado.');
      botao.disabled=false;
     }
    });
    $('listaEquipe').append(botao);
   }else{
    const observacao=document.createElement('small');
    observacao.textContent='Aguardando compra elegível e conciliação Sandbox do indicado.';
    $('listaEquipe').append(observacao);
   }
  }
  proximaPaginaEquipe=dados.proximaPagina;
  $('maisEquipe').hidden=proximaPaginaEquipe===null;
 }catch(e){
  $('equipeResumo').textContent='Não foi possível consultar sua equipe: '+e.message;
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
 }catch(e){$('perfilCliente').textContent='Perfil indisponível: '+e.message;}
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
 await atualizarVerificacaoEmail();
 await atualizarIdentidadeTeste();
 mostrarAba('conteudoResumo');
 return dados;
}

async function entrar(e){
 e.preventDefault();
 const botao=$('formLogin').querySelector('button');
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
async function cadastrar(e){
 e.preventDefault();
 const botao=$('formCadastro').querySelector('button');
 botao.disabled=true;
 try{
  const nick=$('cadastroNick').value;
  const r=await requisitar('/contas/cadastrar',{method:'POST',
   body:{
    nome:$('cadastroNome').value,
    nick,email:$('cadastroEmail').value,senha:$('cadastroSenha').value,
    aceiteExplicito:$('cadastroTermos').checked
   }
  });
  if(r.contaCriada!==true||r.pagamentoPermitido!==false)
   throw Error('CADASTRO_INCOMPATIVEL');
  $('login').value=nick;
  $('cadastroSenha').value='';
  selecionarTelaAcesso('login');
  dizer('Cadastro concluído. Agora entre com seu nick e a senha que você escolheu.');
 }catch(e){mostrarErroAcesso('cadastro',explicarErro(e));}
 finally{botao.disabled=false;}
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
$('mudarParaCadastro').addEventListener('click',()=>selecionarTelaAcesso('cadastro'));
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
$('atualizarTabuleiroIntegrado').addEventListener('click',atualizarTabuleiroIntegrado);
// Ao abrir o tabuleiro, mostrar luzes e filas que mudaram por venda
// conciliada e agendamento. Polling e somente GET, sem evento financeiro.
setInterval(()=>{
 if(aba==='conteudoTabuleiro'&&csrf!==null&&!document.hidden)
  void atualizarTabuleiroIntegrado();
},15000);

$('tabuleiroVerPosicoesIntegrado').addEventListener('click',()=>mostrarAba('conteudoPosicoes'));
$('loop03IrPosicoesIntegrado').addEventListener('click',()=>mostrarAba('conteudoPosicoes'));
$('loop03MenuIntegrado').addEventListener('click',alternarMenuIntegrado);
document.addEventListener('keydown',e=>{if(e.key==='Escape')fecharMenuIntegrado();});
$('atualizarResumo').addEventListener('click',atualizarResumo);
$('atualizarPosicoes').addEventListener('click',atualizarPosicoes);
$('atualizarEquipe').addEventListener('click',()=>atualizarEquipe(0));
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
for(const [btn,section] of ABAS){
 $(btn).addEventListener('click',()=>mostrarAba(section));
}
restaurarSessao();
