'use strict';
// Uma unica sessão para Loja AKITEMM e Escritório LOOP. Este frontend não
// usa rotas /staging nem dados de laboratório e não executa pagamentos.
(()=>{
 const $=id=>document.getElementById(id);
 let csrf=null,documentos=null,carregando=false;
 const loja=location.pathname==='/loja';
 const mensagem=txt=>$('aviso').textContent=txt;
 const esconder=()=>{
  for(const id of ['painelLogin','painelCadastro','painelRecuperacao','painelConta'])
   $(id).hidden=true;
 };
 const mostrar=id=>{esconder();$(id).hidden=false;mensagem('');};
 const erroExplicado={
  CREDENCIAIS_INVALIDAS:'Nick ou senha incorretos.',
  CONTA_BLOQUEADA:'Muitas tentativas. Aguarde 15 minutos.',
  CADASTRO_EXISTENTE:'Este nick ou e-mail já tem cadastro.',
  DOCUMENTOS_ALTERADOS_RELER:'Documentos atualizados. Releia e confirme novamente.',
  CADASTRO_INATIVO:'O cadastro ainda não está liberado.',
  AUTENTICACAO_OCUPADA:'Muitos acessos. Tente novamente.',
  LOGIN_OBRIGATORIO:'Entre novamente em sua conta.',
  CSRF_INVALIDO:'Sessão inválida. Entre novamente.',
  ENVIO_EMAIL_NAO_CONFIRMADO:'O serviço de e-mail não confirmou o envio.',
  CODIGO_INVALIDO:'Código incorreto ou expirado.'
 };
 const explicar=e=>erroExplicado[e.message]||
  'Não foi possível concluir agora. Verifique os dados e tente novamente.';
 async function api(rota,{method='GET',body,csrfObrigatorio=false}={}){
  const resposta=await fetch('/api/contas'+rota,{
   method,credentials:'same-origin',cache:'no-store',
   headers:{
    ...(body!==undefined?{'Content-Type':'application/json'}:{}),
    ...(csrfObrigatorio?{'X-Loop-Csrf':csrf}:{})
   },
   ...(body!==undefined?{body:JSON.stringify(body)}:{})
  });
  let dados={};
  try{dados=await resposta.json();}catch{}
  if(!resposta.ok){
   const erro=new Error(dados.erro||'OPERACAO_INDISPONIVEL');
   erro.status=resposta.status;throw erro;
  }
  return dados;
 }
 function configurarArea(){
  document.title=loja?'AKITEMM · Loja Oficial | LOOP 3.0':
   'LOOP 3.0 · Escritório Virtual';
  $('tituloPagina').textContent=loja?'Loja AKITEMM':'Escritório Virtual LOOP';
  $('tituloArea').textContent=loja?'Loja AKITEMM':'Escritório Virtual LOOP';
  $('marcaArea').textContent=loja?'AKITEMM':'LOOP 3.0';
  $('escritorioReal').hidden=loja;
  $('lojaReal').hidden=!loja;
  $('linkEscritorio').setAttribute('aria-current',loja?'false':'page');
  $('linkLoja').setAttribute('aria-current',loja?'page':'false');
 }
 function configurarDocumentos(ativos){
  $('aceiteTermos').disabled=!ativos;
  $('aceitePrivacidade').disabled=!ativos;
  $('concluirCadastro').disabled=!ativos;
  if(!ativos){
   $('aceiteTermos').checked=false;
   $('aceitePrivacidade').checked=false;
  }
 }
 async function carregarDocumentos(){
  if(carregando)return;
  carregando=true;documentos=null;configurarDocumentos(false);
  $('termosTexto').textContent='Consultando documentos...';
  $('privacidadeTexto').textContent='Consultando documentos...';
  try{
   const dados=await api('/documentos');
   const valido=obj=>obj&&typeof obj.versao==='string'&&
    typeof obj.hash==='string'&&/^[a-f0-9]{64}$/.test(obj.hash)&&
    typeof obj.texto==='string'&&obj.texto.length>=100;
   if(!valido(dados.termos)||!valido(dados.privacidade)||
      dados.financeiroReal!==false)throw Error('DOCUMENTOS_NAO_CONFIGURADOS');
   documentos=dados;
   $('termosVersao').textContent='Versão: '+dados.termos.versao;
   $('termosTexto').textContent=dados.termos.texto;
   $('privacidadeVersao').textContent='Versão: '+dados.privacidade.versao;
   $('privacidadeTexto').textContent=dados.privacidade.texto;
   configurarDocumentos(true);
  }catch(e){
   $('termosTexto').textContent='Os termos ainda não estão disponíveis.';
   $('privacidadeTexto').textContent='A política de privacidade ainda não está disponível.';
   mensagem(explicar(e));
  }finally{carregando=false;}
 }
 async function carregarSessao(){
  try{
   const me=await api('/me');
   csrf=me.csrf;
   $('nickLateral').textContent=me.nick;
   $('identidadeResumo').textContent='Conta: '+me.nick+
    (me.emailVerificado?' · e-mail confirmado':' · e-mail não confirmado');
   $('statusEmail').textContent=me.emailVerificado?
    'Seu e-mail está confirmado.':'Confirme seu e-mail para proteger sua conta.';
   $('blocoEmail').hidden=me.emailVerificado===true;
   mostrar('painelConta');
   return true;
  }catch(e){
   csrf=null;mostrar('painelLogin');return false;
  }
 }
 function aoEnviar(id,funcao){
  $(id).addEventListener('submit',async ev=>{
   ev.preventDefault();
   const botao=ev.currentTarget.querySelector('[type=submit]');
   if(botao.disabled)return;
   botao.disabled=true;
   try{await funcao();}
   catch(e){mensagem(explicar(e));}
   finally{botao.disabled=false;}
  });
 }
 $('abrirCadastro').addEventListener('click',()=>{
  mostrar('painelCadastro');void carregarDocumentos();
 });
 $('abrirRecuperacao').addEventListener('click',()=>mostrar('painelRecuperacao'));
 $('voltarCadastro').addEventListener('click',()=>mostrar('painelLogin'));
 $('voltarRecuperacao').addEventListener('click',()=>mostrar('painelLogin'));
 aoEnviar('loginForm',async()=>{
  const data=await api('/entrar',{method:'POST',body:{
   nick:$('loginNick').value,senha:$('loginSenha').value
  }});
  csrf=data.csrf;$('loginSenha').value='';
  await carregarSessao();
 });
 aoEnviar('cadastroForm',async()=>{
  if(!documentos||!$('aceiteTermos').checked||!$('aceitePrivacidade').checked)
   throw Error('DOCUMENTOS_ALTERADOS_RELER');
  try{
   await api('/cadastrar',{method:'POST',body:{
    nome:$('cadastroNome').value,nick:$('cadastroNick').value,
    email:$('cadastroEmail').value,senha:$('cadastroSenha').value,
    aceiteTermos:true,aceitePrivacidade:true,
    versaoTermos:documentos.termos.versao,hashTermos:documentos.termos.hash,
    versaoPrivacidade:documentos.privacidade.versao,
    hashPrivacidade:documentos.privacidade.hash
   }});
  }catch(e){
   if(e.message==='DOCUMENTOS_ALTERADOS_RELER')await carregarDocumentos();
   throw e;
  }
  $('cadastroSenha').value='';mostrar('painelLogin');
  mensagem('Cadastro criado. Entre com o mesmo nick e senha na Loja AKITEMM ou no Escritório LOOP.');
 });
 aoEnviar('recuperacaoSolicitar',async()=>{
  await api('/senha/solicitar',{method:'POST',body:{email:$('recEmail').value}});
  $('recuperacaoConcluir').hidden=false;
  mensagem('Se o e-mail estiver cadastrado, você receberá um código.');
 });
 aoEnviar('recuperacaoConcluir',async()=>{
  await api('/senha/confirmar',{method:'POST',body:{
   email:$('recEmail').value,codigo:$('recCodigo').value,
   novaSenha:$('recSenha').value
  }});
  $('recCodigo').value='';$('recSenha').value='';
  mostrar('painelLogin');mensagem('Senha atualizada. Entre novamente.');
 });
 $('enviarEmail').addEventListener('click',async()=>{
  $('enviarEmail').disabled=true;
  try{
   await api('/email/solicitar',{method:'POST',body:{},csrfObrigatorio:true});
   $('confirmarEmailForm').hidden=false;
   mensagem('Se o envio foi aceito, o código chegará ao e-mail da conta.');
  }catch(e){mensagem(explicar(e));}
  finally{$('enviarEmail').disabled=false;}
 });
 aoEnviar('confirmarEmailForm',async()=>{
  await api('/email/confirmar',{method:'POST',
   body:{codigo:$('codigoEmail').value},csrfObrigatorio:true});
  $('codigoEmail').value='';
  await carregarSessao();mensagem('E-mail confirmado.');
 });
 $('carregarDados').addEventListener('click',async()=>{
  $('carregarDados').disabled=true;
  try{
   const dados=await api('/meus-dados');
   $('dadosPessoais').textContent='Nome: '+dados.nome+
    ' · E-mail: '+dados.email+' · Nick: '+dados.nick;
   $('documentosAceitos').textContent='Termos aceitos: '+
    dados.documentosAceitos.termos.versao+' · Privacidade: '+
    dados.documentosAceitos.privacidade.versao;
  }catch(e){mensagem(explicar(e));}
  finally{$('carregarDados').disabled=false;}
 });
 $('sair').addEventListener('click',async()=>{
  try{await api('/sair',{method:'POST',body:{},csrfObrigatorio:true});}
  catch(e){mensagem(explicar(e));return;}
  csrf=null;$('dadosPessoais').textContent='';
  $('documentosAceitos').textContent='';
  mostrar('painelLogin');
 });
 configurarArea();void carregarSessao();
})();
