'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const {COFRES}=require('../src/domain/financeiro-admin-demo');
const SECRET='pedido-pagamento-pontes-admin-teste-local-123456789012';
const HEADERS={Authorization:'Bearer '+SECRET};
function pasta(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-ponte-pedido-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  return path.join(dir,'catalogo.sqlite');
}
async function setup(t,arquivo){
  const catalogo=new RepositorioCatalogoSQLite({caminho:arquivo});
  t.after(()=>catalogo.fechar());
  const app=criarAppAdminLaboratorio({repositorio:catalogo,segredo:SECRET});
  const servidor=app.listen(0,'127.0.0.1');
  await once(servidor,'listening');
  t.after(()=>new Promise((r,j)=>servidor.close(e=>e?j(e):r())));
  return {url:'http://127.0.0.1:'+servidor.address().port,catalogo,logistica:app.locals.pedidosLogisticaDemo};
}
async function get(base,route,headers=HEADERS){
  return fetch(base+'/api/admin/'+route,{headers});
}
async function post(base,route,body){
  return fetch(base+'/api/admin/'+route,{
    method:'POST',headers:{...HEADERS,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
}
async function consultar(base){
  const r=await get(base,'pedidos-pagamentos-demo');
  assert.equal(r.status,200);
  return r.json();
}
const pedido=(lista,id)=>lista.pedidos.find(p=>p.pedidoId===id);

test('ponte inicia somente com pedidos e pagamentos ficticios de ID imutavel',async t=>{
  const {url,catalogo}=await setup(t,pasta(t));
  const lista=await consultar(url);
  assert.equal(lista.modo,'PONTE_PEDIDOS_PAGAMENTOS_APENAS_DEMONSTRATIVA');
  assert.equal(lista.pedidos.length,2);
  assert.equal(lista.integracaoRealPSP,false);
  assert.equal(lista.pedidosReais,false);
  assert.equal(lista.nenhumaAcaoAutomatica,true);
  assert.equal(lista.logisticaEmMemoriaNaoPersistente,true);
  const a=pedido(lista,'pedido-demo-001');
  const b=pedido(lista,'pedido-demo-002');
  assert.equal(a.pagamentoId,'pag-split-01');
  assert.equal(b.pagamentoId,'pag-reserva-02');
  assert.equal(a.statusLogisticoSimulado,'AGUARDANDO_CONFIRMACAO');
  assert.equal(a.statusPSPSimulado,'AGUARDANDO_FICTICIO');
  assert.equal(a.integridade,'AMBOS_AGUARDANDO_FICTICIOS');
  assert.equal(a.precoBrutoCentavos,60000);
  assert.equal(a.fornecedorCentavos,30000);
  assert.equal(a.parcelaLoopCentavos,10000);
  assert.equal(a.sobraBrutaCentavos,20000);
  assert.equal(a.destinoCofre,COFRES.CENTRO);
  assert.equal(b.destinoCofre,COFRES.ESQUERDA);
  assert.equal(a.catracaMovimentada,false);
  assert.equal(a.posicaoCriada,false);
  assert.equal(catalogo.listar().length,0);
  const hist=await (await get(url,'pedidos-pagamentos-demo/pedido-demo-001/historico')).json();
  assert.equal(hist.eventosLogistica.length,1);
  assert.equal(hist.eventosFinanceiros.length,0);
});

test('confirmacao financeira e logistica sao independentes; divergencias sao avisadas',async t=>{
  const {url}=await setup(t,pasta(t));
  const confirmado=await post(url,'recebimentos-psp-demo/pag-split-01/eventos',{
    eventoId:'evt-ponte-fin-01',tipo:'CONFIRMAR_FICTICIO'
  });
  assert.equal(confirmado.status,200);
  let lista=await consultar(url);
  assert.equal(pedido(lista,'pedido-demo-001').integridade,'PAGAMENTO_FICTICIO_CONFIRMA_LOGISTICA_PENDENTE');
  const logística=await get(url,'pedidos-demo');
  const p=(await logística.json()).pedidos.find(x=>x.pedidoId==='pedido-demo-001');
  assert.equal(p.status,'AGUARDANDO_CONFIRMACAO');
  // Somente o painel de logistica pode simular a propria transicao.
  const evento=await post(url,'pedidos-demo/pedido-demo-001/eventos',{
    tipo:'CONFIRMAR_PAGAMENTO_SIMULADO',revisaoEsperada:p.revisao
  });
  assert.equal(evento.status,200);
  lista=await consultar(url);
  assert.equal(pedido(lista,'pedido-demo-001').integridade,'ESTADOS_FICTICIOS_COMPATIVEIS');
  assert.equal(pedido(lista,'pedido-demo-001').statusLogisticoSimulado,'CONFIRMADO_SIMULADO');
  const estorno=await post(url,'recebimentos-psp-demo/pag-split-01/eventos',{
    eventoId:'evt-ponte-est-01',tipo:'ESTORNAR_FICTICIO'
  });
  assert.equal(estorno.status,200);
  lista=await consultar(url);
  assert.equal(pedido(lista,'pedido-demo-001').integridade,'ALERTA_ESTORNO_REVISAR_LOGISTICA');
  assert.equal(pedido(lista,'pedido-demo-001').statusLogisticoSimulado,'CONFIRMADO_SIMULADO');
  const hist=await (await get(url,'pedidos-pagamentos-demo/pedido-demo-001/historico')).json();
  assert.equal(hist.eventosFinanceiros.length,2);
  assert.equal(hist.eventosLogistica.length,2);
  const livro=await (await get(url,'livro-financeiro-demo')).json();
  assert.equal(livro.lancamentosRegistrados,4);
  const a=await (await get(url,'recebimentos-psp-demo')).json();
  assert.equal(a.pagamentos.find(x=>x.pagamentoId==='pag-split-01').situacao,'ESTORNADO_FICTICIO');
});

test('alerta quando logistica e confirmada manualmente sem PSP correspondente',async t=>{
  const {url}=await setup(t,pasta(t));
  assert.equal((await post(url,'pedidos-demo/pedido-demo-002/eventos',{
    tipo:'CONFIRMAR_PAGAMENTO_SIMULADO',revisaoEsperada:1
  })).status,200);
  const lista=await consultar(url);
  assert.equal(pedido(lista,'pedido-demo-002').integridade,'ALERTA_LOGISTICA_SEM_CONFIRMACAO_PSP');
  const l=await (await get(url,'livro-financeiro-demo')).json();
  assert.equal(l.lancamentosRegistrados,0);
  assert.equal(pedido(lista,'pedido-demo-002').posicaoCriada,false);
});

test('vinculos persistem no financeiro e nao podem ser trocados ou apagados',async t=>{
  const arquivo=pasta(t);
  const um=await setup(t,arquivo);
  assert.equal((await post(um.url,'recebimentos-psp-demo/pag-reserva-02/eventos',{
    eventoId:'evt-persistente-ponte',tipo:'CONFIRMAR_FICTICIO'
  })).status,200);
  const dois=await setup(t,arquivo);
  const lista=await consultar(dois.url);
  assert.equal(pedido(lista,'pedido-demo-002').pagamentoId,'pag-reserva-02');
  assert.equal(pedido(lista,'pedido-demo-002').integridade,'PAGAMENTO_FICTICIO_CONFIRMA_LOGISTICA_PENDENTE');
  assert.equal((await (await get(dois.url,'livro-financeiro-demo')).json()).lancamentosRegistrados,3);
  assert.throws(()=>dois.catalogo.banco.exec('DELETE FROM admin_pedidos_pagamentos_demo'),/imutavel/);
  assert.throws(()=>dois.catalogo.banco.exec("UPDATE admin_pedidos_pagamentos_demo SET pagamento_id='pag-split-01'"),/imutavel/);
  assert.equal((await consultar(dois.url)).pedidos.length,2);
  assert.equal(dois.catalogo.listar().length,0);
});

test('APIs da ponte sao apenas leitura, secretas e ausentes do servidor publico',async t=>{
  const {url}=await setup(t,pasta(t));
  assert.equal((await get(url,'pedidos-pagamentos-demo',{})).status,401);
  assert.equal((await get(url,'pedidos-pagamentos-demo',{...HEADERS,Origin:'https://outro.invalid'})).status,403);
  assert.equal((await get(url,'pedidos-pagamentos-demo/pedido-desconhecido/historico')).status,404);
  assert.equal((await post(url,'pedidos-pagamentos-demo',{
    pedidoId:'pedido-demo-001',pagamentoId:'pag-split-02'
  })).status,404);
  assert.equal((await post(url,'pedidos-pagamentos-demo/pedido-demo-001/historico',{estado:'CONFIRMADO'})).status,404);
  const r=await get(url,'pedidos-pagamentos-demo');
  assert.equal(r.headers.get('cache-control'),'no-store');
  const html=await (await fetch(url+'/admin/financeiro-demo')).text();
  assert.match(html,/id="listaPontePedidoPagamentoDemo"/);
  assert.match(html,/NÃO cria posição/);
  const js=await (await fetch(url+'/admin/financeiro-demo.js')).text();
  assert.match(js,/carregarPontePedidoPagamento/);
  assert.doesNotMatch(js,/innerHTML|localStorage|sessionStorage/);
  const publicApp=require('../src/server');
  const serv=publicApp.listen(0,'127.0.0.1');
  await once(serv,'listening');
  t.after(()=>new Promise(r=>serv.close(r)));
  const publico='http://127.0.0.1:'+serv.address().port;
  assert.equal((await fetch(publico+'/api/admin/pedidos-pagamentos-demo')).status,404);
  assert.equal((await fetch(publico+'/admin/financeiro-demo')).status,404);
});
