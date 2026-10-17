'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {once}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {VinculosFornecedoresSQLite}=require('../src/domain/vinculos-fornecedores-sqlite');
const {PlanejamentoVendasFisicasDemoSQLite}=require('../src/domain/planejamento-vendas-fisicas-demo-sqlite');
const {PagamentosPrePedidosFisicosDemoSQLite}=require('../src/domain/pagamentos-pre-pedidos-fisicos-demo-sqlite');
const {auditarPrePedidosFisicosDemo}=require('../src/domain/auditoria-pre-pedidos-fisicos-demo');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const TOKEN='auditoria-fisicos-demo-local-20261015-token-seguro';
const AUTH={Authorization:'Bearer '+TOKEN};

function bancoTeste(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loop-auditoria-fisico-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 return path.join(dir,'catalogo.sqlite');
}
function iniciar(caminho){
 const catalogo=new RepositorioCatalogoSQLite({caminho});
 const vinculos=new VinculosFornecedoresSQLite({repositorioCatalogo:catalogo});
 const planejamento=new PlanejamentoVendasFisicasDemoSQLite({repositorioCatalogo:catalogo,vinculosFornecedor:vinculos});
 const pagamentos=new PagamentosPrePedidosFisicosDemoSQLite({planejamento});
 return {catalogo,vinculos,planejamento,pagamentos};
}
function produto(m,{id='fisico-a',preco=35990,custo=8000}={}){
 m.catalogo.salvar({produto:{
  id,nome:'Produto somente ficticio',tipo:'FISICO',estado:'PUBLICADO',
  descricao:'Laboratorio',precoCentavos:preco,
  entrega:'FORNECEDOR_INTEGRADO',fotos:[],videoApresentacaoUrl:null,detalhes:[]
 },revisaoEsperada:0});
 m.vinculos.vincular({produtoId:id,fornecedorId:'fornecedor-demo',sku:'SKU_'+id,revisaoEsperada:0});
 m.planejamento.registrarCusto({produtoId:id,custoCentavos:custo,revisaoEsperada:0});
}
function pedido(m,id,produtoId='fisico-a'){
 return m.planejamento.criarPrePedido({
  pedidoId:id,produtoId,revisaoProduto:1,revisaoCustoTeste:1
 }).pedido;
}
function evento(m,p,tipo,id){
 return m.pagamentos.registrarEvento({
  pedidoId:p.pedidoId,pagamentoIntentoTesteId:p.pagamentoIntentoTesteId,
  tipo,eventoId:id
 });
}
function auditar(m){
 return auditarPrePedidosFisicosDemo({planejamento:m.planejamento,pagamentos:m.pagamentos});
}

test('auditoria vazia registra zero, nao inventa valor recebido nem libera nada',t=>{
 const m=iniciar(bancoTeste(t));t.after(()=>m.catalogo.fechar());
 const r=auditar(m);
 assert.equal(r.integridade,'CONFERIDO_NO_TESTE');
 assert.deepEqual(r.conferencias,[]);
 assert.deepEqual(r.resumoPorFornecedor,[]);
 assert.equal(r.totais.quantidadePrePedidos,0);
 assert.equal(r.totais.valorConfirmadoFicticioCentavos,0);
 assert.equal(r.confirmacaoPSPReal,false);
 assert.equal(r.conciliacaoBancariaReal,false);
 assert.equal(r.autorizacaoFornecedor,false);
 assert.equal(r.geracaoDePosicoes,false);
 assert.equal(r.movimentacaoCatraca,false);
 assert.equal(r.operacaoSomenteLeitura,true);
});

