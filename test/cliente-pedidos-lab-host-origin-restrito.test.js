'use strict';
// Protecao em profundidade: mesmo se a rota de laboratorio for montada por engano,
// nao deve atender dominio externo, origem arbitraria ou ambiente de producao.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {once}=require('node:events');
const {request}=require('node:http');
const express=require('express');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
const {criarRouterClientePedidosLab}=require('../src/routes/cliente-pedidos-lab');
test('LAB valida Host, Origin e socket local, sem gravar ou emitir sessao em acesso indevido',async t=>{
 const banco=new DatabaseSync(':memory:');
 t.after(()=>banco.close());
 const contas=new ContasParticipantesDemoSQLite({banco});
 const pedidos=new PedidosTitularidadeDemoSQLite({banco,contas});
 const app=express();app.use(express.json());
 app.use('/api/cliente-lab',criarRouterClientePedidosLab({contas,pedidos}));
 const servidor=app.listen(0,'127.0.0.1');await once(servidor,'listening');
 t.after(()=>new Promise(resolve=>servidor.close(resolve)));
 const host='127.0.0.1:'+servidor.address().port;
 const base='http://'+host+'/api/cliente-lab';
 const rota='/meus-pedidos';
 const antes=banco.prepare('SELECT COUNT(*) AS n FROM admin_contas_participantes_demo').get().n;
 const legitimo=await fetch(base+rota);
 assert.equal(legitimo.status,401);
 assert.equal(legitimo.headers.get('cache-control'),'no-store');
 assert.equal(legitimo.headers.get('referrer-policy'),'no-referrer');
 // Node fetch reescreve Host silenciosamente. Usar http.request para
 // testar Host indevido realmente enviado no socket ao servidor.
 const hostFalso=await new Promise((resolve,reject)=>{
  const req=request({hostname:'127.0.0.1',port:servidor.address().port,
   method:'GET',path:'/api/cliente-lab'+rota,
   headers:{Host:'dominio-de-terceiros.invalid'}},res=>{
    let body='';res.on('data',chunk=>{body+=chunk;});
    res.on('end',()=>resolve({status:res.statusCode,body}));
   });
  req.once('error',reject);req.end();
 });
 assert.equal(hostFalso.status,403);
 assert.equal(JSON.parse(hostFalso.body).erro,'LABORATORIO_LOCAL_APENAS');
 for(const cabecalhos of [
  {Origin:'https://dominio-de-terceiros.invalid'},
  {Origin:'http://127.0.0.1:11111'}
 ]){
  const resposta=await fetch(base+rota,{headers:cabecalhos});
  assert.equal(resposta.status,403);
  assert.equal((await resposta.json()).erro,'LABORATORIO_LOCAL_APENAS');
 }
 const cadastro={nome:'Cliente Bloqueado',email:'blocked@example.invalid',senha:'SenhaTesteSomenteFicticia'};
 const post=await fetch(base+'/cadastrar',{method:'POST',
  headers:{'Content-Type':'application/json',Origin:'https://site-malicioso.invalid'},
  body:JSON.stringify(cadastro)});
 assert.equal(post.status,403);
 assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM admin_contas_participantes_demo').get().n,antes);
});
test('LAB nao autentica nem responde ao endpoint quando NODE_ENV=production',async t=>{
 const banco=new DatabaseSync(':memory:');
 t.after(()=>banco.close());
 const contas=new ContasParticipantesDemoSQLite({banco});
 const pedidos=new PedidosTitularidadeDemoSQLite({banco,contas});
 const app=express();app.use(express.json());
 app.use('/api/cliente-lab',criarRouterClientePedidosLab({contas,pedidos}));
 const servidor=app.listen(0,'127.0.0.1');await once(servidor,'listening');
 t.after(()=>new Promise(resolve=>servidor.close(resolve)));
 const antes=process.env.NODE_ENV;
 try{
  process.env.NODE_ENV='production';
  const resposta=await fetch('http://127.0.0.1:'+servidor.address().port+'/api/cliente-lab/meus-pedidos');
  assert.equal(resposta.status,403);
  assert.equal((await resposta.json()).erro,'LABORATORIO_LOCAL_APENAS');
 }finally{
  if(antes===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=antes;
 }
});
