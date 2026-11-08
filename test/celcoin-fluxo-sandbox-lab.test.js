'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {planoCelcoinPorFotografiaLab,exercitarWebhooksPixMockCelcoinLab}=
 require('../src/domain/celcoin-fluxo-sandbox-lab');
const foto=(alteracoes={})=>({
 prepedidoId:'hom-00000000-0000-0000-0000-000000000001',
 totalBrutoCotadoCentavos:50000,
 quantidadePosicoesPlanejadas:1,
 referenciaLoopPrevistaCentavos:25000,
 custoFornecedorPrevistoCentavos:17500,
 fretePrevistoCentavos:1500,
 tarifaPspPrevistaCentavos:500,
 reservaTributariaEstimadaCentavos:500,
 custosCompletos:true,
 itens:[{produtoId:'curso-homologacao-250',quantidade:1}],
 ...alteracoes
});
test('Celcoin: transacao de R$500 reserva R$250 LOOP, fornecedor e somente margem na loja',()=>{
 const r=planoCelcoinPorFotografiaLab({fotografia:foto()});
 assert.equal(r.valorBrutoCotadoCentavos,50000);
 assert.equal(r.valorLiquidoPrevistoCentavos,49500);
 assert.equal(r.valorCentroPrevistoCentavos,25000);
 assert.equal(r.valorMargemParaMercadoPagoPrevistoCentavos,5000);
 assert.deepEqual(r.ordens.map(x=>[x.destino,x.valorPrevistoCentavos]),[
  ['LOOP_INTER',25000],['FORNECEDOR',17500],['LOJA_MERCADO_PAGO',5000]]);
 assert.deepEqual(r.retencoes.map(x=>[x.tipo,x.centavos]),[
  ['FRETE',1500],['TRIBUTOS',500]]);
 assert.equal(r.ordens.reduce((a,x)=>a+x.valorPrevistoCentavos,0)+
  r.retencoes.reduce((a,x)=>a+x.centavos,0),49500);
 assert.deepEqual(r.terceiroBanco.subcontas,['CAIXA_ESQUERDA','CAIXA_DIREITA']);
 assert.equal(r.terceiroBanco.valorTransferivelCentavos,0);
 assert.equal(r.contratoApiPrevisto.operacao,'POST /baas/v2/pix/payment');
 assert.equal(r.contratoApiPrevisto.webhook,'pix-payment-out');
 assert.equal(r.ambiente,'SANDBOX_SEM_CREDENCIAIS');
 assert.equal(r.chamadasHttp,0);
 assert.equal(r.pixEnviados,0);
 assert.equal(r.liquidacaoRealConfirmada,false);
 assert.equal(r.prontoParaProducao,false);
 assert.equal(r.estado,'ENSAIO_LOCAL_SEM_EXECUCAO');
 assert.ok(r.bloqueios.includes('CONTAS_BANCARIAS_NAO_CONECTADAS'));
 const again=planoCelcoinPorFotografiaLab({fotografia:foto()});
 assert.deepEqual(again.ordens.map(x=>x.clientCodePrevisto),
  r.ordens.map(x=>x.clientCodePrevisto),'chave idempotente por pedido/destino');
 assert.equal(new Set(r.ordens.map(x=>x.clientCodePrevisto)).size,3);
});
test('sem custo fechado ou margem negativa nao cria instrucao hipotetica',()=>{
 const sem=planoCelcoinPorFotografiaLab({fotografia:foto({
  custoFornecedorPrevistoCentavos:null,custosCompletos:false
 })});
 assert.equal(sem.ordens.length,0);
 assert.ok(sem.bloqueios.includes('CUSTOS_INCOMPLETOS'));
 const deficit=planoCelcoinPorFotografiaLab({fotografia:foto({
  custoFornecedorPrevistoCentavos:26000
 })});
 assert.equal(deficit.ordens.length,0);
 assert.ok(deficit.bloqueios.includes('MARGEM_COMERCIAL_ESTIMADA_NEGATIVA'));
 const semSaldo=planoCelcoinPorFotografiaLab({fotografia:foto({
  tarifaPspPrevistaCentavos:26000
 })});
 assert.equal(semSaldo.ordens.length,0);
 assert.ok(semSaldo.bloqueios.includes('LIQUIDO_INSUFICIENTE_PARA_SEPARAR_LOOP'));
});
test('mock confirma PENDING->CONFIRMED com deduplicacao; nao valida autenticidade',()=>{
 const r=planoCelcoinPorFotografiaLab({fotografia:foto()});
 const inter=r.ordens[0],mp=r.ordens[2];
 const resultado=exercitarWebhooksPixMockCelcoinLab({plano:r,eventos:[
  {eventoId:'mock-pending-1',clientCode:inter.clientCodePrevisto,
   status:'PENDING',valorCentavos:25000},
  {eventoId:'mock-pending-1',clientCode:inter.clientCodePrevisto,
   status:'PENDING',valorCentavos:25000},
  {eventoId:'mock-confirmed-1',clientCode:inter.clientCodePrevisto,
   status:'CONFIRMED',valorCentavos:25000},
  {eventoId:'mock-rejected-3',clientCode:mp.clientCodePrevisto,
   status:'REJECTED',valorCentavos:5000}
 ]});
 assert.equal(resultado.transicoesMockValidas,3);
 assert.equal(resultado.duplicatasIgnoradas,1);
 assert.deepEqual(resultado.operacoes.map(x=>x.estadoSimulado),[
  'CONFIRMED','NAO_ENVIADO','REJECTED']);
 assert.equal(resultado.pagamentosReais,false);
 assert.equal(resultado.autenticidadeProvada,false);
 assert.equal(resultado.saldosBancariosReaisCentavos,null);
 assert.equal(resultado.utilizavelParaLiberarSaques,false);
});
test('reversao apos confirmacao retira qualquer status de pagamento apenas no mock',()=>{
 const r=planoCelcoinPorFotografiaLab({fotografia:foto()});
 const c=r.ordens[1].clientCodePrevisto;
 const out=exercitarWebhooksPixMockCelcoinLab({plano:r,eventos:[
  {eventoId:'mock-confirmed-1',clientCode:c,status:'CONFIRMED',valorCentavos:17500},
  {eventoId:'mock-reversal-1',clientCode:c,status:'REVERTED',valorCentavos:17500}
 ]});
 assert.equal(out.operacoes[1].estadoSimulado,'REVERTED');
 assert.equal(out.pixEnviados,0);
});
test('rejeita falsificacao de valor, operacao desconhecida, conflito de webhook e sequencia retrograda',()=>{
 const r=planoCelcoinPorFotografiaLab({fotografia:foto()});
 const c=r.ordens[0].clientCodePrevisto;
 const pending={eventoId:'mock-pending-a',clientCode:c,status:'PENDING',valorCentavos:25000};
 assert.throws(()=>exercitarWebhooksPixMockCelcoinLab({plano:r,eventos:[
  {...pending,valorCentavos:25001}
 ]}),/CELCOIN_MOCK_EVENTO_INVALIDO/);
 assert.throws(()=>exercitarWebhooksPixMockCelcoinLab({plano:r,eventos:[
  {...pending,clientCode:'outro'}
 ]}),/CELCOIN_MOCK_EVENTO_INVALIDO/);
 assert.throws(()=>exercitarWebhooksPixMockCelcoinLab({plano:r,eventos:[
  pending,{...pending,status:'CONFIRMED'}
 ]}),/CELCOIN_MOCK_CONFLITO_EVENTO/);
 assert.throws(()=>exercitarWebhooksPixMockCelcoinLab({plano:r,eventos:[
  {eventoId:'mock-confirmed-1',clientCode:c,status:'CONFIRMED',valorCentavos:25000},
  {...pending}
 ]}),/CELCOIN_MOCK_TRANSICAO_INVALIDA/);
 assert.throws(()=>exercitarWebhooksPixMockCelcoinLab({plano:r,eventos:[
  {eventoId:'mock-reversed-1',clientCode:c,status:'REVERTED',valorCentavos:25000}
 ]}),/CELCOIN_MOCK_TRANSICAO_INVALIDA/);
});
