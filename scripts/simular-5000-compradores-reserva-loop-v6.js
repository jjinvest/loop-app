'use strict';

// Experimento fechado: 5.000 compradores diferentes, cada um compra UMA
// unidade. 2.500 PDFs a R$250 (qualificam a posicao), 2.500 produtos fisicos
// a R$190 (somente loja: NAO criam posicao). Fundador ocupa o centro
// antes das vendas, sem compra de fundador. Sem pagamentos ou saques reais.
const assert=require('node:assert/strict');
const {SimuladorLoop}=require('../src/domain/simulador-loop');
const {analisarCarrinhoSimulado}=require('../src/domain/valor-padrao-loop');
const {centroDoLoop}=require('../src/domain/destino-financeiro-centro-loop');

const LIMITE=5000,PRECO_PDF=25000,PRECO_FISICO=19000, META_OURO_RESERVA=100;
function executarCenario5000({primeiraFila='A',intensidade='ALTA',usarCofreReserva=true}={}){
 assert.ok(['A','B'].includes(primeiraFila));
 assert.ok(['ALTA','MODERADA'].includes(intensidade));
 let tick=0;
 const relogio=()=>new Date(Date.UTC(2026,9,21)+(tick++)*1000).toISOString();
 const sim=new SimuladorLoop({relogio});
 // Proibe promocao por usuario ou sem posicao-alvo; libera so apos
 // indicacao individual explicita e validada.
 sim.filas.travaPromocaoAtiva=true;
 const fundador=sim.registrarPosicaoSimulada({
  participanteId:'fundador',nome:'Fundador (centro inicial)'
 }).posicao;
 sim.prepararTabuleiro();
 assert.equal(sim.tabuleiro.centro.id,fundador.id);
 assert.equal(sim.tabuleiro.vagas.filter(Boolean).length,0);
 const posicoesPDF=[],compras=new Map(),historicoIndicador=new Map();
 const eventosFinanceiros={LOOP_CENTRO:0,LOOP_ESQUERDA:0,LOOP_DIREITA:0,LOOP_DOURADAS:0};
 const convertidasDouradas=new Set(),entregasAzuis=[],histA=[],giros=[];
 const reservasDouradas=[],historicoReserva=[];
 let numerosPDF=0,numerosFisicos=0,valorBrutoCentavos=0,indicacoes=0;
 let ciclosClientes=0,ciclosDouradas=0,ciclosFundador=0,entradasA=0,entradasB=0;
 let ciclosDouradasDeReserva=0,ciclosDouradasDeAzul=0;
 let cofreReservaBrutoCentavos=0,reservaInsuficienteEventos=0;
 let emExecucao=false,primeiraEntrada=null,comprasNoMotor=0,bonusReferenciaCentavos=0;
 const posicaoNoSistema=p=>[...sim.filas.filaA,...sim.filas.filaB,
  sim.tabuleiro.centro,...sim.tabuleiro.vagas].some(x=>x&&x.id===p.id);
 const estaNaFila=p=>sim.filas.filaA.some(x=>x.id===p.id)||
  sim.filas.filaB.some(x=>x.id===p.id);

 function indicar(indicador,posicaoConvidado,origem){
  assert.ok(estaNaFila(indicador.posicao),'Atribuicao somente a posicao ativa do titular');
  assert.notEqual(indicador.posicao.participanteId,posicaoConvidado.participanteId);
  const id='convite-pdf-'+posicaoConvidado.id+'-'+origem;
  const antes=sim.filas.filaA.some(x=>x.id===indicador.posicao.id);
  const r=sim.registrarIndicacaoSimulada({
   indicadorId:indicador.posicao.participanteId,
   eventoId:id,posicaoAlvoId:indicador.posicao.id,convidouEm:relogio()
  });
  assert.equal(r.repetida,false);
  indicacoes++;
  const n=(historicoIndicador.get(indicador.posicao.id)||0)+1;
  assert.ok(n<=4);historicoIndicador.set(indicador.posicao.id,n);
  histA.push({compraPdf:numerosPDF,indicador:indicador.posicao.id,
   compradoPor:posicaoConvidado.id,primeiraPromocao:!antes});
  // Apenas referencia de 10% do PDF indicado. A origem do recurso
  // nao esta demonstrada; NAO e pagamento, credito nem lucro.
  bonusReferenciaCentavos+=Math.round(PRECO_PDF*0.1);
 }
 function registrarEvento(vendaId){
  assert.ok(compras.get(vendaId)?.elegivelLoop);
  const r=sim.registrarVendaNoCicloSimulada({vendaId});
  assert.equal(r.repetida,false);comprasNoMotor++;
  if(!r.elegivelParaGiro)return;
  assert.equal(sim.tentarGiro().motivo,'CATRACA_PAUSADA');
  sim.abrirCatraca();
  const resultado=sim.tentarGiro();
  assert.equal(resultado.girou,true);
  sim.pausarCatraca();
  const c=sim.tabuleiro.ciclosConcluidos.at(-1);
  if(centroDoLoop(c.centro)){
   ciclosDouradas++;
   if(c.centro.origemOperacional==='APORTE_RESERVA_SIMULADO')ciclosDouradasDeReserva++;
   else ciclosDouradasDeAzul++;
  }
  else if(c.centro.participanteId==='fundador')ciclosFundador++;
  else ciclosClientes++;
  for(const e of c.vendas){
   assert.ok(Object.hasOwn(eventosFinanceiros,e.destinoCofre));
   eventosFinanceiros[e.destinoCofre]+=PRECO_PDF;
  }
  // O motor do ciclo envia exatamente UMA parcela de R$250 ao cofre DIREITA.
  // Nao somar a receita da loja R$190, nem fabricar aportes no cofre.
  const parcelaDireita=c.vendas.filter(v=>v.destinoCofre==='LOOP_DIREITA').length*PRECO_PDF;
  cofreReservaBrutoCentavos+=parcelaDireita;
  if(usarCofreReserva&&reservasDouradas.length<META_OURO_RESERVA){
   const comprometidoBonificacoes=bonusReferenciaCentavos;
   const comprometidoDouradas=reservasDouradas.length*PRECO_PDF;
   const livre=cofreReservaBrutoCentavos-comprometidoBonificacoes-comprometidoDouradas;
   if(livre>=PRECO_PDF){
    // Um aporte de reserva contabilmente rastreado gera uma unica dourada
    // da EMPRESA na B, sem compra do cliente, sem saltar a fila nem girar.
    const p=sim.registrarPosicaoSimulada({
     participanteId:'LOOP_EMPRESA',nome:'Posicao dourada financiada pela reserva'
    }).posicao;
    const emB=sim.filas.filaB.find(x=>x.id===p.id);
    assert.ok(emB);
    Object.assign(emB,{empresa:true,titularOperacional:'LOOP_EMPRESA',
     statusAdesao:'POSICAO_LOOP',origemOperacional:'APORTE_RESERVA_SIMULADO',
     aporteInternoCentavos:PRECO_PDF,cofreOrigem:'LOOP_DIREITA'});
    reservasDouradas.push({giro:sim.giros,posicaoId:p.id,valorAporteCentavos:PRECO_PDF,
     cofreOrigem:'LOOP_DIREITA',livreAntesCentavos:livre,livreDepoisCentavos:livre-PRECO_PDF});
   } else reservaInsuficienteEventos++;
  }
  historicoReserva.push({giro:sim.giros,brutoCentavos:cofreReservaBrutoCentavos,
   bonificacoesComprometidasCentavos:bonusReferenciaCentavos,
   douradasFinanciadasCentavos:reservasDouradas.length*PRECO_PDF,
   livreCentavos:cofreReservaBrutoCentavos-bonusReferenciaCentavos-
    reservasDouradas.length*PRECO_PDF});
  const nova=resultado.novaPosicao6;
  if(nova){
   if(!primeiraEntrada)primeiraEntrada=nova.origemFila;
   if(nova.origemFila==='A')entradasA++;
   else if(nova.origemFila==='B')entradasB++;
   else assert.fail('Origem A/B ausente na vaga seis');
   if(nova.statusAdesao==='PRAZO_ENCERRADO'){
    assert.equal(nova.empresa,true);
    assert.equal(nova.titularOperacional,'LOOP_EMPRESA');
    assert.ok(!convertidasDouradas.has(nova.id),'So uma conversao por posicao');
    convertidasDouradas.add(nova.id);
    entregasAzuis.push({giro:sim.giros,posicaoId:nova.id,
     origem:nova.origemFila,azulAntes:true,douradaDepois:true});
   }
  }
  giros.push({giro:sim.giros,compradores:numerosPDF+numerosFisicos,
   filaA:sim.filas.filaA.length,filaB:sim.filas.filaB.length,
   centroEmpresa:centroDoLoop(c.centro),
   entradaVaga6:nova?.origemFila??null});
 }

 for(let n=1;n<=LIMITE;n++){
  const tipo=n%2?'PDF':'FISICO';
  const preco=tipo==='PDF'?PRECO_PDF:PRECO_FISICO;
  const auditoria=analisarCarrinhoSimulado({itens:[{
   produtoId:tipo==='PDF'?'pdf-loop-250':'produto-fisico-190',
   quantidade:1,precoUnitarioCentavos:preco,custoUnitarioCentavos:0
  }]});
  const vendaId='compra-'+n;
  compras.set(vendaId,{compradorId:'pessoa-'+n,tipo,precoCentavos:preco,
   elegivelLoop:auditoria.participaLoopSeConfirmado});
  valorBrutoCentavos+=preco;
  if(tipo==='FISICO'){
   numerosFisicos++;
   assert.equal(auditoria.participaLoopSeConfirmado,false);
   assert.equal(auditoria.projecaoPosicoesSeConfirmado,0);
   continue;
  }
  assert.equal(auditoria.participaLoopSeConfirmado,true);
  numerosPDF++;
  const azul=numerosPDF>=7&&numerosPDF<=106; // 100 azuis: 7 ... 106.
  const r=sim.registrarPosicaoSimulada({
   participanteId:'pessoa-'+n,nome:'Comprador simulado '+n,
   vendaId,adesaoPendente:azul
  });
  assert.equal(r.repetida,false);
  const posicao=r.posicao;
  posicoesPDF.push({indice:numerosPDF,posicao});
  // A primeira pessoa da A pode conquistar prioridade ANTES do start,
  // convidando a segunda pessoa que ja comprou PDF.
  if(primeiraFila==='A'&&numerosPDF===2){
   indicar(posicoesPDF[0],posicao,'primeiro-convite');
  }
  // Uma unica compra PDF indicada = uma indicacao valida. Em cada
  // caso o titular escolhe individualmente a propria posicao-alvo.
  const limiteInicial=intensidade==='ALTA'?28:64;
  const modulo=intensidade==='ALTA'?2:5;
  if(numerosPDF>=limiteInicial&&numerosPDF%modulo===0){
   const candidatos=posicoesPDF.slice(Math.max(0,posicoesPDF.length-25),-1)
    .filter(x=>x.indice>=27&&!x.posicao.statusAdesao&&
     estaNaFila(x.posicao)&&(historicoIndicador.get(x.posicao.id)||0)<4);
   const sponsor=candidatos.length?
    candidatos[(numerosPDF*7)%candidatos.length]:null;
   if(sponsor)indicar(sponsor,posicao,'compra-'+n);
  }
  if(numerosPDF===6){
   sim.prepararTabuleiro();
   assert.equal(sim.tabuleiro.vagas.filter(Boolean).length,6);
   assert.equal(sim.tabuleiro.vagas[0].origemFila,primeiraFila,
    'Primeiro ingresso deve respeitar A ou B do cenario');
  }
  // Adia os primeiros seis eventos ate aparecer a setima posicao,
  // garantindo reposicao legal da vaga seis no primeiro giro.
  if(numerosPDF===7){
   for(let z=1;z<=6;z++)registrarEvento('compra-'+(2*z-1));
   emExecucao=true;
  }
  if(emExecucao)registrarEvento(vendaId);
  assert.ok(posicaoNoSistema(posicao)||
   sim.tabuleiro.ciclosConcluidos.some(c=>c.centro.id===posicao.id));
 }
 assert.equal(numerosPDF,2500);
 assert.equal(numerosFisicos,2500);
 assert.equal(compras.size,LIMITE);
 assert.equal(valorBrutoCentavos,110000000);
 assert.equal(sim.filas.vendasRegistradas.size,2500);
 assert.equal(sim.tabuleiro.vendasProcessadas.size,2500);
 assert.equal(comprasNoMotor,2500);
 assert.equal(sim.giros,416,'2500 PDFs validos produzem 416 ciclos de 6');
 assert.equal(sim.tabuleiro.vendasDoCiclo.length,4);
 assert.equal(sim.tabuleiro.ciclosConcluidos.length,416);
 const azuisRestantes=[...sim.filas.filaA,...sim.filas.filaB]
  .filter(x=>x.statusAdesao==='PENDENTE').length;
 assert.equal(convertidasDouradas.size+azuisRestantes,100,
  'Nenhuma azul pode virar dourada fora da vaga seis ou desaparecer no limite de 5000');
 assert.ok(entregasAzuis.some(e=>e.giro>=1&&e.douradaDepois));
 assert.equal(sim.filas.filaA.length+sim.filas.filaB.length+7+416,2501+reservasDouradas.length,
  'Fundador + 2500 posicoes PDF + douradas financiadas: nenhuma se perde');
 assert.equal(entradasA+entradasB,416);
 assert.equal(ciclosClientes+ciclosDouradas+ciclosFundador,416);
 const todas=[...sim.filas.filaA,...sim.filas.filaB,sim.tabuleiro.centro,
  ...sim.tabuleiro.vagas,...sim.tabuleiro.ciclosConcluidos.map(c=>c.centro)]
  .filter(Boolean);
 assert.equal(todas.length,2501+reservasDouradas.length);
 assert.equal(new Set(todas.map(p=>p.id)).size,2501+reservasDouradas.length);
 assert.ok(sim.filas.filaA.every(x=>x.statusAdesao!=='PENDENTE'));
 const eventosFinanceirosRealizados=Object.values(eventosFinanceiros)
  .reduce((a,b)=>a+b,0);
 const saldoPendenteReferencia=sim.tabuleiro.vendasDoCiclo.length*PRECO_PDF;
 assert.equal(eventosFinanceirosRealizados+saldoPendenteReferencia,2500*PRECO_PDF);
 const ouroNoTabuleiro=[sim.tabuleiro.centro,...sim.tabuleiro.vagas]
  .filter(centroDoLoop).length;
 const reservaComprometidaDouradasCentavos=reservasDouradas.length*PRECO_PDF;
 const reservaDisponivelCentavos=cofreReservaBrutoCentavos-bonusReferenciaCentavos-reservaComprometidaDouradasCentavos;
 assert.equal(cofreReservaBrutoCentavos,eventosFinanceiros.LOOP_DIREITA);
 assert.ok(reservaDisponivelCentavos>=0,'Reserva compromissada sem cobertura no fim');
 assert.equal(reservasDouradas.length,usarCofreReserva?100:0,
  'Douradas da reserva nao podem ser forçadas se a reserva nao suportar');
 assert.equal(ciclosDouradas,ciclosDouradasDeReserva+ciclosDouradasDeAzul);
 return {
  cenario:primeiraFila+'-'+intensidade+(usarCofreReserva?'-COM_RESERVA':'-SEM_RESERVA'),
  modalidade:'SIMULACAO_SEM_PAGAMENTOS',
  primeiraFila,primeiraEntradaVaga6:primeiraEntrada,intensidade,
  usarCofreReserva,brutoDeReservaProvemApenasDeGiros:true,
  pessoasCompradoras:LIMITE,comprasPDF:numerosPDF,comprasFisicas190:numerosFisicos,
  posicoesCriadasPDF:2500,comprasFisicasSemPosicao:2500,
  posicoesDouradasFinanciadasPelaReserva:reservasDouradas.length,
  fundadorPosicaoExtra:1,
  quantidadeA:sim.filas.filaA.length,
  quantidadeB:sim.filas.filaB.length,
  noTabuleiro:7,
  contemplacoesComCicloConcluido:416,
  contemplacoesFundador:ciclosFundador,
  contemplacoesOutrosClientes:ciclosClientes,
  contemplacoesPosicoesDouradas:ciclosDouradas,
  ciclosDouradasPorAzul:ciclosDouradasDeAzul,
  ciclosDouradasFinanciadasPelaReserva:ciclosDouradasDeReserva,
  azuisInicialmenteCriadas:100,
  azulPendente:azuisRestantes,
  conversoesAzulParaDourada:convertidasDouradas.size,
  douradasNoTabuleiroAgora:ouroNoTabuleiro,
  douradasConvertidasAoLongoDosGiros:entregasAzuis,
  indicacoesValidadas:indicacoes,entradasFilaA:entradasA,
  entradasFilaB:entradasB,girosEfetuados:sim.giros,
  vendasParaCicloCompletas:2496,proximoCicloCom4De6:4,
  precoPDFCentavos:PRECO_PDF,precoFisicoCentavos:PRECO_FISICO,
  financeiro:{
   faturamentoBrutoSimuladoCentavos:valorBrutoCentavos,
   faturamentoPDFCentavos:2500*PRECO_PDF,
   faturamentoFisico190Centavos:2500*PRECO_FISICO,
   alocacaoReferencialPorDestinoCentavos:eventosFinanceiros,
   valorAlocadoCiclosCompletosCentavos:eventosFinanceirosRealizados,
   valorPendenteProximoCicloReferencialCentavos:saldoPendenteReferencia,
   bonusIndicacaoHipotetico10PctPDFCentavos:bonusReferenciaCentavos,
   cofreReservaBrutoCentavos,compromissosDeBonificacaoReservaCentavos:bonusReferenciaCentavos,
   compromissoDouradasFinanciadasCentavos:reservaComprometidaDouradasCentavos,
   cofreReservaLivreDemonstrativoCentavos:reservaDisponivelCentavos,
   reservaInsuficienteEventos,
   extratoDouradasDaReserva:reservasDouradas,
   evolucaoSaldoReserva:historicoReserva.filter(x=>[1,20,50,100,200,300,416].includes(x.giro)),
   origemDosRecursos:'LOOP_DIREITA_EXCLUSIVAMENTE_DE_EVENTOS_DE_CICLO_SIMULADOS',
   transacoesReaisDeReserva:0,
   custosDosProdutosImpostosPSPFreteLucro:'NAO_INFORMADOS_NAO_CALCULADOS',
   pagamentoRealCentavos:0,saquesReaisCentavos:0,contemplacoesPagasCentavos:0
  },
  amostrasEvolucao:giros.filter(x=>[1,10,20,50,100,200,300,400,416].includes(x.giro))
 };
}
function executarComparacao5000(){
 return ['A','B'].flatMap(primeiraFila=>['ALTA','MODERADA']
  .map(intensidade=>executarCenario5000({primeiraFila,intensidade,usarCofreReserva:true})));
}
if(require.main===module){
 try{process.stdout.write(JSON.stringify(executarComparacao5000(),null,2)+'\n');}
 catch(e){process.stderr.write(e.stack+'\n');process.exitCode=1;}
}
module.exports={executarCenario5000,executarComparacao5000};
