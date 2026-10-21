'use strict';

// Experimento fechado: 1.000 compradores diferentes, cada um compra UMA
// unidade. 500 PDFs a R$250 (qualificam a posicao), 500 produtos fisicos
// a R$190 (somente loja: NAO criam posicao). Fundador ocupa o centro
// antes das vendas, sem compra de fundador. Sem pagamentos ou saques reais.
const assert=require('node:assert/strict');
const {SimuladorLoop}=require('../src/domain/simulador-loop');
const {analisarCarrinhoSimulado}=require('../src/domain/valor-padrao-loop');
const {centroDoLoop}=require('../src/domain/destino-financeiro-centro-loop');

const PRECO_PDF=25000,PRECO_FISICO=19000;
function executarCenario1000({primeiraFila='A',intensidade='ALTA',totalCompradores=1000}={}){
 assert.ok(['A','B'].includes(primeiraFila));
 assert.ok(['ALTA','MODERADA'].includes(intensidade));
 assert.ok(Number.isSafeInteger(totalCompradores)&&totalCompradores>=100&&totalCompradores<=10000&&totalCompradores%2===0);
 const LIMITE=totalCompradores,metade=LIMITE/2;
 const girosEsperados=Math.floor(metade/6),restantesEsperados=metade%6;
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
 let numerosPDF=0,numerosFisicos=0,valorBrutoCentavos=0,indicacoes=0;
 let ciclosClientes=0,ciclosDouradas=0,ciclosFundador=0,entradasA=0,entradasB=0;
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
  if(centroDoLoop(c.centro))ciclosDouradas++;
  else if(c.centro.participanteId==='fundador')ciclosFundador++;
  else ciclosClientes++;
  for(const e of c.vendas){
   assert.ok(Object.hasOwn(eventosFinanceiros,e.destinoCofre));
   eventosFinanceiros[e.destinoCofre]+=PRECO_PDF;
  }
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
  const azul=numerosPDF>=7&&numerosPDF<=26; // 20 azuis: 7 ... 26.
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
 assert.equal(numerosPDF,metade);
 assert.equal(numerosFisicos,metade);
 assert.equal(compras.size,LIMITE);
 assert.equal(valorBrutoCentavos,metade*(PRECO_PDF+PRECO_FISICO));
 assert.equal(sim.filas.vendasRegistradas.size,metade);
 assert.equal(sim.tabuleiro.vendasProcessadas.size,metade);
 assert.equal(comprasNoMotor,metade);
 assert.equal(sim.giros,girosEsperados,'Compras PDF geram ciclos de seis eventos');
 assert.equal(sim.tabuleiro.vendasDoCiclo.length,restantesEsperados);
 assert.equal(sim.tabuleiro.ciclosConcluidos.length,girosEsperados);
 assert.equal(convertidasDouradas.size,20,
  'As 20 azuis devem virar douradas somente ao cruzar a vaga seis');
 assert.ok(entregasAzuis.some(e=>e.giro>=1&&e.douradaDepois));
 assert.equal(sim.filas.filaA.length+sim.filas.filaB.length+7+girosEsperados,metade+1,
  'Fundador + 500 posicoes: nenhuma se perde');
 assert.equal(entradasA+entradasB,girosEsperados);
 assert.equal(ciclosClientes+ciclosDouradas+ciclosFundador,girosEsperados);
 const todas=[...sim.filas.filaA,...sim.filas.filaB,sim.tabuleiro.centro,
  ...sim.tabuleiro.vagas,...sim.tabuleiro.ciclosConcluidos.map(c=>c.centro)]
  .filter(Boolean);
 assert.equal(todas.length,metade+1);
 assert.equal(new Set(todas.map(p=>p.id)).size,metade+1);
 assert.ok(sim.filas.filaA.every(x=>x.statusAdesao!=='PENDENTE'));
 const eventosFinanceirosRealizados=Object.values(eventosFinanceiros)
  .reduce((a,b)=>a+b,0);
 const saldoPendenteReferencia=sim.tabuleiro.vendasDoCiclo.length*PRECO_PDF;
 assert.equal(eventosFinanceirosRealizados+saldoPendenteReferencia,metade*PRECO_PDF);
 const ouroNoTabuleiro=[sim.tabuleiro.centro,...sim.tabuleiro.vagas]
  .filter(centroDoLoop).length;
 return {
  cenario:primeiraFila+'-'+intensidade,
  modalidade:'SIMULACAO_SEM_PAGAMENTOS',
  primeiraFila,primeiraEntradaVaga6:primeiraEntrada,intensidade,
  pessoasCompradoras:LIMITE,comprasPDF:numerosPDF,comprasFisicas190:numerosFisicos,
  posicoesCriadasPDF:metade,comprasFisicasSemPosicao:metade,
  fundadorPosicaoExtra:1,
  quantidadeA:sim.filas.filaA.length,
  quantidadeB:sim.filas.filaB.length,
  noTabuleiro:7,
  contemplacoesComCicloConcluido:83,
  contemplacoesFundador:ciclosFundador,
  contemplacoesOutrosClientes:ciclosClientes,
  contemplacoesPosicoesDouradas:ciclosDouradas,
  azulPendente:sim.filas.filaA.concat(sim.filas.filaB).filter(x=>x.statusAdesao==='PENDENTE').length,
  conversoesAzulParaDourada:convertidasDouradas.size,
  douradasNoTabuleiroAgora:ouroNoTabuleiro,
  douradasConvertidasAoLongoDosGiros:entregasAzuis,
  indicacoesValidadas:indicacoes,entradasFilaA:entradasA,
  entradasFilaB:entradasB,girosEfetuados:sim.giros,
  vendasParaCicloCompletas:girosEsperados*6,proximoCicloCom2De6:restantesEsperados,
  precoPDFCentavos:PRECO_PDF,precoFisicoCentavos:PRECO_FISICO,
  financeiro:{
   faturamentoBrutoSimuladoCentavos:valorBrutoCentavos,
   faturamentoPDFCentavos:metade*PRECO_PDF,
   faturamentoFisico190Centavos:metade*PRECO_FISICO,
   alocacaoReferencialPorDestinoCentavos:eventosFinanceiros,
   valorAlocadoCiclosCompletosCentavos:eventosFinanceirosRealizados,
   valorPendenteProximoCicloReferencialCentavos:saldoPendenteReferencia,
   bonusIndicacaoHipotetico10PctPDFCentavos:bonusReferenciaCentavos,
   custosDosProdutosImpostosPSPFreteLucro:'NAO_INFORMADOS_NAO_CALCULADOS',
   pagamentoRealCentavos:0,saquesReaisCentavos:0,contemplacoesPagasCentavos:0
  },
  amostrasEvolucao:giros.filter(x=>[1,10,20,30,50,70,83,100,200,300,400,416].includes(x.giro))
 };
}
function executarComparacao1000(){
 return ['A','B'].flatMap(primeiraFila=>['ALTA','MODERADA']
  .map(intensidade=>executarCenario1000({primeiraFila,intensidade})));
}
if(require.main===module){
 try{process.stdout.write(JSON.stringify(executarComparacao1000(),null,2)+'\n');}
 catch(e){process.stderr.write(e.stack+'\n');process.exitCode=1;}
}
module.exports={executarCenario1000,executarComparacao1000};
