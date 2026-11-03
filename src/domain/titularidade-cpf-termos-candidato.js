'use strict';
// Preparacao de titularidade para candidato de producao, SOMENTE ensaio
// OFFLINE. O checksum do CPF nao prova identidade nem valida direito
// financeiro. Nao disponibilizar endpoint HTTP ou ativar em producao.
const {randomBytes,createHmac,createCipheriv,createDecipheriv,createHash,randomUUID,timingSafeEqual}=require('node:crypto');
const CPF=/^[0-9]{11}$/;
const ID=/^titular-[a-f0-9-]{36}$/;
const VERSAO=/^LAB-[A-Za-z0-9._-]{3,60}$/;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function normalizarCpf(s){
 if(typeof s!=='string'||s.length>18)falha('CPF_INVALIDO');
 const cpf=s.replace(/[.\-\s]/g,'');
 if(!CPF.test(cpf)||/^(\d)\1{10}$/.test(cpf))
  falha('CPF_INVALIDO');
 for(let etapa=9;etapa<11;etapa++){
  const soma=[...cpf.slice(0,etapa)].reduce((a,v,i)=>a+Number(v)*(etapa+1-i),0);
  const resto=(soma*10)%11;
  if(Number(cpf[etapa])!==(resto===10?0:resto))falha('CPF_INVALIDO');
 }
 return cpf;
}
function exigirSegredo(s,n){
 if(!Buffer.isBuffer(s)||s.length!==n)falha('CHAVE_CUSTODIA_INVALIDA');
 return s;
}
function cifrar(cpf,chave){
 const iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',chave,iv);
 cipher.setAAD(Buffer.from('AKITEMM-CANDIDATO-CPF-v1'));
 const ciphertext=Buffer.concat([cipher.update(cpf,'utf8'),cipher.final()]);
 return {iv:iv.toString('hex'),ciphertext:ciphertext.toString('hex'),
  tag:cipher.getAuthTag().toString('hex')};
}
function decifrar({iv,ciphertext,tag},chave){
 const decipher=createDecipheriv('aes-256-gcm',chave,Buffer.from(iv,'hex'));
 decipher.setAAD(Buffer.from('AKITEMM-CANDIDATO-CPF-v1'));
 decipher.setAuthTag(Buffer.from(tag,'hex'));
 return Buffer.concat([decipher.update(Buffer.from(ciphertext,'hex')),decipher.final()]).toString('utf8');
}
function digestCpf(cpf,chave){
 return createHmac('sha256',chave).update('AKITEMM-CANDIDATO-CPF-1:')
  .update(cpf).digest('hex');
}
const PERFIS=Object.freeze({
 checkout:Object.freeze({contas:'akitemm_checkout_staging_contas',
  registro:'akitemm_candidato_titularidade_laboratorio',
  trigger:'candidato_titularidade'}),
 unificada:Object.freeze({contas:'akitemm_conta_unica_candidata',
  registro:'akitemm_candidato_titularidade_unificada',
  trigger:'candidato_unificada_titularidade'})
});
class TitularidadeCpfTermosCandidato{
 constructor({banco,chaveHmac,chaveCifra,perfil='checkout',
  relogio=()=>new Date().toISOString()}={}){
  if(process.env.NODE_ENV==='production')falha('CANDIDATO_NAO_HOMOLOGADO');
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function')
   throw new TypeError('SQLite obrigatorio');
  exigirSegredo(chaveHmac,32);exigirSegredo(chaveCifra,32);
  if(timingSafeEqual(chaveHmac,chaveCifra))falha('CHAVES_DE_CUSTODIA_REUTILIZADAS');
  if(typeof relogio!=='function')falha('RELOGIO_INVALIDO');
  if(!Object.hasOwn(PERFIS,perfil))falha('PERFIL_TITULARIDADE_INVALIDO');
  const tables=PERFIS[perfil];
  this.banco=banco;this.hmac=chaveHmac;this.cifra=chaveCifra;
  this.relogio=relogio;this.tabelaRegistro=tables.registro;
  this.tabelaConta=tables.contas;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS '+tables.registro+'(',
   'id TEXT PRIMARY KEY, titular_id TEXT NOT NULL UNIQUE',
   'REFERENCES '+tables.contas+'(id) ON DELETE RESTRICT,',
   'cpf_hmac TEXT NOT NULL UNIQUE, cpf_iv TEXT NOT NULL,',
   'cpf_ciphertext TEXT NOT NULL,cpf_tag TEXT NOT NULL,',
   'termos_versao TEXT NOT NULL,termos_sha256 TEXT NOT NULL,',
   "estado TEXT NOT NULL CHECK(estado='NAO_VERIFICADA_EXTERNAMENTE'),",
   'criado_em TEXT NOT NULL);',
   'CREATE TRIGGER IF NOT EXISTS '+tables.trigger+'_no_update',
   'BEFORE UPDATE ON '+tables.registro,
   "BEGIN SELECT RAISE(ABORT,'titularidade candidata imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS '+tables.trigger+'_no_delete',
   'BEFORE DELETE ON '+tables.registro,
   "BEGIN SELECT RAISE(ABORT,'titularidade candidata imutavel'); END;"
  ].join(' '));
 }
 registrar({titularId,cpf,termosVersao,termosTexto,aceiteExplicito=false,autorizado=false}={}){
  if(process.env.NODE_ENV==='production'||autorizado!==true)
   falha('REGISTRO_CPF_CANDIDATO_NAO_AUTORIZADO');
  if(typeof titularId!=='string'||!ID.test(titularId))
   falha('TITULAR_INVALIDO');
  const normalized=normalizarCpf(cpf);
  if(typeof termosVersao!=='string'||!VERSAO.test(termosVersao)||
     typeof termosTexto!=='string'||termosTexto.length<30||
     termosTexto.length>50000||aceiteExplicito!==true)
   falha('TERMOS_NAO_ACEITOS_NO_ENSAIO');
  const termosSha=createHash('sha256').update(termosTexto).digest('hex');
  const now=this.relogio();
  if(typeof now!=='string'||!Number.isFinite(Date.parse(now)))
   falha('RELOGIO_INVALIDO');
  const hash=digestCpf(normalized,this.hmac);
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const old=this.banco.prepare([
    'SELECT titular_id,cpf_hmac,termos_versao,termos_sha256',
    'FROM '+this.tabelaRegistro,
    'WHERE titular_id=? OR cpf_hmac=?'
   ].join(' ')).all(titularId,hash);
   if(old.length){
    if(old.length!==1||old[0].titular_id!==titularId||
      old[0].cpf_hmac!==hash||old[0].termos_versao!==termosVersao||
      old[0].termos_sha256!==termosSha)
     falha('CPF_OU_TITULAR_JA_VINCULADO');
    this.banco.exec('COMMIT');
    return {repetido:true,estado:'NAO_VERIFICADA_EXTERNAMENTE',
     permitidoCriarPosicoes:false,permitidoSacar:false,
     termosVersao,termosSha256:termosSha};
   }
   if(!this.banco.prepare('SELECT id FROM '+this.tabelaConta+' WHERE id=?')
     .get(titularId))falha('CONTA_INEXISTENTE');
   const encrypted=cifrar(normalized,this.cifra);
   this.banco.prepare([
    'INSERT INTO '+this.tabelaRegistro,
    '(id,titular_id,cpf_hmac,cpf_iv,cpf_ciphertext,cpf_tag,',
    'termos_versao,termos_sha256,estado,criado_em)',
    "VALUES(?,?,?,?,?,?,?,?,'NAO_VERIFICADA_EXTERNAMENTE',?)"
   ].join(' ')).run('identidade-'+randomUUID(),titularId,hash,
    encrypted.iv,encrypted.ciphertext,encrypted.tag,
    termosVersao,termosSha,now);
   this.banco.exec('COMMIT');
   return {repetido:false,estado:'NAO_VERIFICADA_EXTERNAMENTE',
    permitidoCriarPosicoes:false,permitidoSacar:false,
    termosVersao,termosSha256:termosSha};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 consultar({titularId}={}){
  if(typeof titularId!=='string'||!ID.test(titularId))
   falha('TITULAR_INVALIDO');
  const r=this.banco.prepare([
   'SELECT cpf_iv,cpf_ciphertext,cpf_tag,cpf_hmac,',
   'termos_versao,termos_sha256,estado,criado_em',
   'FROM '+this.tabelaRegistro,
   'WHERE titular_id=?'
  ].join(' ')).get(titularId);
  if(!r)return null;
  let cpf;
  try{cpf=decifrar({iv:r.cpf_iv,ciphertext:r.cpf_ciphertext,tag:r.cpf_tag},this.cifra);}
  catch{falha('INTEGRIDADE_DADOS_PESSOAIS_INVALIDA');}
  if(digestCpf(cpf,this.hmac)!==r.cpf_hmac)
   falha('INTEGRIDADE_DADOS_PESSOAIS_INVALIDA');
  return {estado:r.estado,cpfFinal:cpf.slice(-2),
   titularId,termosVersao:r.termos_versao,termosSha256:r.termos_sha256,
   criadoEm:r.criado_em,identidadeExternaVerificada:false,
   permitidoCriarPosicoes:false,permitidoSacar:false};
 }
}
module.exports={TitularidadeCpfTermosCandidato,normalizarCpf};
