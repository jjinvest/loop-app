'use strict';
// Regressao de escala: mais de 500 reservas antigas nao podem ocultar
// outras compras elegiveis para reconsulta do PSP.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {RecuperacaoReservasCheckoutSQLite}=
 require('../src/producao/recuperacao-reservas-checkout-sqlite');

test('PSP: cooldown de 500 pedidos nao bloqueia os 20 seguintes',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec([
   'PRAGMA foreign_keys=ON;',
   'CREATE TABLE loja_real_pedidos(',
   'pedido_id TEXT PRIMARY KEY,status TEXT NOT NULL);',
   'CREATE TABLE loop_real_checkout_reservas_posicoes(',
   'pedido_id TEXT PRIMARY KEY REFERENCES loja_real_pedidos(pedido_id),',
   'titular_id TEXT NOT NULL,quantidade INTEGER NOT NULL,',
   'criado_em INTEGER NOT NULL,estado TEXT NOT NULL);'
  ].join(' '));
  let agora=1800000000000;
  const preflight={db,verificar:()=>({integridade:'OK'})};
  const chamadas=[];
  const pedidos={
   db,preflightCapacidade:preflight,
   async confirmarPagamento({pedidoId}){
    chamadas.push(pedidoId);
    const e=new Error('PAGAMENTO_PSP_NAO_CONCILIADO');
    e.codigo='PAGAMENTO_PSP_NAO_CONCILIADO';
    throw e;
   }
  };
  const recuperacao=new RecuperacaoReservasCheckoutSQLite({
   banco:db,preflight,pedidos,
   agora:()=>agora,idadeMinimaMs:60000,intervaloMinimoMs:60000
  });
  const insPedido=db.prepare(
   'INSERT INTO loja_real_pedidos(pedido_id,status) VALUES(?,?)'
  );
  const insReserva=db.prepare([
   'INSERT INTO loop_real_checkout_reservas_posicoes',
   '(pedido_id,titular_id,quantidade,criado_em,estado)',
   'VALUES(?,?,?,?,?)'
  ].join(' '));
  const insReconsulta=db.prepare([
   'INSERT INTO loop_real_checkout_reconsultas_pendentes',
   '(pedido_id,resultado,registrado_em) VALUES(?,?,?)'
  ].join(' '));
  db.exec('BEGIN IMMEDIATE');
  try{
   for(let n=1;n<=520;n++){
    const id='PEDIDO_'+String(n).padStart(4,'0');
    insPedido.run(id,'AGUARDANDO_PAGAMENTO');
    insReserva.run(id,'titular-ensaio',1,agora-300000,'RESERVADA');
    if(n<=500)insReconsulta.run(id,'PSP_PENDENTE',agora-30000);
   }
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}

  // A pagina mais antiga contem apenas pedidos em cooldown; a leitura
  // administrativa deve contar os 20 aptos alem da primeira pagina.
  const antes=recuperacao.consultar({limite:10});
  assert.equal(antes.reservasEmAberto,520);
  assert.equal(antes.reservasVencidasNaPagina,10);
  assert.equal(antes.elegiveisParaReconsulta,20);
  assert.equal(antes.liberacaoPorTempo,false);

  const primeira=await recuperacao.reconsultarVencidas({
   limite:15,autorizadoEnsaio:true
  });
  assert.equal(primeira.reconsultadas,15);
  assert.equal(primeira.pendentes,15);
  assert.equal(primeira.ignoradasPorIntervalo,500);
  assert.deepEqual(chamadas,Array.from({length:15},(_,i)=>
   'PEDIDO_'+String(i+501).padStart(4,'0')));
  assert.equal(recuperacao.consultar().elegiveisParaReconsulta,5);

  const segunda=await recuperacao.reconsultarVencidas({
   limite:20,autorizadoEnsaio:true
  });
  assert.equal(segunda.reconsultadas,5);
  assert.equal(segunda.ignoradasPorIntervalo,515);
  assert.equal(chamadas.length,20);
  assert.equal(recuperacao.consultar().elegiveisParaReconsulta,0);
  const terceira=await recuperacao.reconsultarVencidas({
   limite:20,autorizadoEnsaio:true
  });
  assert.equal(terceira.reconsultadas,0);
  assert.equal(chamadas.length,20);

  // Sem resposta PSP de cancelamento, todas as vagas continuam reservadas.
  assert.equal(db.prepare([
   'SELECT COUNT(*) AS n FROM loop_real_checkout_reservas_posicoes',
   "WHERE estado='RESERVADA'"
  ].join(' ')).get().n,520);
  assert.equal(recuperacao.verificar().reconsultas,520);

  // Ao acabar o cooldown, a ordenacao antiga volta a ser respeitada.
  agora+=60001;
  const quarto=await recuperacao.reconsultarVencidas({
   limite:1,autorizadoEnsaio:true
  });
  assert.equal(quarto.reconsultadas,1);
  assert.equal(chamadas.at(-1),'PEDIDO_0001');
 }finally{db.close();}
});
