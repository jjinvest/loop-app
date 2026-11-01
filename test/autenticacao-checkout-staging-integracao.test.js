'use strict';
// Caminho unico local: senha -> cookie -> CSRF -> rascunho -> logout.
// Nao exercita PIX, checkout publico, CPF, rede externa nem dinheiro real.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {once}=require('node:events');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const express=require('express');
const {RepositorioCatalogoMemoria}=require('../src/domain/repositorio-catalogo-memoria');
const {IntencoesCheckoutSQLite}=require('../src/domain/intencoes-checkout-sqlite');
const {AutenticacaoCheckoutStagingSQLite}=require('../src/domain/autenticacao-checkout-staging-sqlite');
const {criarRouterRascunhosCheckoutStaging}=require('../src/routes/rascunhos-checkout-staging');
const {criarRouterAutenticacaoCheckoutStaging}=require('../src/routes/autenticacao-checkout-staging');
const SENHA='ExemploDeSenhaSeguraFicticia2026!';
function item(id){
 return {id,nome:'PDF ficticio '+id,tipo:'PDF',estado:'PUBLICADO',
  descricao:'Item ficticio nao comercializado',precoCentavos:25000,
  entrega:'DOWNLOAD_APOS_CONFIRMACAO',fotos:[],detalhes:[],
  videoApresentacaoUrl:null};
}
async function preparar(t,{relogio}={}){
 const dir=mkdtempSync(path.join(tmpdir(),'loop-auth-checkout-'));
 const dbpath=path.join(dir,'clientes-staging.sqlite');
 const banco=new DatabaseSync(dbpath);
 banco.exec('PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;');
 const auth=new AutenticacaoCheckoutStagingSQLite({banco,agora:relogio});
 const intencoes=new IntencoesCheckoutSQLite({banco});
 const repo=new RepositorioCatalogoMemoria({produtos:[item('curso-cotado-250')]});
 const a=await auth.provisionarConta({nomeLogin:'cliente-teste-a',senha:SENHA});
 const b=await auth.provisionarConta({nomeLogin:'cliente-teste-b',senha:SENHA});
 const app=express();app.use(express.json({limit:'32kb'}));
 app.use('/staging',criarRouterAutenticacaoCheckoutStaging({autenticacao:auth}));
 app.use('/staging',criarRouterRascunhosCheckoutStaging({
  repositorioCatalogo:repo,intencoes,
  identificarTitular:req=>auth.identificarTitular(req),
  autorizarMutacao:req=>auth.autorizarMutacao(req)
 }));
 const servidor=app.listen(0,'127.0.0.1');await once(servidor,'listening');
 const base='http://127.0.0.1:'+servidor.address().port+'/staging';
 t.after(async()=>{
  await new Promise(resolve=>servidor.close(resolve));
  banco.close();rmSync(dir,{force:true,recursive:true});
 });
 async function http(rota,{method='GET',body,cookie,csrf,key='chave-teste-rastreavel-000001',origin}={}){
  const cabecalhos={'Content-Type':'application/json',
   ...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-Checkout-Csrf':csrf}:{}),
   ...(key?{'Idempotency-Key':key}:{}),...(origin?{Origin:origin}:{})};
  const res=await fetch(base+rota,{method,headers:cabecalhos,
   ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const dados=await res.json();
  return {status:res.status,dados,cookie:res.headers.get('set-cookie')};
 }
 return {banco,auth,intencoes,dbpath,base,http,a,b};
}
test('login com scrypt, cookie HttpOnly, CSRF e rascunho isolado por titular',async t=>{
 const s=await preparar(t);
 const login=await s.http('/entrar',{method:'POST',body:{nomeLogin:'cliente-teste-a',senha:SENHA}});
 assert.equal(login.status,200,JSON.stringify(login.dados));
 assert.equal(login.dados.titularId,s.a.titularId);
 assert.ok(login.cookie.includes('HttpOnly'));
 assert.ok(login.cookie.includes('SameSite=Strict'));
 assert.ok(login.cookie.includes('Path=/staging'));
 assert.ok(!login.cookie.includes(SENHA));
 const tokenCookie=login.cookie.split(';')[0];
 const sessao=await s.http('/sessao',{cookie:tokenCookie});
 assert.equal(sessao.status,200);
 assert.equal(sessao.dados.csrf,login.dados.csrf);
 const pedido={itens:[{produtoId:'curso-cotado-250',quantidade:1}]};
 const negado=await s.http('/rascunhos',{method:'POST',cookie:tokenCookie,body:pedido});
 assert.equal(negado.status,403,'CSRF ausente impede mutacao');
 const criado=await s.http('/rascunhos',{method:'POST',cookie:tokenCookie,
  csrf:login.dados.csrf,body:pedido});
 assert.equal(criado.status,201,JSON.stringify(criado.dados));
 assert.equal(criado.dados.intencao.totalCentavos,25000);
 assert.equal(criado.dados.intencao.pagamentoIniciado,false);
 assert.equal(criado.dados.intencao.posicoesCriadas,0);
 const replay=await s.http('/rascunhos',{method:'POST',cookie:tokenCookie,
  csrf:login.dados.csrf,body:pedido});
 assert.equal(replay.status,200);
 assert.equal(replay.dados.intencao.pedidoId,criado.dados.intencao.pedidoId);
 const entrarB=await s.http('/entrar',{method:'POST',body:{nomeLogin:'cliente-teste-b',senha:SENHA}});
 assert.equal(entrarB.status,200);
 const cookieB=entrarB.cookie.split(';')[0];
 const consultaB=await s.http('/rascunhos/'+criado.dados.intencao.pedidoId,{cookie:cookieB});
 assert.equal(consultaB.status,404,'Nao revelar pedidos de outro titular');
 assert.deepEqual((await s.http('/rascunhos',{cookie:cookieB})).dados.intencoes,[]);
 const sairSemCsrf=await s.http('/sair',{method:'POST',cookie:tokenCookie});
 assert.equal(sairSemCsrf.status,403);
 const sair=await s.http('/sair',{method:'POST',cookie:tokenCookie,csrf:login.dados.csrf});
 assert.equal(sair.status,200);
 assert.equal(sair.dados.sessaoEncerrada,true);
 assert.ok(sair.cookie.includes('Max-Age=0'));
 assert.equal((await s.http('/sessao',{cookie:tokenCookie})).status,401);
 assert.equal((await s.http('/rascunhos',{cookie:tokenCookie})).status,401);
 assert.equal(s.banco.prepare('SELECT COUNT(*) AS n FROM akitemm_checkout_intencoes_preparacao').get().n,1);
 assert.equal(s.banco.prepare('SELECT COUNT(*) AS n FROM akitemm_checkout_staging_sessoes').get().n,1);
 assert.equal(s.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(s.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('senha nao aparece no SQLite, login inexistente generic, bloqueio por cinco tentativas',async t=>{
 let agora=2000000000000;
 const s=await preparar(t,{relogio:()=>agora});
 assert.equal(s.banco.prepare('SELECT COUNT(*) n FROM akitemm_checkout_staging_contas WHERE senha_hash=?').get(SENHA).n,0);
 const inexistente=await s.http('/entrar',{method:'POST',body:{nomeLogin:'cliente-absente',senha:SENHA}});
 assert.equal(inexistente.status,401);
 assert.equal(inexistente.dados.erro,'CREDENCIAIS_INVALIDAS');
 for(let i=0;i<5;i++){
  const errado=await s.http('/entrar',{method:'POST',
   body:{nomeLogin:'cliente-teste-a',senha:'senha-incorreta-ficticia-2026'}});
  assert.equal(errado.status,401);
 }
 const correta=await s.http('/entrar',{method:'POST',body:{nomeLogin:'cliente-teste-a',senha:SENHA}});
 assert.equal(correta.status,429);
 agora+=900001;
 const destravada=await s.http('/entrar',{method:'POST',body:{nomeLogin:'cliente-teste-a',senha:SENHA}});
 assert.equal(destravada.status,200);
 const sessao=s.banco.prepare('SELECT token_hash FROM akitemm_checkout_staging_sessoes').get();
 assert.match(sessao.token_hash,/^[a-f0-9]{64}$/);
 assert.notEqual(sessao.token_hash,destravada.cookie.split(';')[0].split('=')[1]);
});
test('sessao sobrevive reinicio do modulo SQLite e expira sem habilitar pedido publico',async t=>{
 let tempo=2100000000000;
 const s=await preparar(t,{relogio:()=>tempo});
 const login=await s.http('/entrar',{method:'POST',body:{nomeLogin:'cliente-teste-a',senha:SENHA}});
 const cookie=login.cookie.split(';')[0];
 const outro=new DatabaseSync(s.dbpath);
 const novaAutenticacao=new AutenticacaoCheckoutStagingSQLite({banco:outro,agora:()=>tempo});
 const req={get:n=>n==='cookie'?cookie:undefined};
 assert.equal(novaAutenticacao.identificarTitular(req),s.a.titularId);
 assert.equal(novaAutenticacao.sessao(req).csrf,login.dados.csrf);
 tempo+=3600000;
 assert.equal(novaAutenticacao.identificarTitular(req),null);
 assert.equal((await s.http('/sessao',{cookie})).status,401);
 outro.close();
 const publico=require('../src/server');
 const servidor=publico.listen(0,'127.0.0.1');await once(servidor,'listening');
 t.after(()=>new Promise(resolve=>servidor.close(resolve)));
 const root='http://127.0.0.1:'+servidor.address().port;
 assert.equal((await fetch(root+'/api/checkout/entrar',{method:'POST'})).status,503);
 assert.equal((await fetch(root+'/staging/entrar',{method:'POST'})).status,404);
 assert.equal((await fetch(root+'/health/ready')).status,503);
});
test('staging rejeita Origin externo, login sem JSON e spoofing de identidade',async t=>{
 const s=await preparar(t);
 const body={nomeLogin:'cliente-teste-a',senha:SENHA};
 const badOrigin=await s.http('/entrar',{method:'POST',body,origin:'https://terceiro.invalid'});
 assert.equal(badOrigin.status,403);
 const login=await s.http('/entrar',{method:'POST',body});
 assert.equal(login.status,200);
 const pedido={itens:[{produtoId:'curso-cotado-250',quantidade:1}]};
 const tentativa=await s.http('/rascunhos',{method:'POST',cookie:login.cookie.split(';')[0],
  csrf:login.dados.csrf,body:{...pedido,titularId:s.b.titularId}});
 assert.equal(tentativa.status,400);
 assert.equal(s.banco.prepare('SELECT COUNT(*) n FROM akitemm_checkout_intencoes_preparacao').get().n,0);
});
