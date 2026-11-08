'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {CelcoinHistoricoMockSQLite}=require('../src/domain/celcoin-historico-mock-sqlite');
const {planoCelcoinPorFotografiaLab}=require('../src/domain/celcoin-fluxo-sandbox-lab');
const P1='hom-00000000-0000-0000-0000-000000000001';
const P2='hom-00000000-0000-0000-0000-000000000002';
const foto=(id,change={})=>({
 prepedidoId:id,totalBrutoCotadoCentavos:50000,
 quantidadePosicoesPlanejadas:1,referenciaLoopPrevistaCentavos:25000,
 custoFornecedorPrevistoCentavos:17500,fretePrevistoCentavos:1500,
 tarifaPspPrevistaCentavos:500,reservaTributariaEstimadaCentavos:500,
 custosCompletos:true,itens:[{produtoId:'produto-teste-dourado',quantidade:1}],
 ...change
});
function bancoInicial(path){
 const db=new DatabaseSync(path);
 db.exec([
  'PRAGMA foreign_keys=ON;',
  'CREATE TABLE IF NOT EXISTS akitemm_pedido_custos_fotografia_lab(',
  'prepedido_id TEXT PRIMARY KEY,fotografia_json TEXT NOT NULL);'
 ].join(' '));
 return db;
}
const gravaFoto=(db,foto)=>db.prepare(
 'INSERT INTO akitemm_pedido_custos_fotografia_lab VALUES(?,?)'
).run(foto.prepedidoId,JSON.stringify(foto));
const evento=(ordem,status,id)=>({
 eventoId:id,clientCode:ordem.clientCodePrevisto,status,
 valorCentavos:ordem.valorPrevistoCentavos
});
test('historico Celcoin mock: SQL compartilhado, idempotencia apos reinicio e isolamento',t=>{
 const pasta=mkdtempSync(join(tmpdir(),'celcoin-registro-'));
 const file=join(pasta,'unificado.sqlite');
 t.after(()=>rmSync(pasta,{force:true,recursive:true}));
 let db=bancoInicial(file);
 gravaFoto(db,foto(P1));
 gravaFoto(db,foto(P2));
 let historico=new CelcoinHistoricoMockSQLite({banco:db});
 const p=planoCelcoinPorFotografiaLab({fotografia:foto(P1)});
 const inter=p.ordens[0],fornecedor=p.ordens[1],mp=p.ordens[2];
 const primeiro=evento(inter,'PENDING','celcoin-evt-a01');
 assert.deepEqual(historico.registrarEnsaio({prepedidoId:P1,evento:primeiro}),
  {repetido:false,gravado:true,producao:false,transferenciasReais:0});
 assert.equal(historico.consultar().eventosMockPersistidos,1);
 assert.equal(historico.consultar({prepedidoId:P2}).eventos.length,0);
 db.close();
 // Nova instancia SIMULA reinicio do processo, nao apenas repete metodo.
 db=bancoInicial(file);historico=new CelcoinHistoricoMockSQLite({banco:db});
 t.after(()=>db.close());
 assert.equal(historico.registrarEnsaio({prepedidoId:P1,evento:primeiro}).repetido,true);
 assert.equal(historico.consultar().eventosMockPersistidos,1);
 assert.throws(()=>historico.registrarEnsaio({prepedidoId:P2,evento:primeiro}),
  /CELCOIN_MOCK_DESTINO_VALOR_DIVERGENTE|CELCOIN_MOCK_ID_REUTILIZADO_COM_CONFLITO/);
 assert.throws(()=>historico.registrarEnsaio({prepedidoId:P1,evento:{
  ...primeiro,status:'CONFIRMED'
 }}),/CELCOIN_MOCK_ID_REUTILIZADO_COM_CONFLITO/);
 assert.throws(()=>historico.registrarEnsaio({prepedidoId:P1,evento:{
  ...primeiro,eventoId:'celcoin-evt-a02',valorCentavos:25100
 }}),/CELCOIN_MOCK_DESTINO_VALOR_DIVERGENTE/);
 assert.equal(historico.consultar().eventosMockPersistidos,1,
  'conflitos fizeram ROLLBACK sem metade de operacao');
 assert.equal(historico.registrarEnsaio({prepedidoId:P1,evento:
  evento(inter,'CONFIRMED','celcoin-evt-a03')}).gravado,true);
 assert.equal(historico.registrarEnsaio({prepedidoId:P1,evento:
  evento(mp,'REJECTED','celcoin-evt-a04')}).gravado,true);
 assert.equal(historico.registrarEnsaio({prepedidoId:P1,evento:
  evento(fornecedor,'PENDING','celcoin-evt-a05')}).gravado,true);
 assert.throws(()=>historico.registrarEnsaio({prepedidoId:P1,evento:
  evento(mp,'CONFIRMED','celcoin-evt-a06')}),/CELCOIN_MOCK_TRANSICAO_INVALIDA/);
 assert.throws(()=>historico.registrarEnsaio({prepedidoId:P1,evento:
  evento(inter,'PENDING','celcoin-evt-a07')}),/CELCOIN_MOCK_TRANSICAO_INVALIDA/);
 assert.equal(historico.registrarEnsaio({prepedidoId:P1,evento:
  evento(inter,'REVERTED','celcoin-evt-a08')}).gravado,true);
 const total=historico.consultar({prepedidoId:P1});
 assert.equal(total.eventosMockPersistidos,5);
 assert.equal(total.eventos.length,5);
 assert.equal(total.eventos[0].status,'REVERTED');
 assert.equal(total.transferenciaBancariaConfirmada,false);
 assert.equal(total.creditoRealCentavos,null);
 assert.equal(total.saquesPermitidos,false);
 assert.throws(()=>db.exec('DELETE FROM akitemm_celcoin_eventos_mock_lab'),
  /celcoin mock imutavel/);
 assert.throws(()=>db.exec("UPDATE akitemm_celcoin_eventos_mock_lab SET status='CONFIRMED'"),
  /celcoin mock imutavel/);
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('invalido sem foto, com falta de custos ou plano com margem negativa nunca gera mock',()=>{
 const db=bancoInicial(':memory:');
 const livro=new CelcoinHistoricoMockSQLite({banco:db});
 const p=planoCelcoinPorFotografiaLab({fotografia:foto(P1)});
 const order=p.ordens[0];
 assert.throws(()=>livro.registrarEnsaio({prepedidoId:P1,evento:
  evento(order,'PENDING','celcoin-evt-b01')}),/CELCOIN_MOCK_PEDIDO_NAO_EXISTE/);
 gravaFoto(db,foto(P1,{custosCompletos:false,custoFornecedorPrevistoCentavos:null}));
 assert.throws(()=>livro.registrarEnsaio({prepedidoId:P1,evento:
  evento(order,'PENDING','celcoin-evt-b02')}),/CELCOIN_MOCK_PLANO_NAO_APTO/);
 assert.equal(livro.consultar().eventosMockPersistidos,0);
 assert.throws(()=>livro.consultar({limite:51}),/CELCOIN_MOCK_CONSULTA_INVALIDA/);
 db.close();
});
