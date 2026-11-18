'use strict';
// Backup REAL do catálogo/fotos/PDFs, separado da identidade.
// Snapshot consistente do SQLite, AES-256-GCM e prova S3 PUT/GET/restore.
// Não move contas, não escreve em bancos ativos, não libera checkout.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {Readable,Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const {createHash,createCipheriv,createDecipheriv,hkdfSync,
 randomBytes,randomUUID}=require('node:crypto');
const {validarConfig,assinarObjetoS3Real}=
 require('./backup-identidade-offsite');
const MAGIC=Buffer.from('LOOPMIDIABKP1','ascii');
const HEADER=MAGIC.length+16+12,TAG=16;
const FOTOS=new Set(['image/jpeg','image/png','image/webp']);
const TABELAS=[
 'catalogo_produtos','akitemm_fotos_produto_versoes_lab',
 'akitemm_fotos_produto_atuais_lab','akitemm_curso_pdf_versoes_real',
 'akitemm_curso_pdf_atual_real'
];
function falha(c){const e=Error(c);e.codigo=c;throw e;}
const hash=x=>createHash('sha256').update(x).digest('hex');
function caminhoSeguro(caminho,ext,existente){
 if(typeof caminho!=='string'||!path.isAbsolute(caminho)||
    !caminho.endsWith(ext)||caminho.includes('\\0'))
  falha('BACKUP_MIDIA_CAMINHO_INVALIDO');
 const nome=path.resolve(caminho),pai=path.dirname(nome);
 if(!fs.existsSync(pai)||!fs.statSync(pai).isDirectory()||
    fs.lstatSync(pai).isSymbolicLink())
  falha('BACKUP_MIDIA_DIRETORIO_INSEGURO');
 if(existente){
  if(!fs.existsSync(nome)||!fs.lstatSync(nome).isFile()||
     fs.lstatSync(nome).isSymbolicLink())
   falha('BACKUP_MIDIA_ORIGEM_INSEGURA');
 }else if(fs.existsSync(nome))
  falha('BACKUP_MIDIA_DESTINO_EXISTENTE');
 return nome;
}
function validarAcervoMidia(arquivo){
 const nome=caminhoSeguro(arquivo,'.sqlite',true);
 const banco=new DatabaseSync(nome,{readOnly:true});
 try{
  const tabelas=new Set(banco.prepare(
   "SELECT name FROM sqlite_master WHERE type='table'"
  ).all().map(x=>x.name));
  if(TABELAS.some(t=>!tabelas.has(t)))falha('BACKUP_MIDIA_ESQUEMA_INCOMPLETO');
  if(banco.prepare('PRAGMA integrity_check').all().some(
   x=>x.integrity_check!=='ok')||
   banco.prepare('PRAGMA foreign_key_check').all().length)
   falha('BACKUP_MIDIA_SQLITE_INCONSISTENTE');
  const numero=t=>banco.prepare('SELECT COUNT(*) AS n FROM '+t).get().n;
  const totais={
   produtosMidia:numero('catalogo_produtos'),
   fotosHistoricas:numero('akitemm_fotos_produto_versoes_lab'),
   fotosAtuais:numero('akitemm_fotos_produto_atuais_lab'),
   pdfHistoricos:numero('akitemm_curso_pdf_versoes_real'),
   pdfAtuais:numero('akitemm_curso_pdf_atual_real')
  };
  if(totais.fotosAtuais>totais.fotosHistoricas||
     totais.pdfAtuais>totais.pdfHistoricos)
   falha('BACKUP_MIDIA_REFERENCIAS_INVALIDAS');
  for(const [versoes,atuais,chaves] of [
   ['akitemm_fotos_produto_versoes_lab','akitemm_fotos_produto_atuais_lab',
    ['produto_id','posicao','versao']],
   ['akitemm_curso_pdf_versoes_real','akitemm_curso_pdf_atual_real',
    ['produto_id','versao']]
  ]){
   const on=chaves.map(k=>'v.'+k+'=a.'+k).join(' AND ');
   const n=banco.prepare('SELECT COUNT(*) AS n FROM '+atuais+
    ' a LEFT JOIN '+versoes+' v ON '+on+
    ' WHERE v.produto_id IS NULL').get().n;
   if(n)falha('BACKUP_MIDIA_VERSAO_AUSENTE');
  }
  for(const tipo of ['fotos','pdf']){
   const tabela=tipo==='fotos'?'akitemm_fotos_produto_versoes_lab':
    'akitemm_curso_pdf_versoes_real';
   for(const x of banco.prepare(
    'SELECT conteudo,sha256,bytes'+
    (tipo==='fotos'?',mime,posicao':'')+' FROM '+tabela
   ).iterate()){
    if(!(x.conteudo instanceof Uint8Array)||x.conteudo.length!==x.bytes||
       (tipo==='fotos'&&(!FOTOS.has(x.mime)||
        !Number.isSafeInteger(x.posicao)||x.posicao<1||x.posicao>10))||
       hash(x.conteudo)!==x.sha256)
     falha('BACKUP_MIDIA_HASH_DIVERGENTE');
   }
  }
  return Object.freeze({...totais,integridadeSQLite:'ok'});
 }finally{banco.close();}
}
const chave=(k,salt)=>Buffer.from(hkdfSync('sha256',k,salt,
 Buffer.from('LOOP-MIDIA-REAL-BACKUP-V1'),32));
