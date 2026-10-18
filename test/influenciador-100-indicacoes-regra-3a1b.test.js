'use strict';

// Regra aprovada: titular com varias posicoes pode concentrar indicacoes,
// mas nunca contorna a proporcao global tres A / uma B ao abastecer a vaga 6.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {SimuladorLoop}=require('../src/domain/simulador-loop');

function movimento(simulador,numero){
 for(let evento=1;evento<=6;evento++){
  simulador.registrarVendaNoCicloSimulada({
   vendaId:'evento-do-ciclo-'+numero+'-'+evento
  });
 }
 simulador.abrirCatraca();
 const resposta=simulador.tentarGiro();
 simulador.pausarCatraca();
 assert.equal(resposta.girou,true,'giro ficticio '+numero);
 return resposta.novaPosicao6;
}

test('100 indicacoes em quatro posicoes, quinta vaga e preferencia 3A/1B coexistem',()=>{
 const sim=new SimuladorLoop();
 sim.filas.travaPromocaoAtiva=true;
 sim.filas.vagaLiberacao=5;

 // Sete posicoes em B preenchem centro + seis vagas iniciais.
 // Outras permanecem na B para comprovar sua vez independente dos indicados.
 for(let i=0;i<32;i++){
  sim.registrarPosicaoSimulada({
   participanteId:'titular-branco-'+i,vendaId:'pedido-branco-'+i
  });
 }
 sim.prepararTabuleiro();
 const doInfluenciador=Array.from({length:6},(_,i)=>
  sim.registrarPosicaoSimulada({
   participanteId:'influenciador',vendaId:'pedido-influenciador-'+i
  }).posicao.id
 );
 // Cem convites distintos, 25 por cada uma das quatro primeiras posicoes.
 for(let pos=0;pos<4;pos++)for(let n=0;n<25;n++){
  sim.registrarIndicacaoSimulada({
   indicadorId:'influenciador',
   eventoId:'indicacao-validada-'+pos+'-'+n,
   posicaoAlvoId:doInfluenciador[pos]
  });
 }
 const concorrentes=Array.from({length:3},(_,i)=>{
  const id='titular-amarelo-'+i;
  const p=sim.registrarPosicaoSimulada({
   participanteId:id,vendaId:'pedido-amarelo-'+i
  }).posicao;
  sim.registrarIndicacaoSimulada({
   indicadorId:id,eventoId:'indicacao-outro-'+i,posicaoAlvoId:p.id
  });
  return p.id;
 });
 function conferirFila(){
  const naAmarela=sim.filas.filaA.filter(p=>p.participanteId==='influenciador');
  assert.ok(naAmarela.length<=1,'um titular nao pode ocupar duas vagas da A');
  const todas=[...sim.filas.filaA,...sim.filas.filaB,
   sim.tabuleiro.centro,...sim.tabuleiro.vagas,
   ...sim.tabuleiro.ciclosConcluidos.map(c=>c.centro)].filter(Boolean);
  const p=doInfluenciador.map(id=>todas.find(v=>v.id===id));
  assert.ok(p.every(Boolean),'todas as seis posicoes permanecem rastreaveis');
  assert.deepEqual(p.map(x=>x.indicacoesVinculadas||0),[25,25,25,25,0,0]);
 }
 conferirFila();
 assert.deepEqual(sim.filas.filaA.filter(x=>x.participanteId==='influenciador').map(x=>x.id),
  [doInfluenciador[0]]);
 assert.deepEqual(sim.filas.filaB.filter(x=>x.participanteId==='influenciador').map(x=>x.id),
  doInfluenciador.slice(1));

 const entradas=[];
 for(let giro=1;giro<=8;giro++){
  const selecao=movimento(sim,giro);
  entradas.push({origem:selecao?.origemFila,pessoa:selecao?.id});
  conferirFila();
  if(giro===1)assert.equal(sim.filas.filaA.some(p=>p.id===doInfluenciador[1]),false,
   'vaga 6 ainda nao permite segunda amarela quando limite e vaga 5');
  if(giro===2)assert.equal(sim.filas.filaA[0]?.id,doInfluenciador[1],
   'posicao 2 fica na frente da A somente apos a 1 chegar na vaga 5');
  if(giro===4)assert.equal(sim.filas.filaA[0]?.id,doInfluenciador[2],
   'posicao 3 so concorre quando a 2 chegar na vaga 5');
  if(giro===6)assert.equal(sim.filas.filaA[0]?.id,doInfluenciador[3],
   'posicao 4 so concorre quando a 3 chegar na vaga 5');
 }
 assert.deepEqual(entradas.map(x=>x.origem),['A','A','A','B','A','A','A','B']);
 assert.deepEqual(entradas.map(x=>x.pessoa),
  [doInfluenciador[0],concorrentes[0],doInfluenciador[1],8,
   doInfluenciador[2],concorrentes[1],doInfluenciador[3],9]);
 assert.equal(sim.filas.contadorA,0,'quota de B zerou o contador apos 3A/1B');
 assert.equal(sim.filas.filaB.find(p=>p.id===doInfluenciador[4])?.indicacoesVinculadas,undefined);
 assert.equal(sim.filas.filaB.find(p=>p.id===doInfluenciador[5])?.indicacoesVinculadas,undefined);
});

test('a proporcao global continua superior a prioridade individual apos snapshot',()=>{
 const sim=new SimuladorLoop();
 sim.filas.travaPromocaoAtiva=true;
 sim.filas.vagaLiberacao=5;
 for(let i=0;i<7;i++)sim.registrarPosicaoSimulada({
  participanteId:'base-'+i,vendaId:'base-'+i
 });
 sim.prepararTabuleiro();
 const candidatos=Array.from({length:4},(_,i)=>{
  const p=sim.registrarPosicaoSimulada({
   participanteId:'amarelo-'+i,vendaId:'amarelo-'+i
  }).posicao;
  sim.registrarIndicacaoSimulada({
   indicadorId:'amarelo-'+i,posicaoAlvoId:p.id,eventoId:'convite-'+i
  });
  return p.id;
 });
 const branco=sim.registrarPosicaoSimulada({participanteId:'branco',vendaId:'branco'}).posicao;
 assert.deepEqual([1,2].map(i=>movimento(sim,i).id),candidatos.slice(0,2));
 const estado=sim.exportarSnapshot();
 const restaurado=SimuladorLoop.restaurarSnapshot(estado);
 restaurado.filas.travaPromocaoAtiva=true;
 restaurado.filas.vagaLiberacao=5;
 assert.equal(restaurado.filas.contadorA,2);
 assert.equal(movimento(restaurado,3).id,candidatos[2]);
 const quarta=movimento(restaurado,4);
 assert.equal(quarta.id,branco.id);
 assert.equal(quarta.origemFila,'B','mesmo com amarelas aguardando, a quarta e branca');
 assert.equal(restaurado.filas.contadorA,0);
});
