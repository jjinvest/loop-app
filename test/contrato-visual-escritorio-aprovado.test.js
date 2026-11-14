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
