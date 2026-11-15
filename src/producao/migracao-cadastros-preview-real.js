'use strict';
// Ponte UNIDIRECIONAL: apenas identidades, senhas scrypt e vinculos de cadastro.
// Sem saldos, pedidos, posicoes, giro, CPF ficticio, cookies ou sandbox.
const {randomBytes,createHmac,createHash,hkdfSync,createCipheriv,createDecipheriv}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const NICK=/^[a-zA-Z]{1,12}$/;
const ID=/^titular-[a-f0-9-]{36}$/;
const HEX=/^[a-f0-9]{64}$/;
const H128=/^[a-f0-9]{128}$/;
const MAX_BYTES=2*1024*1024;
function erro(c){const e=new Error(c);e.codigo=c;throw e;}
const digest=s=>createHash('sha256').update(s).digest('hex');
function chave(token){
 if(typeof token!=='string'||!HEX.test(token))erro('MIGRACAO_TOKEN_AUSENTE');
 return Buffer.from(hkdfSync('sha256',Buffer.from(token,'hex'),
  Buffer.from('LOOP-MIGRACAO-IDENTIDADE-2026'),Buffer.from('CUSTODIA-TRANSPORTE-V1'),32));
}
function cifrar(k,dado,aad){
 const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',k,iv);
 c.setAAD(Buffer.from(aad));
 const bin=Buffer.concat([c.update(dado),c.final()]);
 return [iv.toString('hex'),bin.toString('hex'),c.getAuthTag().toString('hex')];
}
function decifrar(k,iv,ct,tag,aad){
 const c=createDecipheriv('aes-256-gcm',k,Buffer.from(iv,'hex'));
 c.setAAD(Buffer.from(aad));
 c.setAuthTag(Buffer.from(tag,'hex'));
 return Buffer.concat([c.update(Buffer.from(ct,'hex')),c.final()]).toString('utf8');
}
function empacotar(registro,token){
 const plain=Buffer.from(JSON.stringify(registro),'utf8');
 if(plain.length>MAX_BYTES)erro('MIGRACAO_LOTE_GRANDE');
 const [iv,ct,tag]=cifrar(chave(token),plain,'LOOP-MIGRACAO-IDENTIDADE-V1');
 plain.fill(0);
 return {version:1,iv,ct,tag};
}
function desempacotar(pacote,token){
 if(!pacote||Object.keys(pacote).sort().join(',')!=='ct,iv,tag,version'||
    pacote.version!==1||!/^[a-f0-9]{24}$/.test(pacote.iv)||
    !/^[a-f0-9]{32}$/.test(pacote.tag)||
    typeof pacote.ct!=='string'||pacote.ct.length>MAX_BYTES*2+80||
    !/^[a-f0-9]+$/.test(pacote.ct))erro('MIGRACAO_PACOTE_INVALIDO');
 let text;
 try{text=decifrar(chave(token),pacote.iv,pacote.ct,pacote.tag,
  'LOOP-MIGRACAO-IDENTIDADE-V1');}
 catch{erro('MIGRACAO_ASSINATURA_INVALIDA');}
 try{return JSON.parse(text);}catch{erro('MIGRACAO_JSON_INVALIDO');}
}
function exportarPreview({banco,contas}={}){
 if(process.env.NODE_ENV==='production'||!banco||!contas?.cipherKey||
    typeof contas.emailParaEntrega!=='function'||
    typeof contas.perfil!=='function')erro('MIGRACAO_FONTE_INVALIDA');
 if(banco.prepare('PRAGMA quick_check').get().quick_check!=='ok'||
    banco.prepare('PRAGMA foreign_key_check').all().length)
  erro('MIGRACAO_FONTE_CORROMPIDA');
 const rows=banco.prepare([
  'SELECT id,nick,email_hmac,nome_iv,nome_cifra,nome_tag,',
  'email_iv,email_cifra,email_tag,telefone_iv,telefone_cifra,telefone_tag,',
  'senha_salt,senha_hash,termos_versao,termos_hash,criado_em',
  'FROM akitemm_conta_unica_candidata ORDER BY criado_em,id'
 ].join(' ')).all();
 if(rows.length>10000)erro('MIGRACAO_CAPACIDADE_EXCEDIDA');
 const contasExportadas=rows.map(r=>{
  if(!ID.test(r.id)||!/^[a-f0-9]{32}$/.test(r.senha_salt)||!H128.test(r.senha_hash)||
     !HEX.test(r.termos_hash)||!Number.isSafeInteger(r.criado_em)||
     r.criado_em<=0)erro('MIGRACAO_CADASTRO_INVALIDO');
  const nome=contas.perfil(r.id).nome;
  const email=contas.emailParaEntrega(r.id);
  let telefone=null;
  if(r.telefone_iv||r.telefone_cifra||r.telefone_tag){
   if(!r.telefone_iv||!r.telefone_cifra||!r.telefone_tag)
    erro('MIGRACAO_TELEFONE_INCOMPLETO');
   telefone=decifrar(contas.cipherKey,r.telefone_iv,
    r.telefone_cifra,r.telefone_tag,'AKITEMM-CANDIDATO-CONTA-1');
  }
  return {id:r.id,nick:r.nick,nome,email,telefone,
   senhaSalt:r.senha_salt,senhaHash:r.senha_hash,
   termosVersao:r.termos_versao,termosHash:r.termos_hash,
   criadoEm:r.criado_em};
 });
 const tabelas=new Set(banco.prepare(
  "SELECT name FROM sqlite_master WHERE type='table'"
 ).all().map(x=>x.name));
 const vinculos=tabelas.has('akitemm_convites_candidatos_lab')?
  banco.prepare([
   'SELECT indicado_id AS indicadoId,indicador_id AS indicadorId,',
   'criado_em AS registradoEm FROM akitemm_convites_candidatos_lab',
   'ORDER BY criado_em,indicado_id'
  ].join(' ')).all():[];
 const ids=new Set(contasExportadas.map(x=>x.id));
 const nickCaso=new Set();
 for(const a of contasExportadas){
  if(!NICK.test(a.nick)||nickCaso.has(a.nick.toLowerCase()))
   erro('MIGRACAO_NICK_INCOMPATIVEL_OU_DUPLICADO');
  nickCaso.add(a.nick.toLowerCase());
  if(!/^[^\s@<>]{1,64}@[^\s@<>]{1,180}$/.test(a.email)||
     typeof a.nome!=='string'||a.nome.length<2||
     a.telefone!==null&&!/^(?:[0-9]{10,11}|55[0-9]{10,11})$/.test(a.telefone))
   erro('MIGRACAO_DADOS_ORIGEM_INVALIDOS');
 }
 if(vinculos.some(v=>!ids.has(v.indicadoId)||!ids.has(v.indicadorId)||
   v.indicadoId===v.indicadorId||
   !Number.isSafeInteger(v.registradoEm)||v.registradoEm<=0))
  erro('MIGRACAO_VINCULOS_DIVERGENTES');
 return {version:1,contas:contasExportadas,vinculos,
  conferencias:{contas:contasExportadas.length,vinculos:vinculos.length,
   provaIds:digest(contasExportadas.map(x=>x.id).sort().join('|')),
   provaVinculos:digest(vinculos.map(x=>x.indicadoId+':'+x.indicadorId).sort().join('|'))}};
}
function prepararEsquemaImportacao(banco){
 banco.exec([
  'CREATE TABLE IF NOT EXISTS loop_real_telefones_legados(',
  'titular_id TEXT PRIMARY KEY REFERENCES loop_real_contas(id) ON DELETE RESTRICT,',
  'telefone_iv TEXT NOT NULL,telefone_ct TEXT NOT NULL,telefone_tag TEXT NOT NULL,',
  'registrado_em INTEGER NOT NULL);',
  'CREATE TABLE IF NOT EXISTS loop_real_migracoes_preview(',
  'titular_id TEXT PRIMARY KEY REFERENCES loop_real_contas(id) ON DELETE RESTRICT,',
  'termos_origem_versao TEXT NOT NULL,termos_origem_hash TEXT NOT NULL,',
  'documentos_definitivos_pendentes INTEGER NOT NULL CHECK(documentos_definitivos_pendentes=1),',
  'importado_em INTEGER NOT NULL);'
 ].join(' '));
}
function importarNoReal({banco,payload,chaveEmail,chaveCifra,agora=()=>Date.now()}={}){
 if(!banco||!Buffer.isBuffer(chaveEmail)||chaveEmail.length!==32||
    !Buffer.isBuffer(chaveCifra)||chaveCifra.length!==32||
    !payload||payload.version!==1||
    !Array.isArray(payload.contas)||!Array.isArray(payload.vinculos)||
    payload.contas.length>10000||payload.vinculos.length>10000)
  erro('MIGRACAO_DESTINO_INVALIDO');
 if(banco.prepare('PRAGMA quick_check').get().quick_check!=='ok')
  erro('MIGRACAO_DESTINO_CORROMPIDO');
 const chk=payload.conferencias;
 if(!chk||chk.contas!==payload.contas.length||
    chk.vinculos!==payload.vinculos.length||
    chk.provaIds!==digest(payload.contas.map(x=>x.id).sort().join('|'))||
    chk.provaVinculos!==digest(payload.vinculos.map(x=>x.indicadoId+':'+x.indicadorId).sort().join('|')))
  erro('MIGRACAO_CONTAGEM_DIVERGENTE');
 const ids=new Set(),nickset=new Set(),emails=new Set();
 for(const x of payload.contas){
  if(!ID.test(x.id)||!NICK.test(x.nick)||ids.has(x.id)||
     typeof x.nome!=='string'||x.nome.length<2||
     typeof x.email!=='string'||!/^([^\s@<>]+)@([^\s@<>]+)$/.test(x.email)||
     !/^[a-f0-9]{32}$/.test(x.senhaSalt)||!H128.test(x.senhaHash)||
     !HEX.test(x.termosHash)||typeof x.termosVersao!=='string'||
     x.termosVersao.length>90||!Number.isSafeInteger(x.criadoEm)||
     x.criadoEm<=0||!(x.telefone===null||
       typeof x.telefone==='string'&&/^(?:[0-9]{10,11}|55[0-9]{10,11})$/.test(x.telefone)))
   erro('MIGRACAO_REGISTRO_INVALIDO');
  ids.add(x.id);
  const n=x.nick.toLowerCase(),email=x.email.toLowerCase();
  if(nickset.has(n)||emails.has(email))erro('MIGRACAO_DUPLICATA_NICK_EMAIL');
  nickset.add(n);emails.add(email);
 }
 const liens=new Set();
 for(const x of payload.vinculos){
  if(!ID.test(x.indicadoId)||!ID.test(x.indicadorId)||
     !ids.has(x.indicadoId)||!ids.has(x.indicadorId)||
     x.indicadoId===x.indicadorId||liens.has(x.indicadoId)||
     !Number.isSafeInteger(x.registradoEm)||x.registradoEm<=0)
   erro('MIGRACAO_VINCULO_INVALIDO');
  liens.add(x.indicadoId);
 }
 prepararEsquemaImportacao(banco);
 const cifrarReal=(d)=>cifrar(chaveCifra,Buffer.from(d,'utf8'),'LOOP-REAL-IDENTIDADE-V1');
 const emailHmac=s=>createHmac('sha256',chaveEmail).update('EMAIL:'+s).digest('hex');
 let inseridas=0,vinculadas=0;
 banco.exec('BEGIN IMMEDIATE');
 try{
  const pendente=digest('PRIVACIDADE-REAL-PENDENTE');
  for(const x of payload.contas){
   const nick=x.nick.toLowerCase(),mail=x.email.toLowerCase();
   const atual=banco.prepare('SELECT id,nick FROM loop_real_contas WHERE id=? OR nick=?')
    .get(x.id,nick);
   if(atual){
    if(atual.id!==x.id||atual.nick.toLowerCase()!==nick||
       !banco.prepare('SELECT 1 FROM loop_real_migracoes_preview WHERE titular_id=?').get(x.id))
     erro('MIGRACAO_COLISAO_CONTA_REAL');
    continue;
   }
   const nome=cifrarReal(x.nome),email=cifrarReal(mail);
   banco.prepare([
    'INSERT INTO loop_real_contas(',
    'id,nick,email_hmac,nome_iv,nome_ct,nome_tag,',
    'email_iv,email_ct,email_tag,senha_salt,senha_hash,',
    'termos_versao,termos_hash,priv_versao,priv_hash,criado_em)',
    'VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
   ].join(' ')).run(x.id,nick,emailHmac(mail),...nome,...email,
    x.senhaSalt,x.senhaHash,'LOOP-MIGRADO-ACEITE-PENDENTE',
    x.termosHash,'LOOP-MIGRADO-ACEITE-PENDENTE',pendente,x.criadoEm);
   banco.prepare([
    'INSERT INTO loop_real_migracoes_preview',
    '(titular_id,termos_origem_versao,termos_origem_hash,',
    'documentos_definitivos_pendentes,importado_em) VALUES(?,?,?,1,?)'
   ].join(' ')).run(x.id,x.termosVersao,x.termosHash,agora());
   if(x.telefone!==null){
    const tel=x.telefone.startsWith('55')&&x.telefone.length>11?
     x.telefone.slice(2):x.telefone;
    const e=cifrarReal(tel);
    banco.prepare([
     'INSERT INTO loop_real_telefones_legados',
     '(titular_id,telefone_iv,telefone_ct,telefone_tag,registrado_em)',
     'VALUES(?,?,?,?,?)'
    ].join(' ')).run(x.id,...e,x.criadoEm);
   }
   inseridas++;
  }
  for(const v of payload.vinculos){
   const existente=banco.prepare(
    'SELECT indicador_id FROM loop_real_vinculos_indicacao WHERE indicado_id=?'
   ).get(v.indicadoId);
   if(existente){
    if(existente.indicador_id!==v.indicadorId)
     erro('MIGRACAO_COLISAO_INDICACAO');
    continue;
   }
   banco.prepare([
    'INSERT INTO loop_real_vinculos_indicacao',
    '(indicado_id,indicador_id,registrado_em) VALUES(?,?,?)'
   ].join(' ')).run(v.indicadoId,v.indicadorId,v.registradoEm);
   vinculadas++;
  }
  if(banco.prepare('PRAGMA foreign_key_check').all().length)
   erro('MIGRACAO_CHAVE_ESTRANGEIRA_DIVERGENTE');
  banco.exec('COMMIT');
 }catch(e){banco.exec('ROLLBACK');throw e;}
 const ver=banco.prepare('SELECT COUNT(*) AS n FROM loop_real_migracoes_preview').get().n;
 const edges=banco.prepare('SELECT COUNT(*) AS n FROM loop_real_vinculos_indicacao').get().n;
 const primeira=banco.prepare([
  'SELECT c.nick FROM loop_real_vinculos_indicacao v',
  'JOIN loop_real_contas c ON c.id=v.indicado_id',
  'JOIN loop_real_contas p ON p.id=v.indicador_id',
  "WHERE p.nick='vilela' ORDER BY v.registrado_em,v.indicado_id LIMIT 1"
 ].join(' ')).get()?.nick||null;
 return {contasImportadas:ver,vinculosImportados:edges,
  adicionadas:inseridas,novosVinculos:vinculadas,
  primeiraIndicacaoVilelaConferida:primeira==='taisaassi',
  documentosDefinitivosAindaPendentes:true,
  pagamentosLiberados:false,contasImportadasSemRefazerCadastro:true};
}
module.exports={empacotar,desempacotar,exportarPreview,prepararEsquemaImportacao,importarNoReal};
