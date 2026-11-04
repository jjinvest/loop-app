'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {DiagnosticoAtivacaoCandidato,BLOQUEIOS_FINAIS}=
 require('../src/domain/diagnostico-ativacao-candidato');
const ID='hom-11111111-1111-1111-1111-111111111111';
const TIT='titular-11111111-1111-1111-1111-111111111111';
const criar=estado=>{
 const banco=new DatabaseSync(':memory:');
 const preAdesao={db:banco,avaliar:()=>estado};
 return {banco,preAdesao,diag:new DiagnosticoAtivacaoCandidato({banco,preAdesao})};
};
test('gate de ativacao nunca habilita motor mesmo com pre-adesao completa',()=>{
 const {banco,diag}=criar({
  prepedidoId:ID,ensaioRegistrado:true,estado:'PRE_ADESAO_FICTICIA_PERSISTIDA',
  motivos:[],cpfDeclaradoNoEnsaio:true,fotografiaHistoricaConferida:true
 });
 try{
  const r=diag.avaliar({prepedidoId:ID,titularId:TIT});
  assert.equal(r.estado,'BLOQUEADA_PARA_ATIVACAO_DEFINITIVA');
  assert.equal(r.resumo.preAdesaoDeEnsaioSemRevisao,true);
  assert.equal(r.resumo.cpfFicticioDeclarado,true);
  assert.equal(r.resumo.identidadeExternaRealConfirmada,false);
  assert.equal(r.resumo.pagamentoComercialConfirmado,false);
  assert.equal(r.resumo.limitePorTitular,10);
  assert.equal(r.resumo.limiteTabuleiroPorTitular,2);
  assert.equal(r.permitidoAtivar,false);
  assert.equal(r.permitidoMoverFila,false);
  assert.equal(r.permitidoGirar,false);
  assert.equal(r.permitidoPagar,false);
  assert.deepEqual(r.bloqueios,BLOQUEIOS_FINAIS);
  assert.equal(banco.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n,0);
 }finally{banco.close();}
});
test('gate identifica pre-adesao ausente e pagamento revertido sem habilitar ativacao',()=>{
 const x=criar({prepedidoId:ID,ensaioRegistrado:false,
  estado:'BLOQUEADA_PARA_ENSAIO',
  motivos:['RECEBIMENTO_PSP_INDEPENDENTE_NAO_VIGENTE',
   'CPF_E_TERMOS_DE_ENSAIO_AUSENTES'],
  cpfDeclaradoNoEnsaio:false,fotografiaHistoricaConferida:true});
 try{
  const r=x.diag.avaliar({prepedidoId:ID});
  assert.ok(r.bloqueios.includes('PRE_ADESAO_AINDA_NAO_PERSISTIDA'));
  assert.ok(r.bloqueios.includes('RECEBIMENTO_PSP_INDEPENDENTE_NAO_VIGENTE'));
  assert.equal(r.resumo.pspSandboxSemRevisao,false);
  assert.equal(r.permitidoAtivar,false);
  x.preAdesao.avaliar=()=>({prepedidoId:ID,ensaioRegistrado:true,
   estado:'ENSAIO_HISTORICO_EM_REVISAO',
   motivos:['RECEBIMENTO_PSP_INDEPENDENTE_NAO_VIGENTE'],
   cpfDeclaradoNoEnsaio:true,fotografiaHistoricaConferida:true});
  const rev=x.diag.avaliar({prepedidoId:ID});
  assert.ok(rev.bloqueios.includes('PRE_ADESAO_HISTORICA_EXIGE_REVISAO'));
  assert.equal(rev.resumo.preAdesaoDeEnsaioSemRevisao,false);
 }finally{x.banco.close();}
});
test('gate nao aceita identidade, pedido ou provider arbitrar ios',()=>{
 const x=criar(null);
 try{
  assert.equal(x.diag.avaliar({prepedidoId:ID,titularId:TIT}),null);
  assert.throws(()=>x.diag.avaliar({prepedidoId:'invalido'}),/IDENTIFICACAO_PEDIDO_INVALIDA/);
  assert.throws(()=>x.diag.avaliar({prepedidoId:ID,titularId:'outro'}),/IDENTIFICACAO_PEDIDO_INVALIDA/);
  assert.throws(()=>new DiagnosticoAtivacaoCandidato({
   banco:x.banco,preAdesao:x.preAdesao,provedorIdentidade:{
    ambiente:'REAL',consultarStatus:()=>({validada:true})
   }
  }),/PROVEDOR_IDENTIDADE_NAO_HOMOLOGADO/);
 }finally{x.banco.close();}
});
test('gate rejeita uso em producao',()=>{
 const x=criar(null),old=process.env.NODE_ENV;
 process.env.NODE_ENV='production';
 try{
  assert.throws(()=>x.diag.avaliar({prepedidoId:ID}),/DIAGNOSTICO_NAO_HOMOLOGADO/);
 }finally{
  if(old===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=old;
  x.banco.close();
 }
});
