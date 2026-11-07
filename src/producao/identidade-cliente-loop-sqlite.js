'use strict';
// Identidade de clientes REAIS do Escritório LOOP e da Loja AKITEMM.
// Não compartilha banco, cookies ou segredos com o laboratório e NÃO
// habilita compra, posição, remuneração, crédito ou saque.
const {randomUUID,randomBytes,randomInt,createHash,createHmac,
 timingSafeEqual,createCipheriv,createDecipheriv,scrypt}=require('node:crypto');
const {promisify}=require('node:util');
const derivar=promisify(scrypt);
const NICK=/^[a-zA-Z]{1,9}$/;
const NOME=/^[\p{L}\p{M} .'-]{2,90}$/u;
const EMAIL=/^[^\s@<>]{1,64}@[^\s@<>]{1,180}$/;
const VERSAO=/^LOOP-[A-Za-z0-9._-]{5,80}$/;
const COOKIE='loop_real_s';
const PRAZO_SESSAO=60*60*1000, BLOQUEIO=15*60*1000;
const PRAZO_CODIGO=15*60*1000,ESPERA_CODIGO=2*60*1000;
let hashes=0;
function erro(c){const e=new Error(c);e.codigo=c;throw e;}
function validaEmail(s){
 if(typeof s!=='string'||s.length>254||!EMAIL.test(s)||s.includes('..'))
  erro('EMAIL_INVALIDO');
 return s.trim().toLowerCase();
}
function validaNick(s){
 if(typeof s!=='string'||!NICK.test(s))erro('NICK_INVALIDO');
 return s.toLowerCase();
}
function hex(a){return createHash('sha256').update(a).digest('hex');}
function assinar(key,prefix,s){return createHmac('sha256',key).update(prefix+':'+s).digest('hex');}
function igual(a,b){
 if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length||
    !/^[a-f0-9]+$/.test(a)||!/^[a-f0-9]+$/.test(b))return false;
 return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
function cifrar(key,dado){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(Buffer.from('LOOP-REAL-IDENTIDADE-V1'));
 const ct=Buffer.concat([cipher.update(dado,'utf8'),cipher.final()]);
 return [iv.toString('hex'),ct.toString('hex'),cipher.getAuthTag().toString('hex')];
}
function decifrar(key,iv,ct,tag){
 const cipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'hex'));
 cipher.setAAD(Buffer.from('LOOP-REAL-IDENTIDADE-V1'));
 cipher.setAuthTag(Buffer.from(tag,'hex'));
 return Buffer.concat([cipher.update(Buffer.from(ct,'hex')),cipher.final()]).toString('utf8');
}
async function hashSenha(senha,salt){
 if(hashes>=12)erro('AUTENTICACAO_OCUPADA');
 hashes++;
 try{
  return (await derivar(senha,Buffer.from(salt,'hex'),64,{
   N:16384,r:8,p:1,maxmem:32*1024*1024
  })).toString('hex');
 }finally{hashes--;}
}
function senhaValida(s){
 return typeof s==='string'&&Buffer.byteLength(s,'utf8')>=12&&
  Buffer.byteLength(s,'utf8')<=128;
}
function documento(d){
 if(typeof d?.versao!=='string'||!VERSAO.test(d.versao)||
    typeof d?.texto!=='string'||d.texto.length<100||d.texto.length>50000)
  erro('DOCUMENTOS_REAIS_NAO_APROVADOS');
 return Object.freeze({versao:d.versao,texto:d.texto,hash:hex(d.texto)});
}
class IdentidadeClienteLoopReal{
 constructor({banco,chaveEmail,chaveCifra,chaveCodigo,termos,privacidade,
  enviarEmail,agora=()=>Date.now(),somenteTeste=false}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function')
   erro('BANCO_REAL_OBRIGATORIO');
  if(![chaveEmail,chaveCifra,chaveCodigo].every(k=>Buffer.isBuffer(k)&&k.length===32)||
     igual(chaveEmail.toString('hex'),chaveCifra.toString('hex'))||
     igual(chaveEmail.toString('hex'),chaveCodigo.toString('hex'))||
     igual(chaveCifra.toString('hex'),chaveCodigo.toString('hex')))
   erro('CUSTODIA_REAL_INDEPENDENTE_OBRIGATORIA');
  if(typeof enviarEmail!=='function'||typeof agora!=='function')
   erro('EMAIL_REAL_E_RELOGIO_OBRIGATORIOS');
  this.termos=documento(termos);this.privacidade=documento(privacidade);
  this.banco=banco;this.keyEmail=Buffer.from(chaveEmail);
  this.keyCipher=Buffer.from(chaveCifra);this.keyCodigo=Buffer.from(chaveCodigo);
  this.enviarEmail=enviarEmail;this.agora=agora;
  // Banco real próprio. Em produção, proibir memória, caminho do laboratório
  // e reutilização de qualquer tabela akitemm_* de ensaio.
  const local=banco.prepare('PRAGMA database_list').all().find(x=>x.name==='main')?.file||'';
  if(process.env.NODE_ENV==='production'&&(somenteTeste||!local||
     local.includes('/dados-preview/')||!local.includes('/dados-reais/')))
   erro('BANCO_REAL_SEGREGADO_NAO_COMPROVADO');
  const invasao=banco.prepare([
   "SELECT name FROM sqlite_master WHERE type='table'",
   "AND (name LIKE 'akitemm_%' OR name LIKE 'loop_lab_%') LIMIT 1"
  ].join(' ')).get();
  if(invasao)erro('BANCO_LABORATORIO_NAO_PODE_SER_REAL');
  banco.exec('PRAGMA foreign_keys=ON;');
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_real_contas(',
   'id TEXT PRIMARY KEY,nick TEXT UNIQUE NOT NULL COLLATE NOCASE,',
   'email_hmac TEXT NOT NULL UNIQUE,',
   'nome_iv TEXT NOT NULL,nome_ct TEXT NOT NULL,nome_tag TEXT NOT NULL,',
   'email_iv TEXT NOT NULL,email_ct TEXT NOT NULL,email_tag TEXT NOT NULL,',
   'senha_salt TEXT NOT NULL,senha_hash TEXT NOT NULL,',
   'tentativas INTEGER NOT NULL DEFAULT 0,bloqueado_ate INTEGER NOT NULL DEFAULT 0,',
   'termos_versao TEXT NOT NULL,termos_hash TEXT NOT NULL,',
   'priv_versao TEXT NOT NULL,priv_hash TEXT NOT NULL,',
   'criado_em INTEGER NOT NULL,email_confirmado_em INTEGER);',
   'CREATE TABLE IF NOT EXISTS loop_real_sessoes(',
   'token_hash TEXT PRIMARY KEY,titular_id TEXT NOT NULL',
   'REFERENCES loop_real_contas(id) ON DELETE RESTRICT,',
   'criado_em INTEGER NOT NULL,expira_em INTEGER NOT NULL);',
   'CREATE INDEX IF NOT EXISTS idx_loop_real_sessoes_titular',
   'ON loop_real_sessoes(titular_id,criado_em);',
   'CREATE TABLE IF NOT EXISTS loop_real_codigos(',
   'id TEXT PRIMARY KEY,titular_id TEXT NOT NULL',
   'REFERENCES loop_real_contas(id) ON DELETE RESTRICT,',
   "finalidade TEXT NOT NULL CHECK(finalidade IN ('EMAIL','SENHA')),",
   'codigo_hmac TEXT NOT NULL,estado TEXT NOT NULL',
   "CHECK(estado IN ('RESERVADO','ENVIADO','FALHOU','USADO','BLOQUEADO')),",
   'tentativas INTEGER NOT NULL DEFAULT 0 CHECK(tentativas BETWEEN 0 AND 5),',
   'criado_em INTEGER NOT NULL,expira_em INTEGER NOT NULL);',
   'CREATE INDEX IF NOT EXISTS idx_loop_real_codigos',
   'ON loop_real_codigos(titular_id,finalidade,criado_em DESC);',
   'CREATE TABLE IF NOT EXISTS loop_real_custodia(',
   'id INTEGER PRIMARY KEY CHECK(id=1),email_prova TEXT NOT NULL,',
   'cifra_prova TEXT NOT NULL,codigo_prova TEXT NOT NULL);'
  ].join(' '));
  // Impossibilita reabrir banco existente com uma chave diferente.
  const provas=[this.keyEmail,this.keyCipher,this.keyCodigo]
   .map((k,i)=>assinar(k,'LOOP-REAL-CUSTODIA-'+i,'VERSAO-1'));
  const achado=banco.prepare('SELECT * FROM loop_real_custodia WHERE id=1').get();
  if(achado){
   if(!igual(achado.email_prova,provas[0])||
      !igual(achado.cifra_prova,provas[1])||
      !igual(achado.codigo_prova,provas[2]))
    erro('CUSTODIA_REAL_INVALIDA');
  }else{
   banco.prepare([
    'INSERT INTO loop_real_custodia',
    '(id,email_prova,cifra_prova,codigo_prova) VALUES(1,?,?,?)'
   ].join(' ')).run(...provas);
  }
 }
 _agora(){const n=this.agora();if(!Number.isSafeInteger(n)||n<=0)erro('RELOGIO_INVALIDO');return n;}
 documentos(){return {termos:this.termos,privacidade:this.privacidade,financeiroReal:false};}
 async cadastrar({nome,nick,email,senha,aceiteTermos=false,
  aceitePrivacidade=false,versaoTermos,hashTermos,
  versaoPrivacidade,hashPrivacidade}={}){
  const n=validaNick(nick),mail=validaEmail(email);
  if(typeof nome!=='string'||!NOME.test(nome.trim()))erro('NOME_INVALIDO');
  if(!senhaValida(senha))erro('SENHA_INVALIDA');
  if(aceiteTermos!==true||aceitePrivacidade!==true||
     versaoTermos!==this.termos.versao||hashTermos!==this.termos.hash||
     versaoPrivacidade!==this.privacidade.versao||
     hashPrivacidade!==this.privacidade.hash)
   erro('DOCUMENTOS_ALTERADOS_RELER');
  const salt=randomBytes(16).toString('hex'),pass=await hashSenha(senha,salt);
  const encryptedNome=cifrar(this.keyCipher,nome.trim());
  const encryptedEmail=cifrar(this.keyCipher,mail);
  const id='titular-'+randomUUID(),ts=this._agora();
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   this.banco.prepare([
    'INSERT INTO loop_real_contas(',
    'id,nick,email_hmac,nome_iv,nome_ct,nome_tag,email_iv,email_ct,email_tag,',
    'senha_salt,senha_hash,termos_versao,termos_hash,priv_versao,priv_hash,criado_em)',
    'VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
   ].join(' ')).run(id,n,assinar(this.keyEmail,'EMAIL',mail),
    ...encryptedNome,...encryptedEmail,salt,pass,
    this.termos.versao,this.termos.hash,
    this.privacidade.versao,this.privacidade.hash,ts);
   this.banco.exec('COMMIT');
  }catch(e){
   this.banco.exec('ROLLBACK');
   if(/SQLITE_CONSTRAINT|UNIQUE constraint failed/i.test(String(e.code||'')+String(e.message||'')))
    erro('CADASTRO_EXISTENTE');
   throw e;
  }
  return {titularId:id,nick:n,contaCriada:true,emailVerificado:false,
   pagamentoReal:false,participacaoFinanceira:false};
 }
 async entrar({nick,senha}={}){
  let n;try{n=validaNick(nick);}catch{erro('CREDENCIAIS_INVALIDAS');}
  if(typeof senha!=='string'||senha.length>128||senha.length<1)
   erro('CREDENCIAIS_INVALIDAS');
  const anterior=this.banco.prepare('SELECT * FROM loop_real_contas WHERE nick=?').get(n);
  const hash=await hashSenha(senha,anterior?.senha_salt||'abcdabcdabcdabcdabcdabcdabcdabcd');
  const token=randomBytes(32).toString('hex');
  let usuario=null,motivo='CREDENCIAIS_INVALIDAS';
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const atual=this.banco.prepare('SELECT * FROM loop_real_contas WHERE nick=?').get(n);
   const ts=this._agora();
   if(anterior&&atual&&anterior.id===atual.id&&
      anterior.senha_hash===atual.senha_hash){
    if(atual.bloqueado_ate>ts)motivo='CONTA_BLOQUEADA';
    else if(igual(hash,atual.senha_hash)){
     this.banco.prepare(
      'UPDATE loop_real_contas SET tentativas=0,bloqueado_ate=0 WHERE id=?'
     ).run(atual.id);
     this.banco.prepare('DELETE FROM loop_real_sessoes WHERE expira_em<=?').run(ts);
     this.banco.prepare([
      'INSERT INTO loop_real_sessoes(token_hash,titular_id,criado_em,expira_em)',
      'VALUES(?,?,?,?)'
     ].join(' ')).run(hex(token),atual.id,ts,ts+PRAZO_SESSAO);
     this.banco.prepare([
      'DELETE FROM loop_real_sessoes WHERE token_hash IN(',
      'SELECT token_hash FROM loop_real_sessoes WHERE titular_id=?',
      'ORDER BY criado_em DESC,rowid DESC LIMIT -1 OFFSET 5)'
     ].join(' ')).run(atual.id);
     usuario={titularId:atual.id,nick:atual.nick,token,
      csrf:assinar(Buffer.from(token,'hex'),'LOOP-REAL-CSRF','V1'),
      expiraEm:ts+PRAZO_SESSAO,emailVerificado:atual.email_confirmado_em!==null};
    }else{
     const count=atual.tentativas+1;
     this.banco.prepare([
      'UPDATE loop_real_contas SET tentativas=?,bloqueado_ate=? WHERE id=?'
     ].join(' ')).run(Math.min(count,5),count>=5?ts+BLOQUEIO:0,atual.id);
    }
   }
   this.banco.exec('COMMIT');
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
  if(!usuario)erro(motivo);
  return usuario;
 }
 sessao(token){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return null;
  const row=this.banco.prepare([
   'SELECT c.id AS titularId,c.nick,c.email_confirmado_em AS confirmado,',
   's.expira_em AS expiraEm FROM loop_real_sessoes s',
   'JOIN loop_real_contas c ON c.id=s.titular_id',
   'WHERE s.token_hash=? AND s.expira_em>?'
  ].join(' ')).get(hex(token),this._agora());
  if(!row)return null;
  return {...row,emailVerificado:row.confirmado!==null,
   csrf:assinar(Buffer.from(token,'hex'),'LOOP-REAL-CSRF','V1')};
 }
 sair(token){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return false;
  return this.banco.prepare('DELETE FROM loop_real_sessoes WHERE token_hash=?')
   .run(hex(token)).changes===1;
 }
 dadosTitular(titularId){
  // Consulta apenas por ID extraído de uma sessão autenticada pelo servidor;
  // nunca aceitar titularId arbitrário de query/body do navegador.
  if(typeof titularId!=='string'||!/^titular-[a-f0-9-]{36}$/.test(titularId))
   erro('TITULAR_INVALIDO');
  const row=this.banco.prepare([
   'SELECT nick,nome_iv,nome_ct,nome_tag,',
   'email_iv,email_ct,email_tag,',
   'termos_versao,termos_hash,priv_versao,priv_hash,',
   'criado_em,email_confirmado_em',
   'FROM loop_real_contas WHERE id=?'
  ].join(' ')).get(titularId);
  if(!row)erro('TITULAR_INEXISTENTE');
  return {
   nick:row.nick,
   nome:decifrar(this.keyCipher,row.nome_iv,row.nome_ct,row.nome_tag),
   email:decifrar(this.keyCipher,row.email_iv,row.email_ct,row.email_tag),
   documentosAceitos:{
    termos:{versao:row.termos_versao,hash:row.termos_hash},
    privacidade:{versao:row.priv_versao,hash:row.priv_hash}
   },
   registradoEm:row.criado_em,emailVerificado:row.email_confirmado_em!==null,
   // Sem CPF, endereço, saldos ou dados da loja em outro domínio.
   nenhumPagamentoRealNesteServico:true
  };
 }
 _codigo(id,codigo,finalidade){
  return assinar(this.keyCodigo,'CODIGO-'+finalidade,id+':'+codigo);
 }
 _porEmail(email){
  return this.banco.prepare('SELECT id,email_iv,email_ct,email_tag FROM loop_real_contas WHERE email_hmac=?')
   .get(assinar(this.keyEmail,'EMAIL',validaEmail(email)));
 }
 async solicitarCodigo({titularId=null,email=null,finalidade}={}){
  if(!['EMAIL','SENHA'].includes(finalidade))erro('FINALIDADE_INVALIDA');
  const row=finalidade==='SENHA'?this._porEmail(email):
   this.banco.prepare('SELECT id,email_iv,email_ct,email_tag FROM loop_real_contas WHERE id=?').get(titularId);
  const resposta={solicitacaoRecebida:true,semRevelarCadastro:true};
  if(!row)return resposta;
  if(finalidade==='EMAIL'&&this.banco.prepare(
   'SELECT email_confirmado_em FROM loop_real_contas WHERE id=?'
  ).get(row.id).email_confirmado_em!==null)return resposta;
  const ts=this._agora(),id='codigo-'+randomUUID();
  const codigo=String(randomInt(0,100000000)).padStart(8,'0');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const ultimo=this.banco.prepare([
    'SELECT criado_em FROM loop_real_codigos',
    'WHERE titular_id=? AND finalidade=? ORDER BY criado_em DESC,rowid DESC LIMIT 1'
   ].join(' ')).get(row.id,finalidade);
   const count=this.banco.prepare([
    'SELECT COUNT(*) AS n FROM loop_real_codigos',
    'WHERE titular_id=? AND finalidade=? AND criado_em>?'
   ].join(' ')).get(row.id,finalidade,ts-3600000).n;
   if((ultimo&&ts-ultimo.criado_em<ESPERA_CODIGO)||count>=3){
    this.banco.exec('COMMIT');return resposta;
   }
   this.banco.prepare([
    'INSERT INTO loop_real_codigos',
    '(id,titular_id,finalidade,codigo_hmac,estado,criado_em,expira_em)',
    "VALUES(?,?,?,?, 'RESERVADO',?,?)"
   ].join(' ')).run(id,row.id,finalidade,this._codigo(row.id,codigo,finalidade),
    ts,ts+PRAZO_CODIGO);
   this.banco.exec('COMMIT');
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
  let aceito=false;
  try{
   const destino=decifrar(this.keyCipher,row.email_iv,row.email_ct,row.email_tag);
   aceito=await this.enviarEmail({para:destino,codigo,expiraEm:ts+PRAZO_CODIGO,
    finalidade})===true;
  }catch{aceito=false;}
  this.banco.prepare([
   'UPDATE loop_real_codigos SET estado=? WHERE id=? AND estado=?'
  ].join(' ')).run(aceito?'ENVIADO':'FALHOU',id,'RESERVADO');
  if(!aceito)erro('ENVIO_EMAIL_NAO_CONFIRMADO');
  return resposta;
 }
 async confirmarCodigo({titularId=null,email=null,codigo,finalidade,novaSenha}={}){
  if(!['EMAIL','SENHA'].includes(finalidade)||
     typeof codigo!=='string'||!/^[0-9]{8}$/.test(codigo))
   erro('CODIGO_INVALIDO');
  if(finalidade==='SENHA'&&!senhaValida(novaSenha))erro('SENHA_INVALIDA');
  const row=finalidade==='SENHA'?this._porEmail(email):
   this.banco.prepare('SELECT id FROM loop_real_contas WHERE id=?').get(titularId);
  if(!row)erro('CODIGO_INVALIDO');
  // Hash longo fora do lock. O codigo sera revalidado DENTRO da transacao.
  const salt=finalidade==='SENHA'?randomBytes(16).toString('hex'):null;
  const senhaHash=salt?await hashSenha(novaSenha,salt):null;
  this.banco.exec('BEGIN IMMEDIATE');
  let transacaoAberta=true;
  try{
   const atual=this.banco.prepare([
    'SELECT id,codigo_hmac,estado,tentativas,expira_em',
    'FROM loop_real_codigos WHERE titular_id=? AND finalidade=?',
    'ORDER BY criado_em DESC,rowid DESC LIMIT 1'
   ].join(' ')).get(row.id,finalidade);
   if(!atual||atual.estado!=='ENVIADO'||atual.expira_em<=this._agora()||
      atual.tentativas>=5)erro('CODIGO_INVALIDO');
   if(!igual(this._codigo(row.id,codigo,finalidade),atual.codigo_hmac)){
    this.banco.prepare([
     'UPDATE loop_real_codigos SET tentativas=tentativas+1,',
     "estado=CASE WHEN tentativas+1>=5 THEN 'BLOQUEADO'",
     "ELSE 'ENVIADO' END WHERE id=? AND estado='ENVIADO' AND tentativas<5"
    ].join(' ')).run(atual.id);
    this.banco.exec('COMMIT');transacaoAberta=false;
    erro('CODIGO_INVALIDO');
   }
   this.banco.prepare([
    "UPDATE loop_real_codigos SET estado='USADO' WHERE id=? AND estado='ENVIADO'"
   ].join(' ')).run(atual.id);
   if(finalidade==='EMAIL')this.banco.prepare([
    'UPDATE loop_real_contas SET email_confirmado_em=?',
    'WHERE id=? AND email_confirmado_em IS NULL'
   ].join(' ')).run(this._agora(),row.id);
   else{
    this.banco.prepare([
     'UPDATE loop_real_contas SET senha_salt=?,senha_hash=?,tentativas=0,bloqueado_ate=0',
     'WHERE id=?'
    ].join(' ')).run(salt,senhaHash,row.id);
    this.banco.prepare('DELETE FROM loop_real_sessoes WHERE titular_id=?').run(row.id);
   }
   this.banco.exec('COMMIT');transacaoAberta=false;
   return {confirmado:true,emailVerificado:finalidade==='EMAIL',
    sessoesRevogadas:finalidade==='SENHA',pagamentoReal:false};
  }catch(e){
   if(transacaoAberta)this.banco.exec('ROLLBACK');
   throw e;
  }
 }
}
module.exports={IdentidadeClienteLoopReal,COOKIE};
