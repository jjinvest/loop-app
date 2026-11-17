'use strict';
// Ensaio de carga no motor integrado ao SQLite da identidade.
// Nao representa 1000 clientes distintos nem movimentacao financeira.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {IdentidadeClienteLoopReal}=require('../src/producao/identidade-cliente-loop-sqlite');
const {MotorLoopIntegradoSQLite}=require('../src/producao/motor-loop-integrado-sqlite');
test('1000 compras qualificadas no mesmo SQLite: sem duplicacao e com limite por titular', {timeout:900000},async()=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 try{
  const termos={versao:'ENSAIO-1000',texto:'Ensaio tecnico sem dinheiro, credito ou posicao remunerada.'};
  const contas=new IdentidadeClienteLoopReal({
   banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
   chaveCodigo:randomBytes(32),termos,
   privacidade:{...termos,versao:'PRIV-ENSAIO-1000'},enviarEmail:async()=>true
  });
  const motor=new MotorLoopIntegradoSQLite({banco});
  const doc=contas.documentos();
  let total=0;
  for(let i=0;i<100;i++){
   const titular=await contas.cadastrar({
    nome:'Titular de ensaio',nick:'Teste'+i,
    email:'teste'+i+'@example.invalid',senha:'SenhaDeEnsaioReal2026!',
    aceiteTermos:true,aceitePrivacidade:true,
    versaoTermos:doc.termos.versao,hashTermos:doc.termos.hash,
    versaoPrivacidade:doc.privacidade.versao,hashPrivacidade:doc.privacidade.hash
   });
   for(let j=0;j<10;j++){
    const pedidoId='ensaio-1000-'+i+'-'+j;
    const primeira=motor.registrarCompraEnsaio({
     titularId:titular.titularId,pedidoId,valorCentavos:25000
    });
    assert.equal(primeira.repetida,false);
    assert.equal(motor.registrarCompraEnsaio({
     titularId:titular.titularId,pedidoId,valorCentavos:25000
    }).repetida,true);
    total++;
   }
   assert.throws(()=>motor.registrarCompraEnsaio({
    titularId:titular.titularId,pedidoId:'extra-'+i,valorCentavos:25000
   }),/LOOP_MAXIMO_DEZ_POSICOES/);
  }
  assert.equal(total,1000);
  const prova=motor.verificar();
  assert.equal(prova.compras,1000);
  assert.equal(prova.giros,0);
  assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM loop_real_motor_compras').get().n,1000);
  assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{banco.close();}
});
