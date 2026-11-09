'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {AsaasSandboxPixOutReadOnly}=
 require('../src/producao/adaptadores-psp-readonly');
const {
 conferirCobrancaSandbox,conferirSaqueSandbox,reconsultarCompromissosAsaasSandbox
}=require('../src/producao/conferencia-observacoes-psp');
const chave='$aact_hmlg_'+('x'.repeat(50));
const dados={cobranca:{pagamentoId:'pay_100001',valorCentavos:25000},
 transferencia:{transferenciaId:'transf_100001',valorCentavos:5000}};
function cli({statusCobranca='RECEIVED',statusTransf='DONE',
 valorTransf=50,valorCobranca=250,requisicoes=[]}={}){
 return new AsaasSandboxPixOutReadOnly({
  chaveSandbox:chave,
  fetchImpl:async(url,opts)=>{
   requisicoes.push({url,metodo:opts.method});
   const body=url.endsWith('/payments/pay_100001')?
    {id:'pay_100001',status:statusCobranca,value:valorCobranca}:
    url.endsWith('/transfers/transf_100001')?
    {id:'transf_100001',status:statusTransf,value:valorTransf}:
    null;
   if(!body)throw Error('NAO_ESPERADA');
   return {status:200,headers:{get:()=>null},
    text:async()=>JSON.stringify(body)};
  }
 });
}
test('conferencia fim a fim: observacao autenticada de duas operacoes sem dinheiro real',async()=>{
 const requisicoes=[];
 const observacao=await reconsultarCompromissosAsaasSandbox({
  adaptador:cli({requisicoes}),...dados
 });
 assert.deepEqual(requisicoes.map(x=>x.metodo),['GET','GET']);
 assert.equal(observacao.cobranca.estado,'PSP_SANDBOX_SINALIZOU_RECEBIMENTO');
 assert.equal(observacao.transferencia.estado,'CONFIRMACAO_SOMENTE_SANDBOX');
 assert.equal(observacao.mudancasReais,0);
 assert.equal(observacao.dinheiroRealMovimentado,false);
 assert.equal(observacao.cobranca.comprovanteDeLiquidacaoBancariaReal,false);
 assert.equal(observacao.cobranca.novaPosicaoLiberada,false);
 assert.equal(observacao.transferencia.saqueRealPago,false);
 assert.equal(observacao.transferencia.podeReenviarAutomaticamente,false);
});
test('reversao e Pix falho ficam em quarentena; indeterminados nao sao reenviados',async()=>{
 const a=await reconsultarCompromissosAsaasSandbox({
  adaptador:cli({statusCobranca:'REFUNDED',statusTransf:'FAILED'}),...dados
 });
 assert.equal(a.cobranca.estado,'ESTORNO_SANDBOX_EXIGE_REVISAO');
 assert.equal(a.transferencia.estado,'FALHA_SOMENTE_SANDBOX');
 assert.equal(a.transferencia.podeReenviarAutomaticamente,false);
 const b=await reconsultarCompromissosAsaasSandbox({
  adaptador:cli({statusCobranca:'UNKNOWN_STATUS',statusTransf:'NEW_STATUS'}),
  ...dados
 });
 assert.equal(b.cobranca.estado,'AGUARDANDO_CONCILIACAO');
 assert.equal(b.transferencia.estado,'STATUS_DESCONHECIDO_NAO_REENVIAR');
});
test('divergencia de transferencia ou cobrança impede qualquer prova de conclusao',async()=>{
 await assert.rejects(reconsultarCompromissosAsaasSandbox({
  adaptador:cli({valorTransf:70}),...dados
 }),{codigo:'CONFERENCIA_PSP_PIX_DIVERGENTE'});
 await assert.rejects(reconsultarCompromissosAsaasSandbox({
  adaptador:cli({valorCobranca:249.99}),...dados
 }),{codigo:'CONFERENCIA_PSP_COBRANCA_DIVERGENTE'});
 assert.throws(()=>conferirSaqueSandbox({
  compromisso:dados.transferencia,
  observado:{origem:'ASAAS_SANDBOX',transferenciaId:'transf_100001',
   valorFicticioCentavos:5000,estado:'CONCLUIDO_NO_SANDBOX',
   comprovanteRealConciliado:true,saqueRealPago:false,
   podeReenviarAutomaticamente:false}
 }),{codigo:'CONFERENCIA_PSP_PIX_DIVERGENTE'});
 assert.throws(()=>conferirCobrancaSandbox({
  compromisso:{...dados.cobranca,valorCentavos:-50},observado:null
 }),{codigo:'CONFERENCIA_PSP_COMPROMISSO_INVALIDO'});
});
test('falhas de rede interrompem etapa atual e nunca criam PIX implicitamente',async()=>{
 const req=[];
 const a=new AsaasSandboxPixOutReadOnly({
  chaveSandbox:chave,fetchImpl:async(url,opts)=>{
   req.push({url,method:opts.method});
   throw Error('timeout');
  }
 });
 await assert.rejects(reconsultarCompromissosAsaasSandbox({
  adaptador:a,...dados
 }),{codigo:'PORTAS_SANDBOX_REDE_INDETERMINADA'});
 assert.equal(req.length,1);
 assert.equal(req[0].method,'GET');
 await assert.rejects(reconsultarCompromissosAsaasSandbox({
  adaptador:{consultarPix:async()=>null},...dados
 }),{codigo:'CONFERENCIA_PSP_ADAPTADOR_INVALIDO'});
});
