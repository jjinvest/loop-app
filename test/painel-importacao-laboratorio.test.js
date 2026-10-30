'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { RepositorioCatalogoSQLite } = require('../src/domain/repositorio-catalogo-sqlite');
const { VinculosFornecedoresSQLite } = require('../src/domain/vinculos-fornecedores-sqlite');
const { criarAppAdminLaboratorio } = require('../src/laboratorio/servidor-catalogo');
const { criarRouterImportacaoLaboratorio } = require('../src/routes/admin-importacao-laboratorio');
const { RegistroFornecedores, CONTRATO_FORNECEDOR } = require('../src/integracoes/registro-fornecedores');

const TOKEN = 'chave-local-temporaria-de-laboratorio-123456789';
function banco(t) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-importacao-painel-'));
  t.after(() => fs.rmSync(pasta, { recursive:true, force:true }));
  const repo = new RepositorioCatalogoSQLite({ caminho:path.join(pasta,'catalogo.sqlite') });
  t.after(() => repo.fechar());
  return repo;
}
async function servidor(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await once(server,'listening');
  t.after(() => new Promise((resolve,reject) => server.close(e=>e?reject(e):resolve())));
  return 'http://127.0.0.1:' + server.address().port;
}
async function chamar(base, rota, config = {}) {
  const resp = await fetch(base+rota, {
    method:config.method || 'GET',
    headers:{
      ...(config.token === false ? {} : { Authorization:'Bearer ' + (config.token || TOKEN) }),
      ...(config.dados ? { 'Content-Type':'application/json' } : {}),
      ...(config.headers || {})
    },
    body:config.dados ? JSON.stringify(config.dados) : undefined
  });
  const texto = await resp.text();
  let dados = texto;
  try { dados=JSON.parse(texto); } catch {}
  return { status:resp.status, dados, headers:resp.headers };
}
async function previsualizar(base,fornecedorId) {
  const r=await chamar(base,'/api/admin/importacao/previa',{ method:'POST',dados:{fornecedorId} });
  assert.equal(r.status,200);
  return r.dados;
}
async function confirmar(base,previa) {
  return chamar(base,'/api/admin/importacao/aplicar',{
    method:'POST',
    dados:{
      fornecedorId:previa.fornecedorId,
      revisaoLote:previa.revisaoLote,
      confirmacao:'IMPORTAR_RASCUNHOS_SIMULADOS'
    }
  });
}

test('painel oferece fornecedores ficticios e previa nao escreve no catalogo', async t=>{
  const repo=banco(t);
  const base=await servidor(t,criarAppAdminLaboratorio({ repositorio:repo,segredo:TOKEN }));
  const f=await chamar(base,'/api/admin/importacao/fornecedores');
  assert.equal(f.status,200);
  assert.equal(f.dados.fornecedores.length,2);
  assert.ok(f.dados.fornecedores.every(x=>x.demonstrativo===true));
  const id=f.dados.fornecedores[0].id;
  const previa=await previsualizar(base,id);
  assert.equal(previa.fornecedorId,id);
  assert.equal(previa.modo,'IMPORTACAO_SIMULADA_SEM_VENDAS');
  assert.equal(previa.compraDisponivel,false);
  assert.equal(previa.publicacoesAutomaticas,false);
  assert.match(previa.revisaoLote,/^[a-f0-9]{64}$/);
  assert.ok(previa.itens.length>=2);
  assert.ok(previa.itens.every(x=>x.situacao==='NOVO_RASCUNHO'));
  assert.deepEqual(repo.listar(),[]);
});

test('confirmacao explicita cria rascunhos com SKU e reimportacao nao duplica',async t=>{
  const repo=banco(t),vinculos=new VinculosFornecedoresSQLite({repositorioCatalogo:repo});
  const base=await servidor(t,criarAppAdminLaboratorio({repositorio:repo,segredo:TOKEN}));
  const previa=await previsualizar(base,'parceiro-demo-casa');
  const semTermo=await chamar(base,'/api/admin/importacao/aplicar',{
    method:'POST', dados:{fornecedorId:previa.fornecedorId,revisaoLote:previa.revisaoLote}
  });
  assert.equal(semTermo.status,400);
  assert.equal(repo.listar().length,0);
  const r=await confirmar(base,previa);
  assert.equal(r.status,200);
  assert.equal(r.dados.criados,previa.itens.length);
  assert.equal(r.dados.publicados,0);
  assert.equal(r.dados.comprasHabilitadas,false);
  for(const item of previa.itens) {
    const produto=repo.buscar(item.produtoId);
    assert.equal(produto.estado,'RASCUNHO');
    assert.equal(produto.precoCentavos,null);
    assert.equal(produto.compraDisponivel,false);
    assert.equal(vinculos.consultar({produtoId:produto.id}).fornecedorId,'parceiro-demo-casa');
    assert.equal(vinculos.consultar({produtoId:produto.id}).sku,item.sku);
    assert.equal(repo.historico(produto.id).length,1);
  }
  const reimportacao=await confirmar(base,previa);
  assert.equal(reimportacao.status,200);
  assert.equal(reimportacao.dados.criados,0);
  assert.equal(reimportacao.dados.ignorados,previa.itens.length);
  assert.ok(previa.itens.every(x=>repo.historico(x.produtoId).length===1));
  const publico=await chamar(base,'/catalogo',{token:false});
  assert.equal(publico.status,200);
  assert.deepEqual(publico.dados.produtos,[]);
});

