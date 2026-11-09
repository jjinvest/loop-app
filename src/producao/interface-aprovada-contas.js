'use strict';
// Usa DOM, classes e identidade visual já aprovados do escritório LOOP.
// Não há catálogo, motor ou dinheiro "mock" nesta conta: áreas ainda não
// homologadas ficam inativas, sem exibir saldos ou posições fictícias.
(()=>{
 const $=id=>document.getElementById(id);
 const API='/api/contas';
 let csrf=null,documentos=null,carregando=false,tela='login';
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
  CSRF_INVALIDO:'Sua sessão expirou. Entre novamente.'
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
  // Preservar a mesma estrutura visual; não permitir navegação para
  // funções que ainda dependem exclusivamente do LAB.
  for(const tab of document.querySelectorAll('[role=tab]')){
   const ativo=tab.id==='abaConta';
   tab.disabled=!ativo;tab.setAttribute('aria-selected',String(ativo));
   tab.setAttribute('aria-current',ativo?'page':'false');
   tab.tabIndex=ativo?0:-1;
   const alvo=tab.getAttribute('aria-controls');
   if(alvo&&$(alvo))$(alvo).hidden=!ativo;
   if(!ativo)tab.title='Disponível após liberação operacional';
  }
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
  void carregarDados();
 }
 async function carregarDados(){
  try{
   const dados=await requisitar('/meus-dados');
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
  dizer('Cadastro concluído. Entre com seu nick e senha no Escritório LOOP.');
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
  const aberto=sidebar.classList.toggle('aberto');
  $('loop03MenuIntegrado').setAttribute('aria-expanded',String(aberto));
 });
 void requisitar('/me').then(s=>painelConta(s)).catch(()=>mostrarLogin('login'));
})();
