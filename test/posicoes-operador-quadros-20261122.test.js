'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const js=fs.readFileSync(path.join(__dirname,
 '../src/producao/interface-aprovada-contas.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,
 '../src/producao/acabamento-botoes-real.css'),'utf8');

const inicio=js.indexOf(' function mostrarResumoPosicoesOperador(destino,d){');
const fim=js.indexOf(' async function carregarAbaOperador(id){',inicio);
assert.ok(inicio>=0&&fim>inicio,'renderizador do painel de posições');
const funcao=js.slice(inicio,fim);

class No{
 constructor(tag){this.tagName=tag.toUpperCase();this.className='';
  this.textContent='';this.children=[];this.attrs={};}
 setAttribute(name,value){this.attrs[name]=value;}
 append(...nodes){this.children.push(...nodes);}
 appendChild(node){this.children.push(node);}
 replaceChildren(...nodes){this.children=[...nodes];}
}
function executar(d){
 const destino=new No('div');const context={
  document:{createElement:tag=>new No(tag)},Number,String,Object,Error
 };
 vm.runInNewContext(funcao+'\nthis.mostrar=mostrarResumoPosicoesOperador;',
  context,{timeout:1500});
 context.mostrar(destino,d);return destino;
}
function texto(bloco){return [bloco.textContent,
 ...bloco.children.flatMap(x=>[texto(x)])].join(' ').trim();}
test('dois cartões independentes: Fila A e B, eventos e centros',()=>{
 const d=executar({filaA:6,filaB:13,
  tabuleiro:{eventosNoCiclo:4,ciclosConcluidos:2}});
 assert.equal(d.children.length,2);
 const [filas,tabuleiro]=d.children;
 assert.equal(filas.className,'loop03-resumo-quadro loop03-resumo-filas');
 assert.equal(tabuleiro.className,'loop03-resumo-quadro loop03-resumo-tabuleiro');
 assert.equal(filas.children[0].textContent,'FILAS');
 assert.equal(tabuleiro.children[0].textContent,'TABULEIRO');
 assert.deepEqual(filas.children.slice(1).map(x=>
  [x.children[0].textContent,x.children[1].textContent]),
  [['Fila A','6'],['Fila B','13']]);
 assert.deepEqual(tabuleiro.children.slice(1).map(x=>
  [x.children[0].textContent,x.children[1].textContent]),
  [['Eventos no ciclo','4 / 6'],['Centros concluídos','2']]);
 assert.ok(!texto(d).includes('Sem pagamento'));
});
test('zero é zero: não fabrica pessoas, posições, eventos ou centros',()=>{
 const d=executar({filaA:0,filaB:0,
  tabuleiro:{eventosNoCiclo:0,ciclosConcluidos:0}});
 assert.equal(d.children[0].children[1].children[1].textContent,'0');
 assert.equal(d.children[0].children[2].children[1].textContent,'0');
 assert.equal(d.children[1].children[1].children[1].textContent,'0 / 6');
 assert.equal(d.children[1].children[2].children[1].textContent,'0');
});
test('não exibe valores negativos, ausentes ou eventos acima de seis',()=>{
 for(const d of [
  {filaA:-1,filaB:2,tabuleiro:{eventosNoCiclo:0,ciclosConcluidos:0}},
  {filaA:1,filaB:2,tabuleiro:{eventosNoCiclo:7,ciclosConcluidos:0}},
  {filaA:1,filaB:2,tabuleiro:null},
  {filaA:1,filaB:'3',tabuleiro:{eventosNoCiclo:0,ciclosConcluidos:0}}
 ])assert.throws(()=>executar(d),/RESUMO_POSICOES_MOTOR_INVALIDO/);
});
test('layout do operador mantém somente duas molduras e evita corte no celular',()=>{
 assert.match(js,/id="adminResumoPosicoes" class="loop03-resumo-duplo"/);
 assert.match(js,/mostrarResumoPosicoesOperador\(destino,d\)/);
 assert.match(js,/\['\/api\/admin\/loop\/estado','adminResumoPosicoes'\]/);
 assert.match(css,/body\.loop03-modo-operador #adminResumoPosicoes\.loop03-resumo-duplo\s*\{/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:340px\)/);
 assert.doesNotMatch(funcao,/fetch\(|method:\s*'POST'|INSERT|UPDATE|DELETE/);
});
