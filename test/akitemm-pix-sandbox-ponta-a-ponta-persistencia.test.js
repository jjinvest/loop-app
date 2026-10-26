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
