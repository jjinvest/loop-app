'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SimuladorLoop}=require('../src/domain/simulador-loop');
const {cofreDoEvento}=require('../src/domain/destino-financeiro-centro-loop');

test('1000 azuis pendentes convertem em douradas somente ao cruzar vaga 6, sem duplicar posicoes',()=>{
 const sim=new SimuladorLoop();
 // Sete ocupantes iniciais confirmados, para testar as conversoes subsequentes.
 for(let i=0;i<7;i++)sim.registrarPosicaoSimulada({participanteId:'inicial-'+i,vendaId:'inicial-'+i});
 sim.prepararTabuleiro();
 sim.abrirCatraca();
 for(let i=0;i<1000;i++){
  sim.registrarPosicaoSimulada({participanteId:'pendente-'+i,vendaId:'pendente-'+i,adesaoPendente:true});
 }
 let douradasCriadas=0,giros=0,entradasNoCofreDouradas=0;
 for(let ciclo=0;ciclo<1000;ciclo++){
  for(let ordem=1;ordem<=6;ordem++){
   const destino=cofreDoEvento({posicaoCentro:sim.tabuleiro.centro,ordem});
   if(destino==='LOOP_DOURADAS')entradasNoCofreDouradas+=250;
   sim.registrarVendaNoCicloSimulada({vendaId:'evento-ciclo-'+ciclo+'-'+ordem});
  }
  const r=sim.tentarGiro();
  assert.equal(r.girou,true);
  assert.equal(r.novaPosicao6?.empresa,true);
  assert.equal(r.novaPosicao6?.statusAdesao,'PRAZO_ENCERRADO');
  assert.equal(r.novaPosicao6?.entradaPelaVaga6Em!==undefined,true);
  douradasCriadas++;giros++;
 }
 assert.equal(douradasCriadas,1000);
 assert.equal(giros,1000);
 assert.equal(sim.filas.filaA.length+sim.filas.filaB.length,0);
 const atuais=[sim.tabuleiro.centro,...sim.tabuleiro.vagas].filter(Boolean);
 const concluidas=sim.tabuleiro.ciclosConcluidos.map(c=>c.centro);
 assert.equal(atuais.length+concluidas.length,1007);
 assert.equal(new Set([...atuais,...concluidas].map(p=>p.id)).size,1007);
 const douradasConcluidas=concluidas.filter(p=>p.empresa===true).length;
 assert.equal(douradasConcluidas,993);
 assert.equal(entradasNoCofreDouradas,douradasConcluidas*750);
 console.log('RELATORIO_DOURADAS_1000='+JSON.stringify({douradasCriadas,giros,douradasConcluidas,douradasNoTabuleiro:7,entradasNoCofreDouradas,conservacaoPosicoes:1007}));
});
