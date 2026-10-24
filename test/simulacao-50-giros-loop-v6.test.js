'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {executarCenario50Giros}=require('../scripts/simular-50-giros-loop-v6');
test('50 giros V6 conservam todas as posicoes: 100 iniciais, 300 novas, 50 saidas',()=>{
 const r=executarCenario50Giros();
 assert.equal(r.giros,50);
 assert.equal(r.saidasDoCentro,50);
 assert.equal(r.vendasSimuladasNoPeriodo,300);
 assert.equal(r.posicoesCriadasNoTotal,400);
 assert.equal(r.inicio.aguardando,93);
 assert.equal(r.final.aguardando,343);
 assert.equal(r.final.concluidos,50);
 assert.equal(r.final.tabuleiroOcupado,7);
 assert.equal(r.final.filaA+r.final.filaB,343);
 assert.equal(r.chamadasParaVaga6.filaA+r.chamadasParaVaga6.filaB,50);
 assert.equal(r.historico.length,50);
 assert.equal(r.historico[0].totalAguardando,98);
 assert.equal(r.historico[49].totalAguardando,343);
 for(const x of r.historico){
  assert.equal(x.totalAguardando,93+5*x.giro);
  assert.equal(x.saidasAcumuladas,x.giro);
  assert.equal(x.posicoesCriadasAcumuladas,100+6*x.giro);
  assert.equal(x.filaA+x.filaB,x.totalAguardando);
 }
 const fin=r.financeiro;
 assert.equal(fin.totalAlocadoReferencialCentavos,7500000);
 assert.equal(fin.distribuicaoReferencialCentavos.LOOP_CENTRO,3750000);
 assert.equal(fin.distribuicaoReferencialCentavos.LOOP_ESQUERDA,2500000);
 assert.equal(fin.distribuicaoReferencialCentavos.LOOP_DIREITA,1250000);
 assert.equal(fin.distribuicaoReferencialCentavos.LOOP_DOURADAS,0);
 assert.equal(fin.centrosDeClientes,50);
 assert.equal(fin.centrosDoLoop,0);
 assert.equal(fin.vendaBrutaHipoteticaSeCadaUmaDas400ComprasFosse250Centavos,10000000);
 assert.equal(fin.comissoesHipoteticas10PorcentoCentavos,320000);
 assert.equal(fin.comissoesEfetivamentePagasCentavos,0);
 assert.equal(fin.margemBrutaComercialExemploTotalCentavos,1500000);
 assert.equal(fin.margemComercialExemploAposComissaoHipoteticaCentavos,1180000);
 assert.equal(fin.pagamentosReaisCentavos,0);
 assert.equal(fin.saldoBancarioVerificado,false);
 assert.equal(r.dinheiroReal,false);
 assert.equal(r.contemplacoesFinanceirasReais,0);
 assert.equal(r.promessaDeRecebimento,false);
});
test('convites 1 a 4 promovem fila B para A e alteram ordem sem saltar etapas',()=>{
 const r=executarCenario50Giros();
 assert.ok(r.convites.validados>25);
 assert.ok(r.convites.pessoasPromovidasDeBParaA>10);
 assert.ok(r.convites.convitesDeQuemJaEstavaEmA>10);
 assert.ok(r.convites.indicadoresCom1>0);
 assert.ok(r.convites.indicadoresCom2>0);
 assert.ok(r.convites.indicadoresCom3>0);
 assert.ok(r.convites.indicadoresCom4>0);
 assert.ok(r.chamadasParaVaga6.filaA>0);
 assert.ok(r.chamadasParaVaga6.filaB>0);
 assert.ok(r.historico.some(x=>x.filaA>0&&x.filaB>0));
 assert.equal(r.pontosDeControle.at(-1).giro,50);
 console.log('RELATORIO_50_GIROS_LOOP_V6='+JSON.stringify({
  resumo:{giros:r.giros,saidas:r.saidasDoCentro,
   vendas:r.vendasSimuladasNoPeriodo,criadas:r.posicoesCriadasNoTotal,
   inicial:r.inicio,final:r.final,chamadas:r.chamadasParaVaga6,convites:r.convites},
  pontosDeControle:r.pontosDeControle
 }));
});
