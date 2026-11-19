'use strict';
// Monta a MESMA interface de cliente já aprovada; não cria tela paralela.
// Só as funções de conta real são ativadas. Loja/posições/saques permanecem
// bloqueados até integração comercial e revisão financeira separadas.
const fs=require('node:fs');
const path=require('node:path');
const htmlOriginal=fs.readFileSync(path.join(__dirname,
 '../candidato/checkout-candidato-ui.html'),'utf8');
const lojaOriginal=fs.readFileSync(path.join(__dirname,
 '../laboratorio/loja-cliente-demo.html'),'utf8');
const ARQUIVOS=Object.freeze({
 '/identidade/assets/cliente.css':'../laboratorio/checkout-staging-ui.css',
 '/identidade/assets/loop03-aprovado.css':'../laboratorio/loop-03-shell.css',
 '/identidade/assets/cliente-integrado.css':'../candidato/escritorio-cliente-integrado.css',
 '/identidade/assets/botoes-real.css':'./acabamento-botoes-real.css',
 '/identidade/assets/catraca-visor.js':'../shared/visor-catraca.js',
 '/identidade/assets/tabuleiro-visual.js':'../shared/tabuleiro-visual-loop.js',
 '/identidade/assets/cliente.js':'./interface-aprovada-contas.js',
 '/identidade/assets/loja.css':'../laboratorio/loja-cliente-demo.css',
 '/identidade/assets/loja.js':'./interface-aprovada-loja.js',
 '/identidade/assets/operador-fotos.js':'./operador-loja-fotos-real.js',
 '/identidade/assets/vitrine-horizontal.css':'../candidato/vitrine-horizontal.css',
 '/identidade/assets/acabamento-loop.js':'../shared/acabamento-visual-loop.js'
});
function trocarExato(texto,antes,depois){
 const partes=texto.split(antes);
 if(partes.length!==2)throw Error('INTERFACE_APROVADA_DESATUALIZADA');
 return partes.join(depois);
}
function renderizarInterfaceAprovada(){
 let html=htmlOriginal;
 for(const [antes,depois] of [
 ['/staging/assets/cliente.css','/identidade/assets/cliente.css'],
 ['/staging/assets/loop03-aprovado.css','/identidade/assets/loop03-aprovado.css'],
 ['/staging/assets/cliente-integrado.css','/identidade/assets/cliente-integrado.css'],
 ['/staging/assets/catraca-visor.js','/identidade/assets/catraca-visor.js'],
 ['/staging/assets/tabuleiro-visual.js','/identidade/assets/tabuleiro-visual.js'],
 ['/staging/assets/cliente.js','/identidade/assets/cliente.js'], ]){
  html=trocarExato(html,antes,depois);
 }
 html=trocarExato(html,'</head>',
  '<link rel="stylesheet" href="/identidade/assets/botoes-real.css"></head>');
 // O + da tela aprovada vai à administração protegida original,
 // nunca a um segundo Escritório nem ao serviço de homologação.
 html=trocarExato(html,
  '<a id="loopOperadorMais" href="/escritorio"',
  '<a id="loopOperadorMais" href="/administrador"');
 // Preservar integralmente o cabecalho visual aprovado, incluindo a foto
 // de perfil e o sino. Avisos de laboratorio nao substituem componentes.
 // O backend continua impedindo operações ainda sem dependencias externas.
 // Foto da conta REAL possui custodia propria e a mesma moldura aprovada.
 // Manter o formulario e o toque na foto redonda sem recriar a interface.
 if(!html.includes('id="formFotoPerfil"')||
    !html.includes('id="arquivoFotoPerfil"'))
  throw Error('INTERFACE_FOTO_PERFIL_DESATUALIZADA');
 // A tela compartilhada da prévia passou a aceitar nicks de 1-9.
 // Esta instancia REAL tem mecanismo de identidade separado, ainda com
 // contrato legado de 1-12 ASCII. Adaptar somente o HTML emitido aqui;
 // nao alterar nem migrar o banco de identidades reais nesta tarefa.
 const nickNovo='[A-Za-zÀ-ÖØ-öø-ÿ0-9]+(?: [A-Za-zÀ-ÖØ-öø-ÿ0-9]+)*';
 const loginNovo='minlength="1" maxlength="12" pattern="'+nickNovo+'"';
 const cadastroNovo='minlength="1" maxlength="9" pattern="'+nickNovo+'"';
 const nickLegado='minlength="1" maxlength="12" pattern="[A-Za-z]{1,12}"';
 if(html.split(loginNovo).length!==3||
    html.split(cadastroNovo).length!==2)
  throw Error('INTERFACE_NICK_APROVADO_DESATUALIZADA');
 html=html.replaceAll(loginNovo,nickLegado);
 html=html.replace(cadastroNovo,nickLegado);
 html=trocarExato(html,'Nick (1 a 9 caracteres)','Nick (1 a 12 letras)');
 html=trocarExato(html,
  'Nesta prévia de homologação, utilize apenas CPF fictício.',
  'Seu CPF é armazenado de forma protegida; sua identidade ainda exige verificação externa.');
 // Quatro banners do Escritório acrescentam dois links internos para a loja.
 if(html.split('href="/staging/loja"').length!==7)
  throw Error('INTERFACE_LOJA_APROVADA_DESATUALIZADA');
 html=html.replaceAll('href="/staging/loja"','href="/loja"');
 // Os campos de senha e as descrições de recuperação/conta seguem o mesmo padrão de segurança.
 html=html.replaceAll('Nova senha (8 a 12 caracteres)','Nova senha (mínimo 12 caracteres)');
 html=html.replaceAll('minlength="8" maxlength="12" autocomplete="new-password"',
  'minlength="12" maxlength="128" autocomplete="new-password"');
 html=trocarExato(html,'<label for="cadastroSenha">Senha (8 a 12 caracteres)</label>',
 '<label for="cadastroSenha">Senha (mínimo 12 caracteres)</label>');
 html=trocarExato(html,'  <form id="formCadastro">',
  '  <p id="cadastroIndicadorAviso" role="status" hidden></p>\n  <form id="formCadastro">');
 // Convite tambem aparece no primeiro contato, antes do formulario de cadastro.
 html=trocarExato(html,'  <form id="formLogin">',
  '  <p id="conviteIndicadorEntrada" class="subtexto" role="status" hidden></p>\n  <form id="formLogin">');
 // A entrada alternativa aparece apenas quando o nick OPERADOR e digitado;
 // link leva ao login protegido, nunca ao painel sem credencial.
 html=trocarExato(html,'  <button type="button" class="alternar-acesso" id="abrirRecuperacao">',
  '  <a id="acessoAdminLogin" href="/administrador/entrar" class="alternar-acesso" '+
  'hidden style="display:none">Entrar no Escritório do Administrador</a>\n'+
  '  <button type="button" class="alternar-acesso" id="abrirRecuperacao">');
 // O acesso administrativo so aparece depois de autenticar a sessao OPERADOR.
 html=trocarExato(html,'</nav>\n    <div class="loop03-identidade">',
  '</nav>\n    <a id="loopAcessoAdminMenu" href="/administrador" hidden '+
  'style="display:none" class="loop03-acesso-admin-menu">Escritório do Administrador</a>\n'+
  '    <div class="loop03-identidade">');
 // Os dois documentos já estão no mesmo painel da interface aprovada.
 // Uma única confirmação visual preserva duas versões/hashes distintos.
 for(const id of ['documentosCadastroDetalhes','versaoPrivacidadeCadastro',
  'textoPrivacidadeCadastro','versaoTermosCadastro','textoTermosCadastro',
  'cadastroTermos','captchaCadastroArea'])
  if(!html.includes('id="'+id+'"'))
   throw Error('DOCUMENTOS_UNIFICADOS_NAO_ENCONTRADOS');
 // O motor segue no tabuleiro e nas seis luzes; nao injetar painel na home.
 // Area opcional dentro da aba Financeiro ja aprovada: nao cria portal novo.
 // Fica escondida quando a tesouraria de ensaio nao esta montada.
 html=trocarExato(html,
  '<p id="estadoFinanceiro" role="status">Consultando a disponibilidade financeira…</p>',
  '<p id="estadoFinanceiro" role="status">Consultando a disponibilidade financeira…</p>'+
  '<div id="tesourariaEnsaioModulo" hidden>'+
  '<p><strong>SIMULACAO FINANCEIRA — VALORES FICTICIOS</strong></p>'+
  '<p id="tesourariaEnsaioSaldo" role="status"></p>'+
  '<label>Valor de saque ficticio (R$)'+
  '<input id="tesourariaEnsaioValor" type="number" min="25" step="0.01" value="25"></label>'+
  '<button id="tesourariaEnsaioSolicitar" type="button">Simular solicitacao</button>'+
  '<p id="tesourariaEnsaioStatus" role="status"></p></div>');
 // Filtro de posicoes inserido na tela original (sem duplicar pagina).
 html=trocarExato(html,
  '   <div id="posicoesPainel" aria-live="polite">Consultando posições…</div>',
  '    <label id="rotuloSeletorPosicaoMotor" for="seletorPosicaoMotor" hidden>'+
  'Visualizar posição em ensaio'+
  '<select id="seletorPosicaoMotor">'+
  '<option value="">Todas as posições</option></select></label>'+
  '<div id="posicoesPainel" aria-live="polite">Consultando posições…</div>');
 html=trocarExato(html,'</head>',
  '<script src="/identidade/assets/acabamento-loop.js" defer></script></head>');
 // Texto da versão de ensaio permanece fora da vista, sem ser reaproveitado
 // como conteúdo comercial. Não expor recursos financeiros incompletos.
 return html;
}
function renderizarLojaAprovada(){
 let html=lojaOriginal;
 html=trocarExato(html,'/laboratorio/loja.css',
  '/identidade/assets/loja.css');
 html=trocarExato(html,
  '<script src="/laboratorio/educacao-carrinho.js" defer></script>',
  '');
 html=trocarExato(html,
  '<script src="/laboratorio/loja.js" defer></script>',
  '<script src="/identidade/assets/loja.js" defer></script>');
 // Reutiliza o CSS horizontal aprovado (cinco abas, 40 posições cada)
 // e conecta somente o comportamento de toque do operador real.
 html=trocarExato(html,'</head>',
  '<link rel="stylesheet" href="/identidade/assets/vitrine-horizontal.css">'+
  '<script src="/identidade/assets/acabamento-loop.js" defer></script>'+
  '<script src="/identidade/assets/operador-fotos.js" defer></script></head>');
 // Manter o visual aprovado: atualizar somente o destino dos acessos
 // administrativos e ocultar o link ate a sessao real ser confirmada.
 html=trocarExato(html,
  '<a id="akitemmOperadorMais" href="/escritorio"',
  '<a id="akitemmOperadorMais" href="/administrador"');
 html=trocarExato(html,
  '<a href="/escritorio" class="akitemm-acesso-operador"',
  '<a href="/administrador" class="akitemm-acesso-operador" hidden style="display:none"');
 return html;
}
function montarInterfaceAprovada(app,{protegerLoja}={}){
 if(typeof protegerLoja!=='function')
  throw Error('PROTECAO_LOJA_OBRIGATORIA');
 const html=renderizarInterfaceAprovada();
 const htmlLoja=renderizarLojaAprovada();
 app.get(['/escritorio','/minha-conta'],(_req,res)=>
  res.set('Cache-Control','private, no-store').type('html').send(html));
 for(const [rota,arquivo] of Object.entries(ARQUIVOS)){
  const caminho=path.join(__dirname,arquivo);
  app.get(rota,(_req,res)=>
   res.set('Cache-Control','private, no-store')
    .type(rota.endsWith('.js')?'js':'css')
    .sendFile(caminho,{cacheControl:false}));
 }
 // Vitrine publicada e publica: consultar produtos nao exige login.
 // Pedidos, posicoes, sacos, compras e operacoes do operador continuam
 // protegidos pelos endpoints que exigem suas sessoes reais.
 app.get('/loja',(_req,res)=>
  res.set('Cache-Control','private, no-store').type('html').send(htmlLoja));
}
module.exports={renderizarInterfaceAprovada,renderizarLojaAprovada,
 montarInterfaceAprovada};
