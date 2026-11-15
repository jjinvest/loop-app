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
 const controle=(dataset={})=>({
  dataset,attributes:{},classes:new Set(),
  classList:{
   toggle(classe,ativo){if(ativo)this.classes?.add(classe);else this.classes?.delete(classe);},
  },
  setAttribute(nome,valor){this.attributes[nome]=valor;}
 });
 function botao(dataset){
  const item=controle(dataset);
  item.classList={toggle(classe,ativo){if(ativo)item.classes.add(classe);else item.classes.delete(classe);}};
  return item;
 }
 const botoes=['CINZA','VERDE','DOURADO','ROXO'].map(cor=>
  botao({akitemmCor:cor}));
 const categorias=['cursos','fisicos','novidades','mais-vendidos']
  .map(categoria=>botao({akitemmCategoria:categoria}));
 const elementos={
  akitemmBusca:{value:''},
  akitemmFiltroTodos:botao(),
  akitemmFiltroOfertas:botao(),
  tituloCatalogoLoja:{textContent:''}
 };
 const produtos=[
  {produtoId:'normal',classeVisual:'CINZA',nome:'Curso cinza',tipo:'PDF',descricao:'Básico',detalhes:[]},
  {produtoId:'verde',classeVisual:'VERDE',nome:'Curso verde',tipo:'PDF',descricao:'Qualificado',detalhes:[]},
  {produtoId:'dourado',classeVisual:'DOURADO',elegivelLoop:true,nome:'Curso integral',tipo:'PDF',descricao:'Integral',detalhes:[]},
  {produtoId:'evento',classeVisual:'ROXO',elegivelLoop:false,nome:'Evento carro',tipo:'FISICO',descricao:'Especial',detalhes:[]}
 ];
 const contexto={
  document:{querySelectorAll:seletor=>{
   if(seletor==='[data-akitemm-cor]')return botoes;
   if(seletor==='[data-akitemm-categoria]')return categorias;
   throw Error('Seletor desconhecido: '+seletor);
  }},
  catalogo:produtos,el:id=>elementos[id],
  configLoja:{ofertas:['verde']},
  mostrarCatalogo(){},fecharDetalhes(){},
  tamanhoPaginaVitrine(){return 4}
 };
 const codigo=[
  "let corFiltro=null,filtro='todos',quantidadeVitrine=99;",
  faixa('function corDoProduto(p){','function fotoDo(p){'),
  faixa('function produtosFiltrados(){',
   'function escolherFiltro(novo,{preservarBusca=false}={}){'),
  faixa('function escolherFiltro(novo,{preservarBusca=false}={}){',
   'function filtradoNovidadePublicada(){'),
  '({corDoProduto,escolherCor,escolherFiltro,produtosFiltrados,'+
   'consultarFiltro:()=>corFiltro,consultarPrincipal:()=>filtro})'
 ].join('\n');
 const funcoes=vm.runInNewContext(codigo,contexto);
 return {...funcoes,botoes,categorias,produtos,contexto,elementos};
}

