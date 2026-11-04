'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {once}=require('node:events'),{randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=
 require('../src/laboratorio/servidor-checkout-staging-local');
const {COOKIE}=require('../src/domain/conta-unica-candidata-sqlite');
const ADMIN='vitrine-operador-'+('Z'.repeat(48)),SENHA='SenhaApenasParaVitrine2026!';
test('vitrine aprovada usa mesmo catálogo SQLite e Meus Pedidos, sem financeiro',async t=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 const {app,catalogo,sinalizacaoVitrine}=criarAppLojaEscritorioCandidato({
  banco:db,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),segredoOperador:ADMIN,
  termosVersao:'LAB-vitrine-aprovada-2026',
  termosTexto:'Ensaio da vitrine aprovada sem vendas, saques, giros, bônus ou posições reais.'
 });
 assert.equal(sinalizacaoVitrine.db,db);assert.equal(catalogo.db,db);
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(ok=>server.close(ok));db.close()});
 const base='http://127.0.0.1:'+server.address().port;
 const get=async(rota,{method='GET',cookie,csrf,admin=false,body,key,headerLab=false}={})=>{
  const r=await fetch(base+rota,{method,redirect:'manual',
   headers:{...(cookie?{Cookie:COOKIE+'='+cookie}:{}),
    ...(csrf?{'X-Checkout-Csrf':csrf}:{}),
    ...(admin?{Authorization:'Bearer '+ADMIN}:{}),
    ...(key?{'Idempotency-Key':key}:{}),
    ...(headerLab?{'X-LOOP-LAB':'participante'}:{}),
    ...(body?{'Content-Type':'application/json'}:{})
   },...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,body:await r.text(),headers:r.headers};
 };
 const json=async(rota,args)=>{const r=await get(rota,args);return {...r,json:JSON.parse(r.body)};};
 assert.equal((await get('/staging/loja')).status,302);
 const register=async nick=>{
  const cad=await json('/staging/contas/cadastrar',{method:'POST',body:{
   nome:'Cliente '+nick,nick,email:nick.toLowerCase()+'@example.invalid',
   senha:SENHA,aceiteExplicito:true}});
  assert.equal(cad.status,201,JSON.stringify(cad.json));
  const enter=await json('/staging/contas/entrar',{method:'POST',
   body:{nick,senha:SENHA}});
  assert.equal(enter.status,200);
  return {cookie:enter.headers.get('set-cookie').match(
   new RegExp(COOKIE+'=([a-f0-9]{64})'))[1],csrf:enter.json.csrf};
 };
 const ana=await register('Ana'),bia=await register('Bia');
 const html=await get('/staging/loja',{cookie:ana.cookie});
 assert.equal(html.status,200);
 for(const s of ['akitemm-grade-pagina','akitemm-legenda-cores',
  'akitemmFiltroTodos','catalogoLojaLoop','registrarPedidoLoja',
  '/staging/assets/loja-aprovada.js','Compra comum (sem LOOP)'])
  assert.ok(html.body.includes(s),'interface aprovada: '+s);
 assert.ok(!html.body.includes('src="/laboratorio/loja.js"'));
 const s=await get('/staging/assets/loja-aprovada.js');
 assert.equal(s.status,200);assert.doesNotThrow(()=>new Function(s.body));
 assert.ok(s.body.includes("p.classeVisual==='EVENTO'"));
 assert.ok(s.body.includes("X-Checkout-Csrf"));
 const catalog='/api/laboratorio/participante/loja/catalogo';
 assert.equal((await json(catalog)).status,401);
 const inicial=await json(catalog,{cookie:ana.cookie});
 assert.equal(inicial.status,200);
 assert.equal(inicial.json.produtos.length,1);
 assert.equal(inicial.json.produtos[0].classeVisual,'CINZA');
 assert.equal(inicial.json.produtos[0].elegivelLoop,false);
 assert.equal(inicial.json.conviteLoopCheckoutAtivo,false);
 assert.equal(inicial.json.posicoesReais,0);
 const admin='/staging/escritorio-unificado/sinalizacao/curso-homologacao-250';
 assert.equal((await json(admin)).status,401);
 assert.equal((await json(admin,{method:'PATCH',body:{
  classificacao:'VERDE',quantidadeMinimaLoop:2,revisaoEsperada:0}})).status,401);
 const verde=await json(admin,{method:'PATCH',admin:true,body:{
  classificacao:'VERDE',quantidadeMinimaLoop:2,revisaoEsperada:0}});
 assert.equal(verde.status,200,JSON.stringify(verde.json));
 assert.equal(verde.json.revisao,1);
 assert.equal((await json(admin,{method:'PATCH',admin:true,body:{
  classificacao:'CINZA',quantidadeMinimaLoop:1,revisaoEsperada:0}})).status,409);
 assert.equal((await json(admin,{method:'PATCH',admin:true,body:{
  classificacao:'EVENTO',quantidadeMinimaLoop:0,revisaoEsperada:1}})).status,400);
 assert.equal((await json(admin,{method:'PATCH',admin:true,body:{
  classificacao:'EVENTO',quantidadeMinimaLoop:1,revisaoEsperada:1,eventoId:'evento_enganoso'}})).status,400);
 const verdeLoja=await json(catalog,{cookie:ana.cookie});
 assert.equal(verdeLoja.json.produtos[0].classeVisual,'VERDE');
 assert.equal(verdeLoja.json.produtos[0].quantidadeMinimaLoop,2);
 assert.equal(verdeLoja.json.produtos[0].posicoesPorPedidoLoop,0);
 const evento=await json(admin,{method:'PATCH',admin:true,body:{
  classificacao:'EVENTO',quantidadeMinimaLoop:1,revisaoEsperada:1}});
 assert.equal(evento.status,200);
 const eventoLoja=await json(catalog,{cookie:ana.cookie});
 assert.equal(eventoLoja.json.produtos[0].classeVisual,'EVENTO');
 assert.equal(eventoLoja.json.produtos[0].eventoId,null);
 assert.equal(eventoLoja.json.produtos[0].posicoesPorPedidoLoop,0);
 assert.equal((await json(admin+'/historico',{admin:true})).json.historico.length,2);
 assert.equal((await json('/api/laboratorio/participante/minha-conta',{cookie:ana.cookie})).json.csrf,ana.csrf);
 const rota='/api/laboratorio/participante/loja/pedidos';
 const pedido={itens:[{produtoId:'curso-homologacao-250',quantidade:2}]};
 const options={cookie:ana.cookie,csrf:ana.csrf,headerLab:true,
  method:'POST',key:'vitrine-prepedido-idempotente-001',body:pedido};
 assert.equal((await json(rota,{...options,csrf:null})).status,403);
 assert.equal((await json(rota,{...options,headerLab:false})).status,403);
 assert.equal((await json(rota,{...options,key:null})).status,400);
 assert.equal((await json(rota,{...options,body:{...pedido,participarLoop:true}})).status,400);
 const primeiro=await json(rota,options);
 assert.equal(primeiro.status,201,JSON.stringify(primeiro.json));
 const duplicado=await json(rota,options);
 assert.equal(duplicado.status,200);
 assert.equal(duplicado.json.pedido.pedidoId,primeiro.json.pedido.pedidoId);
 assert.equal(duplicado.json.pagamentoReal,false);
 assert.equal(duplicado.json.posicoesCriadas,0);
 const meus=await json(rota,{cookie:ana.cookie});
 const outros=await json(rota,{cookie:bia.cookie});
 assert.equal(meus.status,200);assert.equal(meus.json.pedidos.length,1);
 assert.equal(meus.json.pedidos[0].totalCentavos,50000);
 assert.equal(outros.json.pedidos.length,0);
 const painelCliente=await json('/staging/meus-pedidos',{cookie:ana.cookie});
 assert.equal(painelCliente.json.pedidos.length,1);
 assert.equal(painelCliente.json.pedidos[0].prepedidoId,primeiro.json.pedido.pedidoId);
 const atualizar=await json('/staging/escritorio-unificado/produtos/curso-homologacao-250',{
  method:'PATCH',admin:true,body:{
   revisaoEsperada:0,alteracoes:{precoCentavos:30000}
  }});
 assert.equal(atualizar.status,200);
 const novaLoja=await json(catalog,{cookie:ana.cookie});
 assert.equal(novaLoja.json.produtos[0].precoCentavos,30000);
 const depois=await json(rota,{cookie:ana.cookie});
 assert.equal(depois.json.pedidos[0].totalCentavos,50000);
 const novo=await json(rota,{...options,key:'vitrine-prepedido-idempotente-002'});
 assert.equal(novo.status,201,JSON.stringify(novo.json));
 assert.equal(novo.json.pedido.totalCentavos,60000);
 assert.equal((await json(rota,{...options,key:'vitrine-prepedido-idempotente-002',
  body:{itens:[{produtoId:'curso-homologacao-250',quantidade:1}]}})).status,409);
 assert.equal((await json('/staging/checkout/finalizar',{method:'POST',body:{}})).status,503);
 assert.equal((await json('/api/laboratorio/participante/loja/entrega',
  {method:'POST',cookie:ana.cookie,body:{}})).status,409);
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('vitrine em produção é proibida, inclusive sinalização',()=>{
 const {SinalizacaoVitrineCandidatoSQLite}=require('../src/domain/sinalizacao-vitrine-candidato-sqlite');
 const old=process.env.NODE_ENV;process.env.NODE_ENV='production';
 try{assert.throws(()=>new SinalizacaoVitrineCandidatoSQLite(),/SINALIZACAO_LAB_PROIBIDA_PRODUCAO/);}
 finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;}
});
