'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');

// Fluxo real do servidor local + SQLite: falha de um pagamento nao bloqueia o
// outro, mesmo quando o callback de monitoramento apresenta defeito.
test('HTTP/SQLite: cobranca pendente com observador quebrado nao bloqueia outro titular pago',async t=>{
 const m=await abrirLaboratorio(':memory:');
 t.after(()=>m.fechar());
 const clientes=[
  {nome:'Teste Aguardando PSP',email:'aguardando-psp@example.invalid',senha:'senha-aguardando-2026'},
  {nome:'Teste Pagamento Valido',email:'pagamento-valido@example.invalid',senha:'senha-pagamento-2026'}
 ];
 const pedidos=[],cookies=[];
 for(const cliente of clientes){
  const conta=m.contas.cadastrar(cliente);
  const {cookie}=await m.http('/entrar',{body:{nome:conta.nome,senha:cliente.senha}});
  cookies.push(cookie);
  const r=await m.http('/loja/pedidos',{cookie,status:201,
   body:{itens:[{produtoId:'curso-lab-250',quantidade:1}]}});
  pedidos.push(r.data.pedido.pedidoId);
 }
 m.confirmar(pedidos[1]);
 const agenda=m.integracao.automatico;
 agenda.listarPendentes=null;
 agenda.aoErro=async()=>{throw Error('NUNCA_EXIBIR_CHAVE_FICTICIA_CLIENTE');};
 agenda.acompanhar(pedidos[0]);agenda.acompanhar(pedidos[1]);
 await agenda.verificar();
 assert.equal(agenda.falhasAgendador,1);
 assert.deepEqual([...agenda.pendentes],[pedidos[0]]);
 assert.equal((await m.http('/minha-conta',{cookie:cookies[0]})).data.posicoes.length,0);
 const clientePago=(await m.http('/minha-conta',{cookie:cookies[1]})).data.posicoes;
 assert.equal(clientePago.length,1);
 assert.equal(clientePago[0].statusAdesao,'PENDENTE');
 m.confirmar(pedidos[0]);
 await agenda.verificar();
 assert.equal(agenda.pendentes.size,0);
 assert.equal((await m.http('/minha-conta',{cookie:cookies[0]})).data.posicoes.length,1);
 await agenda.verificar();
 const ponte=m.banco.prepare('SELECT COUNT(*) n,COUNT(DISTINCT posicao_id) d FROM admin_ponte_compras_demo').get();
 assert.equal(ponte.n,2);assert.equal(ponte.d,2);
 assert.equal(m.ponte._restaurar().giros,0);
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(JSON.stringify(agenda.ultimaFalhaAgendador).includes('NUNCA_EXIBIR'),false);
});
