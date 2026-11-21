'use strict';
// Ponta a ponta no MESMO SQLite real (em memoria descartavel para CI).
// Carrinho interno nao executa checkout, PSP, catraca ou credito.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {once}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {IdentidadeClienteLoopReal}=require('../src/producao/identidade-cliente-loop-sqlite');
const {criarAppIdentidadeLoop}=require('../src/producao/servidor-identidade-loop');
const {CarrinhoInternoRealSQLite}=require('../src/producao/carrinho-interno-real-sqlite');
const {validarIdentidade}=require('../src/producao/backup-identidade-real');
const ORIGEM='https://carrinho-interno.example.invalid';
const TEXTO='Documentos versionados de ensaio descartavel para validar '+
 'isolamento de titularidade e persistencia de itens sem pagamento, pedido, '+
 'credito, bonus, saque ou giro de catraca; nenhum valor e movimentado.';

test('carrinho interno funciona, persiste e nao libera compra ou dados de outro titular',async t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON;');
 t.after(()=>banco.close());
 const contas=new IdentidadeClienteLoopReal({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),enviarEmail:async()=>true,
  termos:{versao:'LOOP-TERMOS-CARRINHO-2026',texto:TEXTO},
  privacidade:{versao:'LOOP-PRIV-CARRINHO-2026',texto:TEXTO}
 });
 const docs=contas.documentos();
 for(const [nick,email] of [['Alice','alice@example.invalid'],['Bruno','bruno@example.invalid']]){
  await contas.cadastrar({
   nome:'Pessoa de Teste',nick,email,senha:'SenhaDoCarrinho2026!',
   aceiteTermos:true,aceitePrivacidade:true,
   versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
   versaoPrivacidade:docs.privacidade.versao,
   hashPrivacidade:docs.privacidade.hash
  });
 }
 const alice=await contas.entrar({nick:'Alice',senha:'SenhaDoCarrinho2026!'});
 const bruno=await contas.entrar({nick:'Bruno',senha:'SenhaDoCarrinho2026!'});
 const produto=Object.freeze({
  produtoId:'x',titulo:'Produto com foto publicada',
  tipo:'FISICO',cor:'VERDE',compravel:false,checkoutReal:false,
  precoCentavos:null,estoqueConfirmado:false,novidade:true,
  unidadesConfirmadas:0,criadoEm:Date.now(),descricao:'Produto para consulta'
 });
 const app=criarAppIdentidadeLoop({
  contas,origemHttps:ORIGEM,permitirCadastro:false,
  catalogoVitrine:{banco,listarVitrinePreparacao:()=>[produto]}
 });
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const requisitar=(rota,{sessao=null,body=null,origin=ORIGEM}={})=>
  fetch(base+rota,{
   method:body===null?'GET':'POST',
   headers:{...(sessao?{Cookie:'loop_real_s='+sessao.token}:{}),
    ...(body===null?{}:{Origin:origin,
     'Content-Type':'application/json','X-Loop-Csrf':sessao?.csrf||''})},
   ...(body===null?{}:{body:JSON.stringify(body)})
  });
 assert.equal((await requisitar('/api/loja/carrinho')).status,401);
 assert.equal((await requisitar('/api/loja/carrinho/itens',{body:{
  produtoId:produto.produtoId,quantidade:1
 }})).status,401);
 const aliceRead=()=>requisitar('/api/loja/carrinho',{sessao:alice});
 const brunoRead=()=>requisitar('/api/loja/carrinho',{sessao:bruno});
 const escrever=(sessao,body,origin=ORIGEM)=>
  requisitar('/api/loja/carrinho/itens',{sessao,body,origin});
 assert.equal((await aliceRead()).status,200);
 const vazio=await (await aliceRead()).json();
 assert.equal(vazio.fonte,'CARRINHO_INTERNO_REAL');
 assert.equal(vazio.quantidadeTotal,0);
 assert.equal(vazio.checkoutReal,false);
 assert.equal(vazio.financeiroReal,false);
 assert.equal((await escrever(alice,{
  produtoId:produto.produtoId,quantidade:1
 },'https://other.invalid')).status,403);
 assert.equal((await escrever(alice,{
  produtoId:'produto-nao-publicado',quantidade:1
 })).status,404);
 assert.equal((await escrever(alice,{
  produtoId:produto.produtoId,quantidade:51
 })).status,400);
 const add=await escrever(alice,{produtoId:produto.produtoId,quantidade:3});
 assert.equal(add.status,200);
 const saldo=await add.json();
 assert.equal(saldo.quantidadeTotal,3);
 assert.equal(saldo.itensDistintos,1);
 assert.equal(saldo.itens[0].titulo,produto.titulo);
 assert.equal(saldo.itens[0].precoCentavos,null);
 assert.equal(saldo.itens[0].compravel,false);
 assert.equal((await (await brunoRead()).json()).quantidadeTotal,0,
  'titular diferente nunca herda o carrinho de outro');
 const reaberto=new CarrinhoInternoRealSQLite({banco});
 assert.equal(reaberto.listar({titularId:alice.titularId}).quantidadeTotal,3);
 const menos=await escrever(alice,{produtoId:produto.produtoId,quantidade:2});
 assert.equal((await menos.json()).quantidadeTotal,2);
 const limpar=await requisitar('/api/loja/carrinho/limpar',{
  sessao:alice,body:{}
 });
 assert.equal(limpar.status,200);
 assert.equal((await limpar.json()).quantidadeTotal,0);
 assert.equal((await (await aliceRead()).json()).itens.length,0);
 assert.deepEqual(reaberto.verificar(),{integridade:'OK',itens:0,financeiroReal:false});
 for(const tabela of ['loja_real_pedidos','loop_real_fin_lancamentos',
  'loop_real_motor_qualificacoes']){
  const existe=banco.prepare([
   "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
  ].join(' ')).get(tabela);
  if(existe)assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM '+tabela).get().n,0);
 }
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('carrinho AKITEMM resiste a reinicio, tem limite por pessoa e backup exige integridade',async t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-carrinho-duravel-'));
 const arquivo=path.join(pasta,'clientes.sqlite');
 let banco=new DatabaseSync(arquivo);
 t.after(()=>{
  try{banco.close();}catch{}
  fs.rmSync(pasta,{recursive:true,force:true});
 });
 banco.exec('PRAGMA foreign_keys=ON;');
 const contas=new IdentidadeClienteLoopReal({
  banco,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),enviarEmail:async()=>true,
  termos:{versao:'LOOP-TERMOS-CARRINHO-2026',texto:TEXTO},
  privacidade:{versao:'LOOP-PRIV-CARRINHO-2026',texto:TEXTO}
 });
 const docs=contas.documentos();
 const registrado=await contas.cadastrar({
  nome:'Pessoa de Teste',nick:'Duravel',email:'duravel@example.invalid',
  senha:'SenhaDoCarrinho2026!',aceiteTermos:true,aceitePrivacidade:true,
  versaoTermos:docs.termos.versao,hashTermos:docs.termos.hash,
  versaoPrivacidade:docs.privacidade.versao,
  hashPrivacidade:docs.privacidade.hash
 });
 const id=registrado.titularId;
 const carrinho=new CarrinhoInternoRealSQLite({banco});
 // Identificadores 1..80 são válidos no catálogo principal.
 carrinho.definir({titularId:id,produtoId:'x',quantidade:50});
 for(let n=1;n<20;n++)
  carrinho.definir({titularId:id,produtoId:'sku-'+n,quantidade:1});
 assert.equal(carrinho.listar({titularId:id}).itensDistintos,20);
 assert.equal(carrinho.listar({titularId:id}).quantidadeTotal,69);
 assert.throws(()=>carrinho.definir({
  titularId:id,produtoId:'sku-excedente',quantidade:1
 }),e=>e.codigo==='CARRINHO_LIMITE_ITENS');
 assert.equal(carrinho.listar({titularId:id}).itensDistintos,20,
  'falha de limite faz rollback sem excluir ou duplicar itens');
 assert.deepEqual(carrinho.verificar(),{
  integridade:'OK',itens:20,financeiroReal:false
 });
 banco.close();
 banco=new DatabaseSync(arquivo);
 banco.exec('PRAGMA foreign_keys=ON;');
 const reaberto=new CarrinhoInternoRealSQLite({banco});
 assert.equal(reaberto.listar({titularId:id}).quantidadeTotal,69);
 assert.equal(validarIdentidade(arquivo).integridade,'ok',
  'snapshot legítimo permite recuperação');
 // Escrita corrompida fora da API não pode entrar em backup/restauração.
 banco.prepare([
  'UPDATE loop_real_carrinho_itens SET produto_id=?',
  'WHERE titular_id=? AND produto_id=?'
 ].join(' ')).run('sku/sem-autorizacao',id,'x');
 assert.throws(()=>reaberto.verificar(),e=>
  e.codigo==='CARRINHO_INTEGRIDADE_INVALIDA');
 assert.throws(()=>validarIdentidade(arquivo),e=>
  e.codigo==='BACKUP_CARRINHO_INTEGRIDADE_DIVERGENTE');
 banco.prepare([
  'UPDATE loop_real_carrinho_itens SET produto_id=?',
  'WHERE titular_id=? AND produto_id=?'
 ].join(' ')).run('x',id,'sku/sem-autorizacao');
 // Inserts maliciosos por fora da API também não podem superar 20 produtos.
 banco.prepare([
  'INSERT INTO loop_real_carrinho_itens',
  '(titular_id,produto_id,quantidade,atualizado_em)',
  'VALUES(?,?,1,?)'
 ].join(' ')).run(id,'sku-21',Date.now());
 assert.throws(()=>reaberto.verificar(),e=>
  e.codigo==='CARRINHO_INTEGRIDADE_INVALIDA');
 assert.throws(()=>validarIdentidade(arquivo),e=>
  e.codigo==='BACKUP_CARRINHO_INTEGRIDADE_DIVERGENTE');
 banco.prepare([
  'DELETE FROM loop_real_carrinho_itens',
  'WHERE titular_id=? AND produto_id=?'
 ].join(' ')).run(id,'sku-21');
 assert.equal(validarIdentidade(arquivo).integridade,'ok');
});
