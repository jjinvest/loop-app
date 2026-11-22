'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {RascunhosCadastroAkitemmSQLite,CHAVES}=
 require('../src/producao/rascunhos-cadastro-akitemm-sqlite');
const {AnunciosManuaisAkitemmSQLite}=
 require('../src/producao/anuncios-manuais-akitemm-sqlite');
function dados(overrides={}){
 const a=Object.fromEntries(CHAVES.map(x=>[x,'']));
 return {...a,titulo:'',corDescricao:'azul e branco, colorido',
  precoNormal:'350',precoPromocional:'197,90',origem:'PROPRIO',
  entregaModo:'NACIONAL',classificacao:'VERDE',...overrides};
}
test('formulário incompleto vai ao banco real, volta inteiro após reiniciar',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const r=new RascunhosCadastroAkitemmSQLite({banco:db});
  const criado=r.salvar({campos:dados()});
  assert.equal(criado.publicado,false);
  assert.equal(criado.imagemSalva,false);
  assert.match(criado.id,/^[0-9a-f-]{36}$/);
  assert.equal(criado.revisao,1);
  const reiniciado=new RascunhosCadastroAkitemmSQLite({banco:db});
  assert.equal(reiniciado.listar()[0].campos.corDescricao,
   'azul e branco, colorido');
  assert.equal(reiniciado.listar()[0].campos.titulo,'');
  const atualizado=reiniciado.salvar({
   id:criado.id,revisaoEsperada:1,
   campos:dados({titulo:'Camiseta colorida',precoNormal:'349,99'})
  });
  assert.equal(atualizado.revisao,2);
  assert.equal(r.listar()[0].campos.titulo,'Camiseta colorida');
  assert.equal(r.listar()[0].campos.precoNormal,'349,99');
  assert.throws(()=>r.salvar({id:criado.id,revisaoEsperada:1,
   campos:dados()}),/RASCUNHO_REVISAO_CONCORRENTE/);
  assert.equal(r.excluir(criado.id).excluido,true);
  assert.deepEqual(r.listar(),[]);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{db.close();}
});
test('rascunho rejeita chaves inesperadas e não publica produto',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const r=new RascunhosCadastroAkitemmSQLite({banco:db});
  assert.throws(()=>r.salvar({campos:{...dados(),checkout:true}}),
   /RASCUNHO_CAMPOS_INVALIDOS/);
  assert.throws(()=>r.salvar({campos:dados({
   descricao:'A'.repeat(2001)})}),/RASCUNHO_CAMPO_INVALIDO_descricao/);
  r.salvar({campos:dados({titulo:'Sem foto'})});
  assert.equal(db.prepare(
   "SELECT COUNT(*) AS total FROM sqlite_master WHERE name='loja_real_produtos'"
  ).get().total,0);
 }finally{db.close();}
});
test('cor física livre não substitui a classificação comercial do LOOP',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE loja_real_produtos('+
   'produto_id TEXT PRIMARY KEY);'+
   "INSERT INTO loja_real_produtos VALUES('roupa-1')");
  const anuncio=new AnunciosManuaisAkitemmSQLite({banco:db});
  const dadosSalvos=anuncio.atualizar({
   produtoId:'roupa-1',origem:'PROPRIO',categoria:'Roupa',
   marca:'',corDescricao:'Várias cores, azul + branco, estampado',
   precoCentavos:35000,promocaoCentavos:19790,quantidade:5,
   revisaoEsperada:0
  });
  assert.equal(dadosSalvos.corDescricao,'Várias cores, azul + branco, estampado');
  assert.equal(anuncio.projetar([{produtoId:'roupa-1'}])[0].corDescricao,
   'Várias cores, azul + branco, estampado');
  assert.equal(anuncio.projetar([{produtoId:'roupa-1'}])[0].ofertaAtiva,true);
  assert.equal(anuncio.projetar([{produtoId:'roupa-1'}])[0].checkoutReal,false);
 }finally{db.close();}
});
