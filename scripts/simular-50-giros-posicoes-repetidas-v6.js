'use strict';
// Teste de filas e identificadores da V6 com varias posicoes por titular,
// isolado do banco comercial e SEM qualquer pagamento real.
const assert=require('node:assert/strict');
const {SimuladorLoop}=require('../src/domain/simulador-loop');

function executar50GirosComTitularesRepetidos(){
 let t=0;const relogio=()=>new Date(Date.UTC(2026,9,17)+t++*1000).toISOString();
 const sim=new SimuladorLoop({relogio});
 let posicoes=0,convites=0,promocoes=0,entradasA=0,entradasB=0;
 const criadasPorConta=new Map(),concluidasPorConta=new Map();
 function novaPosicao(participanteId){
  const cadastradas=criadasPorConta.get(participanteId)||0;
  assert.ok(cadastradas<6,'maximo de seis posicoes por titular no cenario');
  const numero=++posicoes;
  const r=sim.registrarPosicaoSimulada({
   participanteId,nome:'Perfil '+participanteId,
   vendaId:'compra-multiposicao-'+numero
  });
  assert.equal(r.repetida,false);
  criadasPorConta.set(participanteId,cadastradas+1);
  return r.posicao;
 }
 for(let i=1;i<=25;i++)for(let p=0;p<4;p++)
  novaPosicao('grupo-inicial-'+i);
 sim.prepararTabuleiro();
 assert.equal(sim.filas.filaB.length,93);
 sim.abrirCatraca();
 let seqConvite=0;
 const control=[];
 for(let giro=1;giro<=50;giro++){
  const centro=sim.tabuleiro.centro.id;
  const vagasAntes=sim.tabuleiro.vagas.map(v=>v.id);
  for(let venda=1;venda<=6;venda++){
   const titular='grupo-novo-'+giro;
   novaPosicao(titular); // Seis cadeiras de um MESMO titular
   if(giro<=12&&venda<=1+(giro%4)){
    // Pessoas com uma a quatro indicacoes, incrementando a
    // prioridade das suas quatro cadeiras quando estao em A.
    const indicador='grupo-inicial-'+(giro+10);
    const estavaB=sim.filas.filaB.some(p=>p.participanteId===indicador);
    const chamada=sim.registrarIndicacaoSimulada({
     indicadorId:indicador,eventoId:'convite-repetidos-'+(++seqConvite),
     convidouEm:relogio()
    });
    convites++;
    if(estavaB){
     promocoes++;
     assert.equal(chamada.promovidas.length,4,
      'um convite migra todas as quatro posicoes do mesmo titular que estejam em B');
    }else assert.equal(chamada.promovidas.length,0);
   }
   const evento=sim.registrarVendaNoCicloSimulada({
    vendaId:'evento-multiposicao-'+giro+'-'+venda
   });
   assert.equal(evento.venda.posicaoCentroId,centro);
  }
  const giroFeito=sim.tentarGiro();
  assert.equal(giroFeito.girou,true);
  assert.equal(giroFeito.centroConcluido.id,centro);
  assert.equal(sim.tabuleiro.centro.id,vagasAntes[0]);
  for(let i=0;i<5;i++)assert.equal(sim.tabuleiro.vagas[i].id,vagasAntes[i+1]);
  assert.ok(sim.tabuleiro.vagas[5]);
  if(sim.tabuleiro.vagas[5].origemFila==='A')entradasA++;
  else entradasB++;
  const p=giroFeito.centroConcluido.participanteId;
  concluidasPorConta.set(p,(concluidasPorConta.get(p)||0)+1);
  const naFila=sim.filas.filaA.length+sim.filas.filaB.length;
  assert.equal(naFila,93+giro*5);
  assert.equal(sim.tabuleiro.ciclosConcluidos.length,giro);
  const ativos=[...sim.filas.filaA,...sim.filas.filaB,sim.tabuleiro.centro,...sim.tabuleiro.vagas]
   .filter(Boolean);
  const historicos=sim.tabuleiro.ciclosConcluidos.map(x=>x.centro);
  assert.equal(ativos.length+historicos.length,posicoes);
  assert.equal(new Set([...ativos,...historicos].map(x=>x.id)).size,posicoes);
  if(giro%10===0)control.push({giro,aguardando:naFila,
   filaA:sim.filas.filaA.length,filaB:sim.filas.filaB.length,
   centrosConcluidos:historicos.length,
   titularesDistintosConcluidos:concluidasPorConta.size});
 }
 assert.equal(posicoes,400);
 assert.equal(criadasPorConta.size,75);
 assert.equal(sim.tabuleiro.ciclosConcluidos.length,50);
 assert.equal(sim.filas.filaA.length+sim.filas.filaB.length,343);
 assert.ok(promocoes>=5);
 assert.equal(entradasA+entradasB,50);
 assert.ok(concluidasPorConta.size<50,
  'varias posicoes do mesmo titular devem concluir ciclos');
 return {
  modo:'GIROS_REPETIDOS_100_POR_CENTO_FICTICIOS',
  giroTotal:50,centrosConcluidos:50,posicoesTotais:posicoes,
  titularesDistintos:criadasPorConta.size,
  titularesDistintosComCentroConcluido:concluidasPorConta.size,
  contasIniciais:25,contasNovas:50,
  maximoPosicoesPorPessoa:6,
  filaA:sim.filas.filaA.length,filaB:sim.filas.filaB.length,
  aguardando:343,convites,promocoesDeTitularComQuatroPosicoes:promocoes,
  entradasA,entradasB,
  control,
  saldoRealCentavos:0,saquesReais:0,pagamentosReais:0
 };
}
if(require.main===module){
 try{process.stdout.write(JSON.stringify(executar50GirosComTitularesRepetidos(),null,2)+'\n');}
 catch(e){process.stderr.write(e.stack+'\n');process.exitCode=1;}
}
module.exports={executar50GirosComTitularesRepetidos};
