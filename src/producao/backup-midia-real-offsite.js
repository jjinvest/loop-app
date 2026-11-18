'use strict';
// Custódia independente do catálogo real, sem sobrescrever bancos ativos.
// Snapshot consistente SQLite, AES-256-GCM, PUT+GET S3, SHA e restore isolado.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {Readable,Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const {randomBytes,randomUUID,createHash,createCipheriv,createDecipheriv,hkdfSync}=
 require('node:crypto');
const {validarConfig,assinarObjetoS3Real}=
 require('./backup-identidade-offsite');
const MAGIC=Buffer.from('LOOPMIDIAREAL1','ascii'),TAG=16,HEADER=MAGIC.length+28;
const LIMITE=512*1024*1024;
const MIME=new Set(['image/jpeg','image/png','image/webp']);
function falha(c){const e=Error(c);e.codigo=c;throw e;}
async function hashArquivo(file){
 const h=createHash('sha256');
 for await(const chunk of fs.createReadStream(file))h.update(chunk);
 return h.digest('hex');
}
function derivar(chave,salt){
 return Buffer.from(hkdfSync('sha256',chave,salt,
  Buffer.from('LOOP-CATALOGO-MIDIA-REAL-BACKUP-V1'),32));
}
function validarAcervoMidia(arquivo){
 if(typeof arquivo!=='string'||!path.isAbsolute(arquivo)||!fs.existsSync(arquivo)||
    !fs.lstatSync(arquivo).isFile()||fs.lstatSync(arquivo).isSymbolicLink())
  falha('BACKUP_MIDIA_ORIGEM_INVALIDA');
 const db=new DatabaseSync(arquivo,{readOnly:true});
 try{
  const tabelas=new Set(db.prepare(
   "SELECT name FROM sqlite_master WHERE type='table'"
  ).all().map(x=>x.name));
  for(const tabela of [
   'catalogo_produtos','akitemm_fotos_produto_versoes_lab',
   'akitemm_fotos_produto_atuais_lab','akitemm_curso_pdf_versoes_real',
   'akitemm_curso_pdf_atual_real','admin_akitemm_banner_arquivos_v1'
  ])if(!tabelas.has(tabela))falha('BACKUP_MIDIA_ESQUEMA_INCOMPLETO');
  if(db.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok'||
     db.prepare('PRAGMA foreign_key_check').all().length)
   falha('BACKUP_MIDIA_SQLITE_CORROMPIDO');
  const count=t=>db.prepare('SELECT COUNT(*) AS n FROM '+t).get().n;
  const produtos=count('catalogo_produtos');
  const fotosAtuais=count('akitemm_fotos_produto_atuais_lab');
  const pdfsAtuais=count('akitemm_curso_pdf_atual_real');
  const banners=count('admin_akitemm_banner_arquivos_v1');
  const semFoto=db.prepare([
   'SELECT COUNT(*) AS n FROM akitemm_fotos_produto_atuais_lab a',
   'LEFT JOIN akitemm_fotos_produto_versoes_lab v ON',
   'v.produto_id=a.produto_id AND v.posicao=a.posicao AND v.versao=a.versao',
   'WHERE v.produto_id IS NULL'
  ].join(' ')).get().n;
  const semPdf=db.prepare([
   'SELECT COUNT(*) AS n FROM akitemm_curso_pdf_atual_real a',
   'LEFT JOIN akitemm_curso_pdf_versoes_real v ON',
   'v.produto_id=a.produto_id AND v.versao=a.versao',
   'WHERE v.produto_id IS NULL'
  ].join(' ')).get().n;
  if(semFoto||semPdf)falha('BACKUP_MIDIA_REFERENCIAS_INVALIDAS');
  let versoesFotos=0,versoesPdfs=0;
  for(const row of db.prepare([
   'SELECT sha256,mime,bytes,conteudo FROM akitemm_fotos_produto_versoes_lab'
  ].join(' ')).iterate()){
   versoesFotos++;
   if(!MIME.has(row.mime)||!(row.conteudo instanceof Uint8Array)||
      row.bytes!==row.conteudo.length||
      createHash('sha256').update(row.conteudo).digest('hex')!==row.sha256)
    falha('BACKUP_MIDIA_FOTO_CORROMPIDA');
  }
  for(const row of db.prepare(
   'SELECT sha256,bytes,conteudo FROM akitemm_curso_pdf_versoes_real'
  ).iterate()){
   versoesPdfs++;
   if(!(row.conteudo instanceof Uint8Array)||row.bytes!==row.conteudo.length||
      createHash('sha256').update(row.conteudo).digest('hex')!==row.sha256)
    falha('BACKUP_MIDIA_PDF_CORROMPIDO');
  }
  if(versoesFotos<fotosAtuais||versoesPdfs<pdfsAtuais)
   falha('BACKUP_MIDIA_HISTORICO_INCOMPLETO');
  for(const row of db.prepare(
   'SELECT mime,imagem FROM admin_akitemm_banner_arquivos_v1'
  ).iterate()){
   if(!MIME.has(row.mime)||!(row.imagem instanceof Uint8Array)||
      row.imagem.length<40||row.imagem.length>4*1024*1024)
    falha('BACKUP_MIDIA_BANNER_CORROMPIDO');
  }
  return Object.freeze({produtos,fotosAtuais,versoesFotos,
   pdfsAtuais,versoesPdfs,banners,integridadeSQLite:'ok'});
 }finally{db.close();}
}
async function provarBackupMidiaOffsite({fonteSqlite,chaveBackup,config,
 buscar=fetch,agora=()=>new Date(),id=randomUUID,maxBytes=LIMITE}={}){
 if(typeof fonteSqlite!=='string'||!path.isAbsolute(fonteSqlite)||
    (process.env.NODE_ENV==='production'&&
     fonteSqlite!=='/dados-reais/catalogo-produtos.sqlite')||
    !Buffer.isBuffer(chaveBackup)||chaveBackup.length!==32||
    typeof buscar!=='function'||typeof agora!=='function'||typeof id!=='function'||
    !Number.isSafeInteger(maxBytes)||maxBytes<1024*1024||maxBytes>LIMITE)
  falha('BACKUP_MIDIA_CONFIGURACAO_INVALIDA');
 validarConfig(config);
 const data=agora(),uuid=id();
 if(!(data instanceof Date)||!Number.isFinite(data.getTime())||
    typeof uuid!=='string'||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuid))
  falha('BACKUP_MIDIA_IDENTIFICADOR_INVALIDO');
 const key='midia/'+data.toISOString().slice(0,10)+'/'+uuid+'.loopmidiabak';
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'loop-midia-real-'));
 fs.chmodSync(temp,0o700);
 const snapshot=path.join(temp,'snapshot.sqlite');
 const cifrado=path.join(temp,'copia.loopmidiabak');
 const baixado=path.join(temp,'baixado.loopmidiabak');
 const restaurado=path.join(temp,'restaurado.sqlite');
 let chave=null;
 try{
  if(!fs.existsSync(fonteSqlite)||fs.lstatSync(fonteSqlite).isSymbolicLink())
   falha('BACKUP_MIDIA_ORIGEM_INVALIDA');
  const live=new DatabaseSync(fonteSqlite,{readOnly:true});
  try{live.prepare('VACUUM INTO ?').run(snapshot);}
  finally{live.close();}
  fs.chmodSync(snapshot,0o600);
  const antes=validarAcervoMidia(snapshot);
  const salt=randomBytes(16),iv=randomBytes(12),header=Buffer.concat([
   MAGIC,salt,iv
  ]);
  chave=derivar(chaveBackup,salt);
  const cifra=createCipheriv('aes-256-gcm',chave,iv);
  cifra.setAAD(header);
  fs.writeFileSync(cifrado,header,{flag:'wx',mode:0o600});
  await pipeline(fs.createReadStream(snapshot),cifra,
   fs.createWriteStream(cifrado,{flags:'a',mode:0o600}));
  fs.appendFileSync(cifrado,cifra.getAuthTag());
  const tamanho=fs.statSync(cifrado).size;
  if(tamanho>maxBytes)falha('BACKUP_MIDIA_CAPACIDADE_EXCEDIDA');
  const put=assinarObjetoS3Real({config,key,method:'PUT',agora:data});
  const get=assinarObjetoS3Real({config,key,method:'GET',agora:data});
  let res;
  try{res=await buscar(put,{method:'PUT',redirect:'error',duplex:'half',
   headers:{'Content-Type':'application/octet-stream',
    'Content-Length':String(tamanho),'If-None-Match':'*'},
   body:fs.createReadStream(cifrado),signal:AbortSignal.timeout(120000)});
  }catch{falha('BACKUP_MIDIA_UPLOAD_INDETERMINADO');}
  if(!res||![200,201,204].includes(res.status))
   falha('BACKUP_MIDIA_UPLOAD_NAO_COMPROVADO');
  try{res=await buscar(get,{method:'GET',redirect:'error',
   signal:AbortSignal.timeout(120000)});}
  catch{falha('BACKUP_MIDIA_DOWNLOAD_FALHOU');}
  if(!res||res.status!==200||!res.body)
   falha('BACKUP_MIDIA_DOWNLOAD_FALHOU');
  const length=res.headers?.get?.('content-length');
  if(length!==null&&length!==undefined&&
     (!/^\d+$/.test(length)||Number(length)>maxBytes))
   falha('BACKUP_MIDIA_DOWNLOAD_EXCEDE_LIMITE');
  let recebidos=0;
  const limitar=new Transform({transform(chunk,_enc,cb){
   recebidos+=chunk.length;
   cb(recebidos>maxBytes?Error('BACKUP_MIDIA_EXCEDE_LIMITE'):null,chunk);
  }});
  try{await pipeline(Readable.fromWeb(res.body),limitar,
   fs.createWriteStream(baixado,{flags:'wx',mode:0o600}));}
  catch{falha('BACKUP_MIDIA_DOWNLOAD_INCOMPLETO');}
  if(recebidos!==tamanho||await hashArquivo(baixado)!==
     await hashArquivo(cifrado))
   falha('BACKUP_MIDIA_HASH_OFFSITE_DIVERGENTE');
  const total=fs.statSync(baixado).size;
  if(total<=HEADER+TAG)falha('BACKUP_MIDIA_ARQUIVO_INVALIDO');
  const f=fs.openSync(baixado,'r'),cab=Buffer.alloc(HEADER),tag=Buffer.alloc(TAG);
  try{
   if(fs.readSync(f,cab,0,HEADER,0)!==HEADER||
      fs.readSync(f,tag,0,TAG,total-TAG)!==TAG||
      !cab.subarray(0,MAGIC.length).equals(MAGIC))
    falha('BACKUP_MIDIA_CABECALHO_INVALIDO');
  }finally{fs.closeSync(f);}
  const dec=createDecipheriv('aes-256-gcm',
   derivar(chaveBackup,cab.subarray(MAGIC.length,MAGIC.length+16)),
   cab.subarray(MAGIC.length+16,HEADER));
  dec.setAAD(cab);dec.setAuthTag(tag);
  try{await pipeline(fs.createReadStream(baixado,{
   start:HEADER,end:total-TAG-1
  }),dec,fs.createWriteStream(restaurado,{flags:'wx',mode:0o600}));}
  catch{falha('BACKUP_MIDIA_DECIFRAGEM_INVALIDA');}
  const depois=validarAcervoMidia(restaurado);
  if(JSON.stringify(antes)!==JSON.stringify(depois))
   falha('BACKUP_MIDIA_RESTAURACAO_DIVERGENTE');
  return Object.freeze({
   estado:'BACKUP_MIDIA_REAL_CIFRADO_RESTAURADO',
   copiaExternaConfirmada:true,restauracaoIsoladaConfirmada:true,
   semAlteracaoBancoAtivo:true,backupFinanceiro:false,
   integridadeSQLite:'ok',...depois
  });
 }finally{
  if(chave)chave.fill(0);
  fs.rmSync(temp,{recursive:true,force:true});
 }
}
module.exports={validarAcervoMidia,provarBackupMidiaOffsite};
