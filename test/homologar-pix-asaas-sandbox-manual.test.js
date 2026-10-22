'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {homologar}=require('../scripts/homologar-pix-asaas-sandbox-manual');
const chave='$aact_hmlg_TESTE_FAKE_SEM_VALOR_123456789';
const cpf='24971563792'; // Exemplo publico da documentacao oficial do Asaas; somente fixture.
const CLIENT_REF='AKITEMM-LOOP-SANDBOX-TESTE-01';
const PAY_REF='LOOPLAB-akitemm-pix-teste-001';
function cenario(){
 const chamadas=[],clientes=[],pagamentos=[];
 let timeout=null,repostaAdulterada=null;
 const fetchImpl=async(url,o)=>{
  assert.ok(url.startsWith('https://api-sandbox.asaas.com/v3/'));
  assert.equal(o.redirect,'error');
  assert.equal(o.headers.access_token,chave);
  chamadas.push({method:o.method,url});
  if(timeout){const err=timeout;timeout=null;throw err;}
  const u=new URL(url);
  let data=null;
  if(u.pathname==='/v3/customers'&&o.method==='GET')
   data={data:clientes.filter(x=>x.externalReference===u.searchParams.get('externalReference'))};
  else if(u.pathname==='/v3/customers'&&o.method==='POST'){
   const v=JSON.parse(o.body);assert.equal(v.notificationDisabled,true);
   assert.equal(v.externalReference,CLIENT_REF);
   data={id:'cus_TesteCliente001',...v};
   clientes.push(data);
  }else if(u.pathname==='/v3/payments'&&o.method==='GET')
   data={data:pagamentos.filter(x=>x.externalReference===u.searchParams.get('externalReference'))};
  else if(u.pathname==='/v3/payments'&&o.method==='POST'){
   const v=JSON.parse(o.body);
   assert.equal(v.externalReference,PAY_REF);
   assert.equal(v.value,250);
   data={id:'pay_TesteCobranca001',status:'PENDING',...v};
   pagamentos.push(data);
  }else if(u.pathname==='/v3/payments/pay_TesteCobranca001'&&o.method==='GET')
   data={...pagamentos[0],...(repostaAdulterada||{})};
  else if(u.pathname==='/v3/sandbox/payment/pay_TesteCobranca001/confirm'&&o.method==='POST'){
   pagamentos[0].status='RECEIVED';
   data={...pagamentos[0]};
  }else throw Error('OPERACAO_NAO_PREVISTA');
  return {ok:true,status:200,json:async()=>data};
 };
 return {chamadas,clientes,pagamentos,fetchImpl,
  timeout:()=>{timeout=Error('rede');},
  adulterar:d=>{repostaAdulterada=d}};
}
function opts(c,extra={}){return {apiKey:chave,cpfTeste:cpf,
 execucaoLiberada:true,confirmarSimulacao:true,fetchImpl:c.fetchImpl,...extra};}
test('homologacao sandbox manual bloqueada por padrao',async()=>{
 const c=cenario();
 await assert.rejects(()=>homologar(opts(c,{execucaoLiberada:false})),
  {codigo:'HOMOLOGACAO_MANUAL_NAO_AUTORIZADA'});
 assert.equal(c.chamadas.length,0);
});
test('homologacao sandbox bloqueia chave de producao e CPF nao informado',async()=>{
 const c=cenario();
 await assert.rejects(()=>homologar(opts(c,{apiKey:'$aact_prod_FAKE_123'})),
  {codigo:'CHAVE_SANDBOX_NAO_CONFIGURADA'});
 await assert.rejects(()=>homologar(opts(c,{cpfTeste:''})),
  {codigo:'CPF_EXCLUSIVAMENTE_TESTE_NAO_CONFIGURADO'});
 assert.equal(c.chamadas.length,0);
});
test('sandbox cria cliente e Pix teste, confirma simulado, mas nao cria direitos LOOP',async()=>{
 const c=cenario();
 const r=await homologar(opts(c));
 assert.equal(r.ambiente,'ASAAS_SANDBOX_EXCLUSIVO');
 assert.equal(r.recebidoInformadoNoSandbox,true);
 assert.equal(r.movimentosReais,0);assert.equal(r.liberacaoPosicoes,0);
 assert.equal(r.saques,0);
 assert.equal(c.clientes.length,1);assert.equal(c.pagamentos.length,1);
 assert.equal(c.chamadas.filter(x=>x.method==='POST').length,3);
 assert.equal(c.pagamentos[0].value,250);
});
test('sandbox repetido encontra cliente e Pix sem criar duplicatas',async()=>{
 const c=cenario();
 await homologar(opts(c));
 const r=await homologar(opts(c));
 assert.equal(r.recebidoInformadoNoSandbox,true);
 assert.equal(c.clientes.length,1);assert.equal(c.pagamentos.length,1);
 assert.equal(c.chamadas.filter(x=>x.method==='POST').length,3);
});
test('sandbox sem autorizacao expressa para simular fica pendente sem confirmacao',async()=>{
 const c=cenario();
 const r=await homologar(opts(c,{confirmarSimulacao:false}));
 assert.equal(r.simulacaoSolicitada,false);
 assert.equal(r.statusDepois,'PENDING');
 assert.equal(c.chamadas.filter(x=>x.method==='POST').length,2);
});
test('sandbox valor divergente bloqueia conciliacao mesmo com identificador correto',async()=>{
 const c=cenario();
 c.adulterar({value:249.99});
 await assert.rejects(()=>homologar(opts(c)),
  {codigo:'CONCILIACAO_SANDBOX_DIVERGENTE'});
 assert.equal(c.chamadas.filter(x=>x.url.includes('/confirm')).length,0);
});
test('sandbox falha de rede nao gera retentativa POST automatica',async()=>{
 const c=cenario();c.timeout();
 await assert.rejects(()=>homologar(opts(c)),{
  codigo:'REDE_SANDBOX_INCONCLUSIVA_VERIFICAR_MANUALMENTE'});
 assert.equal(c.chamadas.length,1);
});
test('sandbox detecta mais de um cliente cadastrado com mesmo identificador',async()=>{
 const c=cenario();
 c.clientes.push({id:'cus_ClienteDuplo001',externalReference:CLIENT_REF});
 c.clientes.push({id:'cus_ClienteDuplo002',externalReference:CLIENT_REF});
 await assert.rejects(()=>homologar(opts(c)),{codigo:'CLIENTES_SANDBOX_DUPLICADOS_REVISAR'});
 assert.equal(c.chamadas.filter(x=>x.method==='POST').length,0);
});
test('sandbox detecta duas cobrancas com mesma referencia e nao duplica',async()=>{
 const c=cenario();await homologar(opts(c,{confirmarSimulacao:false}));
 c.pagamentos.push({...c.pagamentos[0],id:'pay_DuploPix00002'});
 await assert.rejects(()=>homologar(opts(c)),
  {codigo:'COBRANCAS_SANDBOX_DUPLICADAS_REVISAR'});
 assert.equal(c.chamadas.filter(x=>x.url.includes('/confirm')).length,0);
});
