'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {InboxWebhookPrepedidoAsaasStaging}=
 require('../src/domain/inbox-webhook-prepedido-asaas-staging');
const {PontePrepedidoAsaasSandboxStaging}=
 require('../src/domain/ponte-prepedido-asaas-sandbox-staging');
const {ReconsultaWebhookPrepedidoAsaasStaging}=
 require('../src/domain/reconsulta-webhook-prepedido-asaas-staging');
const agoraMs=Date.parse('2026-11-06T20:45:00Z');
const token='TOKEN_FICTICIO_SEGURO_QUE_NAO_LIBERA_NENHUM_PIX';
const prepedido='hom-12345678-1234-4123-8123-123456789abc';
const pagamento='pay_TESTE_DE_RETOMADA_00001';
const evento='evt_RECUPERACAO_00001';
const data=()=>new Date(agoraMs).toISOString();
function laboratorio({file=':memory:',seed=true}={}){
 const db=new DatabaseSync(file);
 db.exec('PRAGMA foreign_keys=ON');
 if(seed){
 db.exec([
  'CREATE TABLE akitemm_prepedido_asaas_sandbox_staging(',
  'prepedido_id TEXT PRIMARY KEY NOT NULL,',
  'titular_id TEXT NOT NULL,',
  'pagamento_id TEXT NOT NULL,',
  'valor_centavos INTEGER NOT NULL,',
  'external_ref TEXT NOT NULL);'
 ].join(' '));
 db.prepare([
  'INSERT INTO akitemm_prepedido_asaas_sandbox_staging',
  '(prepedido_id,titular_id,pagamento_id,valor_centavos,external_ref)',
  'VALUES(?,?,?,?,?)'
 ].join(' ')).run(prepedido,
  'titular-12345678-1234-4123-8123-123456789abc',
  pagamento,25000,'LOOPLAB-'+prepedido);
 }
 const inbox=new InboxWebhookPrepedidoAsaasStaging({banco:db,token,agora:data});
 const body=Buffer.from(JSON.stringify({
  id:evento,event:'PAYMENT_RECEIVED',
  payment:{id:pagamento,externalReference:'LOOPLAB-'+prepedido,
   billingType:'PIX',status:'RECEIVED',value:250}
 }));
 if(seed)inbox.registrar({cabecalhoToken:token,corpoBruto:body});
 let consultas=0;
 const ponte=Object.create(PontePrepedidoAsaasSandboxStaging.prototype);
 ponte.banco=db;
 ponte.conferir=async()=>{
  consultas++;
  return {estado:'RECEBIMENTO_INFORMADO_SANDBOX',
   ultimaConsultaSandbox:{statusAsaas:'RECEIVED'},
   revisaoManualObrigatoria:false};
 };
 const worker=new ReconsultaWebhookPrepedidoAsaasStaging({
  banco:db,inbox,ponte,agora:data,agoraMs:()=>agoraMs
 });
 const provedor={
  ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
  consultarCobranca:async()=>({status:'RECEIVED'})
 };
 return {db,worker,provedor,get consultas(){return consultas;}};
}
function inserirCheckpoint(db,estado='PROCESSANDO',codigo='RECONSULTA',
 idadeMs=180000){
 db.prepare([
  'INSERT INTO akitemm_prepedido_webhook_reconsulta_staging',
  '(evento_id,estado,codigo,iniciado_em)',
  'VALUES(?,?,?,?)'
 ].join(' ')).run(evento,estado,codigo,
  new Date(agoraMs-idadeMs).toISOString());
}
test('queda apos PROCESSANDO -> checkpoint -> nova prova PSP -> exatamente uma conclusao',async()=>{
 const x=laboratorio();
 try{
  inserirCheckpoint(x.db);
  const primeiro=x.worker.recuperarTravados({
   execucaoLiberada:true,idadeMinimaMs:120000,limite:5
  });
  assert.equal(primeiro.recuperados,1);
  assert.equal(x.worker.consultar(evento).estado,'EXIGE_REVISAO');
  assert.equal(x.consultas,0,'recuperar travados nao contacta o PSP');
  const r=await x.worker.processar({
   eventoId:evento,provedor:x.provedor,
   execucaoLiberada:true,retomadaSegura:true
  });
  assert.equal(r.estado,'CONCLUIDO');
  assert.equal(r.codigo,'PSP_RECONSULTADO');
  assert.equal(r.retomadaDeInterrupcao,true);
  assert.equal(x.consultas,1);
  const replay=await x.worker.processar({
   eventoId:evento,provedor:x.provedor,
   execucaoLiberada:true,retomadaSegura:true
  });
  assert.equal(replay.repetido,true);
  assert.equal(x.consultas,1);
  const linhas=x.db.prepare([
   'SELECT COUNT(*) AS n FROM akitemm_prepedido_webhook_recuperacoes_staging'
  ].join(' ')).get().n;
  assert.equal(linhas,1,'auditoria recuperacao duravel, unica');
  assert.equal(x.worker.resumoPendencias().total,0);
 }finally{x.db.close();}
});
test('checkpoint que exige revisao PSP nao e liberado por opt-in de retomada',async()=>{
 const x=laboratorio();
 try{
  inserirCheckpoint(x.db,'EXIGE_REVISAO','PSP_DIVERGENTE_OU_REVISAO');
  const r=await x.worker.processar({
   eventoId:evento,provedor:x.provedor,
   execucaoLiberada:true,retomadaSegura:true
  });
  assert.equal(r.estado,'EXIGE_REVISAO');
  assert.equal(r.repetido,true);
  assert.equal(x.consultas,0);
  assert.equal(x.worker.resumoPendencias().exigeRevisao,1);
 }finally{x.db.close();}
});
test('sem checkpoint duravel, forja EXIGE_REVISAO nao retoma nem toca PSP',async()=>{
 const x=laboratorio();
 try{
  inserirCheckpoint(x.db,'EXIGE_REVISAO','PROCESSAMENTO_INTERROMPIDO_REVISAR');
  await assert.rejects(x.worker.processar({
   eventoId:evento,provedor:x.provedor,
   execucaoLiberada:true,retomadaSegura:true
  }),{codigo:'RETOMADA_SEM_CHECKPOINT_DURAVEL'});
  assert.equal(x.worker.consultar(evento).estado,'EXIGE_REVISAO');
  assert.equal(x.consultas,0);
 }finally{x.db.close();}
});
test('PROCESSANDO recente permanece intacto; nao interromper worker legitimo',async()=>{
 const x=laboratorio();
 try{
  inserirCheckpoint(x.db,'PROCESSANDO','RECONSULTA',20000);
  const r=x.worker.recuperarTravados({
   execucaoLiberada:true,idadeMinimaMs:120000
  });
  assert.equal(r.recuperados,0);
  assert.equal(x.worker.consultar(evento).estado,'PROCESSANDO');
  assert.equal(x.consultas,0);
 }finally{x.db.close();}
});
test('retomada sem permissao e negada sem reconsulta remota',async()=>{
 const x=laboratorio();
 try{
  inserirCheckpoint(x.db);
  const r=x.worker.recuperarTravados({
   execucaoLiberada:true,idadeMinimaMs:120000
  });
  assert.equal(r.recuperados,1);
  const resp=await x.worker.processar({
   eventoId:evento,provedor:x.provedor,execucaoLiberada:true
  });
  assert.equal(resp.repetido,true);
  assert.equal(resp.estado,'EXIGE_REVISAO');
  assert.equal(x.consultas,0);
 }finally{x.db.close();}
});

