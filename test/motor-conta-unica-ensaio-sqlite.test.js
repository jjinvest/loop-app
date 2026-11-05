'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {MotorContaUnicaEnsaioSQLite}=
 require('../src/domain/motor-conta-unica-ensaio-sqlite');
const titular=n=>'titular-'+String(n).padStart(8,'0')+'-0000-0000-0000-000000000000';
const pedido=n=>'hom-'+String(n).padStart(8,'0')+'-0000-0000-0000-000000000000';
function preparar(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON;'+
  'CREATE TABLE akitemm_conta_unica_candidata(id TEXT PRIMARY KEY);'+
  'CREATE TABLE akitemm_checkout_prepedidos_staging('+
  'prepedido_id TEXT PRIMARY KEY,titular_id TEXT,total_centavos INTEGER NOT NULL);');
 const fotos=new Map();
 const sinalizacao={db,consultarFotografiaPrepedido:({prepedidoId,titularId})=>{
  const f=fotos.get(prepedidoId);
  return f?.titularId===titularId?f:null;
 }};
 const gravar=(n,t=1,{verde=true,total=25000}={})=>{
  db.prepare('INSERT INTO akitemm_checkout_prepedidos_staging VALUES(?,?,?)')
   .run(pedido(n),titular(t),total);
  fotos.set(pedido(n),{titularId:titular(t),totalCentavos:total,
   referenciaVerdeAtingida:verde,
   valorVerdeConsideradoCentavos:verde?total:0,
   podeSimularFilaBAzul:verde,eventoPendente:false});
 };
 const conta=n=>db.prepare('INSERT INTO akitemm_conta_unica_candidata VALUES(?)')
  .run(titular(n));
 return {db,sinalizacao,gravar,conta,
  motor:new MotorContaUnicaEnsaioSQLite({banco:db,sinalizacao})};
}
test('motor inicia vazio na MESMA conexao SQLite, sem criar posicoes ou eventos',()=>{
 const {db,motor}=preparar();
 try{
  assert.deepEqual(motor.consultar().filaA,[]);
  assert.deepEqual(motor.consultar().filaB,[]);
  assert.equal(motor.consultar().catraca.giros,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_motor_conta_ensaio_estado').get().n,0);
  assert.equal(motor.consultar().dinheiroReal,false);
  assert.throws(()=>motor.consultar({titularId:titular(1)}),
   /TITULAR_MOTOR_INEXISTENTE/);
 }finally{db.close();}
});
test('sem fotografia verde qualificada ou ciencia explicita, nenhum pedido entra no motor',()=>{
 const {db,motor,conta,gravar}=preparar();
 try{
  conta(1);gravar(1,1,{verde:false});gravar(2);
  assert.throws(()=>motor.vincularPedido({prepedidoId:pedido(1),aceiteEnsaio:true}),
   /PEDIDO_NAO_QUALIFICA_ENSAIO_MOTOR/);
  assert.throws(()=>motor.vincularPedido({prepedidoId:pedido(2)}),
   /CIENCIA_DE_ENSAIO_OBRIGATORIA/);
  assert.deepEqual(motor.consultar({titularId:titular(1)}).minhasPosicoes,[]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_motor_conta_ensaio_operacoes').get().n,0);
 }finally{db.close();}
});
test('pedido idempotente, isolamento entre titulares, limite 10 e reinicializacao SQLite',()=>{
 const {db,motor,conta,gravar,sinalizacao}=preparar();
 try{
  conta(1);conta(2);
  for(let n=1;n<=11;n++)gravar(n);
  gravar(30,2);
  const a=motor.vincularPedido({prepedidoId:pedido(1),aceiteEnsaio:true});
  assert.equal(a.repetido,false);
  assert.equal(motor.vincularPedido({prepedidoId:pedido(1),aceiteEnsaio:true}).repetido,true);
  for(let n=2;n<=10;n++)motor.vincularPedido({prepedidoId:pedido(n),aceiteEnsaio:true});
  assert.throws(()=>motor.vincularPedido({prepedidoId:pedido(11),aceiteEnsaio:true}),
   /LIMITE_DEZ_POSICOES_MOTOR_ENSAIO/);
  motor.vincularPedido({prepedidoId:pedido(30),aceiteEnsaio:true});
  const um=motor.consultar({titularId:titular(1)}),
   dois=motor.consultar({titularId:titular(2)});
  assert.equal(um.posicoesAtivasDoTitular,10);
  assert.equal(dois.posicoesAtivasDoTitular,1);
  assert.ok(um.filaB.some(x=>x.minha));
  assert.equal(um.minhasPosicoes.length,10);
  assert.equal(dois.minhasPosicoes.length,1);
  assert.ok(dois.minhasPosicoes.every(x=>!um.minhasPosicoes.some(y=>x.numero===y.numero)));
  assert.doesNotMatch(JSON.stringify(um),new RegExp(titular(2)));
  const reaberto=new MotorContaUnicaEnsaioSQLite({banco:db,sinalizacao});
  assert.equal(reaberto.consultar({titularId:titular(1)}).posicoesAtivasDoTitular,10);
  assert.equal(reaberto.vincularPedido({prepedidoId:pedido(1),aceiteEnsaio:true}).repetido,true);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{db.close();}
});
test('catraca exige 6 eventos distintos, pausa respeitada e limite de 2 no tabuleiro',()=>{
 const {db,motor,conta,gravar,sinalizacao}=preparar();
 try{
  for(let i=1;i<=4;i++)conta(i);
  for(let n=1;n<=8;n++){
   const dono=(n%4)+1;gravar(n,dono);
   motor.vincularPedido({prepedidoId:pedido(n),aceiteEnsaio:true});
  }
  const p=motor.prepararTabuleiro();
  assert.equal(p.preparado,true);
  assert.equal(p.ocupadas,7);
  const estado=motor.consultar();
  assert.equal(estado.tabuleiro.vagas.length,6);
  const paridade=new Map();
  for(const p of [estado.tabuleiro.centro,...estado.tabuleiro.vagas]){
   if(!p||p.dourada)continue;
   assert.ok(p.status==='ENSAIO');
  }
  assert.equal(motor.controlarCatraca('GIRAR').girou,false);
  for(let n=1;n<=6;n++){
   const r=motor.registrarEvento({prepedidoId:pedido(n)});
   assert.equal(r.eventosNoCiclo,n);
  }
  assert.equal(motor.registrarEvento({prepedidoId:pedido(1)}).repetido,true);
  assert.throws(()=>motor.registrarEvento({prepedidoId:pedido(7)}),
   /Ciclo ja tem seis vendas/);
  assert.equal(motor.controlarCatraca('GIRAR').motivo,'CATRACA_PAUSADA');
  motor.controlarCatraca('ABRIR');
  assert.equal(motor.controlarCatraca('GIRAR').girou,true);
  const apos=new MotorContaUnicaEnsaioSQLite({banco:db,sinalizacao}).consultar();
  assert.equal(apos.catraca.giros,1);
  assert.equal(apos.catraca.giros24h,1);
  assert.equal(apos.tabuleiro.eventosNoCiclo,0);
  assert.equal(apos.posicoesReais,0);
  assert.equal(apos.saldoRealCentavos,null);
 }finally{db.close();}
});
test('motor de ensaio jamais pode ser iniciado em producao',()=>{
 const old=process.env.NODE_ENV;
 process.env.NODE_ENV='production';
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');
 try{
  assert.throws(()=>new MotorContaUnicaEnsaioSQLite({
   banco:db,sinalizacao:{db,consultarFotografiaPrepedido:()=>null}
  }),/MOTOR_ENSAIO_PROIBIDO_PRODUCAO/);
 }finally{db.close();if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;}
});
