'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {
 AsaasSandboxPixOutReadOnly,diagnosticarCelcoinReadOnly,
 planoDeIntegracoesPSP
}=require('../src/producao/adaptadores-psp-readonly');
function resposta(status,body){
 return {status,headers:{get:()=>String(JSON.stringify(body).length)},
  text:async()=>JSON.stringify(body)};
}
const chave='$aact_hmlg_'+('x'.repeat(48));
const id='transf_12345',pagamento='pay_12345';
function montar(dados,espiao=[]){
 return new AsaasSandboxPixOutReadOnly({
  chaveSandbox:chave,
  fetchImpl:async(url,opts)=>{
   espiao.push({url,method:opts.method,redirect:opts.redirect,
    header:opts.headers.access_token,body:opts.body});
   if(url.endsWith('/finance/balance'))
    return resposta(200,{balance:127.25});
   if(url.endsWith('/transfers/'+id))
    return resposta(200,dados?.transferencia??{
     id,status:'DONE',value:25.50
    });
   if(url.endsWith('/payments/'+pagamento))
    return resposta(200,dados?.cobranca??{
     id:pagamento,status:'RECEIVED',value:250.00
    });
   throw Error('URL_INESPERADA');
  }
 });
}
test('Asaas Sandbox GET verifica saldo, transferencia e cobranca sem habilitar qualquer escrita',async()=>{
 const req=[],cli=montar({},req);
 const saldo=await cli.consultarSaldo();
 assert.equal(saldo.saldoFicticioCentavos,12725);
 assert.equal(saldo.habilitaPixReal,false);
 const tr=await cli.consultarPix(id);
 assert.equal(tr.valorFicticioCentavos,2550);
 assert.equal(tr.estado,'CONCLUIDO_NO_SANDBOX');
 assert.equal(tr.saqueRealPago,false);
 assert.equal(tr.podeReenviarAutomaticamente,false);
 const p=await cli.consultarCobranca(pagamento);
 assert.equal(p.estadoObservado,'RECEIVED');
 assert.equal(p.valorFicticioCentavos,25000);
 assert.equal(p.autorizaPedidoReal,false);
 assert.equal(p.autorizaPosicao,false);
 assert.equal(req.length,3);
 assert.ok(req.every(x=>x.method==='GET'&&
  x.url.startsWith('https://api-sandbox.asaas.com/v3/')&&
  x.header===chave&&x.body===undefined&&x.redirect==='error'));
 const portas=cli.descreverPortas();
 assert.equal(portas.semEscrita,true);
 assert.equal(portas.captacao.contratoDeCodigoCompativel,false);
 assert.ok(portas.executor.metodosFaltantes.includes('enviarPix'));
 assert.equal(portas.executor.aptoProducao,false);
 assert.equal(planode().movimentacaoRealPermitida,false);
});
function planode(){return planoDeIntegracoesPSP();}
test('falha de PSP, 401, timeout, status indeterminado e valores ruins nao liberam fundos',async()=>{
 assert.throws(()=>new AsaasSandboxPixOutReadOnly({
  chaveSandbox:'$aact_prod_ABCDEFGHIJKLMNOP'
 }),{codigo:'PORTAS_ASAAS_CHAVE_SANDBOX_OBRIGATORIA'});
 assert.throws(()=>new AsaasSandboxPixOutReadOnly({
  chaveSandbox:chave,fetchImpl:null
 }),{codigo:'PORTAS_SANDBOX_TRANSPORTE_INVALIDO'});
 const cli=montar({transferencia:{id,status:'NEW_STATE',value:25.50}});
 assert.equal((await cli.consultarPix(id)).estado,'INDETERMINADO');
 const cliErro=montar({transferencia:{id,status:'DONE',value:1.123}});
 await assert.rejects(cliErro.consultarPix(id),
  {codigo:'PORTAS_SANDBOX_VALOR_INVALIDO'});
 await assert.rejects(cli.consultarPix('https://servidor-malicioso.invalid'),
  {codigo:'PORTAS_SANDBOX_RECURSO_NAO_AUTORIZADO'});
 const auth=new AsaasSandboxPixOutReadOnly({
  chaveSandbox:chave,fetchImpl:async()=>resposta(401,{})
 });
 await assert.rejects(auth.consultarSaldo(),
  {codigo:'PORTAS_SANDBOX_SEM_PERMISSAO'});
 const timeout=new AsaasSandboxPixOutReadOnly({
  chaveSandbox:chave,fetchImpl:async()=>{throw Error('timeout');}
 });
 await assert.rejects(timeout.consultarSaldo(),
  {codigo:'PORTAS_SANDBOX_REDE_INDETERMINADA'});
 const unknown=new AsaasSandboxPixOutReadOnly({
  chaveSandbox:chave,fetchImpl:async()=>resposta(200,{id,status:'DONE',value:'25.5'})
 });
 await assert.rejects(unknown.consultarPix(id),
  {codigo:'PORTAS_SANDBOX_TRANSFERENCIA_DIVERGENTE'});
});
test('Celcoin reutiliza acesso OAuth somente para diagnostico; nunca afirma split externo',async()=>{
 const chamadas=[];
 const prova=await diagnosticarCelcoinReadOnly({
  clientId:'TESTE_CELCOIN_ID',
  clientSecret:'TESTE_CELCOIN_SEGREDO',
  fetchImpl:async(url,opts)=>{
   chamadas.push({url,method:opts.method});
   if(url.endsWith('/v5/token'))
    return {status:200,ok:true,text:async()=>JSON.stringify({
     access_token:'a'.repeat(64),token_type:'Bearer'
    })};
   if(url.endsWith('/pix/v1/participants'))
    return {status:200,ok:true,text:async()=>JSON.stringify({
     data:[{ispb:'12345678'}]
    })};
   throw Error('CAMINHO_EXTERNO');
  }
 });
 assert.equal(prova.autenticacaoSandbox,true);
 assert.equal(prova.participantesConsultados,true);
 assert.equal(prova.splitBancosExternosContratado,false);
 assert.equal(prova.cashoutContratado,false);
 assert.equal(chamadas.length,2);
 assert.deepEqual(chamadas.map(x=>x.method),['POST','GET']);
 assert.ok(chamadas.every(x=>x.url.startsWith(
  'https://sandbox.openfinance.celcoin.dev/')));
});
test('sem credenciais e em producao as portas ficam fechadas',async()=>{
 await assert.rejects(diagnosticarCelcoinReadOnly({}),
  {codigo:'CELCOIN_CREDENCIAIS_SANDBOX_AUSENTES'});
 const atual=process.env.NODE_ENV;
 try{
  process.env.NODE_ENV='production';
  assert.throws(()=>new AsaasSandboxPixOutReadOnly({
   chaveSandbox:chave
  }),{codigo:'PORTAS_SANDBOX_PROIBIDA_EM_PRODUCAO'});
  await assert.rejects(diagnosticarCelcoinReadOnly({
   clientId:'12345678',clientSecret:'12345678'
  }),{codigo:'PORTAS_SANDBOX_PROIBIDA_EM_PRODUCAO'});
 }finally{
  if(atual===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=atual;
 }
});
