'use strict';
// Diagnostico agregado de integridade no Escritorio: somente SQLite e laboratorio.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');
const ADMIN={Authorization:'Bearer administrador-local-ficticio-2026-123456789'};

async function resumo(m){
 const r=await fetch(m.base+'/api/admin/asaas-conciliacao-lab',{headers:ADMIN});
 assert.equal(r.status,200);
 assert.equal(r.headers.get('cache-control'),'no-store');
 return r.json();
}
test('Escritorio: monitor agregado bloqueia anonimos e nao escreve no SQLite',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const url=m.base+'/api/admin/asaas-conciliacao-lab';
 assert.equal((await fetch(url)).status,401);
 assert.equal((await fetch(url+'?contaId=qualquer',{headers:ADMIN})).status,400);
 const antes=m.banco.prepare('SELECT total_changes() n').get().n;
 const vazio=await resumo(m);
 assert.equal(vazio.cobrancas,0);
 assert.equal(vazio.revisaoManualIndicada,false);
 assert.equal(vazio.somenteLeitura,true);
 assert.equal(vazio.pagamentosReais,false);
 assert.equal(vazio.caixaBancarioConciliado,false);
 assert.equal(m.banco.prepare('SELECT total_changes() n').get().n,antes);
 assert.equal(JSON.stringify(vazio).includes('contaId'),false);
});

test('compra HTTP confirmada concilia titularidade e posicao; estorno exige revisao sem apagar',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const titular=m.contas.cadastrar({nome:'Cliente Resumo Contabil',
  email:'resumo-contabil@example.invalid',senha:'senha-ficticia-resumo'});
 const {cookie}=await m.http('/entrar',{body:{
  nome:titular.nome,senha:'senha-ficticia-resumo'}});
 const pedido=(await m.http('/loja/pedidos',{cookie,status:201,
  body:{itens:[{produtoId:'curso-lab-250',quantidade:1}]}})).data.pedido.pedidoId;
 let r=await resumo(m);
 assert.equal(r.cobrancas,1);
 assert.equal(r.pendentes,1);
 assert.equal(r.pedidosComPosicao,0);
 assert.equal(r.semTitularidade,0);
 m.confirmar(pedido);
 await m.integracao.conciliador.processar(pedido);
 r=await resumo(m);
 assert.equal(r.recebimentosInformados,1);
 assert.equal(r.pedidosComPosicao,1);
 assert.equal(r.semTitularidade,0);
 assert.equal(r.valoresDivergentes,0);
 assert.equal(r.titularesDivergentes,0);
 assert.equal(r.multiplosLivros,0);
 assert.equal(r.integracoesSemRecebimento,0);
 assert.equal(r.revisaoManualIndicada,false);
 m.banco.prepare("UPDATE lab_psp_http_fixture SET status='REFUNDED' WHERE pedido=?")
  .run('LOOPLAB-'+pedido);
 await assert.rejects(()=>m.integracao.conciliador.processar(pedido));
 r=await resumo(m);
 assert.equal(r.reversoesInformadas,1);
 assert.equal(r.reversoesComPosicaoPreservada,1);
 assert.equal(r.revisaoManualIndicada,true);
 assert.equal(r.pedidosComPosicao,1);
 assert.equal((await m.http('/minha-conta',{cookie})).data.posicoes.length,1);
 assert.equal(m.ponte._restaurar().giros,0);
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('monitor identifica recebimento orfao e valor divergente sem reconciliar automaticamente',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const c=m.contas.cadastrar({nome:'Cliente Valor Auditavel',
  email:'valor-auditavel@example.invalid',senha:'senha-ficticia-auditavel'});
 const {cookie}=await m.http('/entrar',{body:{
  nome:c.nome,senha:'senha-ficticia-auditavel'}});
 const pedido=(await m.http('/loja/pedidos',{cookie,status:201,
  body:{itens:[{produtoId:'curso-lab-250',quantidade:1}]}})).data.pedido.pedidoId;
 // O pedido e a titularidade ja foram fixados. Corrupcao de laboratorio na
 // cobranca nao pode gerar posicao antes da reconsulta do provedor.
 m.banco.prepare('UPDATE akitemm_sandbox_cobrancas SET valor_centavos=24900 WHERE pedido_id=?')
  .run(pedido);
 const extra='pedido-sem-titular-contabil';
 m.banco.prepare(`INSERT INTO akitemm_sandbox_cobrancas
  (pedido_id,origem,valor_centavos,cliente_asaas_id,pagamento_id,status,criado_em,atualizado_em)
  VALUES(?,'CARRINHO',25000,'cus_OrfaoFicticio','pay_OrfaoFicticio',
  'RECEBIMENTO_INFORMADO_SANDBOX','2026-11-01T01:00:00.000Z','2026-11-01T01:00:00.000Z')`)
  .run(extra);
 const antes=m.banco.prepare('SELECT total_changes() n').get().n;
 const r=await resumo(m);
 assert.equal(r.cobrancas,2);
 assert.equal(r.semTitularidade,1);
 assert.equal(r.valoresDivergentes,1);
 assert.equal(r.recebidosAguardandoPonte,1);
 assert.equal(r.pedidosComPosicao,0);
 assert.equal(r.revisaoManualIndicada,true);
 assert.equal(r.anomaliasContadasPorCriterio,2);
 assert.equal(m.banco.prepare('SELECT total_changes() n').get().n,antes);
 assert.equal(m.ponte._restaurar().giros,0);
 assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM admin_ponte_compras_demo').get().n,0);
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
});

