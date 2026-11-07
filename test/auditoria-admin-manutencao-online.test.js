'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {AuditoriaOperacionalSQLite}=
 require('../src/producao/auditoria-operacional-sqlite');
const {CatalogoMultiDistribuidoresSQLite}=
 require('../src/producao/catalogo-multidistribuidores-sqlite');
const {ControleEconomicoLojaSQLite}=
 require('../src/producao/controle-economico-loja-sqlite');

test('auditabilidade: criar/editar durante operação registra cadeia HMAC e mantém histórico',t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 t.after(()=>banco.close());
 const chaveAuditoria=randomBytes(32);
 const trilha=new AuditoriaOperacionalSQLite({banco,chaveAuditoria});
 const catalogo=new CatalogoMultiDistribuidoresSQLite({
  banco,distribuidorHomologado:()=>false,auditoria:trilha
 });
 const controle=new ControleEconomicoLojaSQLite({banco,auditoria:trilha});
 assert.deepEqual(trilha.verificar().total,0);
 catalogo.criarProduto({produtoId:'produto_A',titulo:'Produto A'});
 catalogo.vincularOferta({produtoId:'produto_A',distribuidorId:'distribuidor_A',
  sku:'SKU_A_1',precoUnitCentavos:19000});
 controle.definirCusto({produtoId:'produto_A',
  distribuidorId:'distribuidor_A',custoUnitCentavos:12000});
 controle.atualizarPrecoVenda({produtoId:'produto_A',
  distribuidorId:'distribuidor_A',precoAnteriorCentavos:19000,
  precoVendaCentavos:20000,revisaoPrecoEsperada:0});
 const prova=trilha.verificar();
 assert.equal(prova.integra,true);
 assert.equal(prova.total,4);
 assert.match(prova.hashUltimo,/^[a-f0-9]{64}$/);
 assert.equal(trilha.listar().length,4);
 assert.equal(controle.consultarOferta({
  produtoId:'produto_A',distribuidorId:'distribuidor_A'
 }).diferencaBrutaCentavos,8000);
 assert.equal(catalogo.listarVitrine().length,0);
 assert.throws(()=>banco.prepare([
  'UPDATE loja_real_auditoria_admin SET acao=? WHERE id=1'
 ]).run('APAGADO'),/AUDITORIA_IMUTAVEL/);
 assert.throws(()=>banco.prepare(
  'DELETE FROM loja_real_auditoria_admin WHERE id=1'
 ).run(),/AUDITORIA_IMUTAVEL/);
 assert.throws(()=>trilha.registrar({
  acao:'CUSTO_FORNECEDOR_ALTERADO',ator:'ADMIN_COMERCIAL',
  entidade:'produto_A',antes:{cpf:'123'},depois:{custo:1}
 }),{codigo:'AUDITORIA_DADOS_SENSIVEIS_OU_EXCESSIVOS'});
 assert.equal(trilha.verificar().total,4);
 assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});

test('se escrita da auditoria falha, preço e custo são revertidos na mesma transação',t=>{
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 t.after(()=>banco.close());
 const permitir=new CatalogoMultiDistribuidoresSQLite({
  banco,distribuidorHomologado:()=>false
 });
 permitir.criarProduto({produtoId:'produto_A',titulo:'Produto A'});
 permitir.vincularOferta({produtoId:'produto_A',
  distribuidorId:'distribuidor_A',sku:'SKU_A_1',precoUnitCentavos:10000});
 const fake={db:banco,registrar:()=>{throw Error('AUDITORIA_INDISPONIVEL')}};
 const controle=new ControleEconomicoLojaSQLite({banco,auditoria:fake});
 assert.throws(()=>controle.definirCusto({
  produtoId:'produto_A',distribuidorId:'distribuidor_A',
  custoUnitCentavos:8000
 }),/AUDITORIA_INDISPONIVEL/);
 assert.equal(controle.consultarOferta({
  produtoId:'produto_A',distribuidorId:'distribuidor_A'
 }).custoFornecedorCentavos,null);
 assert.throws(()=>controle.atualizarPrecoVenda({
  produtoId:'produto_A',distribuidorId:'distribuidor_A',
  precoAnteriorCentavos:10000,precoVendaCentavos:11000,
  revisaoPrecoEsperada:0
 }),/AUDITORIA_INDISPONIVEL/);
 assert.equal(controle.consultarOferta({
  produtoId:'produto_A',distribuidorId:'distribuidor_A'
 }).precoVendaCentavos,10000);
 const catalogo=new CatalogoMultiDistribuidoresSQLite({
  banco,distribuidorHomologado:()=>false,auditoria:fake
 });
 assert.throws(()=>catalogo.criarProduto({
  produtoId:'produto_B',titulo:'Produto B'
 }),/AUDITORIA_INDISPONIVEL/);
 assert.equal(catalogo.listarProdutosAdministrativos().length,1);
 assert.throws(()=>catalogo.vincularOferta({
  produtoId:'produto_A',distribuidorId:'distribuidor_B',
  sku:'SKU_B_1',precoUnitCentavos:7000
 }),/AUDITORIA_INDISPONIVEL/);
 assert.equal(controle.listarOfertas().length,1);
 assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('a assinatura detecta alteração fora da aplicação mesmo sem triggers',t=>{
 const banco=new DatabaseSync(':memory:');
 t.after(()=>banco.close());
 const chaveAuditoria=randomBytes(32);
 const log=new AuditoriaOperacionalSQLite({banco,chaveAuditoria});
 log.registrar({acao:'PRODUTO_CRIADO',ator:'ADMIN_COMERCIAL',
  entidade:'PRODUTO_1',antes:{existe:false},depois:{existe:true}});
 const validado=log.verificar();
 assert.equal(validado.total,1);
 // Não simulamos uma fraude com UPDATE porque os triggers já bloqueiam.
 // Abrir um mesmo banco com outra chave de custódia deve falhar verificando.
 const auditorComChaveErrada=new AuditoriaOperacionalSQLite({
  banco,chaveAuditoria:randomBytes(32)
 });
 assert.throws(()=>auditorComChaveErrada.verificar(),
  {codigo:'AUDITORIA_CADEIA_DIVERGENTE'});
 assert.equal(log.verificar().total,1);
});
