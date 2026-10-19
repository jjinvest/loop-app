'use strict';
// Dados EDITAVEIS de contato/aparencia do perfil individual no laboratorio.
// Nao atualiza login, identidade imutavel do telefone, CPF, convites ou posicoes.
const {telefoneNormalizado}=require('./contas-participantes-demo-sqlite');
const {randomInt,randomBytes,createHash,timingSafeEqual}=require('node:crypto');
function falha(codigo){throw Object.assign(new Error(codigo),{codigo});}
function validarNome(nome){
 if(typeof nome!=='string')falha('NOME_INVALIDO');
 const valor=nome.normalize('NFKC').trim().replace(/\s+/g,' ');
 if(valor.length<3||valor.length>60||
  !/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .'-]*$/u.test(valor))
   falha('NOME_INVALIDO');
 return valor;
}
function validarEmail(email){
 if(typeof email!=='string'||email.length>254)falha('EMAIL_INVALIDO');
 const valor=email.trim().toLowerCase();
 if(!/^[^\s@]{1,64}@[^\s@]+\.[^\s@]+$/.test(valor))falha('EMAIL_INVALIDO');
 return valor;
}
function validarFoto(foto){
 if(foto==='MANTER')return {manter:true};
 if(foto==='REMOVER')return {mime:null,bytes:null};
 if(!foto||typeof foto!=='object'||Array.isArray(foto)||
  Object.keys(foto).sort().join(',')!=='base64,mime'||foto.mime!=='image/jpeg'||
  typeof foto.base64!=='string'||foto.base64.length>245000||
  foto.base64.length<16||!/^[A-Za-z0-9+/]+={0,2}$/.test(foto.base64))
   falha('FOTO_INVALIDA');
 const bytes=Buffer.from(foto.base64,'base64');
 if(bytes.length>180000||bytes.length<100||bytes.toString('base64')!==foto.base64||
  bytes[0]!==0xff||bytes[1]!==0xd8||bytes[2]!==0xff||
  bytes.at(-2)!==0xff||bytes.at(-1)!==0xd9)
   falha('FOTO_INVALIDA');
 return {mime:'image/jpeg',bytes};
}
class PerfilParticipanteDemoSQLite {
 constructor({banco,agora=()=>new Date().toISOString(),entregadores={}}={}){
  if(!banco||typeof banco.prepare!=='function')throw new TypeError('SQLite obrigatorio');
  this.banco=banco;this.agora=agora;this.entregadores=entregadores;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop03_perfil_contato_demo(',
   'conta_id TEXT PRIMARY KEY NOT NULL REFERENCES admin_contas_participantes_demo(id) ON DELETE RESTRICT,',
   'nome_exibicao TEXT NOT NULL,email_contato TEXT NOT NULL,',
   'telefone_contato TEXT,foto_mime TEXT,foto_bytes BLOB,',
   'revisao INTEGER NOT NULL CHECK(revisao>=1),alterado_em TEXT NOT NULL,',
   "CHECK((foto_mime IS NULL AND foto_bytes IS NULL) OR (foto_mime='image/jpeg' AND foto_bytes IS NOT NULL)));",
   'CREATE TABLE IF NOT EXISTS loop03_perfil_codigos_demo(',
   'conta_id TEXT NOT NULL,tipo TEXT NOT NULL CHECK(tipo IN (\'EMAIL\',\'TELEFONE\')),',
   'valor TEXT NOT NULL,sal_hex TEXT NOT NULL,digest_hex TEXT NOT NULL,',
   'criado_em INTEGER NOT NULL,expira_em INTEGER NOT NULL,tentativas INTEGER NOT NULL,',
   'confirmado_em INTEGER,PRIMARY KEY(conta_id,tipo));'
  ].join('\n'));
 }
 _linha(contaId){
  return this.banco.prepare([
   'SELECT c.nome,c.email_normalizado AS email_original,',
   't.telefone_normalizado AS telefone_original,',
   'p.nome_exibicao,p.email_contato,p.telefone_contato,',
   'p.foto_mime,p.foto_bytes,p.revisao',
   'FROM admin_contas_participantes_demo c',
   'LEFT JOIN admin_contas_telefones_demo t ON t.conta_id=c.id',
   'LEFT JOIN loop03_perfil_contato_demo p ON p.conta_id=c.id',
   'WHERE c.id=?'
  ].join(' ')).get(contaId);
 }
 consultar(contaId){
  const x=this._linha(contaId);
  if(!x)return null;
  return {nome:x.nome_exibicao||x.nome,email:x.email_contato||x.email_original,
   telefone:x.revisao?x.telefone_contato:(x.telefone_original||''),
   temFoto:Boolean(x.foto_bytes),revisao:x.revisao||0,
   laboratorio:true,contatoNaoVerificado:true};
 }
 foto(contaId){
  const x=this._linha(contaId);
  if(!x||!x.foto_bytes)return null;
  return {mime:x.foto_mime,bytes:x.foto_bytes};
 }
 _normalizarTipoValor(tipo,valor){
  if(tipo==='EMAIL')return validarEmail(valor);
  if(tipo==='TELEFONE'){
   try{
    const t=telefoneNormalizado(valor);
    if(!t)falha('TELEFONE_INVALIDO');
    return t;
   }catch{falha('TELEFONE_INVALIDO');}
  }
  falha('TIPO_INVALIDO');
 }
 async solicitarCodigo(contaId,{tipo,valor}={}){
  const novo=this._normalizarTipoValor(tipo,valor),remetente=this.entregadores[tipo];
  if(typeof remetente!=='function')falha('ENVIO_NAO_CONFIGURADO');
  const atual=this._linha(contaId);
  if(!atual)falha('CONTA_NAO_ENCONTRADA');
  const vigente=tipo==='EMAIL'?(atual.email_contato||atual.email_original):
   (atual.revisao?atual.telefone_contato:atual.telefone_original);
  if(novo===vigente)falha('CONTATO_JA_ATUAL');
  const agora=Date.parse(this.agora()),previo=this.banco.prepare(
   'SELECT criado_em FROM loop03_perfil_codigos_demo WHERE conta_id=? AND tipo=?'
  ).get(contaId,tipo);
  if(previo&&agora-previo.criado_em<60000)falha('AGUARDE_NOVO_CODIGO');
  const codigo=String(randomInt(0,1000000)).padStart(6,'0');
  const sal=randomBytes(16).toString('hex');
  const digest=createHash('sha256').update(sal+':'+codigo).digest('hex');
  this.banco.prepare([
   'INSERT INTO loop03_perfil_codigos_demo',
   '(conta_id,tipo,valor,sal_hex,digest_hex,criado_em,expira_em,tentativas,confirmado_em)',
   'VALUES(?,?,?,?,?,?,?,?,NULL)',
   'ON CONFLICT(conta_id,tipo) DO UPDATE SET',
   'valor=excluded.valor,sal_hex=excluded.sal_hex,digest_hex=excluded.digest_hex,',
   'criado_em=excluded.criado_em,expira_em=excluded.expira_em,',
   'tentativas=0,confirmado_em=NULL'
  ].join(' ')).run(contaId,tipo,novo,sal,digest,agora,agora+600000,0);
  try{
   await remetente({destino:novo,codigo,expiraEm:new Date(agora+600000).toISOString()});
  }catch{
   this.banco.prepare('DELETE FROM loop03_perfil_codigos_demo WHERE conta_id=? AND tipo=? AND digest_hex=?')
    .run(contaId,tipo,digest);
   falha('ENVIO_NAO_CONCLUIDO');
  }
  return {destino:novo,tipo,expiraEm:new Date(agora+600000).toISOString(),
   enviado:true,semCodigoNaResposta:true};
 }
 confirmarCodigo(contaId,{tipo,codigo}={}){
  if(!['EMAIL','TELEFONE'].includes(tipo)||typeof codigo!=='string'||
   !/^\d{6}$/.test(codigo))falha('CODIGO_INVALIDO');
  const linha=this.banco.prepare(
   'SELECT * FROM loop03_perfil_codigos_demo WHERE conta_id=? AND tipo=?'
  ).get(contaId,tipo);
  if(!linha||Date.parse(this.agora())>linha.expira_em||
   linha.tentativas>=5)falha('CODIGO_EXPIRADO_OU_BLOQUEADO');
  const recebido=createHash('sha256').update(linha.sal_hex+':'+codigo).digest();
  const correto=Buffer.from(linha.digest_hex,'hex');
  if(!timingSafeEqual(recebido,correto)){
   this.banco.prepare(
    'UPDATE loop03_perfil_codigos_demo SET tentativas=tentativas+1 WHERE conta_id=? AND tipo=?'
   ).run(contaId,tipo);
   falha('CODIGO_INVALIDO');
  }
  this.banco.prepare('UPDATE loop03_perfil_codigos_demo SET confirmado_em=? WHERE conta_id=? AND tipo=?')
   .run(Date.parse(this.agora()),contaId,tipo);
  return {tipo,confirmado:true,destino:linha.valor};
 }
 _exigirCodigoConfirmado(contaId,tipo,valor){
  const linha=this.banco.prepare(
   'SELECT valor,expira_em,confirmado_em FROM loop03_perfil_codigos_demo WHERE conta_id=? AND tipo=?'
  ).get(contaId,tipo);
  if(!linha||linha.valor!==valor||!linha.confirmado_em||linha.expira_em<Date.parse(this.agora()))
   falha('CONTATO_EXIGE_CODIGO');
 }
 atualizar(contaId,{nome,email,telefone,foto,revisaoEsperada}={}){
  const nomeLimpo=validarNome(nome),emailLimpo=validarEmail(email);
  let telefoneLimpo;
  try{telefoneLimpo=telefoneNormalizado(telefone);}
  catch{falha('TELEFONE_INVALIDO');}
  if(!Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<0)
   falha('REVISAO_INVALIDA');
  const novaFoto=validarFoto(foto);
  const b=this.banco;
  b.exec('BEGIN IMMEDIATE');
  try{
   const atual=this._linha(contaId);
   if(!atual)falha('CONTA_NAO_ENCONTRADA');
   if((atual.revisao||0)!==revisaoEsperada)falha('CONFLITO_REVISAO');
   const emailAnterior=atual.email_contato||atual.email_original;
   const telefoneAnterior=atual.revisao?atual.telefone_contato:atual.telefone_original;
   if(emailLimpo!==emailAnterior)this._exigirCodigoConfirmado(contaId,'EMAIL',emailLimpo);
   if(telefoneLimpo!==telefoneAnterior){
    if(!telefoneLimpo)falha('TELEFONE_EXIGE_CODIGO');
    this._exigirCodigoConfirmado(contaId,'TELEFONE',telefoneLimpo);
   }
   const mime=novaFoto.manter?atual.foto_mime:novaFoto.mime;
   const bytes=novaFoto.manter?atual.foto_bytes:novaFoto.bytes;
   const data=this.agora();
   b.prepare([
    'INSERT INTO loop03_perfil_contato_demo',
    '(conta_id,nome_exibicao,email_contato,telefone_contato,foto_mime,foto_bytes,revisao,alterado_em)',
    'VALUES(?,?,?,?,?,?,?,?)',
    'ON CONFLICT(conta_id) DO UPDATE SET',
    'nome_exibicao=excluded.nome_exibicao,email_contato=excluded.email_contato,',
    'telefone_contato=excluded.telefone_contato,foto_mime=excluded.foto_mime,',
    'foto_bytes=excluded.foto_bytes,revisao=excluded.revisao,alterado_em=excluded.alterado_em'
   ].join(' ')).run(contaId,nomeLimpo,emailLimpo,telefoneLimpo,mime,bytes,revisaoEsperada+1,data);
   b.prepare('DELETE FROM loop03_perfil_codigos_demo WHERE conta_id=?').run(contaId);
   b.exec('COMMIT');
   return this.consultar(contaId);
  }catch(e){b.exec('ROLLBACK');throw e;}
 }
}
module.exports={PerfilParticipanteDemoSQLite};
