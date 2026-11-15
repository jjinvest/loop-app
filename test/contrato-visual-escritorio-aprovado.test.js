'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {createHash}=require('node:crypto');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const contrato=require('../docs/CONTRATO_VISUAL_LOOP_APROVADO.json');
const ler=p=>readFileSync(path.join(base,p),'utf8');
function gitBlob(p){
 const bytes=readFileSync(path.join(base,p));
 return createHash('sha1').update('blob '+bytes.length+'\0')
  .update(bytes).digest('hex');
}
test('TRAVA: os 24 HTML/CSS aprovados não mudam sem renovar autorização',()=>{
 assert.equal(contrato.arquivos.length,24);
 for(const {path:p,sha} of contrato.arquivos){
  assert.equal(gitBlob(p),sha,
   'ALTERACAO_VISUAL_NAO_AUTORIZADA: '+p);
 }
});
test('somente tres indicadores superiores e AKITEMM prateado no resumo inicial',()=>{
 const html=ler('src/candidato/checkout-candidato-ui.html');
 assert.equal((html.match(/class="loop03-indicador"/g)||[]).length,3);
 assert.doesNotMatch(html,/class="indicadores-cliente"/);
 for(const id of ['resumoPedidos','resumoPosicoes','resumoEquipe'])
  assert.doesNotMatch(html,new RegExp('id="'+id+'"'));
 for(const id of ['loop03IrPosicoesIntegrado','loop03TotalIntegrado',
  'loop03Giros24Integrado','loop03NumeroIntegrado'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/class="loop03-hero-escritorio"/);
});
test('placar superior mantém três indicadores e seleciona posição sem navegar',()=>{
 const js=ler('src/candidato/checkout-candidato-ui.js');
 const real=ler('src/producao/interface-aprovada-contas.js');
 const html=ler('src/candidato/checkout-candidato-ui.html');
 assert.match(js,/motor\.posicoesAtivasDoTitular/);
 assert.match(js,/motor\.limitePosicoesAtivas/);
 assert.match(js,/const quantidade= somentePosicoesPeloQuadrado\?ativas\.length:10/);
 assert.ok(js.includes("posicaoSelecionadaMotor=pos.numero"));
 assert.ok(js.includes("pos?'#'+(indice+1)"));
 assert.ok(js.includes("addEventListener('click',abrirPopupResumo)"));
 assert.ok(real.includes("abrir.addEventListener('click'"));
 assert.ok(real.includes("preencherPopupReal()"));
 assert.ok(real.includes("posicaoSelecionada=String(p.numero)"));
 assert.ok(real.includes("atualizarTopoPosicaoReal()"));
 assert.ok(real.includes("indicators.hidden=false"));
 assert.ok(html.includes('id="seletorPosicoesResumo"'));
 assert.ok(html.includes('id="opcoesPosicoesResumo"'));
 assert.doesNotMatch(html,/id="historicoPosicaoResumo"/);
});
test('Financeiro real e a prévia usam os mesmos cartões e protegem o saque',()=>{
 const html=ler('src/candidato/checkout-candidato-ui.html');
 const js=ler('src/candidato/checkout-candidato-ui.js');
 const real=ler('src/producao/interface-aprovada-contas.js');
 for(const id of ['finIndicadosValidos','finSaldoBonus','finSaldoSelecionado',
  'finSaldoPosicoes','finEscolherBonus','finEscolherPosicoes',
  'finValorSaque','finSolicitarSaque','finAbrirHistorico','finHistorico'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(html.includes('Valor mínimo para saque: R$ 25,00 (fixo)'));
 assert.doesNotMatch(html,/financeiroVerPedidos/);
 assert.ok(js.includes("if(aba==='conteudoFinanceiro')void finAtualizar()"));
 assert.ok(real.includes("tab.id==='abaFinanceiro'"));
 assert.ok(real.includes("fetch('/api/financeiro/historico'"));
 assert.ok(real.includes("fetch('/api/financeiro/saques'"));
 assert.ok(real.includes("carregarFinanceiroReal()"));
 assert.ok(real.includes("Saque indisponível até a homologação bancária"));
});

test('primeira aba: dois banners, AKITEMM prateado e pontos circulares',()=>{
 const html=ler('src/candidato/checkout-candidato-ui.html');
 const js=ler('src/candidato/checkout-candidato-ui.js');
 const css=ler('src/laboratorio/loop-03-shell.css');
 assert.doesNotMatch(html,/id="boasVindas"/);
 for(const id of ['atalhoPedidos','atalhoPosicoes','atualizarResumo'])
  assert.doesNotMatch(html,new RegExp('id="'+id+'"'));
 assert.doesNotMatch(html,/id="atalhoLoja"/);
 assert.match(html,/class="primario loop03-loja-prata"/);
 assert.equal((html.match(/class="loop03-banner-item/g)||[]).length,2);
 assert.equal((html.match(/data-banner-resumo=/g)||[]).length,2);
 assert.doesNotMatch(html,/id="historicoPosicaoResumo"/);
 assert.match(js,/function iniciarCarrosselResumo/);
 assert.match(js,/pista\.scrollTo/);
 assert.match(css,/aspect-ratio:3\/4/);
 assert.match(css,/aspect-ratio:16\/8\.5/);
 assert.match(css,/scroll-snap-type:x mandatory/);
 assert.match(css,/\.loop03-banners-pontos button::before\{[^\n]*border-radius:50%/);
 assert.match(css,/\.loop03-banners-pontos button\{[^\n]*aspect-ratio:1/);
});

test('cadastro: Nome, Nick, E-mail, Telefone, Senha e Confirmar senha',()=>{
 const html=ler('src/candidato/checkout-candidato-ui.html');
 const ids=['cadastroNome','cadastroNick','cadastroEmail',
  'cadastroTelefone','cadastroSenha','cadastroConfirmarSenha'];
 let anterior=-1;
 for(const id of ids){
  const i=html.indexOf('id="'+id+'"');
  assert.ok(i>anterior,'ORDEM_CADASTRO_INCORRETA: '+id);
  anterior=i;
 }
});
test('resumo da posicao: titular, fila e indicacoes no terceiro quadro',()=>{
 const ui=ler('src/candidato/checkout-candidato-ui.js');
 const real=ler('src/producao/interface-aprovada-contas.js');
 assert.match(ui,/nickAtualResumo=perfil\.nick/);
 assert.match(ui,/'@'\+nickAtualResumo/);
 assert.match(ui,/pos\.indicacoesVinculadas\|\|0/);
 assert.match(real,/nickResumoReal=s\.nick/);
 assert.match(real,/selecionadaResumo\.indicacoesVinculadas\|\|0/);
});

test('menu unico preserva nove destinos, com icones vetoriais dourados/verde/roxo',()=>{
 const html=ler('src/candidato/checkout-candidato-ui.html');
 const css=ler('src/candidato/escritorio-cliente-integrado.css');
 const {renderizarInterfaceAprovada}=require('../src/producao/interface-aprovada-loop');
 const real=renderizarInterfaceAprovada();
 const ids=['abaResumo','abaTabuleiro','abaPosicoes','abaEquipe','abaFinanceiro',
  'abaMeusPedidos','abaLinks','abaConta'];
 const nomes=['Escritório Virtual','Tabuleiro','Minhas Posições','Minha Equipe',
  'Financeiro','Meus Pedidos','Meus Links','Minha Conta'];
 const icones=['house','board','positions','team','finance','cart','link','account'];
 for(let i=0;i<ids.length;i++){
  const rx=new RegExp('<button[^>]*id="'+ids[i]+'"[^>]*>\\s*<span class="loop03-menu-icone loop03-menu-icone-'+icones[i]+' loop03-menu-cor-'+(ids[i]==='abaFinanceiro'?'verde':'dourado')+'"[^>]*><svg[\\s\\S]*?<\\/svg><\\/span> '+nomes[i]+'<\\/button>');
  assert.match(html,rx,'menu de homologacao '+ids[i]);
  assert.match(real,rx,'menu real '+ids[i]);
 }
 for(const pagina of [html,real]){
  const nav=pagina.match(/<nav role="tablist"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(nav);
  assert.equal((nav.match(/<button /g)||[]).length,8,'oito abas do cliente');
  assert.equal((nav.match(/<a href=/g)||[]).length,1,'somente o link da loja');
  assert.match(nav,/class="loop03-atalho-loja"><span class="loop03-menu-icone loop03-menu-icone-shop loop03-menu-cor-roxo"/);
 }
 assert.match(css,/\.loop03-menu-cor-verde[\s\S]*?color:#6de7a9/);
 assert.match(css,/\.loop03-menu-cor-roxo[\s\S]*?color:#c295ff/);
 assert.match(css,/\.loop03-menu-icone-board svg[\s\S]*?width:25px/);
 assert.doesNotMatch(html,/># Minhas Posições</);
});


test('rodape do menu mostra apenas nick e situacao da posicao sem mexer no placar',()=>{
 const vm=require('node:vm');
 const html=ler('src/candidato/checkout-candidato-ui.html');
 const realHtml=require('../src/producao/interface-aprovada-loop').renderizarInterfaceAprovada();
 const css=ler('src/candidato/escritorio-cliente-integrado.css');
 const previa=ler('src/candidato/checkout-candidato-ui.js');
 const real=ler('src/producao/interface-aprovada-contas.js');
 for(const fonte of [html,realHtml]){
  const inicio=fonte.indexOf('<button type="button" id="loop03AbrirPerfil"');
  const fim=fonte.indexOf('</button>',inicio);
  assert.ok(inicio>=0&&fim>inicio);
  const rodape=fonte.slice(inicio,fim);
  assert.doesNotMatch(rodape,/<strong>Minha conta<\/strong>/i);
  assert.match(rodape,/<strong id="loop03NickIntegrado">/);
  assert.match(rodape,/id="loop03RodapeFilaIntegrado"/);
  assert.match(rodape,/id="loop03RodapeCoroaIntegrado"/);
  assert.match(rodape,/aria-label="No Tabuleiro"/);
  assert.match(rodape,/id="loop03ImagemFotoRodape"/);
  assert.match(rodape,/id="loop03AbrirPerfil"/);
 }
 assert.match(css,/\.loop03-rodape-situacao\[hidden\]/);
 assert.match(css,/\.loop03-rodape-coroa\[hidden\]/);
 // Verificar a logica efetiva, nao so a presenca dos elementos.
 const recortar=(codigo,primeiro,depois)=>{
  const i=codigo.indexOf('function '+primeiro+'(');
  const j=codigo.indexOf('function '+depois+'(',i+10);
  assert.ok(i>=0&&j>i);
  // A funcao seguinte na previa e 'async function'; nao incluir o
  // modificador async solto ao avaliar somente a funcao do rodape.
  return codigo.slice(i,j).replace(/\\s+async\\s*$/,'');
 };
 const funcoes=[
  {codigo:recortar(previa,'atualizarSituacaoRodape','atualizarResumo'),nome:'atualizarSituacaoRodape',tipo:'previa'},
  {codigo:recortar(real,'atualizarSituacaoRodapeReal','atualizarTopoPosicaoReal'),nome:'atualizarSituacaoRodapeReal',tipo:'real'}
 ];
 for(const f of funcoes){
  function simular(posicoes,selecionada){
   const elementos={
    loop03RodapeFilaIntegrado:{textContent:'',hidden:true},
    loop03RodapeCoroaIntegrado:{hidden:true}
   };
   const contexto={$:id=>elementos[id],
    posicoesDisponiveisResumo:posicoes,
    posicoesResumoReal:posicoes,
    posicaoSelecionadaMotor:selecionada,
    posicaoSelecionada:selecionada===null?'':String(selecionada)};
   vm.runInNewContext(f.codigo+'\n'+f.nome+'();',contexto);
   return elementos;
  }
  const exemplos=[
   {numero:101,local:f.tipo==='real'?'FILA_A':'FILA',fila:'A'},
   {numero:209,local:f.tipo==='real'?'FILA_B':'FILA',fila:'B'},
   {numero:315,local:'VAGA_6',fila:'A'},
   {numero:420,local:'CENTRO',fila:'B'}
  ];
  let estado=simular(exemplos,101);
  assert.equal(estado.loop03RodapeFilaIntegrado.textContent,'Fila A');
  assert.equal(estado.loop03RodapeCoroaIntegrado.hidden,true);
  estado=simular(exemplos,209);
  assert.equal(estado.loop03RodapeFilaIntegrado.textContent,'Fila B');
  assert.equal(estado.loop03RodapeCoroaIntegrado.hidden,true);
  for(const numero of [315,420]){
   estado=simular(exemplos,numero);
   assert.equal(estado.loop03RodapeFilaIntegrado.hidden,true);
   assert.equal(estado.loop03RodapeCoroaIntegrado.hidden,false);
  }
  estado=simular(exemplos,null);
  assert.equal(estado.loop03RodapeFilaIntegrado.textContent,'Fila A','primeira posicao sem selecao');
  estado=simular([],null);
  assert.equal(estado.loop03RodapeFilaIntegrado.hidden,true);
  assert.equal(estado.loop03RodapeCoroaIntegrado.hidden,true);
  const naoConfirmada=simular([{numero:90,local:'EM_REVISAO_PSP',fila:'B'}],90);
  assert.equal(naoConfirmada.loop03RodapeFilaIntegrado.hidden,true);
  assert.equal(naoConfirmada.loop03RodapeCoroaIntegrado.hidden,true);
 }
 // O numero unico e as indicacoes continuam no topo, nao na legenda.
 assert.ok(previa.includes("' · ID #'+pos.numero"));
 assert.ok(real.includes("' · ID #'+p.numero"));
 assert.match(previa,/atualizarIndicadorSelecionadoResumo\(\)/);
 assert.match(real,/atualizarTopoPosicaoReal\(\)/);
});