test('soma snapshots variados e separa aguardando, confirmado e estornado',t=>{
 const m=iniciar(bancoTeste(t));t.after(()=>m.catalogo.fechar());
 produto(m,{preco:35990,custo:8000});
 const a=pedido(m,'pre-auditoria-a');
 const b=pedido(m,'pre-auditoria-b');
 produto(m,{id:'fisico-b',preco:42000,custo:10000});
 const c=pedido(m,'pre-auditoria-c','fisico-b');
 evento(m,b,'CONFIRMAR_FICTICIO','aud-evt-um');
 evento(m,c,'CONFIRMAR_FICTICIO','aud-evt-dois');
 evento(m,c,'ESTORNAR_FICTICIO','aud-evt-tres');
 const antes=m.catalogo.banco.prepare(
  'SELECT COUNT(*) AS quantidade FROM admin_pre_pedidos_pagamentos_eventos_demo').get().quantidade;
 const r=auditar(m);
 assert.equal(r.integridade,'CONFERIDO_NO_TESTE');
 assert.deepEqual(
  [r.totais.aguardando,r.totais.confirmados,r.totais.estornados,r.totais.divergentes],
  [1,1,1,0]
 );
 assert.equal(r.totais.quantidadeEventosFicticios,3);
 assert.equal(r.totais.valorTotalPrePedidosCentavos,113980);
 assert.equal(r.totais.valorAguardandoCentavos,35990);
 assert.equal(r.totais.valorConfirmadoFicticioCentavos,35990);
 assert.equal(r.totais.valorEstornadoFicticioCentavos,42000);
 assert.deepEqual(r.conferencias.map(x=>x.estado).sort(),
  ['AGUARDANDO_FICTICIO','CONFIRMADO_FICTICIO','ESTORNADO_FICTICIO'].sort());
 assert.equal(r.conferencias.every(x=>x.fornecedorBloqueado&&!x.filaMovimentada),true);
 assert.equal(m.catalogo.banco.prepare(
  'SELECT COUNT(*) AS quantidade FROM admin_pre_pedidos_pagamentos_eventos_demo').get().quantidade,antes);
 assert.equal(a.precoCatalogoCentavos,35990);
});

test('detecta evento inconsistente inserido no laboratorio sem lançar nova ordem',t=>{
 const m=iniciar(bancoTeste(t));t.after(()=>m.catalogo.fechar());
 produto(m);
 const p=pedido(m,'pre-auditoria-divergente');
 m.catalogo.banco.prepare(`
   INSERT INTO admin_pre_pedidos_pagamentos_eventos_demo
    (evento_id,pedido_id,pagamento_intento_teste_id,tipo,valor_centavos,registrado_em)
   VALUES(?,?,?,?,?,?)
 `).run('aud-evt-fora',p.pedidoId,p.pagamentoIntentoTesteId,
  'ESTORNAR_FICTICIO',p.precoCatalogoCentavos-1,new Date().toISOString());
 const r=auditar(m);
 assert.equal(r.integridade,'DIVERGENCIAS_ENCONTRADAS');
 assert.equal(r.totais.divergentes,1);
 assert.equal(r.totais.confirmados,0);
 assert.equal(r.totais.valorDivergenteCentavos,p.precoCatalogoCentavos);
 assert.deepEqual(r.conferencias[0].problemas.sort(),
  ['VALOR_DIVERGENTE_DO_SNAPSHOT','PRIMEIRO_EVENTO_NAO_E_CONFIRMACAO'].sort());
 assert.equal(r.autorizacaoFornecedor,false);
 assert.equal(r.geracaoDePosicoes,false);
});

test('auditoria sobrevive a reinicio e snapshots antigos nao variam com preco atual',t=>{
 const caminho=bancoTeste(t);
 const m=iniciar(caminho);
 produto(m,{preco:39990,custo:7000});
 const p=pedido(m,'pre-auditoria-persistencia');
 evento(m,p,'CONFIRMAR_FICTICIO','aud-evt-persistente');
 m.catalogo.atualizar({id:p.produtoId,revisaoEsperada:1,alteracoes:{precoCentavos:49990}});
 m.catalogo.fechar();
 const reaberto=iniciar(caminho);
 try{
  const r=auditar(reaberto);
  assert.equal(r.totais.valorConfirmadoFicticioCentavos,39990);
  assert.equal(r.conferencias[0].precoSnapshotCentavos,39990);
  assert.equal(r.integridade,'CONFERIDO_NO_TESTE');
 }finally{reaberto.catalogo.fechar();}
});

