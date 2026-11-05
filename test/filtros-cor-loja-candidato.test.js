'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const raiz=path.join(__dirname,'../src/laboratorio');
const html=fs.readFileSync(path.join(raiz,'loja-cliente-demo.html'),'utf8');
const js=fs.readFileSync(path.join(raiz,'loja-cliente-demo.js'),'utf8');
function faixa(inicio,fim){
 const a=js.indexOf(inicio),b=js.indexOf(fim,a+inicio.length);
 assert.ok(a>=0&&b>a,'Trecho da loja nao encontrado: '+inicio);
 return js.slice(a,b);
}
function executar(){
 const botoes=['CINZA','VERDE','EVENTO'].map(cor=>({
  dataset:{akitemmCor:cor},attributes:{},classList:{
   toggle(classe,ativo){assert.equal(classe,'selecionado');this.ativo=ativo;}
  },
  setAttribute(nome,valor){this.attributes[nome]=valor;}
 }));
 const produtos=[
  {produtoId:'normal',classeVisual:'CINZA',nome:'Curso cinza',tipo:'PDF',descricao:'Básico',detalhes:[]},
  {produtoId:'verde',classeVisual:'VERDE',nome:'Curso verde',tipo:'PDF',descricao:'Qualificado',detalhes:[]},
  {produtoId:'evento',classeVisual:'EVENTO',elegivelLoop:true,nome:'Curso evento',tipo:'PDF',descricao:'Especial',detalhes:[]}
 ];
 const contexto={
  document:{querySelectorAll:seletor=>{
   assert.equal(seletor,'[data-akitemm-cor]');return botoes;
  }},
  catalogo:produtos,
  el:id=>{assert.equal(id,'akitemmBusca');return {value:''};},
  configLoja:null,mostradas:0,mostrarCatalogo(){this.mostradas++;},
 };
 const codigo=[
  "let corFiltro=null,filtro='todos',quantidadeVitrine=99;",
  faixa('function corDoProduto(p){','function fotoDo(p){'),
  faixa('function produtosFiltrados(){','function escolherFiltro(novo){'),
  '({corDoProduto,escolherCor,produtosFiltrados,consultarFiltro:()=>corFiltro})'
 ].join('\n');
 const funcoes=vm.runInNewContext(codigo,contexto);
 return {...funcoes,botoes,produtos,contexto};
}
test('os tres quadradinhos permanecem na loja com nome e estado de selecao',()=>{
 assert.equal((html.match(/data-akitemm-cor="(?:CINZA|VERDE|EVENTO)"/g)||[]).length,3);
 assert.match(html,/role="group" aria-label="Filtrar produtos por cor"/);
 for(const nome of ['CINZA','VERDE','EVENTO'])
  assert.match(html,new RegExp('data-akitemm-cor="'+nome+'" aria-pressed="false"'));
});
test('clicar nas cores filtra a vitrine, alterna selecao e desmarca quando repetir',()=>{
 const l=executar();
 assert.deepEqual(Array.from(l.produtosFiltrados(),p=>p.produtoId),['normal','verde','evento']);
 assert.equal(l.corDoProduto(l.produtos[2]),'EVENTO');
 l.escolherCor('CINZA');
 assert.deepEqual(Array.from(l.produtosFiltrados(),p=>p.produtoId),['normal']);
 assert.equal(l.botoes[0].attributes['aria-pressed'],'true');
 l.escolherCor('VERDE');
 assert.deepEqual(Array.from(l.produtosFiltrados(),p=>p.produtoId),['verde']);
 assert.equal(l.botoes[0].attributes['aria-pressed'],'false');
 assert.equal(l.botoes[1].attributes['aria-pressed'],'true');
 l.escolherCor('EVENTO');
 assert.deepEqual(Array.from(l.produtosFiltrados(),p=>p.produtoId),['evento']);
 assert.equal(l.botoes[2].attributes['aria-pressed'],'true');
 l.escolherCor('EVENTO');
 assert.equal(l.consultarFiltro(),null);
 assert.equal(l.produtosFiltrados().length,3);
 assert.equal(l.botoes[2].attributes['aria-pressed'],'false');
});
test('a cor do evento tem prioridade sobre verde e nao representa pagamento ou posicao',()=>{
 const l=executar();
 assert.equal(l.corDoProduto({classeVisual:'EVENTO',elegivelLoop:true}),'EVENTO');
 assert.equal(l.corDoProduto({classeVisual:'VERDE',elegivelLoop:true}),'VERDE');
 assert.equal(l.corDoProduto({classeVisual:'CINZA',elegivelLoop:true}),'CINZA');
 assert.doesNotMatch(faixa('function corDoProduto(p){','function fotoDo(p){'),
  /posicoesCriadas|saldoReal|registrarPedido/);
});
