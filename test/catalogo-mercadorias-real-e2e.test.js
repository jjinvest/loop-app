'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const http=require('node:http');
const {once}=require('node:events');
const {criarCatalogoMercadoriasReal,tokenCatalogo}=
 require('../src/producao/catalogo-mercadorias-real');
const raizToken='a'.repeat(64);
const chave=tokenCatalogo(raizToken);
const png=Buffer.from(
 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DAAMIM/4EAAB/uBfsL2WiLAAAAAElFTkSuQmCC',
 'base64');
function tenis(){
 return {id:'tenis-azul-42',nome:'Tênis azul tamanho 42',
  tipo:'FISICO',estado:'RASCUNHO',descricao:'Estoque próprio da AKITEMM',
  precoCentavos:17990,entrega:'ESTOQUE_PROPRIO',fotos:[],
  detalhes:['Tamanho: 42','Cor: azul','Material: sintético'],
  videoApresentacaoUrl:null};
}
test('catálogo REAL: autenticação, cadastro, fotos, publicação, revisão e reinício SQLite',async t=>{
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'akitemm-real-'));
 const arquivo=path.join(pasta,'catalogo-produtos.sqlite');
 let ctx,server,base;
 async function iniciar(){
  ctx=criarCatalogoMercadoriasReal({arquivo,tokenRaiz:raizToken});
  server=http.createServer((req,res)=>void ctx.atender(req,res));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  base='http://127.0.0.1:'+server.address().port+'/internal/catalogo';
 }
 async function fechar(){
  await new Promise(r=>server.close(r));ctx.fechar();
 }
 t.after(async()=>{
  if(server?.listening)await fechar();
  fs.rmSync(pasta,{recursive:true,force:true});
 });
 async function chamar(rota,{method='GET',json,bytes,mime,revision,unauthorized=false}={}){
  const resposta=await fetch(base+rota,{
   method,headers:{
    'x-loop-catalogo-token':unauthorized?'0'.repeat(64):chave,
    ...(json?{'content-type':'application/json'}:{}),
    ...(bytes?{'content-type':mime,'x-foto-versao-esperada':String(revision)}:{})
   },body:json?JSON.stringify(json):bytes
  });
  const ct=resposta.headers.get('content-type');
  return {status:resposta.status,
   body:ct?.startsWith('image/')?Buffer.from(await resposta.arrayBuffer()):
   await resposta.json()};
 }
 await iniciar();
 assert.equal((await chamar('/status',{unauthorized:true})).status,401);
 assert.equal((await chamar('/status')).body.quantidadeProdutos,0);
 assert.deepEqual((await chamar('/vitrine')).body.produtos,[]);
 assert.equal((await chamar('/vitrine')).body.checkoutReal,false);
 const produto=tenis();
 const criado=await chamar('/produtos',{method:'POST',json:{produto}});
 assert.equal(criado.status,201,JSON.stringify(criado.body));
 assert.equal(criado.body.revisao,1);
 assert.equal(criado.body.produto.entrega,'ESTOQUE_PROPRIO');
 assert.equal((await chamar('/produtos',{method:'POST',json:{produto}})).status,409);
 assert.equal((await chamar('/produtos/tenis-azul-42',{
  method:'PATCH',json:{revisaoEsperada:1,alteracoes:{estado:'PUBLICADO'}}
 })).status,409,'Não publicar produto sem foto');
 assert.equal((await chamar('/foto/tenis-azul-42/1')).status,404);
 const enviada=await chamar('/produtos/tenis-azul-42/fotos/1',{
  method:'POST',bytes:png,mime:'image/png',revision:0});
 assert.equal(enviada.status,201,JSON.stringify(enviada.body));
 assert.equal(enviada.body.versao,1);
 const fotos=await chamar('/produtos/tenis-azul-42/fotos');
 assert.equal(fotos.body.fotos.length,1);
 assert.equal(fotos.body.fotos[0].posicao,1);
 const atual=await chamar('/produtos/tenis-azul-42',{
  method:'PATCH',json:{revisaoEsperada:1,alteracoes:{
   estado:'PUBLICADO',detalhes:['Tamanho: 42','Cor: preto']
  }}});
 assert.equal(atual.status,200,JSON.stringify(atual.body));
 assert.equal(atual.body.revisao,2);
 assert.equal((await chamar('/produtos/tenis-azul-42',{
  method:'PATCH',json:{revisaoEsperada:1,alteracoes:{descricao:'Obsoleta'}}
 })).status,409);
 const vitrine=(await chamar('/vitrine')).body;
 assert.equal(vitrine.produtos.length,1);
 assert.equal(vitrine.produtos[0].nome,produto.nome);
 assert.equal(vitrine.produtos[0].classeVisual,'CINZA');
 assert.equal(vitrine.produtos[0].elegivelLoop,false);
 assert.equal(vitrine.produtos[0].fotos[0],'/staging/vitrine/loja/produtos/tenis-azul-42/foto/1');
 assert.equal(vitrine.pagamentosReais,false);
 assert.equal((await chamar('/foto/tenis-azul-42/1')).status,200);
 const alterada=await chamar('/loja/config',{method:'PUT',json:{
  revisaoEsperada:0,config:{...(await chamar('/loja/config')).body.config,
   vitrineSlots:['CINZA','VERDE','ROXO','DOURADO','DOURADO','ROXO','VERDE','CINZA']}
 }});
 assert.equal(alterada.status,200);
 await fechar();
 await iniciar();
 const depois=(await chamar('/vitrine')).body;
 assert.equal(depois.produtos.length,1,'Persistiu após reinício sem reimportar');
 assert.deepEqual(depois.produtos[0].detalhes,['Tamanho: 42','Cor: preto']);
 assert.equal((await chamar('/produtos/tenis-azul-42/fotos')).body.fotos.length,1);
 assert.equal((await chamar('/loja/config')).body.config.vitrineSlots[0],'CINZA');
 assert.equal((await chamar('/status')).body.checkoutReal,false);
 assert.equal(ctx.repo.banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(ctx.repo.banco.prepare('PRAGMA foreign_key_check').all(),[]);
});