test('segunda interrupcao nao gera retry infinito nem fere PK da auditoria',async()=>{
 const x=laboratorio();
 try{
  inserirCheckpoint(x.db);
  const primeira=x.worker.recuperarTravados({
   execucaoLiberada:true,idadeMinimaMs:120000
  });
  assert.equal(primeira.recuperados,1);
  const retomar=x.db.prepare([
   'UPDATE akitemm_prepedido_webhook_reconsulta_staging',
   "SET estado='PROCESSANDO',codigo='RECONSULTA_RETOMADA',iniciado_em=?,",
   'finalizado_em=NULL WHERE evento_id=?'
  ].join(' ')).run(new Date(agoraMs-180000).toISOString(),evento);
  assert.equal(retomar.changes,1);
  const segunda=x.worker.recuperarTravados({
   execucaoLiberada:true,idadeMinimaMs:120000
  });
  assert.equal(segunda.recuperados,0);
  assert.equal(segunda.reinterrompidos,1);
  const estado=x.worker.consultar(evento);
  assert.equal(estado.estado,'EXIGE_REVISAO');
  assert.equal(estado.codigo,'RETOMADA_REINTERROMPIDA_EXIGE_REVISAO');
  const r=await x.worker.processar({
   eventoId:evento,provedor:x.provedor,
   execucaoLiberada:true,retomadaSegura:true
  });
  assert.equal(r.repetido,true);
  assert.equal(x.consultas,0);
  const historico=x.db.prepare(
   'SELECT COUNT(*) AS n FROM akitemm_prepedido_webhook_recuperacoes_staging'
  ).get().n;
  assert.equal(historico,1);
 }finally{x.db.close();}
});

test('fecha e reabre SQLite em disco apos PROCESSANDO e recupera sem duplicar evento',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-crash-as-sandbox-'));
 const arquivo=path.join(dir,'laboratorio.sqlite');
 let a=null,b=null;
 try{
  a=laboratorio({file:arquivo});
  inserirCheckpoint(a.db);
  a.db.close();a=null;
  // Simula uma instância totalmente nova com a mesma fonte persistida,
  // não apenas retorno de uma funcao na instancia antiga.
  b=laboratorio({file:arquivo,seed:false});
  const resultado=b.worker.recuperarTravados({
   execucaoLiberada:true,idadeMinimaMs:120000,limite:5
  });
  assert.equal(resultado.recuperados,1);
  assert.equal(b.consultas,0);
  const concluido=await b.worker.processar({
   eventoId:evento,provedor:b.provedor,
   execucaoLiberada:true,retomadaSegura:true
  });
  assert.equal(concluido.estado,'CONCLUIDO');
  assert.equal(b.consultas,1);
  const inbox=b.db.prepare(
   'SELECT COUNT(*) AS n FROM akitemm_prepedido_webhook_inbox_staging'
  ).get().n;
  assert.equal(inbox,1,'o mesmo evento nao deve ser recriado');
  const reconsultas=b.db.prepare(
   'SELECT COUNT(*) AS n FROM akitemm_prepedido_webhook_reconsulta_staging'
  ).get().n;
  assert.equal(reconsultas,1,'checkpoint do mesmo evento deve ser unico');
  const auditorias=b.db.prepare(
   'SELECT COUNT(*) AS n FROM akitemm_prepedido_webhook_recuperacoes_staging'
  ).get().n;
  assert.equal(auditorias,1);
 }finally{
  if(a)a.db.close();
  if(b)b.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
