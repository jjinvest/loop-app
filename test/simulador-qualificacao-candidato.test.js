'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto'),{once}=require('node:events');
const {criarAppLojaEscritorioCandidato}=require('../src/candidato/servidor-loja-escritorio-candidato');
const {catalogoFicticioCheckout}=require('../src/laboratorio/servidor-checkout-staging-local');
const {COOKIE}=require('../src/domain/conta-unica-candidata-sqlite');
const TOKEN='segredo-operador-simulacao-'+('Y'.repeat(48));
test('regra verde, quantidade, referencia e evento pendente: simulacao apenas informativa',async t=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 const {app,catalogo,sinalizacaoVitrine,contas}=criarAppLojaEscritorioCandidato({
  banco:db,repositorioCatalogo:catalogoFicticioCheckout(),
  chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),segredoOperador:TOKEN,
  termosVersao:'LAB-simulador-2026',
  termosTexto:'Laboratório técnico sem vendas, posições, giros, bônus ou saques reais.'
 });
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(ok=>server.close(ok));db.close()});
 const url='http://127.0.0.1:'+server.address().port;
 async function request(path,{method='POST',body,admin=false,cookie=null,csrf=null,lab=false}={}){
  const res=await fetch(url+path,{method,headers:{
   ...(admin?{Authorization:'Bearer '+TOKEN}:{}),
   ...(cookie?{Cookie:COOKIE+'='+cookie}:{}),
   ...(csrf?{'X-Checkout-Csrf':csrf}:{}),
   ...(lab?{'X-LOOP-LAB':'participante'}:{}),
   ...(body?{'Content-Type':'application/json'}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  return {status:res.status,data:await res.json().catch(()=>({}))};
 }
 const senha='SenhaFicticiaDeTeste2026!';
 const cad=await request('/staging/contas/cadastrar',{body:{
  nome:'Cliente de Ensaio',nick:'Carlos',email:'carlos@example.invalid',senha,aceiteExplicito:true
 }});
 assert.equal(cad.status,201,JSON.stringify(cad.data));
 const login=await fetch(url+'/staging/contas/entrar',{method:'POST',
  headers:{'Content-Type':'application/json'},body:JSON.stringify({nick:'Carlos',senha})});
 assert.equal(login.status,200);
 const loginData=await login.json();
 const cookie=login.headers.get('set-cookie').match(
  new RegExp(COOKIE+'=([a-f0-9]{64})'))[1];
 const cliente='/staging/vitrine/simular-qualificacao';
 const operador='/staging/escritorio-unificado/simular-qualificacao';
 const entrada=(produtoId,quantidade)=>({itens:[{produtoId,quantidade}]});
 const base=entrada('curso-homologacao-250',1);
 assert.equal((await request(cliente,{body:base})).status,401);
 assert.equal((await request(cliente,{body:base,cookie})).status,403);
 assert.equal((await request(cliente,{body:base,cookie,csrf:loginData.csrf})).status,403);
 assert.equal((await request(operador,{body:base})).status,401);
 const args={body:base,cookie,csrf:loginData.csrf,lab:true};
 let r=await request(cliente,args);
 assert.equal(r.status,200,JSON.stringify(r.data));
 assert.equal(r.data.status,'SEM_PRODUTO_VERDE_APTO');
 assert.equal(r.data.referenciaAtingida,false);
 assert.equal(r.data.totalPedidoCentavos,25000);
 assert.equal(r.data.valorVerdeConsideradoCentavos,0);
 assert.equal(r.data.posicoesCriadas,0);
 assert.equal(r.data.pagamentosCriados,0);
 assert.equal(r.data.saquesCriados,0);
 assert.equal(r.data.autorizacaoReal,false);
 const cinza=await request(operador,{body:base,admin:true});
 assert.equal(cinza.status,200);assert.equal(cinza.data.status,r.data.status);
 await sinalizacaoVitrine.atualizar('curso-homologacao-250',{
  classificacao:'VERDE',quantidadeMinimaLoop:2,revisaoEsperada:0});
 r=await request(cliente,args);
 assert.equal(r.status,200);
 assert.equal(r.data.status,'QUANTIDADE_MINIMA_PENDENTE');
 assert.equal(r.data.itens[0].situacao,'QUANTIDADE_MINIMA_NAO_ATINGIDA');
 assert.equal(r.data.valorVerdeConsideradoCentavos,0);
 r=await request(cliente,{...args,body:entrada('curso-homologacao-250',2)});
 assert.equal(r.status,200);
 assert.equal(r.data.status,'REFERENCIA_VERDE_ATINGIDA_EM_SIMULACAO');
 assert.equal(r.data.referenciaAtingida,true);
 assert.equal(r.data.valorVerdeConsideradoCentavos,50000);
 assert.equal(r.data.posicoesCriadas,0);
 await sinalizacaoVitrine.atualizar('curso-homologacao-250',{
  classificacao:'EVENTO',quantidadeMinimaLoop:1,revisaoEsperada:1});
 r=await request(cliente,{...args,body:entrada('curso-homologacao-250',2)});
 assert.equal(r.status,200);
 assert.equal(r.data.status,'EVENTO_PENDENTE_DE_APROVACAO');
 assert.equal(r.data.eventoPendente,true);
 assert.equal(r.data.valorVerdeConsideradoCentavos,0);
 assert.equal(r.data.referenciaAtingida,false);
 assert.equal(sinalizacaoVitrine.decorar(
  await catalogo.buscar('curso-homologacao-250')).elegivelLoop,false);
 const exemplar={
  id:'produto-verde-lab',nome:'Produto verde de ensaio',tipo:'PDF',
  estado:'PUBLICADO',descricao:'Material digital fictício.',
  precoCentavos:5000,entrega:'DOWNLOAD_APOS_CONFIRMACAO',
  fotos:[],detalhes:[],videoApresentacaoUrl:null
 };
 await catalogo.criar({produto:exemplar,chaveIdempotencia:'chave-produto-verde-simulacao-2026'});
 await sinalizacaoVitrine.atualizar(exemplar.id,{
  classificacao:'VERDE',quantidadeMinimaLoop:2,revisaoEsperada:0});
 r=await request(cliente,{...args,body:entrada(exemplar.id,2)});
 assert.equal(r.status,200);
 assert.equal(r.data.valorVerdeConsideradoCentavos,10000);
 assert.equal(r.data.faltamCentavos,15000);
 assert.equal(r.data.status,'VALOR_VERDE_INSUFICIENTE');
 r=await request(cliente,{...args,body:entrada(exemplar.id,5)});
 assert.equal(r.status,200);
 assert.equal(r.data.status,'REFERENCIA_VERDE_ATINGIDA_EM_SIMULACAO');
 assert.equal(r.data.totalPedidoCentavos,25000);
 const misto={itens:[
  {produtoId:exemplar.id,quantidade:3},
  {produtoId:'curso-homologacao-250',quantidade:1}
 ]};
 r=await request(cliente,{...args,body:misto});
 assert.equal(r.status,200);
 assert.equal(r.data.totalPedidoCentavos,40000);
 assert.equal(r.data.valorVerdeConsideradoCentavos,15000);
 assert.equal(r.data.status,'EVENTO_PENDENTE_DE_APROVACAO');
 assert.equal(r.data.posicoesCriadas,0);
 assert.equal((await request(cliente,{...args,body:entrada(exemplar.id,51)})).status,400);
 assert.equal((await request(cliente,{...args,body:{
  itens:[{produtoId:exemplar.id,quantidade:1},{produtoId:exemplar.id,quantidade:2}]
 }})).status,400);
 assert.equal((await request(cliente,{...args,body:{...base,participarLoop:true}})).status,400);
 assert.equal((await request(cliente,{...args,body:entrada('produto-inexistente',1)})).status,404);
 assert.equal((await request('/staging/checkout/finalizar',{body:{}})).status,503);
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_checkout_prepedidos_staging').get().n,0);
});
test('simulador rejeita execução em produção sem motor comercial',async()=>{
 const {simularQualificacaoCandidato}=require('../src/domain/simulador-qualificacao-carrinho-candidato');
 const old=process.env.NODE_ENV;process.env.NODE_ENV='production';
 try{
  await assert.rejects(simularQualificacaoCandidato({}),/SIMULADOR_NAO_HOMOLOGADO/);
 }finally{
  if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;
 }
});
