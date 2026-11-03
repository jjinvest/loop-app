'use strict';
// Confirmação de e-mail SOMENTE para o candidato local.
// Sem SMTP configurado, nada é enviado nem nenhuma conta é confirmada.
// O segredo de prova nunca é salvo em claro e não vai para logs/UI.
const {randomInt,randomUUID,createHmac,timingSafeEqual}=require('node:crypto');
const TITULAR=/^titular-[a-f0-9-]{36}$/;
const CODIGO=/^[0-9]{8}$/;
const PRAZO_MS=15*60*1000;
const ESPERA_MS=2*60*1000;
const LIMITE_TENTATIVAS=5;
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function igualdade(a,b){
 const aa=Buffer.from(a||'','hex'),bb=Buffer.from(b||'','hex');
 return aa.length===32&&bb.length===32&&timingSafeEqual(aa,bb);
}
class VerificacaoEmailContaUnicaCandidata{
 constructor({banco,contas,segredo,agora=()=>Date.now(),enviar}={}){
  if(process.env.NODE_ENV==='production')erro('CANDIDATO_EMAIL_NAO_HOMOLOGADO');
  if(typeof banco?.prepare!=='function'||contas?.banco!==banco||
     typeof contas.emailParaEntrega!=='function')
   throw new TypeError('Conta unificada e SQLite compartilhados obrigatorios');
  if(!Buffer.isBuffer(segredo)||segredo.length!==32||
     typeof agora!=='function'||typeof enviar!=='function')
   erro('PROVEDOR_EMAIL_E_CUSTODIA_OBRIGATORIOS');
  this.banco=banco;this.contas=contas;
  this.segredo=segredo;this.agora=agora;this.enviar=enviar;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_candidato_email_desafios(',
   'id TEXT PRIMARY KEY, titular_id TEXT NOT NULL',
   'REFERENCES akitemm_conta_unica_candidata(id) ON DELETE RESTRICT,',
   'codigo_hmac TEXT NOT NULL,',
   "estado TEXT NOT NULL CHECK(estado IN ('RESERVADO','ENVIADO','FALHOU','USADO','BLOQUEADO')),",
   'tentativas INTEGER NOT NULL DEFAULT 0 CHECK(tentativas BETWEEN 0 AND 5),',
   'criado_em INTEGER NOT NULL, expira_em INTEGER NOT NULL,',
   'enviado_em INTEGER,usado_em INTEGER);',
   'CREATE INDEX IF NOT EXISTS idx_candidato_email_desafios',
   'ON akitemm_candidato_email_desafios(titular_id,criado_em);',
   'CREATE TABLE IF NOT EXISTS akitemm_candidato_email_validado(',
   'titular_id TEXT PRIMARY KEY REFERENCES',
   'akitemm_conta_unica_candidata(id) ON DELETE RESTRICT,',
   'desafio_id TEXT NOT NULL UNIQUE REFERENCES',
   'akitemm_candidato_email_desafios(id) ON DELETE RESTRICT,',
   'validado_em INTEGER NOT NULL);',
   'CREATE TRIGGER IF NOT EXISTS candidato_email_validado_no_update',
   'BEFORE UPDATE ON akitemm_candidato_email_validado',
   "BEGIN SELECT RAISE(ABORT,'comprovacao imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS candidato_email_validado_no_delete',
   'BEFORE DELETE ON akitemm_candidato_email_validado',
   "BEGIN SELECT RAISE(ABORT,'comprovacao imutavel'); END;"
  ].join(' '));
 }
 _agora(){
  const n=this.agora();
  if(!Number.isSafeInteger(n)||n<0)erro('RELOGIO_INVALIDO');
  return n;
 }
 _titular(id){
  if(typeof id!=='string'||!TITULAR.test(id))erro('TITULAR_INVALIDO');
 }
 _hmac(titularId,codigo){
  return createHmac('sha256',this.segredo)
   .update('AKITEMM-CANDIDATO-EMAIL-V1|').update(titularId)
   .update('|').update(codigo).digest('hex');
 }
 verificado({titularId}={}){
  this._titular(titularId);
  return Boolean(this.banco.prepare([
   'SELECT 1 FROM akitemm_candidato_email_validado WHERE titular_id=?'
  ].join(' ')).get(titularId));
 }
 async solicitar({titularId,autorizado=false}={}){
  if(process.env.NODE_ENV==='production'||autorizado!==true)
   erro('ENVIO_EMAIL_CANDIDATO_NAO_AUTORIZADO');
  this._titular(titularId);
  if(this.verificado({titularId}))
   return {jaVerificado:true,novoCodigoGerado:false};
  const agora=this._agora();
  const codigo=String(randomInt(0,100000000)).padStart(8,'0');
  const id='email-'+randomUUID();
  let endereco;
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const anterior=this.banco.prepare([
    'SELECT criado_em FROM akitemm_candidato_email_desafios',
    'WHERE titular_id=? ORDER BY criado_em DESC LIMIT 1'
   ].join(' ')).get(titularId);
   if(anterior&&agora-anterior.criado_em<ESPERA_MS)
    erro('REENVIO_EMAIL_AGUARDAR');
   // Email obtido apenas em memoria do processo, nunca no retorno HTTP.
   endereco=this.contas.emailParaEntrega(titularId);
   if(!endereco)erro('CONTA_INEXISTENTE');
   this.banco.prepare([
    'INSERT INTO akitemm_candidato_email_desafios',
    '(id,titular_id,codigo_hmac,estado,criado_em,expira_em)',
    "VALUES(?,?,?,'RESERVADO',?,?)"
   ].join(' ')).run(id,titularId,this._hmac(titularId,codigo),
    agora,agora+PRAZO_MS);
   this.banco.exec('COMMIT');
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
  // Falha de transporte não autoriza confirmar e não faz retry automático.
  let entregue=false;
  try{entregue=(await this.enviar({para:endereco,codigo,
   expiraEm:agora+PRAZO_MS}))===true;}catch{entregue=false;}
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const status=entregue?'ENVIADO':'FALHOU';
   this.banco.prepare([
    'UPDATE akitemm_candidato_email_desafios',
    'SET estado=?,enviado_em=? WHERE id=? AND estado=?'
   ].join(' ')).run(status,entregue?this._agora():null,id,'RESERVADO');
   this.banco.exec('COMMIT');
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
  if(!entregue)erro('EMAIL_NAO_ENTREGUE');
  return {envioDeclaradoPeloProvedor:true,emailVerificado:false,
   expiraEm:agora+PRAZO_MS,segredoNaoExposto:true};
 }
 confirmar({titularId,codigo,autorizado=false}={}){
  if(process.env.NODE_ENV==='production'||autorizado!==true)
   erro('CONFIRMACAO_EMAIL_NAO_AUTORIZADA');
  this._titular(titularId);
  if(typeof codigo!=='string'||!CODIGO.test(codigo))
   erro('CODIGO_EMAIL_INVALIDO');
  const agora=this._agora();
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   if(this.verificado({titularId})){
    this.banco.exec('COMMIT');
    return {emailVerificado:true,repetido:true,
     identidadeExternaVerificada:false,pagamentoReal:false};
   }
   const row=this.banco.prepare([
    'SELECT id,codigo_hmac,estado,tentativas,expira_em',
    'FROM akitemm_candidato_email_desafios WHERE titular_id=?',
    'ORDER BY criado_em DESC LIMIT 1'
   ].join(' ')).get(titularId);
   if(!row||row.estado!=='ENVIADO'||row.expira_em<=agora)
    erro('PROVA_EMAIL_EXPIRADA_OU_INVALIDA');
   if(!igualdade(this._hmac(titularId,codigo),row.codigo_hmac)){
    const tentativas=row.tentativas+1;
    this.banco.prepare([
     'UPDATE akitemm_candidato_email_desafios',
     'SET tentativas=?,estado=? WHERE id=?'
    ].join(' ')).run(tentativas,
     tentativas>=LIMITE_TENTATIVAS?'BLOQUEADO':'ENVIADO',row.id);
    this.banco.exec('COMMIT');
    return {emailVerificado:false,codigoIncorreto:true,
     tentativasRestantes:LIMITE_TENTATIVAS-tentativas};
   }
   this.banco.prepare([
    'UPDATE akitemm_candidato_email_desafios',
    "SET estado='USADO',usado_em=? WHERE id=? AND estado='ENVIADO'"
   ].join(' ')).run(agora,row.id);
   this.banco.prepare([
    'INSERT INTO akitemm_candidato_email_validado',
    '(titular_id,desafio_id,validado_em) VALUES(?,?,?)'
   ].join(' ')).run(titularId,row.id,agora);
   this.banco.exec('COMMIT');
   return {emailVerificado:true,repetido:false,
    identidadeExternaVerificada:false,pagamentoReal:false};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
}
module.exports={VerificacaoEmailContaUnicaCandidata};
