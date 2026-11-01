'use strict';
// Rotacao de revisoes Sandbox: falhas permanentes de PSP nao ocultam estorno.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');

function registrarRecebimentoFicticio(m,id){
 m.banco.prepare(`INSERT INTO akitemm_sandbox_cobrancas
 (pedido_id,origem,valor_centavos,cliente_asaas_id,pagamento_id,status,criado_em,atualizado_em)
 VALUES(?,'CARRINHO',25000,'cus_LoteApenasTeste',?,
 'RECEBIMENTO_INFORMADO_SANDBOX','2020-01-01T00:00:00.000Z','2020-01-01T00:00:00.000Z')`)
 .run(id,'pay_'+id.replace(/-/g,'_'));
}

test('12 recebimentos com mesmo timestamp sao percorridos 5/5/2 e cursor reinicia sem escrita',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const ids=Array.from({length:12},(_,i)=>'a-recebimento-'+String(i+1).padStart(3,'0'));
 for(const id of ids)registrarRecebimentoFicticio(m,id);
 const antes=m.banco.prepare('SELECT total_changes() n').get().n;
 const listar=m.integracao.automatico.listarRecebimentos;
 assert.deepEqual(listar(),ids.slice(0,5));
 assert.deepEqual(listar(),ids.slice(5,10));
 assert.deepEqual(listar(),ids.slice(10));
 assert.deepEqual(listar(),ids.slice(0,5));
 assert.equal(m.banco.prepare('SELECT total_changes() n').get().n,antes);
});

test('HTTP/SQLite: sete revisoes com PSP indisponivel nao escondem estorno da oitava',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const titular=m.contas.cadastrar({nome:'Titular Reversao Rotativa',
  email:'reversao-rotativa@example.invalid',senha:'senha-laboratorio-rotacao'});
 const {cookie}=await m.http('/entrar',{body:{
  nome:titular.nome,senha:'senha-laboratorio-rotacao'}});
 const pedido=(await m.http('/loja/pedidos',{cookie,status:201,
  body:{itens:[{produtoId:'curso-lab-250',quantidade:1}]}})).data.pedido.pedidoId;
 m.confirmar(pedido);await m.integracao.conciliador.processar(pedido);
 for(let i=1;i<=7;i++)
  registrarRecebimentoFicticio(m,'a-revisao-'+String(i).padStart(3,'0'));
 m.banco.prepare("UPDATE akitemm_sandbox_cobrancas SET atualizado_em='2020-01-01T00:00:00.000Z' WHERE pedido_id=?").run(pedido);
 m.banco.prepare("UPDATE lab_psp_http_fixture SET status='REFUNDED' WHERE pedido=?")
  .run('LOOPLAB-'+pedido);
 const agenda=m.integracao.automatico;
 assert.equal(agenda.listarRecebimentos().length,5);
 // A primeira busca acima apenas avanca o cursor, sem rede nem escrita.
 await agenda.verificar();
 assert.equal(m.integracao.cobrancas.consultar(pedido).status,'REVERSAO_INFORMADA_SANDBOX');
 const posicoes=(await m.http('/minha-conta',{cookie})).data.posicoes;
 assert.equal(posicoes.length,1);
 assert.equal(posicoes[0].statusAdesao,'PENDENTE');
 assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM admin_ponte_compras_demo').get().n,1);
 assert.equal(m.ponte._restaurar().giros,0);
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
