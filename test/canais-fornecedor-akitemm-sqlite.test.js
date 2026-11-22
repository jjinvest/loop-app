'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const {AuditoriaOperacionalSQLite}=require('../src/producao/auditoria-operacional-sqlite');
const {AnunciosManuaisAkitemmSQLite}=
 require('../src/producao/anuncios-manuais-akitemm-sqlite');
const {linhasCsv}=require('../src/producao/canais-fornecedor-akitemm-sqlite');
function preparar({auditar=false}={}){
 const banco=new DatabaseSync(':memory:');
 banco.exec('PRAGMA foreign_keys=ON');
 banco.exec([
  'CREATE TABLE loja_real_produtos(',
  'produto_id TEXT PRIMARY KEY,titulo TEXT NOT NULL);',
  "INSERT INTO loja_real_produtos VALUES('camisa-1','Camisa'),('bone-2','Bone');"
 ].join(' '));
 const auditoria=auditar?new AuditoriaOperacionalSQLite({
  banco,chaveAuditoria:randomBytes(32)
 }):null;
 return {banco,anuncios:new AnunciosManuaisAkitemmSQLite({banco,auditoria}),
  auditoria};
}
const CSV='\uFEFFproduto_id;fornecedor;sku_fornecedor;preco_vitrine;quantidade\r\n'+
 'camisa-1;Distribuidor Manual;SKU-123;197,90;5\r\n'+
 'bone-2;"Fornecedor; Comercial";BON-20;59,90;0\r\n';
test('fornecedor sem API grava nome, contato e SKU no mesmo SQLite e não conecta API',()=>{
 const {banco,anuncios,auditoria}=preparar({auditar:true});
 try{
  const canal=anuncios.canais;
  const atual=canal.consultar('camisa-1');
  assert.equal(atual.canal,'PROPRIO');
  assert.equal(atual.conectado,false);
  const salvo=canal.configurar({
   produtoId:'camisa-1',canal:'FORNECEDOR_MANUAL',
   fornecedorNome:'Distribuidor de roupas',
   fornecedorSku:'CAM-001',
   fornecedorContato:'compras@distribuidor.example',
   revisaoEsperada:0
  });
  assert.equal(salvo.canal,'FORNECEDOR_MANUAL');
  assert.equal(salvo.revisao,1);
  assert.equal(salvo.fornecedorContato,'compras@distribuidor.example');
  assert.equal(salvo.automatico,false);
  assert.equal(auditoria.verificar().total,1);
  const reiniciada=new AnunciosManuaisAkitemmSQLite({banco});
  assert.deepEqual(reiniciada.canais.consultar('camisa-1'),salvo);
  assert.throws(()=>canal.configurar({
   produtoId:'camisa-1',canal:'API_PENDENTE',
   fornecedorNome:'Distribuidor',fornecedorSku:'CAM-001',
   fornecedorContato:'contato@example.org',revisaoEsperada:1
  }),/CANAL_CONEXAO_EXTERNA_PENDENTE/);
  assert.throws(()=>canal.configurar({
   produtoId:'camisa-1',canal:'FORNECEDOR_MANUAL',
   fornecedorNome:'Distribuidor',fornecedorSku:'CAM-001',
   fornecedorContato:'',revisaoEsperada:1
  }),/CANAL_CONTATO_OBRIGATORIO/);
  assert.throws(()=>canal.configurar({
   produtoId:'camisa-1',canal:'FORNECEDOR_MANUAL',
   fornecedorNome:'Distribuidor',fornecedorSku:'CAM-001',
   fornecedorContato:'contato@example.org',revisaoEsperada:0
  }),/CANAL_REVISAO_CONCORRENTE/);
  assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{banco.close();}
});
test('prévia CSV não altera dados, importação com confirmação faz lote atômico',()=>{
 const {banco,anuncios,auditoria}=preparar({auditar:true});
 try{
  const canal=anuncios.canais;
  const itens=linhasCsv(CSV);
  assert.equal(itens.length,2);
  assert.equal(itens[1].fornecedor,'Fornecedor; Comercial');
  const previa=canal.preverCsv(CSV);
  assert.equal(previa.total,2);
  assert.equal(previa.gravou,false);
  assert.equal(anuncios.consultar('camisa-1').revisao,0);
  assert.equal(canal.consultar('camisa-1').revisao,0);
  assert.throws(()=>canal.importarCsv(CSV,{
   hash:'x'.repeat(64),revisoes:[[0,0],[0,0]]
  }),/PLANILHA_PREVIA_DESATUALIZADA/);
  const aplicado=canal.importarCsv(CSV,{
   hash:previa.hash,revisoes:previa.itens.map(x=>[
    x.revisaoAnuncio,x.revisaoCanal
   ])
  });
  assert.equal(aplicado.gravou,true);
  assert.equal(aplicado.total,2);
  assert.equal(auditoria.verificar().total,2);
  assert.equal(aplicado.pagamentoHabilitado,false);
  assert.equal(aplicado.estoqueConfirmado,false);
  assert.equal(anuncios.consultar('camisa-1').precoCentavos,19790);
  assert.equal(anuncios.consultar('camisa-1').quantidade,5);
  assert.equal(anuncios.consultar('bone-2').quantidade,0);
  assert.equal(canal.consultar('camisa-1').canal,'PLANILHA_CSV');
  assert.equal(canal.consultar('camisa-1').fornecedorSku,'SKU-123');
  assert.equal(canal.consultar('camisa-1').conectado,false);
  assert.equal(anuncios.projetar([{produtoId:'camisa-1'}])[0].checkoutReal,false);
  assert.throws(()=>canal.importarCsv(CSV,{
   hash:previa.hash,revisoes:[[0,0],[0,0]]
  }),/PLANILHA_PREVIA_DESATUALIZADA/);
  assert.equal(anuncios.consultar('camisa-1').revisao,1);
  assert.equal(banco.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.equal(banco.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{banco.close();}
});
test('CSV não cria novos produtos ou altera parcialmente lote inválido',()=>{
 const {banco,anuncios}=preparar();
 try{
  const canal=anuncios.canais;
  const invalido=CSV.replace('bone-2;','inexistente;');
  assert.throws(()=>canal.preverCsv(invalido),
   /PLANILHA_PRODUTO_NAO_CADASTRADO_inexistente/);
  assert.equal(anuncios.consultar('camisa-1').revisao,0);
  assert.equal(canal.consultar('camisa-1').revisao,0);
  const repetido=CSV.replace('bone-2;','camisa-1;');
  assert.throws(()=>canal.preverCsv(repetido),/PLANILHA_DADOS_INVALIDOS/);
  assert.throws(()=>canal.preverCsv(CSV.replace('197,90','=197+90')),
   /PLANILHA_DADOS_INVALIDOS/);
  assert.equal(banco.prepare(
   'SELECT COUNT(*) AS n FROM loja_real_anuncios_operador'
  ).get().n,0);
 }finally{banco.close();}
});
