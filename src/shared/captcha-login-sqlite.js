'use strict';
// Login: nenhuma prova no primeiro acesso. Uma credencial incorreta ativa
// CAPTCHA obrigatório para a próxima tentativa daquele nick por 15 min.
// O estado é compartilhado por todas as réplicas no mesmo SQLite, sem nick em claro.
// A limitação de taxa/lockout de senhas existente continua obrigatória.
const {createHmac}=require('node:crypto');
const {CaptchaCadastroSQLite}=require('./captcha-cadastro-sqlite');
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
class CaptchaLoginSQLite{
 constructor({banco,segredo,contexto='REAL',agora=()=>Date.now()}={}){
  if(!banco||typeof banco.prepare!=='function'||!Buffer.isBuffer(segredo)||
     segredo.length!==32||!['REAL','PREVIA'].includes(contexto))
   falha('CAPTCHA_LOGIN_CONFIGURACAO_INVALIDA');
  this.banco=banco;this.segredo=segredo;this.agora=agora;
  this.prova=new CaptchaCadastroSQLite({
   banco,segredo,contexto:contexto==='REAL'?'LOGINREAL':'LOGINPREVIA',agora
  });
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_captcha_login_falhas_v1(',
   'nick_hmac TEXT PRIMARY KEY,erros INTEGER NOT NULL CHECK(erros>0),',
   'expira_em INTEGER NOT NULL);',
   'CREATE INDEX IF NOT EXISTS loop_captcha_login_falhas_expira',
   'ON loop_captcha_login_falhas_v1(expira_em);'
  ].join(' '));
 }
 _chave(nick){
  if(typeof nick!=='string'||nick.length<1||nick.length>100)
   return null;
  return createHmac('sha256',this.segredo)
   .update('LOGIN-FALHAS-V1:'+nick.trim().toLowerCase()).digest('hex');
 }
 exigir(nick){
  const k=this._chave(nick);if(!k)return false;
  const row=this.banco.prepare(
   'SELECT erros,expira_em FROM loop_captcha_login_falhas_v1 WHERE nick_hmac=?'
  ).get(k);
  return !!(row&&row.erros>=1&&row.expira_em>this.agora());
 }
 registrarErro(nick){
  const k=this._chave(nick);if(!k)return false;
  const agora=this.agora();
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   this.banco.prepare('DELETE FROM loop_captcha_login_falhas_v1 WHERE expira_em<=?')
    .run(agora);
   const total=this.banco.prepare(
    'SELECT COUNT(*) AS n FROM loop_captcha_login_falhas_v1'
   ).get().n;
   if(total>20000)falha('CAPTCHA_OCUPADO');
   this.banco.prepare([
    'INSERT INTO loop_captcha_login_falhas_v1',
    '(nick_hmac,erros,expira_em) VALUES(?,1,?)',
    'ON CONFLICT(nick_hmac) DO UPDATE SET',
    'erros=MIN(erros+1,100),expira_em=excluded.expira_em'
   ].join(' ')).run(k,agora+900000);
   this.banco.exec('COMMIT');
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
  return true;
 }
 concluirSucesso(nick){
  const k=this._chave(nick);
  if(k)this.banco.prepare(
   'DELETE FROM loop_captcha_login_falhas_v1 WHERE nick_hmac=?'
  ).run(k);
 }
 verificarAntes(nick,{captchaId,captchaResposta}={}){
  const necessario=this.exigir(nick);
  // Se a UI exibiu a prova por erro anterior em outro nick, validar mesmo
  // quando o nick atual ainda não havia falhado: o desafio nunca é decorativo.
  if(!necessario&&captchaId===undefined&&captchaResposta===undefined)
   return true;
  if(!captchaId||!captchaResposta)
   falha('CAPTCHA_LOGIN_OBRIGATORIO');
  this.prova.verificar({captchaId,captchaResposta});
  return true;
 }
 emitir(){return this.prova.emitir();}
}
module.exports={CaptchaLoginSQLite};
