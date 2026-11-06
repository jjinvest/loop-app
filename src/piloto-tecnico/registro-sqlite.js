'use strict';
// Pré-cadastro de interessados reais, estritamente separado da homologação.
// NÃO cria conta remunerada, posição, convite com comissão, cobrança nem KYC.
const {randomBytes,randomUUID,createHmac,createHash,
 createCipheriv,timingSafeEqual}=require('node:crypto');
const NICK=/^[a-zA-Z]{1,9}$/;
const NOME=/^[\p{L}\p{M} .'-]{2,90}$/u;
const EMAIL=/^[^\s@<>]{1,64}@[^\s@<>]{1,180}$/;
const RETENCAO_DIAS=90;
function erro(c){const e=new Error(c);e.codigo=c;throw e;}
const digerir=t=>createHash('sha256').update(t).digest('hex');
const hmac=(key,dado,prefixo)=>createHmac('sha256',key)
 .update(prefixo+':'+dado).digest('hex');
function criptografar(key,texto,campo){
 const iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(Buffer.from('AKITEMM-PILOTO-V1:'+campo));
 const enc=Buffer.concat([cipher.update(texto,'utf8'),cipher.final()]);
 return [iv.toString('hex'),enc.toString('hex'),cipher.getAuthTag().toString('hex')];
}
class RegistroPilotoTecnico{
 constructor({banco,chaveEmail,chaveCifra,agora=()=>Date.now(),
  termosVersao='PILOTO-TECNICO-2026-11',privacidadeVersao='PRIVACIDADE-2026-11'}={}){
  if(typeof banco?.exec!=='function'||typeof banco?.prepare!=='function'||
     !Buffer.isBuffer(chaveEmail)||chaveEmail.length!==32||
     !Buffer.isBuffer(chaveCifra)||chaveCifra.length!==32||
     timingSafeEqual(chaveEmail,chaveCifra))
   erro('PILOTO_CUSTODIA_INVALIDA');
  if(typeof agora!=='function'||typeof termosVersao!=='string'||
     !/^PILOTO-TECNICO-[\d-]{7,15}$/.test(termosVersao)||
     typeof privacidadeVersao!=='string'||
     !/^PRIVACIDADE-[\d-]{7,15}$/.test(privacidadeVersao))
   erro('PILOTO_TERMOS_INVALIDOS');
  this.banco=banco;this.chaveEmail=Buffer.from(chaveEmail);
  this.chaveCifra=Buffer.from(chaveCifra);
  this.agora=agora;this.termosVersao=termosVersao;
  this.privacidadeVersao=privacidadeVersao;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_piloto_pre_cadastros(',
   'id TEXT PRIMARY KEY,',
   'nick TEXT NOT NULL UNIQUE COLLATE NOCASE,',
   'email_hmac TEXT NOT NULL UNIQUE,',
   'nome_iv TEXT NOT NULL,nome_cifra TEXT NOT NULL,nome_tag TEXT NOT NULL,',
   'email_iv TEXT NOT NULL,email_cifra TEXT NOT NULL,email_tag TEXT NOT NULL,',
   'exclusao_hash TEXT NOT NULL UNIQUE,',
   'termos_versao TEXT NOT NULL,privacidade_versao TEXT NOT NULL,',
   'consentimento_em INTEGER NOT NULL,',
   'criado_em INTEGER NOT NULL,expira_em INTEGER NOT NULL);',
   'CREATE INDEX IF NOT EXISTS idx_piloto_expiracao',
   'ON akitemm_piloto_pre_cadastros(expira_em);',
   'CREATE TABLE IF NOT EXISTS akitemm_piloto_taxa_ip(',
   'ip_hmac TEXT NOT NULL,dia INTEGER NOT NULL,',
   'quantidade INTEGER NOT NULL,PRIMARY KEY(ip_hmac,dia));'
  ].join(' '));
 }
 registrar({nome,nick,email,aceiteTermos,aceitePrivacidade,
  ipAnonimo}={}){
  if(typeof nome!=='string'||!NOME.test(nome.trim())||
     typeof nick!=='string'||!NICK.test(nick)||
     typeof email!=='string'||email.length>254||
     !EMAIL.test(email)||email.includes('..')||
     aceiteTermos!==true||aceitePrivacidade!==true||
     typeof ipAnonimo!=='string'||ipAnonimo.length>128||!ipAnonimo)
   erro('PILOTO_DADOS_OU_CONSENTIMENTO_INVALIDOS');
  const nomeLimpo=nome.trim(),emailMin=email.trim().toLowerCase();
  const nickMin=nick.toLowerCase();
  const agora=this.agora();
  if(!Number.isSafeInteger(agora)||agora<0)
   erro('PILOTO_RELOGIO_INVALIDO');
  const dia=Math.floor(agora/86400000),ipHmac=hmac(this.chaveEmail,
   ipAnonimo,'PILOTO-IP');
  const emailHmac=hmac(this.chaveEmail,emailMin,'PILOTO-EMAIL');
  const excluirToken=randomBytes(32).toString('hex');
  const nomeEnc=criptografar(this.chaveCifra,nomeLimpo,'NOME');
  const emailEnc=criptografar(this.chaveCifra,emailMin,'EMAIL');
  let id;
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   this.banco.prepare(
    'DELETE FROM akitemm_piloto_taxa_ip WHERE dia<?'
   ).run(dia-2);
   const atual=this.banco.prepare([
    'SELECT quantidade FROM akitemm_piloto_taxa_ip',
    'WHERE ip_hmac=? AND dia=?'
   ].join(' ')).get(ipHmac,dia)?.quantidade||0;
   if(atual>=5)erro('PILOTO_LIMITE_ANTI_ABUSO');
   if(this.banco.prepare([
    'SELECT 1 FROM akitemm_piloto_pre_cadastros',
    'WHERE email_hmac=? OR nick=? COLLATE NOCASE LIMIT 1'
   ].join(' ')).get(emailHmac,nickMin))
    erro('PILOTO_CADASTRO_EXISTENTE');
   id='interesse-'+randomUUID();
   this.banco.prepare([
    'INSERT INTO akitemm_piloto_pre_cadastros(',
    'id,nick,email_hmac,nome_iv,nome_cifra,nome_tag,',
    'email_iv,email_cifra,email_tag,exclusao_hash,',
    'termos_versao,privacidade_versao,consentimento_em,',
    'criado_em,expira_em)',
    'VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
   ].join(' ')).run(id,nickMin,emailHmac,...nomeEnc,...emailEnc,
    digerir(excluirToken),this.termosVersao,
    this.privacidadeVersao,agora,agora,
    agora+RETENCAO_DIAS*86400000);
   this.banco.prepare([
    'INSERT INTO akitemm_piloto_taxa_ip(ip_hmac,dia,quantidade)',
    'VALUES(?,?,1) ON CONFLICT(ip_hmac,dia)',
    'DO UPDATE SET quantidade=quantidade+1'
   ].join(' ')).run(ipHmac,dia);
   this.banco.exec('COMMIT');
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
  return {id,estado:'PRE_CADASTRO_SEM_DIREITOS_FINANCEIROS',
   verificacaoEmailPendente:true,excluirToken,
   criadoEm:agora,expiraEm:agora+RETENCAO_DIAS*86400000,
   compraReal:false,posicaoGerada:false};
 }
 excluir({token}={}){
  if(typeof token!=='string'||!/^[0-9a-f]{64}$/.test(token))
   erro('PILOTO_EXCLUSAO_TOKEN_INVALIDO');
  const r=this.banco.prepare(
   'DELETE FROM akitemm_piloto_pre_cadastros WHERE exclusao_hash=?'
  ).run(digerir(token));
  return {excluido:r.changes===1};
 }
 limparExpirados(){
  const ts=this.agora();
  if(!Number.isSafeInteger(ts)||ts<0)
   erro('PILOTO_RELOGIO_INVALIDO');
  return {excluidos:this.banco.prepare(
   'DELETE FROM akitemm_piloto_pre_cadastros WHERE expira_em<=?'
  ).run(ts).changes};
 }
 contagem(){
  return this.banco.prepare(
   'SELECT COUNT(*) AS total FROM akitemm_piloto_pre_cadastros'
  ).get().total;
 }
}
module.exports={RegistroPilotoTecnico};
