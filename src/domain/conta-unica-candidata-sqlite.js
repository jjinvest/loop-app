'use strict';
// Candidato OFFLINE para identidade UNICA de cliente + Escritório.
// Nao habilitar em produção antes de verificar email, CPF, LGPD e operação.
// Nao registra qualquer direito financeiro ou cadastro publico.
const {randomUUID,randomBytes,createHash,createHmac,timingSafeEqual,
 createCipheriv,createDecipheriv,scrypt}=require('node:crypto');
const {promisify}=require('node:util');
const derivar=promisify(scrypt);
const NICK=/^[A-Za-z]{1,9}$/;
const NOME=/^[\p{L}\p{M} .'-]{2,90}$/u;
const EMAIL=/^[^\s@]{1,64}@[^\s@]{1,180}$/;
const SESSAO=/^[a-f0-9]{64}$/;
const VERSAO=/^LAB-[A-Za-z0-9._-]{3,64}$/;
const COOKIE='loop_candidato_s';
const DURACAO_MS=60*60*1000;
const BLOQUEIO_MS=15*60*1000;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function hmac(key,value){
 return createHmac('sha256',key).update('AKITEMM-CONTA-CANDIDATA-EMAIL-1:')
  .update(value).digest('hex');
}
function digest(token){return createHash('sha256').update(token).digest('hex');}
function sha256(value){return createHash('sha256').update(value).digest('hex');}
function cifrar(key,value){
 const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);
 c.setAAD(Buffer.from('AKITEMM-CANDIDATO-CONTA-1'));
 const enc=Buffer.concat([c.update(value,'utf8'),c.final()]);
 return [iv.toString('hex'),enc.toString('hex'),c.getAuthTag().toString('hex')];
}
function decifrar(key,iv,enc,tag){
 const c=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'hex'));
 c.setAAD(Buffer.from('AKITEMM-CANDIDATO-CONTA-1'));
 c.setAuthTag(Buffer.from(tag,'hex'));
 return Buffer.concat([c.update(Buffer.from(enc,'hex')),c.final()]).toString('utf8');
}
function comparar(a,b){
 if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length||
    !/^[a-f0-9]+$/.test(a)||!/^[a-f0-9]+$/.test(b))return false;
 return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
