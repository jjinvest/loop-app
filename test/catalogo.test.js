'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const { validarProduto, listarCatalogo, buscarProduto } = require('../src/domain/catalogo');
const app = require('../src/server');

async function servidor(t) {
  const server = app.listen(0, '127.0.0.1');
  await once(server,'listening');
  t.after(() => new Promise((resolve,reject) => server.close(e=>e?reject(e):resolve())));
  return 'http://127.0.0.1:' + server.address().port;
}
async function buscar(base, path, config) {
  const r = await fetch(base + path, config);
  return {status:r.status, type:r.headers.get('content-type'), body:await r.text()};
}

test('catalogo distingue envio pelo fornecedor e download de PDF, sem compra real', () => {
  const produtos = listarCatalogo();
  assert.equal(produtos.length,2);
  const fisico = produtos.find(p=>p.tipo==='FISICO');
  const curso = produtos.find(p=>p.tipo==='PDF');
  assert.equal(fisico.entrega,'FORNECEDOR_INTEGRADO');
  assert.equal(curso.entrega,'DOWNLOAD_APOS_CONFIRMACAO');
  assert.equal(fisico.compraDisponivel,false);
  assert.equal(curso.compraDisponivel,false);
  assert.equal(fisico.precoCentavos,null);
  assert.equal(curso.precoCentavos,25000);
  assert.equal(buscarProduto(fisico.id).id,fisico.id);
  assert.equal(buscarProduto('inexistente'),null);
  produtos[0].detalhes.pop();
  assert.equal(listarCatalogo()[0].detalhes.length,3);
});

test('API publica somente leitura devolve modelos e jamais habilita checkout', async (t) => {
  const base = await servidor(t);
  const r = await buscar(base,'/catalogo');
  assert.equal(r.status,200);
  const catalogo = JSON.parse(r.body);
  assert.equal(catalogo.compraDisponivel,false);
  assert.equal(catalogo.produtos.length,2);
  assert.ok(catalogo.produtos.every(p=>p.compraDisponivel===false));
  assert.ok(catalogo.produtos.every(p=>p.estado==='DEMONSTRACAO'));

  const detalhe = await buscar(base,'/catalogo/modelo-produto-fisico');
  assert.equal(detalhe.status,200);
  assert.equal(JSON.parse(detalhe.body).produto.entrega,'FORNECEDOR_INTEGRADO');
  assert.equal((await buscar(base,'/catalogo/desconhecido')).status,404);
  const post = await buscar(base,'/catalogo',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.notEqual(post.status,200);
  assert.notEqual(post.status,201);
});

test('vitrine mobile e pagina de detalhes estao disponiveis via servidor', async (t) => {
  const base=await servidor(t);
  const pagina=await buscar(base,'/');
  assert.equal(pagina.status,200);
  assert.match(pagina.body,/id="catalogoProdutos"/);
  assert.match(pagina.body,/\/js\/catalogo\.js/);
  const detalhes=await buscar(base,'/produto.html?id=modelo-curso-pdf');
  assert.equal(detalhes.status,200);
  assert.match(detalhes.body,/id="produtoFotoPrincipal"/);
  assert.match(detalhes.body,/Compra indisponível/);
  const script=await buscar(base,'/js/produto.js');
  assert.equal(script.status,200);
  assert.match(script.body,/FORNECEDOR_INTEGRADO|parceiro fornecedor/);
  const style=await buscar(base,'/css/style.css');
  assert.equal(style.status,200);
  assert.match(style.body,/@media\(max-width:600px\)/);
});

test('validacoes de produto impedem origem de foto insegura, video arbitrario e dados inconsistentes', () => {
  const base={
    id:'produto-teste',nome:'Produto de teste',tipo:'FISICO',
    estado:'PUBLICADO',descricao:'Descricao suficiente para teste',
    precoCentavos:10000,entrega:'FORNECEDOR_INTEGRADO',
    fotos:['/imagens/catalogo/foto-teste.jpg'],
    videoApresentacaoUrl:'https://www.youtube.com/watch?v=abcdefghijk',
    detalhes:['Material de teste']
  };
  const normal=validarProduto(base);
  assert.equal(normal.precoCentavos,10000);
  assert.equal(normal.compraDisponivel,false);
  assert.equal(normal.fotos.length,1);
  assert.throws(()=>validarProduto({...base,fotos:['https://site-nao-confiavel.com/teste.jpg']}),/Fotos/);
  assert.throws(()=>validarProduto({...base,videoApresentacaoUrl:'javascript:alert(1)'}),/Video|links HTTPS/);
  assert.throws(()=>validarProduto({...base,videoApresentacaoUrl:'https://example.com/player'}),/Somente links/);
  assert.throws(()=>validarProduto({...base,precoCentavos:999.90}),/[Pp]reco/);
  assert.throws(()=>validarProduto({...base,entrega:'TRANSPORTADORA'}),/entrega/);
  assert.throws(()=>validarProduto({...base,tipo:'PDF'}),/entrega/);
});
