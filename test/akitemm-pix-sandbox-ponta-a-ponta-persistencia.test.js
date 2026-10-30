'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {AsaasSandboxLojaV6}=require('../src/domain/asaas-sandbox-loja-v6');
const {CobrancasAkitemmAsaasSandboxSQLite}=require('../src/domain/cobrancas-akitemm-asaas-sandbox-v6');

test('compra AKITEMM R$250 -> Pix sandbox recebido -> registro persistente sem liberar posicao real',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec('CREATE TABLE admin_carrinho_loop_demo (pedido_id TEXT PRIMARY KEY,total_centavos INTEGER)');
 db.prepare('INSERT INTO admin_carrinho_loop_demo VALUES(?,?)').run('pedido-pix-ponta-a-ponta',25000);
 let status='PENDING',posts=0;
 const provedor=new AsaasSandboxLojaV6({apiKey:'CHAVE_SANDBOX_DE_TESTE_123456',
  fetchImpl:async(_url,opts)=>{
   if(opts.method==='POST'){
    posts++;
    return {ok:true,json:async()=>({
     id:'pay_SANDBOX_INTEGRACAO001',customer:'cus_TesteIntegracao001',
     billingType:'PIX',value:250,externalReference:'LOOPLAB-pedido-pix-ponta-a-ponta',
     status:'PENDING'
    })};
   }
   return {ok:true,json:async()=>({
    id:'pay_SANDBOX_INTEGRACAO001',customer:'cus_TesteIntegracao001',
    billingType:'PIX',value:250,externalReference:'LOOPLAB-pedido-pix-ponta-a-ponta',
    status
   })};
  }});
 const servico=new CobrancasAkitemmAsaasSandboxSQLite({banco:db,provedor});
 const params={pedidoId:'pedido-pix-ponta-a-ponta',origem:'CARRINHO',
  clienteAsaasId:'cus_TesteIntegracao001'};
 const criado=await servico.criar(params);
 assert.equal(criado.valorCentavos,25000);
 assert.equal(criado.status,'PENDENTE_SANDBOX');
 assert.equal((await servico.criar(params)).repetida,true);
 assert.equal(posts,1);
 status='RECEIVED';
 const confirmado=await servico.conferir(params.pedidoId);
 assert.equal(confirmado.status,'RECEBIMENTO_INFORMADO_SANDBOX');
 assert.equal(confirmado.creditoFilaCriado,0);
 assert.equal(confirmado.valorTransferidoParaLoopCentavos,0);
 assert.equal(confirmado.dinheiroRealRecebidoCentavos,0);
 assert.equal(servico.historico(params.pedidoId).conferencias.length,1);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'loop_v6_pre_%'").get().n,0);
 assert.equal((await servico.conferir(params.pedidoId)).status,'RECEBIMENTO_INFORMADO_SANDBOX');
 assert.equal(servico.historico(params.pedidoId).conferencias.length,2);
 assert.equal(posts,1);
});

test('pagamento Pix sandbox com referencia de outro pedido e bloqueado mesmo com R$250 recebido',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec('CREATE TABLE admin_carrinho_loop_demo (pedido_id TEXT PRIMARY KEY,total_centavos INTEGER)');
 db.prepare('INSERT INTO admin_carrinho_loop_demo VALUES(?,?)').run('pedido-pix-original',25000);
 let status='PENDING';
 const provedor=new AsaasSandboxLojaV6({apiKey:'CHAVE_SANDBOX_DE_TESTE_123456',
  fetchImpl:async(_url,opts)=>({ok:true,json:async()=>({
   id:'pay_SANDBOX_ORIGINAL001',billingType:'PIX',value:250,
   externalReference:opts.method==='POST'?'LOOPLAB-pedido-pix-original':
    'LOOPLAB-pedido-pix-de-outra-pessoa',status
  })})});
 const servico=new CobrancasAkitemmAsaasSandboxSQLite({banco:db,provedor});
 await servico.criar({pedidoId:'pedido-pix-original',origem:'CARRINHO',
  clienteAsaasId:'cus_TesteIntegracao001'});
 status='RECEIVED';
 await assert.rejects(()=>servico.conferir('pedido-pix-original'),
  {codigo:'DADOS_PAGAMENTO_SANDBOX_DIVERGENTES'});
 assert.equal(servico.consultar('pedido-pix-original').status,'PENDENTE_SANDBOX');
 assert.equal(servico.historico('pedido-pix-original').conferencias.length,0);
 assert.equal(servico.consultar('pedido-pix-original').creditoFilaCriado,0);
});

