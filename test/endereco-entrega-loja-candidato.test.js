'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {once}=require('node:events');
const {criarAppLojaEscritorioCandidato}=
 require('../src/candidato/servidor-loja-escritorio-candidato');
const {RepositorioCatalogoMemoria}=
 require('../src/domain/repositorio-catalogo-memoria');
const {validarProduto}=require('../src/domain/catalogo');
const {EnderecoEntregaEnsaioSQLite}=
 require('../src/domain/endereco-entrega-ensaio-sqlite');
const {COOKIE}=require('../src/domain/conta-unica-candidata-sqlite');
const endereco={
 destinatario:'Lucia Exemplo',cep:'01310-100',logradouro:'Rua de Laboratorio',
 numero:'101',complemento:'Apto 23',bairro:'Centro',cidade:'Sao Paulo',
 uf:'SP',telefone:'11987654321',referencia:'Edificio de ensaio'
};
const produto=validarProduto({
 id:'kit-teste-fisico',nome:'Kit simulado de laboratorio',tipo:'FISICO',
 estado:'PUBLICADO',descricao:'Sem envio, frete ou cobrança real.',
 precoCentavos:25000,entrega:'FORNECEDOR_INTEGRADO',
 fotos:[],detalhes:[],videoApresentacaoUrl:null
});
const config=(db,keyA,keyB)=>({
 banco:db,chaveEmail:keyA,chaveCifra:keyB,
 repositorioCatalogo:new RepositorioCatalogoMemoria({produtos:[produto]}),
 segredoOperador:'operador-testes-endereco-'+('Z'.repeat(48)),
 termosVersao:'LAB-endereco-nov26',
 termosTexto:'Enderecos sao ficticios e servem somente para homologacao sem pagamentos, expedição ou entregas reais.'
});
async function iniciar(app,t){
 const s=app.listen(0,'127.0.0.1');await once(s,'listening');
 t.after(()=>new Promise(ok=>s.close(ok)));
 return 'http://127.0.0.1:'+s.address().port;
}
async function json(base,rota,method,body,{cookie,csrf,key,extra={}}={}){
 const res=await fetch(base+rota,{
  method,headers:{
   ...(cookie?{Cookie:COOKIE+'='+cookie}:{}),
   ...(csrf?{'X-Checkout-Csrf':csrf}:{}),
   ...(body?{'Content-Type':'application/json','X-LOOP-LAB':'participante'}:{}),
   ...(key?{'Idempotency-Key':key}:{}),...extra
  },...(body?{body:JSON.stringify(body)}:{})
 });
 return {status:res.status,body:await res.json(),headers:res.headers};
}
async function conta(base,nick){
 let r=await json(base,'/staging/contas/cadastrar','POST',{
  nome:nick+' Exemplo',nick,email:nick.toLowerCase()+'@example.invalid',
  senha:'SenhaFicticiaTeste2026!',aceiteExplicito:true
 });
 assert.equal(r.status,201,JSON.stringify(r.body));
 r=await json(base,'/staging/contas/entrar','POST',{
  nick,senha:'SenhaFicticiaTeste2026!'
 });
 assert.equal(r.status,200,JSON.stringify(r.body));
 const cookie=r.headers.getSetCookie().join(';')
  .match(new RegExp(COOKIE+'=([a-f0-9]{64})'))?.[1];
 assert.ok(cookie);return {cookie,csrf:r.body.csrf,titularId:r.body.titularId};
}
test('cadastro de frete: salvar e consultar real no mesmo SQLite cifrado e isolado',async t=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 t.after(()=>db.close());
 const a=randomBytes(32),b=randomBytes(32);
 const app=criarAppLojaEscritorioCandidato(config(db,a,b)).app;
 const base=await iniciar(app,t);
 const alice=await conta(base,'Alicia'),bob=await conta(base,'Bruno');
 const rota='/staging/vitrine/loja/entrega';
 assert.equal((await json(base,rota,'GET')).status,401);
 assert.equal((await json(base,rota,'POST',endereco,
  {cookie:alice.cookie})).status,403,'CSRF obrigatório');
 const primeira=await json(base,rota,'POST',endereco,
  {cookie:alice.cookie,csrf:alice.csrf});
 assert.equal(primeira.status,200,JSON.stringify(primeira.body));
 assert.deepEqual(primeira.body.entrega,endereco);
 assert.equal(primeira.body.semEntregaReal,true);
 assert.equal(primeira.body.freteCalculado,false);
 assert.equal((await json(base,rota,'GET',undefined,{cookie:alice.cookie})).body.entrega.telefone,
  endereco.telefone);
 assert.equal((await json(base,rota,'GET',undefined,{cookie:bob.cookie})).body.entrega,null);
 assert.equal((await json(base,rota,'POST',{...endereco,uf:'XX'},
  {cookie:alice.cookie,csrf:alice.csrf})).status,400);
 const raw=db.prepare('SELECT * FROM loop_endereco_ensaio_titular').all();
 assert.equal(raw.length,1);
 assert.ok(!JSON.stringify(raw).includes('Rua de Laboratorio'));
 assert.ok(!JSON.stringify(raw).includes('11987654321'));
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 const e=new EnderecoEntregaEnsaioSQLite({banco:db,chaveCifra:b});
 assert.deepEqual(e.consultar(alice.titularId).entrega,endereco);
 assert.equal(e.consultarPrepedido({titularId:bob.titularId,
  prepedidoId:'hom-00000000-0000-4000-8000-000000000001'}),null);
});
test('prepedido físico exige endereco e preserva fotografia de frete no MESMO commit',async t=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 t.after(()=>db.close());
 const a=randomBytes(32),b=randomBytes(32);
 const app=criarAppLojaEscritorioCandidato(config(db,a,b)).app;
 const base=await iniciar(app,t);
 const alice=await conta(base,'Livia');
 const ruta='/staging/vitrine/loja/pedidos';
 const key='fisico-ensaio-idempotente-001';
 const body={itens:[{produtoId:produto.id,quantidade:1}]};
 const negado=await json(base,ruta,'POST',body,{cookie:alice.cookie,csrf:alice.csrf,key});
 assert.equal(negado.status,400,JSON.stringify(negado.body));
 assert.equal(negado.body.erro,'ENDERECO_OBRIGATORIO_PRODUTO_FISICO');
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_checkout_prepedidos_staging').get().n,0);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_vitrine_fotografia_classificacao_prepedido').get().n,0);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM loop_endereco_ensaio_prepedido').get().n,0);
 const salvo=await json(base,'/staging/vitrine/loja/entrega','POST',endereco,
  {cookie:alice.cookie,csrf:alice.csrf});
 assert.equal(salvo.status,200);
 const criado=await json(base,ruta,'POST',body,{cookie:alice.cookie,csrf:alice.csrf,key});
 assert.equal(criado.status,201,JSON.stringify(criado.body));
 const pedidoId=criado.body.pedido.pedidoId;
 const e=new EnderecoEntregaEnsaioSQLite({banco:db,chaveCifra:b});
 assert.deepEqual(e.consultarPrepedido({titularId:alice.titularId,prepedidoId:pedidoId}).endereco,endereco);
 const segundo={...endereco,numero:'999'};
 assert.equal((await json(base,'/staging/vitrine/loja/entrega','POST',segundo,
  {cookie:alice.cookie,csrf:alice.csrf})).status,200);
 assert.deepEqual(e.consultarPrepedido({titularId:alice.titularId,prepedidoId:pedidoId}).endereco,endereco,
  'foto de endereco antiga nao pode mudar ao atualizar perfil');
 const repetido=await json(base,ruta,'POST',body,{cookie:alice.cookie,csrf:alice.csrf,key});
 assert.equal(repetido.status,200,JSON.stringify(repetido.body));
 assert.equal(repetido.body.pedido.pedidoId,pedidoId);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM loop_endereco_ensaio_prepedido').get().n,1);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM akitemm_vitrine_fotografia_classificacao_prepedido').get().n,1);
 assert.throws(()=>db.exec('DELETE FROM loop_endereco_ensaio_prepedido'),/imutavel/);
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
