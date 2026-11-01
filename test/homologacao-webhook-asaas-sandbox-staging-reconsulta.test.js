'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {preparar,enviarSandbox}=
 require('../scripts/preparar-e-enviar-webhook-asaas-sandbox-staging');
const {inspecionarEvento,reconsultarEvento}=
 require('../scripts/conferir-webhook-asaas-sandbox-staging');
const {InboxWebhookPrepedidoAsaasStaging}=
 require('../src/domain/inbox-webhook-prepedido-asaas-staging');
const TOKEN='TOKEN_WEBHOOK_HOMOLOGACAO_FICTICIO_2026_123456789';
const PAYMENT='pay_TestSandboxIntegracaoWebhook001';
const CLIENTE='cus_ClienteHomologacaoFicticio0001';
test('homologacao de recebimento: prepedido persistente -> callback inbox -> GET PSP separado, sem posicao',async t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'loop-homologacao-externa-preparo-'));
 const arquivo=path.join(dir,'staging.sqlite');
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const c=await preparar({arquivo,clienteAsaasId:CLIENTE,execucaoLiberada:true});
 let posts=0,gets=0;
 const provedor={ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  async criarCobrancaPix({pedidoId,valorCentavos,clienteAsaasId}){
   posts++;
   assert.equal(pedidoId,c.prepedidoId);
   assert.equal(valorCentavos,25000);
   assert.equal(clienteAsaasId,CLIENTE);
   return {ambiente:'ASAAS_SANDBOX_EXCLUSIVO',pagamentoId:PAYMENT,
    status:'PENDING',valorCentavos};
  },
  async consultarCobranca(id){
   gets++;
   assert.equal(id,PAYMENT);
   return {pagamentoId:PAYMENT,status:'RECEIVED',valorCentavos:25000,
    billingType:'PIX',clienteAsaasId:CLIENTE,
    externalReference:'LOOPLAB-'+c.prepedidoId};
  }
 };
 const id='evt_RecebidoPeloTunelEmEnsaio00001';
 const antes=inspecionarEvento({arquivo,eventoId:id});
 assert.equal(antes.recebidoLocalmente,false);
 assert.equal(antes.entregaPeloAsaasComprovada,false);
 await assert.rejects(reconsultarEvento({arquivo,eventoId:id,tokenWebhook:TOKEN,
  provedor,execucaoLiberada:true}),{codigo:'WEBHOOK_NAO_RECEBIDO_NESTE_SQLITE'});
 assert.equal(gets,0);
 const enviada=await enviarSandbox({arquivo,titularId:c.titularId,
  prepedidoId:c.prepedidoId,provedor,execucaoLiberada:true});
 assert.equal(enviada.estado,'PENDENTE_SANDBOX');
 assert.equal(posts,1);
 const banco=new DatabaseSync(arquivo);
 banco.exec('PRAGMA foreign_keys=ON;');
 const inbox=new InboxWebhookPrepedidoAsaasStaging({banco,token:TOKEN});
 const event={id,event:'PAYMENT_RECEIVED',payment:{id:PAYMENT}};
 const registered=inbox.registrar({cabecalhoToken:TOKEN,
  corpoBruto:Buffer.from(JSON.stringify(event))});
 assert.equal(registered.registrado,true);
 banco.close();
 const local=inspecionarEvento({arquivo,eventoId:id});
 assert.equal(local.recebidoLocalmente,true);
 assert.equal(local.estadoReconsulta,null);
 assert.equal(local.entregaPeloAsaasComprovada,false);
 assert.equal(gets,0,'inspecao local nao chama PSP');
 await assert.rejects(reconsultarEvento({arquivo,eventoId:id,
  tokenWebhook:TOKEN,provedor}),{codigo:'RECONSULTA_SANDBOX_NAO_AUTORIZADA'});
 const done=await reconsultarEvento({arquivo,eventoId:id,
  tokenWebhook:TOKEN,provedor,execucaoLiberada:true});
 assert.equal(done.estadoReconsulta,'CONCLUIDO');
 assert.equal(done.ultimaSituacaoSandbox,'RECEIVED');
 assert.equal(done.entregaPeloAsaasComprovada,false,
  'callback injetado em ensaio local NAO comprova entrega pelo Asaas');
 assert.equal(done.pagamentoReal,false);
 assert.equal(done.posicoesCriadas,0);
 assert.equal(done.pedidoComercialCriado,false);
 assert.equal(done.bonusGerados,0);
 assert.equal(done.saquesLiberados,0);
 assert.equal(gets,1,'GET PSP independente uma vez');
 const repetido=await reconsultarEvento({arquivo,eventoId:id,
  tokenWebhook:TOKEN,provedor,execucaoLiberada:true});
 assert.equal(repetido.resultadoReutilizado,true);
 assert.equal(gets,1,'replay nao faz segundo GET nem POST');
 assert.equal(posts,1);
 const after=inspecionarEvento({arquivo,eventoId:id});
 assert.equal(after.estadoReconsulta,'CONCLUIDO');
 const check=new DatabaseSync(arquivo);
 assert.equal(check.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(check.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(check.prepare(
  'SELECT COUNT(*) AS n FROM akitemm_prepedido_asaas_consultas_staging'
 ).get().n,1);
 check.close();
});