test('Pix recebido no sandbox nao permite segundo pedido reaproveitar mesmo pagamento',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec('CREATE TABLE admin_carrinho_loop_demo (pedido_id TEXT PRIMARY KEY,total_centavos INTEGER)');
 for(const id of ['pedido-pix-primeiro','pedido-pix-segundo'])
  db.prepare('INSERT INTO admin_carrinho_loop_demo VALUES(?,?)').run(id,25000);
 let pagamentoCriado=0;
 const provedor=new AsaasSandboxLojaV6({apiKey:'CHAVE_SANDBOX_DE_TESTE_123456',
  fetchImpl:async(_url,opts)=>({ok:true,json:async()=>{
   if(opts.method==='POST')pagamentoCriado++;
   return {id:'pay_SANDBOX_MESMO_PAGAMENTO001',billingType:'PIX',value:250,
    externalReference:'LOOPLAB-'+(pagamentoCriado===1?'pedido-pix-primeiro':'pedido-pix-segundo'),
    status:'PENDING'};
  }})});
 const servico=new CobrancasAkitemmAsaasSandboxSQLite({banco:db,provedor});
 await servico.criar({pedidoId:'pedido-pix-primeiro',origem:'CARRINHO',
  clienteAsaasId:'cus_TesteIntegracao001'});
 await assert.rejects(()=>servico.criar({pedidoId:'pedido-pix-segundo',origem:'CARRINHO',
  clienteAsaasId:'cus_TesteIntegracao001'}),e=>e?.code==='ERR_SQLITE_ERROR' && /UNIQUE constraint failed/.test(e.message));
 assert.equal(servico.consultar('pedido-pix-primeiro').pagamentoId,'pay_SANDBOX_MESMO_PAGAMENTO001');
 assert.equal(servico.consultar('pedido-pix-segundo').pagamentoId,null);
 assert.equal(servico.consultar('pedido-pix-segundo').creditoFilaCriado,0);
});

test('estorno sandbox apos Pix recebido fica bloqueado mesmo com resposta posterior atrasada',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec('CREATE TABLE admin_carrinho_loop_demo (pedido_id TEXT PRIMARY KEY,total_centavos INTEGER)');
 db.prepare('INSERT INTO admin_carrinho_loop_demo VALUES(?,?)').run('pedido-pix-estornado',25000);
 let status='PENDING';
 const provedor=new AsaasSandboxLojaV6({apiKey:'CHAVE_SANDBOX_DE_TESTE_123456',
  fetchImpl:async()=>({ok:true,json:async()=>({
   id:'pay_SANDBOX_ESTORNO001',billingType:'PIX',value:250,
   externalReference:'LOOPLAB-pedido-pix-estornado',status
  })})});
 const servico=new CobrancasAkitemmAsaasSandboxSQLite({banco:db,provedor});
 await servico.criar({pedidoId:'pedido-pix-estornado',origem:'CARRINHO',
  clienteAsaasId:'cus_TesteIntegracao001'});
 status='RECEIVED';
 assert.equal((await servico.conferir('pedido-pix-estornado')).status,'RECEBIMENTO_INFORMADO_SANDBOX');
 status='REFUNDED';
 assert.equal((await servico.conferir('pedido-pix-estornado')).status,'REVERSAO_INFORMADA_SANDBOX');
 status='RECEIVED';
 assert.equal((await servico.conferir('pedido-pix-estornado')).status,'REVERSAO_INFORMADA_SANDBOX');
 assert.deepEqual(servico.historico('pedido-pix-estornado').conferencias.map(x=>x.statusAsaas),
  ['RECEIVED','REFUNDED','RECEIVED']);
 assert.equal(servico.consultar('pedido-pix-estornado').creditoFilaCriado,0);
});

test('parecer de elegibilidade do LOOP: R$250 recebido apto somente a simulacao; R$190 nao',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec('CREATE TABLE admin_carrinho_loop_demo (pedido_id TEXT PRIMARY KEY,total_centavos INTEGER)');
 for(const [id,valor] of [['pedido-elegivel-250',25000],['pedido-inferior-190',19000]])
  db.prepare('INSERT INTO admin_carrinho_loop_demo VALUES(?,?)').run(id,valor);
 let pedido='',status='PENDING';
 const provedor=new AsaasSandboxLojaV6({apiKey:'CHAVE_SANDBOX_DE_TESTE_123456',
  fetchImpl:async(_url,opts)=>{
   if(opts.method==='POST')pedido=JSON.parse(opts.body).externalReference.slice(8);
   const valor=pedido==='pedido-elegivel-250'?250:190;
   return {ok:true,json:async()=>({
    id:pedido==='pedido-elegivel-250'?'pay_SANDBOX_ELEGIVEL250':'pay_SANDBOX_INFERIOR190',
    billingType:'PIX',value:valor,externalReference:'LOOPLAB-'+pedido,status
   })};
  }});
 const servico=new CobrancasAkitemmAsaasSandboxSQLite({banco:db,provedor});
 for(const id of ['pedido-elegivel-250','pedido-inferior-190']){
  await servico.criar({pedidoId:id,origem:'CARRINHO',clienteAsaasId:'cus_TesteIntegracao001'});
  status='RECEIVED';
  await servico.conferir(id);
  status='PENDING';
 }
 const elegivel=servico.auditarElegibilidadeLoop('pedido-elegivel-250');
 assert.equal(elegivel.elegivelParaSimulacao,true);
 assert.equal(elegivel.posicoesCriadas,0);
 assert.equal(elegivel.ativacaoAutomatica,false);
 const barato=servico.auditarElegibilidadeLoop('pedido-inferior-190');
 assert.equal(barato.elegivelParaSimulacao,false);
 assert(barato.motivos.includes('VALOR_INFERIOR_A_250_REAIS'));
 assert.equal(barato.posicoesCriadas,0);
});

