'use strict';
// Materiais digitais comerciais: imutáveis, versionados e persistentes no
// catalogo-produtos.sqlite do volume /dados-reais. Sem URL pública de arquivo.
const {createHash}=require('node:crypto');
const {LIMITE_PDF}=require('../domain/material-pdf-produto-candidato-sqlite');
const ID=/^[a-z0-9-]{3,80}$/;
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function checarArquivo(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<50||bytes.length>LIMITE_PDF)
  erro('PDF_TAMANHO_INVALIDO');
 if(!/^%PDF-(?:1\.[0-7]|2\.0)\r?\n/.test(bytes.subarray(0,16).toString('latin1'))||
    !bytes.subarray(-1024).toString('latin1').includes('%%EOF'))
  erro('PDF_CONTEUDO_INVALIDO');
}
class MaterialPdfCursosReal{
 constructor({banco,catalogo}={}){
  if(typeof banco?.prepare!=='function'||typeof catalogo?.buscar!=='function')
   throw TypeError('BANCO_E_CATALOGO_OBRIGATORIOS');
  this.banco=banco;this.catalogo=catalogo;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_curso_pdf_versoes_real(',
   'produto_id TEXT NOT NULL,versao INTEGER NOT NULL CHECK(versao>0),',
   'sha256 TEXT NOT NULL,bytes INTEGER NOT NULL CHECK(bytes BETWEEN 50 AND 5242880),',
   'conteudo BLOB NOT NULL,criado_em TEXT NOT NULL,',
   'PRIMARY KEY(produto_id,versao));',
   'CREATE TABLE IF NOT EXISTS akitemm_curso_pdf_atual_real(',
   'produto_id TEXT PRIMARY KEY,versao INTEGER NOT NULL,',
   'FOREIGN KEY(produto_id,versao) REFERENCES akitemm_curso_pdf_versoes_real(produto_id,versao));',
   'CREATE TRIGGER IF NOT EXISTS akitemm_curso_pdf_imutavel_update',
   'BEFORE UPDATE ON akitemm_curso_pdf_versoes_real',
   "BEGIN SELECT RAISE(ABORT,'PDF_HISTORICO_IMUTAVEL'); END;",
   'CREATE TRIGGER IF NOT EXISTS akitemm_curso_pdf_imutavel_delete',
   'BEFORE DELETE ON akitemm_curso_pdf_versoes_real',
   "BEGIN SELECT RAISE(ABORT,'PDF_HISTORICO_IMUTAVEL'); END;"
  ].join(' '));
 }
 estado(id){
  if(typeof id!=='string'||!ID.test(id))erro('PDF_PRODUTO_INVALIDO');
  const row=this.banco.prepare([
   'SELECT a.versao, v.sha256, v.bytes, v.criado_em AS criadoEm',
   'FROM akitemm_curso_pdf_atual_real a',
   'JOIN akitemm_curso_pdf_versoes_real v ON v.produto_id=a.produto_id',
   'AND v.versao=a.versao WHERE a.produto_id=?'
  ].join(' ')).get(id);
  return {produtoId:id,arquivoAnexado:!!row,versao:row?.versao??0,
   bytes:row?.bytes??0,sha256:row?.sha256??null,
   criadoEm:row?.criadoEm??null,armazenamento:'SQLITE_COMERCIAL_REAL',
   downloadPublico:false,checkoutReal:false};
 }
 async salvar({produtoId,bytes,revisaoEsperada}={}){
  checarArquivo(bytes);
  if(!Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<0)
   erro('PDF_REVISAO_INVALIDA');
  const p=this.catalogo.buscar(produtoId);
  if(!p)erro('PDF_PRODUTO_NAO_ENCONTRADO');
  if(p.tipo!=='PDF')erro('PDF_PRODUTO_NAO_DIGITAL');
  const hash=createHash('sha256').update(bytes).digest('hex');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const atual=this.estado(produtoId);
   if(atual.versao!==revisaoEsperada)erro('PDF_CONFLITO_REVISAO');
   if(atual.sha256===hash){
    this.banco.exec('COMMIT');
    return {...atual,repetido:true};
   }
   const versao=atual.versao+1;
   this.banco.prepare([
    'INSERT INTO akitemm_curso_pdf_versoes_real',
    '(produto_id,versao,sha256,bytes,conteudo,criado_em)',
    'VALUES(?,?,?,?,?,?)'
   ].join(' ')).run(produtoId,versao,hash,bytes.length,bytes,new Date().toISOString());
   this.banco.prepare([
    'INSERT INTO akitemm_curso_pdf_atual_real(produto_id,versao)',
    'VALUES(?,?) ON CONFLICT(produto_id) DO UPDATE SET versao=excluded.versao'
   ].join(' ')).run(produtoId,versao);
   this.banco.exec('COMMIT');
   return {...this.estado(produtoId),repetido:false};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 // API interna somente para futura entrega com autorização financeira.
 // Não montar este método em rota pública ou por token de operador.
 abrirVersao({produtoId,versao}={}){
  if(typeof produtoId!=='string'||!ID.test(produtoId)||
     !Number.isSafeInteger(versao)||versao<1)erro('PDF_PEDIDO_INVALIDO');
  const row=this.banco.prepare([
   'SELECT conteudo,sha256,bytes FROM akitemm_curso_pdf_versoes_real',
   'WHERE produto_id=? AND versao=?'
  ].join(' ')).get(produtoId,versao);
  if(!row)erro('PDF_VERSAO_NAO_ENCONTRADA');
  const bytes=Buffer.from(row.conteudo);
  if(bytes.length!==row.bytes||
     createHash('sha256').update(bytes).digest('hex')!==row.sha256)
   erro('PDF_INTEGRIDADE_INVALIDA');
  return bytes;
 }
}
module.exports={MaterialPdfCursosReal};
