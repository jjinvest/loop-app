'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {SimuladorLoop}=require('../src/domain/simulador-loop');
const {COFRE_DOURADAS,cofreDoEvento,centroDoLoop}=require('../src/domain/destino-financeiro-centro-loop');
const {criarVisaoFinanceiraAdminDemo,COFRES}=require('../src/domain/financeiro-admin-demo');
const {RazaoFinanceiroDemoSQLite}=require('../src/domain/razao-financeiro-demo-sqlite');
const normal={id:1,participanteId:'pessoa',statusAdesao:'ATIVA',empresa:false};
const dourada={id:1,participanteId:'pessoa',statusAdesao:'PRAZO_ENCERRADO',
 empresa:true,titularOperacional:'LOOP_EMPRESA'};
const desistente={...dourada,statusAdesao:'DESISTENTE'};
const esperados=Array(6).fill(COFRE_DOURADAS);
test('centro real, dourado por prazo e desistente utilizam destinos inequívocos',()=>{
 assert.equal(centroDoLoop(normal),false);
 for(const p of [dourada,desistente]){
  assert.equal(centroDoLoop(p),true);
  assert.deepEqual(Array.from({length:6},(_,i)=>cofreDoEvento({posicaoCentro:p,ordem:i+1})),esperados);
 }
 assert.deepEqual(Array.from({length:6},(_,i)=>cofreDoEvento({posicaoCentro:normal,ordem:i+1})),
  [COFRES.CENTRO,COFRES.ESQUERDA,COFRES.CENTRO,COFRES.DIREITA,COFRES.CENTRO,COFRES.ESQUERDA]);
 assert.throws(()=>cofreDoEvento({ordem:7}),/ordem/);
});
test('posição azul torna-se dourada no centro sem registrar direito a cliente real',()=>{
 const sim=new SimuladorLoop({relogio:()=> '2030-01-01T12:00:00.000Z'});
 for(let i=1;i<=7;i++)sim.registrarPosicaoSimulada({
  nome:'Pessoa '+i,participanteId:'sim-'+i,vendaId:'produto-'+i,
  adesaoPendente:i===1
 });
 sim.prepararTabuleiro();
 assert.equal(sim.tabuleiro.centro.statusAdesao,'PRAZO_ENCERRADO');
 for(let i=1;i<=6;i++){
  const v=sim.registrarVendaNoCicloSimulada({vendaId:'venda-gold-'+i}).venda;
  assert.equal(v.destinoCofre,esperados[i-1]);
  assert.equal(v.destinoParticipanteDoCentro,'LOOP_DOURADAS');
  assert.equal(v.origemTitularCentro,'ADESAO_VENCIDA_ASSUMIDA_LOOP');
 }
 assert.equal(sim.tentarGiro().girou,false);
 sim.abrirCatraca();
 assert.equal(sim.tentarGiro().girou,true);
});
test('desistencia somente apos vaga seis, com aceite expresso, sem alterar ordem da catraca',()=>{
 const sim=new SimuladorLoop({relogio:()=> '2030-01-01T12:00:00.000Z'});
 for(let i=1;i<=7;i++)sim.registrarPosicaoSimulada({
  nome:'Pessoa '+i,participanteId:'sim-'+i,vendaId:'produto-'+i
 });
 sim.prepararTabuleiro();
 const id=sim.tabuleiro.vagas[5].id;
 assert.throws(()=>sim.registrarDesistenciaNaVaga6Simulada({posicaoId:id}),/aceite expresso/);
 assert.throws(()=>sim.registrarDesistenciaNaVaga6Simulada({posicaoId:sim.tabuleiro.vagas[0].id,
  aceiteExpresso:true}),/vaga 6/);
 const out=sim.registrarDesistenciaNaVaga6Simulada({posicaoId:id,aceiteExpresso:true});
 assert.equal(out.assumidaPeloLoop,true);
 assert.equal(sim.tabuleiro.vagas[5].empresa,true);
 assert.equal(sim.tabuleiro.vagas[5].statusAdesao,'DESISTENTE');
 for(let ciclo=1;ciclo<=6;ciclo++){
  for(let ordem=1;ordem<=6;ordem++)
   sim.registrarVendaNoCicloSimulada({vendaId:'v-'+ciclo+'-'+ordem});
  sim.abrirCatraca();
  assert.equal(sim.tentarGiro().girou,true);
  sim.pausarCatraca();
 }
 assert.equal(sim.tabuleiro.centro.id,id);
 assert.equal(sim.tabuleiro.centro.statusAdesao,'DESISTENTE');
 for(let ordem=1;ordem<=6;ordem++){
  const venda=sim.registrarVendaNoCicloSimulada({vendaId:'v-desistente-'+ordem}).venda;
  assert.equal(venda.destinoCofre,esperados[ordem-1]);
  assert.equal(venda.origemTitularCentro,'DESISTENCIA_ASSUMIDA_LOOP');
 }
});
test('financeiro separa parcelas douradas, conserva investimento e reserva, livro imutavel',t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const raiz=new RazaoFinanceiroDemoSQLite({banco:repo.banco});
 for(const centroPosicao of [dourada,desistente]){
  const f=criarVisaoFinanceiraAdminDemo({centroPosicao});
  const total=id=>f.caixas.find(c=>c.id===id).entradasAcumuladasCentavos;
  assert.equal(total(COFRES.DOURADAS),150000);
  assert.equal(total(COFRES.CENTRO),0);
  assert.equal(total(COFRES.ESQUERDA),0);
  assert.equal(total(COFRES.DIREITA),0);
  assert.equal(f.totalLoopCentavos,150000);
  assert.equal(f.centroAssumidoPeloLoop,true);
  assert.deepEqual(f.vendas.map(v=>v.destinoCiclo),esperados);
 }
 const id='ciclo-douradas-protegido';
 assert.equal(raiz.registrarCicloFicticio({cicloId:id,centroPosicao:dourada}).repetido,false);
 assert.equal(raiz.registrarCicloFicticio({cicloId:id,centroPosicao:dourada}).repetido,true);
 const extrato=raiz.consultar();
 assert.equal(extrato.caixas.find(x=>x.id===COFRES.DOURADAS).saldoProjetadoCentavos,150000);
 assert.equal(extrato.caixas.find(x=>x.id===COFRES.CENTRO).saldoProjetadoCentavos,0);
 assert.equal(extrato.caixas.find(x=>x.id===COFRES.ESQUERDA).saldoProjetadoCentavos,0);
 assert.equal(extrato.caixas.find(x=>x.id===COFRES.DIREITA).saldoProjetadoCentavos,0);
});