test('parecer de elegibilidade nao promove pagamento pendente nem estornado',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec('CREATE TABLE admin_carrinho_loop_demo (pedido_id TEXT PRIMARY KEY,total_centavos INTEGER)');
 db.prepare('INSERT INTO admin_carrinho_loop_demo VALUES(?,?)').run('pedido-parecer-estorno',25000);
 let status='PENDING';
 const provedor=new AsaasSandboxLojaV6({apiKey:'CHAVE_SANDBOX_DE_TESTE_123456',
  fetchImpl:async()=>({ok:true,json:async()=>({
   id:'pay_SANDBOX_PARECER001',billingType:'PIX',value:250,
   externalReference:'LOOPLAB-pedido-parecer-estorno',status
  })})});
 const servico=new CobrancasAkitemmAsaasSandboxSQLite({banco:db,provedor});
 await servico.criar({pedidoId:'pedido-parecer-estorno',origem:'CARRINHO',
  clienteAsaasId:'cus_TesteIntegracao001'});
 assert.equal(servico.auditarElegibilidadeLoop('pedido-parecer-estorno').elegivelParaSimulacao,false);
 status='RECEIVED';await servico.conferir('pedido-parecer-estorno');
 assert.equal(servico.auditarElegibilidadeLoop('pedido-parecer-estorno').elegivelParaSimulacao,true);
 status='REFUNDED';await servico.conferir('pedido-parecer-estorno');
 const parecer=servico.auditarElegibilidadeLoop('pedido-parecer-estorno');
 assert.equal(parecer.elegivelParaSimulacao,false);
 assert(parecer.motivos.includes('PAGAMENTO_NAO_CONFIRMADO_OU_REVERSAO'));
 assert.equal(parecer.posicoesCriadas,0);
 status='RECEIVED';await servico.conferir('pedido-parecer-estorno');
 assert.equal(servico.auditarElegibilidadeLoop('pedido-parecer-estorno').elegivelParaSimulacao,false);
});

test('auditoria em lote consolida R$250 pago, R$190 pago, pendencia e estorno sem gerar posicoes',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec('CREATE TABLE admin_carrinho_loop_demo (pedido_id TEXT PRIMARY KEY,total_centavos INTEGER)');
 const casos=[
  ['pedido-lote-250',25000,'RECEIVED'],
  ['pedido-lote-190',19000,'RECEIVED'],
  ['pedido-lote-pendente',25000,'PENDING'],
  ['pedido-lote-estorno',25000,'REFUNDED']
 ];
 for(const [id,valor] of casos)
  db.prepare('INSERT INTO admin_carrinho_loop_demo VALUES(?,?)').run(id,valor);
 let idAtual='',statusAtual='PENDING';
 const provedor=new AsaasSandboxLojaV6({apiKey:'CHAVE_SANDBOX_DE_TESTE_123456',
  fetchImpl:async(_url,opts)=>{
   if(opts.method==='POST')idAtual=JSON.parse(opts.body).externalReference.slice(8);
   const valor=casos.find(x=>x[0]===idAtual)[1]/100;
   return {ok:true,json:async()=>({
    id:'pay_'+idAtual,billingType:'PIX',value:valor,
    externalReference:'LOOPLAB-'+idAtual,status:statusAtual
   })};
  }});
 const servico=new CobrancasAkitemmAsaasSandboxSQLite({banco:db,provedor});
 for(const [id,,status] of casos){
  await servico.criar({pedidoId:id,origem:'CARRINHO',clienteAsaasId:'cus_TesteIntegracao001'});
  statusAtual=status;
  await servico.conferir(id);
  statusAtual='PENDING';
 }
 const ids=casos.map(x=>x[0]);
 const rel=servico.auditarLoteLoop(ids);
 assert.equal(rel.pedidos,4);
 assert.equal(rel.aptosSomenteParaSimulacao,1);
 assert.equal(rel.bloqueados,3);
 assert.equal(rel.valorAptoCentavos,25000);
 assert.equal(rel.posicoesCriadas,0);
 assert.equal(rel.dinheiroRealMovimentadoCentavos,0);
 assert.equal(rel.itens.find(x=>x.pedidoId==='pedido-lote-estorno').elegivelParaSimulacao,false);
 assert.throws(()=>servico.auditarLoteLoop([...ids,ids[0]]),{codigo:'LOTE_AUDITORIA_INVALIDO'});
 assert.throws(()=>servico.auditarLoteLoop(Array(1001).fill(ids[0])),{codigo:'LOTE_AUDITORIA_INVALIDO'});
 assert.equal(servico.historico('pedido-lote-250').conferencias.length,1);
});
