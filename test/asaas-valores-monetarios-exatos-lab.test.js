'use strict';
// Regressao pontual: nem arredondamento de fracao, nem coercao textual
// podem comprovar um recebimento no Asaas Sandbox da AKITEMM.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {AsaasSandboxLojaV6}=require('../src/domain/asaas-sandbox-loja-v6');
const {CobrancasAkitemmAsaasSandboxSQLite}=
 require('../src/domain/cobrancas-akitemm-asaas-sandbox-v6');
const key='CHAVE_FICTICIA_SANDBOX_VALOR_EXATO_12345678';
const pedido='carrinho-valor-exato';
const pagamentoId='pay_SandboxValorExato01';
const cliente='cus_ValorExatoTeste01';
function resposta(valor,status='PENDING'){
 return {id:pagamentoId,billingType:'PIX',value:valor,status,
  externalReference:'LOOPLAB-'+pedido,customer:cliente};
}
function bancoTeste(t){
 const banco=new DatabaseSync(':memory:');
 t.after(()=>banco.close());
 banco.exec('CREATE TABLE admin_carrinho_loop_demo('+
  'pedido_id TEXT PRIMARY KEY,total_centavos INTEGER NOT NULL)');
 banco.prepare('INSERT INTO admin_carrinho_loop_demo VALUES(?,?)').run(pedido,25000);
 return banco;
}

test('POST rejeita string monetaria e fracao de centavo sem recriar cobranca',async t=>{
 for(const invalido of ['250',250.004,250.006,null]){
  const banco=bancoTeste(t);
  let posts=0;
  const provedor=new AsaasSandboxLojaV6({apiKey:key,
   fetchImpl:async(_url,opts)=>{
    assert.equal(opts.method,'POST');posts++;
    return {ok:true,json:async()=>resposta(invalido)};
   }});
  const cobrancas=new CobrancasAkitemmAsaasSandboxSQLite({banco,provedor});
  await assert.rejects(()=>cobrancas.criar({
   pedidoId:pedido,origem:'CARRINHO',clienteAsaasId:cliente
  }),{codigo:'ASAAS_SANDBOX_COBRANCA_DIVERGENTE'});
  assert.equal(cobrancas.consultar(pedido).status,'CRIACAO_INDETERMINADA_SANDBOX');
  assert.equal(cobrancas.consultar(pedido).pagamentoId,null);
  assert.equal((await cobrancas.criar({
   pedidoId:pedido,origem:'CARRINHO',clienteAsaasId:cliente
  })).repetida,true);
  assert.equal(posts,1);
  assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM akitemm_sandbox_consultas').get().n,0);
  assert.equal(cobrancas.consultar(pedido).creditoFilaCriado,0);
 }
});

test('GET nao aceita valores truncados ou strings para confirmar PIX',async t=>{
 const banco=bancoTeste(t);
 let recebido=250,status='PENDING',gets=0,posts=0;
 const provedor=new AsaasSandboxLojaV6({apiKey:key,fetchImpl:async(_url,opts)=>{
  if(opts.method==='POST'){posts++;return {ok:true,json:async()=>resposta(250)};}
  gets++;return {ok:true,json:async()=>resposta(recebido,status)};
 }});
 const cobrancas=new CobrancasAkitemmAsaasSandboxSQLite({banco,provedor});
 await cobrancas.criar({pedidoId:pedido,origem:'CARRINHO',clienteAsaasId:cliente});
 status='RECEIVED';
 for(const invalido of [249.999,'250',250.004,NaN,-250]){
  recebido=invalido;
  await assert.rejects(()=>cobrancas.conferir(pedido),
   {codigo:'ASAAS_SANDBOX_CONSULTA_DIVERGENTE'});
  assert.equal(cobrancas.consultar(pedido).status,'PENDENTE_SANDBOX');
  assert.equal(cobrancas.historico(pedido).conferencias.length,0);
 }
 recebido=250;
 const bom=await cobrancas.conferir(pedido);
 assert.equal(bom.status,'RECEBIMENTO_INFORMADO_SANDBOX');
 assert.equal(bom.dinheiroRealRecebidoCentavos,0);
 assert.equal(cobrancas.historico(pedido).conferencias.length,1);
 assert.equal(posts,1);assert.equal(gets,6);
 assert.equal(banco.prepare('SELECT COUNT(*) n FROM akitemm_sandbox_cobrancas').get().n,1);
 assert.equal(Object.values(banco.prepare('PRAGMA integrity_check').get())[0],'ok');
});

test('valor numerico de centavos validos e aceito com float decimal',async()=>{
 let valor=39.9;
 const provedor=new AsaasSandboxLojaV6({apiKey:key,fetchImpl:async(_url,opts)=>({
  ok:true,json:async()=>resposta(valor,opts.method==='GET'?'RECEIVED':'PENDING')
 })});
 const cob=await provedor.criarCobrancaPix({clienteAsaasId:cliente,
  valorCentavos:3990,pedidoId:pedido});
 assert.equal(cob.valorCentavos,3990);
 assert.equal((await provedor.consultarCobranca(pagamentoId)).valorCentavos,3990);
});