test('agrupa por fornecedor do snapshot e nao permite repasse mesmo apos confirmacao',t=>{
 const m=iniciar(bancoTeste(t));t.after(()=>m.catalogo.fechar());
 produto(m,{preco:35990,custo:8000});
 const antigo=pedido(m,'pre-snapshot-fornecedor-a');
 evento(m,antigo,'CONFIRMAR_FICTICIO','aud-fornecedor-antigo');
 m.vinculos.vincular({produtoId:'fisico-a',fornecedorId:'novo-parceiro',
  sku:'SKU_NOVO',revisaoEsperada:1});
 m.catalogo.atualizar({id:'fisico-a',revisaoEsperada:1,
  alteracoes:{precoCentavos:36000}});
 m.planejamento.registrarCusto({produtoId:'fisico-a',custoCentavos:9000,
  revisaoEsperada:1});
 const novo=m.planejamento.criarPrePedido({
  pedidoId:'pre-snapshot-fornecedor-b',produtoId:'fisico-a',
  revisaoProduto:2,revisaoCustoTeste:2
 }).pedido;
 evento(m,novo,'CONFIRMAR_FICTICIO','aud-fornecedor-novo');
 const r=auditar(m);
 assert.equal(r.resumoPorFornecedor.length,2);
 const a=r.resumoPorFornecedor.find(x=>x.fornecedorId==='fornecedor-demo');
 const b=r.resumoPorFornecedor.find(x=>x.fornecedorId==='novo-parceiro');
 assert.equal(a.prePedidos,1);
 assert.equal(a.valorPrePedidosFicticiosCentavos,35990);
 assert.equal(a.custoTesteConfirmadoCentavos,8000);
 assert.equal(b.valorConfirmadoFicticioCentavos,36000);
 assert.equal(b.custoTesteConfirmadoCentavos,9000);
 assert.equal(a.fornecedorLiberado,false);
 assert.equal(b.fornecedorLiberado,false);
 assert.equal(a.repasseEfetuado,false);
 assert.equal(b.repasseEfetuado,false);
 assert.equal(r.repassesReaisAFornecedores,0);
 assert.equal(r.totais.valorConfirmadoFicticioCentavos,71990);
 assert.equal(r.geracaoDePosicoes,false);
});

test('endpoint local auditavel exige chave e fica ausente do app publico',async t=>{
 const m=iniciar(bancoTeste(t));
 t.after(()=>m.catalogo.fechar());
 produto(m);
 pedido(m,'pre-auditoria-http');
 const app=criarAppAdminLaboratorio({repositorio:m.catalogo,segredo:TOKEN});
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const rota='/api/admin/pagamentos-pre-pedidos-fisicos-demo/auditoria';
 assert.equal((await fetch(base+rota)).status,401);
 assert.equal((await fetch(base+rota,{headers:{...AUTH,Origin:'https://externo.invalid'}})).status,403);
 const resp=await fetch(base+rota,{headers:AUTH});
 assert.equal(resp.status,200);
 assert.equal(resp.headers.get('cache-control'),'no-store');
 const r=await resp.json();
 assert.equal(r.totais.quantidadePrePedidos,1);
 assert.equal(r.totais.aguardando,1);
 assert.equal(r.integridade,'CONFERIDO_NO_TESTE');
 assert.equal(r.operacaoSomenteLeitura,true);
 assert.equal(r.resumoPorFornecedor.length,1);
 const painel=await (await fetch(base+'/admin/financeiro-demo')).text();
 assert.match(painel,/id="resumoFornecedorAuditoriaFisicosDemo"/);
 const script=await (await fetch(base+'/admin/financeiro-demo.js')).text();
 assert.match(script,/fornecedor\.custoTesteConfirmadoCentavos/);
 assert.equal((await fetch(base+rota,{
  method:'POST',headers:{...AUTH,'Content-Type':'application/json'},body:'{}'
 })).status,404);
 const publico=require('../src/server');
 const site=publico.listen(0,'127.0.0.1');
 await once(site,'listening');
 t.after(()=>new Promise(resolve=>site.close(resolve)));
 assert.equal((await fetch('http://127.0.0.1:'+site.address().port+rota,{headers:AUTH})).status,404);
});
