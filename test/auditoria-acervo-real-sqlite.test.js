'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createHash}=require('node:crypto');
const {auditarAcervoReal}=require('../src/producao/auditoria-acervo-real-sqlite');
function fixture(t){
 const id=new DatabaseSync(':memory:'),midia=new DatabaseSync(':memory:');
 t.after(()=>{id.close();midia.close();});
 id.exec([
  'CREATE TABLE loop_real_contas(id TEXT PRIMARY KEY);',
  'CREATE TABLE loop_real_vinculos_indicacao(indicado_id TEXT PRIMARY KEY);',
  'CREATE TABLE loja_real_produtos(produto_id TEXT PRIMARY KEY);',
  'CREATE TABLE loja_real_vitrine_posicoes(posicao INTEGER PRIMARY KEY,produto_id TEXT UNIQUE);'
 ].join(' '));
 midia.exec([
  'CREATE TABLE catalogo_produtos(id TEXT PRIMARY KEY);',
  'CREATE TABLE akitemm_fotos_produto_versoes_lab(',
  'produto_id TEXT,posicao INTEGER,versao INTEGER,sha256 TEXT,',
  'mime TEXT,bytes INTEGER,conteudo BLOB,',
  'PRIMARY KEY(produto_id,posicao,versao));',
  'CREATE TABLE akitemm_fotos_produto_atuais_lab(',
  'produto_id TEXT,posicao INTEGER,versao INTEGER,',
  'PRIMARY KEY(produto_id,posicao));'
 ].join(' '));
 id.exec([
  "INSERT INTO loop_real_contas VALUES('a'),('b');",
  "INSERT INTO loop_real_vinculos_indicacao VALUES('b');",
  "INSERT INTO loja_real_produtos VALUES('SKU_ANTIGO');",
  "INSERT INTO loja_real_vitrine_posicoes VALUES(400,'SKU_ANTIGO');"
 ].join(' '));
 midia.exec("INSERT INTO catalogo_produtos VALUES('tenis-preto');");
 const dados=Buffer.from('conteudo-confidencial-da-imagem');
 const hash=createHash('sha256').update(dados).digest('hex');
 midia.prepare([
  'INSERT INTO akitemm_fotos_produto_versoes_lab',
  '(produto_id,posicao,versao,sha256,mime,bytes,conteudo)',
  'VALUES(?,2,1,?,?,?,?)'
 ].join(' ')).run('SKU_ANTIGO',hash,'image/png',dados.length,dados);
 midia.exec([
  "INSERT INTO akitemm_fotos_produto_atuais_lab",
  "VALUES('SKU_ANTIGO',2,1);"
 ].join(' '));
 return {id,midia};
}
test('contas, vinculos, quadradinhos e fotos corretos em dois bancos isolados',t=>{
 const {id,midia}=fixture(t);
 const r=auditarAcervoReal({bancoIdentidade:id,bancoMidia:midia});
 assert.equal(r.estado,'DADOS_CONFERIDOS_SEM_BACKUP_MIDIA');
 assert.equal(r.contas,2);assert.equal(r.vinculos,1);
 assert.equal(r.quadradinhos,1);assert.equal(r.produtosPrincipais,1);
 assert.equal(r.produtosMidia,1);assert.equal(r.fotosAtuais,1);
 assert.equal(r.fotosVerificadas,1);assert.equal(r.fotosPendentes,0);
 assert.equal(r.integridadeIdentidade,true);
 assert.equal(r.integridadeMidia,true);
 assert.equal(r.backupMidiaOffsiteComprovado,false);
 assert.equal(JSON.stringify(r).includes('SKU_ANTIGO'),false);
 assert.equal(JSON.stringify(r).includes('conteudo-confidencial'),false);
});
test('mídia ausente não é declarada íntegra ou salva em backup',t=>{
 const {id}=fixture(t);
 const r=auditarAcervoReal({bancoIdentidade:id});
 assert.equal(r.estado,'MIDIA_NAO_MONTADA');
 assert.equal(r.backupMidiaOffsiteComprovado,false);
 assert.equal(r.integridadeMidia,false);
});
test('hash adulterado e slot órfão impedem conclusão de integridade',t=>{
 const {id,midia}=fixture(t);
 midia.exec([
  'UPDATE akitemm_fotos_produto_versoes_lab',
  "SET sha256='0000' WHERE produto_id='SKU_ANTIGO';"
 ].join(' '));
 id.exec("INSERT INTO loja_real_vitrine_posicoes VALUES(361,'APAGADO');");
 const r=auditarAcervoReal({bancoIdentidade:id,bancoMidia:midia});
 assert.equal(r.estado,'INCONSISTENTE');
 assert.equal(r.fotosInvalidas,1);
 assert.equal(r.slotsOrfaos,1);
});
test('hash parcial não é anunciado como auditoria concluída',t=>{
 const {id,midia}=fixture(t);
 midia.exec([
  "INSERT INTO akitemm_fotos_produto_atuais_lab",
  "VALUES('tenis-preto',1,1);"
 ].join(' '));
 midia.exec([
  'INSERT INTO akitemm_fotos_produto_versoes_lab',
  '(produto_id,posicao,versao,sha256,mime,bytes,conteudo)',
  "VALUES('tenis-preto',1,1,'0','image/png',3,X'010203');"
 ].join(' '));
 const parcial=auditarAcervoReal({
  bancoIdentidade:id,bancoMidia:midia,limiteFotos:1
 });
 assert.equal(parcial.estado,'VERIFICACAO_PARCIAL');
 assert.equal(parcial.fotosPendentes,1);
 assert.equal(parcial.backupMidiaOffsiteComprovado,false);
 const total=auditarAcervoReal({bancoIdentidade:id,bancoMidia:midia});
 assert.equal(total.estado,'INCONSISTENTE');
});
test('IDs iguais nos dois catálogos são detectados sem sobrescrita',t=>{
 const {id,midia}=fixture(t);
 midia.exec("INSERT INTO catalogo_produtos VALUES('SKU_ANTIGO');");
 const r=auditarAcervoReal({bancoIdentidade:id,bancoMidia:midia});
 assert.equal(r.estado,'INCONSISTENTE');
 assert.equal(r.idsDuplicadosEntreCatalogos,1);
});
