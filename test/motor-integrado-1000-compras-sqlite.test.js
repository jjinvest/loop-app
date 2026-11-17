'use strict';
// Ensaio de carga no motor integrado ao SQLite da identidade.
// Nao representa 1000 clientes distintos nem movimentacao financeira.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {IdentidadeClienteLoopReal}=require('../src/producao/identidade-cliente-loop-sqlite');
const {MotorLoopIntegradoSQLite}=require('../src/producao/motor-loop-integrado-sqlite');
const {OperacaoCatracaAdminSQLite}=require('../src/producao/operacao-catraca-admin-sqlite');
test('1000 compras qualificadas no mesmo SQLite: sem duplicacao e com limite por titular', {timeout:900000},async()=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 try{
  const termos={versao:'LOOP-ENSAIO-1000',texto:'Termos técnicos para ensaio isolado da Loja AKITEMM e Escritório LOOP. Nenhuma transação financeira, posição remunerada ou promessa de ganho real existe aqui.'};
  const contas=new IdentidadeClienteLoopReal({
   banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
   chaveCodigo:randomBytes(32),termos,
   privacidade:{...termos,versao:'LOOP-PRIV-ENSAIO-1000'},enviarEmail:async()=>true
  });
  const motor=new MotorLoopIntegradoSQLite({banco});
  const doc=contas.documentos();
  let total=0;
  for(let i=0;i<100;i++){
   const titular=await contas.cadastrar({
    nome:'Titular de ensaio',nick:'Teste'+String.fromCharCode(65+Math.floor(i/26))+String.fromCharCode(65+i%26),
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
  const catraca=new OperacaoCatracaAdminSQLite({banco,motor,
   agora:()=>new Date('2026-11-10T12:00:00Z')});
  motor.prepararTabuleiroEnsaio();
  assert.equal(catraca.executarGiro().girou,false);
  const estado=catraca.consultar();
  catraca.configurar({modo:'MANUAL',janelaInicio:'09:00',
   janelaFim:'18:00',limiteDiario:10,revisaoEsperada:estado.revisao,
   motivo:'ENSAIO_CATRACA_INTEGRADA'});
  for(let ciclo=0;ciclo<10;ciclo++){
   for(let evento=0;evento<6;evento++){
    const indice=ciclo*6+evento;
    assert.equal(motor.registrarEventoEnsaio({
     pedidoId:'ensaio-1000-'+indice+'-0'
    }).eventosNoCiclo,evento+1);
   }
   assert.equal(catraca.executarGiro().girou,true);
   assert.equal(catraca.executarGiro().girou,false);
  }
  assert.equal(catraca.verificar().girosAuditados,10);
  assert.equal(catraca.consultar().girosHoje,10);
  const prova=motor.verificar();
  assert.equal(prova.compras,1000);
  assert.equal(prova.giros,10);
  assert.equal(prova.eventos,60);
  assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM loop_real_motor_compras').get().n,1000);
  assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{banco.close();}
});
