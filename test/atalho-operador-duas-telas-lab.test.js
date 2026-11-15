'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const {once}=require('node:events');
const {criarRouterAtalhoOperadorLab}=require('../src/routes/atalho-operador-lab');
const {criarAutorizacao}=require('../src/routes/admin-catalogo-laboratorio');
const CHAVE='chave-operador-existente-1234567890123456789';
test('sessao operador e temporaria, HttpOnly, sem mudar sessao cliente e resistente a CSRF',async t=>{
 const app=express();app.use(express.json());
 app.use('/api/admin',criarRouterAtalhoOperadorLab({segredo:CHAVE}));
 const autorizar=criarAutorizacao({segredo:CHAVE});
 app.get('/api/admin/protegido',autorizar,(_req,res)=>res.json({ok:true}));
 app.post('/api/admin/protegido',autorizar,(_req,res)=>res.json({ok:true}));
 const servidor=app.listen(0,'127.0.0.1');
 await once(servidor,'listening');
 t.after(()=>new Promise((resolve,reject)=>servidor.close(e=>e?reject(e):resolve())));
 const url='http://127.0.0.1:'+servidor.address().port;
 const pedir=(rota,config)=>fetch(url+rota,config);
 assert.deepEqual(await(await pedir('/api/admin/operador-sessao')).json(),{operador:false});
 assert.equal((await pedir('/api/admin/protegido')).status,401);
 assert.equal((await pedir('/api/admin/operador-sessao',{
  method:'POST',headers:{Authorization:'Bearer senha-errada','Content-Type':'application/json'},
  body:'{}'
 })).status,401);
 const acesso=await pedir('/api/admin/operador-sessao',{
  method:'POST',headers:{Authorization:'Bearer '+CHAVE,'Content-Type':'application/json'},
  body:'{}'
 });
 assert.equal(acesso.status,200);
 const cookieSet=acesso.headers.get('set-cookie');
 assert.match(cookieSet,/HttpOnly/i);
 assert.match(cookieSet,/SameSite=Strict/i);
 assert.doesNotMatch(cookieSet,new RegExp(CHAVE));
 const cookie=cookieSet.split(';')[0];
 assert.equal((await pedir('/api/admin/operador-sessao',{headers:{Cookie:cookie}}).then(r=>r.json())).operador,true);
 assert.equal((await pedir('/api/admin/protegido',{headers:{Cookie:cookie}})).status,200);
 assert.equal((await pedir('/api/admin/protegido',{headers:{Authorization:'Bearer __OPERADOR_SESSAO_LOCAL__'}})).status,401);
 assert.equal((await pedir('/api/admin/protegido',{headers:{Cookie:cookie,Authorization:'Bearer __OPERADOR_SESSAO_LOCAL__'}})).status,200);
 assert.equal((await pedir('/api/admin/protegido',{
  method:'POST',headers:{Cookie:cookie,Authorization:'Bearer __OPERADOR_SESSAO_LOCAL__','Content-Type':'application/json'},
  body:'{}'
 })).status,200);
 assert.equal((await pedir('/api/admin/protegido',{
  method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{}'
 })).status,401);
 assert.equal((await pedir('/api/admin/protegido',{
  method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-LOOP-OPERADOR':'1'},body:'{}'
 })).status,200);
 assert.equal((await pedir('/api/admin/operador-sessao',{
  method:'DELETE',headers:{Cookie:cookie}
 })).status,403);
 assert.equal((await pedir('/api/admin/operador-sessao',{
  method:'DELETE',headers:{Cookie:cookie,'X-LOOP-OPERADOR':'1'}
 })).status,204);
 assert.equal((await pedir('/api/admin/operador-sessao',{headers:{Cookie:cookie}}).then(r=>r.json())).operador,false);
 assert.equal((await pedir('/api/admin/protegido',{headers:{Cookie:cookie}})).status,401);
});
test('as telas usam a mesma central e escondem o atalho ate autenticar',()=>{
 const base=path.join(__dirname,'../src/laboratorio');
 for(const nome of ['loop-03-shell.js','loja-cliente-demo.html']){
  const conteudo=fs.readFileSync(path.join(base,nome),'utf8');
  assert.match(conteudo,/data-atalho-operador/);
  assert.match(conteudo,/href="\/admin\/loop03"/);
  assert.match(conteudo,/hidden>\+/);
 }
 const servidorPublico=fs.readFileSync(path.join(__dirname,'../src/server.js'),'utf8');
 assert.doesNotMatch(servidorPublico,/operador-sessao/);
});
