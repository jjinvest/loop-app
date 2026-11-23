'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {consultarDivulgacao,verificarNickDivulgador}=
 require('../src/producao/direitos-divulgacao-loop-sqlite');
const id='titular-123e4567-e89b-12d3-a456-426614174000';
function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec([
 'CREATE TABLE loop_real_contas(id TEXT PRIMARY KEY,nick TEXT UNIQUE COLLATE NOCASE);',
 'CREATE TABLE loja_real_pedidos(pedido_id TEXT PRIMARY KEY,',
 'titular_id TEXT NOT NULL,status TEXT NOT NULL,',
 'pagamento_id TEXT,atualizado_em INTEGER NOT NULL);',
 'CREATE TABLE loop_real_fotos_regras_pedido(',
 'pedido_id TEXT NOT NULL,cor TEXT NOT NULL,revisao INTEGER NOT NULL);'
 ].join(' '));
 db.prepare('INSERT INTO loop_real_contas VALUES(?,?)').run(id,'Vilela');
 const estado=()=>consultarDivulgacao({banco:db,titularId:id});
 const inserir=(pedido,cor,{status='APROVADO_PARA_EXPEDICAO',pagamento='PAG_A',
   revisao=1}={})=>{
  db.prepare('INSERT INTO loja_real_pedidos VALUES(?,?,?,?,?)')
   .run(pedido,id,status,pagamento,1700000000000);
  db.prepare('INSERT INTO loop_real_fotos_regras_pedido VALUES(?,?,?)')
   .run(pedido,cor,revisao);
 };
 return {db,estado,inserir};
}
test('conta cadastrada sem compra nao recebe link',t=>{
 const x=fixture(t);assert.equal(x.estado().linkLiberado,false);
 assert.equal(verificarNickDivulgador({banco:x.db,nick:'vilela'}),false);
});
test('cinza nao libera link mesmo custando caro; sem PSP nao libera',t=>{
 const x=fixture(t);
 x.inserir('CINZA1','CINZA');
 x.inserir('VERDE_PENDENTE','VERDE',{status:'AGUARDANDO_PAGAMENTO',
  pagamento:null});
 x.inserir('ROXO_SEM_FOTO','ROXO',{revisao:0});
 assert.equal(x.estado().linkLiberado,false);
});
test('verde comprado e confirmado libera divulgacao sem ativar LOOP',t=>{
 const x=fixture(t);x.inserir('VERDE_1','VERDE');
 assert.equal(x.estado().linkLiberado,true);
 assert.equal(x.estado().participacaoLoopAtiva,false);
 assert.equal(x.estado().financeiroReal,false);
 assert.equal(verificarNickDivulgador({banco:x.db,nick:'Vilela'}),true);
});
test('roxo dourado e laranja permitem link por comprovacao, nunca posicao',t=>{
 for(const cor of ['ROXO','DOURADO','LARANJA']){
  const x=fixture(t);
  x.inserir('COMPRA_'+cor,cor);
  assert.equal(x.estado().linkLiberado,true,cor);
  assert.equal(x.estado().participacaoLoopAtiva,false);
 }
});
test('estorno revoga direito se nao restar nenhuma compra qualificadora',t=>{
 const x=fixture(t);x.inserir('ROXO_1','ROXO');
 assert.equal(x.estado().linkLiberado,true);
 x.db.prepare("UPDATE loja_real_pedidos SET status='CANCELADO'").run();
 assert.equal(x.estado().linkLiberado,false);
});
test('sem tabelas de pedido nao inventa habilitacao',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec('CREATE TABLE loop_real_contas(id TEXT PRIMARY KEY,nick TEXT);');
 db.prepare('INSERT INTO loop_real_contas VALUES(?,?)').run(id,'Vilela');
 assert.equal(consultarDivulgacao({banco:db,titularId:id}).linkLiberado,false);
});
