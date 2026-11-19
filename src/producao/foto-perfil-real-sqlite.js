'use strict';
// Foto de perfil por conta REAL, no mesmo SQLite protegido por backup offsite.
// O validador reutilizado é somente sanitização binária (sem banco LAB).
const {createHash}=require('node:crypto');
const {validar}=require('../domain/akitemm-midia-avaliacoes-demo');
const TABELA_FOTO_PERFIL_REAL='loop_real_fotos_perfil';
const MAX=3*1024*1024;
const ID=/^titular-[a-f0-9-]{36}$/;
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
class FotoPerfilRealSQLite{
 constructor({banco}={}){
  if(!banco?.prepare||!banco?.exec)falha('FOTO_REAL_BANCO_INVALIDO');
  this.banco=banco;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS '+TABELA_FOTO_PERFIL_REAL+'(',
   'titular_id TEXT PRIMARY KEY NOT NULL',
   ' REFERENCES loop_real_contas(id) ON DELETE RESTRICT,',
   "mime TEXT NOT NULL CHECK(mime IN ('image/jpeg','image/png','image/webp')),",
   'dados BLOB NOT NULL CHECK(length(dados)>0 AND length(dados)<=3145728),',
   "sha256 TEXT NOT NULL CHECK(length(sha256)=64),",
   'atualizado_em INTEGER NOT NULL CHECK(atualizado_em>0));'
  ].join(' '));
 }
 consultar(titularId){
  if(typeof titularId!=='string'||!ID.test(titularId))falha('FOTO_REAL_TITULAR_INVALIDO');
  const r=this.banco.prepare(
   'SELECT mime,dados,sha256 FROM '+TABELA_FOTO_PERFIL_REAL+' WHERE titular_id=?'
  ).get(titularId);
  if(!r)return null;
  const dados=Buffer.from(r.dados);
  if(!dados.length||dados.length>MAX||
     createHash('sha256').update(dados).digest('hex')!==r.sha256)
   falha('FOTO_REAL_INTEGRIDADE_INVALIDA');
  return {mime:r.mime,dados};
 }
 salvar(titularId,{mime,dados}={}){
  if(typeof titularId!=='string'||!ID.test(titularId))falha('FOTO_REAL_TITULAR_INVALIDO');
  if(!Buffer.isBuffer(dados)||!['image/jpeg','image/png','image/webp'].includes(mime)||
     dados.length<1||dados.length>MAX)
   falha('FOTO_REAL_FORMATO_INVALIDO');
  // Reutiliza o sanitizador aprovado que retira EXIF/GPS e metadados.
  const limpa=validar({tipo:'FOTO',mime,dados}).dados;
  const sha=createHash('sha256').update(limpa).digest('hex');
  this.banco.prepare([
   'INSERT INTO '+TABELA_FOTO_PERFIL_REAL,
   '(titular_id,mime,dados,sha256,atualizado_em) VALUES(?,?,?,?,?)',
   'ON CONFLICT(titular_id) DO UPDATE SET mime=excluded.mime,',
   'dados=excluded.dados,sha256=excluded.sha256,',
   'atualizado_em=excluded.atualizado_em'
  ].join(' ')).run(titularId,mime,limpa,sha,Date.now());
  return {fotoSalva:true,sha256:sha};
 }
}
module.exports={FotoPerfilRealSQLite,TABELA_FOTO_PERFIL_REAL};
