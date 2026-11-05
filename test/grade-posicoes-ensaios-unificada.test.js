'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

// Executa exclusivamente a funcao da tela com elementos DOM minimos.
// Nao monta servidor nem cria pedidos/posicoes ficticios na base.
const js=fs.readFileSync(path.join(__dirname,
 '../src/candidato/checkout-candidato-ui.js'),'utf8');
const inicio=js.indexOf('async function atualizarPosicoes(){');
const fim=js.indexOf('async function atualizarEquipe(',inicio);
assert.ok(inicio>=0&&fim>inicio,'a tela deve ter uma unica origem para posicoes');
const funcao=js.slice(inicio,fim);
assert.doesNotMatch(funcao,/innerHTML|insertAdjacentHTML|localStorage|sessionStorage/);
function elemento(tag){
 return {
  tag,children:[],attributes:{},className:'',textContent:'',
  setAttribute(k,v){this.attributes[k]=v;},
  append(...filhos){this.children.push(...filhos);},
  replaceChildren(...filhos){this.children=[...filhos];}
 };
}
async function desenhar(dados,falha=false){
 const area=elemento('div');
 const context={
  document:{createElement:elemento},
  $:id=>id==='posicoesPainel'?area:null,
  requisitar:async rota=>{
   assert.equal(rota,'/minha-previa-filas');
   if(falha)throw Error('SQLITE_INDISPONIVEL');
   return dados;
  }
 };
 const render=vm.runInNewContext(funcao+'\n;atualizarPosicoes;',context);
 await render();
 return area;
}
test('dez cartoes na mesma tela com somente o registro do titular consultado',async()=>{
 const area=await desenhar({
  meusPendentesHistoricos:1,meusSimuladosNaFilaB:1,motivo:'Somente laboratorio',
  pendencias:[{estado:'APENAS_PREVIA_FILA_B_AZUL',
   prepedidoId:'hom-<img src=x onerror=alert(1)>'}]
 });
 assert.equal(area.children.length,3);
 const [,grade]=area.children;
 assert.equal(grade.children.length,10);
 assert.equal(grade.attributes.role,'list');
 assert.match(grade.children[0].children[1].textContent,/PENDENTE/);
 assert.equal(grade.children[0].children[3].textContent,
  'Pedido de ensaio: hom-<img src=x onerror=alert(1)>');
 assert.match(grade.children[1].children[1].textContent,/Espaco disponivel/);
 assert.match(area.children[0].textContent,/ativas: 0/);
 assert.doesNotMatch(area.children[0].textContent,/saldo disponivel|ganho garantido/i);
});
test('historico acima de dez nao inventa posicao ativa nem oculta excedente',async()=>{
 const pendencias=Array.from({length:12},(_,i)=>({
  estado:'EXIGE_REVISAO_PSP',prepedidoId:'hom-test-'+i
 }));
 const area=await desenhar({
  meusPendentesHistoricos:12,meusSimuladosNaFilaB:0,pendencias
 });
 assert.equal(area.children[1].children.length,10);
 assert.match(area.children[2].textContent,/Outros 2 registros/);
});
test('falha de consulta nao reaproveita cartoes ou atribui posicoes',async()=>{
 const area=await desenhar(null,true);
 assert.equal(area.children.length,1);
 assert.match(area.children[0].textContent,/Consulta indisponivel/);
});
