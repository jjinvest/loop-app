'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const path=require('node:path');
const {criarRelatorioClientesProdutosOperador}=
 require('../src/producao/relatorio-clientes-produtos-operador');

function montar(t,{somenteContas=false}={}){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec([
  'CREATE TABLE loop_real_contas (id TEXT PRIMARY KEY,nick TEXT NOT NULL COLLATE NOCASE)',
  ...(somenteContas?[]:[
   'CREATE TABLE loja_real_pedidos (pedido_id TEXT PRIMARY KEY,titular_id TEXT NOT NULL,status TEXT NOT NULL,pagamento_id TEXT,criado_em INTEGER NOT NULL)',
   'CREATE TABLE loja_real_custos_pedido (pedido_id TEXT NOT NULL,fornecedor_id TEXT NOT NULL,sku TEXT NOT NULL,produto_id TEXT,quantidade INTEGER NOT NULL,preco_unit_centavos INTEGER NOT NULL)',
   'CREATE TABLE loja_real_produtos (produto_id TEXT PRIMARY KEY,titulo TEXT NOT NULL)'
  ])
 ].join(';')+';');
 const contas=db.prepare('INSERT INTO loop_real_contas VALUES (?,?)');
 contas.run('titular-a','alpha');contas.run('titular-b','beta');
 contas.run('titular-c','gamma');
 if(!somenteContas){
  const produto=db.prepare('INSERT INTO loja_real_produtos VALUES (?,?)');
  produto.run('CAMISETA','Camiseta especial');
  produto.run('CURSO','Curso digital');
  const pedidos=db.prepare('INSERT INTO loja_real_pedidos VALUES (?,?,?,?,?)');
  pedidos.run('pedido-1','titular-a','APROVADO_PARA_EXPEDICAO','psp-1',1000);
  pedidos.run('pedido-2','titular-b','APROVADO_PARA_EXPEDICAO','psp-2',2000);
  pedidos.run('pedido-pendente','titular-a','AGUARDANDO_PAGAMENTO',null,3000);
  pedidos.run('pedido-cancelado','titular-c','CANCELADO',null,4000);
  const linha=db.prepare('INSERT INTO loja_real_custos_pedido VALUES (?,?,?,?,?,?)');
  linha.run('pedido-1','fornecedor-1','sku-a','CAMISETA',2,3900);
  linha.run('pedido-1','fornecedor-2','sku-b','CURSO',1,25000);
  linha.run('pedido-2','fornecedor-1','sku-a','CAMISETA',3,3900);
  linha.run('pedido-pendente','fornecedor-1','sku-a','CAMISETA',20,3900);
  linha.run('pedido-cancelado','fornecedor-1','sku-a','CAMISETA',40,3900);
 }
 return db;
}
test('um cadastro e um cliente; vendas somam unidades aprovadas, nunca posições ou pedidos pendentes',t=>{
 const banco=montar(t),relatorio=criarRelatorioClientesProdutosOperador({banco});
 const d=relatorio.indicadores();
 assert.deepEqual({
  clientes:d.totalClientes,unidades:d.totalProdutosVendidos,
  pedidos:d.totalPedidosAprovados,compradores:d.totalClientesCompradores
 },{clientes:3,unidades:6,pedidos:2,compradores:2});
 assert.equal(d.registroComercialDisponivel,true);
 assert.equal(d.contabilizaPosicoesComoProduto,false);
 assert.equal(d.somenteLeitura,true);
 const alpha=relatorio.comprasDoCadastro({nick:'ALPHA'});
 assert.equal(alpha.totalUnidades,3);
 assert.equal(alpha.totalLinhas,2);
 assert.equal(alpha.itens.length,2);
 assert.deepEqual(alpha.itens.map(x=>x.titulo),['Camiseta especial','Curso digital']);
 assert.ok(alpha.itens.every(x=>x.pedidoId==='pedido-1'));
 assert.equal(relatorio.comprasDoCadastro({nick:'gamma'}).totalUnidades,0);
 assert.equal(relatorio.comprasDoCadastro({nick:'beta',limite:1}).totalUnidades,3);
 assert.deepEqual(relatorio.comprasDoCadastro({nick:'alpha',limite:1,offset:1})
  .itens.map(x=>x.sku),['sku-b']);
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM loja_real_pedidos').get().n,4);
});
test('sem livro comercial mantém clientes reais e não inventa zero produtos vendidos',t=>{
 const banco=montar(t,{somenteContas:true});
 const relatorio=criarRelatorioClientesProdutosOperador({banco});
 const d=relatorio.indicadores();
 assert.equal(d.totalClientes,3);
 assert.equal(d.totalProdutosVendidos,null);
 assert.equal(d.registroComercialDisponivel,false);
 assert.throws(()=>relatorio.comprasDoCadastro({nick:'alpha'}),
  {codigo:'RELATORIO_COMERCIAL_FONTE_INDISPONIVEL'});
});
test('catálogo ausente não apaga produto já vendido: fallback usa SKU gravado no pedido',t=>{
 const banco=montar(t);
 banco.exec('DROP TABLE loja_real_produtos;');
 const relatorio=criarRelatorioClientesProdutosOperador({banco});
 assert.equal(relatorio.indicadores().totalProdutosVendidos,6);
 const d=relatorio.comprasDoCadastro({nick:'alpha'});
 assert.equal(d.totalUnidades,3);
 assert.equal(d.itens[0].titulo,null);
 assert.ok(d.itens[0].sku);
});
test('a consulta detecta registro comercial incompleto e não converte dado inconsistente em zero',t=>{
 const db=montar(t);
 db.prepare("INSERT INTO loja_real_pedidos VALUES (?,?,?,?,?)").run(
  'pedido-sem-linhas','titular-a','APROVADO_PARA_EXPEDICAO','psp-3',5000);
 const relatorio=criarRelatorioClientesProdutosOperador({banco:db});
 assert.throws(()=>relatorio.indicadores(),
  {codigo:'RELATORIO_COMERCIAL_PEDIDO_INCOMPLETO'});
});
test('somente operador recebe novas rotas, sem acesso público e sem alterar o motor',()=>{
 const gateway=fs.readFileSync(path.join(__dirname,
  '../src/producao/gateway-admin-comercial.js'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,
  '../src/producao/interface-aprovada-contas.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,
  '../src/producao/acabamento-botoes-real.css'),'utf8');
 assert.match(gateway,/app\.get\('\/api\/admin\/loop\/indicadores-comerciais',proteger/);
 assert.match(gateway,/app\.get\('\/api\/admin\/contas\/compras',proteger/);
 assert.match(gateway,/relatorioComercial\.comprasDoCadastro\(/);
 assert.match(ui,/id="adminResumoComercial"/);
 assert.match(ui,/id="adminComprasCliente"/);
 assert.match(ui,/id="adminMaisComprasCliente"/);
 assert.match(ui,/carregarIndicadoresComerciaisOperador\(/);
 assert.match(ui,/id==='abaPosicoes'\)void carregarIndicadoresComerciaisOperador\(\)/);
 assert.match(ui,/void carregarComprasCadastro\(x\.nick\)/);
 assert.match(css,/body\.loop03-modo-operador #adminResumoComercial/);
 assert.doesNotMatch(gateway,/app\.post\('\/api\/admin\/loop\/indicadores-comerciais'/);
 assert.doesNotMatch(gateway,/app\.post\('\/api\/admin\/contas\/compras'/);
 const identidade=fs.readFileSync(path.join(__dirname,
  '../src/producao/servidor-identidade-loop.js'),'utf8');
 const chamada=identidade.slice(
  identidade.indexOf('montarGatewayAdminComercial(app,'),
  identidade.indexOf('const mutation=(req,res,next)=>')
 );
 assert.doesNotMatch(chamada,/\bpedidosComerciais\b/,
  'o histórico de leitura não deve ser passado como contabilidade de escrita');
});
test('consulta lenta não remove cartões, não pisca texto e não duplica requisição',async()=>{
 const vm=require('node:vm');
 const ui=fs.readFileSync(path.join(__dirname,'../src/producao/interface-aprovada-contas.js'),'utf8');
 const trecho=ui.slice(ui.indexOf(' function mostrarResumoComercialOperador('),ui.indexOf(' // O quadro geral e a ficha privada'));
 class No{
  constructor(){this.children=[];this.dataset={};this.attrs={};this.text='';}
  set textContent(v){this.text=v;this.children=[];}
  get textContent(){return this.text;}
  append(...n){this.children.push(...n);}
  replaceChildren(...n){this.children=n;}
  querySelectorAll(){return this.children;}
  setAttribute(k,v){this.attrs[k]=v;}
 }
 const alvo=new No();let n=0,soltar;
 const dados={fonte:'SQLITE_COMERCIAL_REAL',totalClientes:2,totalProdutosVendidos:0};
 const resposta=d=>({ok:true,json:async()=>d});
 const ctx={modoOperadorAtual:true,$:()=>alvo,document:{createElement:()=>new No()},
  fetch:async()=>{n++;return n===2?new Promise(r=>{soltar=r;}):resposta(dados);},Number,JSON};
 vm.runInNewContext(trecho+';this.atualizar=carregarIndicadoresComerciaisOperador;',ctx);
 await ctx.atualizar();const cards=[...alvo.children];
 const pendente=ctx.atualizar();
 assert.equal(alvo.children[0],cards[0],'cartão continua visível durante HTTP pendente');
 assert.equal(alvo.textContent,'','nenhuma frase transitória é colocada no resumo');
 await ctx.atualizar();assert.equal(n,2,'consulta sobreposta é ignorada');
 soltar(resposta(dados));await pendente;
 assert.equal(alvo.children[0],cards[0],'mesmos dados preservam o nó e o layout');
 ctx.fetch=async()=>resposta({...dados,totalProdutosVendidos:1});await ctx.atualizar();
 assert.notEqual(alvo.children[0],cards[0],'dado alterado é representado');
 assert.equal(alvo.attrs['aria-busy'],'false');
});
