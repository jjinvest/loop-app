'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { projetarSustentabilidade } =
  require('../src/domain/projecao-sustentabilidade-loop');

function periodo(vendasValidas, extras={}) {
  return {
    rotulo:'Periodo ficticio',
    vendasValidas, vendasReembolsadas:0,
    precoCentavos:25000, custoFornecedorCentavos:9000,
    impostosCentavos:2000, tarifaPagamentoCentavos:800,
    despesaOperacionalCentavos:700,
    custoEstornoNaoRecuperavelCentavos:2500,
    ...extras
  };
}
function projetar(periodos,posicoesIniciais=0){
  return projetarSustentabilidade({posicoesIniciais,periodos});
}

test('primeiras 6 posicoes preenchem tabuleiro e nao concluem ciclo sem novas vendas',()=>{
  const r=projetar([periodo(5),periodo(1),periodo(5)]);
  assert.equal(r.modo,'PROJECAO_HIPOTETICA_SEM_PAGAMENTOS');
  assert.deepEqual(r.periodos.map(x=>x.usadasParaMontarTabuleiro),[5,1,0]);
  assert.deepEqual(r.periodos.map(x=>x.ciclosConcluidos),[0,0,1]);
  assert.equal(r.resumo.vendasValidas,11);
  assert.equal(r.resumo.posicoesCriadas,11);
  assert.equal(r.resumo.ciclosConcluidos,1);
  assert.equal(r.resumo.posicoesPendentes,10);
  assert.equal(r.resumo.parcelasCentroReferenciaisCentavos,30000);
  assert.equal(r.resumo.parcelasEmpresaReferenciaisCentavos,20000);
  assert.equal(r.resumo.reservaFilaCentavos,110000);
  assert.equal(r.resumo.saldoFilaSemDestinacaoCentavos,60000);
  assert.equal(r.resumo.eventosEmCicloIncompleto,0);
});

test('em cinco vendas com tabuleiro existente, uma posicao sai e cinco entram',()=>{
  const r=projetar([periodo(5)],6);
  assert.equal(r.resumo.posicoesCriadas,5);
  assert.equal(r.resumo.ciclosConcluidos,1);
  assert.equal(r.resumo.posicoesPendentes,10);
  assert.equal(r.resumo.reservaFilaCentavos,50000);
  assert.equal(r.resumo.parcelasCentroReferenciaisCentavos,30000);
  assert.equal(r.resumo.parcelasEmpresaReferenciaisCentavos,20000);
  assert.equal(r.resumo.saldoFilaSemDestinacaoCentavos,0);
});

test('centro recebe parcelas 1 3 5; empresa 2 4 ao longo de periodos',()=>{
  const r=projetar([periodo(1),periodo(1),periodo(1),periodo(1),periodo(1)],6);
  assert.deepEqual(r.periodos.map(p=>p.parcelasCentroReferenciaisCentavos),
    [10000,0,10000,0,10000]);
  assert.deepEqual(r.periodos.map(p=>p.parcelasEmpresaReferenciaisCentavos),
    [0,10000,0,10000,0]);
  assert.deepEqual(r.periodos.map(p=>p.ciclosConcluidos),[0,0,0,0,1]);
  assert.equal(r.resumo.posicoesPendentes,10);
});

test('5000 e 10000 posicoes antigas nao trazem dinheiro novo para o modelo',()=>{
  for(const antigas of [5000,10000]){
    const r=projetar([periodo(50)],antigas);
    assert.equal(r.resumo.ciclosConcluidos,10);
    assert.equal(r.resumo.posicoesPendentes,antigas+50-10);
    assert.equal(r.premissas.posicoesIniciaisSemCaixaModelado,true);
    assert.equal(r.resumo.reservaFilaCentavos,50*10000);
    assert.equal(r.resumo.exposicaoTeoricaSeTodasAsPosicoesRecebessemCentroCentavos,
      (antigas+40)*30000);
  }
});

test('suspensao de vendas paralisa ciclos e nao faz desaparecer posicoes',()=>{
  const r=projetar([periodo(100),periodo(0),periodo(0)],5000);
  assert.deepEqual(r.periodos.map(x=>x.ciclosConcluidos),[20,0,0]);
  assert.deepEqual(r.periodos.map(x=>x.posicoesPendentes),[5080,5080,5080]);
  assert.equal(r.resumo.posicoesPendentes,5080);
});

