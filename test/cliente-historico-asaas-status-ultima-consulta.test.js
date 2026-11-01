'use strict';
// Regressao HTTP real local: Meus Pedidos deve harmonizar PSP, posicao e
// alertas do Escritorio sem inventar credito, revogar direitos ou acessar outro titular.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');
const SENHA='senha-ficticia-para-testes-2026';
async function cliente(m,nome,email){
 m.contas.cadastrar({nome,email,senha:SENHA});
 return (await m.http('/entrar',{body:{nome,senha:SENHA}})).cookie;
}
async function criarPedido(m,cookie){
 return (await m.http('/loja/pedidos',{cookie,status:201,
  body:{itens:[{produtoId:'curso-lab-250',quantidade:1}]}})).data.pedido.pedidoId;
}
async function historico(m,cookie,pedidoId){
 const visao=(await m.http('/minha-conta',{cookie})).data;
 return {visao,pedido:visao.historicoLoja.pedidos.find(p=>p.pedidoId===pedidoId)};
}
function mudarPagamento(m,pedidoId,status){
 assert.equal(m.banco.prepare('UPDATE lab_psp_http_fixture SET status=? WHERE pedido=?')
  .run(status,'LOOPLAB-'+pedidoId).changes,1);
}
test('cliente e Escritorio convergem entre recebido, reconsulta pendente/manual e estorno',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const cookieA=await cliente(m,'Titular Status Sandbox','status-a@example.invalid');
 const cookieB=await cliente(m,'Outro Titular Sandbox','status-b@example.invalid');
 const id=await criarPedido(m,cookieA);
 const inicial=await historico(m,cookieA,id);
 assert.equal(inicial.pedido.estado,'AGUARDANDO_CONFIRMACAO');
 assert.equal(inicial.pedido.revisaoPagamentoSandbox,false);
 assert.equal(inicial.pedido.ultimaReconsultaStatusAsaas,null);
 assert.equal((await historico(m,cookieB,id)).pedido,undefined);
 m.confirmar(id);
 await m.integracao.cobrancas.conferir(id);
 const semPosicao=await historico(m,cookieA,id);
 assert.equal(semPosicao.pedido.estado,'SINCRONIZACAO_PENDENTE');
 assert.equal(semPosicao.pedido.revisaoPagamentoSandbox,false);
 assert.equal(semPosicao.pedido.ultimaReconsultaStatusAsaas,'RECEIVED');
 const integrado=await m.integracao.conciliador.processar(id);
 assert.equal(integrado.posicoesNoPedido,1);
 const azul=await historico(m,cookieA,id);
 assert.equal(azul.pedido.estado,'AGUARDANDO_ATIVACAO');
 assert.deepEqual(azul.pedido.posicaoIds,integrado.posicaoIds);
 const totalAntes=m.banco.prepare('SELECT COUNT(*) n FROM admin_ponte_compras_demo').get().n;
 for(const estadoInseguro of ['PENDING','RECEIVED_IN_CASH']){
  mudarPagamento(m,id,estadoInseguro);
  const conferido=await m.integracao.cobrancas.conferir(id);
  assert.equal(conferido.status,'RECEBIMENTO_INFORMADO_SANDBOX',
   'estado local conserva historico, mas ultima reconsulta deve vetar prova');
  const divergente=await historico(m,cookieA,id);
  assert.equal(divergente.pedido.estado,'SINCRONIZACAO_PENDENTE');
  assert.equal(divergente.pedido.revisaoPagamentoSandbox,true);
  assert.equal(divergente.pedido.ultimaReconsultaStatusAsaas,estadoInseguro);
  assert.deepEqual(divergente.pedido.posicaoIds,integrado.posicaoIds);
  await assert.rejects(m.integracao.conciliador.processar(id),
   {codigo:'ULTIMA_RECONSULTA_NAO_CONFIRMOU_RECEBIMENTO'});
  assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM admin_ponte_compras_demo').get().n,totalAntes);
  assert.equal((await historico(m,cookieB,id)).pedido,undefined);
 }
 mudarPagamento(m,id,'RECEIVED');await m.integracao.cobrancas.conferir(id);
 const recuperado=await historico(m,cookieA,id);
 assert.equal(recuperado.pedido.estado,'AGUARDANDO_ATIVACAO');
 assert.equal(recuperado.pedido.revisaoPagamentoSandbox,false);
 mudarPagamento(m,id,'REFUNDED');await m.integracao.cobrancas.conferir(id);
 const estornado=await historico(m,cookieA,id);
 assert.equal(estornado.pedido.estado,'ESTORNO_EM_CONFERENCIA');
 assert.equal(estornado.pedido.revisaoPagamentoSandbox,false);
 assert.deepEqual(estornado.pedido.posicaoIds,integrado.posicaoIds);
 assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM admin_ponte_compras_demo').get().n,totalAntes);
 assert.equal(m.ponte._restaurar().giros,0);
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('baixa manual direta sinaliza sincronizacao sem gerar posicao ficticia',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const cookie=await cliente(m,'Titular Caixa Manual','status-caixa@example.invalid');
 const id=await criarPedido(m,cookie);
 mudarPagamento(m,id,'RECEIVED_IN_CASH');
 const status=await m.integracao.cobrancas.conferir(id);
 assert.equal(status.status,'STATUS_DESCONHECIDO_SANDBOX');
 const r=await historico(m,cookie,id);
 assert.equal(r.pedido.estado,'SINCRONIZACAO_PENDENTE');
 assert.equal(r.pedido.revisaoPagamentoSandbox,true);
 assert.equal(r.pedido.ultimaReconsultaStatusAsaas,'RECEIVED_IN_CASH');
 assert.deepEqual(r.pedido.posicaoIds,[]);
 assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM admin_ponte_compras_demo').get().n,0);
});
