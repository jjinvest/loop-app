'use strict';
// Quatro banners exclusivos da AKITEMM, salvos no SQLite real e no backup
// da identidade. Não compartilham imagens com os banners do LOOP.
const {dimensoesImagem}=require('../domain/novidades-loja-candidato-sqlite');
const MIME=new Set(['image/jpeg','image/png','image/webp']);
const MAX=4*1024*1024;
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function slotValido(n){
 if(!Number.isSafeInteger(n)||n<1||n>4)erro('BANNER_LOJA_SLOT_INVALIDO');
 return n;
}
function revisaoValida(n){
 if(!Number.isSafeInteger(n)||n<0)erro('BANNER_LOJA_REVISAO_INVALIDA');
 return n;
}
function arquivoValido(mime,bytes){
 if(!MIME.has(mime)||!Buffer.isBuffer(bytes)||bytes.length<40||bytes.length>MAX)
  erro('BANNER_LOJA_ARQUIVO_INVALIDO');
 const png=mime==='image/png'&&bytes.subarray(0,8).equals(
  Buffer.from('89504e470d0a1a0a','hex'));
 const jpg=mime==='image/jpeg'&&bytes.subarray(0,3).equals(
  Buffer.from('ffd8ff','hex'))&&bytes.subarray(-2).equals(
  Buffer.from('ffd9','hex'));
 const webp=mime==='image/webp'&&bytes.toString('ascii',0,4)==='RIFF'&&
  bytes.toString('ascii',8,12)==='WEBP'&&
  bytes.readUInt32LE(4)===bytes.length-8;
 if(!(png||jpg||webp)||!dimensoesImagem(bytes,mime))
  erro('BANNER_LOJA_IMAGEM_INVALIDA');
}
class BannersLojaAkitemmRealSQLite{
 constructor({banco,agora=()=>Date.now()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function')
   erro('BANNER_LOJA_BANCO_INVALIDO');
  this.db=banco;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loja_real_banners_akitemm(',
   'slot INTEGER PRIMARY KEY CHECK(slot BETWEEN 1 AND 4),',
   'mime TEXT,imagem BLOB,',
   "enquadramento TEXT NOT NULL DEFAULT 'PREENCHER' ",
   "CHECK(enquadramento IN ('INTEIRA','PREENCHER')),",
   'revisao INTEGER NOT NULL DEFAULT 0,',
   'atualizado_em INTEGER NOT NULL DEFAULT 0,',
   'CHECK((mime IS NULL AND imagem IS NULL) OR',
   '(mime IS NOT NULL AND imagem IS NOT NULL)));'
  ].join(' '));
  const insert=banco.prepare(
   'INSERT OR IGNORE INTO loja_real_banners_akitemm(slot) VALUES(?)');
  for(let n=1;n<=4;n++)insert.run(n);
 }
 listar(){
  return {quantidadeMaxima:4,slots:this.db.prepare([
   'SELECT slot,mime,imagem IS NOT NULL AS temImagem,enquadramento,',
   'revisao,atualizado_em FROM loja_real_banners_akitemm ORDER BY slot'
  ].join(' ')).all().map(r=>({
   slot:r.slot,temImagem:!!r.temImagem,
   enquadramento:r.enquadramento,revisao:r.revisao,
   atualizadoEm:r.atualizado_em||null
  }))};
 }
 imagem(slot){
  slotValido(slot);
  const row=this.db.prepare([
   'SELECT mime,imagem FROM loja_real_banners_akitemm WHERE slot=?'
  ].join(' ')).get(slot);
  if(!row?.imagem)erro('BANNER_LOJA_SEM_IMAGEM');
  return {mime:row.mime,bytes:Buffer.from(row.imagem)};
 }
 salvar({slot,mime,bytes,revisaoEsperada,enquadramento='PREENCHER'}={}){
  slotValido(slot);revisaoValida(revisaoEsperada);
  if(!['INTEIRA','PREENCHER'].includes(enquadramento))
   erro('BANNER_LOJA_ENQUADRAMENTO_INVALIDO');
  arquivoValido(mime,bytes);
  const result=this.db.prepare([
   'UPDATE loja_real_banners_akitemm SET mime=?,imagem=?,',
   'enquadramento=?,revisao=revisao+1,atualizado_em=?',
   'WHERE slot=? AND revisao=?'
  ].join(' ')).run(mime,bytes,enquadramento,this.agora(),
   slot,revisaoEsperada);
  if(result.changes!==1)erro('BANNER_LOJA_CONFLITO_REVISAO');
  return this.listar();
 }
 remover({slot,revisaoEsperada}={}){
  slotValido(slot);revisaoValida(revisaoEsperada);
  const result=this.db.prepare([
   'UPDATE loja_real_banners_akitemm SET mime=NULL,imagem=NULL,',
   "enquadramento='PREENCHER',revisao=revisao+1,atualizado_em=?",
   'WHERE slot=? AND revisao=?'
  ].join(' ')).run(this.agora(),slot,revisaoEsperada);
  if(result.changes!==1)erro('BANNER_LOJA_CONFLITO_REVISAO');
  return this.listar();
 }
 enquadrar({slot,revisaoEsperada,enquadramento}={}){
  slotValido(slot);revisaoValida(revisaoEsperada);
  if(!['INTEIRA','PREENCHER'].includes(enquadramento))
   erro('BANNER_LOJA_ENQUADRAMENTO_INVALIDO');
  const result=this.db.prepare([
   'UPDATE loja_real_banners_akitemm SET enquadramento=?,',
   'revisao=revisao+1,atualizado_em=? WHERE slot=?',
   'AND revisao=? AND imagem IS NOT NULL'
  ].join(' ')).run(enquadramento,this.agora(),slot,revisaoEsperada);
  if(result.changes!==1)erro('BANNER_LOJA_CONFLITO_REVISAO');
  return this.listar();
 }
 trocar({origem,destino,revisaoOrigem,revisaoDestino}={}){
  slotValido(origem);slotValido(destino);
  revisaoValida(revisaoOrigem);revisaoValida(revisaoDestino);
  if(origem===destino)erro('BANNER_LOJA_ORDEM_INVALIDA');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const get=this.db.prepare([
    'SELECT slot,mime,imagem,enquadramento,revisao',
    'FROM loja_real_banners_akitemm WHERE slot=?'
   ].join(' '));
   const a=get.get(origem),b=get.get(destino);
   if(!a||!b||a.revisao!==revisaoOrigem||b.revisao!==revisaoDestino)
    erro('BANNER_LOJA_CONFLITO_REVISAO');
   const put=this.db.prepare([
    'UPDATE loja_real_banners_akitemm SET mime=?,imagem=?,',
    'enquadramento=?,revisao=revisao+1,atualizado_em=?',
    'WHERE slot=? AND revisao=?'
   ].join(' '));
   const agora=this.agora();
   const x=put.run(b.mime,b.imagem,b.enquadramento,agora,
    origem,revisaoOrigem);
   const y=put.run(a.mime,a.imagem,a.enquadramento,agora,
    destino,revisaoDestino);
   if(x.changes!==1||y.changes!==1)erro('BANNER_LOJA_CONFLITO_REVISAO');
   this.db.exec('COMMIT');
   return this.listar();
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
}
module.exports={BannersLojaAkitemmRealSQLite};