test('distinguimos receita liquida, custos, fila e margem — sem duplicar parcelas',()=>{
  const r=projetar([periodo(5)],6).resumo;
  assert.equal(r.receitaLiquidaCentavos,125000);
  assert.equal(r.contribuicaoAntesDaFilaCentavos,
    5*(25000-9000-2000-800-700));
  assert.equal(r.reservaFilaCentavos,50000);
  assert.equal(r.margemComercialAposReservaFilaCentavos,
    5*(25000-9000-2000-800-700-10000));
  assert.equal(r.parcelasCentroReferenciaisCentavos,30000);
  assert.equal(r.parcelasEmpresaReferenciaisCentavos,20000);
  assert.equal(r.reservaFilaCentavos,
    r.parcelasCentroReferenciaisCentavos+r.parcelasEmpresaReferenciaisCentavos);
});

test('custo de produto pode tornar margem negativa mesmo com parcela da empresa',()=>{
  const p=periodo(5,{precoCentavos:20000,custoFornecedorCentavos:12000,
    impostosCentavos:3000,tarifaPagamentoCentavos:800,
    despesaOperacionalCentavos:1200});
  const r=projetar([p],6);
  assert.equal(r.periodos[0].margemComercialAposReservaFilaCentavos,-35000);
  assert.equal(r.periodos[0].alertaMargemInsuficiente,true);
  assert.equal(r.resumo.parcelasEmpresaReferenciaisCentavos,20000);
  assert.ok(r.alertas.some(x=>x.includes('nunca nova receita')));
});

test('precos variados nao alteram posicoes geradas mas alteram margem comercial',()=>{
  const barato=projetar([periodo(5,{precoCentavos:20000})],6);
  const caro=projetar([periodo(5,{precoCentavos:50000})],6);
  assert.equal(barato.resumo.posicoesCriadas,caro.resumo.posicoesCriadas);
  assert.equal(barato.resumo.ciclosConcluidos,caro.resumo.ciclosConcluidos);
  assert.equal(barato.resumo.parcelasCentroReferenciaisCentavos,
    caro.resumo.parcelasCentroReferenciaisCentavos);
  assert.ok(caro.resumo.margemComercialAposReservaFilaCentavos >
    barato.resumo.margemComercialAposReservaFilaCentavos);
});

test('estornos integrais do proprio periodo nao geram posicoes e geram custo',()=>{
  const p=periodo(5,{vendasReembolsadas:2});
  const r=projetar([p],6);
  assert.equal(r.periodos[0].receitaBrutaCentavos,175000);
  assert.equal(r.periodos[0].reembolsosIntegraisCentavos,50000);
  assert.equal(r.periodos[0].receitaLiquidaCentavos,125000);
  assert.equal(r.periodos[0].custosTotaisCentavos,
    5*(9000+2000+800+700)+2*2500);
  assert.equal(r.resumo.posicoesCriadas,5);
  assert.equal(r.resumo.ciclosConcluidos,1);
  assert.equal(r.premissas.estornosApenasDoMesmoPeriodo,true);
});

test('quando ha somente estornos e nenhuma venda valida nao ocorre giro',()=>{
  const r=projetar([periodo(0,{vendasReembolsadas:8})],10000);
  assert.equal(r.resumo.posicoesPendentes,10000);
  assert.equal(r.resumo.ciclosConcluidos,0);
  assert.equal(r.resumo.reservaFilaCentavos,0);
  assert.equal(r.periodos[0].contribuicaoAntesDaFilaCentavos,-20000);
});

test('vendas em queda ainda aumentam backlog enquanto ocorrerem ciclos',()=>{
  const r=projetar([periodo(100),periodo(50),periodo(10),periodo(0)],5000);
  assert.deepEqual(r.periodos.map(x=>x.ciclosConcluidos),[20,10,2,0]);
  assert.deepEqual(r.periodos.map(x=>x.posicoesPendentes),[5080,5120,5128,5128]);
  assert.equal(r.resumo.posicoesCriadas,160);
  assert.equal(r.resumo.ciclosConcluidos,32);
});

test('nao permite numeros negativos, fracionados, ausentes e preco abaixo da parcela',()=>{
  assert.throws(()=>projetar([periodo(-1)]),/vendasValidas/);
  assert.throws(()=>projetar([periodo(1.5)]),/vendasValidas/);
  assert.throws(()=>projetar([periodo(1,{vendasReembolsadas:-1})]),/vendasReembolsadas/);
  assert.throws(()=>projetar([periodo(1,{precoCentavos:9900})]),/Preco menor/);
  assert.throws(()=>projetar([periodo(1,{precoCentavos:NaN})]),/precoCentavos/);
  assert.throws(()=>projetar([periodo(1,{custoFornecedorCentavos:undefined})]),/custoFornecedorCentavos/);
  assert.throws(()=>projetar([periodo(1)],-1),/posicoesIniciais/);
  assert.throws(()=>projetar([],6),/periodos/);
  assert.throws(()=>projetar(Array(241).fill(periodo(0)),6),/periodos/);
});

