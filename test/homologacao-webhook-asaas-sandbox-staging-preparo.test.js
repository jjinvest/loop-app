'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {preparar,enviarSandbox}=
 require('../scripts/preparar-e-enviar-webhook-asaas-sandbox-staging');
test('preparacao persistente do webhook gera prepedido sem cobranca e envio opt-in apenas sandbox',async t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'loop-homologacao-persistente-'));
 const arquivo=path.join(dir,'staging.sqlite');
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const clienteAsaasId='cus_ClienteFicticioSandbox00001';
 await assert.rejects(preparar({arquivo,clienteAsaasId}),
  {codigo:'PREPARACAO_NAO_AUTORIZADA'});
 const base=await preparar({arquivo,clienteAsaasId,execucaoLiberada:true});
 assert.equal(base.estado,'PREPARADA_SEM_COBRANCA');
 assert.equal(base.codigoPagamentoCriado,false);
 assert.equal(base.posicoesCriadas,0);
 assert.equal(base.valorCentavos,25000);
 await assert.rejects(preparar({arquivo,clienteAsaasId,execucaoLiberada:true}),
  {codigo:'BASE_STAGING_JA_EXISTE'});
 const banco=new DatabaseSync(arquivo);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(banco.prepare(
  'SELECT COUNT(*) AS n FROM akitemm_prepedido_asaas_sandbox_staging'
 ).get().n,1);
 assert.equal(banco.prepare(
  'SELECT pagamento_id AS pagamento FROM akitemm_prepedido_asaas_sandbox_staging'
 ).get().pagamento,null,'sem rede durante preparo');
 banco.close();
 let post=0;
 const provedor={ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  async criarCobrancaPix({clienteAsaasId:cliente,pedidoId,valorCentavos}){
   post++;assert.equal(cliente,clienteAsaasId);
   assert.equal(pedidoId,base.prepedidoId);
   assert.equal(valorCentavos,25000);
   return {ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
    pagamentoId:'pay_TestWebhookSandboxPersistente01',
    status:'PENDING',valorCentavos:25000};
  }
 };
 await assert.rejects(enviarSandbox({arquivo,titularId:base.titularId,
  prepedidoId:base.prepedidoId,provedor}),{codigo:'ENVIO_SANDBOX_NAO_AUTORIZADO'});
 const enviado=await enviarSandbox({arquivo,titularId:base.titularId,
  prepedidoId:base.prepedidoId,provedor,execucaoLiberada:true});
 assert.equal(enviado.estado,'PENDENTE_SANDBOX');
 assert.equal(enviado.novaCobrancaSomenteSandbox,true);
 assert.equal(enviado.pagamentoReal,false);
 assert.equal(enviado.posicoesCriadas,0);
 const repetido=await enviarSandbox({arquivo,titularId:base.titularId,
  prepedidoId:base.prepedidoId,provedor,execucaoLiberada:true});
 assert.equal(repetido.repetido,true);
 assert.equal(post,1);
 const reaberto=new DatabaseSync(arquivo);
 assert.equal(reaberto.prepare(
  'SELECT COUNT(*) AS n FROM akitemm_prepedido_asaas_sandbox_staging WHERE pagamento_id IS NOT NULL'
 ).get().n,1);
 assert.equal(reaberto.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(reaberto.prepare('PRAGMA foreign_key_check').all(),[]);
 reaberto.close();
});
