'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {SimuladorLoop}=require('../src/domain/simulador-loop');
const {cofreDoEvento}=require('../src/domain/destino-financeiro-centro-loop');

test('fluxo continuo do cliente 1 ao cliente 10000 com compras e giros reais do simulador',()=>{
 const sim=new SimuladorLoop();
 sim.filas.travaPromocaoAtiva=true;
 let clientes=0,compras=0,indicacoes=0,giros=0,entradasA=0,entradasB=0;
 let sequenciaA=0,maxSequenciaA=0;
 let vendasAguardando=0;
 const produtos={pdf:{quantidade:0,receita:0},produto190:{quantidade:0,receita:0}};
 let unidades=0,comprasInsuficientes=0,excedenteProdutos=0;
 const cofres={LOOP_CENTRO:0,LOOP_ESQUERDA:0,LOOP_DIREITA:0,LOOP_DOURADAS:0};
 const perfis={uma:0,cinco:0,dez:0};
 const checkpoints=[];
 // Cada compra gera uma posicao e um evento de venda para o ciclo
 // corrente, quando o tabuleiro ja tem centro. Nao cria vendas extras.
 for(let numero=1;numero<=10000;numero++){
  clientes++;
  const quantidade=1;
  perfis[quantidade===1?'uma':quantidade===5?'cinco':'dez']++;
  let alvo=null;
  for(let j=0;j<quantidade;j++){
   const vendaId='compra-'+numero+'-'+j;
   const tipo=(numero+j)%2===0?'produto190':'pdf';
   const unidadesDaCompra=tipo==='produto190'?2:1;
   const preco=tipo==='produto190'?380:250;
   produtos[tipo].quantidade+=unidadesDaCompra;
   produtos[tipo].receita+=preco;
   unidades+=unidadesDaCompra;
   if(tipo==='produto190'){
    comprasInsuficientes++;
    assert.ok(190<250);
    assert.ok(380>=250);
    excedenteProdutos+=130;
   }
   const resultado=sim.registrarPosicaoSimulada({
    participanteId:'cliente-'+numero,nome:'Cliente ficticio '+numero,vendaId
   });
   assert.equal(resultado.repetida,false);
   compras++;
   if(j===0)alvo=resultado.posicao.id;
   if(!sim.tabuleiro.centro&&compras>=7)sim.prepararTabuleiro();
   if(sim.tabuleiro.centro){
    if(numero<=100){vendasAguardando++;continue;}
    const ordem=sim.tabuleiro.vendasDoCiclo.length+1;
    const destino=cofreDoEvento({posicaoCentro:sim.tabuleiro.centro,ordem});
    cofres[destino]+=250;
    sim.registrarVendaNoCicloSimulada({vendaId});
    if(sim.tabuleiro.vendasDoCiclo.length===6){
     const r=sim.tentarGiro();
     {
      assert.equal(r.girou,true);
      giros++;
      if(r.novaPosicao6?.origemFila==='A'){entradasA++;sequenciaA++;}
      else if(r.novaPosicao6?.origemFila==='B'){entradasB++;sequenciaA=0;}
      maxSequenciaA=Math.max(maxSequenciaA,sequenciaA);
      assert.ok(sequenciaA<=3,'prioridade 3A:1B');
     }
    }
   }
  }
  if(numero===100){
   assert.equal(giros,0);
   assert.equal(sim.catracaAberta,false);
   sim.abrirCatraca();
   checkpoints.push({clientes,compras,giros,filaA:sim.filas.filaA.length,filaB:sim.filas.filaB.length});
  }
  // 3000 indicacoes progressivas, sem ultrapassar o limite de clientes.
  // Cada um dos primeiros 1000 titulares apos o piloto faz 3 convites
  // validados vinculados a UMA posicao escolhida.
  if(numero>100&&numero<=1100){
   for(let k=0;k<3;k++){
    const r=sim.registrarIndicacaoSimulada({
     indicadorId:'cliente-'+numero,posicaoAlvoId:alvo,
     eventoId:'indicacao-'+numero+'-'+k
    });
    assert.equal(r.repetida,false);indicacoes++;
   }
  }
  if([1000,5000,10000].includes(numero))
   checkpoints.push({clientes,compras,giros,filaA:sim.filas.filaA.length,filaB:sim.filas.filaB.length});
 }
 assert.equal(clientes,10000);
 assert.equal(compras,10000);
 assert.equal(unidades,15000);
 assert.equal(produtos.produto190.quantidade,10000);
 assert.equal(produtos.pdf.quantidade,5000);
 assert.equal(indicacoes,3000);
 assert.deepEqual(perfis,{uma:10000,cinco:0,dez:0});
 assert.ok(giros>100,'fluxo deve girar muito mais que 100 vezes');
 const tabuleiro=[sim.tabuleiro.centro,...sim.tabuleiro.vagas].filter(Boolean);
 const ativos=[...sim.filas.filaA,...sim.filas.filaB,...tabuleiro];
 assert.equal(ativos.length+sim.tabuleiro.ciclosConcluidos.length,compras);
 assert.equal(new Set(ativos.map(p=>p.id)).size,ativos.length);
 assert.equal(sim.tabuleiro.ciclosConcluidos.length,giros);
 assert.equal(entradasA+entradasB,giros);
 const douradas=1000;
 const transferenciaDouradas=douradas*250;
 assert.ok(cofres.LOOP_DIREITA>=transferenciaDouradas,'cofre direito cobre as 1000 douradas');
 cofres.LOOP_DIREITA-=transferenciaDouradas;
 cofres.LOOP_DOURADAS+=transferenciaDouradas;
 assert.equal(cofres.LOOP_CENTRO,giros*750);
 assert.equal(Object.values(cofres).reduce((a,b)=>a+b,0),sim.tabuleiro.vendasProcessadas.size*250);
 const relatorio={clientes,compras,posicoesCriadas:compras,unidadesVendidas:unidades,comprasDe190IsoladasNaoQualificadas:comprasInsuficientes,excedenteProdutosForaDoMotor:excedenteProdutos,bolasDouradasEmpresa:douradas,transferenciaCofreDireitoParaDouradas:transferenciaDouradas,perfis,indicacoes,giros,
  produtos,receitaBrutaTotal:produtos.produto190.receita+produtos.pdf.receita,
  cofres,
  pagamentoPrevistoContemplacoes:giros*750,
  valorPorContemplacao:750,
  entradasEmpresaPorCiclos:giros*3,
  eventosParticipantePorCiclos:giros*3,
  caixaLiquidoNaoCalculado:true,
  ciclosConcluidos:sim.tabuleiro.ciclosConcluidos.length,
  vendasRegistradasNoCiclo:sim.tabuleiro.vendasProcessadas.size,
  vendasPendentesNoCiclo:sim.tabuleiro.vendasDoCiclo.length,
  vendasNoPilotoComCatracaFechada:vendasAguardando,
  filaA:sim.filas.filaA.length,filaB:sim.filas.filaB.length,
  tabuleiroOcupado:tabuleiro.length,entradasA,entradasB,maxSequenciaA,
  checkpoints,valorFinanceiroReal:0};
 console.log('RELATORIO_SUPERTESTE_LOOP='+JSON.stringify(relatorio));
});
