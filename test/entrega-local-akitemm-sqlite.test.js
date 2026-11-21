'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {EntregaLocalAkitemmSQLite}=
 require('../src/producao/entrega-local-akitemm-sqlite');
const {localizarCepBrasil}=require('../src/producao/consulta-cep-brasil');
const {AvaliacoesProdutoAkitemmSQLite}=
 require('../src/producao/avaliacoes-produto-akitemm-sqlite');
function banco(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 db.exec([
  'CREATE TABLE loja_real_produtos(produto_id TEXT PRIMARY KEY,',
  'titulo TEXT NOT NULL);',
  "INSERT INTO loja_real_produtos VALUES('tenis','Tênis');",
  "INSERT INTO loja_real_produtos VALUES('camisa','Camisa');"
 ].join(' '));
 return db;
}
test('operador configura entrega por municípios, taxa só aparece após CEP',()=>{
 const db=banco();
 try{
  const m=new EntregaLocalAkitemmSQLite({banco:db});
  assert.equal(m.consultar('tenis').modo,'NACIONAL');
  let x=m.configurar({produtoId:'tenis',modo:'MUNICIPIOS',uf:'RJ',
   municipios:['Volta Redonda','Barra Mansa','Piraí'],
   taxaCentavos:3000,revisaoEsperada:0});
  assert.equal(x.revisao,1);
  const v=m.validarCidade({produtoId:'tenis',uf:'RJ',cidade:'VOLTA REDONDA'});
  assert.equal(v.permitido,true);
  assert.equal(v.taxaCentavos,3000);
  assert.equal(m.validarCidade({
   produtoId:'tenis',uf:'SP',cidade:'Volta Redonda'}).permitido,false);
  assert.equal(m.validarCidade({
   produtoId:'tenis',uf:'RJ',cidade:'Pirai'}).permitido,true);
  const misto=m.validarCarrinho({
   produtos:['tenis','camisa'],uf:'RJ',cidade:'Barra Mansa'});
  assert.equal(misto.entregaDisponivel,true);
  assert.equal(misto.taxaEntregaPropriaCentavos,3000);
  assert.equal(misto.requerOutraCotacao,true);
  assert.equal(misto.checkoutReal,false);
  assert.equal(misto.autorizaCobranca,false);
  const fora=m.validarCarrinho({
   produtos:['tenis','camisa'],uf:'RJ',cidade:'Resende'});
  assert.equal(fora.entregaDisponivel,false);
  assert.deepEqual(fora.produtosForaDaRegiao,['tenis']);
  assert.equal(fora.taxaEntregaPropriaCentavos,null);
  assert.throws(()=>m.configurar({produtoId:'tenis',modo:'MUNICIPIOS',
   uf:'RJ',municipios:['Volta Redonda'],taxaCentavos:5000,
   revisaoEsperada:0}),/ENTREGA_REVISAO_CONCORRENTE/);
  assert.equal(new EntregaLocalAkitemmSQLite({banco:db}).consultar('tenis').taxaCentavos,3000);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{db.close();}
});
test('CEP vem de fonte fixa e a cidade não pode ser fabricada pelo navegador',async()=>{
 const calls=[];
 const resolver=async(url,options)=>{
  calls.push({url,method:options.method,redirect:options.redirect});
  return {ok:true,headers:{get:()=> 'application/json'},
   json:async()=>({cep:'27213-000',uf:'RJ',localidade:'Volta Redonda'})};
 };
 const cidade=await localizarCepBrasil('27213-000',{consulta:resolver});
 assert.deepEqual(cidade,{uf:'RJ',cidade:'Volta Redonda'});
 assert.equal(calls[0].url,'https://viacep.com.br/ws/27213000/json/');
 assert.equal(calls[0].method,'GET');
 assert.equal(calls[0].redirect,'error');
 await assert.rejects(localizarCepBrasil('http://127.0.0.1',{consulta:resolver}),
  /ENTREGA_CEP_INVALIDO/);
 await assert.rejects(localizarCepBrasil('27213000',{consulta:async()=>({
  ok:true,headers:{get:()=> 'application/json'},
  json:async()=>({cep:'20000-000',uf:'RJ',localidade:'Volta Redonda'})
 })}),/ENTREGA_CEP_NAO_LOCALIZADO/);
});
test('avaliações são vazias até existir compra verificada visível',()=>{
 const db=banco();
 try{
  const avaliacoes=new AvaliacoesProdutoAkitemmSQLite({banco:db});
  assert.equal(avaliacoes.listar({produtoId:'tenis'}).total,0);
  assert.deepEqual(avaliacoes.listar({produtoId:'tenis'}).avaliacoes,[]);
  db.prepare([
   'INSERT INTO loja_real_avaliacoes_verificadas',
   '(id,produto_id,pedido_id,nome_exibicao,nota,comentario,',
   'publicado_em,verificada,visivel) VALUES(?,?,?,?,?,?,?,?,?)'
  ].join(' ')).run('av1','tenis','pedido-123','Cliente',5,
   'Tênis chegou em bom estado',1700000000000,1,0);
  assert.equal(avaliacoes.listar({produtoId:'tenis'}).total,0);
  db.prepare('UPDATE loja_real_avaliacoes_verificadas SET visivel=1 WHERE id=?')
   .run('av1');
  const p=avaliacoes.listar({produtoId:'tenis'});
  assert.equal(p.total,1);
  assert.equal(p.avaliacoes[0].compraVerificada,true);
  assert.equal(p.avaliacoes[0].nota,5);
  assert.equal(avaliacoes.listar({produtoId:'camisa'}).total,0);
 }finally{db.close();}
});
