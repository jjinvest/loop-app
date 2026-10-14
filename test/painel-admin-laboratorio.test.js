'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { RepositorioCatalogoSQLite } = require('../src/domain/repositorio-catalogo-sqlite');
const { criarAppAdminLaboratorio } = require('../src/laboratorio/servidor-catalogo');

const CHAVE = 'segredo-desenvolvimento-temporario-1234567890';
const PRODUTO = {
  id:'modelo-smartphone',
  nome:'Smartphone demonstrativo',
  tipo:'FISICO',
  estado:'RASCUNHO',
  descricao:'Modelo de produto com logistica terceirizada para teste',
  precoCentavos:null,
  entrega:'FORNECEDOR_INTEGRADO',
  fotos:[],
  videoApresentacaoUrl:null,
  detalhes:['Entrega simulada pelo fornecedor']
};

function bancoTemporario(t) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(),'loop-admin-catalogo-'));
  t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
  const caminho = path.join(pasta,'catalogo.sqlite');
  const repositorio = new RepositorioCatalogoSQLite({ caminho });
  t.after(()=>repositorio.fechar());
  return { repositorio, caminho };
}

async function appLocal(t, repositorio, chave = CHAVE) {
  const app = criarAppAdminLaboratorio({repositorio,segredo:chave});
  const server = app.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve())));
  return 'http://127.0.0.1:' + server.address().port;
}

async function chamar(base, rota, { method='GET', dados, token=CHAVE, headers={} } = {}) {
  const resposta=await fetch(base+rota,{
    method,
    headers:{
      ...(token ? { Authorization:'Bearer '+token } : {}),
      ...(dados ? { 'content-type':'application/json' } : {}),
      ...headers
    },
    body:dados?JSON.stringify(dados):undefined
  });
  const texto=await resposta.text();
  let body=texto;
  try{body=JSON.parse(texto);}catch{}
  return {status:resposta.status,body,headers:resposta.headers};
}

// fetch pode substituir Host automaticamente; http.request permite testar DNS rebinding.
function requisicaoComHost(base, caminho, host) {
  return new Promise((resolve,reject)=>{
    const url = new URL(base + caminho);
    const req=http.request({
      hostname:url.hostname,port:url.port,path:url.pathname,
      method:'GET',
      headers:{Host:host,Authorization:'Bearer '+CHAVE}
    },res=>{
      res.resume();
      res.on('end',()=>resolve(res.statusCode));
    });
    req.on('error',reject);
    req.end();
  });
}

test('painel abre em localhost, nao divulga chave e exige autenticacao', async(t)=>{
  const {repositorio}=bancoTemporario(t);
  const base=await appLocal(t,repositorio);

  const html=await chamar(base,'/admin',{token:null});
  assert.equal(html.status,200);
  assert.match(html.body,/Cadastro de produtos/);
  assert.match(html.body,/id="formProduto"/);
  assert.match(html.body,/\/admin\/painel\.js/);
  assert.match(html.body,/\/admin\/painel\.css/);
  assert.doesNotMatch(html.body,/segredo-desenvolvimento-temporario/);
  assert.match(html.headers.get('content-security-policy'),/script-src 'self'/);
  assert.match(html.headers.get('cache-control'),/no-store/);
  assert.equal((await chamar(base,'/admin/painel.js',{token:null})).status,200);
  assert.equal((await chamar(base,'/admin/painel.css',{token:null})).status,200);

  assert.equal((await chamar(base,'/api/admin/produtos',{token:null})).status,401);
  assert.equal((await chamar(base,'/api/admin/produtos',{token:'chave-errada'})).status,401);
  assert.equal((await chamar(base,'/api/admin/produtos',{token:CHAVE})).status,200);
});

test('cadastrar rascunho, editar, publicar e manter checkout fechado',async(t)=>{
  const {repositorio}=bancoTemporario(t);
  const base=await appLocal(t,repositorio);
  const novo=await chamar(base,'/api/admin/produtos',{method:'POST',dados:PRODUTO});
  assert.equal(novo.status,201);
  assert.equal(novo.body.revisao,1);
  assert.equal(novo.body.id,PRODUTO.id);

  const visivel1=await chamar(base,'/catalogo',{token:null});
  assert.deepEqual(visivel1.body.produtos,[]);
  assert.equal((await chamar(base,'/catalogo/'+PRODUTO.id,{token:null})).status,404);

  const admin=await chamar(base,'/api/admin/produtos/'+PRODUTO.id);
  assert.equal(admin.body.produto.estado,'RASCUNHO');
  assert.equal(admin.body.revisao,1);

  const alterado=await chamar(base,'/api/admin/produtos/'+PRODUTO.id,{
    method:'PATCH',
    dados:{revisaoEsperada:1,alteracoes:{
      nome:'Smartphone revisado',
      descricao:'Nova descricao autorizada no painel',
      estado:'PUBLICADO',
      precoCentavos:12990,
      fotos:['/imagens/catalogo/foto-produto.webp'],
      videoApresentacaoUrl:'https://youtu.be/abcdefghijk'
    }}
  });
  assert.equal(alterado.status,200);
  assert.equal(alterado.body.revisao,2);

  const vitrine=await chamar(base,'/catalogo',{token:null});
  assert.equal(vitrine.body.produtos.length,1);
  assert.equal(vitrine.body.produtos[0].nome,'Smartphone revisado');
  assert.equal(vitrine.body.produtos[0].precoCentavos,12990);
  assert.deepEqual(vitrine.body.produtos[0].fotos,['/imagens/catalogo/foto-produto.webp']);
  assert.equal(vitrine.body.produtos[0].compraDisponivel,false);

  const ocultar=await chamar(base,'/api/admin/produtos/'+PRODUTO.id,{
    method:'PATCH',
    dados:{revisaoEsperada:2,alteracoes:{estado:'RASCUNHO'}}
  });
  assert.equal(ocultar.status,200);
  assert.deepEqual((await chamar(base,'/catalogo',{token:null})).body.produtos,[]);
});