function nickValido(nick){
 if(typeof nick!=='string'||!NICK.test(nick))falha('NICK_INVALIDO');
 return nick.toLowerCase();
}
function emailValido(email){
 if(typeof email!=='string'||email.length>254||!EMAIL.test(email)||
    email.includes('..')||/[<>]/.test(email))falha('EMAIL_INVALIDO');
 return email.trim().toLowerCase();
}
async function hashSenha(senha,salt){
 return (await derivar(senha,Buffer.from(salt,'hex'),64,{
  N:16384,r:8,p:1,maxmem:32*1024*1024
 })).toString('hex');
}
function senhaValida(senha){
 return typeof senha==='string'&&Buffer.byteLength(senha,'utf8')>=12&&
  Buffer.byteLength(senha,'utf8')<=256;
}
function tokenCookie(req){
 const raw=req.get('cookie');
 if(typeof raw!=='string'||raw.length>4096)return null;
 const matches=raw.split(';').map(x=>x.trim()).filter(x=>x.startsWith(COOKIE+'='));
 if(matches.length!==1)return null;
 const token=matches[0].slice(COOKIE.length+1);
 return SESSAO.test(token)?token:null;
}
class ContaUnicaCandidataSQLite{
 constructor({banco,chaveEmail,chaveCifra,agora=()=>Date.now()}={}){
  if(process.env.NODE_ENV==='production')falha('CANDIDATO_NAO_HOMOLOGADO');
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function')
   throw new TypeError('SQLite obrigatorio');
  if(!Buffer.isBuffer(chaveEmail)||chaveEmail.length!==32||
     !Buffer.isBuffer(chaveCifra)||chaveCifra.length!==32||
     timingSafeEqual(chaveEmail,chaveCifra))
   falha('CUSTODIA_INDEPENDENTE_OBRIGATORIA');
  if(typeof agora!=='function')falha('RELOGIO_INVALIDO');
  this.banco=banco;this.emailKey=chaveEmail;this.cipherKey=chaveCifra;
  this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_conta_unica_candidata(',
   'id TEXT PRIMARY KEY NOT NULL,',
   'nick TEXT NOT NULL UNIQUE COLLATE NOCASE,',
   'email_hmac TEXT NOT NULL UNIQUE,',
   'nome_iv TEXT NOT NULL,nome_cifra TEXT NOT NULL,nome_tag TEXT NOT NULL,',
   'email_iv TEXT NOT NULL,email_cifra TEXT NOT NULL,email_tag TEXT NOT NULL,',
   'senha_salt TEXT NOT NULL,senha_hash TEXT NOT NULL,',
   'tentativas INTEGER NOT NULL DEFAULT 0,',
   'bloqueado_ate INTEGER NOT NULL DEFAULT 0,',
   'email_verificado INTEGER NOT NULL DEFAULT 0 CHECK(email_verificado=0),',
   'termos_versao TEXT NOT NULL,termos_hash TEXT NOT NULL,',
   'criado_em INTEGER NOT NULL);',
   'CREATE TABLE IF NOT EXISTS akitemm_sessoes_candidatas(',
   'token_hash TEXT PRIMARY KEY NOT NULL,',
   'titular_id TEXT NOT NULL REFERENCES',
   'akitemm_conta_unica_candidata(id) ON DELETE RESTRICT,',
   'criado_em INTEGER NOT NULL, expira_em INTEGER NOT NULL);',
   'CREATE INDEX IF NOT EXISTS idx_sessoes_candidatas_titular',
   'ON akitemm_sessoes_candidatas(titular_id,expira_em);',
   'CREATE TRIGGER IF NOT EXISTS conta_candidata_identidade_imutavel',
   'BEFORE UPDATE OF id,nick,email_hmac,nome_iv,nome_cifra,nome_tag,',
   'email_iv,email_cifra,email_tag,termos_versao,termos_hash',
   'ON akitemm_conta_unica_candidata',
   "BEGIN SELECT RAISE(ABORT,'identidade candidata imutavel'); END;"
  ].join(' '));
 }
 _agora(){
  const t=this.agora();
  if(!Number.isSafeInteger(t)||t<0)falha('RELOGIO_INVALIDO');
  return t;
 }
 async cadastrar({nome,nick,email,senha,aceiteExplicito=false,
  termosVersao,termosTexto}={}){
  if(process.env.NODE_ENV==='production')falha('CANDIDATO_NAO_HOMOLOGADO');
  const nickMin=nickValido(nick),emailMin=emailValido(email);
  if(typeof nome!=='string'||!NOME.test(nome.trim()))
   falha('NOME_INVALIDO');
  if(!senhaValida(senha))falha('SENHA_INVALIDA');
  if(aceiteExplicito!==true||!VERSAO.test(termosVersao||'')||
    typeof termosTexto!=='string'||termosTexto.length<40||
    termosTexto.length>20000)
   falha('TERMOS_LAB_NAO_ACEITOS');
  const emailHmac=hmac(this.emailKey,emailMin);
  const salt=randomBytes(16).toString('hex');
  const senhaHash=await hashSenha(senha,salt);
  const nomeEnc=cifrar(this.cipherKey,nome.trim());
  const emailEnc=cifrar(this.cipherKey,emailMin);
  const titularId='titular-'+randomUUID(),ts=this._agora();
  // Checagem previa so melhora a mensagem. UNIQUE no SQLite e a trava
  // definitiva contra cadastros concorrentes com o mesmo nick ou e-mail.
  if(this.banco.prepare([
    'SELECT 1 FROM akitemm_conta_unica_candidata',
    'WHERE nick=? COLLATE NOCASE OR email_hmac=? LIMIT 1'
   ].join(' ')).get(nickMin,emailHmac))
   falha('CADASTRO_JA_EXISTENTE');
  try{
   this.banco.prepare([
    'INSERT INTO akitemm_conta_unica_candidata',
    '(id,nick,email_hmac,nome_iv,nome_cifra,nome_tag,',
    'email_iv,email_cifra,email_tag,senha_salt,senha_hash,',
    'termos_versao,termos_hash,criado_em)',
    'VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
   ].join(' ')).run(titularId,nickMin,emailHmac,...nomeEnc,...emailEnc,
    salt,senhaHash,termosVersao,sha256(termosTexto),ts);
  }catch(e){
   if(/UNIQUE constraint failed|PRIMARY KEY constraint failed|SQLITE_CONSTRAINT/i
     .test(String(e.code||'')+' '+String(e.message||'')))
    falha('CADASTRO_JA_EXISTENTE');
   throw e;
  }
  return {titularId,nick,contaCriada:true,emailVerificado:false,
   identidadeValidadaExternamente:false,
   pagamentoPermitido:false,posicaoPermitida:false};
 }
 async entrar({nick,senha}={}){
  let n;try{n=nickValido(nick);}catch{falha('CREDENCIAIS_INVALIDAS');}
  if(typeof senha!=='string'||senha.length>256||!senha.length)
   falha('CREDENCIAIS_INVALIDAS');
  const ts=this._agora();
  const a=this.banco.prepare(
   'SELECT * FROM akitemm_conta_unica_candidata WHERE nick=?'
  ).get(n);
  const hash=await hashSenha(senha,a?.senha_salt||
   'abcdabcdabcdabcdabcdabcdabcdabcd');
  if(!a||!comparar(hash,a.senha_hash)){
   if(a){
    const count=a.tentativas+1;
    this.banco.prepare([
     'UPDATE akitemm_conta_unica_candidata',
     'SET tentativas=?,bloqueado_ate=? WHERE id=?'
    ].join(' ')).run(Math.min(count,5),
     count>=5?Math.max(ts+BLOQUEIO_MS,a.bloqueado_ate):a.bloqueado_ate,a.id);
   }
   falha('CREDENCIAIS_INVALIDAS');
  }
  if(a.bloqueado_ate>ts)falha('CONTA_TEMPORARIAMENTE_BLOQUEADA');
  const token=randomBytes(32).toString('hex');
  const csrf=createHmac('sha256',Buffer.from(token,'hex'))
   .update('AKITEMM-CANDIDATO-CSRF-V1').digest('hex');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   this.banco.prepare(
    'UPDATE akitemm_conta_unica_candidata SET tentativas=0,bloqueado_ate=0 WHERE id=?'
   ).run(a.id);
   this.banco.prepare([
    'INSERT INTO akitemm_sessoes_candidatas',
    '(token_hash,titular_id,criado_em,expira_em) VALUES(?,?,?,?)'
   ].join(' ')).run(digest(token),a.id,ts,ts+DURACAO_MS);
   this.banco.exec('COMMIT');
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
  return {titularId:a.id,nick:a.nick,token,csrf,expiraEm:ts+DURACAO_MS};
 }
 sessao(req){
  const token=tokenCookie(req);if(!token)return null;
  const row=this.banco.prepare([
   'SELECT s.titular_id AS titularId,s.expira_em AS expiraEm,',
   'a.nick AS nick FROM akitemm_sessoes_candidatas s',
   'JOIN akitemm_conta_unica_candidata a ON a.id=s.titular_id',
   'WHERE s.token_hash=?'
  ].join(' ')).get(digest(token));
  if(!row||row.expiraEm<=this._agora())return null;
  return {...row,csrf:createHmac('sha256',Buffer.from(token,'hex'))
   .update('AKITEMM-CANDIDATO-CSRF-V1').digest('hex')};
 }
 identificarTitular(req){return this.sessao(req)?.titularId||null;}
 autorizarMutacao(req){
  const s=this.sessao(req),x=req.get('x-checkout-csrf');
  return Boolean(s&&typeof x==='string'&&x.length===64&&comparar(s.csrf,x));
 }
 sair(req){
  const token=tokenCookie(req);if(!token)return false;
  return this.banco.prepare(
   'DELETE FROM akitemm_sessoes_candidatas WHERE token_hash=?'
  ).run(digest(token)).changes===1;
 }
 perfil(titularId){
  const a=this.banco.prepare(
   'SELECT * FROM akitemm_conta_unica_candidata WHERE id=?'
  ).get(titularId);
  if(!a)return null;
  let nome;
  try{nome=decifrar(this.cipherKey,a.nome_iv,a.nome_cifra,a.nome_tag);}
  catch{falha('INTEGRIDADE_CONTA_INVALIDA');}
  return {titularId:a.id,nick:a.nick,nome,
   emailVerificado:false,identidadeValidadaExternamente:false,
   termosVersao:a.termos_versao,termosHash:a.termos_hash,
   pagamentosReaisPermitidos:false};
 }
}
module.exports={ContaUnicaCandidataSQLite,COOKIE,DURACAO_MS};
