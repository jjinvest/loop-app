'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {PosicoesVitrineRealSQLite,TABELAS_POSICOES_VITRINE}=
 require('../src/producao/posicoes-vitrine-real-sqlite');

test('espacos antigos permanecem gravados, mas vitrine organiza sem lacunas pela chegada',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const v=new PosicoesVitrineRealSQLite({banco:db});
  assert.deepEqual(TABELAS_POSICOES_VITRINE,[
   'loja_real_vitrine_posicoes','loja_real_vitrine_layout_vazios'
  ]);
  assert.deepEqual(v.listar(),[]);
  const a=v.atribuir({posicao:161,produtoId:'tenis-preto',
   revisaoEsperada:0,produtoExiste:()=>true});
  assert.equal(a.revisao,1);
  assert.equal(a.posicao,161);
  assert.equal(v.consultar({posicao:161}).produtoId,'tenis-preto');
  const novamente=new PosicoesVitrineRealSQLite({banco:db});
  assert.equal(novamente.consultar({posicao:161}).produtoId,'tenis-preto');
  const produtos=Array.from({length:199},(_,i)=>({
   produtoId:i===0?'tenis-preto':'produto-'+String(i).padStart(3,'0'),
   titulo:'Produto '+i,compravel:false,precoCentavos:null
  }));
  const projeccao=novamente.projetar(produtos);
  assert.equal(projeccao.length,199);
  assert.equal(projeccao[0].posicaoVitrine,1);
  assert.equal(projeccao[1].posicaoVitrine,2);
  assert.equal(new Set(projeccao.map(x=>x.posicaoVitrine)).size,199);
  assert.deepEqual(projeccao.slice(0,2).map(x=>x.produtoId),['tenis-preto','produto-001']);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{db.close();}
});

test('nao duplica produto, nao desloca quadrado e nao escreve pedido ou saldo',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const v=new PosicoesVitrineRealSQLite({banco:db});
  const atribuir=(posicao,produtoId,revisaoEsperada=0)=>v.atribuir({
   posicao,produtoId,revisaoEsperada,produtoExiste:()=>true
  });
  assert.equal(atribuir(1,'produto-01').jaVinculado,false);
  assert.equal(atribuir(1,'produto-01',1).jaVinculado,true);
  assert.throws(()=>atribuir(1,'outro-01',1),
   /VITRINE_REAL_ESPACO_OCUPADO/);
  assert.throws(()=>atribuir(2,'produto-01',0),
   /VITRINE_REAL_PRODUTO_JA_POSICIONADO/);
  assert.throws(()=>atribuir(1,'produto-01',0),
   /VITRINE_REAL_REVISAO_CONCORRENTE/);
  assert.throws(()=>atribuir(401,'produto-02',0),
   /VITRINE_REAL_ATRIBUICAO_INVALIDA/);
  assert.throws(()=>v.atribuir({posicao:2,produtoId:'produto-02',
   produtoExiste:()=>false}),/VITRINE_REAL_PRODUTO_NAO_ENCONTRADO/);
  assert.equal(v.listar().length,1);
  assert.equal(db.prepare(
   "SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'loja_real_vitrine_posicoes'"
  ).get().n,1);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{db.close();}
});

test('reservar espaco para rascunho impede sobreposicao de publicado',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const v=new PosicoesVitrineRealSQLite({banco:db});
  v.atribuir({posicao:40,produtoId:'produto-rascunho',
   revisaoEsperada:0,produtoExiste:()=>true});
  const abertos=[{produtoId:'publicado-1',compravel:false},
   {produtoId:'publicado-2',compravel:false}];
  const lista=v.projetar(abertos);
  assert.deepEqual(lista.map(x=>x.posicaoVitrine),[1,2]);
  assert.equal(v.consultar({posicao:40}).produtoId,'produto-rascunho');
  const apos=v.projetar([...abertos,
   {produtoId:'produto-rascunho',compravel:false}]);
  assert.equal(apos[0].produtoId,'produto-rascunho');
  assert.deepEqual(apos.map(x=>x.posicaoVitrine),[1,2,3]);
 }finally{db.close();}
});

test('décima aba preserva vínculos em 400 e rejeita a posição 401',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const v=new PosicoesVitrineRealSQLite({banco:db});
  const novo=v.atribuir({posicao:400,produtoId:'ultima-vaga',
   revisaoEsperada:0,produtoExiste:()=>true});
  assert.equal(novo.posicao,400);
  assert.equal(new PosicoesVitrineRealSQLite({banco:db})
   .consultar({posicao:400}).produtoId,'ultima-vaga');
  assert.throws(()=>v.atribuir({posicao:401,produtoId:'fora',
   revisaoEsperada:0,produtoExiste:()=>true}),
   /VITRINE_REAL_ATRIBUICAO_INVALIDA/);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{db.close();}
});

