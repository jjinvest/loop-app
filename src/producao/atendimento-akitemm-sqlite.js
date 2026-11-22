'use strict';
// Atendimento da PRÓPRIA AKITEMM, sem marketplace, chat externo ou IA fictícia.
// Mensagens criptografadas no SQLite da identidade real, titular isolado,
// operador com sessão administrativa e alteração auditada de status/resposta.
const {createCipheriv,createDecipheriv,randomBytes,randomUUID,
 hkdfSync}=require('node:crypto');
const TIPOS=new Set(['PRODUTO','PEDIDO','ENTREGA','TROCAS','OUTROS']);
const ID=/^[0-9a-f-]{36}$/;
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
function validarMensagem(texto){
 if(typeof texto!=='string'||texto.trim().length<10||texto.trim().length>1500||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(texto))
  falha('ATENDIMENTO_MENSAGEM_INVALIDA');
 return texto.trim();
}
class AtendimentoAkitemmSQLite {
 constructor({banco,chaveCifra,auditoria=null,agora=()=>Date.now()}={}){
  if(typeof banco?.exec!=='function'||typeof banco?.prepare!=='function'||
     !Buffer.isBuffer(chaveCifra)||chaveCifra.length!==32||
     (auditoria&&auditoria.db!==banco)||typeof agora!=='function')
   falha('ATENDIMENTO_CONFIGURACAO_INVALIDA');
  this.db=banco;
  this.key=Buffer.from(hkdfSync('sha256',chaveCifra,
   Buffer.from('AKITEMM-ATENDIMENTO-2026'),Buffer.from('mensagens-v1'),32));
  this.auditoria=auditoria;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loja_real_atendimentos(',
   'id TEXT PRIMARY KEY,titular_id TEXT NOT NULL',
   'REFERENCES loop_real_contas(id) ON DELETE RESTRICT,',
   "tipo TEXT NOT NULL CHECK(tipo IN ('PRODUTO','PEDIDO','ENTREGA','TROCAS','OUTROS')),",
   "estado TEXT NOT NULL CHECK(estado IN ('ABERTO','RESPONDIDO')),",
   'mensagem_iv TEXT NOT NULL,mensagem_ct TEXT NOT NULL,mensagem_tag TEXT NOT NULL,',
   'resposta_iv TEXT,resposta_ct TEXT,resposta_tag TEXT,',
   'criado_em INTEGER NOT NULL,respondido_em INTEGER,',
   'CHECK((estado=\'ABERTO\' AND resposta_iv IS NULL AND resposta_ct IS NULL AND resposta_tag IS NULL AND respondido_em IS NULL) OR',
   '(estado=\'RESPONDIDO\' AND resposta_iv IS NOT NULL AND resposta_ct IS NOT NULL AND resposta_tag IS NOT NULL AND respondido_em IS NOT NULL));',
   'CREATE INDEX IF NOT EXISTS loja_real_atendimentos_titular',
   'ON loja_real_atendimentos(titular_id,criado_em);',
   'CREATE INDEX IF NOT EXISTS loja_real_atendimentos_estado',
   'ON loja_real_atendimentos(estado,criado_em);'
  ].join(' '));
 }
 _cifrar(s){
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',this.key,iv);
  cipher.setAAD(Buffer.from('AKITEMM-ATENDIMENTO-TEXTO-1'));
  const ct=Buffer.concat([cipher.update(s,'utf8'),cipher.final()]);
  return [iv.toString('hex'),ct.toString('hex'),
   cipher.getAuthTag().toString('hex')];
 }
 _ler(iv,ct,tag){
  const d=createDecipheriv('aes-256-gcm',this.key,Buffer.from(iv,'hex'));
  d.setAAD(Buffer.from('AKITEMM-ATENDIMENTO-TEXTO-1'));
  d.setAuthTag(Buffer.from(tag,'hex'));
  return Buffer.concat([d.update(Buffer.from(ct,'hex')),d.final()]).toString('utf8');
 }
 _publico(r){
  return {protocolo:r.id,tipo:r.tipo,estado:r.estado,
   criadoEm:r.criado_em,respondidoEm:r.respondido_em,
   mensagem:this._ler(r.mensagem_iv,r.mensagem_ct,r.mensagem_tag),
   resposta:r.resposta_iv?this._ler(r.resposta_iv,r.resposta_ct,r.resposta_tag):null};
 }
 abrir({titularId,tipo,mensagem}={}){
  if(typeof titularId!=='string'||titularId.length<1||
     !TIPOS.has(tipo))falha('ATENDIMENTO_DADOS_INVALIDOS');
  const txt=validarMensagem(mensagem),ts=this.agora();
  if(!Number.isSafeInteger(ts)||ts<1)falha('ATENDIMENTO_RELOGIO_INVALIDO');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const titular=this.db.prepare(
    'SELECT id FROM loop_real_contas WHERE id=?'
   ).get(titularId);
   if(!titular)falha('ATENDIMENTO_TITULAR_INVALIDO');
   // Limite no banco, não no navegador: protege equipe e privacidade.
   const abertos=this.db.prepare([
    "SELECT COUNT(*) AS total FROM loja_real_atendimentos",
    "WHERE titular_id=? AND estado='ABERTO'"
   ].join(' ')).get(titularId).total;
   const recentes=this.db.prepare([
    'SELECT COUNT(*) AS total FROM loja_real_atendimentos',
    'WHERE titular_id=? AND criado_em>?'
   ].join(' ')).get(titularId,ts-86400000).total;
   if(abertos>=5||recentes>=10)falha('ATENDIMENTO_LIMITE_ABERTOS');
   const id=randomUUID(),[iv,ct,tag]=this._cifrar(txt);
   this.db.prepare([
    'INSERT INTO loja_real_atendimentos(',
    'id,titular_id,tipo,estado,mensagem_iv,mensagem_ct,mensagem_tag,criado_em)',
    "VALUES(?,?,?,'ABERTO',?,?,?,?)"
   ].join(' ')).run(id,titularId,tipo,iv,ct,tag,ts);
   if(this.auditoria)this.auditoria.registrar({
    acao:'ATENDIMENTO_AKITEMM_ABERTO',ator:'CLIENTE',
    entidade:'TICKET_'+id,
    antes:{estado:'NOVO'},depois:{estado:'ABERTO'},
    revisaoAnterior:0,revisaoNova:1
   });
   this.db.exec('COMMIT');
   return {protocolo:id,estado:'ABERTO',criadoEm:ts};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 meus({titularId}={}){
  if(typeof titularId!=='string'||!titularId)
   falha('ATENDIMENTO_TITULAR_INVALIDO');
  return this.db.prepare([
   'SELECT * FROM loja_real_atendimentos WHERE titular_id=?',
   'ORDER BY criado_em DESC LIMIT 50'
  ].join(' ')).all(titularId).map(x=>this._publico(x));
 }
 pendentes(){
  const rows=this.db.prepare([
   'SELECT t.*,c.nick FROM loja_real_atendimentos t',
   'JOIN loop_real_contas c ON c.id=t.titular_id',
   "ORDER BY CASE WHEN t.estado='ABERTO' THEN 0 ELSE 1 END,",
   't.criado_em DESC LIMIT 100'
  ].join(' ')).all();
  return rows.map(x=>({...this._publico(x),nick:x.nick}));
 }
 responder({protocolo,resposta}={}){
  if(typeof protocolo!=='string'||!ID.test(protocolo))
   falha('ATENDIMENTO_PROTOCOLO_INVALIDO');
  const txt=validarMensagem(resposta),ts=this.agora();
  if(!Number.isSafeInteger(ts)||ts<1)falha('ATENDIMENTO_RELOGIO_INVALIDO');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const registro=this.db.prepare(
    'SELECT * FROM loja_real_atendimentos WHERE id=?'
   ).get(protocolo);
   if(!registro)falha('ATENDIMENTO_NAO_ENCONTRADO');
   if(registro.estado!=='ABERTO')
    falha('ATENDIMENTO_JA_RESPONDIDO');
   const [iv,ct,tag]=this._cifrar(txt);
   this.db.prepare([
    "UPDATE loja_real_atendimentos SET estado='RESPONDIDO',",
    'resposta_iv=?,resposta_ct=?,resposta_tag=?,respondido_em=?',
    "WHERE id=? AND estado='ABERTO'"
   ].join(' ')).run(iv,ct,tag,ts,protocolo);
   if(this.auditoria)this.auditoria.registrar({
    acao:'ATENDIMENTO_AKITEMM_RESPONDIDO',ator:'ADMIN_COMERCIAL',
    entidade:'TICKET_'+protocolo,
    antes:{estado:'ABERTO'},depois:{estado:'RESPONDIDO'},
    revisaoAnterior:1,revisaoNova:2
   });
   this.db.exec('COMMIT');
   return {protocolo,estado:'RESPONDIDO',respondidoEm:ts};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
}
module.exports={AtendimentoAkitemmSQLite};
