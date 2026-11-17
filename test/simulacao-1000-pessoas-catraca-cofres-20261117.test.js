'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SimuladorLoop}=require('../src/domain/simulador-loop');
const {analisarCarrinhoSimulado}=require('../src/domain/valor-padrao-loop');
const {centroDoLoop}=require('../src/domain/destino-financeiro-centro-loop');

test('1000 pessoas: compras AKITEMM, fila, catraca, 20 azuis, 80 desistencias e cofres',()=>{
 const sim=new SimuladorLoop({relogio:(()=>{let t=0;return ()=>new Date(Date.UTC(2026,10,1)+t++*1000).toISOString()})()});
 sim.filas.travaPromocaoAtiva=true;
 const cofres={LOOP_CENTRO:0,LOOP_ESQUERDA:0,LOOP_DIREITA:0,LOOP_DOURADAS:0};
 const pessoas=new Set(),historico=[],vendas=[],posicoes=[];
 let faturamento=0,fornecedor=0,loja=0,loop=0,qualificados=0,naoQualificados=0;
 let azuisCriadas=0,azuisConvertidas=0,desistencias=0,giros=0,centrosClientes=0,centrosDourados=0,indicacoes=0;
 let ultimoId=null,entradasA=0,entradasB=0,pendentesNoCiclo=0;
 function registrarEvento(id){
  const e=sim.registrarVendaNoCicloSimulada({vendaId:id});
  assert.equal(e.repetida,false);
  if(!e.elegivelParaGiro)return;
  assert.equal(sim.tentarGiro().motivo,'CATRACA_PAUSADA');
  sim.abrirCatraca();
  const r=sim.tentarGiro();assert.equal(r.girou,true);
  sim.pausarCatraca();giros++;
  const ciclo=sim.tabuleiro.ciclosConcluidos.at(-1);
  if(centroDoLoop(ciclo.centro))centrosDourados++;else centrosClientes++;
  for(const v of ciclo.vendas){assert.ok(Object.hasOwn(cofres,v.destinoCofre));cofres[v.destinoCofre]+=25000}
  if(r.novaPosicao6){
   if(r.novaPosicao6.origemFila==='A')entradasA++;else if(r.novaPosicao6.origemFila==='B')entradasB++;else assert.fail('fila ausente');
   if(r.novaPosicao6.statusAdesao==='PRAZO_ENCERRADO'){azuisConvertidas++;assert.equal(r.novaPosicao6.empresa,true)}
   else if(desistencias<80){
    const d=sim.registrarDesistenciaNaVaga6Simulada({posicaoId:r.novaPosicao6.id,aceiteExpresso:true});
    assert.equal(d.assumidaPeloLoop,true);desistencias++;
   }
  }
  historico.push({giro:giros,centroId:ciclo.centro.id,centroDourado:centroDoLoop(ciclo.centro),filaA:sim.filas.filaA.length,filaB:sim.filas.filaB.length,cofres:{...cofres}});
 }
 for(let n=1;n<=1000;n++){
  const id='pessoa-'+n;assert.ok(!pessoas.has(id));pessoas.add(id);
  const dia=n<=100?Math.floor((n-1)*30/100)+1:31+Math.floor((n-101)*6/900);
  const qualifica=n%10<7; // 700 pedidos de duas unidades, 300 de uma unidade
  const quantidade=qualifica?2:1;
  const carrinho=analisarCarrinhoSimulado({itens:[{produtoId:'produto-verde-190',quantidade,precoUnitarioCentavos:19000,custoUnitarioCentavos:5000}]});
  assert.equal(carrinho.participaLoopSeConfirmado,qualifica);
  faturamento+=carrinho.precoTotalCentavos;fornecedor+=carrinho.custoFornecedorCentavos;
  if(!qualifica){naoQualificados++;loja+=carrinho.precoTotalCentavos-carrinho.custoFornecedorCentavos;continue}
  qualificados++;loop+=25000;loja+=carrinho.sobraComercialCentavos;
  const azul=qualificados>=8&&qualificados<=27;
  const r=sim.registrarPosicaoSimulada({participanteId:id,vendaId:'pedido-'+n,adesaoPendente:azul});
  assert.equal(r.repetida,false);posicoes.push(r.posicao);if(azul)azuisCriadas++;
  vendas.push('pedido-'+n);
  if(qualificados===7){
   sim.prepararTabuleiro();
   assert.equal(sim.tabuleiro.vagas.filter(Boolean).length,6);
   for(const venda of vendas.slice(0,5))registrarEvento(venda);
  }else if(qualificados===8){for(const venda of vendas.slice(5))registrarEvento(venda)}else if(qualificados>8)registrarEvento('pedido-'+n);
  if(qualificados>30&&qualificados%10===0){
   const alvo=sim.filas.filaB.find(p=>p.statusAdesao!=='PENDENTE');
   if(alvo){
    const r=sim.registrarIndicacaoSimulada({indicadorId:alvo.participanteId,posicaoAlvoId:alvo.id,eventoId:'indicacao-'+n});
    assert.equal(r.repetida,false);indicacoes++;
   }
  }
  if(n===100||n===1000)historico.push({marcoPessoas:n,dia,giros,qualificados,cofres:{...cofres}});
 }
 assert.equal(pessoas.size,1000);assert.equal(qualificados,700);assert.equal(naoQualificados,300);
 assert.equal(azuisCriadas,20);assert.equal(azuisConvertidas,20);assert.equal(desistencias,80);
 assert.equal(azuisConvertidas+desistencias,100);
 assert.equal(giros,116);assert.equal(centrosClientes+centrosDourados,giros);
 assert.equal(faturamento,32300000);assert.equal(fornecedor,8500000);
 assert.equal(loop,17500000);assert.equal(loja,6300000);
 const alocado=Object.values(cofres).reduce((a,b)=>a+b,0);
 pendentesNoCiclo=sim.tabuleiro.vendasDoCiclo.length;
 assert.equal(pendentesNoCiclo,4);assert.equal(alocado+pendentesNoCiclo*25000,loop);
 assert.equal(sim.filas.filaA.length+sim.filas.filaB.length+7+giros,700);
 assert.equal(entradasA+entradasB,giros);
 assert.equal(new Set([...sim.filas.filaA,...sim.filas.filaB,sim.tabuleiro.centro,...sim.tabuleiro.vagas,...sim.tabuleiro.ciclosConcluidos.map(c=>c.centro)].filter(Boolean).map(p=>p.id)).size,700);
 const relatorio={modalidade:'MOTOR_DE_SIMULACAO_REAL_DO_REPOSITORIO_SEM_DINHEIRO_REAL',pessoas:1000,limiteExato:1000,periodoDias:36,comprasQualificadas:700,comprasNaoQualificadas:300,unidades:1700,receitaReais:faturamento/100,fornecedorReais:fornecedor/100,loopAlocadoReais:loop/100,akitemmBrutoAntesComissoesImpostosTaxasReais:loja/100,giros,centrosClientes,centrosDourados,azuisCriadas,azuisConvertidas,desistencias,ouroCriado:100,ouroNoTabuleiro:[sim.tabuleiro.centro,...sim.tabuleiro.vagas].filter(centroDoLoop).length,ouroConcluido:sim.tabuleiro.ciclosConcluidos.filter(c=>centroDoLoop(c.centro)).length,cofresReais:Object.fromEntries(Object.entries(cofres).map(([k,v])=>[k,v/100])),loopAguardandoProximoCicloReais:pendentesNoCiclo*250,girosFilaA:entradasA,girosFilaB:entradasB,filaA:sim.filas.filaA.length,filaB:sim.filas.filaB.length,indicacoes,amostras:historico.filter(x=>x.marcoPessoas||[1,20,50,80,100,116].includes(x.giro))};
 console.log('RELATORIO_1000_PONTA_A_PONTA='+JSON.stringify(relatorio));
});