test('arrastar 4 para 1 desloca outros, persiste e rejeita movimento concorrente',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const v=new PosicoesVitrineRealSQLite({banco:db});
  for(const [posicao,id] of [[1,'verde'],[2,'dourado'],[3,'roxo'],[4,'cinza']])
   v.atribuir({posicao,produtoId:id,revisaoEsperada:0,
    produtoExiste:()=>true});
  const mover=v.mover({produtoId:'cinza',novaPosicao:1,revisaoEsperada:1});
  assert.equal(mover.posicao,1);
  assert.equal(mover.revisao,2);
  assert.deepEqual(v.listar().map(x=>x.produtoId),
   ['cinza','verde','dourado','roxo']);
  assert.deepEqual(v.projetar([
   {produtoId:'roxo',criadoEm:3},{produtoId:'verde',criadoEm:1},
   {produtoId:'cinza',criadoEm:4},{produtoId:'dourado',criadoEm:2}
  ]).map(x=>x.produtoId),['cinza','verde','dourado','roxo']);
  assert.throws(()=>v.mover({produtoId:'cinza',novaPosicao:4,revisaoEsperada:1}),
   /VITRINE_REAL_REVISAO_CONCORRENTE/);
  assert.deepEqual(v.listar().map(x=>x.produtoId),
   ['cinza','verde','dourado','roxo']);
  const v2=new PosicoesVitrineRealSQLite({banco:db});
  assert.equal(v2.listar()[0].produtoId,'cinza');
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='loja_real_pedidos'").get().n,0);
 }finally{db.close();}
});

test('mover um produto preserva demais slots antigos e não duplica',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const v=new PosicoesVitrineRealSQLite({banco:db});
  for(const [pos,id] of [[10,'primeiro'],[20,'segundo'],[400,'terceiro']])
   v.atribuir({posicao:pos,produtoId:id,produtoExiste:()=>true});
  const retorno=v.mover({produtoId:'terceiro',novaPosicao:2,revisaoEsperada:1});
  assert.equal(retorno.posicao,2);
  assert.deepEqual(v.listar().map(x=>x.produtoId),
   ['primeiro','terceiro','segundo']);
  assert.deepEqual(v.listar().map(x=>x.posicao),[1,2,3]);
  assert.throws(()=>v.mover({produtoId:'terceiro',novaPosicao:0,revisaoEsperada:2}),
   /VITRINE_REAL_MOVIMENTO_INVALIDO/);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{db.close();}
});


test('a próxima vaga segue a ordem 1 a 11 sem depender de onde abriu o cadastro',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const v=new PosicoesVitrineRealSQLite({banco:db});
  for(let i=1;i<=10;i++){
   const resultado=v.atribuirProximo({
    produtoId:'produto-'+i,produtoExiste:()=>true
   });
   assert.equal(resultado.posicao,i);
   assert.equal(resultado.automatico,true);
  }
  assert.equal(v.listar().length,10);
  // O usuário poderia ter tocado no espaço 250; o backend não recebe 250.
  const proximo=v.atribuirProximo({
   produtoId:'produto-11',produtoExiste:()=>true
  });
  assert.equal(proximo.posicao,11);
  assert.equal(v.atribuirProximo({
   produtoId:'produto-11',produtoExiste:()=>true
  }).jaVinculado,true);
  assert.deepEqual(v.listar().map(x=>x.posicao),
   Array.from({length:11},(_,i)=>i+1));
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{db.close();}
});

test('molduras vazias trocam de cor sem criar produto nem mexer em posição',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const v=new PosicoesVitrineRealSQLite({banco:db});
  const original=v.consultarLayoutVazio();
  assert.equal(original.cores.length,400);
  assert.equal(original.cores[0],'ROXO');
  assert.equal(original.cores[1],'DOURADO');
  assert.equal(original.cores.filter(x=>x==='ROXO').length,100);
  const trocada=v.trocarEspacosVazios({
   origem:1,destino:2,revisaoEsperada:original.revisao
  });
  assert.equal(trocada.confirmado,true);
  assert.equal(trocada.checkoutReal,false);
  assert.equal(trocada.financeiroReal,false);
  const reiniciado=new PosicoesVitrineRealSQLite({banco:db});
  assert.equal(reiniciado.consultarLayoutVazio().cores[0],'DOURADO');
  assert.equal(reiniciado.consultarLayoutVazio().cores[1],'ROXO');
  assert.deepEqual(reiniciado.listar(),[]);
  assert.throws(()=>v.trocarEspacosVazios({
   origem:1,destino:3,revisaoEsperada:original.revisao
  }),/REVISAO_CONCORRENTE/);
  const item=v.atribuirProximo({
   produtoId:'produto-primeiro',produtoExiste:()=>true
  });
  assert.equal(item.posicao,1);
  assert.throws(()=>v.trocarEspacosVazios({
   origem:1,destino:2,revisaoEsperada:reiniciado.consultarLayoutVazio().revisao
  }),/PRODUTO_OCUPA_SLOT/);
  assert.equal(v.listar().length,1);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{db.close();}
});
