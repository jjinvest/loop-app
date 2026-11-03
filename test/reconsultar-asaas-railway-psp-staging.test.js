'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {executar}=require('../scripts/operar-receptor-asaas-railway-staging');
const {reconsultar}=require('../scripts/reconsultar-asaas-railway-psp-staging');
const {InboxWebhookPrepedidoAsaasStaging}=require('../src/domain/inbox-webhook-prepedido-asaas-staging');
test('reconsulta PSP do Railway vincula dois eventos e preserva zero beneficios reais',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'reconsulta-railway-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const arquivo=path.join(dir,'webhook.sqlite');
 fs.closeSync(fs.openSync(arquivo,'wx',0o600));
 const env={NODE_ENV:'staging',RAILWAY_VOLUME_MOUNT_PATH:dir,
  LOOP_RAILWAY_STAGING_SQLITE:arquivo,LOOP_RAILWAY_STAGING_AUTORIZADO:'SIM',
  LOOP_RAILWAY_WEBHOOK_TOKEN:'t'.repeat(64),
  LOOP_RAILWAY_OPERACAO_AUTORIZADA:'SIM',LOOP_RAILWAY_OPERACAO_ESCRITA:'SIM',
  ASAAS_SANDBOX_CLIENTE_TESTE_ID:'cus_TESTESANDBOX001',
  LOOP_RAILWAY_OPERACAO_ACAO:'PREPARAR'};
 const p=await executar({ambiente:env});
 assert.equal(p.pedidos,1);
 const id='pay_HOMOLOGACAO12345';
 await executar({ambiente:{...env,LOOP_RAILWAY_OPERACAO_ACAO:'MARCAR_ENVIO'}});
 await executar({ambiente:{...env,LOOP_RAILWAY_OPERACAO_ACAO:'VINCULAR',
  LOOP_RAILWAY_PAGAMENTO_SANDBOX_ID:id}});
 const banco=new DatabaseSync(arquivo);
 try{
  banco.exec('PRAGMA foreign_keys=ON');
  const inbox=new InboxWebhookPrepedidoAsaasStaging({banco,token:env.LOOP_RAILWAY_WEBHOOK_TOKEN});
  for(const [tipo,indice] of [['PAYMENT_CREATED','001'],['PAYMENT_RECEIVED','002']]){
   const corpoBruto=Buffer.from(JSON.stringify({
    id:'evt_SANDBOX'+indice,event:tipo,payment:{id,
     value:250,billingType:'PIX',
     externalReference:p.externalReference,
     status:tipo==='PAYMENT_RECEIVED'?'RECEIVED':'PENDING'}
   }));
   inbox.registrar({cabecalhoToken:env.LOOP_RAILWAY_WEBHOOK_TOKEN,corpoBruto});
  }
 }finally{banco.close();}
 let consultas=0;
 const provedor={ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  async consultarCobranca(payment){
   consultas++;
   assert.equal(payment,id);
   return {pagamentoId:id,status:'RECEIVED',valorCentavos:25000,
    externalReference:p.externalReference,billingType:'PIX',
    clienteAsaasId:'cus_TESTESANDBOX001'};
  }};
 const cfg={...env,LOOP_RAILWAY_RECONSULTA_AUTORIZADA:'SIM',
  LOOP_RAILWAY_PREPEDIDO_ESPERADO_ID:p.prepedidoId,
  LOOP_RAILWAY_PAGAMENTO_ESPERADO_ID:id,
  LOOP_RAILWAY_CLIENTE_ESPERADO_ID:'cus_TESTESANDBOX001'};
 const resultado=await reconsultar({ambiente:cfg,provedor});
 assert.equal(resultado.ok,true);
 assert.equal(resultado.estadoReconsulta,'CONCLUIDO');
 assert.equal(resultado.statusPSP,'RECEIVED');
 assert.equal(resultado.prepedidos,1);
 assert.equal(resultado.eventosPersistidos,2);
 assert.equal(resultado.posicoesReais,0);
 assert.equal(resultado.pagamentoReal,false);
 assert.equal(consultas,1);
 const replay=await reconsultar({ambiente:cfg,provedor});
 assert.equal(replay.consultaReutilizada,true);
 assert.equal(consultas,1);
});
test('reconsulta Railway bloqueia ausencia de autorizacao e ID divergente',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'reconsulta-railway-neg-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const arquivo=path.join(dir,'webhook.sqlite');
 fs.closeSync(fs.openSync(arquivo,'wx',0o600));
 const env={NODE_ENV:'staging',RAILWAY_VOLUME_MOUNT_PATH:dir,
  LOOP_RAILWAY_STAGING_SQLITE:arquivo,LOOP_RAILWAY_STAGING_AUTORIZADO:'SIM',
  LOOP_RAILWAY_WEBHOOK_TOKEN:'x'.repeat(64),
  LOOP_RAILWAY_OPERACAO_AUTORIZADA:'SIM',LOOP_RAILWAY_OPERACAO_ESCRITA:'SIM',
  ASAAS_SANDBOX_CLIENTE_TESTE_ID:'cus_TESTESANDBOX001',
  LOOP_RAILWAY_OPERACAO_ACAO:'PREPARAR'};
 const p=await executar({ambiente:env});
 await assert.rejects(()=>reconsultar({ambiente:env}),/NAO_AUTORIZADA/);
 await assert.rejects(()=>reconsultar({ambiente:{...env,
  LOOP_RAILWAY_RECONSULTA_AUTORIZADA:'SIM',
  LOOP_RAILWAY_PREPEDIDO_ESPERADO_ID:p.prepedidoId,
  LOOP_RAILWAY_PAGAMENTO_ESPERADO_ID:'pay_DIVERGENTE',
  LOOP_RAILWAY_CLIENTE_ESPERADO_ID:'cus_TESTESANDBOX001'},
  provedor:{ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  consultarCobranca:()=>{throw Error('nao deve consultar PSP');}}}),
 /CONTRATO_PAGAMENTO_SANDBOX_DIVERGENTE/);
});
