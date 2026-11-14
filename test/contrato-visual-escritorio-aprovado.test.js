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
  'loop03Giros24Integrado','loop03NumeroIntegrado',
  'loop03-loja-prata'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/class="loop03-hero-escritorio"/);
});
test('card superior de posições abre as dez vagas e terceiro acompanha seleção',()=>{
 const js=ler('src/candidato/checkout-candidato-ui.js');
 const real=ler('src/producao/interface-aprovada-contas.js');
 const motor=ler('src/domain/motor-conta-unica-ensaio-sqlite.js');
 assert.match(js,/motor\.posicoesAtivasDoTitular/);
 assert.match(js,/motor\.limitePosicoesAtivas/);
 assert.match(js,/motor\.catraca\.giros24h/);
 assert.match(motor,/const giros24h=/);
 assert.match(js,/const quantidade= somentePosicoesPeloQuadrado\?ativas\.length:10/);
 assert.match(js,/posicaoSelecionadaMotor=posicao\.numero/);
 assert.match(js,/\$\('loop03NumeroIntegrado'\)\.textContent='#'\+posicao\.numero/);
 assert.match(js,/\$\('loop03IrPosicoesIntegrado'\)\.addEventListener/);
 assert.match(real,/\$\('loop03IrPosicoesIntegrado'\)\.addEventListener/);
 assert.match(real,/\$\('loop03TotalIntegrado'\)\.textContent/);
 assert.match(real,/Number\.isSafeInteger\(giros24h\)/);
 assert.match(real,/posicaoSelecionada\?'#'\+posicaoSelecionada:'—'/);
});

test('quadradinho superior lista somente posições existentes e demonstração sem persistência',()=>{
 const ui=ler('src/candidato/checkout-candidato-ui.js');
 const real=ler('src/producao/interface-aprovada-contas.js');
 assert.match(ui,/somentePosicoesPeloQuadrado\?ativas\.length:10/);
 assert.match(ui,/addEventListener\('click',abrirPopupResumo\)/);
 assert.match(ui,/data-exemplo-visual/);
 assert.match(ui,/Fila B · Aguardando confirmação · Indicações: 0/);
 assert.match(real,/const slots=somentePosicoesPeloQuadrado\?ordenadas:/);
 assert.match(real,/proximaAbaVemDoQuadrado=true/);
 assert.match(real,/data-exemplo-visual/);
});

test('quadrado abre opções de posições na primeira aba e histórico somente após escolha',()=>{
 const html=ler('src/candidato/checkout-candidato-ui.html');
 const js=ler('src/candidato/checkout-candidato-ui.js');
 assert.match(html,/id="seletorPosicoesResumo"/);
 assert.match(html,/id="historicoPosicaoResumo"/);
 assert.match(html,/id="loop03StatusPosicao"/);
 assert.match(js,/addEventListener\('click',abrirPopupResumo\)/);
 assert.match(js,/async function renderizarHistoricoResumo/);
 assert.match(js,/posicoesDisponiveisResumo\.forEach/);
 assert.match(js,/\/motor\/posicoes\//);
 assert.doesNotMatch(js,/loop03IrPosicoesIntegrado'\)\.addEventListener\('click',\(\)=>mostrarAba/);
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
 assert.match(html,/id="historicoPosicaoResumo"/);
 assert.match(js,/function iniciarCarrosselResumo/);
 assert.match(js,/pista\.scrollTo/);
 assert.match(css,/aspect-ratio:3\/4/);
 assert.match(css,/aspect-ratio:16\/8\.5/);
 assert.match(css,/scroll-snap-type:x mandatory/);
 assert.match(css,/\.loop03-banners-pontos button::before\{[^\n]*border-radius:50%/);
 assert.match(css,/\.loop03-banners-pontos button\{[^\n]*aspect-ratio:1/);
});
