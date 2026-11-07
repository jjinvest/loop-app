'use strict';
// Login do operador COMERCIAL — separado do cookie, login e perfis de clientes.
// Sessão persistente no SQLite, token aleatório, hash no disco e CSRF próprio.
// Não montar este provedor no laboratório sem autorização operacional.
const {randomBytes,createHmac,createHash,timingSafeEqual}=require('node:crypto');
const COOKIE_ADMIN='akitemm_real_admin_v1';
const DUAS_HORAS=2*60*60*1000;
const QUINZE_MIN=15*60*1000;
function falha(codigo){const erro=new Error(codigo);erro.codigo=codigo;throw erro;}
function tokenOk(t){return typeof t==='string'&&/^[a-f0-9]{64}$/.test(t);}
class SessaoAdminComercialSQLite{
 constructor({banco,chaveAdmin,credencialAdmin,agora=()=>Date.now()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     !Buffer.isBuffer(chaveAdmin)||chaveAdmin.length!==32||
     typeof credencialAdmin!=='string'||credencialAdmin.length<24||
     credencialAdmin.length>256||typeof agora!=='function')
   falha('ADMIN_SEGURO_NAO_CONFIGURADO');
  this.db=banco;this.key=Buffer.from(chaveAdmin);this.agora=agora;
  this.prova=createHmac('sha256',this.key)
   .update('CREDENCIAL-ADMIN-V1:'+credencialAdmin).digest();
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loja_real_sessoes_admin(',
   'token_hash TEXT PRIMARY KEY,csrf TEXT NOT NULL,',
   'expira_em INTEGER NOT NULL,criado_em INTEGER NOT NULL);',
   'CREATE TABLE IF NOT EXISTS loja_real_limite_login_admin(',
   'id INTEGER PRIMARY KEY CHECK(id=1),',
   'tentativas INTEGER NOT NULL,janela_ate INTEGER NOT NULL);'
  ].join(' '));
 }
 _hash(token){return createHash('sha256').update('ADMIN:'+token).digest('hex');}
 autenticar(credencial){
  const agora=this.agora();
  if(!Number.isSafeInteger(agora)||agora<=0)
   falha('RELOGIO_ADMIN_INVALIDO');
  const candidata=createHmac('sha256',this.key)
   .update('CREDENCIAL-ADMIN-V1:'+
    (typeof credencial==='string'&&credencial.length<=512?credencial:''))
   .digest();
  const valido=timingSafeEqual(candidata,this.prova);
  this.db.exec('BEGIN IMMEDIATE');
  let emTransacao=true;
  try{
   const anterior=this.db.prepare(
    'SELECT tentativas,janela_ate FROM loja_real_limite_login_admin WHERE id=1'
   ).get();
   const ativos=anterior&&anterior.janela_ate>agora?
    anterior.tentativas:0;
   if(ativos>=5)falha('LOGIN_ADMIN_TEMPORARIAMENTE_BLOQUEADO');
   if(!valido){
    this.db.prepare([
     'INSERT INTO loja_real_limite_login_admin(id,tentativas,janela_ate)',
     'VALUES(1,1,?) ON CONFLICT(id) DO UPDATE SET',
     'tentativas=?,janela_ate=?'
    ].join(' ')).run(agora+QUINZE_MIN,ativos+1,
     ativos?anterior.janela_ate:agora+QUINZE_MIN);
    this.db.exec('COMMIT');emTransacao=false;
    falha('CREDENCIAL_ADMIN_INVALIDA');
   }
   this.db.prepare([
    'INSERT INTO loja_real_limite_login_admin(id,tentativas,janela_ate)',
    'VALUES(1,0,0) ON CONFLICT(id) DO UPDATE SET',
    'tentativas=0,janela_ate=0'
   ].join(' ')).run();
   this.db.prepare('DELETE FROM loja_real_sessoes_admin WHERE expira_em<=?')
    .run(agora);
   const token=randomBytes(32).toString('hex');
   const csrf=randomBytes(32).toString('hex');
   this.db.prepare([
    'INSERT INTO loja_real_sessoes_admin(token_hash,csrf,expira_em,criado_em)',
    'VALUES(?,?,?,?)'
   ].join(' ')).run(this._hash(token),csrf,agora+DUAS_HORAS,agora);
   this.db.exec('COMMIT');emTransacao=false;
   return {token,csrf,expiraEm:agora+DUAS_HORAS};
  }catch(e){
   // Tentativa inválida foi consolidada antes da exceção.
   if(emTransacao)this.db.exec('ROLLBACK');
   throw e;
  }
 }
 sessao(token){
  if(!tokenOk(token))return null;
  const row=this.db.prepare([
   'SELECT csrf,expira_em FROM loja_real_sessoes_admin',
   'WHERE token_hash=? AND expira_em>?'
  ].join(' ')).get(this._hash(token),this.agora());
  if(!row)return null;
  return {csrf:row.csrf,expiraEm:row.expira_em,role:'ADMIN_COMERCIAL'};
 }
 sair(token){
  if(!tokenOk(token))return false;
  return this.db.prepare(
   'DELETE FROM loja_real_sessoes_admin WHERE token_hash=?'
  ).run(this._hash(token)).changes===1;
 }
}
module.exports={SessaoAdminComercialSQLite,COOKIE_ADMIN};
