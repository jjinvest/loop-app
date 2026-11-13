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
