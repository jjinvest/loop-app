'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {criarGateway}=require('../scripts/servidor-escritorio-preview-railway');
const SENHA='A'.repeat(64),ADMIN='B'.repeat(64),OPERADOR='C'.repeat(64);
async function abrir(handler){
 const s=http.createServer(handler);
 s.listen(0,'127.0.0.1');await once(s,'listening');
 return s;
}
test('entrada publica usa somente identidade definitiva, inclusive operador, sem cadastrar na previa',async t=>{
 const realChamadas=[],legadoChamadas=[];
 const real=await abrir((req,res)=>{
  realChamadas.push({path:req.url,method:req.method,host:req.headers.host,
   authorization:req.headers.authorization,
   tokenInterno:req.headers['x-loop-interservice-token'],
   origin:req.headers.origin,cookie:req.headers.cookie});
  if(req.url==='/healthz'){
   res.writeHead(200,{'Content-Type':'application/json'});
   return res.end(JSON.stringify({estado:'SERVICO_IDENTIDADE_SEPARADO'}));
  }
  if(req.url==='/readyz'){
   res.writeHead(503);return res.end('CADASTRO_REAL_INATIVO');
  }
  if(req.url==='/escritorio/VILELA'||req.url==='/loja/VILELA'){
   res.writeHead(303,{Location:'/escritorio?ref=vilela'});
   return res.end();
  }
  if(['/minha-conta','/escritorio','/loja'].includes(req.url)||req.url.startsWith('/minha-conta?')){
   res.writeHead(200,{'Content-Type':'text/html'});
   return res.end('MESMA_INTERFACE_REAL '+req.url);
  }
  if(req.url==='/administrador'){
   res.writeHead(303,{Location:'/administrador/entrar'});
   return res.end();
  }
  if(req.url==='/identidade/assets/cliente.js'){
   res.writeHead(200,{'Content-Type':'application/javascript'});
   return res.end('window.identidade="real"');
  }
  if(req.url==='/api/operador/estado'){
   res.writeHead(200,{'Content-Type':'application/json'});
   return res.end(JSON.stringify({operador:false}));
  }
  if(req.url==='/api/contas/me'){
   res.writeHead(401);return res.end();
  }
  if(['/api/contas/cadastrar','/api/checkout/finalizar'].includes(req.url)){
   res.writeHead(503,{'Content-Type':'application/json'});
   return res.end(JSON.stringify({erro:'CADASTRO_OU_FINANCEIRO_INATIVO'}));
  }
  res.writeHead(404);res.end();
 });
 const legado=await abrir((req,res)=>{
  legadoChamadas.push(req.url);res.writeHead(200);res.end('ANTIGO');
 });
 const gateway=criarGateway({
  portaInterna:legado.address().port,
  senhaAcesso:SENHA,senhaAdmin:ADMIN,segredoOperador:OPERADOR,
  publicarCadastroReal:true,permitirOrigemHttpLoopback:true,
  urlIdentidadeReal:'http://127.0.0.1:'+real.address().port+
   '/internal/loop/tabuleiro'
 });
 gateway.listen(0,'127.0.0.1');await once(gateway,'listening');
 t.after(async()=>{
  await new Promise(ok=>gateway.close(ok));
  await new Promise(ok=>legado.close(ok));
  await new Promise(ok=>real.close(ok));
 });
 const base='http://127.0.0.1:'+gateway.address().port;
 const get=(p,o={})=>fetch(base+p,{redirect:'manual',...o});
 assert.equal((await get('/')).headers.get('location'),'/minha-conta');
 assert.match(await (await get('/minha-conta')).text(),/MESMA_INTERFACE_REAL/);
 assert.match(await (await get('/escritorio')).text(),/MESMA_INTERFACE_REAL/);
 assert.match(await (await get('/loja')).text(),/MESMA_INTERFACE_REAL/);
 assert.equal((await get('/cadastro-real?ref=VILELA')).status,200);
 assert.equal((await get('/escritorio/VILELA')).headers.get('location'),'/escritorio?ref=vilela');
 assert.equal((await get('/loja/VILELA')).status,303);
 assert.equal((await get('/administrador')).headers.get('location'),'/administrador/entrar');
 assert.deepEqual(await (await get('/api/operador/estado')).json(),{operador:false});
 assert.equal((await get('/identidade/assets/cliente.js')).status,200);
 assert.equal((await get('/api/contas/me')).status,401);
 assert.equal((await get('/healthz')).status,200);
 assert.equal((await get('/readyz')).status,503);
 const cadastro=await get('/api/contas/cadastrar',{method:'POST',headers:{
  Origin:'https://akitemmloop.com.br',
  Authorization:'Basic CREDENCIAL_NAO_REPASSAR',
  'X-Loop-Interservice-Token':'segredo-forjado',
  'Content-Type':'application/json'
 },body:JSON.stringify({nome:'Visitante'})});
 assert.equal(cadastro.status,503,'cadastro verdadeiro permanece fechado sem GO');
 const chamada=realChamadas.at(-1);
 assert.equal(chamada.path,'/api/contas/cadastrar');
 assert.equal(chamada.origin,'https://akitemmloop.com.br');
 assert.equal(chamada.authorization,undefined);
 assert.equal(chamada.tokenInterno,undefined);
 assert.equal((await get('/staging/contas/cadastrar',{method:'POST'})).status,410);
 assert.equal((await get('/staging/contas/entrar',{method:'POST'})).status,410);
 assert.equal((await get('/staging/vitrine/loja/config')).status,410);
 assert.equal((await get('/staging/escritorio-unificado')).status,410);
 assert.equal((await get('/staging/cliente')).headers.get('location'),'/minha-conta');
 assert.equal((await get('/staging/loja')).headers.get('location'),'/loja');
 assert.equal((await get('/webhooks/asaas-sandbox-unificado',{method:'POST'})).status,410);
 assert.equal((await get('/internal/loop/migracao-identidade')).status,404);
 assert.equal((await get('/api/checkout/finalizar')).status,503);
 assert.deepEqual(legadoChamadas,[],'nenhuma rota publica deve chegar ao SQLite legado');
});
test('corte publico nunca admite origem remota arbitraria',()=>{
 assert.throws(()=>criarGateway({
  portaInterna:3333,senhaAcesso:SENHA,senhaAdmin:ADMIN,
  segredoOperador:OPERADOR,publicarCadastroReal:true,
  urlIdentidadeReal:'https://example.com/internal/loop/tabuleiro'
 }),/IDENTIDADE_REAL_PRIVADA_NAO_CONFIGURADA/);
});

test('fechamento de cadastro antigo nao apaga contas nem ativa rota real',async t=>{
 const legado=[];
 const antigo=await abrir((req,res)=>{
  legado.push(req.url);res.writeHead(200);res.end('LEGADO_CONSERVADO');
 });
 const gateway=criarGateway({
  portaInterna:antigo.address().port,
  senhaAcesso:SENHA,senhaAdmin:ADMIN,segredoOperador:OPERADOR,
  fecharCadastroAntigo:true
 });
 gateway.listen(0,'127.0.0.1');await once(gateway,'listening');
 t.after(async()=>{
  await new Promise(ok=>gateway.close(ok));
  await new Promise(ok=>antigo.close(ok));
 });
 const base='http://127.0.0.1:'+gateway.address().port;
 const tentativa=await fetch(base+'/staging/contas/cadastrar',{
  method:'POST',headers:{'Content-Type':'application/json'},body:'{}'
 });
 assert.equal(tentativa.status,503);
 assert.equal(legado.length,0,'cadastro antigo nao escreve em SQLite');
 const estado=await fetch(base+'/api/operador/estado');
 assert.equal(estado.status,200);
 assert.deepEqual(await estado.json(),{operador:false});
});
