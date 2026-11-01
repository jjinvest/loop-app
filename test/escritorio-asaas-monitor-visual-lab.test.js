'use strict';
// Escritorio do administrador: UI deve exibir a MESMA fonte de
// convergencia de compras, posicoes e callback - nunca inferir saldo real.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');
const CHAVE='administrador-local-ficticio-2026-123456789';
test('Escritorio expõe quadro de conciliação e somente usa API autenticada',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const page=await fetch(m.base+'/admin/loop03');
 assert.equal(page.status,200);
 const html=await page.text();
 for(const id of ['monitorConvergenciaAsaasAdmin','asaasCobrancasAdmin',
  'asaasRecebimentosAdmin','asaasPedidosComPosicaoAdmin','asaasSomenteLojaAdmin',
  'asaasAguardandoPonteAdmin','asaasReversoesAdmin','asaasCallbacksRevisaoAdmin',
  'asaasAnomaliasAdmin','asaasIndeterminadasAdmin','asaasIdsReutilizadosAdmin',
  'asaasFilaCallbacksAdmin','asaasBancoRealAdmin','asaasRevisaoGeralAdmin',
  'asaasStatusConvergenciaAdmin'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(html.includes('href="#monitorConvergenciaAsaasAdmin"'));
 assert.match(html,/Conciliação bancária real/);
 assert.match(html,/Até dez posições ativas por titular podem estar na Fila A/);
 const script=await fetch(m.base+'/admin/loop03.js');
 assert.equal(script.status,200);
 const code=await script.text();
 assert.match(code,/async function carregarConvergenciaAsaas/);
 assert.match(code,/await carregarConvergenciaAsaas\(\)/);
 assert.match(code,/asaas-conciliacao-lab/);
 assert.match(code,/resposta.status===501/);
 assert.match(code,/d.pagamentosReais!==false/);
 assert.match(code,/d.caixaBancarioConciliado!==false/);
 assert.match(code,/\.textContent/);
 assert.equal((await fetch(m.base+'/api/admin/asaas-conciliacao-lab')).status,401);
 const allowed=await fetch(m.base+'/api/admin/asaas-conciliacao-lab',{
  headers:{Authorization:'Bearer '+CHAVE}});
 assert.equal(allowed.status,200);
 const overview=await allowed.json();
 assert.equal(overview.somenteLeitura,true);
 assert.equal(overview.pagamentosReais,false);
 assert.equal(overview.caixaBancarioConciliado,false);
 assert.equal(overview.revisaoManualIndicada,false);
 assert.equal(overview.cobrancas,0);
});
test('Escritorio sinaliza cobranca e posicao reais apenas do laboratorio',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const c=m.contas.cadastrar({nome:'Cliente Monitor Visual',
  email:'visual-monitor@example.invalid',senha:'senha-ficticia-monitor'});
 const login=await m.http('/entrar',{body:{nome:c.nome,senha:'senha-ficticia-monitor'}});
 const pedido=(await m.http('/loja/pedidos',{cookie:login.cookie,status:201,
  body:{itens:[{produtoId:'curso-lab-250',quantidade:1}]}})).data.pedido.pedidoId;
 m.confirmar(pedido);
 await m.integracao.conciliador.processar(pedido);
 const antes=m.banco.prepare('SELECT total_changes() n').get().n;
 const r=await fetch(m.base+'/api/admin/asaas-conciliacao-lab',{
  headers:{Authorization:'Bearer '+CHAVE}});
 const d=await r.json();
 assert.equal(r.status,200);
 assert.equal(d.cobrancas,1);
 assert.equal(d.recebimentosInformados,1);
 assert.equal(d.pedidosComPosicao,1);
 assert.equal(d.revisaoManualIndicada,false);
 assert.equal(d.saquesLiberados,0);
 assert.equal(m.banco.prepare('SELECT total_changes() n').get().n,antes);
 assert.equal((await m.http('/minha-conta',{cookie:login.cookie})).data.posicoes.length,1);
});
