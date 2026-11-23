'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const {criarRelatorioClientesProdutosOperador}=
 require('../src/producao/relatorio-clientes-produtos-operador');
function preparar(t,{semFotografias=false}={}){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec([
  'CREATE TABLE loop_real_contas(id TEXT PRIMARY KEY,nick TEXT NOT NULL COLLATE NOCASE)',
  'CREATE TABLE loja_real_pedidos(pedido_id TEXT PRIMARY KEY,titular_id TEXT NOT NULL,status TEXT NOT NULL,pagamento_id TEXT,criado_em INTEGER NOT NULL)',
  'CREATE TABLE loja_real_custos_pedido(pedido_id TEXT,fornecedor_id TEXT,sku TEXT,produto_id TEXT,quantidade INTEGER,preco_unit_centavos INTEGER)',
  'CREATE TABLE loja_real_produtos(produto_id TEXT PRIMARY KEY,titulo TEXT)',
  ...(semFotografias?[]:[
   'CREATE TABLE loop_real_fotos_regras_pedido(pedido_id TEXT,fornecedor_id TEXT,sku TEXT,cor TEXT)'
  ])
 ].join(';')+';');
 db.prepare('INSERT INTO loop_real_contas VALUES (?,?)').run('titular-a','alpha');
 db.prepare('INSERT INTO loop_real_contas VALUES (?,?)').run('titular-b','beta');
 for(const [id,titular,status,pagamento,tempo] of [
  ['aprovado','titular-a','APROVADO_PARA_EXPEDICAO','psp-111',1000],
  ['pendente','titular-a','AGUARDANDO_PAGAMENTO',null,2000],
  ['cancelado','titular-a','CANCELADO',null,3000],
  ['outra','titular-b','APROVADO_PARA_EXPEDICAO','psp-222',4000]
 ]) db.prepare('INSERT INTO loja_real_pedidos VALUES(?,?,?,?,?)')
  .run(id,titular,status,pagamento,tempo);
 for(const [id,sku,pid,q,cor] of [
  ['aprovado','camiseta','CAMISETA',2,'CINZA'],
  ['aprovado','curso','CURSO',1,'VERDE'],
  ['pendente','meia','MEIA',3,'CINZA'],
  ['pendente','kit','KIT',4,'DOURADO'],
  ['cancelado','camiseta','CAMISETA',5,'CINZA'],
  ['outra','camiseta','CAMISETA',7,'CINZA']
 ]){
  db.prepare('INSERT INTO loja_real_custos_pedido VALUES (?,?,?,?,?,?)')
   .run(id,'fornecedor',sku,pid,q,25000);
  if(!semFotografias)db.prepare(
   'INSERT INTO loop_real_fotos_regras_pedido VALUES (?,?,?,?)'
  ).run(id,'fornecedor',sku,cor);
 }
 for(const pid of ['CAMISETA','CURSO','MEIA','KIT'])
  db.prepare('INSERT INTO loja_real_produtos VALUES (?,?)').run(pid,pid);
 return db;
}
test('duas contagens distintas e avulsas baseadas na cor fotografada da venda',t=>{
 const db=preparar(t),r=criarRelatorioClientesProdutosOperador({banco:db});
 const x=r.comprasDoCadastro({nick:'alpha'});
 assert.equal(x.totalUnidadesCompradas,10); // 3 aprovadas + 7 pendentes
 assert.equal(x.totalUnidadesAprovadas,3);
 assert.equal(x.totalUnidadesPendentes,7);
 assert.equal(x.totalUnidades,3); // legado ainda representa aprovadas
 assert.equal(x.totalUnidadesAvulsas,5); // 2 aprovadas + 3 pendentes cinza
 assert.equal(x.totalLinhasAvulsas,2);
 assert.equal(x.classificacaoAvulsasDisponivel,true);
 const a=r.comprasAvulsasDoCadastro({nick:'alpha'});
 assert.equal(a.somenteLeitura,true);
 assert.equal(a.criterioAvulsa,'ITEM_CINZA_FOTOGRAFADO_NO_PEDIDO');
 assert.deepEqual(a.itens.map(i=>[i.pedidoId,i.quantidade,i.statusPagamento]),[
  ['pendente',3,'AGUARDANDO_PAGAMENTO'],
  ['aprovado',2,'APROVADO_PARA_EXPEDICAO']
 ]);
 assert.equal(a.itens[1].pagamentoId,'psp-111');
 assert.equal(a.itens[1].formaPagamento,null,
  'nao inventar Pix ou cartao a partir da referencia PSP');
 assert.ok(a.itens.every(i=>i.cor==='CINZA'));
 assert.equal(r.comprasAvulsasDoCadastro({nick:'beta'}).totalUnidadesAvulsas,7);
 assert.equal(r.comprasAvulsasDoCadastro({nick:'alpha',limite:1}).temMais,true);
 assert.equal(r.comprasAvulsasDoCadastro({nick:'alpha',limite:1,offset:1})
  .itens[0].pedidoId,'aprovado');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM loja_real_pedidos').get().n,4);
});
test('sem foto imutavel nao classifica compras antigas como avulsas inventadas',t=>{
 const db=preparar(t,{semFotografias:true});
 const r=criarRelatorioClientesProdutosOperador({banco:db});
 const x=r.comprasDoCadastro({nick:'alpha'});
 assert.equal(x.totalUnidadesCompradas,10);
 assert.equal(x.classificacaoAvulsasDisponivel,false);
 assert.equal(x.totalUnidadesAvulsas,null);
 const a=r.comprasAvulsasDoCadastro({nick:'alpha'});
 assert.equal(a.classificacaoAvulsasDisponivel,false);
 assert.equal(a.itens.length,0);
});
test('duas colunas, divisoria responsiva e rota somente do operador',()=>{
 const ui=fs.readFileSync('src/producao/interface-aprovada-contas.js','utf8');
 const css=fs.readFileSync('src/producao/acabamento-botoes-real.css','utf8');
 const gateway=fs.readFileSync('src/producao/gateway-admin-comercial.js','utf8');
 assert.match(ui,/id="adminResumoUnidadesCliente"/);
 assert.match(ui,/id="adminAvulsasResumo"/);
 assert.match(ui,/id="adminVerAvulsasCliente"/);
 assert.match(ui,/id="adminAvulsasClienteLista"/);
 assert.match(ui,/function carregarAvulsasCadastro\(nick,\{mais=false\}/);
 assert.match(ui,/document\.createElement\('details'\)/);
 assert.match(ui,/Unidades compradas: /);
 assert.match(ui,/Unidades aprovadas: /);
 assert.match(ui,/Forma de pagamento: /);
 assert.match(css,/body\.loop03-modo-operador #adminComprasCliente \.loop03-compras-colunas/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/body:not\\(\\.loop03-modo-operador\\) \\.loop03-admin-section/);
 assert.match(gateway,/app\.get\('\/api\/admin\/contas\/compras-avulsas',proteger/);
 assert.doesNotMatch(gateway,/app\.get\('\/api\/contas\/compras-avulsas'/);
 assert.doesNotMatch(gateway,/app\.post\('\/api\/admin\/contas\/compras-avulsas'/);
});
