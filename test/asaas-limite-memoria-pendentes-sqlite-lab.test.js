'use strict';
// Cap de memoria limita apenas IDs recuperaveis da fonte duravel SQLite.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ConciliacaoAutomaticaAsaasSandboxLab}=require('../src/domain/conciliacao-automatica-asaas-sandbox-lab');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');

test('fila descoberta pelo SQLite respeita teto sem perder acompanhamento explicito',async()=>{
 let pagina=0;
 const consultas=[];
 const ids=Array.from({length:64},(_,i)=>'pedido-cache-'+String(i).padStart(3,'0'));
 const agenda=new ConciliacaoAutomaticaAsaasSandboxLab({
  maxPorVerificacao:2,maxDescobertosEmMemoria:4,
  listarPendentes:()=>ids.slice((pagina++%8)*8,(pagina%8)*8),
  conciliador:{cobrancas:{consultar:()=>({status:'PENDENTE_SANDBOX'})},
   processar:async id=>{
    consultas.push(id);
    const e=new Error('PAGAMENTO_TESTE_AINDA_PENDENTE');e.codigo='COBRANCA_SANDBOX_NAO_CONFIRMADA';throw e;
   }}
 });
 agenda.acompanhar('pedido-explicito');
 for(let i=0;i<8;i++){
  await agenda.verificar();
  assert.ok(agenda.descobertosEmMemoria.size<=4);
  assert.ok(agenda.pendentes.size<=5);
  assert.equal(agenda.pendentes.has('pedido-explicito'),true);
  assert.equal(agenda.acompanhadosExplicitos.has('pedido-explicito'),true);
 }
 assert.ok(consultas.includes('pedido-explicito'));
 assert.equal(agenda.falhasAgendador,0);
 for(const maxDescobertosEmMemoria of [0,1,10001,1.3,'200']){
  assert.throws(()=>new ConciliacaoAutomaticaAsaasSandboxLab({
   conciliador:{processar:async()=>({})},maxPorVerificacao:2,maxDescobertosEmMemoria
  }),{name:'RangeError'});
 }
});

test('SQLite mantem 260 cobrancas apesar de memoria limitada a 200 entradas',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const stmt=m.banco.prepare(`INSERT INTO akitemm_sandbox_cobrancas
 (pedido_id,origem,valor_centavos,cliente_asaas_id,pagamento_id,status,criado_em,atualizado_em)
 VALUES(?,'CARRINHO',25000,'cus_CacheFicticio',?,
 'PENDENTE_SANDBOX','2026-11-01T00:00:00.000Z','2026-11-01T00:00:00.000Z')`);
 for(let i=0;i<260;i++){
  const id='pedido-mem-'+String(i).padStart(3,'0');
  stmt.run(id,'pay_Cache_'+String(i).padStart(3,'0'));
 }
 const agenda=m.integracao.automatico;
 agenda.aoErro=()=>{};
 for(let i=0;i<13;i++){
  await agenda.verificar();
  assert.ok(agenda.descobertosEmMemoria.size<=200);
  assert.ok(agenda.pendentes.size<=200);
 }
 assert.equal(agenda.descobertosEmMemoria.size,200);
 assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM akitemm_sandbox_cobrancas').get().n,260);
 assert.equal(agenda.descobertosEmMemoria.has('pedido-mem-259'),true);
 assert.equal(agenda.descobertosEmMemoria.has('pedido-mem-000'),false);
 assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM admin_ponte_compras_demo').get().n,0);
 // Cursor circular recupera do banco um registro que saiu do cache.
 await agenda.verificar();
 assert.equal(agenda.descobertosEmMemoria.has('pedido-mem-000'),true);
 assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM akitemm_sandbox_cobrancas').get().n,260);
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(m.ponte._restaurar().giros,0);
});
