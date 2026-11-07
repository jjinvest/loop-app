'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {criarGateway}=require('../scripts/servidor-escritorio-preview-railway');
const A='senha-de-previa-ficticia-123456789012345';
const D='senha-de-operador-distinta-123456789012345';
const SECRET='segredo-operacional-ficticio-para-provar-fronteira-123';
async function listen(s){
 s.listen(0,'127.0.0.1');await once(s,'listening');return s.address().port;
}
async function fechar(s){
 if(s.listening)await new Promise((ok,fail)=>s.close(e=>e?fail(e):ok()));
}
async function montar(senhaAdmin=D){
 const chamadas=[];
 const backend=http.createServer((req,res)=>{
  chamadas.push({path:req.url,authorization:req.headers.authorization});
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end('{"prova":"UPSTREAM_FICTICIO"}');
 });
 const portaInterna=await listen(backend);
 let gateway,porta;
 try{
  gateway=criarGateway({portaInterna,senhaAcesso:A,
   senhaAdmin,segredoOperador:SECRET});
  porta=await listen(gateway);
 }catch(e){
  if(gateway?.listening)await fechar(gateway);
  await fechar(backend);
  throw e;
 }
 return {chamadas,url:'http://127.0.0.1:'+porta,
  fechar:async()=>{await fechar(gateway);await fechar(backend);}};
}
const basica=(usuario,senha)=>'Basic '+Buffer.from(usuario+':'+senha).toString('base64');
function cookie(r,nome){
 const arr=r.headers.getSetCookie?.()||[r.headers.get('set-cookie')||''];
 return arr.map(x=>x.split(';')[0]).find(x=>x.startsWith(nome+'='));
}
test('cookie de visitante nao abre APIs administrativas nem injeta bearer no backend',async()=>{
 const x=await montar();
 try{
  const visitante=await fetch(x.url+'/loja',{
   redirect:'manual',headers:{Authorization:basica('acesso',A)}
  });
  assert.equal(visitante.status,302);
  assert.equal(visitante.headers.get('location'),'/staging/loja');
  const ck=cookie(visitante,'akitemm_preview_access');
  assert.ok(ck);
  const n=x.chamadas.length;
  for(const path of ['/escritorio','/staging/escritorio-admin',
   '/staging/escritorio-unificado','/staging/escritorio-unificado/motor/estado',
   '/staging/escritorio-unificado/motor/liberar-lote',
   '/staging/assets/admin.js','/staging/assets/admin.css',
   '/STAGING/ESCRITORIO-ADMIN',
   '/STAGING/ESCRITORIO-UNIFICADO/MOTOR/ESTADO',
   '/staging/escritorio%2dunificado/motor/estado',
   '/staging/assets/%61dmin.js']){
   const r=await fetch(x.url+path,{headers:{Cookie:ck}});
   assert.equal(r.status,401,path);
  }
  assert.equal(x.chamadas.length,n,'sem encaminhamento ao upstream');
  const raiz=await fetch(x.url+'/',{headers:{Cookie:ck},redirect:'manual'});
  assert.equal(raiz.status,302);
  assert.equal(raiz.headers.get('location'),'/minha-conta');
  const cliente=await fetch(x.url+'/minha-conta',{headers:{Cookie:ck}});
  assert.equal(cliente.status,200,'cliente autentica normalmente');
  const interno=await fetch(x.url+'/staging/asaas/webhook-unificado',{
   method:'POST',headers:{Authorization:basica('acesso',A)}
  });
  assert.equal(interno.status,404);
 }finally{await x.fechar();}
});
test('operador da previa recebe cookie proprio e pode usar APIs autenticadas',async()=>{
 const x=await montar();
 try{
  const r=await fetch(x.url+'/escritorio',{
   headers:{Authorization:basica('operador',D)}
  });
  assert.equal(r.status,200);
  const cookieAdmin=cookie(r,'akitemm_preview_admin_v2');
  assert.ok(cookieAdmin);
  const admin=await fetch(x.url+'/staging/escritorio-unificado/motor/estado',
   {headers:{Cookie:cookieAdmin}});
  assert.equal(admin.status,200);
  assert.equal(x.chamadas.at(-1).authorization,'Bearer '+SECRET);
  const tela=await fetch(x.url+'/staging/assets/admin.js',
   {headers:{Cookie:cookieAdmin}});
  assert.equal(tela.status,200);
  const js=await tela.text();
  assert.ok(js.includes('PREVIA_OPERADOR'));
  const forjado=await fetch(x.url+'/staging/escritorio-unificado/motor/estado',
   {headers:{Cookie:'akitemm_preview_admin_v2=v1.1234567890123.'+'0'.repeat(64)}});
  assert.equal(forjado.status,401);
 }finally{await x.fechar();}
});
test('com credencial admin separada a senha de acesso de cliente nao autoriza operador',async()=>{
 const x=await montar(D);
 try{
  const r=await fetch(x.url+'/escritorio',{
   headers:{Authorization:basica('acesso',A)}
  });
  assert.equal(r.status,401);
  const admin=await fetch(x.url+'/escritorio',{
   headers:{Authorization:basica('operador',D)}
  });
  assert.equal(admin.status,200);
  const ck=cookie(admin,'akitemm_preview_admin_v2');
  assert.ok(ck);
  const api=await fetch(x.url+'/staging/escritorio-unificado/motor/estado',
   {headers:{Cookie:ck}});
  assert.equal(api.status,200);
  const cliente=await fetch(x.url+'/loja',{
   redirect:'manual',headers:{Authorization:basica('acesso',A)}
  });
  assert.equal(cliente.status,302);
  assert.equal(cliente.headers.get('location'),'/staging/loja');
  assert.ok(cookie(cliente,'akitemm_preview_access'));
  assert.throws(()=>criarGateway({
   portaInterna:3000,senhaAcesso:A,senhaAdmin:A,segredoOperador:SECRET
  }),/GATEWAY_PREVIA_INVALIDO/);
 }finally{await x.fechar();}
});
test('variantes administrativas com barra final nao atravessam o gateway visitante',async()=>{
 const x=await montar(D);
 try{
  const login=await fetch(x.url+'/loja',{
   redirect:'manual',headers:{Authorization:basica('acesso',A)}
  });
  assert.equal(login.status,302);
  assert.equal(login.headers.get('location'),'/staging/loja');
  const ck=cookie(login,'akitemm_preview_access');
  assert.ok(ck);
  const chamadasAntes=x.chamadas.length;
  for(const path of [
   '/staging/escritorio-admin/',
   '/staging/escritorio-admin///',
   '/staging/assets/admin.js/',
   '/staging/assets/admin.css/',
   '/staging/assets/%61dmin.js/',
   '/staging/escritorio-unificado/'
  ]){
   const r=await fetch(x.url+path,{headers:{Cookie:ck}});
   assert.equal(r.status,401,path);
  }
  assert.equal(x.chamadas.length,chamadasAntes,
   'o gateway nao pode encaminhar assets ou rotas administrativas ao backend');
  const admin=await fetch(x.url+'/staging/escritorio-admin/',{
   headers:{Authorization:basica('operador',D)}
  });
  assert.equal(admin.status,200);
 }finally{await x.fechar();}
});
