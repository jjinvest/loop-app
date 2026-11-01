'use strict';
// Timeouts longos nao podem consumir 8 tentativas de um evento no mesmo lote.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');
const TOKEN='TOKEN_FICTICIO_UNICIDADE_TENTATIVAS_2026_123456';
const opcoes={webhookAsaasSandbox:{habilitado:true,token:TOKEN}};
function aviso(m,n){
 const id='evt_TentativaUnica_'+String(n).padStart(3,'0');
 m.app.locals.caixaAvisosAsaasSandbox.registrar({
  cabecalhoToken:TOKEN,
  corpoBruto:Buffer.from(JSON.stringify({id,event:'PAYMENT_RECEIVED',
   payment:{id:'pay_TentativaUnica_'+String(n).padStart(3,'0'),
    billingType:'PIX',status:'RECEIVED',
    externalReference:'LOOPLAB-pedido-tentativa-'+String(n).padStart(3,'0'),value:250}}))
 });
 return id;
}
test('relógio avança acima do backoff mas um evento recebe so uma tentativa por lote',async t=>{
 const m=await abrirLaboratorio(':memory:',opcoes);t.after(()=>m.fechar());
 const id=aviso(m,1),w=m.integracao.callbacks;
 let relogio=100000;
 w.agoraMs=()=>{relogio+=1500;return relogio;};
 w.maxTentativas=3;
 const resultados=await w.processarLote({limite:100});
 assert.equal(resultados.length,1);
 assert.equal(w.consultar(id).tentativas,1);
 assert.equal(w.consultar(id).estado,'PENDENTE');
 assert.equal(w.historico(id).length,2);
 assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM admin_ponte_compras_demo').get().n,0);
 await w.processarLote({limite:100});
 assert.equal(w.consultar(id).tentativas,2);
 assert.equal(w.consultar(id).estado,'PENDENTE');
 await w.processarLote({limite:100});
 assert.equal(w.consultar(id).tentativas,3);
 assert.equal(w.consultar(id).estado,'EXIGE_REVISAO');
 assert.equal(w.historico(id).length,6);
});

test('cinco eventos distintos nao repetem tentativa na mesma rodada longa',async t=>{
 const m=await abrirLaboratorio(':memory:',opcoes);t.after(()=>m.fechar());
 const ids=Array.from({length:5},(_,i)=>aviso(m,i+10));
 const w=m.integracao.callbacks;
 let relogio=500000;
 w.agoraMs=()=>{relogio+=2000;return relogio;};
 const resultado=await w.processarLote({limite:100});
 assert.equal(resultado.length,5);
 assert.equal(new Set(resultado.map(r=>r.eventoId)).size,5);
 for(const id of ids){
  assert.equal(w.consultar(id).tentativas,1);
  assert.equal(w.historico(id).length,2);
 }
 assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM admin_ponte_compras_demo').get().n,0);
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
