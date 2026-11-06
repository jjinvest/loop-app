'use strict';
// Jornada isolada real por HTTP: cotacao -> login -> rascunho -> prepedido.
// PSP e motor LOOP AUSENTES; rotas nao expostas no servidor publico.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const express=require('express');
const {RepositorioCatalogoMemoria}=require('../src/domain/repositorio-catalogo-memoria');
const {IntencoesCheckoutSQLite}=require('../src/domain/intencoes-checkout-sqlite');
const {PrePedidosCheckoutStagingSQLite}=require('../src/domain/prepedidos-checkout-staging-sqlite');
const {AutenticacaoCheckoutStagingSQLite}=require('../src/domain/autenticacao-checkout-staging-sqlite');
const {criarRouterAutenticacaoCheckoutStaging}=require('../src/routes/autenticacao-checkout-staging');
const {criarRouterRascunhosCheckoutStaging}=require('../src/routes/rascunhos-checkout-staging');
const {criarRouterPrePedidosCheckoutStaging}=require('../src/routes/prepedidos-checkout-staging');
const SENHA='senhaSomenteParaLaboratorio-2026!';
function produto(id,valor){
 return {id,nome:'Curso ficticio '+id,tipo:'PDF',estado:'PUBLICADO',
  descricao:'Produto ficticio do staging',precoCentavos:valor,
  entrega:'DOWNLOAD_APOS_CONFIRMACAO',fotos:[],detalhes:[],videoApresentacaoUrl:null};
}
async function montar(t){
 const dir=mkdtempSync(path.join(tmpdir(),'loop-prepedido-'));
 const arquivo=path.join(dir,'staging.sqlite');
 const banco=new DatabaseSync(arquivo);
 banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;');
 const repo=new RepositorioCatalogoMemoria({produtos:[
  produto('curso-homologacao-250',25000),produto('curso-homologacao-100',10000)
 ]});
 const auth=new AutenticacaoCheckoutStagingSQLite({banco});
 const intencoes=new IntencoesCheckoutSQLite({banco});
 const prePedidos=new PrePedidosCheckoutStagingSQLite({banco});
 await auth.provisionarConta({nomeLogin:'titular-ensaio-a',senha:SENHA});
 await auth.provisionarConta({nomeLogin:'titular-ensaio-b',senha:SENHA});
 const app=express();app.use(express.json({limit:'32kb'}));
 app.use('/staging',criarRouterAutenticacaoCheckoutStaging({autenticacao:auth}));
 const identificarTitular=req=>auth.identificarTitular(req);
 const autorizarMutacao=req=>auth.autorizarMutacao(req);
 app.use('/staging',criarRouterRascunhosCheckoutStaging({
  repositorioCatalogo:repo,intencoes,identificarTitular,autorizarMutacao
 }));
 app.use('/staging',criarRouterPrePedidosCheckoutStaging({
  repositorioCatalogo:repo,prePedidos,identificarTitular,autorizarMutacao
 }));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(done=>server.close(done));
  banco.close();rmSync(dir,{force:true,recursive:true});
 });
 const base='http://127.0.0.1:'+server.address().port+'/staging';
 async function requisitar(rota,{method='GET',cookie,csrf,body,key,origin}={}){
  const resposta=await fetch(base+rota,{method,headers:{
   'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),
   ...(csrf?{'X-Checkout-Csrf':csrf}:{}),
   ...(key?{'Idempotency-Key':key}:{}),
   ...(origin?{Origin:origin}:{})
  },...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:resposta.status,body:await resposta.json(),
   cookie:resposta.headers.get('set-cookie')};
 }
 async function entrar(login){
  const r=await requisitar('/entrar',{method:'POST',
   body:{nomeLogin:login,senha:SENHA}});
  assert.equal(r.status,200,JSON.stringify(r.body));
  return {cookie:r.cookie.split(';')[0],csrf:r.body.csrf,titularId:r.body.titularId};
 }
 return {arquivo,banco,repo,prePedidos,auth,intencoes,base,requisitar,entrar};
}
test('staging integra conta -> rascunho -> prepedido unico, sem cobrança, com dono isolado',async t=>{
 const s=await montar(t);
 const a=await s.entrar('titular-ensaio-a'),b=await s.entrar('titular-ensaio-b');
 const dados={itens:[{produtoId:'curso-homologacao-250',quantidade:1}]};
 const rascunho=await s.requisitar('/rascunhos',{
  method:'POST',cookie:a.cookie,csrf:a.csrf,
  key:'chave-rastreavel-rascunho-01',body:dados
 });
 assert.equal(rascunho.status,201,JSON.stringify(rascunho.body));
 const rascunhoId=rascunho.body.intencao.pedidoId;
 const preparar=()=>s.requisitar('/prepedidos',{
  method:'POST',cookie:a.cookie,csrf:a.csrf,body:{rascunhoId}
 });
 const respostas=await Promise.all(Array.from({length:12},preparar));
 assert.equal(respostas.filter(x=>x.status===201).length,1,
  JSON.stringify(respostas.map(x=>x.body)));
 assert.equal(respostas.filter(x=>x.status===200).length,11);
 const ids=new Set(respostas.map(x=>x.body.prepedido.prepedidoId));
 assert.equal(ids.size,1);
 const p=respostas[0].body.prepedido;
 assert.match(p.prepedidoId,/^hom-[a-f0-9-]{36}$/);
 assert.equal(p.rascunhoId,rascunhoId);
 assert.equal(p.totalCentavos,25000);
 assert.equal(p.estado,'AGUARDANDO_HOMOLOGACAO_EXTERNA');
 for(const k of ['pedidoComercialCriado','pagamentoIniciado','precoReservado',
  'checkoutHabilitado','contabilizacaoFinanceira','prontoParaAsaas'])
  assert.equal(p[k],false,k);
 assert.equal(p.posicoesCriadas,0);
 assert.deepEqual((await s.requisitar('/prepedidos',{cookie:b.cookie})).body.prepedidos,[]);
 assert.equal((await s.requisitar('/prepedidos/'+p.prepedidoId,{cookie:b.cookie})).status,404);
 assert.equal((await s.requisitar('/prepedidos/'+p.prepedidoId,{cookie:a.cookie})).status,200);
 const naoAutorizado=await s.requisitar('/prepedidos',{method:'POST',
  cookie:b.cookie,csrf:b.csrf,body:{rascunhoId}});
 assert.equal(naoAutorizado.status,404);
 assert.equal(s.banco.prepare('SELECT COUNT(*) n FROM akitemm_checkout_prepedidos_staging').get().n,1);
 assert.equal(s.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(s.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('preco ou produto mudado bloqueia nova transicao mas nao reescreve fotografia anterior',async t=>{
 const s=await montar(t),a=await s.entrar('titular-ensaio-a');
 const dados={itens:[{produtoId:'curso-homologacao-250',quantidade:1}]};
 const criar=async key=>s.requisitar('/rascunhos',{method:'POST',
  cookie:a.cookie,csrf:a.csrf,key,body:dados});
 const antes=await criar('chave-transicao-catalogo-00001');
 assert.equal(antes.status,201);
 s.repo.atualizar('curso-homologacao-250',{precoCentavos:30000});
 const tentativa=await s.requisitar('/prepedidos',{method:'POST',
  cookie:a.cookie,csrf:a.csrf,body:{rascunhoId:antes.body.intencao.pedidoId}});
 assert.equal(tentativa.status,409);
 assert.equal(tentativa.body.erro,'CATALOGO_ALTERADO_REFAZER_COTACAO');
 assert.equal(s.banco.prepare('SELECT COUNT(*) n FROM akitemm_checkout_prepedidos_staging').get().n,0);
 const nova=await criar('chave-transicao-catalogo-00002');
 assert.equal(nova.body.intencao.totalCentavos,30000);
 const feita=await s.requisitar('/prepedidos',{method:'POST',
  cookie:a.cookie,csrf:a.csrf,body:{rascunhoId:nova.body.intencao.pedidoId}});
 assert.equal(feita.status,201);
 assert.equal(feita.body.prepedido.totalCentavos,30000);
 s.repo.atualizar('curso-homologacao-250',{estado:'RASCUNHO'});
 const replay=await s.requisitar('/prepedidos',{method:'POST',
  cookie:a.cookie,csrf:a.csrf,body:{rascunhoId:nova.body.intencao.pedidoId}});
 assert.equal(replay.status,200);
 assert.equal(replay.body.prepedido.totalCentavos,30000);
 assert.equal(replay.body.prepedido.prepedidoId,feita.body.prepedido.prepedidoId);
 const antigo=await s.requisitar('/prepedidos',{method:'POST',
  cookie:a.cookie,csrf:a.csrf,body:{rascunhoId:antes.body.intencao.pedidoId}});
 assert.equal(antigo.status,409);
 assert.equal(s.banco.prepare('SELECT COUNT(*) n FROM akitemm_checkout_prepedidos_staging').get().n,1);
});
test('sem sessão ou CSRF não prepara nada, nem por origem remota ou entrada adulterada',async t=>{
 const s=await montar(t),a=await s.entrar('titular-ensaio-a');
 const rascunho=(await s.requisitar('/rascunhos',{method:'POST',
  cookie:a.cookie,csrf:a.csrf,key:'chave-para-bloqueios-00000001',
  body:{itens:[{produtoId:'curso-homologacao-250',quantidade:1}]}
 })).body.intencao.pedidoId;
 const body={rascunhoId:rascunho};
 assert.equal((await s.requisitar('/prepedidos',{method:'POST',body})).status,401);
 assert.equal((await s.requisitar('/prepedidos',{method:'POST',
  cookie:a.cookie,body})).status,403);
 assert.equal((await s.requisitar('/prepedidos',{method:'POST',
  cookie:a.cookie,csrf:a.csrf,origin:'https://site-externo.invalid',body})).status,403);
 assert.equal((await s.requisitar('/prepedidos',{method:'POST',
  cookie:a.cookie,csrf:a.csrf,body:{...body,precoCentavos:1}})).status,400);
 assert.equal((await s.requisitar('/prepedidos',{method:'POST',
  cookie:a.cookie,csrf:a.csrf,body:{rascunhoId:'pre-invalido'}})).status,404);
 assert.equal(s.banco.prepare('SELECT COUNT(*) n FROM akitemm_checkout_prepedidos_staging').get().n,0);
});
test('imutabilidade + reinicio SQLite preservam rascunho e prepedido sem dinheiro',async t=>{
 const s=await montar(t),a=await s.entrar('titular-ensaio-a');
 const r=await s.requisitar('/rascunhos',{method:'POST',cookie:a.cookie,
  csrf:a.csrf,key:'chave-reinicio-checkout-00001',
  body:{itens:[{produtoId:'curso-homologacao-250',quantidade:1}]}});
 const c=await s.requisitar('/prepedidos',{method:'POST',cookie:a.cookie,
  csrf:a.csrf,body:{rascunhoId:r.body.intencao.pedidoId}});
 assert.equal(c.status,201);
 const novo=new DatabaseSync(s.arquivo);
 novo.exec('PRAGMA foreign_keys=ON');
 const novoRepositorio=new PrePedidosCheckoutStagingSQLite({banco:novo});
 assert.deepEqual(novoRepositorio.consultar({
  titularId:a.titularId,prepedidoId:c.body.prepedido.prepedidoId
 }),c.body.prepedido);
 assert.throws(()=>novo.prepare(
  'UPDATE akitemm_checkout_prepedidos_staging SET total_centavos=1').run(),/prepedido imutavel/);
 assert.throws(()=>novo.prepare(
  'DELETE FROM akitemm_checkout_prepedidos_staging').run(),/prepedido imutavel/);
 assert.equal(novo.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 novo.close();
 const app=require('../src/server');const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(done=>server.close(done)));
 const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/api/checkout/prepedidos',{method:'POST'})).status,503);
 assert.equal((await fetch(base+'/staging/prepedidos',{method:'POST'})).status,404);
 assert.equal((await fetch(base+'/health/ready')).status,503);
});

test('Meus Pedidos pagina alem do antigo limite de trinta sem trocar titular',async t=>{
 const s=await montar(t);
 const a=await s.entrar('titular-ensaio-a');
 const b=await s.entrar('titular-ensaio-b');
 const entrada={itens:[{produtoId:'curso-homologacao-100',quantidade:1}]};
 const criados=[];
 for(let i=0;i<45;i++){
  const draft=await s.requisitar('/rascunhos',{
   method:'POST',cookie:a.cookie,csrf:a.csrf,
   key:'historico-cliente-'+String(i).padStart(4,'0'),
   body:entrada
  });
  assert.equal(draft.status,201,JSON.stringify(draft.body));
  const pedido=await s.requisitar('/prepedidos',{
   method:'POST',cookie:a.cookie,csrf:a.csrf,
   body:{rascunhoId:draft.body.intencao.pedidoId}
  });
  assert.equal(pedido.status,201,JSON.stringify(pedido.body));
  criados.push(pedido.body.prepedido.prepedidoId);
 }
 const consultar=async(cookie,query)=>s.requisitar('/meus-pedidos'+query,{cookie});
 const pag0=await consultar(a.cookie,'?pagina=0&tamanho=20');
 const pag1=await consultar(a.cookie,'?pagina=1&tamanho=20');
 const pag2=await consultar(a.cookie,'?pagina=2&tamanho=20');
 for(const p of [pag0,pag1,pag2])assert.equal(p.status,200,JSON.stringify(p.body));
 assert.deepEqual([pag0.body.pedidos.length,pag1.body.pedidos.length,
  pag2.body.pedidos.length],[20,20,5]);
 assert.equal(pag0.body.totalPedidos,45);
 assert.equal(pag2.body.paginacao.total,45);
 assert.equal(pag0.body.paginacao.haMais,true);
 assert.equal(pag2.body.paginacao.haMais,false);
 assert.equal(pag2.body.paginacao.haAnterior,true);
 const todos=[...pag0.body.pedidos,...pag1.body.pedidos,...pag2.body.pedidos];
 assert.equal(new Set(todos.map(p=>p.prepedidoId)).size,45);
 assert.deepEqual(new Set(todos.map(p=>p.prepedidoId)),new Set(criados));
 assert.deepEqual((await consultar(b.cookie,'?pagina=0&tamanho=20')).body.pedidos,[]);
 assert.equal((await consultar(a.cookie,'?pagina=-1')).status,400);
 assert.equal((await consultar(a.cookie,'?tamanho=51')).status,400);
 assert.equal((await consultar(a.cookie,'?pagina=1&pagina=2')).status,400);
 assert.equal((await consultar(a.cookie,'?campo=outro')).status,400);
 assert.equal((await consultar(null,'?pagina=0')).status,401);
 assert.deepEqual(s.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
