'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {executar}=require('../scripts/operar-receptor-asaas-railway-staging');
const {reconsultar}=require('../scripts/reconsultar-asaas-railway-psp-staging');
const {projetar}=require('../scripts/projetar-posicao-railway-staging');
const {InboxWebhookPrepedidoAsaasStaging}=
 require('../src/domain/inbox-webhook-prepedido-asaas-staging');

test('PSP reconsultado -> uma posicao ficticia no mesmo SQLite Railway; replay nao duplica',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'proj-railway-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'webhook.sqlite');fs.closeSync(fs.openSync(file,'wx',0o600));
 const env={NODE_ENV:'staging',RAILWAY_VOLUME_MOUNT_PATH:dir,
  LOOP_RAILWAY_STAGING_SQLITE:file,LOOP_RAILWAY_STAGING_AUTORIZADO:'SIM',
  LOOP_RAILWAY_OPERACAO_AUTORIZADA:'SIM',LOOP_RAILWAY_OPERACAO_ESCRITA:'SIM',
  LOOP_RAILWAY_WEBHOOK_TOKEN:'t'.repeat(64),
  ASAAS_SANDBOX_CLIENTE_TESTE_ID:'cus_TESTESANDBOX001',
  LOOP_RAILWAY_OPERACAO_ACAO:'PREPARAR'};
 const pedido=await executar({ambiente:env});
 const pay='pay_SANDBOXPOSICAO01';
 await executar({ambiente:{...env,LOOP_RAILWAY_OPERACAO_ACAO:'MARCAR_ENVIO'}});
 await executar({ambiente:{...env,LOOP_RAILWAY_OPERACAO_ACAO:'VINCULAR',
  LOOP_RAILWAY_PAGAMENTO_SANDBOX_ID:pay}});
 const config={...env,LOOP_RAILWAY_PROJECAO_AUTORIZADA:'SIM',
  LOOP_RAILWAY_RECONSULTA_AUTORIZADA:'SIM',
  LOOP_RAILWAY_PREPEDIDO_ESPERADO_ID:pedido.prepedidoId,
  LOOP_RAILWAY_PAGAMENTO_ESPERADO_ID:pay,
  LOOP_RAILWAY_CLIENTE_ESPERADO_ID:'cus_TESTESANDBOX001'};
 assert.throws(()=>projetar({ambiente:config}),/RECEBIMENTO_SANDBOX_NAO_CONCILIADO/);
 const banco=new DatabaseSync(file);
 try{
  banco.exec('PRAGMA foreign_keys=ON');
  const inbox=new InboxWebhookPrepedidoAsaasStaging({
   banco,token:config.LOOP_RAILWAY_WEBHOOK_TOKEN
  });
  for(const [event,uid] of [
   ['PAYMENT_CREATED','evt_CREATED_SANDBOX01'],
   ['PAYMENT_RECEIVED','evt_RECEIVED_SANDBOX01']
  ]){
   inbox.registrar({cabecalhoToken:config.LOOP_RAILWAY_WEBHOOK_TOKEN,
    corpoBruto:Buffer.from(JSON.stringify({id:uid,event,
     payment:{id:pay,billingType:'PIX',externalReference:pedido.externalReference,
      value:250,status:event==='PAYMENT_RECEIVED'?'RECEIVED':'PENDING'}}))});
  }
 }finally{banco.close();}
 let get=0;
 await reconsultar({ambiente:config,provedor:{ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  async consultarCobranca(id){get++;assert.equal(id,pay);
   return {pagamentoId:pay,valorCentavos:25000,status:'RECEIVED',
    clienteAsaasId:config.ASAAS_SANDBOX_CLIENTE_TESTE_ID,
    externalReference:pedido.externalReference,billingType:'PIX'};}}});
 assert.equal(get,1);
 const primeira=projetar({ambiente:config});
 assert.equal(primeira.estado,'UMA_POSICAO_PENDENTE_APENAS_SANDBOX');
 assert.equal(primeira.idempotencia,'CRIACAO_UNICA');
 assert.equal(primeira.posicoesPendentesSimuladas,1);
 assert.equal(primeira.posicoesReais,0);
 assert.equal(primeira.cpfConfirmavel,false);
 const segunda=projetar({ambiente:config});
 assert.equal(segunda.idempotencia,'REPLAY_SEM_NOVA_POSICAO');
 assert.equal(segunda.posicoesPendentesSimuladas,1);
 assert.equal(segunda.sqliteIntegro,true);
 const reopen=new DatabaseSync(file,{readOnly:true});
 try{
  assert.equal(reopen.prepare(
   'SELECT COUNT(*) AS n FROM akitemm_prepedido_posicoes_pendentes_sandbox_staging'
  ).get().n,1);
  assert.equal(reopen.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{reopen.close();}
 assert.equal(get,1,'projecao nao deve consultar PSP novamente');
});

test('projecao de Railway recusa ambiente, autorizacao e identificador errado',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'proj-neg-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'webhook.sqlite');fs.closeSync(fs.openSync(file,'wx',0o600));
 const env={NODE_ENV:'staging',RAILWAY_VOLUME_MOUNT_PATH:dir,
  LOOP_RAILWAY_STAGING_SQLITE:file,LOOP_RAILWAY_STAGING_AUTORIZADO:'SIM',
  LOOP_RAILWAY_OPERACAO_AUTORIZADA:'SIM',LOOP_RAILWAY_OPERACAO_ESCRITA:'SIM',
  LOOP_RAILWAY_WEBHOOK_TOKEN:'x'.repeat(64),
  ASAAS_SANDBOX_CLIENTE_TESTE_ID:'cus_TESTESANDBOX001',
  LOOP_RAILWAY_OPERACAO_ACAO:'PREPARAR'};
 const pedido=await executar({ambiente:env});
 assert.throws(()=>projetar({ambiente:env}),/PROJECAO_RAILWAY_NAO_AUTORIZADA/);
 assert.throws(()=>projetar({ambiente:{...env,NODE_ENV:'production',
  LOOP_RAILWAY_PROJECAO_AUTORIZADA:'SIM'}}),/PROJECAO_RAILWAY_NAO_AUTORIZADA/);
 assert.throws(()=>projetar({ambiente:{...env,LOOP_RAILWAY_PROJECAO_AUTORIZADA:'SIM',
  LOOP_RAILWAY_PREPEDIDO_ESPERADO_ID:pedido.prepedidoId,
  LOOP_RAILWAY_PAGAMENTO_ESPERADO_ID:'pay_INVALIDO'}}),
  /RECEBIMENTO_SANDBOX_NAO_CONCILIADO/);
});
