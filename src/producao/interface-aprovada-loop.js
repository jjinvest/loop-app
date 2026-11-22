'use strict';
// Monta a MESMA interface de cliente já aprovada; não cria tela paralela.
// Só as funções de conta real são ativadas. Loja/posições/saques permanecem
// bloqueados até integração comercial e revisão financeira separadas.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
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
 // O indicador ja consta no campo "Indicado por". Nao duplicar
 // avisos acima dos formularios nem alterar o vinculo persistido.
 // A sessão do operador tem as próprias funções, mas a mesma moldura.
 // O botão administrativo acompanha AKITEMM, sem quadro explicativo na home.
 const lojaBarra='<div class="barra-conta"><a href="/loja" class="primario loop03-loja-prata" aria-label="Abrir loja AKITEMM"><span class="loop03-loja-prata-texto">AKITEMM</span></a></div>';
 html=trocarExato(html,lojaBarra,lojaBarra+
  '<div id="loopOperadorAtalhos" class="loop03-operador-atalhos" hidden>'+
  '<a id="loopAcessoAdminMenu" href="/administrador">Escritório do Administrador</a>'+
  '<a href="/escritorio?visao=cliente">Visão do Cliente</a>'+
  '</div>'+
  '<div id="loopVoltarOperador" class="loop03-operador-atalhos" hidden>'+
  '<a href="/escritorio?visao=operador">Voltar ao Escritório do Administrador</a>'+
  '</div>');
 html=trocarExato(html,'</head>',
  '<style>'+
  '.cliente-integrado #loopOperadorMais{display:none!important}'+
  '.cliente-integrado #loopOperadorAtalhos[hidden],.cliente-integrado #loopVoltarOperador[hidden]{display:none!important}'+
  '.cliente-integrado .loop03-operador-atalhos{display:flex;flex-direction:column;gap:9px;margin:7px 0 14px;width:100%}'+
  '.cliente-integrado .loop03-operador-atalhos a{display:flex;width:100%;box-sizing:border-box;min-height:48px;align-items:center;justify-content:center;border-radius:999px;border:1px solid #b49562;background:linear-gradient(135deg,#2f3038,#151823 72%,#37303a);color:#f2d69d;text-decoration:none;font-weight:750;text-align:center;padding:10px 14px;box-shadow:inset 0 1px 0 #ffffff22,0 3px 9px #0006}'+
  '.cliente-integrado .loop03-operador-atalhos a:focus-visible{outline:2px solid #f4ce81;outline-offset:2px}'+
  '.cliente-integrado.loop03-modo-operador #conteudoPosicoes>:not(.loop03-admin-section),'+
  '.cliente-integrado.loop03-modo-operador #conteudoEquipe>:not(.loop03-admin-section),'+
  '.cliente-integrado.loop03-modo-operador #conteudoFinanceiro>:not(.loop03-admin-section),'+
  '.cliente-integrado.loop03-modo-operador #conteudoMeusPedidos>:not(.loop03-admin-section),'+
  '.cliente-integrado.loop03-modo-operador #conteudoLinks>:not(.loop03-admin-section),'+
  '.cliente-integrado.loop03-modo-operador #conteudoConta>:not(.loop03-admin-section){display:none!important}'+
  '.loop03-admin-section{display:grid;gap:12px;min-width:0}'+
  '.loop03-admin-section .loop03-admin-campos{display:grid;gap:8px}'+
  '.loop03-admin-section .loop03-admin-acoes{display:flex;flex-wrap:wrap;gap:9px}'+
  '.loop03-admin-section .loop03-admin-acoes a,.loop03-admin-section .loop03-admin-acoes button{border-radius:14px;min-height:42px;padding:10px 14px;border:1px solid #af9156;background:#222535;color:#f0d59f;text-decoration:none}'+
  '.loop03-admin-section .loop03-admin-dado{border:1px solid #967b51;border-radius:14px;background:#171a27;padding:12px;white-space:pre-line;line-height:1.5}'+
  '</style></head>');
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
 // Cada versão de cliente.js recebe URL distinta na página real.
 // Evita reutilizar JavaScript antigo em navegadores integrados no Android.
 const clienteJs=fs.readFileSync(path.join(__dirname,'interface-aprovada-contas.js'));
 const revisao= createHash('sha256').update(clienteJs).digest('hex').slice(0,16);
 html=trocarExato(html,
  '<script src="/identidade/assets/cliente.js" defer></script>',
  '<script src="/identidade/assets/cliente.js?rev='+revisao+'" defer></script>');
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
 // Reutiliza o CSS horizontal aprovado (dez abas, 40 posições cada)
 // e conecta somente o comportamento de toque do operador real.
 html=trocarExato(html,'</head>',
  '<link rel="stylesheet" href="/identidade/assets/vitrine-horizontal.css">'+
  '<script src="/identidade/assets/acabamento-loop.js" defer></script>'+
  '<script src="/identidade/assets/operador-fotos.js" defer></script></head>');
 // Manter o visual aprovado: atualizar somente o destino dos acessos
 // administrativos e ocultar o link ate a sessao real ser confirmada.
 const botaoTopo=html.match(/<a id="akitemmOperadorMais"[\s\S]*?<\/a>/g);
 if(!botaoTopo||botaoTopo.length!==1)
  throw Error('BOTAO_TOPO_AKITEMM_DESATUALIZADO');
 html=html.replace(botaoTopo[0],'');
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
