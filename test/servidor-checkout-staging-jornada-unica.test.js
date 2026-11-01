'use strict';
// Jornada HTTP unica do cliente de homologacao; sem dinheiro, CPF real ou PSP.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {
 criarAppCheckoutStagingLocal,provisionarContaEnsaio,
 iniciarCheckoutStagingLocal
}=require('../src/laboratorio/servidor-checkout-staging-local');
const SENHA='SenhaFicticiaUnicaParaStagingSomente2026!';
function recursos(t){
 const pasta=mkdtempSync(path.join(tmpdir(),'loop-checkout-composicao-'));
 t.after(()=>rmSync(pasta,{force:true,recursive:true}));
 return {arquivo:path.join(pasta,'homologacao.sqlite')};
}
async function abrir(t,arquivo){
 const banco=new DatabaseSync(arquivo);
 banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;');
 const {app}=criarAppCheckoutStagingLocal({banco});
 const s=app.listen(0,'127.0.0.1');await once(s,'listening');
 t.after(async()=>{await new Promise(resolve=>s.close(resolve));banco.close();});
 const base='http://127.0.0.1:'+s.address().port;
 async function chamar(rota,{method='GET',cookie,csrf,key,body}={}){
  const r=await fetch(base+'/staging'+rota,{
   method,headers:{
    ...(body===undefined?{}:{'Content-Type':'application/json'}),
    ...(cookie?{Cookie:cookie}:{}),
    ...(csrf?{'X-Checkout-Csrf':csrf}:{}),
    ...(key?{'Idempotency-Key':key}:{})
   },
   ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};
 }
 async function entrar(login){
  const r=await chamar('/entrar',{method:'POST',body:{
   nomeLogin:login,senha:SENHA
  }});
  assert.equal(r.status,200,JSON.stringify(r.data));
  return {cookie:r.cookie.split(';')[0],csrf:r.data.csrf,id:r.data.titularId};
 }
 return {chamar,entrar,servidor:s,banco,base};
}
test('jornada unica: login, cotacao, rascunho e prepedido em Meus Pedidos com dois titulares',async t=>{
 const m=recursos(t);
 await assert.rejects(provisionarContaEnsaio({
  arquivo:m.arquivo,nomeLogin:'teste-cliente-alpha',senha:SENHA
 }),{codigo:'PROVISIONAMENTO_NAO_AUTORIZADO'});
 await provisionarContaEnsaio({
  arquivo:m.arquivo,nomeLogin:'teste-cliente-alpha',senha:SENHA,autorizado:true
 });
 await provisionarContaEnsaio({
  arquivo:m.arquivo,nomeLogin:'teste-cliente-beta',senha:SENHA,autorizado:true
 });
 const s=await abrir(t,m.arquivo);
 const a=await s.entrar('teste-cliente-alpha');
 const b=await s.entrar('teste-cliente-beta');
 assert.notEqual(a.id,b.id);
 const estado=await s.chamar('/estado');
 assert.equal(estado.status,200);
 assert.equal(estado.data.checkoutPublico,false);
 assert.equal(estado.data.meusPedidosDisponivel,true);
 const pedido={itens:[{produtoId:'curso-homologacao-250',quantidade:1}]};
 const cotacao=await s.chamar('/cotacao',{method:'POST',body:pedido});
 assert.equal(cotacao.status,200);
 assert.equal(cotacao.data.totalCentavos,25000);
 assert.equal(cotacao.data.compraDisponivel,false);
 const r=await s.chamar('/rascunhos',{method:'POST',
  cookie:a.cookie,csrf:a.csrf,key:'chave-fluxo-unico-staging-2026',body:pedido
 });
 assert.equal(r.status,201,JSON.stringify(r.data));
 const rascunhoId=r.data.intencao.pedidoId;
 const p=await s.chamar('/prepedidos',{method:'POST',
  cookie:a.cookie,csrf:a.csrf,body:{rascunhoId}
 });
 assert.equal(p.status,201,JSON.stringify(p.data));
 const prepedidoId=p.data.prepedido.prepedidoId;
 assert.equal(p.data.prepedido.totalCentavos,25000);
 assert.equal(p.data.prepedido.posicoesCriadas,0);
 assert.equal(p.data.prepedido.pagamentoIniciado,false);
 const lista=await s.chamar('/prepedidos',{cookie:a.cookie});
 assert.equal(lista.status,200);
 assert.equal(lista.data.prepedidos.length,1);
 assert.equal(lista.data.prepedidos[0].prepedidoId,prepedidoId);
 assert.equal((await s.chamar('/rascunhos',{cookie:b.cookie})).data.intencoes.length,0);
 assert.equal((await s.chamar('/prepedidos',{cookie:b.cookie})).data.prepedidos.length,0);
 assert.equal((await s.chamar('/prepedidos/'+prepedidoId,{cookie:b.cookie})).status,404);
 assert.equal((await s.chamar('/prepedidos/'+prepedidoId+'/sandbox',{
  cookie:b.cookie
 })).status,404);
 const visao=await s.chamar('/prepedidos/'+prepedidoId+'/sandbox',{cookie:a.cookie});
 assert.equal(visao.status,200);
 assert.equal(visao.data.estado,'SEM_COBRANCA_SANDBOX');
 assert.equal(visao.data.posicoesCriadas,0);
 assert.equal(visao.data.consultaRemotaExecutada,false);
 assert.equal((await s.chamar('/prepedidos',{method:'POST',cookie:a.cookie,
  body:{rascunhoId}})).status,403);
 const logout=await s.chamar('/sair',{method:'POST',
  cookie:a.cookie,csrf:a.csrf});
 assert.equal(logout.status,200);
 assert.equal((await s.chamar('/prepedidos',{cookie:a.cookie})).status,401);
 assert.equal((await s.chamar('/sessao',{cookie:a.cookie})).status,401);
 assert.equal(s.banco.prepare('SELECT COUNT(*) AS n FROM akitemm_checkout_prepedidos_staging').get().n,1);
 assert.equal(s.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(s.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('reinicio do servidor mantem Meus Pedidos e checkout publico segue bloqueado',async t=>{
 const m=recursos(t);
 await provisionarContaEnsaio({
  arquivo:m.arquivo,nomeLogin:'teste-cliente-gamma',senha:SENHA,autorizado:true
 });
 const s=await abrir(t,m.arquivo);
 const a=await s.entrar('teste-cliente-gamma');
 const criacao=await s.chamar('/rascunhos',{method:'POST',cookie:a.cookie,csrf:a.csrf,
  key:'chave-reinicio-montagem-2026',
  body:{itens:[{produtoId:'curso-homologacao-250',quantidade:1}]}
 });
 const pre=await s.chamar('/prepedidos',{method:'POST',
  cookie:a.cookie,csrf:a.csrf,body:{rascunhoId:criacao.data.intencao.pedidoId}
 });
 assert.equal(pre.status,201);
 const segundoBanco=new DatabaseSync(m.arquivo);
 segundoBanco.exec('PRAGMA foreign_keys=ON;');
 const outraMontagem=criarAppCheckoutStagingLocal({banco:segundoBanco});
 const servico=outraMontagem.app.listen(0,'127.0.0.1');await once(servico,'listening');
 t.after(async()=>{await new Promise(resolve=>servico.close(resolve));segundoBanco.close();});
 const url='http://127.0.0.1:'+servico.address().port+'/staging';
 const login=await fetch(url+'/entrar',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({nomeLogin:'teste-cliente-gamma',senha:SENHA})});
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const lista=await fetch(url+'/prepedidos',{headers:{Cookie:cookie}});
 assert.equal(lista.status,200);
 assert.equal((await lista.json()).prepedidos[0].prepedidoId,pre.data.prepedido.prepedidoId);
 const publico=require('../src/server');
 const sv=publico.listen(0,'127.0.0.1');await once(sv,'listening');
 t.after(()=>new Promise(resolve=>sv.close(resolve)));
 const origem='http://127.0.0.1:'+sv.address().port;
 assert.equal((await fetch(origem+'/api/checkout/prepedidos',{method:'POST'})).status,503);
 assert.equal((await fetch(origem+'/staging/entrar',{method:'POST'})).status,404);
 assert.equal((await fetch(origem+'/health/ready')).status,503);
});
test('servidor local nunca inicia sem autorizacao, banco provisionado ou producao',()=>{
 assert.throws(()=>iniciarCheckoutStagingLocal({
  arquivo:'/tmp/nao-existe-checkout-staging-2026.sqlite'
 }),{codigo:'STAGING_LOCAL_NAO_AUTORIZADO'});
 assert.throws(()=>iniciarCheckoutStagingLocal({
  arquivo:'/tmp/nao-existe-checkout-staging-2026.sqlite',autorizado:true
 }),{codigo:'BANCO_STAGING_NAO_PROVISIONADO'});
});
