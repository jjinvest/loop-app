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
 '/identidade/assets/catraca-visor.js':'../shared/visor-catraca.js',
 '/identidade/assets/tabuleiro-visual.js':'../shared/tabuleiro-visual-loop.js',
 '/identidade/assets/cliente.js':'./interface-aprovada-contas.js',
 '/identidade/assets/loja.css':'../laboratorio/loja-cliente-demo.css',
 '/identidade/assets/loja.js':'./interface-aprovada-loja.js'
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
 ['/staging/assets/cliente.js','/identidade/assets/cliente.js'],
 ['LOOP 3.0 · Escritório Virtual (prévia)','LOOP 3.0 · Escritório Virtual'],
 ['Criar conta de homologação','Criar minha conta'],
 ['Nesta homologação, use dados fictícios. Não informe CPF nem senha pessoal.',
  'Leia e aceite os termos e a política de privacidade antes de criar sua conta.'],
 ['Nome fictício','Nome'],
 ['E-mail fictício','E-mail'],
 ['Senha de teste (8 a 12 caracteres)','Senha (mínimo 12 caracteres)'],
 ['SEM VENDAS REAIS','SEM COMPRAS OU PAGAMENTOS REAIS'],
 ['HOMOLOGAÇÃO · SEM PAGAMENTOS REAIS',
  'CADASTRO REAL EM PREPARAÇÃO · SEM PAGAMENTOS REAIS'],
 ['Li os termos apresentados acima e aceito criar uma conta somente de demonstração.',
  'Li e aceito os termos apresentados acima.'],
 ]){
  html=trocarExato(html,antes,depois);
 }
 // Nick é uma identidade única entre loja e escritório. Alterar apenas a
 // instância real da tela aprovada, sem mudar o laboratório histórico.
 const nickAtual='minlength="1" maxlength="12" pattern="[A-Za-z]{1,12}"';
 if(html.split(nickAtual).length!==3)
  throw Error('INTERFACE_NICK_APROVADO_DESATUALIZADA');
 if(html.split('href="/staging/loja"').length!==3)
  throw Error('INTERFACE_LOJA_APROVADA_DESATUALIZADA');
 html=html.replaceAll('href="/staging/loja"','href="/loja"');
 // Os campos de senha e as descrições de recuperação/conta seguem o mesmo padrão de segurança.
 html=html.replaceAll('Nova senha (8 a 12 caracteres)','Nova senha (mínimo 12 caracteres)');
 html=html.replaceAll('minlength="8" maxlength="12" autocomplete="new-password"',
  'minlength="12" maxlength="128" autocomplete="new-password"');
 html=trocarExato(html,'  <form id="formCadastro">',
  '  <p id="cadastroIndicadorAviso" role="status" hidden></p>\n  <form id="formCadastro">');
 const anterior='   <label><input id="cadastroTermos"';
 const privacidade=[
  '   <details id="privacidadeCadastroDetalhes" open>',
  '    <summary>Política de privacidade e proteção de dados</summary>',
  '    <p id="versaoPrivacidadeCadastro" class="subtexto">Consultando documento...</p>',
  '    <p id="textoPrivacidadeCadastro" class="subtexto">Aguardando política aprovada.</p>',
  '   </details>',
  '   <label><input id="cadastroPrivacidade" type="checkbox" required disabled>',
  ' Li a política e concordo com o tratamento de dados descrito.</label>'
 ].join('\n');
 html=trocarExato(html,anterior,privacidade+'\n'+anterior);
 // Estado real do motor na MESMA tela do Escritório, sem segundo portal.
 html=trocarExato(html,'  <div class="loop03-corpo">',
  '  <div class="loop03-corpo">\n'+
  '   <section class="painel" id="loopEstadoIntegrado" hidden>'+
  '    <h3>Estado do LOOP</h3>'+
  '    <p id="loopResumoMotor" role="status" aria-live="polite"></p>'+
  '   </section>');
 // Area opcional dentro da aba Financeiro ja aprovada: nao cria portal novo.
 // Fica escondida quando a tesouraria de ensaio nao esta montada.
 html=trocarExato(html,
  '<p id="estadoFinanceiro">Nenhum saldo comercial foi ativado neste ambiente.</p>',
  '<p id="estadoFinanceiro">Nenhum saldo comercial foi ativado neste ambiente.</p>'+
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
 return html;
}
function montarInterfaceAprovada(app,{protegerLoja}={}){
 if(typeof protegerLoja!=='function')
  throw Error('PROTECAO_LOJA_OBRIGATORIA');
 const html=renderizarInterfaceAprovada();
 const htmlLoja=renderizarLojaAprovada();
 app.get(['/escritorio','/minha-conta'],(_req,res)=>
  res.type('html').send(html));
 for(const [rota,arquivo] of Object.entries(ARQUIVOS)){
  const caminho=path.join(__dirname,arquivo);
  app.get(rota,(_req,res)=>res.type(rota.endsWith('.js')?'js':'css')
   .sendFile(caminho));
 }
 // Não abrir vitrine fictícia em produção por meio do mesmo nick.
 app.get('/loja',protegerLoja,(_req,res)=>
  res.type('html').send(htmlLoja));
}
module.exports={renderizarInterfaceAprovada,renderizarLojaAprovada,
 montarInterfaceAprovada};
