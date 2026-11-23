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
 '/identidade/assets/loja-banners.js':'./banners-loja-akitemm-client.js',
 '/identidade/assets/loop-banners-real.js':'./banners-escritorio-real-client.js',
 '/identidade/assets/banners-editor-real.css':'./banners-editor-real.css',
 '/identidade/assets/recorte-foto-real.js':'./recorte-foto-compartilhado.js',
 '/identidade/assets/recorte-foto-real.css':'./recorte-foto-compartilhado.css',
 '/identidade/assets/vitrine-horizontal.css':'../candidato/vitrine-horizontal.css',
 '/identidade/assets/harmonia-toque-real.css':'./harmonia-toque-real.css',
 '/identidade/assets/acabamento-loop.js':'../shared/acabamento-visual-loop.js'
});
function trocarExato(texto,antes,depois){
 const partes=texto.split(antes);
 if(partes.length!==2)throw Error('INTERFACE_APROVADA_DESATUALIZADA');
 return partes.join(depois);
}
function recursoRecorteFoto(){
 const arquivo=fs.readFileSync(path.join(__dirname,'recorte-foto-compartilhado.js'));
 const hash=createHash('sha256').update(arquivo).digest('hex').slice(0,16);
 return '<link rel="stylesheet" href="/identidade/assets/recorte-foto-real.css">'+
  '<script src="/identidade/assets/recorte-foto-real.js?rev='+hash+
  '" defer></script>';
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
  '<link rel="stylesheet" href="/identidade/assets/botoes-real.css">'+
  '<link rel="stylesheet" href="/identidade/assets/harmonia-toque-real.css"></head>');
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
  '<a id="loopVisaoOperador" data-visao-do-escritorio="operador" href="/escritorio?visao=operador">Visão do Operador</a>'+
  '<a id="loopVisaoCliente" data-visao-do-escritorio="cliente" href="/escritorio?visao=cliente">Visão do Cliente</a>'+
  '</div>'+
  '<div id="loopVoltarOperador" class="loop03-operador-atalhos" hidden>'+
  '<a data-visao-do-escritorio="operador" href="/escritorio?visao=operador">Visão do Operador</a>'+
  '<a data-visao-do-escritorio="cliente" href="/escritorio?visao=cliente">Visão do Cliente</a>'+
  '</div>');

 // Somente no HTML REAL servido a todos os titulares. Preserva o template,
 // as 3 molduras e o comportamento proprio do operador sem criar outra tela.
 html=trocarExato(html,"    <div class=\"loop03-indicadores\" aria-label=\"Resumo operacional da conta\">\n     <button type=\"button\" id=\"loop03IrPosicoesIntegrado\" class=\"loop03-indicador\" aria-expanded=\"false\" aria-controls=\"seletorPosicoesResumo\"><small>MINHAS POSIÇÕES</small><strong id=\"loop03TotalIntegrado\">—</strong><span>Ver minhas posições</span></button>\n     <div class=\"loop03-indicador\"><small>GIROS NAS ÚLTIMAS 24H</small><strong id=\"loop03Giros24Integrado\">—</strong><span>Acompanhe os movimentos</span></div>\n     <div class=\"loop03-indicador\"><small>POSIÇÃO SELECIONADA</small><strong id=\"loop03NumeroIntegrado\">—</strong><span id=\"loop03StatusPosicao\"></span></div>","    <div class=\"loop03-indicadores\" aria-label=\"Resumo operacional da conta\">\n     <button type=\"button\" id=\"loop03IrPosicoesIntegrado\" class=\"loop03-indicador\" aria-expanded=\"false\" aria-controls=\"seletorPosicoesResumo\"><small>MINHAS POSIÇÕES</small><strong id=\"loop03TotalIntegrado\">—</strong><span>Ver minhas posições</span></button>\n     <div class=\"loop03-indicador loop03-placar-hora\" aria-label=\"Ciclos e luzes visuais do relógio nas últimas 24 horas; sem crédito financeiro\">\n      <div class=\"loop03-placar-metade loop03-placar-giros\"><small>CICLOS / 24H</small><strong id=\"loop03Giros24Integrado\">—</strong></div>\n      <div class=\"loop03-placar-metade loop03-placar-luzes\"><small>LUZES / 24H</small><strong id=\"loop03LuzesHoraIntegrado\">—</strong></div>\n     </div>\n     <div class=\"loop03-indicador loop03-placar-posicao\"><small>POSIÇÃO SELECIONADA</small><strong id=\"loop03NumeroIntegrado\">—</strong><span id=\"loop03StatusPosicao\"></span></div>");
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
 // Cofres aparecem somente na aba Tabuleiro do operador, no rodapé marcado.
 // Sem extrato autenticado não renderizar valores inventados.
 const cofresRodape="<section id=\"loop03CofresOperador\" class=\"loop03-cofres-rodape\" aria-label=\"Cofres financeiros do LOOP\" hidden><div class=\"loop03-cofres-cabecalho\"><strong>COFRES DO LOOP</strong><button type=\"button\" id=\"loop03CofresAtualizar\" aria-label=\"Atualizar saldos conciliados dos cofres\">Atualizar</button></div><div class=\"loop03-cofres-tres\"><div class=\"loop03-cofre loop03-cofre-lateral\" data-cofre=\"INVESTIMENTO\"><span class=\"loop03-cofre-fisico\" aria-hidden=\"true\"><span class=\"loop03-cofre-volante\"></span></span><strong class=\"loop03-cofre-nome\">INVESTIMENTO</strong><span class=\"loop03-cofre-valor\" id=\"loop03CofreInvestimento\">—</span><small class=\"loop03-cofre-estado\" id=\"loop03CofreInvestimentoEstado\">Aguardando conciliação</small></div><div class=\"loop03-cofre loop03-cofre-centro\" data-cofre=\"CENTRAL\"><span class=\"loop03-cofre-fisico\" aria-hidden=\"true\"><span class=\"loop03-cofre-volante\"></span></span><strong class=\"loop03-cofre-nome\">COFRE CENTRAL</strong><span class=\"loop03-cofre-valor\" id=\"loop03CofreCentral\">—</span><small class=\"loop03-cofre-estado\" id=\"loop03CofreCentralEstado\">Aguardando conciliação</small></div><div class=\"loop03-cofre loop03-cofre-lateral\" data-cofre=\"RESERVA\"><span class=\"loop03-cofre-fisico\" aria-hidden=\"true\"><span class=\"loop03-cofre-volante\"></span></span><strong class=\"loop03-cofre-nome\">RESERVA</strong><span class=\"loop03-cofre-valor\" id=\"loop03CofreReserva\">—</span><small class=\"loop03-cofre-estado\" id=\"loop03CofreReservaEstado\">Aguardando conciliação</small></div></div><p id=\"loop03CofresEstado\" class=\"loop03-cofres-estado-geral\" role=\"status\">Aguardando comprovação bancária.</p></section>";
 html=trocarExato(html,
  '   <button type="button" id="tabuleiroVerPosicoesIntegrado">Ver minhas posições</button>',
  '   <button type="button" id="tabuleiroVerPosicoesIntegrado">Ver minhas posições</button>'+
  cofresRodape);
 // Cada versão de cliente.js recebe URL distinta na página real.
 // Evita reutilizar JavaScript antigo em navegadores integrados no Android.
 const clienteJs=fs.readFileSync(path.join(__dirname,'interface-aprovada-contas.js'));
 const revisao= createHash('sha256').update(clienteJs).digest('hex').slice(0,16);
 html=trocarExato(html,
  '<script src="/identidade/assets/cliente.js" defer></script>',
  '<script src="/identidade/assets/cliente.js?rev='+revisao+'" defer></script>');
 html=trocarExato(html,'</head>',
  '<link rel="stylesheet" href="/identidade/assets/banners-editor-real.css">'+
  recursoRecorteFoto()+
  '<script src="/identidade/assets/loop-banners-real.js?rev='+
  createHash('sha256').update(fs.readFileSync(path.join(__dirname,
   'banners-escritorio-real-client.js'))).digest('hex').slice(0,16)+
  '" defer></script>'+
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
  '<script src="/identidade/assets/loja.js?rev='+
   createHash('sha256').update(fs.readFileSync(path.join(__dirname,
    'interface-aprovada-loja.js'))).digest('hex').slice(0,16)+
   '" defer></script>');
 // Reutiliza o CSS horizontal aprovado (dez abas, 40 posições cada)
 // e conecta somente o comportamento de toque do operador real.
 html=trocarExato(html,'</head>',
  '<link rel="stylesheet" href="/identidade/assets/vitrine-horizontal.css">'+
  '<link rel="stylesheet" href="/identidade/assets/harmonia-toque-real.css">'+
  recursoRecorteFoto()+
  '<script src="/identidade/assets/acabamento-loop.js" defer></script>'+
  '<script src="/identidade/assets/operador-fotos.js" defer></script>'+ 
  '<link rel="stylesheet" href="/identidade/assets/banners-editor-real.css">'+
  '<script src="/identidade/assets/loja-banners.js?rev='+
  createHash('sha256').update(fs.readFileSync(path.join(__dirname,
   'banners-loja-akitemm-client.js'))).digest('hex').slice(0,16)+
  '" defer></script></head>');
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
