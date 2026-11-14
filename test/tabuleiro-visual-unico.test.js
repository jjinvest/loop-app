'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {renderizarInterfaceAprovada}=
 require('../src/producao/interface-aprovada-loop');
const pasta=path.resolve(__dirname,'../src');
const ler=p=>fs.readFileSync(path.join(pasta,p),'utf8');
function fake(){
 const criados=[];
 function elemento(){
  const classe=new Set();
  return {
   textContent:'',children:[],attributes:{},style:{},
   classList:{toggle:(nome,ativo)=>{
    if(ativo)classe.add(nome);else classe.delete(nome);
   },contains:nome=>classe.has(nome)},
   setAttribute(nome,valor){this.attributes[nome]=valor;},
   append(...xs){this.children.push(...xs);},
   replaceChildren(){this.children=[];},
   closest(){return this.esfera||null;}
  };
 }
 const elementos={};
 for(const n of ['tabuleiroMotorCentro',...Array.from({length:6},(_,i)=>
  'tabuleiroMotorVaga'+(i+1))]){
  elementos[n]=elemento();elementos[n].esfera=elemento();
  elementos[n].esfera.nick=elemento();
  elementos[n].esfera.querySelector=(selector)=>
   selector==='.nick-posicao-tabuleiro'?elementos[n].esfera.nick:null;
 }
 for(const id of ['motorFilaA','motorFilaB',...Array.from({length:6},
  (_,i)=>'motorBolinha'+(i+1))])elementos[id]=elemento();
 const contexto={window:{},document:{createElement(){
  const e=elemento();criados.push(e);return e;
 }},Number,Object,String,Array};
 vm.runInNewContext(ler('shared/tabuleiro-visual-loop.js'),contexto);
 return {visual:contexto.window.LoopTabuleiroVisual.criar({
  elemento:id=>elementos[id]
 }),el:elementos,criados};
}
test('mesmo desenho das filas e bolinhas nas duas interfaces',()=>{
 const estagio=ler('candidato/checkout-candidato-ui.html');
 const real=renderizarInterfaceAprovada();
 assert.match(estagio,/src="\/staging\/assets\/tabuleiro-visual.js" defer/);
 assert.match(real,/src="\/identidade\/assets\/tabuleiro-visual.js" defer/);
 for(const [html,asset] of [
  [estagio,'/staging/assets/tabuleiro-visual.js'],
  [real,'/identidade/assets/tabuleiro-visual.js']])
  assert.ok(html.indexOf(asset)<html.indexOf('cliente.js'));
 for(const caminho of [
  'candidato/checkout-candidato-ui.js',
  'producao/interface-aprovada-contas.js']){
  const code=ler(caminho);
  assert.match(code,/LoopTabuleiroVisual\.criar/);
  assert.match(code,/visualTabuleiro\.preencherVaga/);
  assert.match(code,/visualTabuleiro\.preencherFila/);
  assert.match(code,/visualTabuleiro\.preencherLuzes/);
  assert.doesNotMatch(code,/function preencherVagaMotor\(/);
  assert.doesNotMatch(code,/style\.opacity=i<d\.tabuleiro/);
 }
});
test('filas exibem numero real ou contagem sem inventar identidades',()=>{
 const {visual,el}=fake();
 visual.preencherFila('motorFilaA',[{numero:9,minha:true,
  estadoAdesao:'PENDENTE'}],'A');
 assert.equal(el.motorFilaA.children.length,1);
 const row=el.motorFilaA.children[0];
 assert.equal(row.children[1].children[0].textContent,'#9');
 assert.match(row.children[1].children[1].textContent,/Minha posição/);
 assert.equal(row.children[0].className,'loop03-inicial-fila loop03-azul');
 visual.preencherFila('motorFilaB',21,'B');
 assert.equal(el.motorFilaB.children.length,1);
 assert.equal(el.motorFilaB.children[0].children[1].children[0].textContent,
  '21 posição(ões) em validação interna');
 assert.equal(el.motorFilaB.children[0].children[1].children.length,1,
  'nao inventar titulares ou numeros individuais');
 visual.preencherFila('motorFilaB',0,'B');
 assert.equal(el.motorFilaB.children[0].textContent,'Fila vazia');
 assert.throws(()=>visual.preencherFila('motorFilaB',-1,'B'),
  /FILA_FONTE_INVALIDA/);
});
test('roda usa centro verde, periferia branca, sexta vermelha e dourada permanente',()=>{
 const html=ler('candidato/checkout-candidato-ui.html');
 const css=ler('candidato/escritorio-cliente-integrado.css');
 for(let i=1;i<=6;i++){
  assert.match(html,new RegExp('<span class="titulo-espaco-tabuleiro-demo">'+i+
   '<\\/span>\\s*<strong class="selo-posicao-demo" id="tabuleiroMotorVaga'+i+'">'));
  assert.match(html,new RegExp('id="nickTabuleiroVaga'+i+'"'));
 }
 assert.match(html,/id="nickTabuleiroCentro"/);
 assert.ok(css.includes('.mapa-tabuleiro-posicoes-demo > .tabuleiro-vaga-6'));
 assert.ok(css.includes('.mapa-tabuleiro-posicoes-demo > .tabuleiro-centro'));
 assert.ok(css.includes('espaco-tabuleiro-demo:has(> .selo-posicao-demo.posicao-dourado)'));
 const {visual,el}=fake();
 visual.preencherVaga('tabuleiroMotorVaga2',null);
 assert.equal(el.tabuleiroMotorVaga2.esfera.nick.textContent,'');
 assert.match(el.tabuleiroMotorVaga2.esfera.style.background,/#f6f8fa/);
 visual.preencherVaga('tabuleiroMotorVaga6',null);
 assert.match(el.tabuleiroMotorVaga6.esfera.style.background,/#ef535c/);
 visual.preencherVaga('tabuleiroMotorCentro',null,true);
 assert.match(el.tabuleiroMotorCentro.esfera.style.background,/#51d598/);
 visual.preencherVaga('tabuleiroMotorVaga2',{numero:23,nickVisual:'Vilela'});
 assert.equal(el.tabuleiroMotorVaga2.esfera.nick.textContent,'Vilela');
 visual.preencherVaga('tabuleiroMotorVaga2',{numero:24,nickVisual:'<script>'});
 assert.equal(el.tabuleiroMotorVaga2.esfera.nick.textContent,'');
 visual.preencherVaga('tabuleiroMotorVaga6',{numero:25,dourada:true});
 assert.equal(el.tabuleiroMotorVaga6.classList.contains('posicao-dourado'),true);
 assert.match(el.tabuleiroMotorVaga6.esfera.style.background,/#ebc35d/);
 visual.preencherVaga('tabuleiroMotorVaga6',{numero:29,dourada:false});
 assert.match(el.tabuleiroMotorVaga6.esfera.style.background,/#ef535c/);
 visual.preencherVaga('tabuleiroMotorCentro',{numero:26,dourada:true},true);
 assert.equal(el.tabuleiroMotorCentro.classList.contains('posicao-dourado'),true);
 assert.match(el.tabuleiroMotorCentro.esfera.style.background,/#ebc35d/);
 visual.preencherVaga('tabuleiroMotorCentro',{numero:27},true);
 assert.match(el.tabuleiroMotorCentro.esfera.style.background,/#51d598/);
});
test('tabuleiro circular respeita azul verde dourada e 6 eventos',()=>{
 const {visual,el}=fake();
 visual.preencherVaga('tabuleiroMotorCentro',null,true);
 assert.equal(el.tabuleiroMotorCentro.textContent,'#0000');
  const css=ler('laboratorio/loop-03-shell.css');
  for(const regra of [
   'tabuleiro-centro:has(.posicao-dourado)',
   'espaco-tabuleiro-demo:not(.tabuleiro-centro):has(.posicao-azul)',
   'espaco-tabuleiro-demo:not(.tabuleiro-centro):has(.posicao-cliente)',
   'tabuleiro-vaga-6:not(:has(.posicao-dourado))'
  ]) assert.ok(css.includes(regra),'cor do tabuleiro: '+regra);
 visual.preencherVaga('tabuleiroMotorVaga1',{
  numero:12,minha:true,estadoAdesao:'PENDENTE'
 });
 assert.equal(el.tabuleiroMotorVaga1.textContent,'#12');
 assert.equal(el.tabuleiroMotorVaga1.classList.contains('posicao-azul'),true);
 assert.equal(el.tabuleiroMotorVaga1.classList.contains('loop03-iluminada'),true);
 visual.preencherVaga('tabuleiroMotorVaga2',{
  numero:13,estadoAdesao:'ACEITE_ENSAIO'});
 assert.equal(el.tabuleiroMotorVaga2.classList.contains('posicao-verde'),true);
 visual.preencherVaga('tabuleiroMotorVaga2',{
  numero:13,fila:'B',estadoAdesao:'ACEITE_ENSAIO'});
 assert.equal(el.tabuleiroMotorVaga2.classList.contains('posicao-fila-b'),true);
 visual.preencherVaga('tabuleiroMotorVaga2',{numero:13,minha:true});
 assert.equal(el.tabuleiroMotorVaga2.classList.contains('posicao-cliente'),true);
 visual.preencherVaga('tabuleiroMotorVaga2',null);
 assert.equal(el.tabuleiroMotorVaga2.classList.contains('posicao-vazia'),true);
 visual.preencherVaga('tabuleiroMotorVaga3',{
  numero:14,dourada:true,numeroVisual:'88',nomeVisual:'Empresa'});
 assert.equal(el.tabuleiroMotorVaga3.textContent,'#88\nEmpresa');
 assert.equal(el.tabuleiroMotorVaga3.classList.contains('posicao-dourado'),true);
 visual.preencherLuzes(5);
 assert.equal(el.motorBolinha5.classList.contains('loop03-marcador-aceso'),true);
 assert.equal(el.motorBolinha6.classList.contains('loop03-marcador-aceso'),false);
 assert.match(el.motorBolinha6.attributes['aria-label'],/aguardando/);
 visual.preencherLuzes(6);
 assert.equal(el.motorBolinha6.classList.contains('loop03-marcador-aceso'),true);
 assert.throws(()=>visual.preencherLuzes(7),/EVENTOS_TABULEIRO_INVALIDOS/);
});