test('os quatro quadradinhos permanecem na loja com nome e estado de selecao',()=>{
 assert.equal((html.match(/data-akitemm-cor="(?:CINZA|VERDE|DOURADO|ROXO)"/g)||[]).length,4);
 assert.match(html,/role="group" aria-label="Filtrar produtos por cor"/);
 for(const nome of ['CINZA','VERDE','DOURADO','ROXO'])
  assert.match(html,new RegExp('data-akitemm-cor="'+nome+'" aria-pressed="false"'));
});
test('clicar nas cores filtra a vitrine, alterna selecao e desmarca quando repetir',()=>{
 const l=executar();
 assert.deepEqual(Array.from(l.produtosFiltrados(),p=>p.produtoId),['normal','verde','dourado','evento']);
 assert.equal(l.corDoProduto(l.produtos[3]),'ROXO');
 assert.equal(l.corDoProduto(l.produtos[2]),'DOURADO');
 l.escolherCor('CINZA');
 assert.deepEqual(Array.from(l.produtosFiltrados(),p=>p.produtoId),['normal']);
 assert.equal(l.botoes[0].attributes['aria-pressed'],'true');
 l.escolherCor('VERDE');
 assert.deepEqual(Array.from(l.produtosFiltrados(),p=>p.produtoId),['verde']);
 assert.equal(l.botoes[0].attributes['aria-pressed'],'false');
 assert.equal(l.botoes[1].attributes['aria-pressed'],'true');
 l.escolherCor('DOURADO');
 assert.deepEqual(Array.from(l.produtosFiltrados(),p=>p.produtoId),['dourado']);
 assert.equal(l.botoes[2].attributes['aria-pressed'],'true');
 l.escolherCor('ROXO');
 assert.deepEqual(Array.from(l.produtosFiltrados(),p=>p.produtoId),['evento']);
 assert.equal(l.botoes[3].attributes['aria-pressed'],'true');
 assert.equal(l.botoes[2].attributes['aria-pressed'],'false');
 l.escolherCor('ROXO');
 assert.equal(l.consultarFiltro(),null);
 assert.equal(l.produtosFiltrados().length,4);
 assert.equal(l.botoes[3].attributes['aria-pressed'],'false');
});
test('Todos e Ofertas são exclusivos, reagem ao toque e removem filtros antigos',()=>{
 const l=executar();
 l.escolherCor('ROXO');
 assert.equal(l.elementos.akitemmFiltroTodos.attributes['aria-pressed'],'false');
 assert.equal(l.elementos.tituloCatalogoLoja.textContent,'Quadrinhos roxos');
 l.escolherFiltro('ofertas');
 assert.equal(l.consultarFiltro(),null);
 assert.equal(l.consultarPrincipal(),'ofertas');
 assert.equal(l.elementos.akitemmFiltroOfertas.attributes['aria-pressed'],'true');
 assert.equal(l.elementos.akitemmFiltroTodos.attributes['aria-pressed'],'false');
 assert.deepEqual(Array.from(l.produtosFiltrados(),p=>p.produtoId),['verde']);
 l.elementos.akitemmBusca.value='procurar';
 l.escolherFiltro('todos');
 assert.equal(l.elementos.akitemmBusca.value,'');
 assert.equal(l.elementos.akitemmFiltroTodos.attributes['aria-pressed'],'true');
 assert.equal(l.elementos.akitemmFiltroOfertas.attributes['aria-pressed'],'false');
 assert.equal(l.produtosFiltrados().length,4);
 l.escolherFiltro('cursos');
 l.elementos.akitemmBusca.value='verde';
 l.escolherCor('DOURADO');
 assert.equal(l.consultarPrincipal(),'todos');
 assert.equal(l.elementos.akitemmBusca.value,'');
 assert.equal(l.categorias[0].attributes['aria-pressed'],'false');
 assert.deepEqual(Array.from(l.produtosFiltrados(),p=>p.produtoId),['dourado']);
});
test('busca digitada é preservada ao resetar para Todos',()=>{
 const l=executar();
 l.elementos.akitemmBusca.value='integral';
 l.escolherFiltro('todos',{preservarBusca:true});
 assert.equal(l.elementos.akitemmBusca.value,'integral');
 assert.deepEqual(Array.from(l.produtosFiltrados(),p=>p.produtoId),['dourado']);
});
test('a cor do evento tem prioridade sobre verde e nao representa pagamento ou posicao',()=>{
 const l=executar();
 assert.equal(l.corDoProduto({classeVisual:'ROXO',elegivelLoop:true}),'ROXO');
 assert.equal(l.corDoProduto({classeVisual:'DOURADO',elegivelLoop:true}),'DOURADO');
 assert.equal(l.corDoProduto({classeVisual:'VERDE',elegivelLoop:true}),'VERDE');
 assert.equal(l.corDoProduto({classeVisual:'CINZA',elegivelLoop:true}),'CINZA');
 assert.doesNotMatch(faixa('function corDoProduto(p){','function fotoDo(p){'),
  /posicoesCriadas|saldoReal|registrarPedido/);
});
