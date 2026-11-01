'use strict';
// Descoberta de avisos confirmados pelo HTTP segue independente de pagamento.
// A fila SQLite deve sobreviver a interrupcoes sem criar posicao ficticia.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');
const TOKEN='TOKEN_FICTICIO_PAGINACAO_CALLBACK_2026_123456789';
const opcoes={webhookAsaasSandbox:{habilitado:true,token:TOKEN}};
function registrar(m,i){
 const id='evt_PaginaCallback_'+String(i).padStart(3,'0');
 const resultado=m.app.locals.caixaAvisosAsaasSandbox.registrar({
  cabecalhoToken:TOKEN,
  corpoBruto:Buffer.from(JSON.stringify({
   id,event:'PAYMENT_RECEIVED',
   payment:{id:'pay_PaginaTeste_'+String(i).padStart(3,'0'),
    billingType:'PIX',status:'RECEIVED',
    externalReference:'LOOPLAB-pedido-paginado-'+String(i).padStart(3,'0'),
    value:250}
  }))
 });
 assert.equal(resultado.registrado,true);
 return id;
}
const contar=(m,tabela)=>m.banco.prepare('SELECT COUNT(*) n FROM '+tabela).get().n;

test('inbox com 63 eventos ingressa na fila em paginas 50/13 sem posicao antecipada',async t=>{
 const m=await abrirLaboratorio(':memory:',opcoes);t.after(()=>m.fechar());
 for(let i=0;i<63;i++)registrar(m,i);
 const worker=m.integracao.callbacks;
 const base=contar(m,'akitemm_asaas_sandbox_avisos');
 assert.equal(base,63);
 assert.equal(contar(m,'akitemm_asaas_callback_fila_lab'),0);
 let agora=Date.now();
 worker.agoraMs=()=>agora;
 const primeiro=worker._reservar();
 assert.equal(contar(m,'akitemm_asaas_callback_fila_lab'),50);
 assert.equal(worker.resumo().avisosSemJob,13);
 assert.equal(worker.consultar(primeiro.eventoId).estado,'PROCESSANDO');
 const processados=await worker.processarLote({limite:100});
 assert.equal(processados.length,62);
 assert.equal(contar(m,'akitemm_asaas_callback_fila_lab'),63);
 assert.equal(worker.resumo().avisosSemJob,0);
 assert.equal(worker.resumo().pendentesProntos,0);
 assert.equal(contar(m,'admin_ponte_compras_demo'),0);
 assert.equal(m.ponte._restaurar().giros,0);
 assert.equal(contar(m,'akitemm_asaas_callback_historico_lab'),125);
 // Lease abandonado e recuperado sem novo aviso e sem criar posicao.
 agora+=worker.leaseMs+1;
 await worker.processarLote({limite:100});
 assert.equal(worker.consultar(primeiro.eventoId).tentativas,2);
 assert.equal(contar(m,'akitemm_asaas_callback_fila_lab'),63);
 assert.equal(contar(m,'admin_ponte_compras_demo'),0);
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('63 ACKs armazenados antes da queda reaparecem apos reabrir SQLite',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-asaas-batch-inbox-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const arquivo=path.join(dir,'callbacks.sqlite');
 let m=await abrirLaboratorio(arquivo,opcoes);
 t.after(()=>m.fechar());
 for(let i=0;i<63;i++)registrar(m,i);
 assert.equal(contar(m,'akitemm_asaas_callback_fila_lab'),0);
 await m.fechar();
 m=await abrirLaboratorio(arquivo,opcoes);
 const w=m.integracao.callbacks;
 const resultados=await w.processarLote({limite:100});
 assert.equal(resultados.length,63);
 assert.equal(contar(m,'akitemm_asaas_callback_fila_lab'),63);
 assert.equal(w.resumo().avisosSemJob,0);
 assert.equal(contar(m,'admin_ponte_compras_demo'),0);
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
