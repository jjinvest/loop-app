'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {AnunciosManuaisAkitemmSQLite}=
 require('../src/producao/anuncios-manuais-akitemm-sqlite');

function preparar(){
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 banco.exec([
  'CREATE TABLE loja_real_produtos(',
  'produto_id TEXT PRIMARY KEY,titulo TEXT NOT NULL);',
  "INSERT INTO loja_real_produtos VALUES('tenis-proprio','Tenis proprio');"
 ].join(' '));
 return banco;
}
test('operador informa preco normal e promocional, persiste e cliente apenas ve etiqueta',()=>{
 const banco=preparar();
 try{
  const anuncios=new AnunciosManuaisAkitemmSQLite({banco});
  assert.equal(anuncios.consultar('tenis-proprio').revisao,0);
  const o=anuncios.atualizar({
   produtoId:'tenis-proprio',origem:'PROPRIO',
   categoria:'Calçados',marca:'Loja própria',
   precoCentavos:29990,promocaoCentavos:24990,
   quantidade:12,revisaoEsperada:0
  });
  assert.equal(o.precoCentavos,29990);
  assert.equal(o.promocaoCentavos,24990);
  assert.equal(o.revisao,1);
  const p=anuncios.projetar([{
   produtoId:'tenis-proprio',titulo:'Tênis',
   precoCentavos:null,compravel:false,checkoutReal:false
  }])[0];
  assert.equal(p.precoAnunciadoCentavos,24990);
  assert.equal(p.precoOriginalAnunciadoCentavos,29990);
  assert.equal(p.estoqueInformadoOperador,12);
  assert.equal(p.origemCadastro,'PROPRIO');
  assert.equal(p.compravel,false);
  assert.equal(p.checkoutReal,false);
  assert.equal(p.precoCentavos,null);
  assert.equal(p.estoqueConfirmado,false);
  assert.equal(p.freteCalculado,false);
  const reiniciada=new AnunciosManuaisAkitemmSQLite({banco});
  assert.deepEqual(reiniciada.consultar('tenis-proprio'),o);
  assert.throws(()=>reiniciada.atualizar({
   produtoId:'tenis-proprio',origem:'PROPRIO',categoria:'',marca:'',
   precoCentavos:29990,promocaoCentavos:28000,quantidade:null,
   revisaoEsperada:0
  }),/ANUNCIO_REVISAO_CONCORRENTE/);
  assert.equal(reiniciada.consultar('tenis-proprio').revisao,1);
  assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{banco.close();}
});
test('preco promocional precisa ser inferior ao normal, sem precos falsos',()=>{
 const banco=preparar();
 try{
  const loja=new AnunciosManuaisAkitemmSQLite({banco});
  const base={produtoId:'tenis-proprio',origem:'PROPRIO',
   categoria:'',marca:'',precoCentavos:20000,promocaoCentavos:20000,
   quantidade:null,revisaoEsperada:0};
  assert.throws(()=>loja.atualizar(base),/ANUNCIO_DADOS_INVALIDOS/);
  assert.throws(()=>loja.atualizar({...base,promocaoCentavos:30000}),
   /ANUNCIO_DADOS_INVALIDOS/);
  assert.throws(()=>loja.atualizar({...base,promocaoCentavos:10000,
   quantidade:-2}),/ANUNCIO_DADOS_INVALIDOS/);
  assert.throws(()=>loja.atualizar({...base,produtoId:'desconhecido',
   promocaoCentavos:10000}),/ANUNCIO_PRODUTO_NAO_ENCONTRADO/);
  assert.equal(loja.consultar('tenis-proprio').revisao,0);
  const semPreco=loja.atualizar({...base,precoCentavos:null,
   promocaoCentavos:null});
  assert.equal(semPreco.precoCentavos,null);
  assert.equal(loja.projetar([{produtoId:'tenis-proprio'}])[0]
   .precoAnunciadoCentavos,null);
 }finally{banco.close();}
});
