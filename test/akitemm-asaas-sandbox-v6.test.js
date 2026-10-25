'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {AsaasSandboxLojaV6,ASAAS_SANDBOX_BASE}=require('../src/domain/asaas-sandbox-loja-v6');
const {CobrancasAkitemmAsaasSandboxSQLite}=require('../src/domain/cobrancas-akitemm-asaas-sandbox-v6');
function preparar(){
 const db=new DatabaseSync(':memory:');
 db.exec([
  'CREATE TABLE admin_pdf_demo_pedidos (pedido_id TEXT PRIMARY KEY,preco_centavos INTEGER);',
  'CREATE TABLE admin_carrinho_loop_demo (pedido_id TEXT PRIMARY KEY,total_centavos INTEGER);'
 ].join('\n'));
 db.prepare('INSERT INTO admin_pdf_demo_pedidos VALUES(?,?)').run('pdf-livro-teste',3990);
 db.prepare('INSERT INTO admin_carrinho_loop_demo VALUES(?,?)').run('carrinho-livro-teste',25000);
 return db;
}
test('AKITEMM sandbox: so endpoint fixo, preco real do pedido imutavel e uma cobranca por compra',async t=>{
 const db=preparar();t.after(()=>db.close());
 const chamadas=[];
 let estado='PENDING';
 const provedor=new AsaasSandboxLojaV6({
  apiKey:'TESTE_SANDBOX_CHAVE_FICTICIA_123456',
  fetchImpl:async(url,opts)=>{
   chamadas.push({url,opts});
   if(opts.method==='POST')return {
    ok:true,json:async()=>({
     id:'pay_SANDBOX00001',billingType:'PIX',value:39.9,
     externalReference:'LOOPLAB-pdf-livro-teste',status:'PENDING'
    })};
   return {ok:true,json:async()=>({
    id:'pay_SANDBOX00001',billingType:'PIX',value:39.9,
    externalReference:'LOOPLAB-pdf-livro-teste',status:estado
   })};
  }
 });
 const servico=new CobrancasAkitemmAsaasSandboxSQLite({banco:db,provedor,
  agora:()=> '2026-10-17T21:00:00.000Z'});
 const inicio=await servico.criar({
  pedidoId:'pdf-livro-teste',origem:'PDF',clienteAsaasId:'cus_TesteCliente1'
 });
 assert.equal(inicio.status,'PENDENTE_SANDBOX');
 assert.equal(inicio.valorCentavos,3990);
 assert.equal(inicio.loja,'AKITEMM');
 assert.equal(inicio.projeto,'LOOP');
 assert.equal(inicio.dinheiroRealRecebidoCentavos,0);
 assert.equal(inicio.valorTransferidoParaLoopCentavos,0);
 assert.equal(inicio.creditoFilaCriado,0);
 assert.equal((await servico.criar({
  pedidoId:'pdf-livro-teste',origem:'PDF',clienteAsaasId:'cus_TesteCliente1'
 })).repetida,true);
 assert.equal(chamadas.filter(x=>x.opts.method==='POST').length,1);
 assert.equal(chamadas[0].url,ASAAS_SANDBOX_BASE+'/payments');
 assert.equal(JSON.parse(chamadas[0].opts.body).value,39.9);
 assert.equal(JSON.parse(chamadas[0].opts.body).description,
  'AKITEMM - cobranca EXCLUSIVAMENTE SANDBOX');
 await assert.rejects(()=>servico.criar({
  pedidoId:'pdf-livro-teste',origem:'PDF',clienteAsaasId:'cus_OutraConta99'
 }),{codigo:'CONFLITO_COBRANCA'});
 estado='CONFIRMED';
 assert.equal((await servico.conferir('pdf-livro-teste')).status,'PENDENTE_SANDBOX');
 estado='RECEIVED';
 assert.equal((await servico.conferir('pdf-livro-teste')).status,
  'RECEBIMENTO_INFORMADO_SANDBOX');
 estado='REFUNDED';
 assert.equal((await servico.conferir('pdf-livro-teste')).status,
  'REVERSAO_INFORMADA_SANDBOX');
 estado='RECEIVED';
 assert.equal((await servico.conferir('pdf-livro-teste')).status,
  'REVERSAO_INFORMADA_SANDBOX');
 assert.equal(servico.historico('pdf-livro-teste').conferencias.length,4);
 assert.equal(servico.consultar('pdf-livro-teste').valorTransferidoParaLoopCentavos,0);
 assert.equal(servico.consultar('pdf-livro-teste').saqueRealDisponivelCentavos,0);
});
test('timeout no sandbox impede cobranca dupla e nunca cria saldo ou posicao',async t=>{
 const db=preparar();t.after(()=>db.close());
 let envios=0;
 const provedor=new AsaasSandboxLojaV6({apiKey:'CHAVE_SANDBOX_DE_TESTE_123456',
  fetchImpl:async()=>{envios++;throw Error('timeout ficticio');}});
 const servico=new CobrancasAkitemmAsaasSandboxSQLite({banco:db,provedor});
 await assert.rejects(()=>servico.criar({
  pedidoId:'carrinho-livro-teste',origem:'CARRINHO',
  clienteAsaasId:'cus_CarrinhoTeste12'
 }),{codigo:'ASAAS_SANDBOX_REDE_INCONCLUSIVA'});
 assert.equal(envios,1);
 assert.equal((await servico.criar({
  pedidoId:'carrinho-livro-teste',origem:'CARRINHO',
  clienteAsaasId:'cus_CarrinhoTeste12'
 })).repetida,true);
 assert.equal(envios,1);
 assert.equal(servico.consultar('carrinho-livro-teste').status,'CRIACAO_INDETERMINADA_SANDBOX');
 await assert.rejects(()=>servico.conferir('carrinho-livro-teste'),
  {codigo:'CRIACAO_INDETERMINADA_VERIFICAR_ASAAS'});
 assert.equal(servico.consultar('carrinho-livro-teste').dinheiroRealRecebidoCentavos,0);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'loop_v6_pre_%'").get().n,0);
});
test('status divergente ou falso da cobranca externa nunca e contabilizado',async t=>{
 const db=preparar();t.after(()=>db.close());
 const provedor=new AsaasSandboxLojaV6({apiKey:'CHAVE_SANDBOX_DE_TESTE_123456',
  fetchImpl:async(_url,opts)=>({
   ok:true,json:async()=>opts.method==='POST'?
    {id:'pay_SANDBOX99999',billingType:'PIX',value:250,
     externalReference:'LOOPLAB-carrinho-livro-teste',status:'PENDING'}:
    {id:'pay_SANDBOX99999',billingType:'PIX',value:150,
     externalReference:'LOOPLAB-carrinho-livro-teste',status:'RECEIVED'}
  })});
 const servico=new CobrancasAkitemmAsaasSandboxSQLite({banco:db,provedor});
 await servico.criar({pedidoId:'carrinho-livro-teste',origem:'CARRINHO',
  clienteAsaasId:'cus_CarrinhoTeste12'});
 await assert.rejects(()=>servico.conferir('carrinho-livro-teste'),
  {codigo:'DADOS_PAGAMENTO_SANDBOX_DIVERGENTES'});
 assert.equal(servico.consultar('carrinho-livro-teste').status,'PENDENTE_SANDBOX');
 assert.equal(servico.historico('carrinho-livro-teste').conferencias.length,0);
});

