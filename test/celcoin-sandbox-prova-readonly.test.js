'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {provarAcessoCelcoinSandboxReadOnly,estadoCelcoinSandboxReadOnly}=
 require('../src/integracoes/celcoin-sandbox-prova-readonly');
const clientId='client-id-celcoin-test-only';
const clientSecret='client-secret-celcoin-test-only';
const resposta=(status,body)=>({ok:status>=200&&status<300,status,
 text:async()=>JSON.stringify(body)});
test('sem credencial Celcoin nao faz nenhuma chamada e sinaliza pendencia',async()=>{
 assert.deepEqual(estadoCelcoinSandboxReadOnly({}).credenciaisConfiguradas,false);
 let chamadas=0;
 await assert.rejects(provarAcessoCelcoinSandboxReadOnly({
  fetchImpl:async()=>{chamadas++;throw Error('inseguro')}
 }),/CELCOIN_CREDENCIAIS_SANDBOX_AUSENTES/);
 assert.equal(chamadas,0);
});
test('OAuth sandbox e GET participantes, nenhum PIX ou conta criados e sem vazar token',async()=>{
 const rotas=[];
 const retorno=await provarAcessoCelcoinSandboxReadOnly({
  clientId,clientSecret,fetchImpl:async(url,opts)=>{
   rotas.push([url,opts.method,opts.redirect]);
   assert.equal(opts.redirect,'error');
   assert.equal(opts.signal.aborted,false);
   if(url.endsWith('/v5/token')){
    assert.equal(opts.method,'POST');
    assert.ok(opts.body instanceof FormData);
    assert.equal(opts.body.get('client_id'),clientId);
    assert.equal(opts.body.get('client_secret'),clientSecret);
    assert.equal(opts.body.get('grant_type'),'client_credentials');
    assert.equal(opts.headers.Authorization,undefined);
    return resposta(200,{access_token:'token-ficticio-xxxxxxxxxxxxxxxxxxxx',
     token_type:'bearer',expires_in:2400});
   }
   assert.equal(url,'https://sandbox.openfinance.celcoin.dev/pix/v1/participants');
   assert.equal(opts.method,'GET');
   assert.equal(opts.headers.Authorization,
    'Bearer token-ficticio-xxxxxxxxxxxxxxxxxxxx');
   return resposta(200,{data:[{ispb:'12345678'}]});
  }
 });
 assert.deepEqual(rotas.map(x=>[x[0].replace('https://sandbox.openfinance.celcoin.dev',''),x[1]]),[
  ['/v5/token','POST'],['/pix/v1/participants','GET']]);
 assert.equal(retorno.tokenSandboxAutenticado,true);
 assert.equal(retorno.listaParticipantesPixConsultada,true);
 assert.equal(retorno.transferenciasRealizadas,0);
 assert.equal(retorno.contasCriadas,0);
 assert.equal(retorno.comprasGeradas,0);
 assert.equal(retorno.dadosBancariosExternosConfigurados,false);
 assert.equal(retorno.marcoZeroFinanceiroAprovado,false);
 const display=JSON.stringify(retorno);
 assert.equal(display.includes(clientId),false);
 assert.equal(display.includes(clientSecret),false);
 assert.equal(display.includes('token-ficticio'),false);
 assert.equal(display.includes('ispb'),false);
});
test('resposta 401, token malformado, lista nao autorizada falham sem registrar Pix',async()=>{
 await assert.rejects(provarAcessoCelcoinSandboxReadOnly({
  clientId,clientSecret,fetchImpl:async()=>resposta(401,{message:'segredo interno'})
 }),/CELCOIN_SANDBOX_ACESSO_NAO_AUTORIZADO/);
 await assert.rejects(provarAcessoCelcoinSandboxReadOnly({
  clientId,clientSecret,fetchImpl:async()=>resposta(200,{access_token:'x'})
 }),/CELCOIN_TOKEN_SANDBOX_INVALIDO/);
 await assert.rejects(provarAcessoCelcoinSandboxReadOnly({
  clientId,clientSecret,fetchImpl:async(url)=>
   url.endsWith('/v5/token')?
    resposta(200,{access_token:'token-ficticio-xxxxxxxxxxxxxxxxxxxx',token_type:'Bearer'}):
    resposta(403,{message:'sem permissao para BaaS'})
 }),/CELCOIN_SANDBOX_ACESSO_NAO_AUTORIZADO/);
});
test('sem credenciais nao marca conexao ou PIX habilitado',()=>{
 const r=estadoCelcoinSandboxReadOnly({clientId,clientSecret});
 assert.equal(r.credenciaisConfiguradas,true);
 assert.equal(r.autenticacaoComprovada,false);
 assert.equal(r.contasExternasConectadas,false);
 assert.equal(r.transferenciasReais,0);
 assert.equal(r.chavesExpostas,false);
});
