'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {avaliarProntidaoFinanceiraEnsaio:avaliar,EXTERNOS}=
 require('../src/producao/prontidao-financeira-ensaio');
function criar({falhas=false,saida=true}={}){
 return {
  verificar:()=>({integridade:'OK',recebimentos:1,saques:saida?1:0}),
  plano:()=>({estado:'PLANEJAMENTO_SEM_HOMOLOGACAO',
   revisao:6,rotas:{
    CAPTACAO:'CELCOIN',DISTRIBUICAO:'CELCOIN',
    CUSTODIA_LOOP:'INTER',CUSTODIA_LOJA:'MERCADO_PAGO',
    CUSTODIA_COFRES:'BANCO_3',EXECUTOR_SAQUE:'ASAAS'
   }}),
  contasExternas:{diagnosticarExtratosDeclarados:()=>({
   contasNecessariasPeloLivro:3,contasDeclaradas:3,
   alertas:falhas?{EXTRATO_SEM_VINCULO_DE_TITULAR:1}:{}
  })},
  correspondenciasExtrato:{diagnosticar:()=>({correspondencias:1})},
  conciliacaoBancaria:{analisar:()=>({
   totalDivergencias:falhas?2:0
  })},
  observacoesPsp:{verificar:()=>({observacoes:2})},
  extratosAsaasInbox:{verificar:()=>({registros:2})},
  diagnosticarConvergenciaExternaEnsaio:()=>({
   divergenciasPspPix:falhas?2:0
  })
 };
}
test('auditoria técnica pode estar completa mas dinheiro real segue sempre fechado',()=>{
 const local=criar();
 const r=avaliar({tesouraria:{
  ...local,verificar:local.verificar,
  observacoesPsp:local.observacoesPsp,
  extratosAsaasInbox:local.extratosAsaasInbox,
  conciliacaoBancaria:local.conciliacaoBancaria,
  contasExternas:local.contasExternas,
  correspondenciasExtrato:local.correspondenciasExtrato,
  diagnosticarConvergenciaExternaEnsaio:()=>({})
 }});
 assert.equal(r.integridadeLocal,'OK');
 assert.equal(r.recebimentosFicticios,1);
 assert.equal(r.provaExternaAutenticada,false);
 assert.equal(r.autorizacaoParaDinheiroReal,false);
 assert.equal(r.prontoParaMarcoZeroComClientes,false);
 assert.equal(r.requisitosExternosPendentes.length,EXTERNOS.length);
});
test('divergencia de banco, origem ou saque nao vira prontidao',()=>{
 const r=avaliar({tesouraria:criar({falhas:true,saida:false})});
 assert.equal(r.condicoesParaTesteLocalVerificadas,false);
 assert.ok(r.alertasLocais.includes('SEM_PROVA_DE_SAQUE_ENSAIADO'));
 assert.ok(r.alertasLocais.includes('EXTRATO_BANCARIO_DIVERGENTE'));
 assert.equal(r.pagamentosReaisLiberados,false);
});
test('operacao de produção nao pode consultar auditoria do sandbox',()=>{
 const atual=process.env.NODE_ENV;
 try{
  process.env.NODE_ENV='production';
  assert.throws(()=>avaliar({tesouraria:criar()}),
   {codigo:'PRONTIDAO_ENSAIO_PROIBIDA_PRODUCAO'});
 }finally{if(atual===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=atual;}
 assert.throws(()=>avaliar({tesouraria:{}}),
  {codigo:'PRONTIDAO_ENSAIO_MODULOS_INCOMPLETOS'});
});