test('trocar distribuidor ficticio preserva itens ja importados e valida lista',async t=>{
  const repo=banco(t);
  const base=await servidor(t,criarAppAdminLaboratorio({repositorio:repo,segredo:TOKEN}));
  for(const id of ['parceiro-demo-casa','parceiro-demo-escritorio']){
    const p=await previsualizar(base,id);
    const r=await confirmar(base,p);
    assert.equal(r.status,200);
    assert.equal(r.dados.criados,p.itens.length);
  }
  assert.equal(repo.listar().length,5);
  const invalid=await chamar(base,'/api/admin/importacao/previa',{
    method:'POST',dados:{fornecedorId:'franquia-verdadeira'}
  });
  assert.equal(invalid.status,400);
  const injected=await chamar(base,'/api/admin/importacao/previa',{
    method:'POST',dados:{fornecedorId:'parceiro-demo-casa',apiToken:'segredo'}
  });
  assert.equal(injected.status,400);
  const publicEndpoint=await chamar(base,'/importacao/fornecedores',{token:false});
  assert.equal(publicEndpoint.status,404);
});

test('chave obrigatoria, hash adulterado e previa de outro distribuidor nao importam',async t=>{
  const repo=banco(t);
  const base=await servidor(t,criarAppAdminLaboratorio({repositorio:repo,segredo:TOKEN}));
  const end='/api/admin/importacao';
  assert.equal((await chamar(base,end+'/fornecedores',{token:false})).status,401);
  assert.equal((await chamar(base,end+'/fornecedores',{token:'invalida'})).status,401);
  assert.equal((await chamar(base,end+'/previa',{method:'POST',token:false,
    dados:{fornecedorId:'parceiro-demo-casa'}})).status,401);
  const p=await previsualizar(base,'parceiro-demo-casa');
  const r=await chamar(base,end+'/aplicar',{
    method:'POST',dados:{
      fornecedorId:'parceiro-demo-casa',revisaoLote:'0'.repeat(64),
      confirmacao:'IMPORTAR_RASCUNHOS_SIMULADOS'
    }
  });
  assert.equal(r.status,409);
  const trocado=await chamar(base,end+'/aplicar',{
    method:'POST',dados:{
      fornecedorId:'parceiro-demo-escritorio',revisaoLote:p.revisaoLote,
      confirmacao:'IMPORTAR_RASCUNHOS_SIMULADOS'
    }
  });
  assert.equal(trocado.status,409);
  assert.deepEqual(repo.listar(),[]);
  const origem=await chamar(base,end+'/fornecedores',{headers:{origin:'https://fora.invalid'}});
  assert.equal(origem.status,403);
});

test('se lista ficticia mudou apos a previa, deve refazer a revisao',async t=>{
  const repo=banco(t);
  const registro=new RegistroFornecedores();
  let lote=[{sku:'UNO',nome:'Exemplo A',descricao:'Produto ficticio'}];
  registro.registrar({fornecedorId:'alterna-demo',adaptador:{
    versaoContrato:CONTRATO_FORNECEDOR,
    consultarEstoque:async()=>({quantidade:0}),
    consultarStatus:async()=>({status:'PENDENTE'}),
    listarProdutos:async()=>lote
  }});
  const app=express();
  app.use(express.json({limit:'16kb'}));
  app.use('/api/admin',criarRouterImportacaoLaboratorio({
    repositorioCatalogo:repo,registroFornecedores:registro,
    fornecedores:[{id:'alterna-demo',nome:'Exemplo',demonstrativo:true}],
    segredo:TOKEN
  }));
  const base=await servidor(t,app);
  const p=await previsualizar(base,'alterna-demo');
  lote=[...lote,{sku:'DOS',nome:'Exemplo B',descricao:'Segundo ficticio'}];
  const r=await confirmar(base,p);
  assert.equal(r.status,409);
  assert.deepEqual(repo.listar(),[]);
  const novo=await previsualizar(base,'alterna-demo');
  assert.notEqual(novo.revisaoLote,p.revisaoLote);
  assert.equal((await confirmar(base,novo)).dados.criados,2);
});

test('a interface administrativa disponibiliza a lista, conferencia e aceite',async t=>{
  const repo=banco(t);
  const base=await servidor(t,criarAppAdminLaboratorio({repositorio:repo,segredo:TOKEN}));
  const html=await chamar(base,'/admin',{token:false});
  assert.equal(html.status,200);
  assert.match(html.dados,/id="areaImportacao"/);
  assert.match(html.dados,/id="fornecedorImportacao"/);
  assert.match(html.dados,/id="verPreviaImportacao"/);
  assert.match(html.dados,/id="aceitarImportacao" disabled/);
  assert.match(html.dados,/id="confirmarImportacao" disabled/);
  assert.match(html.dados,/\/admin\/importacao\.js/);
  const script=await chamar(base,'/admin/importacao.js',{token:false});
  assert.equal(script.status,200);
  assert.match(script.dados,/limparPreviaImportacao/);
  assert.match(script.dados,/confirmacao: 'IMPORTAR_RASCUNHOS_SIMULADOS'/);
  assert.match(script.headers.get('content-security-policy'),/script-src 'self'/);
  assert.doesNotMatch(script.dados,/chave-local-temporaria-de-laboratorio-123456789/);
});
