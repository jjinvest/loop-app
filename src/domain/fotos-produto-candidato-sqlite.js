'use strict';
// Galeria de até 10 fotos por produto, protegida por revisões, com bytes
// limpos (EXIF/GPS removido) e armazenamento no SQLite compartilhado.
// Não aceitar HTML, SVG, links externos nem caminhos fornecidos pelo usuário.
const {createHash}=require('node:crypto');
const {validar}=require('./akitemm-midia-avaliacoes-demo');
const ID=/^[a-z0-9-]{3,80}$/;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
class FotosProdutoCandidatoSQLite{
 constructor({banco,catalogo}={}){
  if(typeof banco?.exec!=='function'||typeof catalogo?.buscar!=='function')
   throw new TypeError('SQLite/catalogo obrigatorios');
  this.banco=banco;this.catalogo=catalogo;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_fotos_produto_versoes_lab(',
   'produto_id TEXT NOT NULL,posicao INTEGER NOT NULL CHECK(posicao BETWEEN 1 AND 10),',
   'versao INTEGER NOT NULL CHECK(versao>0),',
   'sha256 TEXT NOT NULL,mime TEXT NOT NULL,',
   'bytes INTEGER NOT NULL CHECK(bytes>0 AND bytes<=3145728),',
   'conteudo BLOB NOT NULL,criado_em TEXT NOT NULL,',
   'PRIMARY KEY(produto_id,posicao,versao));',
   'CREATE TABLE IF NOT EXISTS akitemm_fotos_produto_atuais_lab(',
   'produto_id TEXT NOT NULL,posicao INTEGER NOT NULL CHECK(posicao BETWEEN 1 AND 10),',
   'versao INTEGER NOT NULL,PRIMARY KEY(produto_id,posicao),',
   'FOREIGN KEY(produto_id,posicao,versao) REFERENCES',
   'akitemm_fotos_produto_versoes_lab(produto_id,posicao,versao));',
   'CREATE TRIGGER IF NOT EXISTS fotos_produto_versoes_no_update_lab',
   'BEFORE UPDATE ON akitemm_fotos_produto_versoes_lab',
   "BEGIN SELECT RAISE(ABORT,'foto historica imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS fotos_produto_versoes_no_delete_lab',
   'BEFORE DELETE ON akitemm_fotos_produto_versoes_lab',
   "BEGIN SELECT RAISE(ABORT,'foto historica imutavel'); END;"
  ].join(' '));
 }
 _validar(id,posicao){
  if(typeof id!=='string'||!ID.test(id))falha('FOTO_PRODUTO_INVALIDO');
  if(!Number.isSafeInteger(posicao)||posicao<1||posicao>10)
   falha('FOTO_POSICAO_INVALIDA');
 }
 listar(id){
  this._validar(id,1);
  const rows=this.banco.prepare([
   'SELECT a.posicao,a.versao,v.sha256,v.mime,v.bytes',
   'FROM akitemm_fotos_produto_atuais_lab a',
   'JOIN akitemm_fotos_produto_versoes_lab v',
   'ON v.produto_id=a.produto_id AND v.posicao=a.posicao AND v.versao=a.versao',
   'WHERE a.produto_id=? ORDER BY a.posicao'
  ].join(' ')).all(id);
  return {produtoId:id,fotos:rows,limite:10,somenteLaboratorio:true};
 }
 async salvar({produtoId,posicao,bytes,mime,revisaoEsperada}={}){
  this._validar(produtoId,posicao);
  if(!Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<0)
   falha('FOTO_REVISAO_INVALIDA');
  const limpa=validar({tipo:'FOTO',mime,dados:bytes});
  const produto=await this.catalogo.buscar(produtoId);
  if(!produto)falha('FOTO_PRODUTO_NAO_ENCONTRADO');
  const hash=createHash('sha256').update(limpa.dados).digest('hex');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const atual=this.banco.prepare([
    'SELECT v.versao,v.sha256 FROM akitemm_fotos_produto_atuais_lab a',
    'JOIN akitemm_fotos_produto_versoes_lab v',
    'ON v.produto_id=a.produto_id AND v.posicao=a.posicao AND v.versao=a.versao',
    'WHERE a.produto_id=? AND a.posicao=?'
   ].join(' ')).get(produtoId,posicao);
   const versao=atual?.versao||0;
   if(versao!==revisaoEsperada)falha('FOTO_CONFLITO_REVISAO');
   if(atual?.sha256===hash){
    this.banco.exec('COMMIT');
    return {produtoId,posicao,versao,repetido:true};
   }
   this.banco.prepare([
    'INSERT INTO akitemm_fotos_produto_versoes_lab',
    '(produto_id,posicao,versao,sha256,mime,bytes,conteudo,criado_em)',
    'VALUES(?,?,?,?,?,?,?,?)'
   ].join(' ')).run(produtoId,posicao,versao+1,hash,limpa.mime,
    limpa.dados.length,limpa.dados,new Date().toISOString());
   this.banco.prepare([
    'INSERT INTO akitemm_fotos_produto_atuais_lab(produto_id,posicao,versao)',
    'VALUES(?,?,?) ON CONFLICT(produto_id,posicao)',
    'DO UPDATE SET versao=excluded.versao'
   ].join(' ')).run(produtoId,posicao,versao+1);
   this.banco.exec('COMMIT');
   return {produtoId,posicao,versao:versao+1,repetido:false};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 abrir(id,posicao){
  this._validar(id,posicao);
  const row=this.banco.prepare([
   'SELECT v.conteudo,v.mime,v.sha256,v.bytes',
   'FROM akitemm_fotos_produto_atuais_lab a',
   'JOIN akitemm_fotos_produto_versoes_lab v',
   'ON v.produto_id=a.produto_id AND v.posicao=a.posicao AND v.versao=a.versao',
   'WHERE a.produto_id=? AND a.posicao=?'
  ].join(' ')).get(id,posicao);
  if(!row)falha('FOTO_NAO_ENCONTRADA');
  const dados=Buffer.from(row.conteudo);
  if(dados.length!==row.bytes||
     createHash('sha256').update(dados).digest('hex')!==row.sha256)
   falha('FOTO_INTEGRIDADE_INVALIDA');
  return {dados,mime:row.mime};
 }
}
module.exports={FotosProdutoCandidatoSQLite};