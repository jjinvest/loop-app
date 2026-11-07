'use strict';
// Monta a MESMA interface de cliente já aprovada; não cria tela paralela.
// Só as funções de conta real são ativadas. Loja/posições/saques permanecem
// bloqueados até integração comercial e revisão financeira separadas.
const fs=require('node:fs');
const path=require('node:path');
const htmlOriginal=fs.readFileSync(path.join(__dirname,
 '../candidato/checkout-candidato-ui.html'),'utf8');
const ARQUIVOS=Object.freeze({
 '/identidade/assets/cliente.css':'../laboratorio/checkout-staging-ui.css',
 '/identidade/assets/loop03-aprovado.css':'../laboratorio/loop-03-shell.css',
 '/identidade/assets/cliente-integrado.css':'../candidato/escritorio-cliente-integrado.css',
 '/identidade/assets/cliente.js':'./interface-aprovada-contas.js'
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
 ['/staging/assets/cliente.js','/identidade/assets/cliente.js'],
 ['LOOP 3.0 · Escritório Virtual (prévia)','LOOP 3.0 · Escritório Virtual'],
 ['Criar conta de homologação','Criar minha conta'],
 ['Nesta homologação, use dados fictícios. Não informe CPF nem senha pessoal.',
  'Leia e aceite os termos e a política de privacidade antes de criar sua conta.'],
 ['Nome fictício','Nome'],
 ['E-mail fictício','E-mail'],
 ['Senha de teste (8 a 12 caracteres)','Senha (mínimo 12 caracteres)'],
 ['Nova senha (8 a 12 caracteres)','Nova senha (mínimo 12 caracteres)'],
 ['SEM VENDAS REAIS','SEM COMPRAS OU PAGAMENTOS REAIS'],
 ['HOMOLOGAÇÃO · SEM PAGAMENTOS REAIS',
  'CADASTRO REAL EM PREPARAÇÃO · SEM PAGAMENTOS REAIS'],
 ['Li os termos apresentados acima e aceito criar uma conta somente de demonstração.',
  'Li e aceito os termos apresentados acima.'],
 ['minlength="8" maxlength="12" autocomplete="new-password"',
  'minlength="12" maxlength="128" autocomplete="new-password"'],
 ]){
  html=trocarExato(html,antes,depois);
 }
 // Os dois campos de nova senha usam o mesmo padrão; os demais permanecem.
 html=html.replaceAll('minlength="8" maxlength="12" autocomplete="new-password"',
  'minlength="12" maxlength="128" autocomplete="new-password"');
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
 // Texto da versão de ensaio permanece fora da vista, sem ser reaproveitado
 // como conteúdo comercial. Não expor recursos financeiros incompletos.
 return html;
}
function montarInterfaceAprovada(app){
 const html=renderizarInterfaceAprovada();
 app.get(['/escritorio','/minha-conta'],(_req,res)=>
  res.type('html').send(html));
 for(const [rota,arquivo] of Object.entries(ARQUIVOS)){
  const caminho=path.join(__dirname,arquivo);
  app.get(rota,(_req,res)=>res.type(rota.endsWith('.js')?'js':'css')
   .sendFile(caminho));
 }
 // Não abrir vitrine fictícia em produção por meio do mesmo nick.
 app.get('/loja',(_req,res)=>res.status(503).json({
  erro:'LOJA_AINDA_NAO_HABILITADA_PARA_VENDA_REAL',
  checkoutReal:false,
  financeiroReal:false
 }));
}
module.exports={renderizarInterfaceAprovada,montarInterfaceAprovada};