test('API AKITEMM sandbox desativada por padrao e protegida por admin da plataforma',async t=>{
 const {once}=require('node:events');
 const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
 const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 const secret='akitemm-teste-segredo-local-2026-forte';
 const anterior=process.env.ASAAS_SANDBOX_API_KEY;
 delete process.env.ASAAS_SANDBOX_API_KEY;
 let server;
 try{
  server=criarAppAdminLaboratorio({repositorio:repo,segredo:secret})
   .listen(0,'127.0.0.1');
 }finally{
  if(anterior!==undefined)process.env.ASAAS_SANDBOX_API_KEY=anterior;
 }
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const host='http://127.0.0.1:'+server.address().port;
 const url=host+'/api/admin/akitemm/sandbox';
 assert.equal((await fetch(url+'/status')).status,401);
 const headers={Authorization:'Bearer '+secret};
 const status=await fetch(url+'/status',{headers});
 assert.equal(status.status,200);
 const json=await status.json();
 assert.equal(json.loja,'AKITEMM');
 assert.equal(json.plataforma,'LOOP');
 assert.equal(json.sandbox,false);
 assert.equal(json.recebimentosReais,false);
 const attempted=await fetch(url+'/cobrancas',{method:'POST',
  headers:{...headers,'Content-Type':'application/json'},
  body:JSON.stringify({clienteAsaasId:'cus_ClienteTeste123',
   origem:'PDF',pedidoId:'pedido-inventado'})});
 assert.equal(attempted.status,501);
});

test('boleto recebido no Asaas Sandbox nao pode ser conciliado como PIX nem liberar LOOP',async t=>{
 const db=preparar();t.after(()=>db.close());
 let consultas=0;
 const provedor=new AsaasSandboxLojaV6({
  apiKey:'CHAVE_SANDBOX_DE_TESTE_123456',
  fetchImpl:async(_url,opts)=>{
   if(opts.method==='POST')return {ok:true,json:async()=>({
    id:'pay_SANDBOX_BOLETO01',billingType:'PIX',value:250,
    externalReference:'LOOPLAB-carrinho-livro-teste',status:'PENDING'
   })};
   consultas++;
   return {ok:true,json:async()=>({
    id:'pay_SANDBOX_BOLETO01',billingType:'BOLETO',value:250,
    externalReference:'LOOPLAB-carrinho-livro-teste',status:'RECEIVED'
   })};
  }
 });
 const servico=new CobrancasAkitemmAsaasSandboxSQLite({banco:db,provedor});
 await servico.criar({pedidoId:'carrinho-livro-teste',origem:'CARRINHO',
  clienteAsaasId:'cus_CarrinhoTeste12'});
 await assert.rejects(()=>servico.conferir('carrinho-livro-teste'),
  {codigo:'DADOS_PAGAMENTO_SANDBOX_DIVERGENTES'});
 assert.equal(consultas,1);
 assert.equal(servico.consultar('carrinho-livro-teste').status,'PENDENTE_SANDBOX');
 assert.equal(servico.consultar('carrinho-livro-teste').creditoFilaCriado,0);
 assert.equal(servico.consultar('carrinho-livro-teste').valorTransferidoParaLoopCentavos,0);
 assert.equal(servico.historico('carrinho-livro-teste').conferencias.length,0);
});
