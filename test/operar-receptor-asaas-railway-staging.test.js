'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,closeSync,openSync,rmSync}=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {executar}=require('../scripts/operar-receptor-asaas-railway-staging');
test('operacao Railway prepara uma unica reserva ficticia e vincula pagamento sem credito',async(t)=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'railway-staging-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'webhook.sqlite');closeSync(openSync(file,'wx',0o600));
 const env={NODE_ENV:'staging',RAILWAY_VOLUME_MOUNT_PATH:dir,
  LOOP_RAILWAY_STAGING_SQLITE:file,LOOP_RAILWAY_STAGING_AUTORIZADO:'SIM',
  LOOP_RAILWAY_WEBHOOK_TOKEN:'s'.repeat(64),
  LOOP_RAILWAY_OPERACAO_AUTORIZADA:'SIM',LOOP_RAILWAY_OPERACAO_ESCRITA:'SIM',
  LOOP_RAILWAY_OPERACAO_ACAO:'PREPARAR',
  ASAAS_SANDBOX_CLIENTE_TESTE_ID:'cus_000009780085'};
 const p=await executar({ambiente:env});
 assert.equal(p.feito,'PREPEDIDO_FICTICIO_PREPARADO');
 assert.equal(p.valorCentavos,25000);assert.equal(p.pagamentosReais,0);
 assert.equal((await executar({ambiente:env})).feito,'PREPEDIDO_EXISTENTE_PRESERVADO');
 assert.equal((await executar({ambiente:{...env,LOOP_RAILWAY_OPERACAO_ACAO:'INSPECIONAR'}})).pedidos,1);
 const a=await executar({ambiente:{...env,LOOP_RAILWAY_OPERACAO_ACAO:'MARCAR_ENVIO'}});
 assert.equal(a.estado,'CRIACAO_INDETERMINADA');
 assert.match((await executar({ambiente:{...env,LOOP_RAILWAY_OPERACAO_ACAO:'MARCAR_ENVIO'}})).feito,/NAO_REPETIR_POST/);
 const b=await executar({ambiente:{...env,LOOP_RAILWAY_OPERACAO_ACAO:'VINCULAR',
  LOOP_RAILWAY_PAGAMENTO_SANDBOX_ID:'pay_SANDBOX00001'}});
 assert.equal(b.estado,'PENDENTE_SANDBOX');
 assert.equal(b.posicoesReaisCriadas,0);
 const c=await executar({ambiente:{...env,LOOP_RAILWAY_OPERACAO_ACAO:'VINCULAR',
  LOOP_RAILWAY_PAGAMENTO_SANDBOX_ID:'pay_SANDBOX00001'}});
 assert.match(c.feito,/JA_VINCULADO/);assert.equal(c.pedidos,1);
});
test('operacao Railway bloqueia escrita nao autorizada, producao e pagamento divergente',async(t)=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'railway-block-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'webhook.sqlite');closeSync(openSync(file,'wx',0o600));
 const env={NODE_ENV:'staging',RAILWAY_VOLUME_MOUNT_PATH:dir,
  LOOP_RAILWAY_STAGING_SQLITE:file,LOOP_RAILWAY_STAGING_AUTORIZADO:'SIM',
  LOOP_RAILWAY_WEBHOOK_TOKEN:'z'.repeat(64),LOOP_RAILWAY_OPERACAO_AUTORIZADA:'SIM',
  LOOP_RAILWAY_OPERACAO_ACAO:'PREPARAR',
  ASAAS_SANDBOX_CLIENTE_TESTE_ID:'cus_000009780085'};
 await assert.rejects(()=>executar({ambiente:env}),/ESCRITA_BLOQUEADA/);
 await assert.rejects(()=>executar({ambiente:{...env,NODE_ENV:'production'}}),/NAO_AUTORIZADA/);
 await executar({ambiente:{...env,LOOP_RAILWAY_OPERACAO_ESCRITA:'SIM'}});
 await assert.rejects(()=>executar({ambiente:{...env,LOOP_RAILWAY_OPERACAO_ESCRITA:'SIM',
  LOOP_RAILWAY_OPERACAO_ACAO:'VINCULAR',LOOP_RAILWAY_PAGAMENTO_SANDBOX_ID:'pay_ABCDEF123'}}),
  /PAGAMENTO_VINCULO_DIVERGENTE/);
});
