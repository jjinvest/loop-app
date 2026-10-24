'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {SimuladorLoop}=require('../src/domain/simulador-loop');
const {cofreDoEvento,origemDoCentro}=require('../src/domain/destino-financeiro-centro-loop');
const copiar=s=>JSON.parse(JSON.stringify(s));
const DESTINO_DOURADA=['LOOP_DOURADAS','LOOP_ESQUERDA','LOOP_DOURADAS',
 'LOOP_DIREITA','LOOP_DOURADAS','LOOP_ESQUERDA'];
const DESTINO_REAL=['LOOP_CENTRO','LOOP_ESQUERDA','LOOP_CENTRO',
 'LOOP_DIREITA','LOOP_CENTRO','LOOP_ESQUERDA'];

function preparar(tipo){
 const sim=new SimuladorLoop({relogio:()=> '2030-06-01T12:00:00.000Z'});
 for(let i=1;i<=8;i++)sim.registrarPosicaoSimulada({
  nome:'Titular '+i,participanteId:'pessoa-'+i,vendaId:'pedido-'+i,
  adesaoPendente:tipo==='dourada'&&i===1
 });
 sim.prepararTabuleiro();
 if(tipo==='desistente'){
  // A pessoa que entra na vaga 6 desiste com aceite, avanca
  // regularmente ate o centro (nunca e contemplacao antecipada).
  const p=sim.tabuleiro.vagas[5];
  sim.registrarDesistenciaNaVaga6Simulada({posicaoId:p.id,aceiteExpresso:true});
  for(let rodada=1;rodada<=6;rodada++){
   for(let ordem=1;ordem<=6;ordem++)
    sim.registrarVendaNoCicloSimulada({vendaId:'anterior-'+rodada+'-'+ordem});
   sim.abrirCatraca();
   assert.equal(sim.tentarGiro().girou,true);
  }
  assert.equal(sim.tabuleiro.centro.statusAdesao,'DESISTENTE');
 }
 for(let ordem=1;ordem<=6;ordem++)
  sim.registrarVendaNoCicloSimulada({vendaId:'atual-'+tipo+'-'+ordem});
 return sim;
}
function restaurar(snapshot){
 return SimuladorLoop.restaurarSnapshot(snapshot);
}
function alterar(snapshot,mudar){
 const copia=copiar(snapshot);mudar(copia);
 assert.throws(()=>restaurar(copia),/Snapshot LOOP invalido/);
 assert.deepEqual(snapshot,snapshot,'snapshot original protegido');
}
test('snapshot V6 real exige seis destinos e titularidade corretos',()=>{
 const sim=preparar('real');const snapshot=sim.exportarSnapshot();
 assert.deepEqual(snapshot.tabuleiro.vendasDoCiclo.map(v=>v.destinoCofre),DESTINO_REAL);
 assert.deepEqual(restaurar(snapshot).exportarSnapshot(),snapshot);
 alterar(snapshot,s=>{s.tabuleiro.vendasDoCiclo[0].destinoCofre='LOOP_DOURADAS';});
 alterar(snapshot,s=>{s.tabuleiro.vendasDoCiclo[0].destinoCofre=null;});
 alterar(snapshot,s=>{delete s.tabuleiro.vendasDoCiclo[0].destinoCofre;});
 alterar(snapshot,s=>{s.tabuleiro.vendasDoCiclo[1].origemTitularCentro='POSICAO_OPERACIONAL_LOOP';});
 alterar(snapshot,s=>{s.tabuleiro.vendasDoCiclo[0].destinoParticipanteDoCentro='LOOP_DOURADAS';});
});
test('snapshot V6 dourado invalida destinos falsos, mesmo se o indice da venda estiver correto',()=>{
 const sim=preparar('dourada');const snapshot=sim.exportarSnapshot();
 assert.equal(snapshot.tabuleiro.centro.empresa,true);
 assert.deepEqual(snapshot.tabuleiro.vendasDoCiclo.map(v=>v.destinoCofre),DESTINO_DOURADA);
 assert.deepEqual(restaurar(snapshot).exportarSnapshot(),snapshot);
 alterar(snapshot,s=>{s.tabuleiro.vendasDoCiclo[2].destinoCofre='LOOP_CENTRO';});
 alterar(snapshot,s=>{s.tabuleiro.vendasDoCiclo[2].origemTitularCentro='PARTICIPANTE_REAL_SIMULADO';});
 alterar(snapshot,s=>{delete s.tabuleiro.vendasDoCiclo[2].destinoParticipanteDoCentro;});
 // Uma tentativa de retirar as bandeiras da empresa mas manter repasse dourado
 // nao pode virar recebimento de pessoa real silenciosamente.
 alterar(snapshot,s=>{
  s.tabuleiro.centro.empresa=false;
  s.tabuleiro.centro.titularOperacional='CLIENTE';
  s.tabuleiro.centro.statusAdesao='ATIVA';
 });
});
test('desistencia no centro persiste e protege todos os seis destinos apos restauracao',()=>{
 const sim=preparar('desistente');const snapshot=sim.exportarSnapshot();
 assert.equal(snapshot.tabuleiro.centro.statusAdesao,'DESISTENTE');
 assert.deepEqual(snapshot.tabuleiro.vendasDoCiclo.map(v=>v.destinoCofre),DESTINO_DOURADA);
 assert.deepEqual(restaurar(snapshot).exportarSnapshot(),snapshot);
 alterar(snapshot,s=>{s.tabuleiro.vendasDoCiclo[4].destinoCofre='LOOP_CENTRO';});
 alterar(snapshot,s=>{s.tabuleiro.vendasDoCiclo[5].destinoCofre='LOOP_DOURADAS';});
});
test('ciclos concluidos V6 tambem sao validados ao reabrir snapshot',()=>{
 const sim=preparar('dourada');
 sim.abrirCatraca();assert.equal(sim.tentarGiro().girou,true);
 const snap=sim.exportarSnapshot();
 assert.equal(snap.tabuleiro.ciclosConcluidos.length,1);
 assert.deepEqual(restaurar(snap).exportarSnapshot(),snap);
 alterar(snap,s=>{s.tabuleiro.ciclosConcluidos[0].vendas[4].destinoCofre='LOOP_CENTRO';});
});
test('importacao V5 preserva ciclo historico de cinco sem campos V6',()=>{
 const sim=preparar('real');
 sim.abrirCatraca();assert.equal(sim.tentarGiro().girou,true);
 const antigo=sim.exportarSnapshot();
 antigo.tabuleiro.ciclosConcluidos[0].vendas.pop();
 antigo.tabuleiro.ciclosConcluidos[0].vendas.forEach(v=>{
  delete v.destinoCofre;delete v.origemTitularCentro;delete v.destinoParticipanteDoCentro;
 });
 antigo.tabuleiro.vendasProcessadas=antigo.tabuleiro.vendasProcessadas
  .filter(x=>x!=='atual-real-6');
 assert.equal(restaurar(antigo).exportarSnapshot().tabuleiro.ciclosConcluidos[0].vendas.length,5);
});