async function arquivoHash(nome){
 const h=createHash('sha256');
 for await(const b of fs.createReadStream(nome))h.update(b);
 return h.digest('hex');
}
async function criarBackupMidiaReal({origem,destino,chaveBackup}={}){
 if(!Buffer.isBuffer(chaveBackup)||chaveBackup.length!==32)
  falha('BACKUP_MIDIA_CHAVE_INVALIDA');
 const fonte=caminhoSeguro(origem,'.sqlite',true);
 const saida=caminhoSeguro(destino,'.loopmidiabak',false);
 if(process.env.NODE_ENV==='production'&&
   (fonte!=='/dados-reais/catalogo-produtos.sqlite'||
    saida.startsWith('/dados-reais/')))
  falha('BACKUP_MIDIA_VOLUME_INVALIDO');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'loop-midia-copia-'));
 fs.chmodSync(tmp,0o700);
 const snapshot=path.join(tmp,'snapshot.sqlite');
 let db=null,derivada=null,criado=false;
 try{
  const antes=validarAcervoMidia(fonte);
  db=new DatabaseSync(fonte,{readOnly:true});
  db.prepare('VACUUM INTO ?').run(snapshot);
  db.close();db=null;
  fs.chmodSync(snapshot,0o600);
  const depois=validarAcervoMidia(snapshot);
  if(Object.keys(antes).some(k=>antes[k]!==depois[k]))
   falha('BACKUP_MIDIA_SNAPSHOT_INCOERENTE');
  const salt=randomBytes(16),iv=randomBytes(12);
  const header=Buffer.concat([MAGIC,salt,iv]);
  derivada=chave(chaveBackup,salt);
  const cifra=createCipheriv('aes-256-gcm',derivada,iv);
  cifra.setAAD(header);
  fs.writeFileSync(saida,header,{flag:'wx',mode:0o600});
  criado=true;
  await pipeline(fs.createReadStream(snapshot),cifra,
   fs.createWriteStream(saida,{flags:'a',mode:0o600}));
  fs.appendFileSync(saida,cifra.getAuthTag());
  return {...depois,sha256Cifrado:await arquivoHash(saida),
   bytes:fs.statSync(saida).size};
 }catch(e){
  if(criado)fs.rmSync(saida,{force:true});
  if(e.codigo)throw e;
  falha('BACKUP_MIDIA_CRIACAO_FALHOU');
 }finally{
  if(db)db.close();
  if(derivada)derivada.fill(0);
  fs.rmSync(tmp,{recursive:true,force:true});
 }
}
async function restaurarBackupMidiaReal({origem,destino,chaveBackup}={}){
 if(!Buffer.isBuffer(chaveBackup)||chaveBackup.length!==32)
  falha('BACKUP_MIDIA_CHAVE_INVALIDA');
 const arquivo=caminhoSeguro(origem,'.loopmidiabak',true);
 const saida=caminhoSeguro(destino,'.sqlite',false);
 if(process.env.NODE_ENV==='production'&&saida.startsWith('/dados-reais/'))
  falha('BACKUP_MIDIA_RESTAURACAO_ATIVA_PROIBIDA');
 const tmp=fs.mkdtempSync(path.join(path.dirname(saida),'.midia-restore-'));
 fs.chmodSync(tmp,0o700);
 const rest=path.join(tmp,'restaurado.sqlite');
 let derivada=null;
 try{
  const tamanho=fs.statSync(arquivo).size;
  if(tamanho<=HEADER+TAG)falha('BACKUP_MIDIA_ARQUIVO_INVALIDO');
  const fd=fs.openSync(arquivo,'r'),header=Buffer.alloc(HEADER),tag=Buffer.alloc(TAG);
  try{
   if(fs.readSync(fd,header,0,HEADER,0)!==HEADER||
      fs.readSync(fd,tag,0,TAG,tamanho-TAG)!==TAG||
      !header.subarray(0,MAGIC.length).equals(MAGIC))
    falha('BACKUP_MIDIA_ARQUIVO_INVALIDO');
  }finally{fs.closeSync(fd);}
  derivada=chave(chaveBackup,header.subarray(MAGIC.length,MAGIC.length+16));
  const dec=createDecipheriv('aes-256-gcm',derivada,
   header.subarray(MAGIC.length+16));
  dec.setAAD(header);dec.setAuthTag(tag);
  await pipeline(fs.createReadStream(arquivo,{start:HEADER,end:tamanho-TAG-1}),
   dec,fs.createWriteStream(rest,{flags:'wx',mode:0o600}));
  const validado=validarAcervoMidia(rest);
  fs.linkSync(rest,saida);
  fs.chmodSync(saida,0o600);
  return {...validado,destinoAtivoPreservado:true};
 }catch(e){
  if(e.code==='EEXIST')falha('BACKUP_MIDIA_DESTINO_EXISTENTE');
  if(e.codigo)throw e;
  falha('BACKUP_MIDIA_RESTAURACAO_FALHOU');
 }finally{
  if(derivada)derivada.fill(0);
  fs.rmSync(tmp,{recursive:true,force:true});
 }
}
async function provarBackupMidiaOffsite({
 fonteSqlite,chaveBackup,config,buscar=fetch,agora=()=>new Date(),
 id=randomUUID,maxBytes=1024*1024*1024
}={}){
 if(typeof buscar!=='function'||typeof agora!=='function'||
    typeof id!=='function'||!Number.isSafeInteger(maxBytes)||
    maxBytes<1024*1024||maxBytes>1024*1024*1024)
  falha('OFFSITE_MIDIA_CONFIG_INVALIDA');
 validarConfig(config);
 const data=agora(),uuid=id();
 if(!(data instanceof Date)||!Number.isFinite(data.getTime())||
    typeof uuid!=='string'||!/^[0-9a-f-]{36}$/.test(uuid))
  falha('OFFSITE_MIDIA_IDENTIFICACAO_INVALIDA');
 const chaveObjeto='midia/'+data.toISOString().slice(0,10)+
  '/'+uuid+'.loopmidiabak';
 const put=assinarObjetoS3Real({config,key:chaveObjeto,method:'PUT',agora:data});
 const get=assinarObjetoS3Real({config,key:chaveObjeto,method:'GET',agora:data});
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'loop-midia-r2-'));
 fs.chmodSync(tmp,0o700);
 const copia=path.join(tmp,'acervo.loopmidiabak');
 const recebida=path.join(tmp,'baixada.loopmidiabak');
 const restaurada=path.join(tmp,'restaurada.sqlite');
 try{
  const local=await criarBackupMidiaReal({
   origem:fonteSqlite,destino:copia,chaveBackup
  });
  if(local.bytes>maxBytes)falha('OFFSITE_MIDIA_CAPACIDADE_EXCEDIDA');
  let resposta;
  try{
   resposta=await buscar(put,{method:'PUT',redirect:'error',duplex:'half',
    headers:{'Content-Type':'application/octet-stream',
     'Content-Length':String(local.bytes),'If-None-Match':'*'},
    body:fs.createReadStream(copia),signal:AbortSignal.timeout(120000)});
  }catch{falha('OFFSITE_MIDIA_UPLOAD_FALHOU');}
  if(!resposta||![200,201,204].includes(resposta.status))
   falha('OFFSITE_MIDIA_UPLOAD_NAO_COMPROVADO');
  try{
   resposta=await buscar(get,{method:'GET',redirect:'error',
    signal:AbortSignal.timeout(120000)});
  }catch{falha('OFFSITE_MIDIA_DOWNLOAD_FALHOU');}
  if(!resposta||resposta.status!==200||!resposta.body)
   falha('OFFSITE_MIDIA_DOWNLOAD_FALHOU');
  const informado=resposta.headers?.get?.('content-length');
  if(informado!=null&&(!/^\\d+$/.test(informado)||
    Number(informado)>maxBytes))
   falha('OFFSITE_MIDIA_DOWNLOAD_EXCESSIVO');
  let total=0;
  const limitar=new Transform({transform(b,_e,cb){
   total+=b.length;
   cb(total>maxBytes?Error('OFFSITE_MIDIA_DOWNLOAD_EXCESSIVO'):null,b);
  }});
  try{
   await pipeline(Readable.fromWeb(resposta.body),limitar,
    fs.createWriteStream(recebida,{flags:'wx',mode:0o600}));
  }catch{falha('OFFSITE_MIDIA_DOWNLOAD_INCOMPLETO');}
  if(total!==local.bytes||await arquivoHash(recebida)!==local.sha256Cifrado)
   falha('OFFSITE_MIDIA_HASH_DIVERGENTE');
  const prova=await restaurarBackupMidiaReal({
   origem:recebida,destino:restaurada,chaveBackup
  });
  const campos=['produtosMidia','fotosHistoricas','fotosAtuais',
   'pdfHistoricos','pdfAtuais','integridadeSQLite'];
  if(campos.some(x=>prova[x]!==local[x]))
   falha('OFFSITE_MIDIA_RESTAURACAO_DIVERGENTE');
  return {estado:'OFFSITE_MIDIA_CIFRADA_BAIXADA_RESTAURADA',
   copiaExternaConfirmada:true,restauracaoIsoladaConfirmada:true,
   dadosPreservados:true,semPIIEmRelatorio:true,backupFinanceiro:false,
   checkoutRealHabilitado:false,sha256Cifrado:local.sha256Cifrado,
   bytes:local.bytes,...Object.fromEntries(campos.map(x=>[x,prova[x]])),
   manifesto:{chaveObjeto,sha256Cifrado:local.sha256Cifrado}};
 }catch(e){
  if(e.codigo)throw e;
  falha('OFFSITE_MIDIA_INCONCLUSIVO');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
module.exports={validarAcervoMidia,criarBackupMidiaReal,
 restaurarBackupMidiaReal,provarBackupMidiaOffsite};
