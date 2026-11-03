'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {criarAppCheckoutStagingLocal}=require('../src/laboratorio/servidor-checkout-staging-local');
const {COOKIE}=require('../src/domain/autenticacao-checkout-staging-sqlite');
test('CPF cifrado e termos requerem sessao + CSRF; pedidos e financeiro continuam fechados',async t=>{
 const banco=new DatabaseSync(':memory:');banco.exec('PRAGMA foreign_keys=ON');
 const {app,auth}=criarAppCheckoutStagingLocal({
  banco,segredoOperador:'segredo-escritorio-local-'+('A'.repeat(42)),
  identidadeCandidata:{
   hmacKey:randomBytes(32),cipherKey:randomBytes(32),
   termosVersao:'LAB-contrato-ensaio-1',
   termosTexto:'Declaração fictícia para ensaio local do registro de aceite. Não equivale a um contrato comercial.'
  }
 });
 await auth.provisionarConta({nomeLogin:'candidato-titular-01',senha:'SenhaTesteCandidato01!'});
 await auth.provisionarConta({nomeLogin:'candidato-titular-02',senha:'SenhaTesteCandidato02!'});
 const a=await auth.entrar({nomeLogin:'candidato-titular-01',senha:'SenhaTesteCandidato01!'});
 const b=await auth.entrar({nomeLogin:'candidato-titular-02',senha:'SenhaTesteCandidato02!'});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(done=>server.close(done));banco.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const call=async({token,csrf,method='GET',body}={})=>{
  const r=await fetch(base+'/staging/identidade-candidata',{method,headers:{
   ...(token?{Cookie:COOKIE+'='+token}:{}),
   ...(csrf?{'X-Checkout-Csrf':csrf}:{}),
   ...(body?{'Content-Type':'application/json'}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,body:await r.json()};
 };
 const data={cpf:'529.982.247-25',aceiteExplicito:true};
 assert.equal((await call({method:'POST',body:data})).status,401);
 assert.equal((await call({token:a.token,method:'POST',body:data})).status,403);
 assert.equal((await call({token:a.token,csrf:a.csrf,method:'POST',
  body:{...data,aceiteExplicito:false}})).status,400);
 const created=await call({token:a.token,csrf:a.csrf,method:'POST',body:data});
 assert.equal(created.status,201);
 assert.equal(created.body.permitidoCriarPosicoes,false);
 assert.equal(created.body.identidadeExternaVerificada,false);
 assert.equal((await call({token:a.token,csrf:a.csrf,method:'POST',body:data})).status,200);
 assert.equal((await call({token:b.token,csrf:b.csrf,method:'POST',body:data})).status,409);
 const readA=await call({token:a.token});
 assert.equal(readA.body.registradoNoEnsaio,true);
 assert.equal(readA.body.comprasReaisPermitidas,false);
 assert.equal(readA.body.saquesReaisPermitidos,false);
 assert.equal((await call({token:b.token})).body.registradoNoEnsaio,false);
 assert.equal(JSON.stringify(readA.body).includes('52998224725'),false);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
