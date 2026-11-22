'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {CatalogoMultiDistribuidoresSQLite}=
 require('../src/producao/catalogo-multidistribuidores-sqlite');
const {AuditoriaOperacionalSQLite}=
 require('../src/producao/auditoria-operacional-sqlite');
const {RepositorioCatalogoSQLite}=
 require('../src/domain/repositorio-catalogo-sqlite');
const local=id=>({
 id,nome:'Tênis Azul',tipo:'FISICO',estado:'RASCUNHO',
 descricao:'Produto em preparação',precoCentavos:null,
 entrega:'ESTOQUE_PROPRIO',fotos:[],detalhes:[],
 videoApresentacaoUrl:null
});
test('lixeira do produto comercial oculta somente rascunhos, preserva dados e auditoria',t=>{
 const banco=new DatabaseSync(':memory:');t.after(()=>banco.close());
 banco.exec('PRAGMA foreign_keys=ON');
 const auditoria=new AuditoriaOperacionalSQLite({
  banco,chaveAuditoria:randomBytes(32)
 });
 const catalogo=new CatalogoMultiDistribuidoresSQLite({
  banco,distribuidorHomologado:()=>false,auditoria
 });
 catalogo.criarProduto({produtoId:'manual-tenis01',titulo:'Tênis'});
 const atual=catalogo.buscarProdutoAdministrativo({produtoId:'manual-tenis01'});
 assert.ok(atual&&atual.ativo===false);
 const salvo=catalogo.arquivarRascunho({
  produtoId:'manual-tenis01',revisaoEsperada:atual.revisao
 });
 assert.deepEqual(salvo,{
  produtoId:'manual-tenis01',excluido:true,arquivado:true
 });
 assert.equal(catalogo.buscarProdutoAdministrativo({produtoId:'manual-tenis01'}),null);
 assert.equal(catalogo.listarProdutosAdministrativos().length,0);
 assert.equal(banco.prepare('SELECT COUNT(*) n FROM loja_real_produtos').get().n,1);
 assert.ok(banco.prepare(
  "SELECT arquivado_em FROM loja_real_produtos WHERE produto_id='manual-tenis01'"
 ).get().arquivado_em>0);
 assert.equal(banco.prepare(
  "SELECT COUNT(*) n FROM loja_real_auditoria_admin WHERE acao='PRODUTO_RASCUNHO_ARQUIVADO'"
 ).get().n,1);
 assert.throws(()=>catalogo.arquivarRascunho({
  produtoId:'manual-tenis01',revisaoEsperada:atual.revisao
 }),{codigo:'RASCUNHO_NAO_ENCONTRADO'});
 assert.throws(()=>catalogo.ativarProduto({
  produtoId:'manual-tenis01',ativo:true
 }),{codigo:'PRODUTO_COMERCIAL_NAO_EXISTE'});
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('não permite excluir publicado, nem produto que já foi publicado ou vinculado',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec('PRAGMA foreign_keys=ON');
 const auditoria=new AuditoriaOperacionalSQLite({
  banco:db,chaveAuditoria:randomBytes(32)
 });
 const c=new CatalogoMultiDistribuidoresSQLite({
  banco:db,distribuidorHomologado:()=>false,auditoria
 });
 c.criarProduto({produtoId:'tenis-publicado',titulo:'Publicado'});
 let r=c.buscarProdutoAdministrativo({produtoId:'tenis-publicado'});
 c.ativarProduto({produtoId:'tenis-publicado',ativo:true});
 assert.throws(()=>c.arquivarRascunho({
  produtoId:'tenis-publicado',revisaoEsperada:r.revisao
 }),/PRODUTO_PUBLICADO_NAO_EXCLUIR/);
 c.ativarProduto({produtoId:'tenis-publicado',ativo:false});
 r=c.buscarProdutoAdministrativo({produtoId:'tenis-publicado'});
 assert.throws(()=>c.arquivarRascunho({
  produtoId:'tenis-publicado',revisaoEsperada:r.revisao
 }),/PRODUTO_COM_HISTORICO_PUBLICACAO/);
 c.criarProduto({produtoId:'tenis-vinculado',titulo:'Vinculado'});
 db.exec("CREATE TABLE loja_real_vitrine_posicoes(posicao INTEGER PRIMARY KEY,produto_id TEXT UNIQUE)");
 db.prepare('INSERT INTO loja_real_vitrine_posicoes VALUES(1,?)')
  .run('tenis-vinculado');
 r=c.buscarProdutoAdministrativo({produtoId:'tenis-vinculado'});
 assert.throws(()=>c.arquivarRascunho({
  produtoId:'tenis-vinculado',revisaoEsperada:r.revisao
 }),/PRODUTO_JA_VINCULADO_NAO_EXCLUIR/);
 assert.equal(c.listarProdutosAdministrativos().length,2);
});
test('lixeira do acervo de mídia mantém a ficha no banco mas remove da lista',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lixeira-akitemm-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const arquivo=path.join(dir,'catalogo.sqlite');
 let repo=new RepositorioCatalogoSQLite({caminho:arquivo});
 repo.salvar({produto:local('tenis-rascunho'),revisaoEsperada:0});
 const result=repo.arquivarRascunho({id:'tenis-rascunho',revisaoEsperada:1});
 assert.equal(result.excluido,true);
 assert.equal(repo.buscar('tenis-rascunho'),null);
 assert.equal(repo.buscarRegistro('tenis-rascunho'),null);
 assert.equal(repo.listar().length,0);
 assert.equal(repo.historico('tenis-rascunho').length,1);
 assert.throws(()=>repo.salvar({
  produto:local('tenis-rascunho'),revisaoEsperada:1
 }),/RASCUNHO_ARQUIVADO_NAO_EDITAVEL/);
 repo.fechar();
 repo=new RepositorioCatalogoSQLite({caminho:arquivo});
 assert.equal(repo.listar().length,0);
 assert.equal(repo.historico('tenis-rascunho').length,1);
 repo.fechar();
 const pub=new RepositorioCatalogoSQLite({caminho:arquivo});
 t.after(()=>pub.fechar());
 pub.salvar({produto:{
  ...local('tenis-publicado'),estado:'PUBLICADO',precoCentavos:18000
 },revisaoEsperada:0});
 assert.throws(()=>pub.arquivarRascunho({
  id:'tenis-publicado',revisaoEsperada:1
 }),/PRODUTO_PUBLICADO_NAO_EXCLUIR/);
});
test('lixeira na tela usa confirmação e API real, sem quebrar visualização do cliente',()=>{
 const script=fs.readFileSync(path.join(__dirname,
  '../src/producao/operador-loja-fotos-real.js'),'utf8');
 const rotas=fs.readFileSync(path.join(__dirname,
  '../src/producao/rotas-catalogo-midia-operador.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,
  '../src/candidato/vitrine-horizontal.css'),'utf8');
 assert.match(script,/akitemm-lixeira-rascunho/g);
 assert.match(script,/window\.confirm/);
 assert.match(script,/excluir-rascunho/);
 assert.match(rotas,/autorizarOperador,validarCsrf,verificarId/);
 assert.match(css,/overflow-wrap:anywhere/);
 assert.match(css,/dialog\.akitemm-operador-editor \.akitemm-card-rascunho/);
 assert.match(css,/#akitemmAbasProdutos/);
 assert.match(css,/max-width:calc\(100vw - 12px\)/);
});
