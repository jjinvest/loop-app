'use strict';
// Gate Marco Zero: callbacks em fila, sem job, revisão e lease expirado.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');
const {consultarMarcoZeroLab}=
 require('../src/domain/marco-zero-gate-sqlite-lab');
const TOKEN='TOKEN_MARCO_ZERO_SANDBOX_CALLBACK_LAB_2026_123456';
const ENDPOINT='/api/admin/escritorio-demo/marco-zero';
const AUTH={Authorization:'Bearer administrador-local-ficticio-2026-123456789'};

test('gate separa fonte de callback ausente de fila realmente vazia',()=>{
 const banco=new DatabaseSync(':memory:');
 try{
  const antes=banco.prepare('SELECT total_changes() n').get().n;
  const d=consultarMarcoZeroLab({banco});
  assert.equal(d.tecnicos.find(x=>x.id==='CALLBACKS_SANDBOX').estado,'FONTE_AUSENTE');
  assert.equal(d.resumo.alertasCallbacks,null);
  assert.equal(d.resumo.callbacksSemJob,null);
  assert.equal(d.marcoZeroLiberado,false);
  assert.equal(banco.prepare('SELECT total_changes() n').get().n,antes);
 }finally{banco.close();}
});

test('gate identifica callback sem job, revisao e lease vencido; GET nao escreve ou libera',async t=>{
 const m=await abrirLaboratorio(':memory:',{
  webhookAsaasSandbox:{habilitado:true,token:TOKEN}});
 t.after(()=>m.fechar());
 const b=m.banco,id='evt_GateMarcoZeroCallback2026';
 const url=m.base+ENDPOINT;
 async function consultar(){
  const antes=b.prepare('SELECT total_changes() AS n').get().n;
  const resposta=await fetch(url,{headers:AUTH});
  assert.equal(resposta.status,200);
  assert.equal(resposta.headers.get('cache-control'),'no-store');
  const dados=await resposta.json();
  assert.equal(b.prepare('SELECT total_changes() AS n').get().n,antes);
  assert.equal(dados.marcoZeroLiberado,false);
  assert.equal(dados.aptoParaPagamentosReais,false);
  assert.equal(dados.externos.length,6);
  assert.equal(JSON.stringify(dados).includes(id),false);
  return dados;
 }
 const vazio=await consultar();
 assert.equal(vazio.tecnicos.find(x=>x.id==='CALLBACKS_SANDBOX').estado,'SEM_OPERACOES');
 assert.equal(vazio.resumo.alertasCallbacks,0);
 // Aviso já persistido no inbox, mas ainda sem reserva do worker.
 b.prepare(`INSERT INTO akitemm_asaas_sandbox_avisos
  (evento_id,tipo,pagamento_id,pedido_referencia,status_informado,
   valor_informado_centavos,assinatura_semantica,recebido_em)
  VALUES (?,?,?,?,?,?,?,?)`).run(id,'PAYMENT_RECEIVED','pay_callback_gate',
   'LOOPLAB-pedido-gate','RECEIVED',25000,'hash-fixture-gate',
   '2026-11-01T12:00:00.000Z');
 const semJob=await consultar();
 assert.equal(semJob.tecnicos.find(x=>x.id==='CALLBACKS_SANDBOX').estado,'FILA_PENDENTE');
 assert.equal(semJob.resumo.callbacksSemJob,1);
 assert.equal(semJob.resumo.alertasCallbacks,0);
 // Worker esgotado: painel precisa mostrar alerta, sem transformar em crédito.
 b.prepare(`INSERT INTO akitemm_asaas_callback_fila_lab
  (evento_id,estado,tentativas,proxima_em,codigo)
  VALUES (?,'EXIGE_REVISAO',1,0,'TENTATIVAS_ESGOTADAS')`).run(id);
 const revisao=await consultar();
 assert.equal(revisao.tecnicos.find(x=>x.id==='CALLBACKS_SANDBOX').estado,'ALERTA');
 assert.equal(revisao.resumo.callbacksExigemRevisao,1);
 assert.equal(revisao.resumo.alertasCallbacks,1);
 assert.equal(revisao.resumo.alertasLocaisPorCriterio,1);
 b.prepare(`UPDATE akitemm_asaas_callback_fila_lab
  SET estado='PROCESSANDO',lease_token='lease-ficticio',lease_ate=?
  WHERE evento_id=?`).run(Date.now()-5000,id);
 const vencido=await consultar();
 assert.equal(vencido.resumo.callbacksLeasesExpirados,1);
 assert.equal(vencido.resumo.alertasCallbacks,1);
 assert.equal(vencido.tecnicos.find(x=>x.id==='CALLBACKS_SANDBOX').estado,'ALERTA');
 b.prepare(`UPDATE akitemm_asaas_callback_fila_lab SET
  estado='CONCLUIDO',lease_token=NULL,lease_ate=NULL WHERE evento_id=?`).run(id);
 const recuperado=await consultar();
 assert.equal(recuperado.resumo.alertasCallbacks,0);
 assert.equal(recuperado.resumo.callbacksSemJob,0);
 assert.equal(recuperado.tecnicos.find(x=>x.id==='CALLBACKS_SANDBOX').estado,'SEM_ALERTAS_LOCAIS');
 assert.equal(b.prepare('SELECT COUNT(*) n FROM admin_ponte_compras_demo').get().n,0);
 assert.equal(m.ponte._restaurar().giros,0);
 assert.deepEqual(b.prepare('PRAGMA foreign_key_check').all(),[]);
});
