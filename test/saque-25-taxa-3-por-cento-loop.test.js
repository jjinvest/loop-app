'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {simularElegibilidadeSaque}=require('../src/domain/indicacoes-links-comissoes-demo-sqlite');
test('saque de bonus minimo R$25 cobra 3%, preserva CPF e nao executa pagamento',()=>{
 const p=simularElegibilidadeSaque({saldoSimuladoCentavos:2500,valorSolicitadoCentavos:2500,
  cpfTermosConfirmados:true,tipo:'BONUS'});
 assert.equal(p.atingiuMinimo,true);
 assert.equal(p.taxaPercentual,3);
 assert.equal(p.taxaSaqueCentavos,75);
 assert.equal(p.valorLiquidoCentavos,2425);
 assert.equal(p.origemExclusiva,'LOOP_DIREITA');
 assert.equal(p.transferenciaExecutada,false);
 assert.throws(()=>simularElegibilidadeSaque({saldoSimuladoCentavos:2500,
  valorSolicitadoCentavos:2499,cpfTermosConfirmados:true}),
  e=>e.codigo==='MINIMO_SAQUE_25_REAIS');
 assert.throws(()=>simularElegibilidadeSaque({saldoSimuladoCentavos:2500,
  valorSolicitadoCentavos:2500}),e=>e.codigo==='CPF_E_TERMOS_OBRIGATORIOS');
});
test('saque de participacao tem a mesma taxa de 3% e minimo R$25 sem saque real',()=>{
 const p=simularElegibilidadeSaque({saldoSimuladoCentavos:10000,valorSolicitadoCentavos:10000,
  cpfTermosConfirmados:true,tipo:'PARTICIPACAO_LUCRO'});
 assert.equal(p.valorSolicitadoCentavos,10000);
 assert.equal(p.taxaSaqueCentavos,300);
 assert.equal(p.valorLiquidoCentavos,9700);
 assert.equal(p.origemExclusiva,'LOOP_CENTRO');
 assert.equal(p.transferenciaExecutada,false);
 assert.throws(()=>simularElegibilidadeSaque({saldoSimuladoCentavos:1000,
  valorSolicitadoCentavos:2500,cpfTermosConfirmados:true,tipo:'PARTICIPACAO_LUCRO'}),
  e=>e.codigo==='SALDO_SIMULADO_INSUFICIENTE');
 assert.throws(()=>simularElegibilidadeSaque({saldoSimuladoCentavos:10000,
  valorSolicitadoCentavos:10000,cpfTermosConfirmados:true,tipo:'PIX_ILEGAL'}),
  e=>e.codigo==='TIPO_SAQUE_INVALIDO');
});
