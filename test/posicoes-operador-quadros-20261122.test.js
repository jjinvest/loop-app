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
const gateway=fs.readFileSync(path.join(__dirname,
 '../src/producao/gateway-admin-comercial.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,
 '../src/producao/interface-aprovada-loop.js'),'utf8');

const inicio=js.indexOf(' function mostrarResumoPosicoesOperador(destino,d){');
const fim=js.indexOf(' function mostrarResumoComercialOperador(destino,d){',inicio);
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
 const destino=new No('div');
 const ctx={document:{createElement:tag=>new No(tag)},
  Number,String,Object,Error};
 vm.runInNewContext(funcao+'\nthis.mostrar=mostrarResumoPosicoesOperador;',
  ctx,{timeout:1500});
 ctx.mostrar(destino,d);return destino;
}
const metr= (fila,primeiro,total)=>({total,primeiro:primeiro===null?null:
 {numero:primeiro,ordem:1}});
const relogio={luzesRelogio24h:136,ciclosRelogio24h:22,
 luzesRelogioHoje:16,ciclosRelogioHoje:2,
 luzesRelogioAcumuladas:736,ciclosRelogioAcumulados:122};
const estado=()=>({filaA:6,filaB:13,
 tabuleiro:{eventosNoCiclo:0,ciclosConcluidos:0},
 filasResumo:{A:metr('A',101,6),B:metr('B',201,13)},relogio});
const valores=linha=>linha.children.map(x=>x.children.map(y=>y.textContent));
test('filas A e B: esquerda mostra primeiro clicável, direita mostra total',()=>{
 const d=executar(estado());const [filas,tabuleiro]=d.children;
 assert.equal(d.children.length,2);
 assert.equal(filas.className,'loop03-resumo-quadro loop03-resumo-filas');
 assert.equal(tabuleiro.className,'loop03-resumo-quadro loop03-resumo-tabuleiro');
 assert.equal(filas.children[0].textContent,'FILAS');
 assert.equal(tabuleiro.children[0].textContent,'TABULEIRO');
 assert.deepEqual(valores(filas.children[1]),
  [['Primeiro da fila A','#101'],['Total da fila A','6']]);
 assert.deepEqual(valores(filas.children[3]),
  [['Primeiro da fila B','#201'],['Total da fila B','13']]);
 assert.equal(filas.children[1].children[0].attrs['data-admin-fila'],'A');
 assert.equal(filas.children[3].children[0].attrs['data-admin-fila'],'B');
 assert.equal(filas.children[2].hidden,true);
 assert.equal(filas.children[4].hidden,true);
});
test('relógio: ciclo atual à esquerda, acumulado à direita, dia separado',()=>{
 const d=executar(estado());
 const tabuleiro=d.children[1];
 assert.equal(tabuleiro.children[1].textContent,'RELÓGIO DO TEMPO');
 assert.deepEqual(valores(tabuleiro.children[2]),[
  ['Eventos no ciclo','4 / 6'],['Eventos acumulados','736']]);
 assert.deepEqual(valores(tabuleiro.children[3]),[
  ['Centros concluídos hoje','2'],
  ['Ciclos concluídos no total','122']]);
 assert.equal(JSON.stringify(d).includes('SEM GIRO FINANCEIRO'),false);
 assert.equal(JSON.stringify(d).includes('pagamento confirmado'),false);
});
test('sem configuração ou fila vazia, não inventa pagamentos nem posição',()=>{
 const d=executar({filaA:0,filaB:0,
  tabuleiro:{eventosNoCiclo:0,ciclosConcluidos:0}});
 assert.deepEqual(valores(d.children[0].children[1]),[
  ['Primeiro da fila A','—'],['Total da fila A','0']]);
 assert.deepEqual(valores(d.children[0].children[3]),[
  ['Primeiro da fila B','—'],['Total da fila B','0']]);
 assert.deepEqual(valores(d.children[1].children[2]),[
  ['Eventos no ciclo','0 / 6'],['Eventos acumulados','—']]);
 assert.deepEqual(valores(d.children[1].children[3]),[
  ['Centros concluídos hoje','—'],
  ['Ciclos concluídos no total','—']]);
});
test('recusa motor, fila ou relógio divergentes',()=>{
 for(const d of [
  {filaA:-1,filaB:2,tabuleiro:{eventosNoCiclo:0,ciclosConcluidos:0}},
  {filaA:1,filaB:2,tabuleiro:{eventosNoCiclo:7,ciclosConcluidos:0}},
  {filaA:1,filaB:2,tabuleiro:null},
  {filaA:1,filaB:'3',tabuleiro:{eventosNoCiclo:0,ciclosConcluidos:0}}
 ])assert.throws(()=>executar(d),/RESUMO_POSICOES_MOTOR_INVALIDO/);
 const inconsistente=estado();inconsistente.filasResumo.A.total=777;
 assert.throws(()=>executar(inconsistente),/RESUMO_FILA_OPERADOR_DIVERGENTE/);
 const errado=estado();errado.relogio.ciclosRelogioAcumulados=124;
 assert.throws(()=>executar(errado),/RESUMO_POSICOES_RELOGIO_INVALIDO/);
});
test('operador tem 2 quadros lado a lado com metades; cliente só total A',()=>{
 assert.match(js,/id="adminResumoPosicoes" class="loop03-resumo-duplo"/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(css,/#adminResumoPosicoes \.loop03-resumo-partido/);
 assert.match(js,/const tamanho=window\.innerWidth<=680\?10:20/);
 assert.match(js,/consultarFilaOperador\('A'\)/);
 assert.match(js,/consultarFilaOperador\('B'\)/);
 assert.match(js,/mostrarTotaisFilasRodape\(d\.filaA,d\.filaB,true\)/);
 assert.match(js,/mostrarTotaisFilasRodape\(d\.filaA,d\.filaB,false\)/);
 assert.match(css,/body:not\(\.loop03-modo-operador\) #loop03TotalFilaBRodape/);
 assert.match(gateway,/app\.get\('\/api\/admin\/loop\/filas',proteger/);
 assert.match(html,/id=\\"loop03TotalFilaARodape\\"/);
 assert.match(html,/id=\\"loop03TotalFilaBRodape\\"/);
 assert.doesNotMatch(funcao,/fetch\(|method:\s*'POST'|INSERT|UPDATE|DELETE/);
});
