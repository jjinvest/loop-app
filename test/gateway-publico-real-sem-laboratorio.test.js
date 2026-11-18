'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {criarGatewayPublicoReal,validarConfiguracao,caminhoSeguro,
 cookiesReais,iniciar}=require('../scripts/iniciar-gateway-publico-real-loop');
const {provarLigacaoPrivada}=
 require('../scripts/provar-ligacao-privada-loop');
const PUBLICO='https://akitemmloop.com.br';
const CANONICO='https://loop.com.br';
async function abrir(handler){
 const s=http.createServer(handler);
 s.listen(0,'127.0.0.1');await once(s,'listening');return s;
}
test('gateway real nao carrega o LAB e so aceita destino Railway interno',()=>{
 const fs=require('node:fs');
 const fonte=fs.readFileSync(require.resolve(
  '../scripts/iniciar-gateway-publico-real-loop'),'utf8');
 for(const proibido of [
  "require('../src/candidato/servidor-loja-escritorio-candidato')",
  'catalogoFicticioCheckout(', 'AsaasSandboxLojaV6',
  'new DatabaseSync(', 'setInterval(', 'LOOP_MODO_SIMULACAO'
 ])assert.equal(fonte.includes(proibido),false,proibido);
 assert.throws(()=>validarConfiguracao({
  urlIdentidadeReal:'https://loop.com.br',origemReal:CANONICO
 }),/GATEWAY_REAL_DESTINO_INTERNO_OBRIGATORIO/);
 assert.throws(()=>validarConfiguracao({
  urlIdentidadeReal:'http://externo.invalid',origemReal:CANONICO
 }),/GATEWAY_REAL_DESTINO_INTERNO_OBRIGATORIO/);
 assert.throws(()=>validarConfiguracao({
  urlIdentidadeReal:'http://loop-identidade-real.railway.internal',
  origemReal:'http://loop.com.br'
 }),/GATEWAY_REAL_ORIGEM_INVALIDA/);
 assert.equal(validarConfiguracao({
  urlIdentidadeReal:'http://loop-identidade-real.railway.internal:8080',
  origemReal:CANONICO
 }).alvo.hostname,'loop-identidade-real.railway.internal');
 assert.throws(()=>iniciar({NODE_ENV:'production',PORT:'8080'}),
  /GATEWAY_PUBLICO_REAL_NAO_AUTORIZADO/);
});
test('sonda de preflight nunca aceita proxy apontado a servidor estranho',async t=>{
 const outro=await abrir((req,res)=>{
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify({estado:'LABORATORIO',
   financeiroReal:false}));
 });
 t.after(()=>new Promise(ok=>outro.close(ok)));
 await assert.rejects(provarLigacaoPrivada({
  alvo:new URL('http://127.0.0.1:'+outro.address().port),
  origemReal:CANONICO
 }),/PROVA_PRIVADA_NAO_E_IDENTIDADE_REAL/);
});
test('rotas reais sem ensaio, alias de cadastro e path traversal bloqueados',()=>{
 for(const p of ['/staging/cliente','/staging/contas/entrar',
  '/laboratorio/compras','/api/loop/tesouraria-ensaio']){
  assert.equal(caminhoSeguro(p).status,410,p);
 }
 for(const p of ['/internal/loop/migracao-identidade',
  '/api/checkout/finalizar','/preview','/operador-duplicado']){
  assert.equal(caminhoSeguro(p).status,404,p);
 }
 assert.equal(caminhoSeguro('/api/loop/posicoes/123/confirmar-ensaio').status,410);
 assert.deepEqual(caminhoSeguro('/cadastro-real'),{path:'/minha-conta'});
 assert.deepEqual(caminhoSeguro('/'),{status:302,location:'/minha-conta'});
 assert.equal(caminhoSeguro('/loja/VILELA').path,'/loja/VILELA');
 assert.equal(caminhoSeguro('/api/admin/catalogo-midia/slots/361').path,
  '/api/admin/catalogo-midia/slots/361');
 assert.equal(caminhoSeguro('/identidade/assets/operador-fotos.js').path,
  '/identidade/assets/operador-fotos.js');
 assert.equal(caminhoSeguro('/api/financeiro/saques').path,'/api/financeiro/saques');
});
test('cookies reais retidos, tokens da previa descartados e duplicados barrados',()=>{
 const user='loop_real_s='+'a'.repeat(64);
 const admin='akitemm_real_admin_v1='+'b'.repeat(64);
 const antigos='akitemm_preview_admin_v2=v2.fake; akitemm_preview_access=velho';
 assert.equal(cookiesReais(antigos+'; '+user+'; '+admin),user+'; '+admin);
 assert.equal(cookiesReais(antigos),null);
 assert.throws(()=>cookiesReais(user+'; '+user),/GATEWAY_REAL_COOKIE_INVALIDO/);
 assert.throws(()=>cookiesReais('loop_real_s=NAO_HEX'),
  /GATEWAY_REAL_COOKIE_INVALIDO/);
});
test('proxy de mesma origem: login, consulta e foto com conta real; sem PSP nem LAB',async t=>{
 const chamadas=[];
 const real=await abrir((req,res)=>{
  const blocos=[];req.on('data',x=>blocos.push(x));
  req.on('end',()=>{
   chamadas.push({path:req.url,method:req.method,host:req.headers.host,
    origin:req.headers.origin,authorization:req.headers.authorization,
    token:req.headers['x-loop-interservice-token'],
    cookie:req.headers.cookie,body:Buffer.concat(blocos).toString('utf8')});
   if(req.url==='/healthz'){
    res.writeHead(200,{'Content-Type':'application/json'});
    return res.end(JSON.stringify({estado:'SERVICO_IDENTIDADE_SEPARADO',
     financeiroReal:false}));
   }
   if(req.url==='/readyz'){
    res.writeHead(503);return res.end('CADASTRO_FECHADO');
   }
   if(req.url==='/escritorio/VILELA'){
    res.writeHead(303,{Location:CANONICO+'/escritorio?ref=VILELA'});
    return res.end();
   }
   if(req.url==='/api/operador/entrar'){
    assert.equal(req.headers.origin,CANONICO);
    res.writeHead(200,{'Content-Type':'application/json',
     'Set-Cookie':['akitemm_real_admin_v1='+'b'.repeat(64)+
      '; Domain=loop.com.br; HttpOnly; Secure; SameSite=Strict; Path=/']});
    return res.end(JSON.stringify({operador:true}));
   }
   if(req.url==='/api/contas/entrar'){
    assert.equal(req.headers.origin,CANONICO);
    res.writeHead(200,{'Content-Type':'application/json',
     'Set-Cookie':['loop_real_s='+'a'.repeat(64)+
      '; Secure; HttpOnly; SameSite=Strict; Path=/']});
    return res.end(JSON.stringify({nick:'VILELA',financeiroReal:false}));
   }
   if(req.url==='/api/loja/produtos/produto-361/foto/1'){
    res.writeHead(200,{'Content-Type':'image/png'});
    return res.end(Buffer.from([137,80,78,71,13,10,26,10]));
   }
   if(req.url==='/api/admin/catalogo-midia/slots/361'){
    if(req.method==='POST'&&req.headers.origin===CANONICO&&
       req.headers['x-loop-admin-csrf']==='CSRF_VALIDO'){
     res.writeHead(201,{'Content-Type':'application/json'});
     return res.end(JSON.stringify({posicao:361,produtoId:'produto-361'}));
    }
    res.writeHead(403);return res.end();
   }
   if(req.url==='/minha-conta'||req.url==='/loja'||req.url==='/administrador'){
    res.writeHead(200,{'Content-Type':'text/html'});
    return res.end('<html>MESMA TELA REAL</html>');
   }
   res.writeHead(404);res.end();
  });
 });
 const gateway=criarGatewayPublicoReal({
  urlIdentidadeReal:'http://127.0.0.1:'+real.address().port,
  origemReal:CANONICO,testeLoopback:true,
  origensPublicas:[PUBLICO]
 });
 gateway.listen(0,'127.0.0.1');await once(gateway,'listening');
 t.after(async()=>{
  await new Promise(ok=>gateway.close(ok));
  await new Promise(ok=>real.close(ok));
 });
 const base='http://127.0.0.1:'+gateway.address().port;
 const get=(path,o={})=>fetch(base+path,{redirect:'manual',...o});
 assert.equal((await get('/')).headers.get('location'),'/minha-conta');
 assert.equal((await get('/minha-conta')).status,200);
 assert.equal((await get('/loja')).status,200);
 assert.equal((await get('/administrador')).status,200);
 const redirect=await get('/escritorio/VILELA');
 assert.equal(redirect.status,303);
 assert.equal(redirect.headers.get('location'),'/escritorio?ref=VILELA');
 assert.equal((await get('/healthz')).status,200);
 assert.equal((await get('/readyz')).status,503);
 const login=await get('/api/operador/entrar',{method:'POST',
  headers:{Origin:base,'Content-Type':'application/json',
   'X-Loop-Interservice-Token':'FORJADO',
   Authorization:'Basic NAO_REPASSAR'},
  body:JSON.stringify({nick:'operador',senha:'segredo-ensaio'})});
 assert.equal(login.status,200);
 assert.match(login.headers.get('set-cookie'),/^akitemm_real_admin_v1=/);
 assert.doesNotMatch(login.headers.get('set-cookie'),/Domain=/i);
 assert.equal(chamadas.at(-1).authorization,undefined);
 assert.equal(chamadas.at(-1).token,undefined);
 assert.equal(chamadas.at(-1).origin,CANONICO);
 const cliente=await get('/api/contas/entrar',{method:'POST',
  headers:{Origin:base,'Content-Type':'application/json'},
  body:JSON.stringify({nick:'VILELA',senha:'senha-de-teste'})});
 assert.equal(cliente.status,200);
 assert.match(cliente.headers.get('set-cookie'),/^loop_real_s=/);
 const foto=await get('/api/loja/produtos/produto-361/foto/1',{
  headers:{Cookie:'akitemm_preview_access=antigo; loop_real_s='+
   'a'.repeat(64)}});
 assert.equal(foto.status,200);
 assert.match(foto.headers.get('content-type'),/image\/png/);
 assert.equal(chamadas.at(-1).cookie,'loop_real_s='+'a'.repeat(64));
 const vinculo=await get('/api/admin/catalogo-midia/slots/361',{
  method:'POST',headers:{Origin:base,'Content-Type':'application/json',
   Cookie:'akitemm_preview_admin_v2=legado; akitemm_real_admin_v1='+
    'b'.repeat(64),
   'X-Loop-Admin-Csrf':'CSRF_VALIDO'},
  body:JSON.stringify({produtoId:'produto-361',revisaoEsperada:0})});
 assert.equal(vinculo.status,201);
 assert.equal((await vinculo.json()).posicao,361);
 assert.equal(chamadas.at(-1).cookie,'akitemm_real_admin_v1='+'b'.repeat(64));
 assert.equal(chamadas.at(-1).origin,CANONICO);
 assert.equal(chamadas.at(-1).body,
  JSON.stringify({produtoId:'produto-361',revisaoEsperada:0}));
 const chamadasValidas=chamadas.length;
 for(const x of ['/staging/cliente','/staging/loja',
   '/staging/contas/cadastrar','/laboratorio/compras']){
  assert.equal((await get(x)).status,410,x);
 }
 for(const x of ['/internal/loop/tabuleiro','/api/checkout/finalizar']){
  assert.equal((await get(x)).status,404,x);
 }
 for(const x of ['/escritorio/../internal/loop/tabuleiro',
   '/api/%2e%2e/internal','/loja//VILELA']){
  const resposta=await get(x,{redirect:'manual'});
  assert.notEqual(resposta.status,200,x);
 }
 assert.equal((await get('/api/operador/entrar',{method:'POST',
  headers:{Origin:'https://malicioso.invalid','Content-Type':'application/json'},
  body:'{}'})).status,403);
 assert.equal((await get('/api/operador/entrar',{method:'POST',
  headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
 assert.equal((await get('/api/operador/entrar',{method:'POST',
  headers:{Origin:base,'Content-Type':'application/json'},
  body:Buffer.alloc(4*1024*1024+1)})).status,413);
 assert.equal(chamadas.length,chamadasValidas);
});
test('falha do servidor real nunca retorna ao banco legado',async t=>{
 const real=await abrir((req,res)=>{res.destroy();});
 const gateway=criarGatewayPublicoReal({
  urlIdentidadeReal:'http://127.0.0.1:'+real.address().port,
  origemReal:CANONICO,testeLoopback:true
 });
 gateway.listen(0,'127.0.0.1');await once(gateway,'listening');
 t.after(async()=>{
  await new Promise(ok=>gateway.close(ok));
  await new Promise(ok=>real.close(ok));
 });
 const res=await fetch('http://127.0.0.1:'+gateway.address().port+'/minha-conta');
 assert.equal(res.status,502);
 assert.match(await res.text(),/Sistema real indisponível/);
});
