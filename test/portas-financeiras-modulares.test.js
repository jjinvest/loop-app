'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
 PAPEIS,METODOS,ROTAS_INICIAIS,criarPlanoFinanceiro,validarPlanoFinanceiro,
 verificarPortaCandidata,planejarTrocaFinanceira,planejarSaqueModular,
 avaliarContingenciaDeSaque,bloquearOperacaoReal
}=require('../src/producao/portas-financeiras-modulares');
const {planejarRecebimentoTresBancos}=
 require('../src/domain/plano-roteamento-tres-bancos-lab');
const foto={
 totalBrutoCotadoCentavos:50000,quantidadePosicoesPlanejadas:1,
 referenciaLoopPrevistaCentavos:25000,custoFornecedorPrevistoCentavos:17000,
 fretePrevistoCentavos:1500,tarifaPspPrevistaCentavos:500,
 reservaTributariaEstimadaCentavos:800,custosCompletos:true,itens:[]
};
test('6 papeis isolados, decisao do PSP aberta e conta do LOOP inicialmente Inter',()=>{
 const p=criarPlanoFinanceiro();
 assert.deepEqual(PAPEIS,[
  'CAPTACAO','DISTRIBUICAO','CUSTODIA_LOOP','CUSTODIA_LOJA',
  'CUSTODIA_COFRES','EXECUTOR_SAQUE'
 ]);
 assert.equal(p.estado,'PLANEJAMENTO_SEM_HOMOLOGACAO');
 assert.equal(p.rotas.CAPTACAO,null);
 assert.equal(p.rotas.DISTRIBUICAO,null);
 assert.equal(p.rotas.CUSTODIA_LOOP,'INTER');
 assert.equal(p.rotas.CUSTODIA_LOJA,'MERCADO_PAGO');
 assert.equal(p.rotas.EXECUTOR_SAQUE,null);
 assert.equal(p.rotas.CUSTODIA_COFRES,null);
 assert.ok(Object.isFrozen(p.rotas));
 assert.ok(Object.isFrozen(p));
 assert.equal(p.dinheiroRealLiberado,false);
 assert.equal(p.saquesHabilitados,false);
 assert.deepEqual({...p.rotas},ROTAS_INICIAIS);
 assert.equal(Object.keys(METODOS).length,6);
});
test('adaptadores independentes sem contrato não são produção; capacidades podem variar',()=>{
 const parcial=verificarPortaCandidata({
  papel:'CAPTACAO',provedor:'CELCOIN',
  adaptador:{consultarCobranca:async()=>null}
 });
 assert.equal(parcial.contratoDeCodigoCompativel,false);
 assert.ok(parcial.metodosFaltantes.includes('consultarLiquidacao'));
 assert.equal(parcial.aptoProducao,false);
 const fake={};
 for(const m of METODOS.EXECUTOR_SAQUE)fake[m]=async()=>null;
 const pix=verificarPortaCandidata({
  papel:'EXECUTOR_SAQUE',provedor:'ASAAS',adaptador:fake
 });
 assert.equal(pix.contratoDeCodigoCompativel,true);
 assert.equal(pix.autenticacaoComprovada,false);
 assert.equal(pix.aptoProducao,false);
 assert.throws(()=>bloquearOperacaoReal(),
  {codigo:'PORTAS_FINANCEIRAS_OPERACAO_REAL_NAO_HOMOLOGADA'});
});
test('trocar Inter por banco alternativo preserva rota lógica, orçamento e revisão',()=>{
 const original=criarPlanoFinanceiro();
 const troca=planejarTrocaFinanceira({
  plano:original,papel:'CUSTODIA_LOOP',provedorDestino:'BANCO_ALTERNATIVO',
  motivo:'CONTINGENCIA_APROVADA'
 });
 assert.equal(troca.estado,'AGUARDA_HOMOLOGACAO');
 assert.equal(troca.aplicadoNoBanco,false);
 assert.equal(troca.operacaoFinanceiraRealExecutada,false);
 assert.equal(troca.proposto.revisao,2);
 assert.equal(troca.proposto.rotas.CUSTODIA_LOOP,'BANCO_ALTERNATIVO');
 assert.equal(original.rotas.CUSTODIA_LOOP,'INTER');
 assert.equal(troca.exigeSaldoComprovadoNoDestino,true);
 const plano=planejarRecebimentoTresBancos({
  fotografia:foto,planoFinanceiro:troca.proposto
 });
 assert.equal(plano.roteamentoFinanceiroRevisao,2);
 assert.equal(plano.receptores[0].bancoSugerido,'BANCO_ALTERNATIVO');
 assert.equal(plano.receptores[0].destinoLogico,'CUSTODIA_LOOP');
 assert.equal(plano.receptores[0].montantePrevistoCentavos,25000);
 assert.equal(plano.receptores[0].transferenciaExecutada,false);
 assert.equal(plano.receptores[1].bancoSugerido,'MERCADO_PAGO');
 assert.equal(plano.liquidacaoPspRealComprovada,false);
 assert.equal(plano.caixaCentroSacavelCentavos,0);
 const volta=planejarTrocaFinanceira({
  plano:troca.proposto,papel:'CUSTODIA_LOOP',provedorDestino:'INTER',
  motivo:'REVERSAO_PLANEJADA'
 });
 assert.equal(volta.proposto.revisao,3);
 assert.equal(volta.proposto.rotas.CUSTODIA_LOOP,'INTER');
});
test('captação Celcoin e pagador Asaas podem ser configurados separadamente',()=>{
 let p=criarPlanoFinanceiro();
 for(const [papel,provedor] of [
  ['CAPTACAO','CELCOIN'],['DISTRIBUICAO','CELCOIN'],
  ['EXECUTOR_SAQUE','ASAAS'],['CUSTODIA_COFRES','BANCO_3']
 ]){
  p=planejarTrocaFinanceira({
   plano:p,papel,provedorDestino:provedor,
   motivo:'PROPOSTA_COMERCIAL'
  }).proposto;
 }
 assert.equal(p.rotas.CUSTODIA_LOOP,'INTER');
 assert.equal(p.rotas.CAPTACAO,'CELCOIN');
 assert.equal(p.rotas.EXECUTOR_SAQUE,'ASAAS');
 const saque=planejarSaqueModular({plano:p});
 assert.equal(saque.origemDoSaldo,'INTER');
 assert.equal(saque.executorPix,'ASAAS');
 assert.equal(saque.prefundingNecessario,true);
 assert.equal(saque.pagamentoRealExecutado,false);
 assert.equal(saque.caminho,'ABASTECER_EXECUTOR_COM_SALDO_REAL_E_CONCILIAR');
 assert.equal(planejarRecebimentoTresBancos({
  fotografia:foto,planoFinanceiro:p
 }).captadorPrevisto,'CELCOIN');
});
test('contingencia nao libera reenvio de Pix desconhecido em segunda API',()=>{
 const p=criarPlanoFinanceiro();
 const t=planejarTrocaFinanceira({
  plano:p,papel:'EXECUTOR_SAQUE',provedorDestino:'ASAAS',
  motivo:'CONTINGENCIA_OPERACIONAL',
  operacoesEmAberto:4,operacoesIndeterminadas:1
 });
 assert.equal(t.estado,'BLOQUEADA_POR_PENDENCIAS');
 assert.equal(t.aplicadoNoBanco,false);
 for(const estadoOperacao of [
  'SOLICITADO','RESERVADO','ENVIADO',
  'INDETERMINADO','CONFIRMADO','CANCELADO'
 ]){
  const x=avaliarContingenciaDeSaque({
   estadoOperacao,executorAlternativoHomologado:true
  });
  assert.equal(x.podeReenviarNaOutraApi,false);
  if(['ENVIADO','INDETERMINADO','CONFIRMADO'].includes(estadoOperacao))
   assert.equal(x.exigeConciliacao,true);
 }
});
test('plano malformado e suposta homologacao forjada falham fechado',()=>{
 assert.throws(()=>criarPlanoFinanceiro({
  rotas:{...ROTAS_INICIAIS,CUSTODIA_LOOP:'banco-malicioso'}
 }),{codigo:'PORTAS_FINANCEIRAS_PLANO_INVALIDO'});
 assert.throws(()=>criarPlanoFinanceiro({
  rotas:{...ROTAS_INICIAIS,CHAVE_PRIVADA:'segredo'}
 }),{codigo:'PORTAS_FINANCEIRAS_PLANO_INVALIDO'});
 assert.throws(()=>validarPlanoFinanceiro({
  ...criarPlanoFinanceiro(),saquesHabilitados:true
 }),{codigo:'PORTAS_FINANCEIRAS_PLANO_NAO_HOMOLOGADO'});
 assert.throws(()=>planejarTrocaFinanceira({
  plano:criarPlanoFinanceiro(),papel:'CUSTODIA_LOOP',
  provedorDestino:'INTER'
 }),{codigo:'PORTAS_FINANCEIRAS_TROCA_SEM_MUDANCA'});
 assert.throws(()=>avaliarContingenciaDeSaque({
  estadoOperacao:'PAGO_SEM_CONFIRMACAO'
 }),{codigo:'PORTAS_FINANCEIRAS_ESTADO_INDETERMINADO'});
});
