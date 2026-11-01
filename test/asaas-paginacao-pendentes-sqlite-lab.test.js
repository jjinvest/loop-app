'use strict';
// Pagina apenas registros SQLite: nao solicitar lista global a cada timer.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');

function inserir(m,id,status='PENDENTE_SANDBOX'){
 m.banco.prepare(`INSERT INTO akitemm_sandbox_cobrancas
 (pedido_id,origem,valor_centavos,cliente_asaas_id,pagamento_id,status,criado_em,atualizado_em)
 VALUES(?,'CARRINHO',25000,'cus_PaginacaoFicticia',?,?,'2026-11-01T00:00:00.000Z','2026-11-01T00:00:00.000Z')`)
 .run(id,'pay_'+id.replace(/-/g,'_'),status);
}

test('descoberta SQLite percorre 53 cobrancas em paginas de 20 sem escrever no livro',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const ids=Array.from({length:53},(_,i)=>'pedido-page-'+String(i+1).padStart(3,'0'));
 for(const id of ids)inserir(m,id);
 inserir(m,'pedido-page-999','REVERSAO_INFORMADA_SANDBOX');
 const listar=m.integracao.automatico.listarPendentes;
 const antes=m.banco.prepare('SELECT total_changes() n').get().n;
 const a=listar(),b=listar(),c=listar();
 assert.equal(a.length,20);assert.equal(b.length,20);assert.equal(c.length,13);
 assert.deepEqual([...a,...b,...c],ids);
 assert.deepEqual(listar(),ids.slice(0,20));
 assert.equal(m.integracao.automatico.pendentes.size,0);
 assert.equal(m.banco.prepare('SELECT total_changes() n').get().n,antes);
});

test('pedido inserido atras do cursor sera reencontrado apos fechar volta',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 for(let i=1;i<=22;i++)inserir(m,'pedido-sweep-'+String(i).padStart(3,'0'));
 const listar=m.integracao.automatico.listarPendentes;
 assert.equal(listar().length,20);
 inserir(m,'pedido-sweep-000');
 const fim=listar();
 assert.deepEqual(fim,['pedido-sweep-021','pedido-sweep-022']);
 const volta=listar();
 assert.equal(volta[0],'pedido-sweep-000');
 assert.equal(volta.length,20);
 assert.equal(new Set([...fim,...volta]).size,22);
});
