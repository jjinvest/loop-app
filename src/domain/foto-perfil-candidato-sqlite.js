'use strict';
// Foto privada por titular, no MESMO SQLite da identidade do Escritório.
// Retira EXIF/GPS/XMP e rejeita SVG, HTML ou mídias externas.
const {validar}=require('./akitemm-midia-avaliacoes-demo');
class FotoPerfilCandidatoSQLite{
 constructor({banco}={}){
  if(typeof banco?.prepare!=='function')throw new TypeError('SQLite obrigatorio');
  this.banco=banco;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_candidato_foto_perfil_lab(',
   'titular_id TEXT PRIMARY KEY NOT NULL,',
   'mime TEXT NOT NULL CHECK(mime IN (\'image/jpeg\',\'image/png\',\'image/webp\')),',
   'dados BLOB NOT NULL CHECK(length(dados)>0 AND length(dados)<=3145728),',
   'atualizado_em TEXT NOT NULL,',
   'FOREIGN KEY(titular_id) REFERENCES akitemm_conta_unica_candidata(id)',
   'ON DELETE CASCADE);'
  ].join(' '));
 }
 existe(titularId){
  return Boolean(this.banco.prepare(
   'SELECT 1 FROM akitemm_candidato_foto_perfil_lab WHERE titular_id=?'
  ).get(titularId));
 }
 consultar(titularId){
  const row=this.banco.prepare(
   'SELECT mime,dados FROM akitemm_candidato_foto_perfil_lab WHERE titular_id=?'
  ).get(titularId);
  return row?{mime:row.mime,dados:Buffer.from(row.dados)}:null;
 }
 salvar(titularId,{dados,mime}={}){
  const limpa=validar({tipo:'FOTO',mime,dados});
  this.banco.prepare([
   'INSERT INTO akitemm_candidato_foto_perfil_lab(titular_id,mime,dados,atualizado_em)',
   'VALUES(?,?,?,?)',
   'ON CONFLICT(titular_id) DO UPDATE SET',
   'mime=excluded.mime,dados=excluded.dados,atualizado_em=excluded.atualizado_em'
  ].join(' ')).run(titularId,limpa.mime,limpa.dados,new Date().toISOString());
 }
}
module.exports={FotoPerfilCandidatoSQLite};
