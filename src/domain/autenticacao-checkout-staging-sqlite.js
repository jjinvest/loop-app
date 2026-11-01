'use strict';
// Identidade persistente de ensaio, sem cadastro publico, CPF, e-mail ou PSP.
// NAO montada em src/server.js: a seguranca operacional ainda requer homologacao.
const {scrypt,randomBytes,randomUUID,createHash,createHmac,timingSafeEqual}=
 require('node:crypto');
const {promisify}=require('node:util');
const derivar=promisify(scrypt);
const LOGIN=/^[a-z][a-z0-9-]{5,31}$/;
const SESSAO=/^[a-f0-9]{64}$/;
const COOKIE='loop_checkout_s';
const DURACAO_MS=3600000;
const BLOQUEIO_MS=900000;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
function digest(x){return createHash('sha256').update(x).digest('hex');}
function segredoValido(s){
 return typeof s==='string'&&Buffer.byteLength(s,'utf8')>=12&&
  Buffer.byteLength(s,'utf8')<=1024&&s.trim().length>=12;
}
function loginNormalizado(nome){
 if(typeof nome!=='string')throw falha('LOGIN_INVALIDO');
 const n=nome.toLowerCase();
 if(!LOGIN.test(n))throw falha('LOGIN_INVALIDO');
 return n;
}
async function segredoDerivado(senha,salt){
 return (await derivar(senha,Buffer.from(salt,'hex'),64,{N:16384,r:8,p:1})).toString('hex');
}
function compararHex(a,b){
 const x=Buffer.from(a||'','hex'),y=Buffer.from(b||'','hex');
 return x.length>0&&x.length===y.length&&timingSafeEqual(x,y);
}
function extrairCookie(req){
 const raw=req.get('cookie');
 if(typeof raw!=='string'||raw.length>4096)return null;
 const encontrados=raw.split(';').map(x=>x.trim()).filter(x=>x.startsWith(COOKIE+'='));
 if(encontrados.length!==1)return null;
 const token=encontrados[0].slice(COOKIE.length+1);
 return SESSAO.test(token)?token:null;
}
function tokenCsrf(token){
 return createHmac('sha256',Buffer.from(token,'hex'))
  .update('AKITEMM_CHECKOUT_STAGING_CSRF_V1').digest('hex');
}
class AutenticacaoCheckoutStagingSQLite{
 constructor({banco,agora=()=>Date.now()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco.exec!=='function')
   throw new TypeError('SQLite de staging obrigatorio');
  this.banco=banco;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_checkout_staging_contas(',
   'id TEXT PRIMARY KEY,login TEXT NOT NULL UNIQUE,salt TEXT NOT NULL,',
   'senha_hash TEXT NOT NULL,erros INTEGER NOT NULL DEFAULT 0,',
   'bloqueado_ate INTEGER NOT NULL DEFAULT 0);',
   'CREATE TABLE IF NOT EXISTS akitemm_checkout_staging_sessoes(',
   'token_hash TEXT PRIMARY KEY,titular_id TEXT NOT NULL',
   'REFERENCES akitemm_checkout_staging_contas(id) ON DELETE RESTRICT,',
   'criado_em INTEGER NOT NULL, expira_em INTEGER NOT NULL);',
   'CREATE INDEX IF NOT EXISTS idx_checkout_staging_sessoes_titular',
   'ON akitemm_checkout_staging_sessoes(titular_id,expira_em);'
  ].join(' '));
 }
 _agora(){
  const n=this.agora();
  if(!Number.isSafeInteger(n)||n<0)throw falha('RELOGIO_INVALIDO');
  return n;
 }
 async provisionarConta({nomeLogin,senha}={}){
  const login=loginNormalizado(nomeLogin);
  if(!segredoValido(senha))throw falha('SENHA_INVALIDA');
  const salt=randomBytes(16).toString('hex');
  const hash=await segredoDerivado(senha,salt);
  const titularId='titular-'+randomUUID();
  try{
   this.banco.prepare(
    'INSERT INTO akitemm_checkout_staging_contas(id,login,salt,senha_hash) VALUES(?,?,?,?)'
   ).run(titularId,login,salt,hash);
  }catch(e){if(e.code?.startsWith('ERR_SQLITE_CONSTRAINT'))
    throw falha('LOGIN_INDISPONIVEL');
   throw e;
  }
  return {titularId,login};
 }
 async entrar({nomeLogin,senha}={}){
  let login;
  try{login=loginNormalizado(nomeLogin);}
  catch{throw falha('CREDENCIAIS_INVALIDAS');}
  if(typeof senha!=='string'||Buffer.byteLength(senha,'utf8')>1024||
    senha.length===0)throw falha('CREDENCIAIS_INVALIDAS');
  const agora=this._agora();
  const conta=this.banco.prepare(
   'SELECT * FROM akitemm_checkout_staging_contas WHERE login=?'
  ).get(login);
  // Trabalhar sempre com um salt/hash para reduzir diferenca de tempo
  // entre conta conhecida e inexistente (controles de rede ainda faltam).
  const salt=conta?.salt||'acd8cb2f4c3ab1b6d124be631b6f24b0';
  const hash=await segredoDerivado(senha,salt);
  if(!conta||!compararHex(hash,conta.senha_hash))
  {
   if(conta){
    const erros=conta.bloqueado_ate>agora?5:conta.erros+1;
    this.banco.prepare(
     'UPDATE akitemm_checkout_staging_contas SET erros=?,bloqueado_ate=? WHERE id=?'
    ).run(erros,erros>=5?agora+BLOQUEIO_MS:0,conta.id);
   }
   throw falha('CREDENCIAIS_INVALIDAS');
  }
  if(conta.bloqueado_ate>agora)throw falha('TENTATIVAS_TEMPORARIAMENTE_BLOQUEADAS');
  this.banco.prepare(
   'UPDATE akitemm_checkout_staging_contas SET erros=0,bloqueado_ate=0 WHERE id=?'
  ).run(conta.id);
  const token=randomBytes(32).toString('hex');
  this.banco.prepare(
   'INSERT INTO akitemm_checkout_staging_sessoes(token_hash,titular_id,criado_em,expira_em) VALUES(?,?,?,?)'
  ).run(digest(token),conta.id,agora,agora+DURACAO_MS);
  return {titularId:conta.id,token,csrf:tokenCsrf(token),expiraEm:agora+DURACAO_MS};
 }
 sessao(req){
  const token=extrairCookie(req);
  if(!token)return null;
  const sessao=this.banco.prepare(
   'SELECT titular_id AS titularId,expira_em AS expiraEm FROM akitemm_checkout_staging_sessoes WHERE token_hash=?'
  ).get(digest(token));
  if(!sessao||sessao.expiraEm<=this._agora())return null;
  return {...sessao,csrf:tokenCsrf(token)};
 }
 identificarTitular(req){return this.sessao(req)?.titularId??null;}
 autorizarMutacao(req){
  const sessao=this.sessao(req);
  const csrf=req.get('x-checkout-csrf');
  return Boolean(sessao&&typeof csrf==='string'&&
   /^[a-f0-9]{64}$/.test(csrf)&&compararHex(csrf,sessao.csrf));
 }
 sair(req){
  const token=extrairCookie(req);
  if(!token)return false;
  return this.banco.prepare(
   'DELETE FROM akitemm_checkout_staging_sessoes WHERE token_hash=?'
  ).run(digest(token)).changes===1;
 }
}
module.exports={
 AutenticacaoCheckoutStagingSQLite,COOKIE,DURACAO_MS,loginNormalizado
};
