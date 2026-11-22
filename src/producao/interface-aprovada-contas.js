'use strict';
// Usa DOM, classes e identidade visual já aprovados do escritório LOOP.
// Não há catálogo, motor ou dinheiro "mock" nesta conta: áreas ainda não
// homologadas ficam inativas, sem exibir saldos ou posições fictícias.
(()=>{
 const $=id=>document.getElementById(id);

 // Funcionamento do olhinho isolado: protegido contra falhas posteriores
 // do painel, da catraca e dos arquivos da loja.
 document.addEventListener('click',ev=>{
  const alvo=ev.target;
  const botao=typeof alvo?.closest==='function'?
   alvo.closest('button.alternar-visibilidade[data-senha]'):null;
  if(!botao||botao.disabled)return;
  const campo=$(botao.dataset.senha);
  if(!campo||campo.tagName!=='INPUT')return;
  ev.preventDefault();
  const senhaAnterior=campo.value;
  const mostrar=campo.type==='password';
  campo.type=mostrar?'text':'password';
  // Android: manter os caracteres preenchidos ao mudar o tipo.
  if(campo.value!==senhaAnterior)campo.value=senhaAnterior;
  botao.setAttribute('aria-pressed',String(mostrar));
  botao.setAttribute('aria-label',mostrar?'Ocultar senha':'Mostrar senha');
  botao.title=mostrar?'Ocultar senha':'Mostrar senha';
 },true);

 const nickVisivel=nick=>typeof nick==='string'&&/^(?:vilela|operador)$/i.test(nick)?nick.toUpperCase():nick;
 // A credencial de operador nunca é inferida pelo nick do cliente.
 // O gateway verifica a sessão administrativa isolada antes de revelar +.
 async function atualizarAtalhoOperadorReal(){
  const antigo=$('loopOperadorMais');
  if(antigo){antigo.hidden=true;antigo.style.display='none';}
  const barra=$('loopOperadorAtalhos'),voltar=$('loopVoltarOperador');
  if(!barra&&!voltar)return;
  try{
   const r=await fetch('/api/operador/estado',{
    credentials:'same-origin',cache:'no-store'
   });
   const d=r.ok?await r.json():null;
   const ativo=d?.operador===true;
   if(barra)barra.hidden=!ativo||!modoOperadorAtual;
   if(voltar)voltar.hidden=!ativo||modoOperadorAtual;
   // A loja abre na mesma visão escolhida no LOOP, sem alterar a sessão.
   if(ativo){
    const href='/loja?visao='+(modoOperadorAtual?'operador':'cliente');
    for(const link of document.querySelectorAll(
     '.loop03-atalho-loja, .barra-conta a.loop03-loja-prata'
    ))link.href=href;
   }
  }catch{
   if(barra)barra.hidden=true;
   if(voltar)voltar.hidden=true;
  }
 }
 void atualizarAtalhoOperadorReal();
 addEventListener('pageshow',()=>void atualizarAtalhoOperadorReal());
 addEventListener('focus',()=>void atualizarAtalhoOperadorReal());
 addEventListener('loop:operador-saiu',()=>void atualizarAtalhoOperadorReal());
 async function terminarModoOperador(){
  const resposta=await fetch('/api/operador/sair',{
   method:'POST',credentials:'same-origin',cache:'no-store'
  });
  if(resposta.status===404)return; // identidade em dominio independente
  if(!resposta.ok)throw Error('FALHA_AO_ENCERRAR_OPERADOR');
  dispatchEvent(new Event('loop:operador-saiu'));
 }
 async function autenticarOperadorFormulario(nick,senha){
  const resposta=await fetch('/api/operador/entrar',{
   method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({nick,senha})
  });
  if(!resposta.ok){
   if(resposta.status===401)throw Error('CREDENCIAIS_INVALIDAS');
   if(resposta.status===429)throw Error('CONTA_TEMPORARIAMENTE_BLOQUEADA');
   throw Error('ACESSO_OPERADOR_INDISPONIVEL');
  }
  const dados=await resposta.json();
  if(dados.operador!==true)throw Error('ACESSO_OPERADOR_INDISPONIVEL');
 }
 const API='/api/contas';
 let csrf=null,documentos=null,carregando=false,tela='login';
 let modoOperadorAtual=false;
 let captchaCadastroId=null,captchaObrigatorio=false;
 let captchaLoginAtivo=false,captchaLoginId=null;
 const parametrosEntrada=new URLSearchParams(location.search);
 const visaoSolicitada=parametrosEntrada.get('visao');
 const ref=parametrosEntrada.get('ref');
 // /loja/NICK conserva o indicador no cadastro e abre a loja apos
 // autenticar a conta real; nao promove convidado a operador.
 const entradaPelaLoja=parametrosEntrada.get('origem')==='loja';
 const indicadorNick=typeof ref==='string'&&/^[A-Za-z]{1,12}$/.test(ref)?
  ref.toLowerCase():null;
 let titularesIndicados=[],redePaginando=false,redeProximoCursor=null;
 let posicaoSelecionada='';
 let nickResumoReal='';
 let posicoesResumoReal=[],popupPosicoesRealAberto=false;
 let posicaoResumoEscolhidaManualmente=false;
 let sequenciaLeituraFilas=0;
 let filaSelecionada=null;
 const carregarPaginaFila={A:null,B:null};
 let finOrigemReal='BONUS_INDICACAO',ensaioFinanceiroAtivo=false;
 let somentePosicoesPeloQuadrado=false,proximaAbaVemDoQuadrado=false;
 let origemLinks=null;
 const codigos={
  CREDENCIAIS_INVALIDAS:'Nick ou senha incorretos. Confira os dados e tente novamente.',
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
 const erro=e=>{
  if(Object.prototype.hasOwnProperty.call(codigos,e?.message))
   return codigos[e.message];
  if(e?.name==='TypeError')
   return 'Sem conexão com o servidor. Confira sua internet e tente novamente.';
  if(e?.status===401)return 'Sua sessão expirou. Entre novamente.';
  if(e?.status===403)return 'A operação foi recusada por segurança. Entre novamente.';
  if(e?.status===413)return 'Arquivo grande demais para enviar.';
  if(e?.status===429)return 'Muitas tentativas. Aguarde e tente novamente.';
  if(e?.status===503)return 'Serviço temporariamente indisponível. Tente novamente.';
  if(Number.isSafeInteger(e?.status))
   return 'Operação não concluída (erro '+e.status+'). Confira os dados e tente novamente.';
  return 'Não foi possível concluir esta operação. Confira os dados e tente novamente.';
 };
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
 // O seletor da foto serve somente aos acessos aprovados: foto do topo
 // e Minha Conta. Para abrir no Android quando a aba está recolhida,
 // o MESMO input deve permanecer fora do ancestral display:none. Ele NÃO
 // pode aparecer como terceiro campo solto no rodapé da página de login.
 function posicionarCampoFotoPerfil(foraDaAba){
  const input=$('arquivoFotoPerfil'),form=$('formFotoPerfil');
  if(foraDaAba||$('conteudoConta')?.hidden){
   if(input.parentElement!==document.body)document.body.append(input);
   // Invisível visualmente, mas com layout e DOM suficientes para .click()
   // abrir a galeria por gesto real no Android; não usar display:none.
   input.style.cssText='position:fixed!important;left:-9999px!important;'+
    'top:0!important;width:1px!important;height:1px!important;'+
    'opacity:0!important;overflow:hidden!important;'+
    'pointer-events:none!important;clip-path:inset(50%)!important;'+
    'padding:0!important;margin:0!important;z-index:-1!important';
   input.tabIndex=-1;
   input.setAttribute('aria-hidden','true');
  }else{
   if(input.parentElement!==form)form.insertBefore(input,$('avisoFotoPerfil'));
   input.removeAttribute('style');
   input.removeAttribute('tabindex');
   input.removeAttribute('aria-hidden');
  }
 }
 function mostrarLogin(t){
  limparAgendaOperador();
  posicionarCampoFotoPerfil(false);
  tela=t;modoOperadorAtual=false;
  document.body.classList.remove('loop03-modo-operador');
  const acoes=$('loopOperadorAcoes');if(acoes)acoes.hidden=true;
  $('loop03AbrirPerfil').disabled=false;
  $('loop03AlterarFotoTopo').disabled=false;
  $('painelLogin').hidden=t!=='login';
  $('painelCadastro').hidden=t!=='cadastro';
  $('painelRecuperacao').hidden=t!=='recuperacao';
  $('painelConta').hidden=true;
  document.body.classList.remove('loop03-logado');
  fecharDadosRodapeReal();
  $('loop03RodapeFilaIntegrado').hidden=true;
  $('loop03RodapeCoroaIntegrado').hidden=true;
  $('erroLogin').hidden=true;$('erroCadastro').hidden=true;
  const campoIndicador=$('cadastroIndicador');
  if(campoIndicador){
   campoIndicador.value=indicadorNick?nickVisivel(indicadorNick):'';
   campoIndicador.placeholder=indicadorNick?'':'Sem indicação neste acesso';
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
    $(id).textContent=typeof d[chave]==='string'?(chave==='nick'?nickVisivel(d[chave]):d[chave]):'—';
   const ok=d.cpfConfirmado===true&&
    typeof d.cpfExibicao==='string'&&d.cpfExibicao.length>0;
   $('loop03PerfilLinhaCpf').hidden=!ok;
   $('loop03PerfilCpf').textContent=ok?d.cpfExibicao:'—';
  }catch{
   if(!painel.hidden)$('loop03PerfilNome').textContent='Dados indisponíveis.';
  }
 }
 let fotoPerfilUrlReal=null,numeroConsultaFotoReal=0;
 function limparFotoPerfilReal(){
  numeroConsultaFotoReal++;
  if(fotoPerfilUrlReal?.startsWith('blob:'))URL.revokeObjectURL(fotoPerfilUrlReal);
  fotoPerfilUrlReal=null;
  const topo=$('loop03ImagemFotoTopo'),rodape=$('loop03ImagemFotoRodape');
  for(const img of [topo,rodape]){
   if(img){img.hidden=true;img.removeAttribute('src');}
  }
  const vazio=$('loop03FotoSemImagem'),vazioRodape=$('loop03AvatarRodapeVazio');
  if(vazio)vazio.hidden=false;
  if(vazioRodape)vazioRodape.hidden=false;
 }
 async function atualizarFotoPerfilReal(){
  const atual=++numeroConsultaFotoReal;
  try{
   const resp=await fetch('/api/contas/foto-perfil',{
    credentials:'same-origin',cache:'no-store'
   });
   if(atual!==numeroConsultaFotoReal)return;
   if(resp.status===404){limparFotoPerfilReal();return;}
   if(!resp.ok||!['image/jpeg','image/png','image/webp'].includes(
     resp.headers.get('content-type')?.split(';')[0]))
    throw Error('FOTO_INDISPONIVEL');
   const blob=await resp.blob();
   if(atual!==numeroConsultaFotoReal)return;
   if(blob.size===0||blob.size>3*1024*1024)throw Error('FOTO_INVALIDA');
   // URL autenticada no proprio dominio; CSP da conta REAL nao libera blob:.
   const url='/api/contas/foto-perfil?revisao='+Date.now()+'-'+atual;
   if(fotoPerfilUrlReal?.startsWith('blob:'))URL.revokeObjectURL(fotoPerfilUrlReal);
   fotoPerfilUrlReal=url;
   const topo=$('loop03ImagemFotoTopo'),rodape=$('loop03ImagemFotoRodape');
   for(const img of [topo,rodape]){img.src=url;img.hidden=false;}
   $('loop03FotoSemImagem').hidden=true;
   $('loop03AvatarRodapeVazio').hidden=true;
  }catch{
   const status=$('statusFotoPerfil');
   if(status)status.textContent='Não foi possível consultar sua foto agora.';
  }
 }
 // Fotos grandes escolhidas no celular sao reduzidas ANTES da rede.
 // O backend REAL continua validando o JPEG/PNG/WebP e removendo metadados.
 // Cliente e operador escolhem fotos DIFERENTES; somente o ajuste e compartilhado.
 // Fotos comuns decodificadas no aparelho (celular/WhatsApp) viram JPEG
 // pequeno ANTES do envio ao endpoint independente de cada sessao.
 async function prepararFotoPerfilReal(arquivo){
  const limite=3*1024*1024,limiteEntrada=24*1024*1024;
  if(!arquivo||!Number.isFinite(arquivo.size)||arquivo.size<1)
   throw Error('Escolha uma foto válida.');
  if(arquivo.size>limiteEntrada)
   throw Error('Escolha uma imagem com até 24 MB.');
  const tipo=String(arquivo.type||'').toLowerCase();
  if(tipo&&!tipo.startsWith('image/')&&tipo!=='application/octet-stream')
   throw Error('Escolha uma imagem com até 24 MB.');
  // Navegadores mais antigos podem não ter createImageBitmap. Para
  // fotos comuns até 3 MB, o servidor ainda valida o arquivo original.
  if(typeof createImageBitmap!=='function'){
   if(arquivo.size<=limite&&
      ['image/jpeg','image/png','image/webp'].includes(tipo))
    return {dados:arquivo,mime:tipo};
   throw Error('O navegador não consegue reduzir esta imagem. Escolha uma foto JPEG, PNG ou WebP menor.');
  }
  let imagem;
  try{
   imagem=await createImageBitmap(arquivo);
   if(!imagem.width||!imagem.height)throw Error('FOTO_INVALIDA');
   const fator=Math.min(1,1920/Math.max(imagem.width,imagem.height));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(imagem.width*fator));
   canvas.height=Math.max(1,Math.round(imagem.height*fator));
   const contexto=canvas.getContext('2d',{alpha:false});
   if(!contexto)throw Error('FOTO_INVALIDA');
   contexto.fillStyle='#ffffff';
   contexto.fillRect(0,0,canvas.width,canvas.height);
   contexto.drawImage(imagem,0,0,canvas.width,canvas.height);
   for(const qualidade of [0.86,0.72,0.55,0.42]){
    const reduzida=await new Promise(resolve=>
     canvas.toBlob(resolve,'image/jpeg',qualidade));
    if(reduzida?.size>0&&reduzida.size<=limite)
     return {dados:reduzida,mime:'image/jpeg'};
   }
   throw Error('FOTO_GRANDE_DEMAIS');
  }catch(e){
   if(e.message==='FOTO_GRANDE_DEMAIS')
    throw Error('A foto ficou grande demais. Escolha outra imagem.');
   if(arquivo.size<=limite&&
     ['image/jpeg','image/png','image/webp'].includes(tipo))
    return {dados:arquivo,mime:tipo};
   throw Error('O navegador não conseguiu abrir esta foto. Escolha uma imagem comum do celular.');
  }finally{
   if(imagem?.close)imagem.close();
  }
 }
 // Mensagens permanentes para upload REAL: sem vazar caminhos internos ou credenciais.
 function explicarFalhaFotoReal(e){
  const codigo=e?.message;
  const motivos={
   FOTO_INVALIDA:'A foto está inválida. Escolha uma imagem JPEG, PNG ou WebP.',
   FOTO_REAL_FORMATO_INVALIDO:'Formato não aceito. Selecione JPEG, PNG ou WebP.',
   FOTO_DIMENSOES_INVALIDAS:'As dimensões da foto são muito grandes. Escolha outra.',
   FOTO_GRANDE_DEMAIS:'A foto ultrapassou o limite de 3 MB.',
   FOTO_NAO_GRAVADA:'O servidor não confirmou o salvamento da foto.',
   FOTO_REAL_INDISPONIVEL:'O armazenamento da foto está indisponível. Tente novamente.',
   FOTO_OPERADOR_INDISPONIVEL:'O armazenamento da foto do operador está indisponível. Tente novamente.',
   CSRF_INVALIDO:'Sua sessão expirou. Entre novamente para salvar sua foto.'
  };
  if(Object.prototype.hasOwnProperty.call(motivos,codigo))return motivos[codigo];
  if(e?.status===401||e?.status===403)
   return 'Sessão não autorizada. Saia e entre novamente para enviar a foto.';
  if(e?.status===413)return 'A foto ultrapassou o limite de 3 MB após o preparo.';
  if(e?.status===415)return 'O servidor aceita apenas JPEG, PNG ou WebP.';
  if(e?.status===503)return 'Não foi possível gravar a foto no servidor agora.';
  if(e?.name==='TypeError')return 'Falha de conexão durante o envio da foto. Verifique sua internet.';
  if(typeof codigo==='string'&&[
   'Escolha uma foto válida.',
   'Escolha uma imagem com até 24 MB.',
   'Este navegador não consegue preparar a foto. Escolha JPEG, PNG ou WebP de até 3 MB.',
   'A foto ficou grande demais. Escolha outra imagem.',
   'O navegador não conseguiu abrir esta foto. Escolha uma imagem comum do celular.'
  ].includes(codigo))return codigo;
  return 'Não foi possível salvar a foto'+
   (Number.isSafeInteger(e?.status)?' (erro '+e.status+')':'')+
   '. Tente novamente.';
 }
 function avisarFalhaFotoReal(mensagem){
  $('statusFotoPerfil').textContent=mensagem;
  dizer(mensagem);
  // A aba Minha Conta costuma estar fechada quando o usuário toca na foto.
  if($('conteudoConta')?.hidden&&typeof alert==='function')alert(mensagem);
 }
 async function salvarFotoPerfilReal(ev){
  ev.preventDefault();
  const campo=$('arquivoFotoPerfil'),status=$('statusFotoPerfil');
  const arquivo=campo.files?.[0];
  if(!arquivo){avisarFalhaFotoReal('Escolha uma foto primeiro.');return;}
  if(typeof csrf!=='string'||csrf.length<24){
   const aviso='Entre novamente na conta para salvar sua foto.';
   avisarFalhaFotoReal(aviso);return;
  }
  const botao=$('formFotoPerfil').querySelector('button[type="submit"]');
  if(botao.disabled)return;
  botao.disabled=true;status.textContent='Preparando sua foto...';
  try{
   const preparada=await prepararFotoPerfilReal(arquivo);
   status.textContent='Salvando sua foto...';
   const resp=await fetch('/api/contas/foto-perfil',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':preparada.mime,'X-Loop-Csrf':csrf},
    body:preparada.dados
   });
   const dados=await resp.json().catch(()=>({}));
   if(resp.status!==201||dados.fotoSalva!==true){
    const falha=new Error(dados.erro||'FOTO_NAO_GRAVADA');
    falha.status=resp.status;
    throw falha;
   }
   campo.value='';
   await atualizarFotoPerfilReal();
   const sucesso='Foto salva no LOOP e disponível também na AKITEMM.';
   status.textContent=sucesso;dizer(sucesso);
  }catch(e){
   avisarFalhaFotoReal('Não foi possível salvar a foto: '+explicarFalhaFotoReal(e));
  }finally{botao.disabled=false;}
 }
 function sincronizarFotoRodapeReal(){
  const topo=$('loop03ImagemFotoTopo'),rodape=$('loop03ImagemFotoRodape');
  // Foto autenticada da conta REAL, reaproveitada dentro das molduras existentes.
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
  // Mesmo que os documentos estejam temporariamente indisponíveis,
  // ninguém fica preso nesta tela: pode sair ou entrar como operador.
  const acessos=document.createElement('nav');
  acessos.setAttribute('aria-label','Trocar acesso');
  const sairConta=document.createElement('button');
  sairConta.type='button';sairConta.textContent='Trocar de acesso';
  sairConta.addEventListener('click',async()=>{
   sairConta.disabled=true;
   try{
    await requisitar('/sair',{method:'POST',body:{},csrfObrigatorio:true});
    csrf=null;area.remove();mostrarLogin('login');
   }catch(e){status.textContent=erro(e);sairConta.disabled=false;}
  });
  const abrirOperador=document.createElement('a');
  abrirOperador.href='/administrador/entrar';
  abrirOperador.textContent='Entrar no escritório do operador';
  acessos.append(sairConta,document.createTextNode(' '),abrirOperador);
  area.append(titulo,msg,status,acessos);
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
     if(entradaPelaLoja)location.assign('/loja');
    }catch(e){status.textContent=erro(e);btn.disabled=false;}
   });
  }catch(e){status.textContent='Não foi possível carregar os documentos. '+erro(e);}
 }
 // Mesma tela aprovada, sem criar conta falsa nem acessar dados privados.
 // Somente uma sessao administrativa autenticada abre este modo.

 // Áreas próprias do operador, sem atribuir a ele uma conta ou posição fictícia.
 let paineisOperadorPreparados=false;
 function prepararPaineisOperador(){
  if(paineisOperadorPreparados)return;
  paineisOperadorPreparados=true;
  const areas={
   conteudoPosicoes:[
    '<h2>Posições e filas · Operador</h2>',
    '<div id="adminResumoPosicoes" class="loop03-admin-dado" role="status">Consultando filas do servidor…</div>',
    '<div class="loop03-admin-acoes"><button type="button" id="adminAtualizarPosicoes">Atualizar posições</button><a href="/administrador">Gerenciar na Central</a></div>'
   ],
   conteudoEquipe:[
    '<h2>Cadastros · Operador</h2>',
    '<p>Localize pelo nick. Nome e telefone podem ser corrigidos com motivo e auditoria. E-mail, CPF, senha e vínculos não são alterados aqui.</p>',
    '<form id="adminBuscaCadastro" class="loop03-admin-campos"><label for="adminNickBusca">Nick do cliente</label>',
    '<input id="adminNickBusca" name="nick" maxlength="12" pattern="[A-Za-z]{1,12}" required>',
    '<div class="loop03-admin-acoes"><button type="submit">Localizar cadastro</button></div></form>',
    '<div id="adminCadastroEstado" class="loop03-admin-dado" role="status" aria-live="polite">Digite o nick para consultar.</div>',
    '<form id="adminCorrigeCadastro" class="loop03-admin-campos" hidden>',
    '<label for="adminNomeCadastro">Nome</label><input id="adminNomeCadastro" maxlength="90" required>',
    '<label for="adminTelefoneCadastro">Telefone</label><input id="adminTelefoneCadastro" inputmode="tel" maxlength="24">',
    '<label for="adminMotivoCadastro">Motivo da correção</label><textarea id="adminMotivoCadastro" minlength="10" maxlength="200" required rows="3"></textarea>',
    '<div class="loop03-admin-acoes"><button type="submit">Salvar correção auditada</button></div></form>',
    '<div class="loop03-admin-acoes"><a href="/administrador">Abrir Central do Administrador</a></div>'
   ],
   conteudoFinanceiro:[
    '<h2>Financeiro · Operador</h2>',
    '<div id="adminResumoFinanceiro" class="loop03-admin-dado" role="status">Consultando controle de caixa e catraca…</div>',
    '<div class="loop03-admin-acoes"><button type="button" id="adminAtualizarFinanceiro">Atualizar</button><a href="/administrador">Gestão financeira na Central</a></div>'
   ],
   conteudoMeusPedidos:[
    '<h2>Pedidos · Operador</h2>',
    '<div id="adminResumoPedidos" class="loop03-admin-dado" role="status">Consultando cadeia de pedidos…</div>',
    '<div class="loop03-admin-acoes"><button type="button" id="adminAtualizarPedidos">Atualizar pedidos</button><a href="/administrador">Gerenciar na Central</a></div>'
   ],
   conteudoLinks:[
    '<h2>Links e acessos · Operador</h2>',
    '<p>Acessos oficiais ao escritório, à loja e à Central.</p>',
    '<div class="loop03-admin-acoes"><a href="/escritorio/VILELA?visao=cliente">Meu escritório de cliente</a><a href="/loja/VILELA">Minha loja</a><a href="/administrador">Central do Administrador</a></div>'
   ],
   conteudoConta:[
    '<h2>Conta do operador</h2>',
    '<p>Seu perfil administrativo é independente da conta VILELA. A foto do operador é alterada tocando no retrato do cabeçalho.</p>',
    '<div class="loop03-admin-acoes"><a href="/escritorio?visao=cliente">Ver Minha Conta como cliente</a><a href="/administrador">Central do Administrador</a></div>'
   ]
  };
  for(const [id,linhas] of Object.entries(areas)){
   const destino=$(id);if(!destino)continue;
   const div=document.createElement('div');
   div.className='loop03-admin-section';
   div.innerHTML=linhas.join('');
   destino.prepend(div);
  }
  $('adminAtualizarPosicoes')?.addEventListener('click',()=>void carregarAbaOperador('abaPosicoes'));
  $('adminAtualizarFinanceiro')?.addEventListener('click',()=>void carregarAbaOperador('abaFinanceiro'));
  $('adminAtualizarPedidos')?.addEventListener('click',()=>void carregarAbaOperador('abaMeusPedidos'));
  let nickCadastroConsultado=null;
  $('adminBuscaCadastro')?.addEventListener('submit',async e=>{
   e.preventDefault();
   const nick=$('adminNickBusca').value.trim(),estado=$('adminCadastroEstado');
   const form=$('adminCorrigeCadastro');
   form.hidden=true;nickCadastroConsultado=null;
   estado.textContent='Consultando cadastro…';
   try{
    if(!/^[A-Za-z]{1,12}$/.test(nick))throw Error('Nick inválido.');
    const r=await fetch('/api/admin/contas/cadastro?nick='+encodeURIComponent(nick),{
     credentials:'same-origin',cache:'no-store'
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.cadastro)throw Error(d.erro||'Cadastro não localizado.');
    const x=d.cadastro;
    nickCadastroConsultado=x.nick;
    estado.textContent='Nick: '+x.nick+'\nE-mail: '+x.email+
     '\nVerificado: '+(x.emailVerificado?'Sim':'Pendente')+
     '\nCPF: '+(x.cpfExibicao||'Não informado')+
     '\nCadastro: '+new Date(x.registradoEm).toLocaleDateString('pt-BR');
    $('adminNomeCadastro').value=x.nome;
    $('adminTelefoneCadastro').value=x.telefone||'';
    $('adminMotivoCadastro').value='';
    form.hidden=false;
   }catch(err){estado.textContent='Consulta não realizada: '+err.message;}
  });
  $('adminCorrigeCadastro')?.addEventListener('submit',async e=>{
   e.preventDefault();
   if(!nickCadastroConsultado)return;
   const form=e.currentTarget,botao=form.querySelector('[type=submit]');
   botao.disabled=true;
   const estado=$('adminCadastroEstado');
   try{
    const token=await obterCsrfOperadorReal();
    const r=await fetch('/api/admin/contas/cadastro/corrigir',{
     method:'POST',credentials:'same-origin',cache:'no-store',
     headers:{'Content-Type':'application/json','X-Loop-Admin-Csrf':token},
     body:JSON.stringify({
      nick:nickCadastroConsultado,nome:$('adminNomeCadastro').value.trim(),
      telefone:$('adminTelefoneCadastro').value.trim(),
      motivo:$('adminMotivoCadastro').value.trim()
     })
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok||d.corrigido!==true)throw Error(d.erro||'Correção não confirmada.');
    estado.textContent='Cadastro de '+nickCadastroConsultado+
     ' corrigido, auditado e confirmado no banco.';
    form.hidden=true;nickCadastroConsultado=null;
   }catch(err){estado.textContent='Correção não realizada: '+err.message;}
   finally{botao.disabled=false;}
  });
 }
 async function carregarAbaOperador(id){
  if(!modoOperadorAtual)return;
  const rotas={
   abaPosicoes:['/api/admin/loop/estado','adminResumoPosicoes'],
   abaFinanceiro:['/api/admin/loop/controle','adminResumoFinanceiro'],
   abaMeusPedidos:['/api/admin/loop/cadeia-comercial','adminResumoPedidos']
  };
  const info=rotas[id];if(!info)return;
  const destino=$(info[1]);if(!destino)return;
  destino.textContent='Atualizando dados reais do servidor…';
  try{
   const r=await fetch(info[0],{credentials:'same-origin',cache:'no-store'});
   const d=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(d.erro||'Consulta indisponível.');
   if(!modoOperadorAtual)return;
   if(id==='abaPosicoes'){
    destino.textContent='Fila A: '+d.filaA+' posições\nFila B: '+d.filaB+
     ' posições\nEventos no ciclo: '+d.tabuleiro.eventosNoCiclo+
     ' de 6\nCentros concluídos: '+d.tabuleiro.ciclosConcluidos;
   }else if(id==='abaFinanceiro'){
    destino.textContent='Modo da catraca: '+d.modo+
     '\nGiros de hoje: '+d.girosHoje+
     '\nMeta: '+d.metaCentrosDia+' centros'+
     '\nCaixa comprovado para meta: '+(d.caixaConciliadoParaMeta?'Sim':'Não')+
     '\nGiros financeiros: '+(d.autorizacaoFinanceiraDosGiros?'Autorizados':'Bloqueados até comprovação externa');
   }else{
    const p=d.pedidos||{},e=d.eventos||{},o=d.outbox||{};
    destino.textContent='Pedidos aguardando pagamento: '+(p.aguardandoPagamento??'—')+
     '\nPedidos aprovados: '+(p.aprovados??'—')+
     '\nEventos aguardando conciliação: '+(e.aguardandoConciliacao??'—')+
     '\nRemessas pendentes: '+(o.pendentes??'—')+
     '\nEstrutura: '+d.statusEstrutural+
     '\nA consulta não comprova liquidação bancária.';
   }
  }catch(e){destino.textContent='Dados indisponíveis: '+e.message;}
 }
 function abrirPainelOperador(){
  modoOperadorAtual=true;csrf=null;
  posicionarCampoFotoPerfil(true);
  for(const id of ['painelLogin','painelCadastro','painelRecuperacao'])
   $(id).hidden=true;
  $('painelConta').hidden=false;
  document.body.classList.add('loop03-logado','loop03-modo-operador');
  $('loop03NickIntegrado').textContent='OPERADOR';
  $('loop03RodapeFilaIntegrado').hidden=true;
  $('loop03RodapeCoroaIntegrado').hidden=true;
  $('loop03AbrirPerfil').disabled=true;
  fecharDadosRodapeReal();
  // O operador tem seu proprio retrato; nao copia foto de titular.
  $('loop03AlterarFotoTopo').disabled=false;
  limparFotoPerfilReal();
  void atualizarFotoOperadorReal();
  $('painelVerificarEmail').hidden=true;
  $('painelIdentidadeTeste').hidden=true;
  $('conteudoConta').hidden=true;
  const acoes=$('loopOperadorAcoes');if(acoes)acoes.hidden=false;
  const indicadores=document.querySelector('.loop03-indicadores');
  if(indicadores)indicadores.hidden=false;
  // Abre somente a aba operacional existente; nao concede identidade de cliente.
  posicoesResumoReal=[];posicaoSelecionada='';posicaoResumoEscolhidaManualmente=false;
  $('posicoesPainel').replaceChildren();
  prepararAbasMotor();
  for(const tab of document.querySelectorAll('#loop03SidebarIntegrado [role=tab]')){
   const resumo=tab.id==='abaResumo';
   const habilitada=true;
   tab.disabled=!habilitada;
   tab.setAttribute('aria-selected',String(resumo));
   tab.setAttribute('aria-current',resumo?'page':'false');
   tab.tabIndex=resumo?0:-1;
   const painel=tab.getAttribute('aria-controls');
   if(painel&&$(painel))$(painel).hidden=!resumo;
   if(!habilitada)tab.title='Acesso administrativo na central do operador';
   else tab.removeAttribute('title');
  }
  $('conteudoResumo').hidden=false;
  prepararPaineisOperador();
  const caixas=document.querySelectorAll('.loop03-indicadores .loop03-indicador');
  if(caixas.length===3){
   caixas[0].querySelector('small').textContent='POSIÇÕES NAS FILAS';
   caixas[0].querySelector('span').textContent='Ver posições e filas';
   caixas[1].querySelector('small').textContent='GIROS HOJE';
   caixas[2].querySelector('small').textContent='EVENTOS NO CICLO';
  }
  void carregarTabuleiroOperador();
  void atualizarAtalhoOperadorReal();
 }
 function painelConta(s){
  limparAgendaOperador();
  posicionarCampoFotoPerfil(false);
  modoOperadorAtual=false;
  document.body.classList.remove('loop03-modo-operador');
  const acoes=$('loopOperadorAcoes');if(acoes)acoes.hidden=true;
  $('loop03AbrirPerfil').disabled=false;
  $('loop03AlterarFotoTopo').disabled=false;
  csrf=s.csrf;
  void apresentarAceiteMigrado(s);
  $('painelLogin').hidden=true;
  $('painelCadastro').hidden=true;
  $('painelRecuperacao').hidden=true;
  $('painelConta').hidden=false;
  document.body.classList.add('loop03-logado');
  fecharDadosRodapeReal();
  sincronizarFotoRodapeReal();
  void atualizarFotoPerfilReal();
  nickResumoReal=s.nick;
  // Os títulos são restaurados ao voltar do perfil administrativo sem
  // redesenhar ou apagar nenhuma das três molduras aprovadas.
  const indicadoresCliente=document.querySelectorAll('.loop03-indicadores .loop03-indicador');
  if(indicadoresCliente.length===3){
   indicadoresCliente[0].querySelector('small').textContent='MINHAS POSIÇÕES';
   indicadoresCliente[1].querySelector('small').textContent='GIROS / HORA';
   indicadoresCliente[2].querySelector('small').textContent='POSIÇÃO SELECIONADA';
  }
  $('loop03NickIntegrado').textContent='@'+nickVisivel(s.nick);
  posicoesResumoReal=[];posicaoSelecionada='';posicaoResumoEscolhidaManualmente=false;
  atualizarSituacaoRodapeReal();
  $('perfilCliente').textContent='Nick: '+nickVisivel(s.nick)+
   (s.emailVerificado?' · E-mail confirmado':' · Confirme seu e-mail');
  $('painelVerificarEmail').hidden=s.emailVerificado;
  if(s.emailVerificado===false)restaurarContadorEmail();
  else if(contadorEmail!==null){
   clearInterval(contadorEmail);contadorEmail=null;
  }
  $('painelIdentidadeTeste').hidden=true;
  $('conteudoConta').hidden=false;
  // A fonte é o endpoint autenticado do mesmo SQLite, não dados LAB.
  if(s.motorLoopInterno===true){
   prepararAbasMotor();
   void carregarMotor();
  }
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
  // Reavaliar a sessão de operador após montar a conta: links da AKITEMM
  // acompanham a mesma visualização do LOOP, sem expor dados administrativos.
  void atualizarAtalhoOperadorReal();
  prepararRede();
  preencherLinks(s.nick);
  void carregarRede();
  void carregarDados();
 }
 let redePreparada=false;
 function prepararRede(){
  if(redePreparada)return;
  redePreparada=true;
  const tituloConfirmados=$('redeTotalCadastros')?.parentElement?.querySelector('small');
  if(tituloConfirmados)tituloConfirmados.textContent='CADASTROS CONFIRMADOS';
  $('redeADistribuirEnsaio')?.removeAttribute('aria-label');
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
  const endereco=location.origin,identificador=encodeURIComponent(nickVisivel(nick));
  origemLinks={loja:endereco+'/loja/'+identificador,
   escritorio:endereco+'/escritorio/'+identificador};
  $('linkLoja').value=origemLinks.loja;
  $('linkEscritorio').value=origemLinks.escritorio;
  $('linksNick').textContent='Links da conta @'+nickVisivel(nick);
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
  const texto=(tag,cls,value)=>{const el=document.createElement(tag);
   if(cls)el.className=cls;
   if(value!==undefined)el.textContent=value;
   return el;
  };
  if(!dados.length){
   alvo.append(texto('p','loop03-rede-vazia',
    'Nenhum cadastro encontrado por esse nick ou número.'));
   return;
  }
  // Reconstroi os mesmos cartoes grandes aprovados na Minha Equipe:
  // bolinha numerada, situacao, telefone, detalhes e dez botoes de posicao.
  // Nenhum convite pendente e promovido ou vinculado sem prova real.
  for(const p of dados){
   // Verde é a confirmação explícita do CPF/termos do indicado,
   // não a simples criação da conta nem uma compra de ensaio.
   const registroValidado=p.cadastroConfirmado===true;
   const emAnalise=p.estado==='QUALIFICACAO_ENSAIO';
   const aguardando=p.estado==='COMPRA_ENSAIO_SEM_QUALIFICACAO';
   const cor=registroValidado?'verde':emAnalise?'azul':
    aguardando?'amarelo':'vermelho';
   const situacao=registroValidado?'Cadastro confirmado':
    emAnalise?'Vínculo em análise':aguardando?
    'Ativação pendente':'Cadastro realizado';
   const card=texto('article','loop03-rede-pessoa','');
   card.dataset.estado=cor;
   const numero=Number.isSafeInteger(p.numeroCadastro)&&p.numeroCadastro>0?
    p.numeroCadastro:null;
   if(numero!==null)card.dataset.numeroCadastro=String(numero);
   const cab=texto('div','loop03-rede-pessoa-cabecalho','');
   const n=numero===null?'#—':'#'+String(numero).padStart(4,'0');
   const bolinha=texto('span','loop03-rede-pessoa-numero',n);
   bolinha.title='Ordem permanente do cadastro nesta equipe.';
   const luz=texto('span','loop03-rede-pessoa-luz','');
   luz.setAttribute('aria-hidden','true');
   const botao=texto('button','loop03-rede-pessoa-menu','⋮');
   botao.type='button';
   botao.setAttribute('aria-label','Posições e detalhes de @'+p.nick);
   botao.setAttribute('aria-expanded','false');
   const detalhes=texto('div','loop03-rede-pessoa-detalhes','');
   detalhes.hidden=true;
   const identificador='equipePosicoes'+(numero===null?
    String(dados.indexOf(p)):String(numero));
   detalhes.id=identificador;botao.setAttribute('aria-controls',identificador);
   botao.addEventListener('click',()=>{
    const abrir=detalhes.hidden;
    for(const painel of alvo.querySelectorAll('.loop03-rede-pessoa-detalhes')){
     painel.hidden=true;
     const toggle=painel.parentElement.querySelector('.loop03-rede-pessoa-menu');
     if(toggle)toggle.setAttribute('aria-expanded','false');
    }
    detalhes.hidden=!abrir;
    botao.setAttribute('aria-expanded',String(abrir));
   });
   cab.append(bolinha,luz,texto('strong','loop03-rede-pessoa-nick','@'+p.nick),
    texto('span','loop03-rede-pessoa-status',situacao),botao);
   const infos=texto('div','loop03-rede-pessoa-info','');
   const tel=typeof p.telefone==='string'&&
    /^[1-9][0-9][0-9]{8,9}$/.test(p.telefone)?p.telefone:null;
   if(tel){
    const infoTel=texto('span',null,'Telefone: ');
    const contato=texto('a',null,tel);
    contato.href='tel:+55'+tel;
    contato.setAttribute('aria-label','Ligar para @'+p.nick);
    infoTel.append(contato);infos.append(infoTel);
   }else infos.append(texto('span',null,'Telefone: contato não informado'));
   const data=new Date(p.registradoEm);
   const valido=Number.isFinite(data.getTime());
   const format={timeZone:'America/Sao_Paulo'};
   infos.append(
    texto('span',null,'Cadastro: '+(valido?
     data.toLocaleDateString('pt-BR',format):'não informado')),
    texto('span',null,'Horário: '+(valido?
     data.toLocaleTimeString('pt-BR',{...format,hour:'2-digit',
      minute:'2-digit',hour12:false}):'não informado')+' (Brasília)'),
    texto('span',null,'Fila: '+(p.filaCadastro==='A'?'A':
     p.filaCadastro==='B'?'B':'não informada'))
   );
   const anotacao=texto('p','loop03-rede-pessoa-vinculo',
    registroValidado?'Cadastro confirmado. Ativação no LOOP depende da qualificação.':
    emAnalise?'Vínculo aguardando comprovação real.':
    aguardando?'Aguardando confirmação da posição.':
    'Aguardando ativação no LOOP.');
   detalhes.append(texto('strong','loop03-rede-alocar-titulo',
    'Escolher posição (1 a 10)'));
   const grade=texto('div','loop03-rede-alocar-posicoes','');
   const reservada=Number.isSafeInteger(p.posicaoDestinoReservada)&&
    p.posicaoDestinoReservada>=1&&p.posicaoDestinoReservada<=10?
    p.posicaoDestinoReservada:null;
   const aviso=texto('p','loop03-rede-pessoa-aviso',
    reservada!==null?'Destino fixado na posição '+reservada+
     '. Aguardando ativação real da indicação.':
     'Escolha uma vez a posição de destino. O cadastro ficará reservado aqui;'+
     ' a indicação só será ativada após comprovação.');
   for(let n=1;n<=10;n++){
    const escolha=texto('button','loop03-rede-posicao',String(n));
    escolha.type='button';
    escolha.disabled=reservada!==null||emAnalise||numero===null;
    escolha.setAttribute('aria-label',
     'Escolher posição '+n+' para @'+p.nick);
    escolha.setAttribute('aria-pressed',String(reservada===n));
    if(reservada===n){
     escolha.classList.add('loop03-rede-posicao-selecionada');
     escolha.title='Destino já escolhido e preservado';
    }else escolha.title=escolha.disabled?
     'Destino fixado ou indicação já vinculada':
     'Escolher posição '+n+' (escolha única)';
    escolha.addEventListener('click',async()=>{
     if(reservada!==null||emAnalise||numero===null)return;
     for(const b of grade.querySelectorAll('button'))b.disabled=true;
     aviso.textContent='Salvando destino da indicação...';
     try{
      const dado=await requisitar('/minha-rede/destino',{
       method:'POST',csrfObrigatorio:true,
       body:{numeroCadastro:numero,posicao:n}
      });
      if(dado.registrado!==true||dado.posicaoDestinoReservada!==n||
         dado.vinculacaoAtiva!==false||dado.financeiroReal!==false)
       throw Error('DESTINO_NAO_CONFIRMADO');
      p.posicaoDestinoReservada=n;
      exibirRede();
      dizer('Destino da indicação registrado. Ativação pendente.');
     }catch(e){
      if(e?.status===409){
       void carregarRede();
       return;
      }
      for(const b of grade.querySelectorAll('button'))b.disabled=false;
      aviso.textContent='Não foi possível salvar. Tente novamente.';
      dizer(erro(e));
     }
    });
    grade.append(escolha);
   }
   detalhes.append(grade);
   if(emAnalise&&Number.isSafeInteger(p.posicaoDestinoEnsaio))
    detalhes.append(texto('p','loop03-rede-pessoa-vinculo',
     'Posição em análise: #'+p.posicaoDestinoEnsaio));
   detalhes.append(aviso);
   card.append(cab,infos,anotacao,detalhes);alvo.append(card);
  }
 }
 async function carregarRede({mais=false}={}){
  if(redePaginando)return;
  redePaginando=true;
  if(!mais){titularesIndicados=[];redeProximoCursor=null;}
  try{
   const pagina=mais?(redeProximoCursor?
    '?cursor='+encodeURIComponent(redeProximoCursor):
    '?offset='+titularesIndicados.length):'';
   const dados=await requisitar('/minha-rede'+pagina);
   if(!Array.isArray(dados.indicados)||!Number.isSafeInteger(dados.total)||
      dados.financeiroReal!==false||
      (dados.proximoCursor!==undefined&&dados.proximoCursor!==null&&
       (typeof dados.proximoCursor!=='string'||
        dados.proximoCursor.length>512)))
    throw Error('REDE_DIVERGENTE');
   redeProximoCursor=dados.proximoCursor||null;
   titularesIndicados=mais?
    titularesIndicados.concat(dados.indicados):dados.indicados;
   $('maisEquipe').hidden=!dados.temMais;
   const contagens=[dados.resumo?.cadastrosConfirmados,
    dados.resumo?.indicacoesVinculadas,dados.resumo?.aDistribuir];
   if(contagens.some(n=>!Number.isSafeInteger(n)||n<0)||
      contagens[0]>dados.total||contagens[1]>dados.total||
      contagens[2]>contagens[0])throw Error('REDE_CONTADORES_INVALIDOS');
   const contar=n=>n.toLocaleString('pt-BR');
   $('redeTotalCadastros').textContent=contar(contagens[0]);
   $('redeAlocadasEnsaio').textContent=contar(contagens[1]);
   $('redeADistribuirEnsaio').textContent=contar(contagens[2]);
   $('equipeResumo').textContent=contar(dados.total)+
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
 const rotulosPedidos={
  AGUARDANDO_PAGAMENTO:['Aguardando pagamento','pendente'],
  APROVADO_PARA_EXPEDICAO:['Aprovado para expedição','aprovado'],
  CANCELADO:['Cancelado','cancelado']
 };
 const rotulosRemessas={
  PENDENTE:'Aguardando encaminhamento',
  INDETERMINADO:'Encaminhamento em verificação',
  ENVIADO:'Encaminhado ao fornecedor',
  AGUARDANDO_SEPARACAO:'Aguardando separação'
 };
 const formatoReais=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
 const formatoDataPedido=new Intl.DateTimeFormat('pt-BR',{
  day:'2-digit',month:'short',year:'numeric'
 });
 function mensagemPedidos(painel,titulo,descricao){
  painel.replaceChildren();
  const bloco=document.createElement('div');
  bloco.className='loop03-pedidos-estado';
  const cab=document.createElement('strong');cab.textContent=titulo;
  const nota=document.createElement('p');nota.textContent=descricao;
  bloco.append(cab,nota);painel.append(bloco);
 }
 async function carregarPedidos(pagina=paginaPedidosReal){
  if(!Number.isSafeInteger(pagina)||pagina<0)return;
  const token=++consultaPedidosEmCurso;
  const painel=$('listaPedidos'),resumo=$('pedidosResumo');
  const atualizar=$('atualizarPedidos');
  atualizar.disabled=true;
  resumo.textContent='Consultando seus pedidos...';
  painel.textContent='Carregando histórico...';
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
   for(const pedido of d.pedidos){
    if(typeof pedido.pedidoId!=='string'||typeof pedido.status!=='string'||
       !Array.isArray(pedido.remessas)||pedido.remessas.length>25)
     throw Error('PEDIDO_INVALIDO');
   }
   if(token!==consultaPedidosEmCurso)return;
   paginaPedidosReal=pagina;totalPedidosReal=p.total;
   $('pedidosAnterior').disabled=!p.haAnterior;
   $('pedidosProximo').disabled=!p.haMais;
   $('pedidosPaginacao').textContent='Página '+(pagina+1)+
    ' · '+totalPedidosReal+' pedido(s) no histórico';
   resumo.textContent=p.total===0?'Nenhum pedido registrado':
    p.total===1?'1 pedido no histórico':p.total+' pedidos no histórico';
   painel.replaceChildren();
   if(!d.pedidos.length){
    mensagemPedidos(painel,p.total===0?'Você ainda não tem pedidos':
     'Nenhum pedido nesta página',p.total===0?
     'Quando houver compras registradas na sua conta, elas aparecerão aqui.':
     'Use Anterior para consultar as páginas anteriores.');
    return;
   }
   for(const pedido of d.pedidos){
    const card=document.createElement('article');
    card.className='pedido loop03-pedido-cartao';
    const cab=document.createElement('div');
    cab.className='loop03-pedido-cabecalho';
    const titulo=document.createElement('h3');
    titulo.textContent='Pedido '+pedido.pedidoId;
    const status=document.createElement('span');
    const tipo=rotulosPedidos[pedido.status];
    status.className='loop03-pedido-status loop03-pedido-'+(tipo?.[1]||'neutro');
    status.textContent=tipo?.[0]||pedido.status.replaceAll('_',' ');
    cab.append(titulo,status);
    const informacoes=document.createElement('div');
    informacoes.className='loop03-pedido-informacoes';
    const valor=document.createElement('strong');
    valor.textContent=Number.isSafeInteger(pedido.valorTotalCentavos)&&
     pedido.valorTotalCentavos>=0?
     formatoReais.format(pedido.valorTotalCentavos/100):'Valor em revisão';
    const data=document.createElement('small');
    if(Number.isSafeInteger(pedido.criadoEm)&&pedido.criadoEm>0&&
       !Number.isNaN(new Date(pedido.criadoEm).getTime()))
     data.textContent='Pedido em '+formatoDataPedido.format(new Date(pedido.criadoEm));
    else data.textContent='Data não informada';
    informacoes.append(valor,data);
    card.append(cab,informacoes);
    if(pedido.remessas.length){
     const detalhes=document.createElement('details');
     detalhes.className='loop03-pedido-remessas';
     const abrir=document.createElement('summary');
     abrir.textContent='Ver '+pedido.remessas.length+
      (pedido.remessas.length===1?' remessa':' remessas');
     detalhes.append(abrir);
     const lista=document.createElement('ul');
     for(const envio of pedido.remessas){
      const item=document.createElement('li');
      const nome=document.createElement('strong');
      nome.textContent='Fornecedor '+String(envio.fornecedorId||'—');
      const estado=document.createElement('span');
      estado.textContent=rotulosRemessas[envio.estado]||
       String(envio.estado||'AGUARDANDO_SEPARACAO').replaceAll('_',' ');
      item.append(nome,estado);
      lista.append(item);
     }
     detalhes.append(lista);card.append(detalhes);
    }
    painel.append(card);
   }
  }catch{
   if(token!==consultaPedidosEmCurso)return;
   totalPedidosReal=null;
   resumo.textContent='Consulta temporariamente indisponível';
   $('pedidosPaginacao').textContent='Histórico indisponível';
   mensagemPedidos(painel,'Não foi possível carregar os pedidos',
    'Toque em Atualizar para tentar novamente. Seus pedidos não foram alterados.');
  }finally{
   if(token===consultaPedidosEmCurso)atualizar.disabled=false;
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
  $('loop03NumeroIntegrado').textContent=p?(i+1)+'ª posição':'—';
  $('loop03StatusPosicao').textContent=p?
   '@'+nickVisivel(nickResumoReal)+'\n'+
   (p.fila==='A'||p.fila==='B'?'Fila '+p.fila:
    /^VAGA_[1-6]$/.test(p.local||'')||p.local==='CENTRO'?
     'No tabuleiro':'Fila aguardando definição'):'';
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
    posicaoResumoEscolhidaManualmente=true;
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

 // Atualização leve do placar em TODAS as abas, sem reconstruir os cartões,
 // apagar formulários, perder o scroll ou reabrir a aba do Tabuleiro.
 let placarClienteConsultando=false;
 async function atualizarPlacarCliente(){
  if(placarClienteConsultando||modoOperadorAtual||
     $('painelConta')?.hidden!==false)return;
  placarClienteConsultando=true;
  try{
   const r=await fetch('/api/loop/estado',{
    credentials:'same-origin',cache:'no-store'
   });
   if(!r.ok)return;
   const d=await r.json();
   if(d.fonte!=='IDENTIDADE_E_MOTOR_MESMO_SQLITE'||
      d.somenteLeitura!==true||d.financeiroReal!==false||
      !Array.isArray(d.minhasPosicoes)||
      d.agenda?.origem!=='CATRACA_REAL_MESMO_SQLITE'||
      d.agenda?.luzesDoRelogioCompartilhado!==true)return;
   if(modoOperadorAtual||$('painelConta')?.hidden!==false)return;
   posicoesResumoReal=d.minhasPosicoes.filter(p=>Number.isSafeInteger(p.numero))
    .sort((a,b)=>a.numero-b.numero);
   if(!posicoesResumoReal.some(p=>String(p.numero)===posicaoSelecionada)){
    posicaoResumoEscolhidaManualmente=false;
    posicaoSelecionada=posicoesResumoReal.length?
     String(posicoesResumoReal[0].numero):'';
   }
   $('loop03TotalIntegrado').textContent=String(d.minhasPosicoes.length)+
    ' / '+String(d.limitePosicoesAtivas);
   atualizarTopoPosicaoReal();
   if(popupPosicoesRealAberto)preencherPopupReal();
   visorCatraca.registrarAgenda(d.agenda);
  }catch{
   // Uma leitura indisponível não altera cartões, posições ou contas.
  }finally{placarClienteConsultando=false;}
 }

 function prepararAbasMotor(){
  if(painelMotorPreparado)return;
  painelMotorPreparado=true;
  visorCatraca.iniciar();
  // Sem reproduzir os cartões ao atualizar o placar nas outras abas.
  // O operador mantém seu fluxo de atualização somente no Tabuleiro.
  window.setInterval(()=>{
   if(document.hidden)return;
   if($('conteudoTabuleiro')?.hidden===false){
    void carregarMotor();
   }else if(!modoOperadorAtual&&$('painelConta')?.hidden===false){
    void atualizarPlacarCliente();
   }
  },15000);
    for(const id of ['atualizarTabuleiroIntegrado','atualizarPosicoes']){
   $(id)?.addEventListener('click',()=>{
    // O relogio abre a configuracao SOBRE o proprio Tabuleiro, sem navegar.
    if(id==='atualizarTabuleiroIntegrado'&&modoOperadorAtual){
     void abrirControleRelogioOperador();return;
    }
    void carregarMotor();
   });
  }
    $('tabuleiroVerPosicoesIntegrado').addEventListener('click',
   ()=>$('abaPosicoes').click());
      // A aba de pedidos usa o livro comercial deste titular, nunca o LAB.
  // O placar superior seleciona uma posição sem mudar a aba atual.
  const abrir=$('loop03IrPosicoesIntegrado'),popup=$('seletorPosicoesResumo');
  abrir.addEventListener('click',()=>{
   if(modoOperadorAtual){$('abaPosicoes').click();return;}
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
   posicaoResumoEscolhidaManualmente=!!seletor.value;
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


 // Controles de CPF/Termos existentes nos DEZ cartões da própria conta.
 // A área recolhida conserva a malha 3x por fileira aprovada, inclusive
 // nos cartões vazios. Nenhum CPF é salvo ou confirmado só pela interface.
 function renderizarControlesCpfTermos(corpo,pos,vaga,liberado){
  const painel=document.createElement('details');
  painel.className='loop03-controles-cpf-termos';
  painel.dataset.posicao=pos?String(pos.numero):'vazia';
  const abrir=document.createElement('summary');
  abrir.textContent='CPF';
  abrir.setAttribute('aria-label','CPF e termos da posição '+vaga);
  painel.append(abrir);
  if(liberado){
   // Confirmação de ensaio já existente, protegida no servidor e no motor.
   renderizarAceiteAzulEnsaio(painel,pos);
  }else{
   const form=document.createElement('form');
   form.className='loop03-controles-cpf-form';
   form.autocomplete='off';
   const etiqueta=document.createElement('label');
   etiqueta.textContent='CPF desta posição';
   const cpf=document.createElement('input');
   cpf.name='cpf';cpf.type='text';cpf.inputMode='numeric';
   cpf.placeholder='000.000.000-00';cpf.maxLength=14;
   cpf.disabled=true;cpf.autocomplete='off';
   etiqueta.append(cpf);
   const doc=document.createElement('details');
   doc.className='loop03-documento-posicao';
   const ler=document.createElement('summary');
   ler.textContent='Ler os termos vigentes';
   const conteudo=document.createElement('p');
   conteudo.textContent='Toque para consultar os termos vigentes.';
   doc.append(ler,conteudo);
   let carregando=false,carregado=false;
   doc.addEventListener('toggle',()=>{
    if(!doc.open||carregado||carregando)return;
    carregando=true;
    conteudo.textContent='Consultando o documento vigente...';
    void requisitar('/documentos-leitura').then(d=>{
     const termos=d?.termos;
     if(d.financeiroReal!==false||!termos||
        typeof termos.texto!=='string'||termos.texto.length<100||
        typeof termos.versao!=='string'||!termos.versao||
        !/^[a-f0-9]{64}$/.test(termos.hash||''))
      throw Error('TERMOS_INDISPONIVEIS');
     conteudo.textContent='Versão: '+termos.versao+'\n'+termos.texto;
     carregado=true;
    }).catch(()=>{
     conteudo.textContent='Termos indisponíveis nesta consulta. Tente novamente.';
    }).finally(()=>{carregando=false;});
   });
   const aceitar=document.createElement('label');
   const check=document.createElement('input');
   check.type='checkbox';check.disabled=true;
   aceitar.append(check,document.createTextNode(' Li e aceito os termos desta posição'));
   const confirmar=document.createElement('button');
   confirmar.type='button';confirmar.disabled=true;
   confirmar.textContent='Confirmar CPF e termos';
   const estado=document.createElement('small');
   estado.className='loop03-cpf-termos-estado';
   estado.textContent=!pos?
    'Disponível após adquirir uma posição.':
    pos.estadoAdesao==='ACEITE_ENSAIO'?
    'Aceite individual registrado; identidade externa ainda pendente.':
    pos.estadoAdesao==='CONFIRMADA'&&
     pos.confirmacaoExternaVerificada===true?
    'Posição já confirmada.':
    'Confirmação real ainda não habilitada para esta posição.';
   form.append(etiqueta,doc,aceitar,confirmar,estado);
   painel.append(form);
  }
  corpo.append(painel);
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

 // Foto administrativa persistida sob a propria credencial de OPERADOR.
 // Nunca reutiliza uma foto de outro titular nem grava no perfil do cliente.
 async function obterCsrfOperadorReal(){
  const r=await fetch('/api/admin/comercial/sessao',{
   credentials:'same-origin',cache:'no-store'
  });
  if(!r.ok)throw Error('Sessão de operador indisponível.');
  const d=await r.json();
  if(d.area!=='ADMIN_COMERCIAL'||typeof d.csrfToken!=='string'||
     !/^[A-Za-z0-9_-]{24,256}$/.test(d.csrfToken))
   throw Error('Sessão administrativa inválida.');
  return d.csrfToken;
 }
 async function atualizarFotoOperadorReal(){
  if(!modoOperadorAtual)return;
  const consulta=++numeroConsultaFotoReal;
  try{
   const r=await fetch('/api/admin/operador/foto-perfil',{
    credentials:'same-origin',cache:'no-store'
   });
   if(consulta!==numeroConsultaFotoReal||!modoOperadorAtual)return;
   if(r.status===404){limparFotoPerfilReal();return;}
   if(!r.ok||!['image/jpeg','image/png','image/webp'].includes(
      r.headers.get('content-type')?.split(';')[0]))
    throw Error('Foto do operador indisponível.');
   const conteudo=await r.blob();
   if(consulta!==numeroConsultaFotoReal||!modoOperadorAtual)return;
   if(conteudo.size<1||conteudo.size>3*1024*1024)
    throw Error('Foto do operador inválida.');
   const url='/api/admin/operador/foto-perfil?revisao='+Date.now();
   const topo=$('loop03ImagemFotoTopo'),rodape=$('loop03ImagemFotoRodape');
   for(const img of [topo,rodape])if(img){img.src=url;img.hidden=false;}
   $('loop03FotoSemImagem').hidden=true;
   $('loop03AvatarRodapeVazio').hidden=true;
  }catch(e){if(modoOperadorAtual)dizer(e.message);}
 }
 async function salvarFotoOperadorReal(ev){
  ev.preventDefault();
  if(!modoOperadorAtual)return;
  const input=$('arquivoFotoPerfil'),arquivo=input.files?.[0];
  if(!arquivo)return;
  const botao=$('loop03AlterarFotoTopo'),status=$('statusFotoPerfil');
  if(botao.disabled)return;
  botao.disabled=true;
  status.textContent='Preparando foto do OPERADOR...';
  try{
   const foto=await prepararFotoPerfilReal(arquivo);
   const token=await obterCsrfOperadorReal();
   const r=await fetch('/api/admin/operador/foto-perfil',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':foto.mime,'X-Loop-Admin-Csrf':token},
    body:foto.dados
   });
   const d=await r.json().catch(()=>({}));
   if(!r.ok||d.fotoSalva!==true)
    throw Error(d.erro||'Não foi possível salvar sua foto.');
   input.value='';
   await atualizarFotoOperadorReal();
   status.textContent='Foto do OPERADOR salva no escritório.';
   dizer(status.textContent);
  }catch(e){
   avisarFalhaFotoReal('Não foi possível salvar a foto: '+explicarFalhaFotoReal(e));
  }finally{botao.disabled=false;}
 }

 // Fonte exclusiva do operador: agenda ja persistida no SQLite real.
 function dataAgendaOperador(d){
  return /^\d{4}-\d{2}-\d{2}$/.test(d||'')?
   d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'todos os dias';
 }
 function textoAgendaOperador(d){
  if(!d||!Number.isSafeInteger(d.metaCentrosDia))return 'Agenda não disponível.';
  const n=d.metaCentrosDia,futura=!!d.metaDataAlvo&&d.metaDataAlvo>d.hoje;
  // O turno que começou ontem pode continuar ativo após meia-noite.
  const ontem=/^\d{4}-\d{2}-\d{2}$/.test(d.hoje||'')?
   new Date(Date.parse(d.hoje+'T12:00:00Z')-86400000)
    .toISOString().slice(0,10):null;
  const continuaOntem=d.metaDataAlvo===ontem&&
   d.janelaInicio>d.janelaFim&&d.horarioPermitido===true&&
   typeof d.horaLocal==='string'&&d.horaLocal<=d.janelaFim;
  const anterior=!!d.metaDataAlvo&&d.metaDataAlvo<d.hoje&&!continuaOntem;
  const situacao=d.modo==='PAUSADA'?'PAUSADA':
   d.modo==='MANUAL'?'MODO MANUAL':n===0?'SEM META':
   anterior?'DATA ENCERRADA':futura?'AGENDADA — AGUARDANDO DATA':
   d.horarioPermitido?'DENTRO DO TURNO':'AGENDADA — AGUARDANDO HORÁRIO';
  return situacao+'\n'+dataAgendaOperador(d.metaDataAlvo)+' · '+
   d.janelaInicio+'–'+d.janelaFim+'\nMeta: '+n+' centros · '+(n*6)+
   ' luzes.\n'+(d.autorizacaoFinanceiraDosGiros===true?
    'Liberação condicionada ao caixa real comprovado.':
    'CAIXA: pagamentos e giros financeiros ainda não autorizados.');
 }
 function limparAgendaOperador(){
  document.getElementById('loopOperadorAgendaConfirmada')?.remove();
 }
 function mostrarAgendaOperador(d){
  if(!modoOperadorAtual)return;
  const alvo=$('estadoRelogioTabuleiro');
  if(!alvo)return;
  let aviso=$('loopOperadorAgendaConfirmada');
  if(!aviso){
   aviso=document.createElement('section');
   aviso.id='loopOperadorAgendaConfirmada';
   aviso.setAttribute('role','status');
   aviso.setAttribute('aria-label','Programação exclusiva do operador');
   alvo.insertAdjacentElement('afterend',aviso);
  }
  aviso.textContent=textoAgendaOperador(d);
 }
 // Seletor próprio: os três botões sempre cabem no Android.
 function criarCampoHorarioOperador(form,descricao,valor){
  const label=document.createElement('label');
  label.textContent=descricao;
  const linha=document.createElement('div');linha.className='loop-operador-horario-linha';
  const input=document.createElement('input');
  input.type='text';input.inputMode='numeric';input.maxLength=5;
  input.placeholder='HH:MM';input.value=valor||'';
  input.setAttribute('aria-label',descricao+' HH:MM');
  const abrir=document.createElement('button');
  abrir.type='button';abrir.textContent='Escolher';
  abrir.setAttribute('aria-label','Escolher '+descricao.toLowerCase());
  linha.append(input,abrir);label.append(linha);form.append(label);
  abrir.addEventListener('click',()=>{
   const janela=document.createElement('dialog');
   janela.id='loopOperadorHorarioDialog';
   const titulo=document.createElement('h2');titulo.textContent='Selecionar '+descricao;
   const controles=document.createElement('div');
   controles.className='loop-operador-horario-seletores';
   const hora=document.createElement('select'),minuto=document.createElement('select');
   hora.setAttribute('aria-label','Hora');minuto.setAttribute('aria-label','Minutos');
   for(let n=0;n<24;n++){
    const op=document.createElement('option');
    op.value=String(n).padStart(2,'0');op.textContent=op.value;hora.append(op);
   }
   for(let n=0;n<60;n++){
    const op=document.createElement('option');
    op.value=String(n).padStart(2,'0');op.textContent=op.value;minuto.append(op);
   }
   const atual=/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.value)?input.value:'09:00';
   hora.value=atual.slice(0,2);minuto.value=atual.slice(3);
   const sep=document.createElement('span');sep.textContent=':';
   controles.append(hora,sep,minuto);
   const rodape=document.createElement('div');rodape.className='loop-operador-horario-acoes';
   const comando=(nome,acao)=>{
    const b=document.createElement('button');b.type='button';b.textContent=nome;
    b.addEventListener('click',acao);rodape.append(b);
   };
   const definir=valor=>{
    input.value=valor;input.dispatchEvent(new Event('input',{bubbles:true}));
    janela.close();
   };
   comando('Limpar',()=>definir(''));
   comando('Cancelar',()=>janela.close());
   comando('Definir',()=>definir(hora.value+':'+minuto.value));
   janela.addEventListener('close',()=>janela.remove(),{once:true});
   janela.append(titulo,controles,rodape);
   document.body.append(janela);janela.showModal();
  });
  return input;
 }
 // Mesmo painel de configuracao do relogio aprovado: abre sobre o Tabuleiro,
 // usa a politica real existente e nunca executa giros ou cria saldo.
 async function abrirControleRelogioOperador(){
  if(!modoOperadorAtual)return;
  if($('loopOperadorCatracaDialog')?.open)return;
  const modal=document.createElement('dialog');
  modal.id='loopOperadorCatracaDialog';
  modal.setAttribute('aria-label','Controlar a catraca do LOOP');
  const fechar=document.createElement('button');
  fechar.type='button';fechar.textContent='Fechar';
  fechar.className='loop-operador-dialog-fechar';
  fechar.addEventListener('click',()=>modal.close());
  const titulo=document.createElement('h2');
  titulo.textContent='Controlar a catraca do LOOP';
  const form=document.createElement('form');
  form.addEventListener('submit',e=>e.preventDefault());
  const resumo=document.createElement('p');
  resumo.className='loop-operador-catraca-resumo';
  resumo.setAttribute('role','status');
  resumo.textContent='Consultando o ritmo da catraca…';
  const status=document.createElement('p');
  status.className='mensagem-operador';status.setAttribute('role','status');
  status.textContent='';
  const rodape=document.createElement('div');
  rodape.className='loop-operador-catraca-rodape';
  rodape.append(status);
  // O resumo e o salvar ficam visiveis; apenas os campos rolam no celular.
  modal.append(fechar,titulo,resumo,form,rodape);
  modal.addEventListener('close',()=>modal.remove(),{once:true});
  document.body.append(modal);modal.showModal();
  const criarCampo=(texto,tipo,valor,opcoes=[])=>{
   const label=document.createElement('label');label.textContent=texto;
   const input=document.createElement(tipo==='select'?'select':'input');
   if(tipo==='select'){
    for(const [value,desc]of opcoes){
     const opt=document.createElement('option');
     opt.value=value;opt.textContent=desc;input.append(opt);
    }
    input.value=valor;
   }else{input.type=tipo;input.value=valor==null?'':String(valor);}
   label.append(input);form.append(label);return input;
  };
  try{
   const r=await fetch('/api/admin/loop/controle',{
    credentials:'same-origin',cache:'no-store'
   });
   // Sessao do operador pode expirar com a pagina ainda aberta.
   // Nao apresentar a catraca como defeituosa; pedir novo login seguro.
   if(r.status===401){
    modal.close();
    mostrarLogin('login');
    $('login').value='OPERADOR';
    const aviso=$('erroLogin');
    if(aviso)aviso.textContent='Sessão do operador encerrada. Entre novamente para controlar a catraca.';
    return;
   }
   const d=await r.json().catch(()=>({}));
   if(!r.ok||!Number.isSafeInteger(d.revisao)||
      d.politicaOperacionalConfiguravel!==true||
      d.financeiroReal!==false||
      !['PAUSADA','MANUAL','AUTOMATICA'].includes(d.modo))
    throw Error('Controle administrativo indisponível.');
   const modo=criarCampo('Modo','select',d.modo,[
    ['PAUSADA','Parada'],['MANUAL','Manual'],
    ['AUTOMATICA','Agendada']
   ]);
   const inicio=criarCampoHorarioOperador(form,'Abertura',d.janelaInicio);
   const fim=criarCampoHorarioOperador(form,'Fechamento',d.janelaFim);
   const limite=criarCampo('Limite de segurança de giros (vazio = livre)',
    'number',d.limiteDiario);
   limite.min='1';limite.max='1000000';
   const meta=criarCampo('Meta diária de centros (0 = sem meta)',
    'number',d.metaCentrosDia);
   meta.min='0';meta.max='1000000';meta.step='1';
   const data=criarCampo('Data da meta (opcional)','date',
    d.metaDataAlvo||'');
   const minutosDe=h=>/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(h)?
    Number(h.slice(0,2))*60+Number(h.slice(3)):null;
   const duracaoBonita=segundos=>{
    const min=Math.floor(segundos/60),seg=segundos%60;
    return min+' min'+(seg?' '+seg+' s':'');
   };
   const conferir=()=>{
    const n=Number(meta.value),a=minutosDe(inicio.value);
    const b=minutosDe(fim.value);
    if(a===null||b===null||meta.value.trim()===''||
       !Number.isSafeInteger(n)||n<0||n>1000000){
     resumo.textContent='Confira o horário e a meta diária.';return false;
    }
    const duracao=((b-a+1440)%1440)||1440;
    if(n===0){
     resumo.textContent='SEM META DIÁRIA\nTurno: '+duracao+
      ' min. Nenhuma luz automática programada.';return true;
    }
    const segundos=Math.max(1,Math.round(duracao*60/(n*6)));
    const porCentro=Math.max(1,Math.round(duracao*60/n));
    const gravado=modo.value===d.modo&&inicio.value===d.janelaInicio&&
     fim.value===d.janelaFim&&n===d.metaCentrosDia&&
     (data.value||null)===(d.metaDataAlvo||null)&&
     (limite.value.trim()===''?null:Number(limite.value))===(d.limiteDiario??null);
    let mensagem=(gravado&&d.revisao>1?'✓ PROGRAMAÇÃO GRAVADA NO SERVIDOR':'PRÉVIA — não salva')+'\n'+
     'Data: '+dataAgendaOperador(data.value||null)+'\n'+
     n+' centros × 6 = '+(n*6)+' luzes\n'+
     'Cada luz: '+duracaoBonita(segundos)+
     ' · Cada centro: '+duracaoBonita(porCentro)+
     '\nTurno: '+inicio.value+'–'+fim.value+' ('+duracao+' min)';
    if(modo.value==='PAUSADA'){
     mensagem+='\nCATRACA PARADA — selecione Agendada e salve para iniciar a previsão.';
    }else if(modo.value==='MANUAL'){
     mensagem+='\nModo Manual: não há contagem automática.';
    }else{
     // Só a agenda GRAVADA e ativa fornece uma próxima luz do servidor.
     const original=modo.value===d.modo&&inicio.value===d.janelaInicio&&
      fim.value===d.janelaFim&&n===d.metaCentrosDia&&
      (data.value||null)===(d.metaDataAlvo||null);
     if(original&&Number.isSafeInteger(d.proximaLuzPrevistaEmMs)&&
        d.proximaLuzPrevistaEmMs>d.agoraServidorMs){
      const horario=new Date(d.proximaLuzPrevistaEmMs).toLocaleTimeString(
       'pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',
        minute:'2-digit',second:'2-digit'});
      mensagem+='\nPróxima luz prevista: '+horario+' (Brasília).';
     }else if(data.value&&data.value>d.hoje){
      mensagem+='\nInício previsto: '+dataAgendaOperador(data.value)+' às '+inicio.value+' (Brasília).';
     }else{
      mensagem+='\nPróxima luz prevista: após salvar, dentro do turno.';
     }
    }
    mensagem+='\nSem caixa real comprovado: nenhum giro autorizado.';
    resumo.textContent=mensagem;
    return true;
   };
   for(const input of [modo,inicio,fim,meta,data])
    input.addEventListener('input',conferir);
   conferir();
   const salvar=document.createElement('button');
   salvar.type='button';salvar.textContent='Salvar programação';
   rodape.prepend(salvar);
   salvar.addEventListener('click',async()=>{
    if(!conferir())return;
    const limiteRaw=limite.value.trim();
    if(limiteRaw!==''&&(!/^[1-9][0-9]*$/.test(limiteRaw)||
       Number(limiteRaw)>1000000)){
     status.textContent='Limite de giros inválido.';return;
    }
    salvar.disabled=true;status.textContent='Salvando programação…';
    try{
     const token=await obterCsrfOperadorReal();
     const response=await fetch('/api/admin/loop/controle',{
      method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json','X-Loop-Admin-Csrf':token},
      body:JSON.stringify({acao:'CONFIGURAR',modo:modo.value,
       janelaInicio:inicio.value,janelaFim:fim.value,
       limiteDiario:limiteRaw===''?null:Number(limiteRaw),
       metaCentrosDia:Number(meta.value),metaDataAlvo:data.value||null,
       revisaoEsperada:d.revisao,motivo:'AJUSTE_OPERACIONAL'})
     });
     const resultado=await response.json().catch(()=>({}));
     if(!response.ok||resultado.alterado!==true)
      throw Error(resultado.erro||'Programação não foi confirmada.');
     const confirmacao=await fetch('/api/admin/loop/controle',{
      credentials:'same-origin',cache:'no-store'
     });
     const atual=await confirmacao.json().catch(()=>({}));
     if(!confirmacao.ok||atual.modo!==modo.value||
       atual.janelaInicio!==inicio.value||atual.janelaFim!==fim.value||
       atual.metaCentrosDia!==Number(meta.value)||
       (atual.limiteDiario??null)!==(limiteRaw===''?null:Number(limiteRaw))||
       (atual.metaDataAlvo??null)!==(data.value||null))
      throw Error('Programação não confirmada na leitura do servidor.');
     d.revisao=atual.revisao;
     d.modo=atual.modo;d.janelaInicio=atual.janelaInicio;
     d.janelaFim=atual.janelaFim;d.metaCentrosDia=atual.metaCentrosDia;
     d.metaDataAlvo=atual.metaDataAlvo;
     d.agoraServidorMs=atual.agoraServidorMs;
     d.proximaLuzPrevistaEmMs=atual.proximaLuzPrevistaEmMs;
     conferir();
     mostrarAgendaOperador(atual);
     status.textContent='Programação salva e confirmada no servidor: '+
      dataAgendaOperador(atual.metaDataAlvo)+' · '+atual.janelaInicio+'–'+
      atual.janelaFim+' · '+atual.metaCentrosDia+' centros ('+
      (atual.metaCentrosDia*6)+' luzes). Pagamentos dependem do caixa.';
     await carregarTabuleiroOperador();
    }catch(e){status.textContent='Alteração não realizada: '+e.message;}
    finally{salvar.disabled=false;}
   });
  }catch(e){status.textContent='Não foi possível abrir: '+e.message;}
 }
 async function carregarTabuleiroOperador(){
  try{
   // Reutiliza as rotas existentes da mesma sessao administrativa e motor real.
   // Nunca consulta posicoes, saldo, CPF ou sessao de um cliente.
   const [respostaMotor,respostaControle]=await Promise.all([
    fetch('/api/admin/loop/estado',{credentials:'same-origin',cache:'no-store'}),
    fetch('/api/admin/loop/controle',{credentials:'same-origin',cache:'no-store'})
   ]);
   if(!respostaMotor.ok||!respostaControle.ok)
    throw Error('TABULEIRO_ADMIN_INDISPONIVEL');
   const [d,controle]=await Promise.all([
    respostaMotor.json(),respostaControle.json()
   ]);
   if(!modoOperadorAtual)return;
   if(d.fonte!=='IDENTIDADE_E_MOTOR_MESMO_SQLITE'||
      d.financeiroReal!==false||
      !Array.isArray(d.minhasPosicoes)||d.minhasPosicoes.length!==0||
      !Number.isSafeInteger(d.filaA)||d.filaA<0||
      !Number.isSafeInteger(d.filaB)||d.filaB<0||
      !d.tabuleiro||!Array.isArray(d.tabuleiro.vagas)||
      d.tabuleiro.vagas.length!==6||
      !Number.isSafeInteger(d.tabuleiro.eventosNoCiclo)||
      d.tabuleiro.eventosNoCiclo<0||d.tabuleiro.eventosNoCiclo>6||
      !Number.isSafeInteger(d.catraca?.giros)||d.catraca.giros<0||
      controle.financeiroReal!==false||
      controle.autorizacaoFinanceiraDosGiros!==false||
      !Number.isSafeInteger(controle.agoraServidorMs)||
      (controle.proximaLuzPrevistaEmMs!==null&&
       (!Number.isSafeInteger(controle.proximaLuzPrevistaEmMs)||
        controle.proximaLuzPrevistaEmMs<=controle.agoraServidorMs))||
      !['PAUSADA','MANUAL','AUTOMATICA'].includes(controle.modo))
    throw Error('TABULEIRO_ADMIN_FONTE_INVALIDA');
   visualTabuleiro.preencherFila('motorFilaA',d.filaA,'A');
   visualTabuleiro.preencherFila('motorFilaB',d.filaB,'B');
   visualTabuleiro.preencherVaga('tabuleiroMotorCentro',d.tabuleiro.centro,true);
   for(let i=0;i<6;i++)
    visualTabuleiro.preencherVaga('tabuleiroMotorVaga'+(i+1),d.tabuleiro.vagas[i]);
   visualTabuleiro.preencherLuzes(d.tabuleiro.eventosNoCiclo);
   // Operador e cliente leem a MESMA projeção da catraca no SQLite.
   // Luzes do relógio são visuais; giros e eventos têm livros separados.
   if(controle.agenda?.origem!=='CATRACA_REAL_MESMO_SQLITE'||
      controle.agenda.somenteLeitura!==true||
      controle.agenda.luzesDoRelogioCompartilhado!==true||
      controle.agenda.eventosReaisNoCiclo!==d.tabuleiro.eventosNoCiclo||
      controle.agenda.ciclosReaisConcluidos!==d.tabuleiro.ciclosConcluidos||
      controle.agenda.girosReaisHoje!==controle.girosHoje||
      controle.agenda.girosReais24h!==controle.giros24h)
    throw Error('AGENDA_COMPARTILHADA_DIVERGENTE');
   visorCatraca.registrarAgenda(controle.agenda);
   visorCatraca.observar(d.catraca.giros,d.tabuleiro.eventosNoCiclo);
   mostrarAgendaOperador(controle);
   // Contador da aba do OPERADOR pertence exclusivamente ao visor do
   // relogio: evitar que leituras HTTP concorrentes substituam a legenda
   // a cada segundo, causando a oscilacao de uma para duas frases.
   $('loop03TotalIntegrado').textContent=String(d.filaA+d.filaB);
   $('loop03Giros24Integrado').textContent=String(controle.girosHoje);
   $('loop03NumeroIntegrado').textContent=d.tabuleiro.eventosNoCiclo+' / 6';
   // Atualizar os 3 quadros APÓS a leitura financeira para não voltar a zero.
   visorCatraca.registrarAgenda(controle.agenda);
   void carregarAbaOperador('abaPosicoes');
   $('loop03StatusPosicao').textContent='';
   $('seletorPosicaoMotor').replaceChildren();
   $('estadoTabuleiroIntegrado').textContent='';
   $('estadoTabuleiroIntegrado').hidden=true;
  }catch{
   if(!modoOperadorAtual)return;
   limparAgendaOperador();
   $('estadoTabuleiroIntegrado').textContent=
    'Tabuleiro administrativo indisponível. Consulte a central do operador.';
   $('estadoTabuleiroIntegrado').hidden=false;
  }
 }
 async function carregarMotor(){
  if(modoOperadorAtual)return carregarTabuleiroOperador();
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
   // O estado permanece no tabuleiro, marcadores e avisos aprovados.
   // Nao criar painel extra na pagina inicial.
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
   if(d.agenda&&(
     d.agenda.origem!=='CATRACA_REAL_MESMO_SQLITE'||
     d.agenda.luzesDoRelogioCompartilhado!==true||
     d.agenda.eventosReaisNoCiclo!==d.tabuleiro.eventosNoCiclo||
     d.agenda.ciclosReaisConcluidos!==d.tabuleiro.ciclosConcluidos||
     d.agenda.girosReais24h!==d.catraca?.giros24h))
    throw Error('AGENDA_CLIENTE_DIVERGENTE');
   visorCatraca.registrarAgenda(d.agenda);
   visorCatraca.observar(d.catraca.giros,d.tabuleiro.eventosNoCiclo);
   $('motorContadorEventos').textContent=d.tabuleiro.eventosNoCiclo+
    ' de 6 eventos neste ciclo';
   $('loop03TotalIntegrado').textContent=String(d.minhasPosicoes.length)+
    ' / '+String(d.limitePosicoesAtivas);
   // Os cartões usam o livro de giros por HORA; a projeção das
   // luzes da mesma HORA é desenhada pelo visor, sem inventar eventos.
   const girosHora=d.agenda?.girosReaisHora;
   $('loop03Giros24Integrado').textContent=
    Number.isSafeInteger(girosHora)&&girosHora>=0?String(girosHora):'—';
   const seletor=$('seletorPosicaoMotor');
   const seletorRotulo=$('rotuloSeletorPosicaoMotor');
   if(seletor){
    posicoesResumoReal=d.minhasPosicoes.filter(p=>
     Number.isSafeInteger(p.numero)).sort((a,b)=>a.numero-b.numero);
    if(popupPosicoesRealAberto)preencherPopupReal();
    const opcoes=d.minhasPosicoes.map(p=>String(p.numero));
    if(!opcoes.includes(posicaoSelecionada)){
     posicaoResumoEscolhidaManualmente=false;
     posicaoSelecionada=posicoesResumoReal.length?
      String(posicoesResumoReal[0].numero):'';
    }
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
    atualizarTopoPosicaoReal();
    // Restaurar o placar do relógio após carregar os números do motor.
    visorCatraca.registrarAgenda(d.agenda);
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
    posicaoResumoEscolhidaManualmente&&posicaoSelecionada?
     ordenadas.filter(p=>String(p.numero)===posicaoSelecionada):
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
    // Verde também pode indicar ACEITE_INDIVIDUAL registrado em ensaio.
    // Não representa KYC, quitação de pedido nem dinheiro liberado.
    const aceiteRegistrado=pos?.estadoAdesao==='ACEITE_ENSAIO';
    const luzVerde=confirmado||aceiteRegistrado;
    corpo.classList.add(!pos?'loop03-posicao-vazia':
     luzVerde?'loop03-status-confirmada':'loop03-status-pendente');
    const cabecalho=document.createElement('div');
    cabecalho.className='loop03-posicao-cabecalho';
    const rotulo=document.createElement('strong');
    const vaga=somentePosicoesPeloQuadrado||
     (posicaoResumoEscolhidaManualmente&&posicaoSelecionada)?
      ordenadas.findIndex(p=>p.numero===pos.numero)+1:i+1;
    rotulo.textContent='Posição '+vaga;
    const luz=document.createElement('span');
    luz.className='loop03-posicao-luz '+(!pos?'loop03-posicao-luz-inativa':
     luzVerde?'loop03-posicao-luz-verde':'loop03-posicao-luz-vermelha');
    luz.setAttribute('role','img');
    luz.setAttribute('aria-label',!pos?'Espaço disponível, luz apagada':
     confirmado?'Luz verde, posição confirmada':
     aceiteRegistrado?'Luz verde, CPF e termos aceitos em ensaio; identidade externa pendente':
     'Luz vermelha, CPF e termos pendentes');
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
    // O cartão permanece compacto. A expansão é local, por posição,
    // e usa apenas documentos oficiais fornecidos pela conta real.
    renderizarControlesCpfTermos(corpo,pos,vaga,
     Boolean(pos?.aguardandoCpfTermos&&
      d.confirmacaoAzulEnsaioDisponivel===true));
    card.append(corpo);
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
   if(!modoOperadorAtual)posicionarCampoFotoPerfil(tab.id!=='abaConta');
  if(modoOperadorAtual){
    if(tab.id==='abaTabuleiro')void carregarTabuleiroOperador();
    else if(tab.id!=='abaResumo')void carregarAbaOperador(tab.id);
   }else{
    if(tab.id==='abaTabuleiro'||tab.id==='abaPosicoes')void carregarMotor();
    if(tab.id==='abaMeusPedidos')void carregarPedidos();
    if(tab.id==='abaFinanceiro'){
     if(ensaioFinanceiroAtivo)void carregarFinanceiroEnsaio();
     else void carregarFinanceiroReal();
    }
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
   // Resumo limpo, sem códigos internos de versões e documentos no painel.
  const resumo=$('perfilCliente');
  resumo.replaceChildren();
  for(const [rotulo,valor] of [
   ['Nome',dados.nome],['Nick','@'+nickVisivel(dados.nick)],
   ['E-mail',dados.email],
   ['Verificação',dados.emailVerificado?'Confirmado':'Pendente']
  ]){
   const linha=document.createElement('div');
   linha.className='loop03-perfil-linha';
   const etiqueta=document.createElement('span');
   etiqueta.className='loop03-perfil-rotulo';
   etiqueta.textContent=rotulo;
   const conteudo=document.createElement('strong');
   conteudo.className='loop03-perfil-valor';
   conteudo.textContent=valor;
   linha.append(etiqueta,conteudo);resumo.append(linha);
  }
  // O cadastro no link NÃO equivale à confirmação. O próprio titular
  // apresenta novamente o CPF e aceita os termos, sem precisar comprar.
  $('loop03ConfirmarCadastro')?.remove();
  if(dados.cadastroConfirmado!==true){
   const area=document.createElement('section');
   area.id='loop03ConfirmarCadastro';area.className='loop03-resumo-perfil';
   area.setAttribute('aria-label','Confirmar meu cadastro');
   const titulo=document.createElement('h3');
   titulo.textContent='Confirmar meu cadastro';
   const instrucao=document.createElement('p');
   instrucao.textContent='Confirme seu CPF e leia os termos para aparecer como '+
    'cadastro confirmado na equipe do seu indicador. Isto não libera pagamentos.';
   const form=document.createElement('form');
   const etiqueta=document.createElement('label');
   etiqueta.textContent='CPF informado no cadastro';
   const campo=document.createElement('input');
   campo.name='cpf';campo.inputMode='numeric';campo.type='text';
   campo.maxLength=14;campo.required=true;campo.autocomplete='off';
   etiqueta.append(campo);
   const detalhes=document.createElement('details');
   const abrir=document.createElement('summary');
   abrir.textContent='Ler Termos de Uso';
   const documento=document.createElement('p');
   documento.textContent='Consultando os termos vigentes...';
   detalhes.append(abrir,documento);
   const confirmar=document.createElement('label');
   const check=document.createElement('input');
   check.type='checkbox';check.required=true;
   confirmar.append(check,document.createTextNode(
    ' Li os termos e confirmo meu próprio cadastro.'));
   const enviar=document.createElement('button');
   enviar.type='submit';enviar.textContent='Confirmar cadastro';
   enviar.disabled=true;
   const status=document.createElement('p');
   status.setAttribute('role','status');
   form.append(etiqueta,detalhes,confirmar,enviar,status);
   area.append(titulo,instrucao,form);
   $('conteudoConta').insertBefore(area,$('formFotoPerfil'));
   let termosAtuais=null;
   void requisitar('/documentos').then(d=>{
    const termos=d?.termos;
    if(d.financeiroReal!==false||typeof termos?.texto!=='string'||
       termos.texto.length<100||typeof termos.versao!=='string'||
       !/^[a-f0-9]{64}$/.test(termos.hash||''))
     throw Error('DOCUMENTOS_INVALIDOS');
    termosAtuais=termos;documento.textContent='Versão: '+termos.versao+
     '\\n'+termos.texto;enviar.disabled=false;
   }).catch(()=>{
    documento.textContent='Termos indisponíveis. Atualize a página.';
    status.textContent='Não é possível confirmar sem consultar os termos.';
   });
   form.addEventListener('submit',async ev=>{
    ev.preventDefault();
    if(!termosAtuais||!check.checked||!detalhes.open||!csrf)return;
    enviar.disabled=true;
    status.textContent='Registrando sua confirmação...';
    try{
     const confirmado=await requisitar('/confirmar-cadastro',{
      method:'POST',csrfObrigatorio:true,
      body:{cpf:campo.value,aceiteExplicito:true,
       versaoTermos:termosAtuais.versao,hashTermos:termosAtuais.hash}
     });
     if(confirmado.cadastroConfirmado!==true||confirmado.financeiroReal!==false)
      throw Error('CONFIRMACAO_CADASTRO_INCONSISTENTE');
     campo.value='';check.checked=false;
     await carregarDados();
     if($('conteudoEquipe')?.hidden===false)await carregarRede();
     dizer('Cadastro confirmado com CPF e termos.');
    }catch(e){
     campo.value='';enviar.disabled=false;
     status.textContent='Não foi possível confirmar: '+erro(e);
    }
   });
  }else{
   const linha=document.createElement('div');
   linha.className='loop03-perfil-linha';
   const etiqueta=document.createElement('span');
   etiqueta.className='loop03-perfil-rotulo';
   etiqueta.textContent='Cadastro';
   const valor=document.createElement('strong');
   valor.className='loop03-perfil-valor';
   valor.textContent='Confirmado com CPF e termos';
   linha.append(etiqueta,valor);resumo.append(linha);
  }
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
   let dados,soLeitura=false;
   try{dados=await requisitar('/documentos');}
   catch(e){
    if(e.status!==503)throw e;
    dados=await requisitar('/documentos-leitura');soLeitura=true;
   }
   const ok=o=>o&&typeof o.texto==='string'&&o.texto.length>=100&&
    typeof o.versao==='string'&&typeof o.hash==='string'&&
    /^[a-f0-9]{64}$/.test(o.hash);
   if(!ok(dados.termos)||!ok(dados.privacidade)||
      dados.financeiroReal!==false)throw Error('DOCUMENTOS_INVALIDOS');
   const tituloDocs=$('documentosCadastroDetalhes').querySelector('summary');
   if(tituloDocs)tituloDocs.textContent='Ler Termos de Uso e Privacidade';
   $('versaoTermosCadastro').hidden=false;
   $('versaoPrivacidadeCadastro').hidden=false;
   $('versaoTermosCadastro').textContent='Versão: '+dados.termos.versao;
   $('textoTermosCadastro').textContent=dados.termos.texto;
   $('versaoPrivacidadeCadastro').textContent='Versão: '+dados.privacidade.versao;
   $('textoPrivacidadeCadastro').textContent=dados.privacidade.texto;
   if(soLeitura||dados.cadastroAtivo===false){
    documentos=null;documentosHabilitados(false);
    dizer('Cadastro indisponível neste momento.');
   }else{
    documentos=dados;
    captchaObrigatorio=dados.captchaObrigatorio===true;
    $('captchaCadastroArea').hidden=!captchaObrigatorio;
    if(captchaObrigatorio)await atualizarCaptchaCadastro();
    documentosHabilitados(true);
   }
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
   const avisoId=id==='formLogin'?'erroLogin':
    id==='formCadastro'?'erroCadastro':null;
   if(avisoId){$(avisoId).hidden=true;$(avisoId).textContent='';}
   botao.disabled=true;
   try{await run();}
   catch(e){
    const mensagem=erro(e);
    dizer(mensagem);
    // Explica o problema ao lado do formulário usado, não só fora da tela.
    if(avisoId){$(avisoId).textContent=mensagem;$(avisoId).hidden=false;}
   }finally{
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
 // Um formulario: nick VILELA entra como cliente e nick OPERADOR
 // usa a sessao administrativa sem nova tela de senha.
 onForm('formLogin',async()=>{
  if($('login').value.trim().toLowerCase()==='operador'){
   await autenticarOperadorFormulario($('login').value.trim(),$('senha').value);
   $('senha').value='';
   abrirPainelOperador();
   dizer('Modo OPERADOR ativo. Acesse a AKITEMM ou a central pelo rodapé.');
   return;
  }
  const body={nick:$('login').value,senha:$('senha').value};
  if(captchaLoginAtivo){
   if(!captchaLoginId||!/^[A-Za-z2-9]{6}$/.test($('captchaLoginResposta').value.trim()))
    throw Error('CAPTCHA_LOGIN_OBRIGATORIO');
   body.captchaId=captchaLoginId;
   body.captchaResposta=$('captchaLoginResposta').value.trim().toUpperCase();
  }
  try{
   const login=await requisitar('/entrar',{method:'POST',body});
   if(visaoSolicitada!=='cliente')await terminarModoOperador();
   captchaLoginAtivo=false;captchaLoginId=null;
   $('captchaLoginArea').hidden=true;$('captchaLoginResposta').value='';
   $('senha').value='';
   painelConta(login);dizer('Bem-vindo ao Escritório LOOP.');
   if(entradaPelaLoja&&login.aceiteDocumentosDefinitivosPendente!==true)
    location.assign('/loja');
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
 // A estrutura visual aprovada tem sino e foto. O sino abre o painel
 // informativo; não simular comunicados nem aceitar arquivo sem backend real.
 const sinoReal=$('loop03Sino'),painelAvisosReal=$('loop03PainelAvisos');
 if(sinoReal&&painelAvisosReal){
  sinoReal.addEventListener('click',()=>{
   const aberto=painelAvisosReal.hidden;
   painelAvisosReal.hidden=!aberto;
   sinoReal.setAttribute('aria-expanded',String(aberto));
  });
 }
 let origemArquivoFotoReal='conta';
 const escolherArquivoConta=$('formFotoPerfil').querySelector('.loop03-escolher-foto');
 if(escolherArquivoConta)escolherArquivoConta.addEventListener('click',()=>{
  origemArquivoFotoReal='conta';
  posicionarCampoFotoPerfil(false);
 });
 const botaoFotoReal=$('loop03AlterarFotoTopo');
 if(botaoFotoReal)botaoFotoReal.addEventListener('click',()=>{
  origemArquivoFotoReal='topo';
  posicionarCampoFotoPerfil(true);
  $('arquivoFotoPerfil').click();
 });
 $('formFotoPerfil').addEventListener('submit',ev=>void (
  modoOperadorAtual?salvarFotoOperadorReal(ev):salvarFotoPerfilReal(ev)));
 $('arquivoFotoPerfil').addEventListener('change',ev=>{
  if(!ev.target.files?.length)return;
  if(modoOperadorAtual||origemArquivoFotoReal==='topo'){
   void (modoOperadorAtual?
    salvarFotoOperadorReal({preventDefault(){}}):
    salvarFotoPerfilReal({preventDefault(){}}));
  }else{
   $('statusFotoPerfil').textContent=
    'Foto selecionada. Toque em “Salvar minha foto” para substituir a atual.';
  }
 });

 const fotoTopoReal=$('loop03ImagemFotoTopo');
 if(fotoTopoReal)new MutationObserver(sincronizarFotoRodapeReal).observe(fotoTopoReal,{
  attributes:true,attributeFilter:['src','hidden']
 });
 sincronizarFotoRodapeReal();
 $('sair').addEventListener('click',async()=>{
  try{
   if(modoOperadorAtual){
    await terminarModoOperador();
    mostrarLogin('login');dizer('Sessão do OPERADOR encerrada.');
    return;
   }
   if(visaoSolicitada!=='cliente')await terminarModoOperador();
   await requisitar('/sair',{method:'POST',body:{},csrfObrigatorio:true});
   csrf=null;limparFotoPerfilReal();
   mostrarLogin('login');dizer('Sessão encerrada.');
  }catch(e){dizer(erro(e));}
 });
 // O backend protege o reenvio por 120 segundos e permite no máximo
 // três solicitações por hora. O relógio visual obedece a esses limites.
 const ESPERA_REENVIO_EMAIL_MS=120000;
 let prazoReenvioEmail=0,contadorEmail=null,solicitouEmail=false;
 const chaveReenvio=()=>nickResumoReal?
  'loop-reenvio-email-'+nickResumoReal.toLowerCase():null;
 function atualizarContadorEmail(){
  const botao=$('solicitarCodigoEmail');
  const relogio=$('contadorReenvioEmail');
  const restante=Math.max(0,Math.ceil((prazoReenvioEmail-Date.now())/1000));
  if(restante>0){
   botao.disabled=true;
   botao.textContent='Código solicitado';
   relogio.hidden=false;
   relogio.textContent='Reenviar em '+
    Math.floor(restante/60)+':'+String(restante%60).padStart(2,'0');
  }else{
   botao.disabled=false;
   botao.textContent=solicitouEmail?'Reenviar código':'Enviar código';
   relogio.hidden=true;
   relogio.textContent='';
   if(contadorEmail!==null){
    clearInterval(contadorEmail);contadorEmail=null;
   }
  }
 }
 function restaurarContadorEmail(){
  if(contadorEmail!==null){clearInterval(contadorEmail);contadorEmail=null;}
  const chave=chaveReenvio();
  let anterior=0;
  if(chave)try{
   anterior=Number(sessionStorage.getItem(chave)||0);
  }catch{}
  prazoReenvioEmail=Number.isSafeInteger(anterior)&&
   anterior>Date.now()?anterior:0;
  solicitouEmail=prazoReenvioEmail>0;
  atualizarContadorEmail();
  if(prazoReenvioEmail>Date.now())
   contadorEmail=setInterval(atualizarContadorEmail,1000);
 }
 function iniciarContadorEmail(){
  prazoReenvioEmail=Date.now()+ESPERA_REENVIO_EMAIL_MS;
  solicitouEmail=true;
  const chave=chaveReenvio();
  if(chave)try{
   sessionStorage.setItem(chave,String(prazoReenvioEmail));
  }catch{}
  if(contadorEmail!==null)clearInterval(contadorEmail);
  contadorEmail=setInterval(atualizarContadorEmail,1000);
  atualizarContadorEmail();
 }
 $('solicitarCodigoEmail').addEventListener('click',async()=>{
  const botao=$('solicitarCodigoEmail');
  if(botao.disabled||prazoReenvioEmail>Date.now())return;
  botao.disabled=true;
  $('estadoEmailCodigo').textContent='Solicitando seu código...';
  try{
   const resultado=await requisitar('/email/solicitar',{
    method:'POST',body:{},csrfObrigatorio:true
   });
   if(resultado.solicitacaoRecebida!==true)
    throw Error('ENVIO_EMAIL_NAO_CONFIRMADO');
   $('estadoEmailCodigo').textContent=
    'Solicitação recebida. Confira sua caixa de entrada e a pasta de spam.';
   iniciarContadorEmail();
   $('codigoEmail').focus();
  }catch(e){
   $('estadoEmailCodigo').textContent=erro(e);
   botao.disabled=false;
   atualizarContadorEmail();
  }
 });
 $('codigoEmail').addEventListener('input',ev=>{
  const filtrado=ev.target.value.replace(/[^0-9]/g,'').slice(0,8);
  if(ev.target.value!==filtrado)ev.target.value=filtrado;
 });
 onForm('formConfirmarEmail',async()=>{
  const estado=$('estadoEmailCodigo');
  estado.textContent='Conferindo o código...';
  try{
   const resultado=await requisitar('/email/confirmar',{
    method:'POST',csrfObrigatorio:true,
    body:{codigo:$('codigoEmail').value}
   });
   if(resultado.emailVerificado!==true)throw Error('CODIGO_INVALIDO');
   const s=await requisitar('/me');painelConta(s);
   $('codigoEmail').value='';
   estado.textContent='E-mail confirmado com sucesso.';
   dizer('E-mail confirmado.');
  }catch(e){
   estado.textContent=e.message==='CODIGO_INVALIDO'?
    'Código inválido, expirado ou já utilizado. Confira os 8 dígitos ou solicite outro após o prazo.':
    erro(e);
   throw e;
  }
 });
 // O olhinho foi inicializado antes das demais funções da página.
 $('atualizarPedidos').addEventListener('click',()=>void carregarPedidos());
 $('pedidosVerPosicoes').addEventListener('click',()=>$('abaPosicoes').click());
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
 // Ao reabrir, uma sessao OPERADOR valida tem prioridade sobre qualquer
 // cookie de cliente antigo; nao confundir papeis nem fabricar titular.
 void fetch('/api/operador/estado',{
  credentials:'same-origin',cache:'no-store'
 }).then(async r=>{
  const estado=r.ok?await r.json():{operador:false};
  if(estado.operador===true&&visaoSolicitada!=='cliente'){
   abrirPainelOperador();return;
  }
  const s=await requisitar('/me');
  painelConta(s);
  if(entradaPelaLoja&&s.aceiteDocumentosDefinitivosPendente!==true)
   location.assign('/loja');
 }).catch(()=>{
  if(entradaPelaLoja&&parametrosEntrada.get('cadastro')==='1'){
   mostrarLogin('cadastro');
   void carregarDocumentos();
  }else mostrarLogin('login');
 });
})();
