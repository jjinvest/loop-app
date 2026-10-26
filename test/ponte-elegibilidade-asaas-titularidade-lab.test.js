'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PonteElegibilidadeAsaasTitularidadeLab}=require('../src/domain/ponte-elegibilidade-asaas-titularidade-lab');
const pedidoId='pedido-lab-250';
function montar({status='RECEBIMENTO_INFORMADO_SANDBOX',valor=25000,
 titular=true,valorTitular=valor}={}){
 const cobrancas={auditarElegibilidadeLoop:id=>{
  assert.equal(id,pedidoId);
  return {valorCentavos:valor,elegivelParaSimulacao:status==='RECEBIMENTO_INFORMADO_SANDBOX'&&valor>=25000,
   motivos:[...(status==='RECEBIMENTO_INFORMADO_SANDBOX'?[]:['PAGAMENTO_NAO_CONFIRMADO_OU_REVERSAO']),
    ...(valor>=25000?[]:['VALOR_INFERIOR_A_250_REAIS'])]};
 }};
 const titularidade={buscar:id=>{
  assert.equal(id,pedidoId);
  return titular?{contaId:'titular-lab-001',valorCentavos:valorTitular}:null;
 }};
 return new PonteElegibilidadeAsaasTitularidadeLab({cobrancas,titularidade});
}
test('ponte somente leitura exige Pix recebido, R$250 e titular previamente fixado',()=>{
 const ok=montar().conferir(pedidoId);
 assert.equal(ok.elegivelParaTesteDeCatraca,true);
 assert.equal(ok.titularId,'titular-lab-001');
 assert.equal(ok.catracaAutorizada,false);
 assert.equal(ok.posicoesCriadas,0);
 assert.equal(ok.cpfConfirmado,false);
 for(const op of [
  {status:'PENDENTE_SANDBOX'},
  {status:'REVERSAO_INFORMADA_SANDBOX'},
  {valor:19000},
  {titular:false},
  {valorTitular:19000}
 ]){
  const parecer=montar(op).conferir(pedidoId);
  assert.equal(parecer.elegivelParaTesteDeCatraca,false);
  assert(parecer.motivos.length>0);
  assert.equal(parecer.posicoesCriadas,0);
  assert.equal(parecer.dinheiroRealMovimentadoCentavos,0);
 }
});

test('ponte rejeita titularidade fixada depois da criacao da cobranca',()=>{
 const cobrancas={
  auditarElegibilidadeLoop:()=>({valorCentavos:25000,motivos:[]}),
  consultar:()=>({origem:'CARRINHO',criadoEm:'2026-10-26T10:00:00.000Z'})
 };
 const titularidade={buscar:()=>({
  contaId:'titular-lab-001',valorCentavos:25000,criadoEm:'2026-10-26T10:01:00.000Z'
 })};
 const ponte=new PonteElegibilidadeAsaasTitularidadeLab({cobrancas,titularidade});
 const resultado=ponte.conferir(pedidoId);
 assert.equal(resultado.elegivelParaTesteDeCatraca,false);
 assert(resultado.motivos.includes('TITULAR_FIXADO_APOS_COBRANCA'));
 assert.equal(resultado.posicoesCriadas,0);
 titularidade.buscar=()=>({
  contaId:'titular-lab-001',valorCentavos:25000,criadoEm:'2026-10-26T09:59:00.000Z'
 });
 assert.equal(ponte.conferir(pedidoId).elegivelParaTesteDeCatraca,true);
});
