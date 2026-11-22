'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const editor=fs.readFileSync(path.join(__dirname,
 '../src/producao/operador-loja-fotos-real.js'),'utf8');
const loja=fs.readFileSync(path.join(__dirname,
 '../src/producao/interface-aprovada-loja.js'),'utf8');
const loop=fs.readFileSync(path.join(__dirname,
 '../src/producao/interface-aprovada-contas.js'),'utf8');

function recortar(inicio,fim){
 const a=editor.indexOf(inicio),b=editor.indexOf(fim,a);
 assert.ok(a>=0&&b>a,'função real do editor deve existir');
 return editor.slice(a,b);
}
test('mensagem de moldura some sozinha após 4 segundos e outra mensagem reinicia prazo',()=>{
 const fonte=recortar(' let anuncioArrasto=null,temporizadorAvisoArrasto=null;',
  ' const posicaoCard=');
 const agendados=new Map();
 let seguinte=0,remocoes=0,anexos=0;
 const documento={
  createElement:tag=>{
   assert.equal(tag,'div');
   return {className:'',textContent:'',setAttribute(){},
    remove(){remocoes++;}};
  },
  body:{append(x){anexos++;assert.equal(x.className,'akitemm-arrasto-aviso');}}
 };
 const criar=(callback,ms)=>{
  const id=++seguinte;agendados.set(id,{callback,ms});return id;
 };
 const cancelar=id=>agendados.delete(id);
 const origem=new Function('document','setTimeout','clearTimeout',
  fonte+'; return {avisarArrasto,atual:()=>anuncioArrasto};');
 const visor=origem(documento,criar,cancelar);
 visor.avisarArrasto('Molduras vazias trocadas entre as posições 12 e 11.');
 assert.equal(anexos,1);
 assert.equal(agendados.size,1);
 assert.equal([...agendados.values()][0].ms,4000);
 visor.avisarArrasto('Produto organizado.');
 assert.equal(anexos,1,'não duplicar avisos fixos');
 assert.equal(agendados.size,1,'temporizador anterior cancelado');
 assert.equal(visor.atual().textContent,'Produto organizado.');
 const atual=[...agendados.values()][0];
 atual.callback();
 assert.equal(remocoes,1);
 assert.equal(visor.atual(),null,'mensagem retirada automaticamente');
 visor.avisarArrasto('Nova mensagem.');
 assert.equal(anexos,2,'novo aviso aparece após o anterior sumir');
});
function simularVisao(autorizado,cliente){
 const codigo=recortar(' function sincronizarAlternanciaVisao(){',
  ' function sincronizarEditorOfertas(){');
 let nav=null,link=null;
 const filtros={insertAdjacentElement(pos,n){
  assert.equal(pos,'beforebegin');
  nav=n;
 }};
 const filtro={closest(seletor){
  assert.equal(seletor,'.akitemm-busca-filtros');return filtros;
 }};
 const documento={
  getElementById(id){
   if(id==='akitemmAlternarVisao')return nav;
   if(id==='akitemmFiltroOfertas')return filtro;
   return null;
  },
  createElement(tag){
   if(tag==='nav')return {
    id:null,style:{},setAttribute(){},
    querySelector(){return link;},append(el){link=el;},
    remove(){nav=null;}
   };
   assert.equal(tag,'a');
   return {className:'',style:{}};
  }
 };
 const rodar=new Function('document','operadorAutenticado',
  'visaoClienteSolicitada',codigo+'; return sincronizarAlternanciaVisao');
 rodar(documento,autorizado,cliente)();
 return {nav,link};
}
test('só operador autenticado recebe alternância; os dois sentidos são reversíveis',()=>{
 const visitante=simularVisao(false,true);
 assert.equal(visitante.nav,null);
 const operador=simularVisao(true,false);
 assert.equal(operador.link?.href,'/loja?visao=cliente');
 assert.equal(operador.link?.textContent,'Visão do Cliente');
 const cliente=simularVisao(true,true);
 assert.equal(cliente.link?.href,'/loja?visao=operador');
 assert.equal(cliente.link?.textContent,'Visão do Administrador');
 assert.match(editor,/operador=operadorAutenticado&&!visaoClienteSolicitada/);
 assert.match(editor,/if\(!operador\)\{atual\?\.remove\(\)/);
 assert.match(editor,/if\(!operador\)\{/);
 assert.match(editor,/if\(!operador\|\|arrasto\|\|dialogo\?\.open/);
});
test('prévia cliente nunca herda dados financeiros, identidade ou permissões de edição',()=>{
 assert.match(loja,/operadorAtivo=false,clienteNick=null,csrfLoja=null/);
 assert.match(loja,/visaoClienteLoja/);
 assert.match(loja,/VISÃO DO CLIENTE/);
 assert.match(loja,/Nenhuma conta pessoal foi acessada/);
 assert.match(loja,/if\(operadorAtivo\)\{\s*const pedidos=\$\('pedidosLojaLoop'\)/);
 assert.match(loja,/if\(visitante\|\|operadorAtivo\|\|!csrfLoja\)return/);
 assert.match(loja,/if\(\(visitante&&!operadorAtivo\)\|\|\(operadorAtivo&&visaoClienteLoja\)\)return/);
});
test('navegação entre LOOP e AKITEMM preserva a visão sem conceder poder ao cliente',()=>{
 assert.match(loop,/\/loja\?visao=/);
 assert.match(loop,/modoOperadorAtual\?'operador':'cliente'/);
 assert.match(loja,/\/escritorio\?visao=/);
 assert.match(loja,/visaoClienteLoja\?'cliente':'operador'/);
 assert.match(loja,/voltarLoop\.href=permitido\?/); // depende da sessão de operador
});
