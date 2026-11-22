'use strict';
// Quatro banners da loja real: imagens próprias no SQLite protegido do LOOP.
// Não criam produtos, pedidos, posições, remunerações ou movimentação financeira.
const {validar}=require('../domain/akitemm-midia-avaliacoes-demo');
const MAX=3*1024*1024;
const MIME=new Set(['image/jpeg','image/png','image/webp']);
function erro(c){const e=new Error(c);e.codigo=c;throw e;}
function verificarSlot(n){
 if(!Number.isSafeInteger(n)||n<1||n>4)erro('BANNER_SLOT_INVALIDO');
 return n;
}
function verificarRevisao(n){
 if(!Number.isSafeInteger(n)||n<0)erro('BANNER_REVISAO_INVALIDA');
 return n;
}
class BannersAkitemmRealSQLite{
 constructor({banco,agora=()=>Date.now()}={}){
  if(!banco||typeof banco.prepare!=='function'||
      typeof banco.exec!=='function'||typeof agora!=='function')
   erro('BANNERS_BANCO_INVALIDO');
  this.banco=banco;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loja_real_banners(',
   'slot INTEGER PRIMARY KEY CHECK(slot BETWEEN 1 AND 4),',
   "mime TEXT CHECK(mime IS NULL OR mime IN ('image/jpeg','image/png','image/webp')),",
   'imagem BLOB,revisao INTEGER NOT NULL DEFAULT 0,',
   "enquadramento TEXT NOT NULL DEFAULT 'INTEIRA'",
   "CHECK(enquadramento IN ('INTEIRA','PREENCHER')),",
   'atualizado_em INTEGER NOT NULL DEFAULT 0,',
   'CHECK((imagem IS NULL AND mime IS NULL) OR',
   '(imagem IS NOT NULL AND mime IS NOT NULL)));'
  ].join(' '));
  const inserir=banco.prepare(
   'INSERT OR IGNORE INTO loja_real_banners(slot) VALUES(?)'
  );
  for(let slot=1;slot<=4;slot++)inserir.run(slot);
 }
 listar(){
  return {quantidadeMaxima:4,financeiroReal:false,
   slots:this.banco.prepare([
    'SELECT slot,revisao,enquadramento,atualizado_em,',
    'imagem IS NOT NULL AS temImagem',
    'FROM loja_real_banners ORDER BY slot'
   ].join(' ')).all().map(x=>({
    slot:x.slot,temImagem:x.temImagem===1,revisao:x.revisao,
    enquadramento:x.enquadramento,atualizadoEm:x.atualizado_em||null
   }))
  };
 }
 imagem(slot){
  verificarSlot(slot);
  const r=this.banco.prepare(
   'SELECT mime,imagem,revisao FROM loja_real_banners WHERE slot=?'
  ).get(slot);
  if(!r?.imagem)erro('BANNER_SEM_IMAGEM');
  return {mime:r.mime,dados:Buffer.from(r.imagem),revisao:r.revisao};
 }
 salvar({slot,mime,dados,revisaoEsperada,enquadramento='INTEIRA'}={}){
  verificarSlot(slot);verificarRevisao(revisaoEsperada);
  if(!MIME.has(mime)||!Buffer.isBuffer(dados)||dados.length<40||
    dados.length>MAX)erro('BANNER_FOTO_INVALIDA');
  if(!['INTEIRA','PREENCHER'].includes(enquadramento))
   erro('BANNER_ENQUADRAMENTO_INVALIDO');
  let limpa;
  try{limpa=validar({tipo:'FOTO',mime,dados}).dados;}
  catch{erro('BANNER_FOTO_INVALIDA');}
  if(!Buffer.isBuffer(limpa)||limpa.length<40||limpa.length>MAX)
   erro('BANNER_FOTO_INVALIDA');
  const r=this.banco.prepare([
   'UPDATE loja_real_banners SET mime=?,imagem=?,enquadramento=?,',
   'atualizado_em=?,revisao=revisao+1',
   'WHERE slot=? AND revisao=?'
  ].join(' ')).run(mime,limpa,enquadramento,this.agora(),
   slot,revisaoEsperada);
  if(r.changes!==1)erro('BANNER_CONFLITO_REVISAO');
  return this.listar();
 }
 remover({slot,revisaoEsperada}={}){
  verificarSlot(slot);verificarRevisao(revisaoEsperada);
  const r=this.banco.prepare([
   "UPDATE loja_real_banners SET mime=NULL,imagem=NULL,",
   "enquadramento='INTEIRA',revisao=revisao+1,atualizado_em=?",
   'WHERE slot=? AND revisao=?'
  ].join(' ')).run(this.agora(),slot,revisaoEsperada);
  if(r.changes!==1)erro('BANNER_CONFLITO_REVISAO');
  return this.listar();
 }
 // Mover um banner troca apenas imagens/enquadramentos entre posições.
 // Revisões impedem sobrescrever outra edição simultânea.
 trocar({origem,destino,revisaoOrigem,revisaoDestino}={}){
  verificarSlot(origem);verificarSlot(destino);
  verificarRevisao(revisaoOrigem);verificarRevisao(revisaoDestino);
  if(origem===destino)erro('BANNER_DESTINO_INVALIDO');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const ler=this.banco.prepare([
    'SELECT slot,mime,imagem,enquadramento,revisao',
    'FROM loja_real_banners WHERE slot=?'
   ].join(' '));
   const a=ler.get(origem),b=ler.get(destino);
   if(!a||!b||a.revisao!==revisaoOrigem||
      b.revisao!==revisaoDestino)erro('BANNER_CONFLITO_REVISAO');
   const escrever=this.banco.prepare([
    'UPDATE loja_real_banners SET mime=?,imagem=?,',
    'enquadramento=?,revisao=revisao+1,atualizado_em=?',
    'WHERE slot=? AND revisao=?'
   ].join(' '));
   const agora=this.agora();
   const x=escrever.run(b.mime,b.imagem,b.enquadramento,agora,
    origem,revisaoOrigem);
   const y=escrever.run(a.mime,a.imagem,a.enquadramento,agora,
    destino,revisaoDestino);
   if(x.changes!==1||y.changes!==1)erro('BANNER_CONFLITO_REVISAO');
   this.banco.exec('COMMIT');
   return this.listar();
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
}
module.exports={BannersAkitemmRealSQLite,MAX};
