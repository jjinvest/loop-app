'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');
const ADMIN={Authorization:'Bearer administrador-local-ficticio-2026-123456789'};
async function compra(m,nome,email,confirmar){
 const c=m.contas.cadastrar({nome,email,senha:'senha-ficticia-ficha-123456'});
 const {cookie}=await m.http('/entrar',{body:{nome,senha:'senha-ficticia-ficha-123456'}});
 const pedido=(await m.http('/loja/pedidos',{cookie,status:201,
  body:{itens:[{produtoId:'curso-lab-250',quantidade:1}]}})).data.pedido.pedidoId;
 if(confirmar){m.confirmar(pedido);await m.integracao.conciliador.processar(pedido);}
 return {cliente:c,pedido,cookie};
}
test('Escritorio lista ficha ligada ao mesmo SQLite sem confundir titular e pedido',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const a=await compra(m,'Cliente Ficha Um','ficha-um@example.invalid',true);
 const b=await compra(m,'Cliente Ficha Dois','ficha-dois@example.invalid',false);
 const url=id=>m.base+'/api/admin/escritorio-demo/clientes/'+id+'/operacao?limite=20&offset=0';
 assert.equal((await fetch(url(a.cliente.contaId))).status,401);
 const before=m.banco.prepare('SELECT total_changes() n').get().n;
 const ra=await fetch(url(a.cliente.contaId),{headers:ADMIN});
 const rb=await fetch(url(b.cliente.contaId),{headers:ADMIN});
 assert.equal(ra.status,200);assert.equal(rb.status,200);
 const da=await ra.json(),db=await rb.json();
 assert.equal(da.modo,'OPERACAO_CLIENTE_SQLITE_LAB');
 assert.equal(da.somenteLeitura,true);
 assert.equal(da.previsoesNaoLiquidadas,true);
 assert.equal(da.disponivelParaSaqueRealCentavos,0);
 assert.equal(da.cliente.id,a.cliente.contaId);
 assert.equal(da.pedidos.total,1);
 assert.equal(da.pedidos.itens[0].pedidoId,a.pedido);
 assert.equal(da.pedidos.itens[0].posicoes.length,1);
 assert.equal(da.pedidos.itens[0].pagamentoSandbox.status,'RECEBIMENTO_INFORMADO_SANDBOX');
 assert.equal(db.cliente.id,b.cliente.contaId);
 assert.equal(db.pedidos.itens[0].pedidoId,b.pedido);
 assert.deepEqual(db.pedidos.itens[0].posicoes,[]);
 assert.equal(JSON.stringify(da).includes(b.pedido),false);
 assert.equal(JSON.stringify(db).includes(a.pedido),false);
 assert.equal(m.banco.prepare('SELECT total_changes() n').get().n,before);
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('HTML e JS do Escritorio conectam ficha por titular sem redesenho',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const html=await(await fetch(m.base+'/admin/loop03')).text();
 const js=await(await fetch(m.base+'/admin/loop03.js')).text();
 assert.match(html,/id="detalheClienteAdmin"/);
 assert.match(html,/Ficha por cliente com pedidos, posições, ciclos do centro/);
 assert.match(js,/async function fichaCliente\(c,offset=0\)/);
 assert.match(js,/escritorio-demo\/clientes\//);
 assert.match(js,/\/operacao\?limite=20&offset=/);
 assert.match(js,/previsoesNaoLiquidadas!==true/);
 assert.match(js,/disponivelParaSaqueRealCentavos!==0/);
 assert.match(js,/versaoFichaCliente\+\+/);
 assert.match(js,/d\.cliente\?\.id!==c\.id/);
 assert.match(js,/eventoQueFinanciouCiclo/);
 assert.match(js,/não é a contemplação deste pedido/);
 assert.equal(js.includes('innerHTML'),false);
});
