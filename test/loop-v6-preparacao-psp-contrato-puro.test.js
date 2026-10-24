'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {planejarEventoPspFuturoLab,politicaTarifaSaqueFuturaLab}=
 require('../src/domain/contrato-psp-futuro-loop-lab');
const pedido={pedidoId:'pedido-psp-futuro-001',intentoPagamentoId:'intento-psp-001',
 valorCentavos:25000};
const evento={eventoId:'evento-futuro-001',pedidoId:pedido.pedidoId,
 intentoPagamentoId:pedido.intentoPagamentoId,moeda:'BRL',
 tipo:'COBRANCA_SINALIZADA_FICTICIA',valorCentavos:25000};
test('contrato futuro valida identificacao mas nunca atribui pagamento liquidado ou posicao',()=>{
 const r=planejarEventoPspFuturoLab({pedidoRegistrado:pedido,evento});
 assert.equal(r.integracaoBancariaAtiva,false);
 assert.equal(r.autenticidadeDoProvedorComprovada,false);
 assert.equal(r.liquidacaoConfirmada,false);
 assert.equal(r.autorizacaoDePosicao,false);
 assert.equal(r.autorizacaoDeSaque,false);
 assert.equal(r.valorBancarioDisponivelConhecido,false);
 assert.equal(r.passoNecessario,'RECONSULTAR_PROVEDOR_E_CONCILIAR_EXTRATO_LIQUIDADO');
 assert.equal(r.valorReferencialCentavos,25000);
 assert.equal(Object.isFrozen(r),true);
 const estorno=planejarEventoPspFuturoLab({pedidoRegistrado:pedido,
  evento:{...evento,eventoId:'estorno-futuro-001',tipo:'ESTORNO_SINALIZADO_FICTICIO'}});
 assert.equal(estorno.autorizacaoDePosicao,false);
});
test('preparacao recusa valor, moeda, intento e pedido adulterados',()=>{
 const incorretos=[
  {...evento,moeda:'USD'},
  {...evento,valorCentavos:25001},
  {...evento,valorCentavos:'25000'},
  {...evento,intentoPagamentoId:'outro-intento'},
  {...evento,pedidoId:'outra-compra'},
  {...evento,tipo:'PIX_CONFIRMADO_REAL'},
  {...evento,eventoId:''}
 ];
 for(const e of incorretos)assert.throws(
  ()=>planejarEventoPspFuturoLab({pedidoRegistrado:pedido,evento:e}),
  x=>['VINCULO_FINANCEIRO_DIVERGENTE','EVENTO_NAO_CORRESPONDE_AO_CONTRATO'].includes(x.codigo));
});
test('politica 0% ao participante: eventual tarifa do provedor fica em aberto com empresa',()=>{
 for(const bruto of [2500,10000,30000]){
  const r=politicaTarifaSaqueFuturaLab({valorSolicitadoCentavos:bruto});
  assert.equal(r.valorLiquidoParticipanteCentavos,bruto);
  assert.equal(r.taxaParticipanteCentavos,0);
  assert.equal(r.pagadorDaTarifaBancaria,'EMPRESA');
  assert.equal(r.tarifaDoBancoCentavos,null);
  assert.equal(r.liberacaoDePix,false);
  assert.equal(r.saldoRealVerificado,false);
 }
 assert.throws(()=>politicaTarifaSaqueFuturaLab({valorSolicitadoCentavos:2499}),
  e=>e.codigo==='SAQUE_MENOR_QUE_25_REAIS');
 console.log('LOOP_PREPARACAO_PSP='+JSON.stringify({
  contratosSemPagamentoReal:1,caminhoDeAutorizacaoRealHabilitado:false,
  vinculosInvalidosRejeitados:7,taxaParticipantePercentual:0,
  tarifaBancoConhecida:false,despesaBancoPelaEmpresa:true}));
});