test('Escritorio sinaliza status futuro desconhecido do PSP e nunca cria posicao sem reconsulta valida',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const cliente=m.contas.cadastrar({nome:'Cliente Estado PSP',
  email:'psp-estado-futuro@example.invalid',senha:'senha-ficticia-psp-estado'});
 const {cookie}=await m.http('/entrar',{body:{nome:cliente.nome,senha:'senha-ficticia-psp-estado'}});
 const pedido=(await m.http('/loja/pedidos',{cookie,status:201,body:{
  itens:[{produtoId:'curso-lab-250',quantidade:1}]}})).data.pedido.pedidoId;
 m.banco.prepare("UPDATE lab_psp_http_fixture SET status='NEW_FUTURE_STATUS' WHERE pedido=?")
  .run('LOOPLAB-'+pedido);
 const consulta=await m.integracao.cobrancas.conferir(pedido);
 assert.equal(consulta.status,'STATUS_DESCONHECIDO_SANDBOX');
 const antes=m.banco.prepare('SELECT total_changes() AS n').get().n;
 const alerta=await resumo(m);
 assert.equal(m.banco.prepare('SELECT total_changes() AS n').get().n,antes);
 assert.equal(alerta.cobrancas,1);
 assert.equal(alerta.estadosAsaasDesconhecidos,1);
 assert.equal(alerta.anomaliasContadasPorCriterio,1);
 assert.equal(alerta.revisaoManualIndicada,true);
 assert.equal(alerta.pedidosComPosicao,0);
 assert.equal(alerta.pagamentosReais,false);
 await assert.rejects(()=>m.integracao.conciliador.processar(pedido));
 assert.equal(m.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n,0);
 m.confirmar(pedido);
 await m.integracao.conciliador.processar(pedido);
 const recuperado=await resumo(m);
 assert.equal(recuperado.estadosAsaasDesconhecidos,0);
 assert.equal(recuperado.revisaoManualIndicada,false);
 assert.equal(recuperado.pedidosComPosicao,1);
 assert.equal((await m.http('/minha-conta',{cookie})).data.posicoes.length,1);
 assert.equal(m.ponte._restaurar().giros,0);
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('Monitor do escritorio torna visiveis estorno com posicao e status desconhecido',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const html=await(await fetch(m.base+'/admin/loop03')).text();
 const script=await(await fetch(m.base+'/admin/loop03.js')).text();
 for(const id of ['asaasStatusDesconhecidoAdmin','asaasReversoesComPosicaoAdmin'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(script,/estadosAsaasDesconhecidos/);
 assert.match(script,/reversoesComPosicaoPreservada/);
 assert.match(html,/Reversões com posição preservada/);
});
