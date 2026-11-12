'use strict';
// Material real de cursos PDF, ainda em HOMOLOGACAO. O mesmo SQLite da
// loja guarda cada versao imutavel e o vinculo congelado no prepedido.
// Nao libera download com webhook bruto, posicao ou apenas pagamento PENDING.
const {createHash}=require('node:crypto');
const LIMITE_PDF=5*1024*1024;
const ID=/^[a-z0-9-]{3,80}$/;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function verificarBytes(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<50||bytes.length>LIMITE_PDF)
  falha('PDF_TAMANHO_INVALIDO');
 if(!/^%PDF-(?:1\.[0-7]|2\.0)\r?\n/.test(bytes.subarray(0,16).toString('latin1'))||
    !bytes.subarray(-1024).toString('latin1').includes('%%EOF'))
  falha('PDF_CONTEUDO_INVALIDO');
}
class MaterialPdfProdutoCandidatoSQLite{
 constructor({banco,catalogo}={}){
  if(typeof banco?.exec!=='function'||typeof banco?.prepare!=='function'||
     typeof catalogo?.buscar!=='function')
   throw new TypeError('SQLite e catalogo obrigatorios');
  this.banco=banco;this.catalogo=catalogo;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_pdf_produto_versoes_lab(',
   'produto_id TEXT NOT NULL,versao INTEGER NOT NULL CHECK(versao>0),',
   'sha256 TEXT NOT NULL,bytes INTEGER NOT NULL CHECK(bytes>=50 AND bytes<=5242880),',
   'conteudo BLOB NOT NULL,criado_em TEXT NOT NULL,',
   'PRIMARY KEY(produto_id,versao));',
   'CREATE TABLE IF NOT EXISTS akitemm_pdf_produto_atual_lab(',
   'produto_id TEXT PRIMARY KEY,versao INTEGER NOT NULL,',
   'FOREIGN KEY(produto_id,versao) REFERENCES akitemm_pdf_produto_versoes_lab(produto_id,versao));',
   'CREATE TABLE IF NOT EXISTS akitemm_pdf_pedido_vinculo_lab(',
   'prepedido_id TEXT NOT NULL REFERENCES akitemm_checkout_prepedidos_staging(prepedido_id),',
   'titular_id TEXT NOT NULL,produto_id TEXT NOT NULL,versao INTEGER NOT NULL,',
   'PRIMARY KEY(prepedido_id,produto_id),',
   'FOREIGN KEY(produto_id,versao) REFERENCES akitemm_pdf_produto_versoes_lab(produto_id,versao));',
   'CREATE INDEX IF NOT EXISTS idx_pdf_pedido_titular_lab',
   'ON akitemm_pdf_pedido_vinculo_lab(titular_id,prepedido_id);',
   'CREATE TRIGGER IF NOT EXISTS pdf_versoes_imutaveis_update_lab',
   'BEFORE UPDATE ON akitemm_pdf_produto_versoes_lab',
   "BEGIN SELECT RAISE(ABORT,'material PDF historico imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS pdf_versoes_imutaveis_delete_lab',
   'BEFORE DELETE ON akitemm_pdf_produto_versoes_lab',
   "BEGIN SELECT RAISE(ABORT,'material PDF historico imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS pdf_vinculo_imutavel_update_lab',
   'BEFORE UPDATE ON akitemm_pdf_pedido_vinculo_lab',
   "BEGIN SELECT RAISE(ABORT,'vinculo PDF historico imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS pdf_vinculo_imutavel_delete_lab',
   'BEFORE DELETE ON akitemm_pdf_pedido_vinculo_lab',
   "BEGIN SELECT RAISE(ABORT,'vinculo PDF historico imutavel'); END;"
  ].join(' '));
 }
 _validar(id){
  if(typeof id!=='string'||!ID.test(id))falha('PDF_PRODUTO_INVALIDO');
 }
 estado(id){
  this._validar(id);
  const x=this.banco.prepare([
   'SELECT a.versao,v.sha256,v.bytes,v.criado_em AS criadoEm',
   'FROM akitemm_pdf_produto_atual_lab a',
   'JOIN akitemm_pdf_produto_versoes_lab v',
   'ON v.produto_id=a.produto_id AND v.versao=a.versao',
   'WHERE a.produto_id=?'
  ].join(' ')).get(id);
  return {produtoId:id,arquivoAnexado:!!x,versao:x?.versao??0,
   bytes:x?.bytes??0,sha256:x?.sha256??null,criadoEm:x?.criadoEm??null,
   somenteLaboratorio:true};
 }
 async salvar({produtoId,bytes,revisaoEsperada}={}){
  this._validar(produtoId);verificarBytes(bytes);
  if(!Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<0)
   falha('PDF_REVISAO_INVALIDA');
  const p=await this.catalogo.buscar(produtoId);
  if(!p)falha('PDF_PRODUTO_NAO_ENCONTRADO');
  if(p.tipo!=='PDF')falha('PDF_PRODUTO_NAO_DIGITAL');
  const sha=createHash('sha256').update(bytes).digest('hex');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const atual=this.estado(produtoId);
   if(atual.versao!==revisaoEsperada)falha('PDF_CONFLITO_REVISAO');
   if(atual.sha256===sha){
    this.banco.exec('COMMIT');
    return {...atual,repetido:true};
   }
   const versao=atual.versao+1;
   this.banco.prepare([
    'INSERT INTO akitemm_pdf_produto_versoes_lab',
    '(produto_id,versao,sha256,bytes,conteudo,criado_em)',
    'VALUES(?,?,?,?,?,?)'
   ].join(' ')).run(produtoId,versao,sha,bytes.length,bytes,new Date().toISOString());
   this.banco.prepare([
    'INSERT INTO akitemm_pdf_produto_atual_lab(produto_id,versao)',
    'VALUES(?,?) ON CONFLICT(produto_id) DO UPDATE SET versao=excluded.versao'
   ].join(' ')).run(produtoId,versao);
   this.banco.exec('COMMIT');
   return {...this.estado(produtoId),repetido:false};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 // Executado DENTRO do mesmo BEGIN IMMEDIATE do prepedido, de modo que
 // pedido e versao do PDF nascem juntos ou nenhum dos dois persiste.
 vincularPedido({prepedidoId,titularId,itens}={}){
  for(const item of itens||[]){
   if(item.tipo!=='PDF')continue;
   const atual=this.estado(item.produtoId);
   // Produtos DEMONSTRATIVOS antigos nao tinham arquivo; preservar as
   // fixtures mas impedir pedidos novos de PDF do catalogo administravel.
   if(!atual.arquivoAnexado){
    if(this.catalogo.registroLocal(item.produtoId))
     falha('PDF_PRODUTO_SEM_ARQUIVO');
    continue;
   }
   this.banco.prepare([
    'INSERT INTO akitemm_pdf_pedido_vinculo_lab',
    '(prepedido_id,titular_id,produto_id,versao) VALUES(?,?,?,?)'
   ].join(' ')).run(prepedidoId,titularId,item.produtoId,atual.versao);
  }
 }
 listarPedido({prepedidoId,titularId}={}){
  return this.banco.prepare([
   'SELECT produto_id AS produtoId,versao',
   'FROM akitemm_pdf_pedido_vinculo_lab',
   'WHERE prepedido_id=? AND titular_id=? ORDER BY produto_id'
  ].join(' ')).all(prepedidoId,titularId);
 }
 abrirPedido({prepedidoId,titularId,produtoId}={}){
  this._validar(produtoId);
  const row=this.banco.prepare([
   'SELECT v.conteudo,v.sha256,v.bytes,v.versao',
   'FROM akitemm_pdf_pedido_vinculo_lab p',
   'JOIN akitemm_pdf_produto_versoes_lab v',
   'ON v.produto_id=p.produto_id AND v.versao=p.versao',
   'WHERE p.prepedido_id=? AND p.titular_id=? AND p.produto_id=?'
  ].join(' ')).get(prepedidoId,titularId,produtoId);
  if(!row)falha('PDF_PEDIDO_NAO_ENCONTRADO');
  const conteudo=Buffer.from(row.conteudo);
  if(conteudo.length!==row.bytes||
     createHash('sha256').update(conteudo).digest('hex')!==row.sha256)
   falha('PDF_INTEGRIDADE_INVALIDA');
  return {conteudo,versao:row.versao};
 }
}
module.exports={MaterialPdfProdutoCandidatoSQLite,LIMITE_PDF};
