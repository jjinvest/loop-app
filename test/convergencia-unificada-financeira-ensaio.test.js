'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {avaliarConvergenciaUnificadaEnsaio:avaliar}=
 require('../src/producao/convergencia-unificada-financeira-ensaio');
function criar(t,{psp='ASAAS',obsRecebimento='PSP_SANDBOX_SINALIZOU_RECEBIMENTO',
 obsPix='CONFIRMACAO_SOMENTE_SANDBOX',inconsistente=false}={}){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec([
  'CREATE TABLE loja_real_pedidos(pedido_id TEXT,pagamento_id TEXT);',
  'CREATE TABLE loop_lab_tesouraria_recebimentos(pedido_id TEXT,psp TEXT);',
  'CREATE TABLE loop_lab_tesouraria_saques(',
  'saque_id TEXT,executor TEXT,estado TEXT,tentativa_id TEXT);'
 ].join(' '));
 db.prepare('INSERT INTO loja_real_pedidos VALUES(?,?)').run('PEDIDO_1','PAY_1');
 db.prepare('INSERT INTO loop_lab_tesouraria_recebimentos VALUES(?,?)')
  .run('PEDIDO_1',psp);
 db.prepare('INSERT INTO loop_lab_tesouraria_saques VALUES(?,?,?,?)')
  .run('SAQUE_1','ASAAS','PAGO','PIX_1');
 return {db,tesouraria:{
  db,verificar:()=>({integridade:'OK'}),
  conciliacaoBancaria:{analisar:()=>({
   movimentosBancariosEsperados:3,
   movimentosComDeclaracoesConcordantes:3,totalDivergencias:0,
   todasDeclaracoesCoincidem:true
  })},
  observacoesPsp:{consultarCompromisso:({tipo})=>({
   totalObservacoes:1,revisaoManualObrigatoria:inconsistente,
   ultimaObservacao:tipo==='COBRANCA'?obsRecebimento:obsPix
  })}
 }};
}
test('recebimento Asaas e Pix Asaas coerentes no sandbox, sem liberar financeiro real',t=>{
 const {tesouraria}=criar(t);
 const r=avaliar({tesouraria});
 assert.equal(r.integridadeInterna,'OK');
 assert.equal(r.semFalhasDeclaradas,true);
 assert.equal(r.pspSandboxSinalizouRecebimento,1);
 assert.equal(r.pixSandboxSinalizouConclusao,1);
 assert.equal(r.saquesReaisLiberados,false);
 assert.equal(r.conciliacaoRealCertificada,false);
 assert.equal(r.extratosBancariosExternosAutenticados,false);
});
test('reconsulta do Asaas nao confirma venda cujo recebedor contratado e Celcoin',t=>{
 const {tesouraria}=criar(t,{psp:'CELCOIN'});
 const r=avaliar({tesouraria});
 assert.equal(r.semFalhasDeclaradas,false);
 assert.equal(r.divergenciasPorCodigo
  .PSP_ORIGEM_NAO_CORRESPONDE_A_OBSERVACAO,1);
 assert.equal(r.pspSandboxSinalizouRecebimento,0);
});
test('estorno, status PSP reverso ou PIX incerto bloqueiam convergencia',t=>{
 const {tesouraria}=criar(t,{inconsistente:true});
 const r=avaliar({tesouraria});
 assert.equal(r.divergenciasPorCodigo.PSP_COM_HISTORICO_INCONSISTENTE,1);
 assert.equal(r.divergenciasPorCodigo.PIX_COM_HISTORICO_INCONSISTENTE,1);
 assert.equal(r.semFalhasDeclaradas,false);
});
test('producao e modulos nao configurados jamais habilitam saque',t=>{
 const {tesouraria}=criar(t);
 assert.throws(()=>avaliar({tesouraria:{}}),
  {codigo:'CONVERGENCIA_ENSAIO_MODULOS_INCOMPLETOS'});
 const current=process.env.NODE_ENV;
 try{
  process.env.NODE_ENV='production';
  assert.throws(()=>avaliar({tesouraria}),
   {codigo:'CONVERGENCIA_ENSAIO_PROIBIDA_EM_PRODUCAO'});
 }finally{
  if(current===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=current;
 }
});
