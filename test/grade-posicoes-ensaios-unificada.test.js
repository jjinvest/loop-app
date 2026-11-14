'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
// A aba aprovada usa a MESMA fonte de conta para motor e historico PSP.
const js=fs.readFileSync(path.join(__dirname,
 '../src/candidato/checkout-candidato-ui.js'),'utf8');
const inicio=js.indexOf('async function atualizarPosicoes(){');
const fim=js.indexOf('async function atualizarEquipe(',inicio);
assert.ok(inicio>=0&&fim>inicio);
const funcao=js.slice(inicio,fim);
assert.doesNotMatch(funcao,/innerHTML|insertAdjacentHTML|localStorage|sessionStorage/);
function elemento(tag){
 return {tag,children:[],attributes:{},className:'',textContent:'',
  addEventListener(){},setAttribute(k,v){this.attributes[k]=v;},
  append(...filhos){this.children.push(...filhos);},
  replaceChildren(...filhos){this.children=[...filhos];}
 };
}
async function desenhar(dados,{motor={minhasPosicoes:[]},falha=false,somenteMinhas=false}={}){
 const area=elemento('div'),numero=elemento('strong');
 const context={
  document:{createElement:elemento},posicaoSelecionadaMotor:null,
  somentePosicoesPeloQuadrado:somenteMinhas,
  $:id=>id==='posicoesPainel'?area:id==='loop03NumeroIntegrado'?numero:null,
  requisitar:async rota=>{
   if(falha)throw Error('SQLITE_INDISPONIVEL');
   if(rota==='/minha-previa-filas')return dados;
   if(rota==='/motor/estado')return motor;
   throw Error('FONTE_NAO_AUTORIZADA:'+rota);
  }
 };
 const render=vm.runInNewContext(funcao+'\n;atualizarPosicoes;',context);
 await render();
 return area;
}
test('dez cartoes integrados e origem de pedido inserida somente como texto',async()=>{
 const area=await desenhar({
  meusPendentesHistoricos:1,
  pendencias:[{estado:'APENAS_PREVIA_FILA_B_AZUL',
   prepedidoId:'hom-<img src=x onerror=alert(1)>'}]
 });
 assert.equal(area.children.length,3);
 const [,grade]=area.children;
 assert.equal(grade.children.length,10);
 assert.equal(grade.attributes.role,'list');
 assert.match(grade.children[0].children[1].textContent,/AGUARDANDO/);
 assert.equal(grade.children[0].children[3].textContent,
  'Pedido de origem: hom-<img src=x onerror=alert(1)>');
 assert.match(grade.children[1].children[1].textContent,/Espaço disponível/);
 assert.match(area.children[0].textContent,/Posições em acompanhamento/);
});
test('mesma grade mostra posicoes vindas do motor sem confundir com dinheiro',async()=>{
 const area=await desenhar({meusPendentesHistoricos:0,pendencias:[]},{
  motor:{minhasPosicoes:[{numero:42,local:'FILA',fila:'B',pendente:true}]}
 });
 assert.equal(area.children[1].children.length,10);
 assert.equal(area.children[1].children[0].children[1].textContent,'#42');
 assert.match(area.children[1].children[0].children[2].textContent,/Local: FILA/);
 assert.equal(area.children[1].children[0].children[3].tag,'form');
 assert.equal(area.children[1].children[0].children[4].tag,'button');
 assert.match(area.children[0].textContent,/Posições em acompanhamento/);
});
test('historico acima de dez permanece indicado sem confundir limite de pedidos',async()=>{
 const pendencias=Array.from({length:12},(_,i)=>({
  estado:'EXIGE_REVISAO_PSP',prepedidoId:'hom-test-'+i
 }));
 const area=await desenhar({meusPendentesHistoricos:12,pendencias});
 assert.equal(area.children[1].children.length,10);
 assert.match(area.children[2].textContent,/Outros 2 registros/);
});
test('falha em qualquer fonte nao reaproveita cartoes',async()=>{
 const area=await desenhar(null,{falha:true});
 assert.equal(area.children.length,1);
 assert.match(area.children[0].textContent,/Não foi possível carregar suas posições/);
 assert.doesNotMatch(area.children[0].textContent,/SQLITE_INDISPONIVEL/);
});

test('somente quadrado superior filtra ocupadas e usa exemplo marcado se zerado',async()=>{
 const uma=await desenhar({pendencias:[]},{
  motor:{minhasPosicoes:[{numero:42,local:'FILA',fila:'B',
   indicacoesVinculadas:2,pendente:false}]},somenteMinhas:true
 });
 assert.equal(uma.children.length,3);
 const grade=uma.children[1];
 assert.equal(grade.children.length,1);
 assert.equal(grade.children[0].children[1].textContent,'#42');
 assert.match(grade.children[0].children[2].textContent,/Fila B/);
 assert.equal(grade.children[0].attributes['data-exemplo-visual'],undefined);
 const vazio=await desenhar({pendencias:[]},{somenteMinhas:true});
 const amostra=vazio.children[1].children;
 assert.equal(amostra.length,1);
 assert.equal(amostra[0].attributes['data-exemplo-visual'],'true');
 assert.match(amostra[0].children[0].textContent,/DEMONSTRAÇÃO/);
 assert.match(amostra[0].children[2].textContent,/Fila B/);
 assert.match(amostra[0].children[3].textContent,/0 posições reais/);
});
