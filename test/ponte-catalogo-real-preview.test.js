'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const http=require('node:http');
const {once}=require('node:events');
const express=require('express');
const {criarCatalogoMercadoriasReal,tokenCatalogo}=
 require('../src/producao/catalogo-mercadorias-real');
const {instalarPonteCatalogoReal}=
 require('../src/producao/ponte-catalogo-real-preview');

const raiz='b'.repeat(64);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DAAMIM/4EAAB/uBfsL2WiLAAAAAElFTkSuQmCC','base64');
test('ponte REAL liga cadastro, foto e vitrine sem conta de teste e sem checkout',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ponte-akitemm-'));
 const real=criarCatalogoMercadoriasReal({arquivo:path.join(dir,'real.sqlite'),tokenRaiz:raiz});
 const srvReal=http.createServer((req,res)=>void real.atender(req,res));
 srvReal.listen(0,'127.0.0.1');await once(srvReal,'listening');
 const baseReal='http://127.0.0.1:'+srvReal.address().port;
 const antigoFetch=global.fetch;
 global.fetch=function(input,options){
  if(typeof input==='string'&&input.startsWith('http://loop-identidade-real.railway.internal/internal/catalogo'))
   return antigoFetch(baseReal+input.slice('http://loop-identidade-real.railway.internal'.length),options);
  return antigoFetch(input,options);
 };
 const app=express();
 app.use(express.json({limit:'12kb'}));
 const middleware=(req,res,next)=>req.get('Authorization')==='Bearer operador'?
  next():res.status(401).json({erro:'ADMIN_NAO_AUTORIZADO'});
 const ligado=instalarPonteCatalogoReal({
  app,autorizarOperador:middleware,
  env:{LOOP_PREVIEW_CATALOGO_REAL:'SIM',
   LOOP_PREVIEW_URL_TABULEIRO_REAL:'http://loop-identidade-real.railway.internal/internal/loop/tabuleiro',
   LOOP_PREVIEW_TOKEN_TABULEIRO_REAL:raiz}
 });
 assert.equal(ligado.ativo,true);
 const servidor=http.createServer(app);
 servidor.listen(0,'127.0.0.1');await once(servidor,'listening');
 const base='http://127.0.0.1:'+servidor.address().port;
 t.after(async()=>{
  global.fetch=antigoFetch;
  await new Promise(r=>servidor.close(r));
  await new Promise(r=>srvReal.close(r));
  real.fechar();
  fs.rmSync(dir,{recursive:true,force:true});
 });
 const call=async(rota,{method='GET',json,bytes,mime,revision,admin=false}={})=>{
  const r=await antigoFetch(base+rota,{method,headers:{
   ...(admin?{Authorization:'Bearer operador'}:{}),
   ...(json?{'content-type':'application/json'}:{}),
   ...(bytes?{'content-type':mime,'x-foto-versao-esperada':String(revision)}:{})
  },body:json?JSON.stringify(json):bytes});
  const tipo=r.headers.get('content-type')||'';
  return {status:r.status,body:tipo.startsWith('image/')?
   Buffer.from(await r.arrayBuffer()):await r.json()};
 };
 assert.equal((await call('/staging/escritorio-unificado/produtos')).status,401);
 assert.equal((await call('/staging/vitrine/loja/catalogo')).body.produtos.length,0);
 const produto={id:'tenis-azul-43',nome:'Tênis azul em estoque',
  descricao:'Venda de tênis do proprietário',tipo:'FISICO',estado:'RASCUNHO',
  precoCentavos:19990,entrega:'ESTOQUE_PROPRIO',detalhes:['Tamanho: 43'],
  fotos:[],videoApresentacaoUrl:null};
 const inserido=await call('/staging/escritorio-unificado/produtos',{
  method:'POST',admin:true,json:{produto}
 });
 assert.equal(inserido.status,201,JSON.stringify(inserido.body));
 assert.ok(real.repo.buscar('tenis-azul-43'));
 const foto=await call('/staging/escritorio-unificado/produtos/tenis-azul-43/fotos/1',{
  method:'POST',admin:true,mime:'image/png',bytes:png,revision:0
 });
 assert.equal(foto.status,201,JSON.stringify(foto.body));
 const aprovado=await call('/staging/escritorio-unificado/produtos/tenis-azul-43',{
  method:'PATCH',admin:true,json:{
   revisaoEsperada:1,alteracoes:{estado:'PUBLICADO'}
  }
 });
 assert.equal(aprovado.status,200,JSON.stringify(aprovado.body));
 const loja=await call('/staging/vitrine/loja/catalogo');
 assert.equal(loja.status,200);
 assert.equal(loja.body.produtos.length,1);
 assert.equal(loja.body.produtos[0].fotos.length,1);
 assert.equal(loja.body.checkoutReal,false);
 const render=await call('/staging/vitrine/loja/produtos/tenis-azul-43/foto/1');
 assert.equal(render.status,200);
 assert.ok(render.body.length>50);
 assert.equal((await call('/staging/vitrine/loja/pedidos',{method:'POST',json:{itens:[]}})).status,503);
 assert.equal((await call('/staging/escritorio-unificado/produtos/tenis-azul-43/fotos',{
  admin:true})).body.fotos.length,1);
});
