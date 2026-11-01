'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {abrirLaboratorio}=require('../scripts/lib/laboratorio-http-asaas');
const {ElegibilidadeProdutosLoopDemoSQLite}=require('../src/domain/elegibilidade-produtos-loop-demo-sqlite');
test('conciliacao automatica reencontra recebimento antigo e detecta reversao posterior sem apagar posicao',async t=>{
 let tempo=Date.now()+5000;
 const m=await abrirLaboratorio(':memory:',{agora:()=>new Date(tempo).toISOString()});
 t.after(()=>m.fechar());
 const senha='senha-reversao-automatica-2026';
 const a=m.contas.cadastrar({nome:'Cliente Reversao',email:'reversao@example.invalid',senha});
 const {cookie}=await m.http('/entrar',{body:{nome:a.nome,senha}});
 const {data}=await m.http('/loja/pedidos',{cookie,status:201,
  body:{itens:[{produtoId:'curso-lab-250',quantidade:1}]}});
 const id=data.pedido.pedidoId;m.confirmar(id);
 await m.integracao.automatico.verificar();
 assert.equal(m.integracao.automatico.pendentes.size,0);
 m.banco.prepare("UPDATE lab_psp_http_fixture SET status='REFUNDED' WHERE pedido=?").run('LOOPLAB-'+id);
 // Antes da janela, nenhuma nova consulta remota.
 await m.integracao.automatico.verificar();
 assert.equal(m.integracao.cobrancas.consultar(id).status,'RECEBIMENTO_INFORMADO_SANDBOX');
 tempo+=61000;
 await m.integracao.automatico.verificar();
 assert.equal(m.integracao.cobrancas.consultar(id).status,'REVERSAO_INFORMADA_SANDBOX');
 assert.equal(m.integracao.automatico.pendentes.size,0);
 const visao=(await m.http('/minha-conta',{cookie})).data;
 assert.equal(visao.posicoes.length,1);
 assert.equal(visao.historicoLoja.pedidos[0].estado,'ESTORNO_EM_CONFERENCIA');
 const consultas=m.integracao.cobrancas.historico(id).conferencias.length;
 tempo+=61000;await m.integracao.automatico.verificar();
 assert.equal(m.integracao.cobrancas.historico(id).conferencias.length,consultas);
});
test('HTTP e Asaas simulado respeitam snapshot: exclusao, misto, minimo e valor abaixo da referencia',async t=>{
 const m=await abrirLaboratorio(':memory:');t.after(()=>m.fechar());
 const regras=new ElegibilidadeProdutosLoopDemoSQLite({catalogo:m.repo});
 regras.alterar({produtoId:'curso-lab-500',elegivelLoop:false,revisaoEsperada:1});
 regras.alterarQuantidadeMinima({produtoId:'curso-lab-250',quantidadeMinimaLoop:2,revisaoEsperada:1});
 const senha='senha-ficticia-http-2026';
 const a=m.contas.cadastrar({nome:'Comprador Snapshot',email:'snapshot@example.invalid',senha});
 const {cookie}=await m.http('/entrar',{body:{nome:a.nome,senha}});
 const cenarios=[
  {itens:[{produtoId:'curso-lab-500',quantidade:1}],elegivel:0,posicoes:0},
  {itens:[{produtoId:'curso-lab-250',quantidade:1}],elegivel:0,posicoes:0},
  {itens:[{produtoId:'curso-lab-100',quantidade:1}],elegivel:10000,posicoes:0},
  {itens:[{produtoId:'curso-lab-500',quantidade:1},{produtoId:'curso-lab-100',quantidade:1}],elegivel:10000,posicoes:0},
  {itens:[{produtoId:'curso-lab-250',quantidade:2},{produtoId:'curso-lab-500',quantidade:1}],elegivel:50000,posicoes:1}
 ];
 let esperadas=0;
 for(const c of cenarios){
  const {data}=await m.http('/loja/pedidos',{cookie,body:{itens:c.itens},status:201});
  const id=data.pedido.pedidoId;
  assert.equal((await m.http('/minha-conta',{cookie})).data.posicoes.length,esperadas);
  m.confirmar(id);await m.integracao.automatico.verificar();
  const detalhe=(await m.http('/loja/pedidos/'+id,{cookie})).data.pedido;
  assert.equal(detalhe.situacaoPagamentoSandbox,'RECEBIMENTO_INFORMADO_SANDBOX');
  assert.equal(detalhe.situacaoPagamentoFicticio,'AGUARDANDO_FICTICIO');
  assert.equal(m.integracao.automatico.pendentes.size,0);
  assert.equal((await m.integracao.comprovantes.consultar(id)).valorElegivelLoopCentavos,c.elegivel);
  esperadas+=c.posicoes;
  assert.equal((await m.http('/minha-conta',{cookie})).data.posicoes.length,esperadas);
  await m.integracao.conciliador.processar(id);
 }
 // Alterar catalogo nao altera os subtotais de pedidos passados.
 regras.alterar({produtoId:'curso-lab-500',elegivelLoop:true,revisaoEsperada:2});
 await m.integracao.automatico.verificar();
 assert.equal((await m.http('/minha-conta',{cookie})).data.posicoes.length,1);
 assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM admin_ponte_vendas_loja_apos_reajuste_demo').get().n,3);
 assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM admin_ponte_vendas_loja_sem_loop_demo').get().n,1);
 assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM lab_psp_http_fixture').get().n,5);
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
 const id=m.banco.prepare('SELECT pedido_id id FROM admin_ponte_compras_demo').get().id;
 m.banco.prepare("UPDATE lab_psp_http_fixture SET status='REFUNDED' WHERE pedido=?").run('LOOPLAB-'+id);
 await assert.rejects(m.integracao.conciliador.processar(id));
 const historico=(await m.http('/minha-conta',{cookie})).data.historicoLoja;
 assert.equal(historico.pedidos.find(p=>p.pedidoId===id).estado,'ESTORNO_EM_CONFERENCIA');
 assert.equal(m.banco.prepare('SELECT COUNT(*) n FROM admin_ponte_compras_demo').get().n,1);
});