test('produto continua salvo depois de reabrir o banco de dados',async(t)=>{
  const {repositorio,caminho}=bancoTemporario(t);
  const base=await appLocal(t,repositorio);
  assert.equal((await chamar(base,'/api/admin/produtos',{method:'POST',dados:PRODUTO})).status,201);

  const outra=new RepositorioCatalogoSQLite({caminho});
  t.after(()=>outra.fechar());
  assert.equal(outra.buscar(PRODUTO.id).nome,PRODUTO.nome);
  const segundo=await appLocal(t,outra);
  const resposta=await chamar(segundo,'/api/admin/produtos/'+PRODUTO.id);
  assert.equal(resposta.body.revisao,1);
  assert.equal(resposta.body.produto.id,PRODUTO.id);
});

test('duas telas com revisao antiga nao sobrescrevem mudancas',async(t)=>{
  const {repositorio}=bancoTemporario(t);
  const base=await appLocal(t,repositorio);
  await chamar(base,'/api/admin/produtos',{method:'POST',dados:PRODUTO});
  const primeira=await chamar(base,'/api/admin/produtos/'+PRODUTO.id,{
    method:'PATCH',dados:{revisaoEsperada:1,alteracoes:{nome:'Alterado pela primeira tela'}}
  });
  assert.equal(primeira.body.revisao,2);
  const antiga=await chamar(base,'/api/admin/produtos/'+PRODUTO.id,{
    method:'PATCH',dados:{revisaoEsperada:1,alteracoes:{nome:'Sobrescrita indevida'}}
  });
  assert.equal(antiga.status,409);
  assert.equal((await chamar(base,'/api/admin/produtos/'+PRODUTO.id)).body.produto.nome,
    'Alterado pela primeira tela');
});

test('bloquear campos extras, mudancas de ID e publicacao sem preco',async(t)=>{
  const {repositorio}=bancoTemporario(t);
  const base=await appLocal(t,repositorio);
  assert.equal((await chamar(base,'/api/admin/produtos',{
    method:'POST',dados:{...PRODUTO,tokenFornecedor:'SEGREDO'}
  })).status,400);
  assert.equal((await chamar(base,'/api/admin/produtos',{
    method:'POST',dados:{...PRODUTO,estado:'PUBLICADO'}
  })).status,400);
  assert.equal((await chamar(base,'/api/admin/produtos',{method:'POST',dados:PRODUTO})).status,201);
  assert.equal((await chamar(base,'/api/admin/produtos',{
    method:'POST',dados:PRODUTO
  })).status,409);
  assert.equal((await chamar(base,'/api/admin/produtos/'+PRODUTO.id,{
    method:'PATCH',dados:{revisaoEsperada:1,alteracoes:{id:'outro-id'}}
  })).status,400);
  assert.equal((await chamar(base,'/api/admin/produtos/'+PRODUTO.id,{
    method:'PATCH',dados:{revisaoEsperada:1,alteracoes:{estado:'PUBLICADO'}}
  })).status,400);
  assert.equal((await chamar(base,'/api/admin/produtos/'+PRODUTO.id)).body.revisao,1);
  assert.equal((await chamar(base,'/api/admin/produtos',{
    method:'POST',dados:PRODUTO,headers:{'content-type':'text/plain'}
  })).status,415);
});

test('proteger contra host forjado, origem externa e producao',async(t)=>{
  const {repositorio}=bancoTemporario(t);
  const base=await appLocal(t,repositorio);
  assert.equal(await requisicaoComHost(base, '/api/admin/produtos', 'site-malicioso.example'),403);
  assert.equal((await chamar(base,'/api/admin/produtos',{
    headers:{'origin':'https://site-malicioso.example'}
  })).status,403);
  assert.equal(await requisicaoComHost(base, '/admin', 'site-malicioso.example'),403);
  assert.throws(()=>criarAppAdminLaboratorio({repositorio,segredo:'curto'}),/32 caracteres/);

  const anterior=process.env.NODE_ENV;
  process.env.NODE_ENV='production';
  try{
    assert.equal((await chamar(base,'/api/admin/produtos')).status,403);
    assert.equal((await chamar(base,'/admin',{token:null})).status,403);
    assert.throws(()=>criarAppAdminLaboratorio({repositorio,segredo:CHAVE}),/producao/);
  }finally{
    if(anterior===undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV=anterior;
  }
});
