'use strict';
// Regressao de migracao real em SQLite: pacote de dez nao pode depender
// do limite de posicoes adicionais gravado em bancos antigos.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');

async function compraConfirmada(m,nome,email){
 const usuario=m.contas.cadastrar({nome,email,senha:'senha-ficticia-migracao-2026'});
 const {cookie}=await m.http('/entrar',{body:{nome:usuario.nome,senha:'senha-ficticia-migracao-2026'}});
 const pedido=(await m.http('/loja/pedidos',{cookie,status:201,body:{
  itens:[{produtoId:'curso-lab-250',quantidade:1}]
 }})).data.pedido.pedidoId;
 m.confirmar(pedido);
 await m.integracao.conciliador.processar(pedido);
 return pedido;
}

function reduzirEsquemaParaVersaoLegada(banco,limite){
 // Simula exclusivamente a estrutura do banco legado. A compra e sua
 // posicao primaria persistem, assim como a linha adicional ja existente.
 banco.exec(`
  DROP TRIGGER IF EXISTS admin_ponte_posicoes_adicionais_no_update;
  DROP TRIGGER IF EXISTS admin_ponte_posicoes_adicionais_no_delete;
  DROP TRIGGER IF EXISTS admin_ponte_posicao_extra_sem_reuso_primaria;
  DROP TRIGGER IF EXISTS admin_ponte_posicao_primaria_sem_reuso_extra;
  CREATE TABLE admin_ponte_posicoes_legado(
   pedido_id TEXT NOT NULL REFERENCES admin_ponte_compras_demo(pedido_id) ON DELETE RESTRICT,
   ordem INTEGER NOT NULL CHECK(ordem BETWEEN 2 AND ${limite}),
   posicao_id INTEGER NOT NULL UNIQUE CHECK(posicao_id>0),
   PRIMARY KEY(pedido_id,ordem)
  );
  INSERT INTO admin_ponte_posicoes_legado SELECT * FROM admin_ponte_posicoes_adicionais_demo;
  DROP TABLE admin_ponte_posicoes_adicionais_demo;
  ALTER TABLE admin_ponte_posicoes_legado RENAME TO admin_ponte_posicoes_adicionais_demo;
 `);
}

for(const limite of [5,6]){
 test('Migrar SQLite legado com ordem 2..'+limite+' para pacote de dez',async t=>{
  const m=await abrirLaboratorio(':memory:');
  t.after(()=>m.fechar());
  const pedido=await compraConfirmada(m,'Cliente Migracao '+limite,
   'migracao-'+limite+'@example.invalid');
  const primaria=m.banco.prepare(
   'SELECT posicao_id AS id FROM admin_ponte_compras_demo WHERE pedido_id=?'
  ).get(pedido).id;
  const extra=primaria+1000000;
  m.banco.prepare(`INSERT INTO admin_ponte_posicoes_adicionais_demo
   (pedido_id,ordem,posicao_id) VALUES(?,2,?)`).run(pedido,extra);
  reduzirEsquemaParaVersaoLegada(m.banco,limite);
  const legacy=m.banco.prepare(
   "SELECT sql FROM sqlite_master WHERE type='table' AND name='admin_ponte_posicoes_adicionais_demo'"
  ).get().sql;
  assert.ok(legacy.includes('BETWEEN 2 AND '+limite));
  // Reinicializacao da ponte sobre O MESMO banco, sem reconstruir compras.
  new PonteComprasConvitesDemoSQLite({
   banco:m.banco,contas:m.contas,
   pedidosIdentificados:m.app.locals.titularidadeCompartilhadaLoop,
   consultarPagamentoConfiavel:async()=>null,atribuicaoManualPorPosicao:true
  });
  const novo=m.banco.prepare(
   "SELECT sql FROM sqlite_master WHERE type='table' AND name='admin_ponte_posicoes_adicionais_demo'"
  ).get().sql;
  assert.ok(novo.includes('BETWEEN 2 AND 10'));
  assert.deepEqual(m.banco.prepare(
   'SELECT ordem,posicao_id AS id FROM admin_ponte_posicoes_adicionais_demo WHERE pedido_id=? ORDER BY ordem'
  ).all(pedido),[{ordem:2,id:extra}]);
  // O pedido antigo continua intacto; passa a aceitar ordem 10.
  m.banco.prepare(`INSERT INTO admin_ponte_posicoes_adicionais_demo
   (pedido_id,ordem,posicao_id) VALUES(?,10,?)`).run(pedido,extra+1);
  assert.throws(()=>m.banco.prepare(`INSERT INTO admin_ponte_posicoes_adicionais_demo
   (pedido_id,ordem,posicao_id) VALUES(?,3,?)`).run(pedido,primaria),
   /posicao ja usada em compra/);
  assert.equal(m.banco.prepare(
   'SELECT COUNT(*) AS n FROM admin_ponte_posicoes_adicionais_demo WHERE pedido_id=?'
  ).get(pedido).n,2);
  assert.equal(m.banco.prepare(
   'SELECT posicao_id AS id FROM admin_ponte_compras_demo WHERE pedido_id=?'
  ).get(pedido).id,primaria);
  assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
  assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
 });
}