test('snapshot historico V1 conserva partilha antiga e novo ciclo dourado V2 vai integral ao cofre',()=>{
 const inicio=new SimuladorLoop({relogio:()=> '2030-01-01T12:00:00.000Z'});
 for(let i=1;i<=7;i++)inicio.registrarPosicaoSimulada({
  nome:'Posicao teste dourada '+i,participanteId:'empresa-legado-'+i,
  vendaId:'posicao-historica-'+i,adesaoPendente:true
 });
 inicio.prepararTabuleiro();
 const v1=['LOOP_DOURADAS','LOOP_ESQUERDA','LOOP_DOURADAS',
  'LOOP_DIREITA','LOOP_DOURADAS','LOOP_ESQUERDA'];
 inicio.registrarVendaNoCicloSimulada({vendaId:'v1-legado-1'});
 // Um snapshot existente na instalacao anterior nao possui marcador V2.
 delete inicio.tabuleiro.vendasDoCiclo[0].regraDourada;
 for(let i=2;i<=3;i++)inicio.registrarVendaNoCicloSimulada({vendaId:'v1-legado-'+i});
 let volta=SimuladorLoop.restaurarSnapshot(inicio.exportarSnapshot());
 for(let i=4;i<=6;i++)volta.registrarVendaNoCicloSimulada({vendaId:'v1-legado-'+i});
 assert.deepEqual(volta.tabuleiro.vendasDoCiclo.map(v=>v.destinoCofre),v1);
 volta.abrirCatraca();assert.equal(volta.tentarGiro().girou,true);
 const novo=volta.registrarVendaNoCicloSimulada({vendaId:'v2-novo-1'}).venda;
 assert.equal(novo.regraDourada,'DOURADA_INTEGRAL_V2');
 assert.equal(novo.destinoCofre,'LOOP_DOURADAS');
 for(let i=2;i<=6;i++)volta.registrarVendaNoCicloSimulada({vendaId:'v2-novo-'+i});
 const restaurado=SimuladorLoop.restaurarSnapshot(volta.exportarSnapshot());
 assert.deepEqual(restaurado.tabuleiro.ciclosConcluidos[0].vendas.map(v=>v.destinoCofre),v1);
 assert.deepEqual(restaurado.tabuleiro.vendasDoCiclo.map(v=>v.destinoCofre),
  Array(6).fill('LOOP_DOURADAS'));
 assert.equal(restaurado.tabuleiro.vendasDoCiclo.every(v=>v.regraDourada==='DOURADA_INTEGRAL_V2'),true);
});