test('bloqueio de overflow impede criar valores monetarios fora do inteiro seguro',()=>{
  const max=periodo(10000000,{precoCentavos:10000000,custoFornecedorCentavos:10000000});
  assert.throws(()=>projetar(Array(240).fill(max),10000000),/Estouro numerico/);
});

test('sem conexao com motor das filas, banco e rotas de saque',()=>{
  const r=projetar([periodo(5)],6);
  assert.equal(r.resumo.posicoesPendentes,10);
  assert.equal(r.premissas.taxasDeSaqueNaoModeladas,true);
  assert.equal(r.premissas.direitosAdquiridosENovaPosicaoAposEstornoNaoModelados,true);
  assert.equal('sacar' in r,false);
  assert.equal('autorizarPagamento' in r,false);
  assert.equal('rentabilidadeGarantida' in r,false);
});

test('lancamento do zero e compras repetidas contam posicoes, nao pessoas',()=>{
  const r=projetar([periodo(10),periodo(90)],0);
  assert.equal(r.resumo.posicoesCriadas,100);
  assert.equal(r.resumo.ciclosConcluidos,18);
  assert.equal(r.resumo.posicoesPendentes,82);
  assert.equal(r.resumo.posicoesNoTabuleiroEstimadas,6);
  assert.equal(r.resumo.posicoesAguardandoFilaEstimadas,76);
  assert.equal(r.premissas.compradoresRepetidosContamPorCompra,true);
  assert.equal(r.premissas.posicoesIniciaisIncluemTabuleiro,true);
});

test('partir de dez posicoes ja ativas nao e o mesmo que assumir dez mil no lancamento',()=>{
  const r=projetar([periodo(100)],10);
  assert.equal(r.resumo.ciclosConcluidos,20);
  assert.equal(r.resumo.posicoesPendentes,90);
  assert.equal(r.resumo.posicoesAguardandoFilaEstimadas,84);
  assert.equal(r.resumo.posicoesNoTabuleiroEstimadas,6);
});

test('exemplo do idealizador: R$250, R$50 ao parceiro, R$100 a fila',()=>{
  const r=projetar([periodo(5,{
    precoCentavos:25000,
    custoFornecedorCentavos:5000,
    impostosCentavos:0,
    tarifaPagamentoCentavos:0,
    despesaOperacionalCentavos:0
  })],6);
  assert.equal(r.resumo.margemComercialAposReservaFilaCentavos,50000);
  assert.equal(r.resumo.parcelasCentroReferenciaisCentavos,30000);
  assert.equal(r.resumo.parcelasEmpresaReferenciaisCentavos,20000);
  assert.equal(r.resumo.posicoesCriadas,5);
  assert.equal(r.resumo.ciclosConcluidos,1);
  // R$100 de cada mercadoria e sobra antes de custos nao incluidos,
  // nao resultado liquido certificado.
});

test('dropshipping: loja vende por R$600, custo contratado R$300 e R$100 de referencia da fila',()=>{
  const c=projetar([periodo(5,{
    precoCentavos:60000,
    custoFornecedorCentavos:30000,
    impostosCentavos:0,
    tarifaPagamentoCentavos:0,
    despesaOperacionalCentavos:0
  })],6);
  assert.equal(c.resumo.receitaLiquidaCentavos,300000);
  assert.equal(c.resumo.contribuicaoAntesDaFilaCentavos,150000);
  assert.equal(c.resumo.reservaFilaCentavos,50000);
  assert.equal(c.resumo.margemComercialAposReservaFilaCentavos,100000);
  assert.equal(c.resumo.ciclosConcluidos,1);
  assert.equal(c.resumo.posicoesCriadas,5);
  assert.equal(c.resumo.parcelasCentroReferenciaisCentavos,30000);
  assert.equal(c.resumo.parcelasEmpresaReferenciaisCentavos,20000);
  // Por produto a sobra BRUTA e de R$200 antes dos custos omitidos;
  // 100% de markup sobre custo nao e 100% de lucro liquido.
});
