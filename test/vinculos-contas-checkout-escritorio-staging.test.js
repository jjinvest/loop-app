'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {DatabaseSync}=require('node:sqlite');
const {criarAppCheckoutStagingLocal}=require('../src/laboratorio/servidor-checkout-staging-local');
const {COOKIE}=require('../src/domain/autenticacao-checkout-staging-sqlite');
const ADMIN='operador-somente-laboratorio-'+('A'.repeat(48));
const SENHA_A='SenhaFicticiaAna2026MuitoForte!';
const SENHA_B='SenhaFicticiaBia2026MuitoForte!';
test('identidade comprovada une 1 conta checkout a 1 conta escritorio demo, sem trocar titular do pedido',async t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 const {app,auth,contasDemo,vinculos}=criarAppCheckoutStagingLocal({
  banco,segredoOperador:ADMIN,vincularContaDemo:true
 });
 const ana=contasDemo.cadastrar({nome:'Ana Exemplo',email:'ana@example.invalid',
  senha:SENHA_A,apelido:'Ana'});
 const bia=contasDemo.cadastrar({nome:'Bia Exemplo',email:'bia@example.invalid',
  senha:SENHA_B,apelido:'Bia'});
 const titular1=await auth.provisionarConta({nomeLogin:'checkout-ana',
  senha:'CheckoutAna2026!'});
 await auth.provisionarConta({nomeLogin:'checkout-bia',
  senha:'CheckoutBia2026!'});
 const login1=await auth.entrar({nomeLogin:'checkout-ana',
  senha:'CheckoutAna2026!'});
 const login2=await auth.entrar({nomeLogin:'checkout-bia',
  senha:'CheckoutBia2026!'});
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));banco.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const request=async(uri,{method='GET',token,csrf,body,operator=false}={})=>{
  const response=await fetch(base+uri,{method,headers:{
   ...(body?{'Content-Type':'application/json'}:{}),
   ...(token?{Cookie:COOKIE+'='+token}:{}),
   ...(csrf?{'X-Checkout-Csrf':csrf}:{}),
   ...(operator?{Authorization:'Bearer '+ADMIN}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json()};
 };
 const link=(token,csrf,nome,senha)=>request('/staging/vincular-escritorio',{
  method:'POST',token,csrf,body:{nome,senha}
 });
 assert.equal((await request('/staging/meu-vinculo-escritorio')).status,401);
 assert.equal((await request('/staging/escritorio-homologacao')).status,401);
 assert.equal((await link(login1.token,null,'Ana Exemplo',SENHA_A)).status,403,
  'CSRF obrigatorio mesmo apos login');
 assert.equal((await link(login1.token,login1.csrf,'Ana Exemplo','OutraSenha2026!')).status,401,
  'senha da conta do escritorio obrigatoria');
 assert.equal((await request('/staging/meu-vinculo-escritorio',{
  token:login1.token})).data.contaEscritorioVinculada,false);
 const vinculou=await link(login1.token,login1.csrf,'Ana Exemplo',SENHA_A);
 assert.equal(vinculou.status,201,JSON.stringify(vinculou.data));
 assert.equal(vinculou.data.repetido,false);
 assert.equal(vinculou.data.posicoesReais,0);
 assert.equal((await link(login1.token,login1.csrf,'Ana Exemplo',SENHA_A)).status,200,
  'repetir requisicao nao cria nova identidade');
 assert.equal((await link(login2.token,login2.csrf,'Ana Exemplo',SENHA_A)).status,409,
  'conta do escritorio nao pode pertencer a outro titular checkout');
 assert.equal((await link(login1.token,login1.csrf,'Bia Exemplo',SENHA_B)).status,409,
  'conta checkout nao pode assumir outro cadastro demo');
 const r1=await request('/staging/meu-vinculo-escritorio',{token:login1.token});
 assert.equal(r1.status,200);
 assert.equal(r1.data.contaEscritorioVinculada,true);
 assert.equal(Object.hasOwn(r1.data,'contaDemoId'),false,'nao expor ID de legado ao browser');
 const r2=await request('/staging/meu-vinculo-escritorio',{token:login2.token});
 assert.equal(r2.data.contaEscritorioVinculada,false);
 const oficina=await request('/staging/escritorio-homologacao',{operator:true});
 assert.equal(oficina.status,200);
 assert.equal(oficina.data.resumo.contasVinculadasEscritorioDemo,1);
 assert.equal(oficina.data.resumo.pagamentosReais,0);
 assert.equal(vinculos.consultar({titularCheckoutId:titular1.titularId}).contaDemoId,ana.contaId);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.throws(()=>banco.prepare(
  'DELETE FROM akitemm_checkout_escritorio_vinculos_staging'
 ).run(),/imutavel/);
 assert.ok(bia.contaId!==ana.contaId);
});
test('vinculo nao e instalado sem opt-in e nao existe no servidor publico',async t=>{
 const db=new DatabaseSync(':memory:');
 const {app}=criarAppCheckoutStagingLocal({banco:db,segredoOperador:ADMIN});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const r=await fetch(base+'/staging/meu-vinculo-escritorio');
 assert.notEqual(r.status,200);
 assert.throws(()=>criarAppCheckoutStagingLocal({
  banco:new DatabaseSync(':memory:'),vincularContaDemo:true
 }),/OPERADOR_OBRIGATORIO/);
 const publico=require('../src/server');
 const p=publico.listen(0,'127.0.0.1');await once(p,'listening');
 t.after(()=>new Promise(resolve=>p.close(resolve)));
 const url='http://127.0.0.1:'+p.address().port;
 assert.equal((await fetch(url+'/staging/meu-vinculo-escritorio')).status,404);
 assert.equal((await fetch(url+'/staging/vincular-escritorio',{method:'POST'})).status,404);
 assert.equal((await fetch(url+'/api/checkout/finalizar',{method:'POST'})).status,503);
});
