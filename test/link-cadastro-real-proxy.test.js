'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {criarGateway}=require('../scripts/servidor-escritorio-preview-railway');
const SENHA='A'.repeat(64),ADMIN='B'.repeat(64),OPERADOR='C'.repeat(64);
const abrir=async fn=>{
 const s=http.createServer(fn);s.listen(0,'127.0.0.1');
 await once(s,'listening');return s;
};
test('dominio da loja encaminha convite real sem reusar staging ou perder loja anterior',async t=>{
 const reais=[],previas=[];
 const real=await abrir((req,res)=>{
  reais.push({path:req.url,method:req.method,host:req.headers.host,
   authorization:req.headers.authorization,
   origin:req.headers.origin});
  if(req.url==='/escritorio/VILELA'){
   res.writeHead(303,{Location:'/escritorio?ref=vilela'});res.end();return;
  }
  if(req.url.startsWith('/escritorio/')){res.writeHead(404);res.end();return;}
  if(req.url.startsWith('/minha-conta')){
   res.writeHead(200,{'Content-Type':'text/html'});
   res.end('CADASTRO_DEFINITIVO '+req.url);return;
  }
  if(req.url==='/identidade/assets/cliente.js'){
   res.writeHead(200,{'Content-Type':'application/javascript'});
   res.end('window.servico="real"');return;
  }
  if(req.url==='/api/contas/documentos'){
   res.writeHead(200,{'Content-Type':'application/json'});
   res.end(JSON.stringify({documentos:'REAIS'}));return;
  }
  if(req.url==='/api/contas/cadastrar'){
   const data=[];req.on('data',b=>data.push(b));req.on('end',()=>{
    const body=JSON.parse(Buffer.concat(data).toString());
    res.writeHead(201,{'Content-Type':'application/json'});
    res.end(JSON.stringify({contaCriada:true,
     indicadorNick:body.indicadorNick}));});return;
  }
  if(req.url==='/loja'){
   res.writeHead(200);res.end('LOJA_REAL_MESMA_SESSAO');return;
  }
  res.writeHead(404);res.end();
 });
 const previa=await abrir((req,res)=>{
  previas.push(req.url);
  res.writeHead(200);res.end('PREVIA '+req.url);
 });
 const gateway=criarGateway({
  portaInterna:previa.address().port,
  senhaAcesso:SENHA,senhaAdmin:ADMIN,segredoOperador:OPERADOR,
  validarNickIndicador:nick=>nick.toLowerCase()==='vilela',
  publicarCadastroReal:true,permitirOrigemHttpLoopback:true,
  urlIdentidadeReal:'http://127.0.0.1:'+real.address().port+
    '/internal/loop/tabuleiro'
 });
 gateway.listen(0,'127.0.0.1');await once(gateway,'listening');
 t.after(async()=>{
  await new Promise(ok=>gateway.close(ok));
  await new Promise(ok=>previa.close(ok));
  await new Promise(ok=>real.close(ok));
 });
 const base='http://127.0.0.1:'+gateway.address().port;
 const get=(url,opt={})=>fetch(base+url,{redirect:'manual',...opt});
 const convite=await get('/escritorio/VILELA');
 assert.equal(convite.status,303);
 assert.equal(convite.headers.get('location'),'/cadastro-real?ref=VILELA');
 assert.equal((await get('/escritorio/NAOEXISTE')).status,404);
 const page=await get(convite.headers.get('location'));
 assert.equal(page.status,200);
 assert.match(await page.text(),/CADASTRO_DEFINITIVO \/minha-conta\?ref=VILELA/);
 assert.equal((await get('/identidade/assets/cliente.js')).status,200);
 const docs=await get('/api/contas/documentos');
 assert.equal((await docs.json()).documentos,'REAIS');
 const create=await get('/api/contas/cadastrar',{
  method:'POST',headers:{Origin:'https://akitemmloop.com.br',
   Authorization:'Basic INSEGURA','Content-Type':'application/json'},
  body:JSON.stringify({indicadorNick:'vilela'})});
 assert.equal(create.status,201);
 assert.equal((await create.json()).indicadorNick,'vilela');
 assert.equal(reais.at(-1).authorization,undefined,
  'credenciais de visitantes ou operadores não seguem para a identidade');
 assert.equal(reais.at(-1).origin,'https://akitemmloop.com.br');
 const l=await get('/loja',{headers:{Cookie:'loop_real_s='+('a'.repeat(64))}});
 assert.equal(l.status,200);assert.equal(await l.text(),'LOJA_REAL_MESMA_SESSAO');
 assert.equal((await get('/loja')).headers.get('location'),'/staging/loja');
 assert.equal((await get('/staging/vitrine/loja/config')).status,200);
 assert.equal((await get('/escritorio')).status,401,'admin legado não é liberado');
 assert.equal((await get('/loja/VILELA')).headers.get('location'),
  '/cadastro-real?ref=VILELA&origem=loja');
 assert.ok(!previas.some(p=>p.includes('api/contas/cadastrar')));
 assert.ok(!previas.some(p=>p.includes('cadastro-real')));
});
test('proxy não habilita serviço remoto arbitrário em produção',()=>{
 assert.throws(()=>criarGateway({
  portaInterna:3333,senhaAcesso:SENHA,senhaAdmin:ADMIN,
  segredoOperador:OPERADOR,publicarCadastroReal:true,
  urlIdentidadeReal:'https://example.com/internal/loop/tabuleiro'
 }),/IDENTIDADE_REAL_PRIVADA_NAO_CONFIGURADA/);
});
