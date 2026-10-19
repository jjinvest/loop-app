'use strict';
// Dados EDITAVEIS de contato/aparencia do perfil individual no laboratorio.
// Nao atualiza login, identidade imutavel do telefone, CPF, convites ou posicoes.
const {telefoneNormalizado}=require('./contas-participantes-demo-sqlite');
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
 constructor({banco,agora=()=>new Date().toISOString()}={}){
  if(!banco||typeof banco.prepare!=='function')throw new TypeError('SQLite obrigatorio');
  this.banco=banco;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop03_perfil_contato_demo(',
   'conta_id TEXT PRIMARY KEY NOT NULL REFERENCES admin_contas_participantes_demo(id) ON DELETE RESTRICT,',
   'nome_exibicao TEXT NOT NULL,email_contato TEXT NOT NULL,',
   'telefone_contato TEXT,foto_mime TEXT,foto_bytes BLOB,',
   'revisao INTEGER NOT NULL CHECK(revisao>=1),alterado_em TEXT NOT NULL,',
   "CHECK((foto_mime IS NULL AND foto_bytes IS NULL) OR (foto_mime='image/jpeg' AND foto_bytes IS NOT NULL)));"
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
   b.exec('COMMIT');
   return this.consultar(contaId);
  }catch(e){b.exec('ROLLBACK');throw e;}
 }
}
module.exports={PerfilParticipanteDemoSQLite};
