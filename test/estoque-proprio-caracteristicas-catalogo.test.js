'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {validarProduto}=require('../src/domain/catalogo');
const {CatalogoAdminCandidatoSQLite}=require('../src/domain/catalogo-admin-candidato-sqlite');
const fs=require('node:fs'),path=require('node:path');
const produto=(id='tenis-proprio')=>({
 id,nome:'Tênis em estoque próprio',tipo:'FISICO',
 estado:'RASCUNHO',descricao:'Tênis de venda direta do proprietário',
 precoCentavos:14990,entrega:'ESTOQUE_PROPRIO',
 fotos:[],videoApresentacaoUrl:null,
 detalhes:['Marca: Exemplo','Tamanho: 42','Cor: preto','Estoque: 3 pares']
});
test('cadastrar e reeditar características e estoque próprio sem checkout real',async()=>{
 const b=new DatabaseSync(':memory:');
 const base={buscar:async()=>null,listar:async()=>[]};
 try{
  const catalogo=new CatalogoAdminCandidatoSQLite({banco:b,repositorioBase:base});
  const created=await catalogo.criar({produto:produto(),
   chaveIdempotencia:'cadastro-tenis-proprio-001'});
  assert.equal(created.revisao,1);
  assert.equal(created.produto.entrega,'ESTOQUE_PROPRIO');
  assert.equal(created.produto.compraDisponivel,false);
  const updated=await catalogo.alterar({id:'tenis-proprio',revisaoEsperada:1,
   alteracoes:{estado:'PUBLICADO',detalhes:['Tamanho: 43','Cor: azul'],
    entrega:'ESTOQUE_PROPRIO'}});
  assert.equal(updated.revisao,2);
  assert.deepEqual(updated.produto.detalhes,['Tamanho: 43','Cor: azul']);
  assert.equal(updated.produto.estado,'PUBLICADO');
  assert.equal(updated.produto.compraDisponivel,false);
  assert.deepEqual((await catalogo.buscar('tenis-proprio')).detalhes,['Tamanho: 43','Cor: azul']);
  await assert.rejects(()=>catalogo.alterar({id:'tenis-proprio',revisaoEsperada:1,
   alteracoes:{detalhes:['Alteração obsoleta']}}),e=>e.codigo==='CONFLITO_REVISAO');
  assert.equal(catalogo.historico('tenis-proprio').length,2);
 }finally{b.close();}
});
test('produto físico próprio válido e fornecedor opcional, PDF continua protegido',()=>{
 assert.equal(validarProduto(produto()).entrega,'ESTOQUE_PROPRIO');
 assert.equal(validarProduto({...produto(),entrega:'FORNECEDOR_INTEGRADO'}).entrega,
  'FORNECEDOR_INTEGRADO');
 assert.throws(()=>validarProduto({...produto(),entrega:'ORIGEM_INVENTADA'}));
 assert.throws(()=>validarProduto({...produto(),tipo:'PDF',entrega:'ESTOQUE_PROPRIO'}));
});
test('formulário administrativo envia características no cadastro e edição',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../src/candidato/escritorio-admin-candidato-ui.html'),'utf8');
 const js=fs.readFileSync(path.resolve(__dirname,'../src/candidato/escritorio-admin-candidato-ui.js'),'utf8');
 assert.match(html,/id="produtoDetalhesAdmin"/);
 assert.match(html,/id="produtoEntregaAdmin"/);
 assert.match(html,/Estoque próprio/);
 assert.match(js,/alteracoes:\{nome,descricao,estado:estadoParaSalvar,precoCentavos:centavos,detalhes,entrega\}/);
 assert.match(js,/if\(publicarAposFoto&&!arquivoErro\)/);
 assert.match(js,/alteracoes:\{estado:'PUBLICADO'\}/);
 assert.match(js,/entrega,fotos:\[\],detalhes,videoApresentacaoUrl:null/);
 assert.match(js,/\$\('produtoDetalhesAdmin'\)\.value=\(item\.produto\.detalhes\|\|\[\]\)\.join/);
});
