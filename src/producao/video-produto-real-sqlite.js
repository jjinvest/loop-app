'use strict';
// Vídeo de produto no banco real de mídia, separado da identidade e do laboratório.
const {createHash}=require('node:crypto');
const {duracaoMp4}=require('../domain/video-produto-candidato-sqlite');
const ID=/^[A-Za-z0-9_-]{1,80}$/;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
class VideoProdutoRealSQLite{
 constructor({banco,catalogo}={}){
  if(typeof banco?.exec!=='function'||typeof catalogo?.buscar!=='function')
   throw new TypeError('SQLite/catalogo obrigatorios');
  this.banco=banco;this.catalogo=catalogo;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_video_produto_versoes_real(',
   'produto_id TEXT NOT NULL,versao INTEGER NOT NULL CHECK(versao>0),',
   'sha256 TEXT NOT NULL,bytes INTEGER NOT NULL CHECK(bytes<=20971520),',
   'duracao_ms INTEGER NOT NULL CHECK(duracao_ms>0 AND duracao_ms<=30000),',
   'conteudo BLOB NOT NULL,criado_em TEXT NOT NULL,',
   'PRIMARY KEY(produto_id,versao));',
   'CREATE TABLE IF NOT EXISTS akitemm_video_produto_atual_real(',
   'produto_id TEXT PRIMARY KEY,versao INTEGER NOT NULL,',
   'FOREIGN KEY(produto_id,versao) REFERENCES akitemm_video_produto_versoes_real(produto_id,versao));',
   'CREATE TRIGGER IF NOT EXISTS video_versoes_imutaveis_update_real',
   'BEFORE UPDATE ON akitemm_video_produto_versoes_real',
   "BEGIN SELECT RAISE(ABORT,'video historico imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS video_versoes_imutaveis_delete_real',
   'BEFORE DELETE ON akitemm_video_produto_versoes_real',
   "BEGIN SELECT RAISE(ABORT,'video historico imutavel'); END;"
  ].join(' '));
 }
 _validar(id){if(typeof id!=='string'||!ID.test(id))falha('VIDEO_PRODUTO_INVALIDO');}
 estado(id){
  this._validar(id);
  const x=this.banco.prepare([
   'SELECT a.versao,v.sha256,v.bytes,v.duracao_ms AS duracaoMs,',
   'v.criado_em AS criadoEm FROM akitemm_video_produto_atual_real a',
   'JOIN akitemm_video_produto_versoes_real v',
   'ON v.produto_id=a.produto_id AND v.versao=a.versao',
   'WHERE a.produto_id=?'
  ].join(' ')).get(id);
  return {produtoId:id,arquivoAnexado:!!x,versao:x?.versao??0,
   bytes:x?.bytes??0,duracaoMs:x?.duracaoMs??0,
   sha256:x?.sha256??null,criadoEm:x?.criadoEm??null,
   somenteLaboratorio:false};
 }
 async salvar({produtoId,bytes,revisaoEsperada}={}){
  this._validar(produtoId);
  if(!Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<0)
   falha('VIDEO_REVISAO_INVALIDA');
  const duracaoMs=duracaoMp4(bytes);
  const p=await this.catalogo.buscar(produtoId);
  if(!p)falha('VIDEO_PRODUTO_NAO_ENCONTRADO');
  const sha=createHash('sha256').update(bytes).digest('hex');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const atual=this.estado(produtoId);
   if(atual.versao!==revisaoEsperada)falha('VIDEO_CONFLITO_REVISAO');
   if(atual.sha256===sha){
    this.banco.exec('COMMIT');return {...atual,repetido:true};
   }
   const versao=atual.versao+1;
   this.banco.prepare([
    'INSERT INTO akitemm_video_produto_versoes_real',
    '(produto_id,versao,sha256,bytes,duracao_ms,conteudo,criado_em)',
    'VALUES(?,?,?,?,?,?,?)'
   ].join(' ')).run(produtoId,versao,sha,bytes.length,duracaoMs,bytes,new Date().toISOString());
   this.banco.prepare([
    'INSERT INTO akitemm_video_produto_atual_real(produto_id,versao)',
    'VALUES(?,?) ON CONFLICT(produto_id) DO UPDATE SET versao=excluded.versao'
   ].join(' ')).run(produtoId,versao);
   this.banco.exec('COMMIT');return {...this.estado(produtoId),repetido:false};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 abrir(id){
  this._validar(id);
  const a=this.estado(id);
  if(!a.arquivoAnexado)falha('VIDEO_NAO_ENCONTRADO');
  const row=this.banco.prepare([
   'SELECT v.conteudo,v.sha256 FROM akitemm_video_produto_versoes_real v',
   'WHERE v.produto_id=? AND v.versao=?'
  ].join(' ')).get(id,a.versao);
  const conteudo=Buffer.from(row.conteudo);
  if(conteudo.length!==a.bytes||
     createHash('sha256').update(conteudo).digest('hex')!==row.sha256)
   falha('VIDEO_INTEGRIDADE_INVALIDA');
  return {conteudo,versao:a.versao,duracaoMs:a.duracaoMs};
 }
}
module.exports={VideoProdutoRealSQLite};
