'use strict';
// Quatro banners manuais do Escritório Virtual. Persistência no MESMO
// SQLite da conta e da loja, sem acesso a Pix, posições nem motor.
const {dimensoesImagem}=require('./novidades-loja-candidato-sqlite');
const LIMITE_IMAGEM=4*1024*1024;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function slotValido(slot){
 if(!Number.isSafeInteger(slot)||slot<1||slot>4)falha('BANNER_SLOT_INVALIDO');
 return slot;
}
function validarFoto(mime,bytes){
 if(!['image/jpeg','image/png','image/webp'].includes(mime)||
  !Buffer.isBuffer(bytes)||bytes.length<40||bytes.length>LIMITE_IMAGEM)
  falha('BANNER_ARQUIVO_INVALIDO');
 const png=mime==='image/png'&&
  bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'));
 const jpg=mime==='image/jpeg'&&bytes.subarray(0,3)
  .equals(Buffer.from('ffd8ff','hex'))&&
  bytes.subarray(-2).equals(Buffer.from('ffd9','hex'));
 const webp=mime==='image/webp'&&bytes.toString('ascii',0,4)==='RIFF'&&
  bytes.toString('ascii',8,12)==='WEBP'&&
  bytes.readUInt32LE(4)===bytes.length-8;
 const dimensoes=dimensoesImagem(bytes,mime);
 if((!png&&!jpg&&!webp)||!dimensoes)
  falha('BANNER_ARQUIVO_INVALIDO');
 return dimensoes;
}
class BannersEscritorioCandidatoSQLite{
 constructor({banco,agora=()=>Date.now()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function')
   falha('BANNER_BANCO_INVALIDO');
  this.banco=banco;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_banner_escritorio_manual(',
   'slot INTEGER PRIMARY KEY CHECK(slot BETWEEN 1 AND 4),',
   'mime TEXT,imagem BLOB,',
   'revisao INTEGER NOT NULL DEFAULT 0,',
   'atualizado_em INTEGER NOT NULL DEFAULT 0,',
   'CHECK((mime IS NULL AND imagem IS NULL) OR',
   '(mime IS NOT NULL AND imagem IS NOT NULL)));'
  ].join(' '));
  // Migracao aditiva: preservar fotos ja enviadas em instancias existentes.
  const colunas=banco.prepare('PRAGMA table_info(loop_banner_escritorio_manual)').all();
  if(!colunas.some(c=>c.name==='enquadramento'))
   banco.exec("ALTER TABLE loop_banner_escritorio_manual ADD COLUMN enquadramento "+
    "TEXT NOT NULL DEFAULT 'INTEIRA' CHECK(enquadramento IN ('INTEIRA','PREENCHER'))");
  const preparar=banco.prepare(
   'INSERT OR IGNORE INTO loop_banner_escritorio_manual(slot) VALUES(?)');
  for(let slot=1;slot<=4;slot++)preparar.run(slot);
 }
 listar(){
  return {quantidadeMaxima:4,slots:this.banco.prepare(
   'SELECT slot,mime,imagem IS NOT NULL AS temImagem,revisao,atualizado_em,enquadramento '+
   'FROM loop_banner_escritorio_manual ORDER BY slot'
  ).all().map(r=>({
   slot:r.slot,temImagem:!!r.temImagem,revisao:r.revisao,
   mime:r.temImagem?r.mime:null,enquadramento:r.enquadramento,
   atualizadoEm:r.atualizado_em||null
  }))};
 }
 imagem(slot){
  const r=this.banco.prepare('SELECT mime,imagem,revisao FROM '+
   'loop_banner_escritorio_manual WHERE slot=?').get(slotValido(slot));
  if(!r?.imagem)falha('BANNER_SEM_IMAGEM');
  return {mime:r.mime,bytes:Buffer.from(r.imagem),revisao:r.revisao};
 }
 salvar({slot,mime,bytes,revisaoEsperada,enquadramento='INTEIRA'}={}){
  slotValido(slot);
  validarFoto(mime,bytes);
  if(!['INTEIRA','PREENCHER'].includes(enquadramento))
   falha('BANNER_ENQUADRAMENTO_INVALIDO');
  if(!Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<0)
   falha('BANNER_REVISAO_INVALIDA');
  const r=this.banco.prepare(
   'UPDATE loop_banner_escritorio_manual SET imagem=?,mime=?,enquadramento=?,revisao=revisao+1,'+
   'atualizado_em=? WHERE slot=? AND revisao=?'
  ).run(bytes,mime,enquadramento,this.agora(),slot,revisaoEsperada);
  if(r.changes!==1)falha('BANNER_CONFLITO_REVISAO');
  return this.listar();
 }
 remover({slot,revisaoEsperada}={}){
  slotValido(slot);
  if(!Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<0)
   falha('BANNER_REVISAO_INVALIDA');
  const r=this.banco.prepare(
   'UPDATE loop_banner_escritorio_manual SET imagem=NULL,mime=NULL,enquadramento=\'INTEIRA\','+
   'revisao=revisao+1,atualizado_em=? WHERE slot=? AND revisao=?'
  ).run(this.agora(),slot,revisaoEsperada);
  if(r.changes!==1)falha('BANNER_CONFLITO_REVISAO');
  return this.listar();
 }
}
module.exports={BannersEscritorioCandidatoSQLite,LIMITE_IMAGEM};
