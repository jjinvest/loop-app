'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const {mkdtempSync,rmSync}=require('node:fs');
const path=require('node:path');
const {tmpdir}=require('node:os');
const {InboxWebhookPrepedidoAsaasStaging}=
 require('../src/domain/inbox-webhook-prepedido-asaas-staging');
const TOKEN='WebhookCrashEnsaioSomenteFicticio2026'+('W'.repeat(42));
const PEDIDO='hom-crash-2026',PAGAMENTO='pay_CrashTesteAsaas2026';
function aviso(id){
 return JSON.stringify({id,event:'PAYMENT_RECEIVED',
  payment:{id:PAGAMENTO,externalReference:'LOOPLAB-'+PEDIDO,
   billingType:'PIX',value:250}});
}
// Um processo filho segura uma escrita SQLite ou a confirma; o processo pai
// mata o filho por SIGKILL. Nunca faz GET/POST remoto ou toca no motor real.
const childSource=`
'use strict';
const {DatabaseSync}=require('node:sqlite');
const {InboxWebhookPrepedidoAsaasStaging}=require(process.argv[3]);
const [dbFile,modo,modulePath,token,body]=process.argv.slice(1);
const db=new DatabaseSync(dbFile);
db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;');
const inbox=new InboxWebhookPrepedidoAsaasStaging({banco:db,token});
if(modo==='pre-commit'){
 db.exec('BEGIN IMMEDIATE');
 db.prepare([
  'INSERT INTO akitemm_prepedido_webhook_inbox_staging',
  '(evento_id,prepedido_id,pagamento_id,tipo,status_avisado,',
  'valor_avisado_centavos,hash_semantico,recebido_em)',
  'VALUES(?,?,?,?,?,?,?,?)'
 ].join(' ')).run('evt_SIGKILL_BeforeCommit2026','hom-crash-2026',
  'pay_CrashTesteAsaas2026','PAYMENT_RECEIVED','NAO_INFORMADO',
  25000,'0'.repeat(64),new Date().toISOString());
 process.stdout.write('READY_PRECOMMIT\\n');
}else{
 const r=inbox.registrar({cabecalhoToken:token,corpoBruto:Buffer.from(body)});
 if(!r.registrado||r.posicoesCriadas!==0)process.exit(77);
 process.stdout.write('READY_COMMITTED\\n');
}
setInterval(()=>{},1000);
`;
async function matarEmCheckpoint({arquivo,modo,body}){
 const m=path.resolve(__dirname,
  '../src/domain/inbox-webhook-prepedido-asaas-staging.js');
 const child=spawn(process.execPath,['-e',childSource,arquivo,modo,m,TOKEN,body],{
  stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'test'}
 });
 let stdout='',stderr='';
 const esperado=modo==='pre-commit'?'READY_PRECOMMIT':'READY_COMMITTED';
 const saida=new Promise(resolve=>child.once('exit',(codigo,sinal)=>resolve({codigo,sinal})));
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{
   child.kill('SIGKILL');reject(new Error('CHECKPOINT_NAO_ATINGIDO'));
  },12000);
  child.stdout.on('data',chunk=>{
   stdout+=chunk.toString();
   if(stdout.includes(esperado)){
    clearTimeout(timer);
    child.kill('SIGKILL');
    resolve();
   }
  });
  child.stderr.on('data',x=>{stderr+=x.toString().slice(0,250);});
  child.on('error',e=>{clearTimeout(timer);reject(e);});
  child.on('exit',code=>{
   if(!stdout.includes(esperado)){
    clearTimeout(timer);
    reject(new Error('FILHO_MORREU_PREMATURO_'+code+
     '_'+stderr.replace(/[^A-Za-z0-9_]/g,'').slice(0,80)));
   }
  });
 });
 const final=await saida;
 if(final.sinal!=='SIGKILL')
  throw new Error('CHECKPOINT_SEM_SIGKILL');
}
test('SIGKILL antes do COMMIT desfaz evento; depois do COMMIT preserva um replay',async t=>{
 const pasta=mkdtempSync(path.join(tmpdir(),'loop-sigkill-'));
 const arquivo=path.join(pasta,'receptor.sqlite');
 const banco=new DatabaseSync(arquivo);
 t.after(()=>{banco.close();rmSync(pasta,{recursive:true,force:true});});
 banco.exec('PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;');
 banco.exec([
  'CREATE TABLE akitemm_prepedido_asaas_sandbox_staging(',
  'prepedido_id TEXT PRIMARY KEY,valor_centavos INTEGER,',
  'pagamento_id TEXT,external_ref TEXT);'
 ].join(' '));
 banco.prepare('INSERT INTO akitemm_prepedido_asaas_sandbox_staging VALUES(?,?,?,?)')
  .run(PEDIDO,25000,PAGAMENTO,'LOOPLAB-'+PEDIDO);
 const inbox=new InboxWebhookPrepedidoAsaasStaging({banco,token:TOKEN});
 const count=()=>banco.prepare([
  'SELECT COUNT(*) AS n FROM akitemm_prepedido_webhook_inbox_staging'
 ].join(' ')).get().n;
 await matarEmCheckpoint({arquivo,modo:'pre-commit',
  body:aviso('evt_SIGKILL_BeforeCommit2026')});
 assert.equal(count(),0,'crash antes de commit nao pode deixar evento fantasma');
 const resultado=inbox.registrar({cabecalhoToken:TOKEN,
  corpoBruto:Buffer.from(aviso('evt_SIGKILL_BeforeCommit2026'))});
 assert.equal(resultado.registrado,true);
 assert.equal(count(),1);
 await matarEmCheckpoint({arquivo,modo:'post-commit',
  body:aviso('evt_SIGKILL_AfterCommit2026')});
 assert.equal(count(),2,'crash depois de commit deve conservar o registro');
 const replay=inbox.registrar({cabecalhoToken:TOKEN,
  corpoBruto:Buffer.from(aviso('evt_SIGKILL_AfterCommit2026'))});
 assert.equal(replay.repetido,true);
 assert.equal(count(),2,'replay apos crash nao duplica');
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.equal(banco.prepare('PRAGMA foreign_key_check').all().length,0);
});
