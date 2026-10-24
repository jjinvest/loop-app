'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {AkitemmAvaliacoesDemoSQLite}=require('../src/domain/akitemm-avaliacoes-demo-sqlite');
const {gerarPngTeste}=require('../scripts/fixtures/gerar-png-teste');

test('AKITEMM: modo R2 guarda bytes somente na nuvem, SQLite mantém referência e autorização',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE admin_carrinho_loop_demo(pedido_id TEXT PRIMARY KEY);');
 db.exec('CREATE TABLE catalogo_produtos(id TEXT PRIMARY KEY);');
 db.prepare('INSERT INTO admin_carrinho_loop_demo VALUES (?)').run('pedido-um');
 db.prepare('INSERT INTO catalogo_produtos VALUES (?)').run('produto-foto-um');
 const arquivos=new Map();
 const r2={
  novaChave:()=>('akitemm/avaliacoes/'+randomUUID()+'/'+randomUUID()+'.bin'),
  async enviar(chave,dados){arquivos.set(chave,Buffer.from(dados));},
  async obter(chave){if(!arquivos.has(chave))throw Error('Sem objeto');return Buffer.from(arquivos.get(chave));},
  async apagar(chave){arquivos.delete(chave);}
 };
 try{
  const carrinhos={banco:db};
  const aval=new AkitemmAvaliacoesDemoSQLite({banco:db,carrinhos,armazenamentoR2:r2});
  db.prepare(`
   INSERT INTO akitemm_avaliacoes_demo
   (pedido_id,conta_id,produto_id,nota,comentario,status,criada_em)
   VALUES ('pedido-um','conta-um','produto-foto-um',5,'Avaliação de teste segura','PENDENTE','2026-10-21')
  `).run();
  const png=gerarPngTeste();
  const media=await aval.anexarMidiaConfigurada({contaId:'conta-um',
   pedidoId:'pedido-um',produtoId:'produto-foto-um',tipo:'FOTO',
   mime:'image/png',dados:png});
  assert.equal(media.pendente,true);
  assert.equal(arquivos.size,1);
  const row=db.prepare('SELECT length(dados) AS n,bytes FROM akitemm_avaliacao_midias_demo WHERE id=?')
   .get(media.id);
  assert.equal(row.n,0,'No modo R2 o SQLite não armazena outra cópia da imagem');
  assert.equal(row.bytes,png.length);
  const chave=db.prepare('SELECT chave FROM akitemm_avaliacao_r2_refs_demo WHERE midia_id=?')
   .get(media.id).chave;
  assert.deepEqual(arquivos.get(chave),png);
  await assert.rejects(()=>aval.buscarMidiaConfigurada({id:media.id,contaId:'estranho'}),
   /MIDIA_NAO_ENCONTRADA/);
  assert.deepEqual((await aval.buscarMidiaConfigurada({id:media.id,contaId:'conta-um'})).dados,png);
  aval.moderar({id:1,status:'APROVADA'});
  assert.deepEqual((await aval.buscarMidiaConfigurada({id:media.id,contaId:'outra-conta'})).dados,png);
  assert.equal(aval.publicadas('produto-foto-um')[0].midias.length,1);
 }finally{db.close();}
});
