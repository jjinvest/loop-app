'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');
const ADMIN={Authorization:'Bearer administrador-local-ficticio-2026-123456789'};
async function comprar(m,nome,email,produtoId,confirmar){
 const c=m.contas.cadastrar({nome,email,senha:'senha-ficticia-indicadores-2026'});
 const {cookie}=await m.http('/entrar',{body:{nome,senha:'senha-ficticia-indicadores-2026'}});
 const pedido=(await m.http('/loja/pedidos',{cookie,status:201,
  body:{itens:[{produtoId,quantidade:1}]}})).data.pedido.pedidoId;
 if(confirmar){m.confirmar(pedido);await m.integracao.conciliador.processar(pedido);}
 return {contaId:c.contaId,pedido};
}
test('Escritorio mede compradores com posicoes e somente loja sem contar pendentes',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const a=await comprar(m,'Cliente Posicao Painel','painel-loop@example.invalid',
  'curso-lab-250',true);
 const b=await comprar(m,'Cliente Apenas Loja','painel-loja@example.invalid',
  'curso-lab-100',true);
 await comprar(m,'Cliente Pendente Loja','painel-pendente@example.invalid',
  'curso-lab-100',false);
 const antes=m.banco.prepare('SELECT total_changes() n').get().n;
 const url=m.base+'/api/admin/escritorio-demo/clientes';
 assert.equal((await fetch(url)).status,401);
 const response=await fetch(url,{headers:ADMIN});
 assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'no-store');
 const d=await response.json();
 assert.equal(d.total,3);
 assert.equal(d.clientesComPosicoesCriadas,1);
 assert.equal(d.clientesSomenteLoja,1);
 assert.deepEqual(d.clientesPorTipoProduto,{PDF:2,FISICO:0});
 assert.equal(d.fonteIndicadores,'COMPRAS_E_VENDAS_CONFIRMADAS_SQLITE');
 assert.equal(d.semPagamentosReais,true);
 assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM admin_ponte_compras_demo').get().n,1);
 assert.equal(m.banco.prepare('SELECT conta_id AS id FROM admin_ponte_compras_demo').get().id,a.contaId);
 assert.equal(m.banco.prepare('SELECT conta_id AS id FROM admin_ponte_vendas_loja_sem_loop_demo').get().id,b.contaId);
 assert.equal(m.banco.prepare('SELECT total_changes() n').get().n,antes);
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('Tela do escritorio exibe indicadores por titular com fonte documentada',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const html=await(await fetch(m.base+'/admin/loop03')).text();
 const js=await(await fetch(m.base+'/admin/loop03.js')).text();
 assert.match(html,/Clientes com posições criadas por compra/);
 assert.match(html,/Clientes com vendas somente AKITEMM/);
 assert.match(js,/clientesComPosicoesCriadas/);
 assert.match(js,/clientesSomenteLoja/);
 assert.match(js,/COMPRAS_E_VENDAS_CONFIRMADAS_SQLITE/);
 assert.match(js,/Por categoria: ainda não conciliado/);
});

test('Escritorio conta produto FISICO de pedido confirmado, nao de catalogo reclassificado',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 m.repo.salvar({revisaoEsperada:0,produto:{
  id:'produto-fisico-lab',nome:'Produto fisico de laboratorio',
  descricao:'Produto demonstrativo sem venda real',tipo:'FISICO',
  estado:'PUBLICADO',precoCentavos:25000,entrega:'FORNECEDOR_INTEGRADO',
  fotos:[],videoApresentacaoUrl:null,detalhes:[]
 }});
 await comprar(m,'Cliente Produto Fisico','cliente-fisico@example.invalid',
  'produto-fisico-lab',true);
 const resposta=await fetch(m.base+'/api/admin/escritorio-demo/clientes',{headers:ADMIN});
 assert.equal(resposta.status,200);
 const d=await resposta.json();
 assert.deepEqual(d.clientesPorTipoProduto,{PDF:0,FISICO:1});
 assert.equal(d.clientesComPosicoesCriadas,1);
 assert.equal(d.clientesSomenteLoja,0);
 assert.equal(d.semPagamentosReais,true);
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
});
