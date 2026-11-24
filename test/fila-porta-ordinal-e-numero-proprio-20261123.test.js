'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const fonte=fs.readFileSync(path.join(__dirname,'../src/shared/tabuleiro-visual-loop.js'),'utf8');
function renderizar(itens){
 const criados=[];
 function elemento(tag){
  const e={tag,textContent:'',children:[],attrs:{},
   classList:{toggle(){},add(){},remove(){}},
   append(...c){this.children.push(...c);},
   setAttribute(k,v){this.attrs[k]=v;},
   remove(){},
   addEventListener(event,cb){this[event]=cb;}};
  criados.push(e);return e;
 }
 const area={children:[],replaceChildren(...c){this.children=[...c];},
  append(...c){this.children.push(...c);}};
 const context={window:{},document:{createElement:elemento},Number,String,Object,Array};
 vm.runInNewContext(fonte,context,{timeout:2000});
 context.window.LoopTabuleiroVisual.criar({elemento:()=>area})
  .preencherFila('motorFilaB',itens,'B');
 return {area,criados};
}
test('cinco bolas têm ordinal da porteira distinto do ID próprio',()=>{
 const r=renderizar([12,7,99,42,180].map((numero,i)=>({
  ordem:i+1,numero
 })));
 assert.equal(r.area.children.length,5);
 for(let i=0;i<5;i++){
  const l=r.area.children[i];
  assert.equal(l.children[0].textContent,String(i+1));
  assert.equal(l.children[1].children[0].textContent,
   '#'+[12,7,99,42,180][i]);
  assert.doesNotMatch(l.children[1].children[0].textContent,/identidade protegida/);
 }
});
test('nicks só aparecem quando autorizados pelo backend',()=>{
 const r=renderizar([{ordem:1,numero:1,nickVisual:'Vilela'},
  {ordem:2,numero:2}]);
 assert.equal(r.area.children[0].children[1].children[1].textContent,'Vilela');
 assert.equal(r.area.children[1].children[1].children.length,1);
});
test('ordinais até cem cabem na bola e seguem ordem da porteira',()=>{
 const r=renderizar([{ordem:99,numero:3},{ordem:100,numero:4},
  {ordem:101,numero:5}]);
 assert.deepEqual(r.area.children.map(x=>x.children[0].textContent),
  ['99','100','101']);
});
test('interface do operador consulta posição própria real em páginas autenticadas',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../src/producao/interface-aprovada-contas.js'),'utf8');
 assert.match(s,/consultarFilaTabuleiroOperador\('A',d\.filaA\)/);
 assert.match(s,/consultarFilaTabuleiroOperador\('B',d\.filaB\)/);
 assert.match(s,/posicoes\.push\(\.\.\.d\.pagina\)/);
});

test('cem lugares no visor sem reciclar ID, duas esferas e nick autorizado',()=>{
 const r=renderizar(Array.from({length:130},(_,i)=>({ordem:i+1,numero:10001+i,dourada:i===0,nickVisual:i===1?'Vilela':undefined,indicacoesVinculadas:i===1?2:0})));
 assert.equal(r.area.children.length,100);
 assert.equal(r.area.children[0].children[0].className,'loop03-fila-ordinal-branca');
 assert.equal(r.area.children[0].children[1].className,'loop03-inicial-fila loop03-bola-interativa loop03-dourada');
 assert.equal(r.area.children[0].children[1].children[0].textContent,'#10001');
 assert.equal(r.area.children[1].children[1].children[1].textContent,'Vilela');
 assert.equal(r.area.children[1].children[2].children[1].textContent,'2');
 assert.equal(r.area.children[99].children[0].textContent,'100');
 assert.equal(r.area.children[99].children[1].children[0].textContent,'#10100');
});

test('número longo abreviado no círculo sem perder o ID completo e dourada sem indicação',()=>{
 const {area}=renderizar([{numero:123456789,nickVisual:'Vilela',indicacoesVinculadas:4},{numero:1000,dourada:true,nickVisual:'Vilela',indicacoesVinculadas:4}]);
 assert.equal(area.children[0].children[1].children[0].textContent,'#123456…');
 assert.match(area.children[0].children[1].attrs.title,/#123456789 Vilela/);
 assert.equal(area.children[1].children.length,2);
 assert.equal(area.children[1].children[1].children.length,1);
});
