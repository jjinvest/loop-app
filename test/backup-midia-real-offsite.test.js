'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes,createHash}=require('node:crypto');
const {assinarObjetoS3Real}=require('../src/producao/backup-identidade-offsite');
const {validarAcervoMidia,provarBackupMidiaOffsite}=
 require('../src/producao/backup-midia-real-offsite');
const cfg={endpoint:'https://r2.storageapi.dev',bucket:'catalogo-real-private',
 accessKeyId:'CHAVE_DE_ENSAIO',secretAccessKey:'CHAVE_SUPER_FORTE_SOMENTE_ENSAIO_2026',
 region:'auto'};
const data=new Date('2026-11-18T07:00:00Z');
const uuid='01234567-89ab-4cde-8fab-0123456789ab';
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'akitemm-midia-offsite-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const arquivo=path.join(dir,'catalogo-produtos.sqlite');
 const db=new DatabaseSync(arquivo);
 db.exec([
  'PRAGMA foreign_keys=ON;',
  'CREATE TABLE catalogo_produtos(id TEXT PRIMARY KEY);',
  'CREATE TABLE akitemm_fotos_produto_versoes_lab(',
  'produto_id TEXT,posicao INTEGER,versao INTEGER,',
  'sha256 TEXT,mime TEXT,bytes INTEGER,conteudo BLOB,',
  'PRIMARY KEY(produto_id,posicao,versao));',
  'CREATE TABLE akitemm_fotos_produto_atuais_lab(',
  'produto_id TEXT,posicao INTEGER,versao INTEGER,',
  'PRIMARY KEY(produto_id,posicao),',
  'FOREIGN KEY(produto_id,posicao,versao) REFERENCES',
  'akitemm_fotos_produto_versoes_lab(produto_id,posicao,versao));',
  'CREATE TABLE akitemm_curso_pdf_versoes_real(',
  'produto_id TEXT,versao INTEGER,sha256 TEXT,bytes INTEGER,',
  'conteudo BLOB,PRIMARY KEY(produto_id,versao));',
  'CREATE TABLE akitemm_curso_pdf_atual_real(',
  'produto_id TEXT PRIMARY KEY,versao INTEGER,',
  'FOREIGN KEY(produto_id,versao) REFERENCES',
  'akitemm_curso_pdf_versoes_real(produto_id,versao));',
  'CREATE TABLE admin_akitemm_banner_arquivos_v1(',
  'id TEXT PRIMARY KEY,mime TEXT,imagem BLOB);'
 ].join(' '));
 db.exec("INSERT INTO catalogo_produtos VALUES('tenis-preto');");
 const foto=Buffer.from('imagem-sem-dados-pessoais-conteudo-para-verificar-hash');
 const pdf=Buffer.from('%PDF-1.4\n'+'x'.repeat(60)+'\n%%EOF');
 const hash=b=>createHash('sha256').update(b).digest('hex');
 db.prepare('INSERT INTO akitemm_fotos_produto_versoes_lab VALUES(?,1,1,?,?,?,?)')
  .run('SKU_ANTIGO',hash(foto),'image/png',foto.length,foto);
 db.exec("INSERT INTO akitemm_fotos_produto_atuais_lab VALUES('SKU_ANTIGO',1,1);");
 db.prepare('INSERT INTO akitemm_curso_pdf_versoes_real VALUES(?,1,?,?,?)')
  .run('curso-livre',hash(pdf),pdf.length,pdf);
 db.exec("INSERT INTO akitemm_curso_pdf_atual_real VALUES('curso-livre',1);");
 db.prepare('INSERT INTO admin_akitemm_banner_arquivos_v1 VALUES(?,?,?)')
  .run('a'.repeat(32),'image/png',Buffer.alloc(50,11));
 t.after(()=>db.close());
 return {arquivo,db,chaveBackup:randomBytes(32)};
}
function op(f,fetcher){return {
 fonteSqlite:f.arquivo,chaveBackup:f.chaveBackup,config:cfg,
 buscar:fetcher,agora:()=>data,id:()=>uuid
};}
test('mídia tem chave exclusiva, nunca autoriza DELETE nem prefixo de laboratório',()=>{
 const key='midia/2026-11-18/'+uuid+'.loopmidiabak';
 const put=assinarObjetoS3Real({config:cfg,key,method:'PUT',agora:data});
 const get=assinarObjetoS3Real({config:cfg,key,method:'GET',agora:data});
 assert.notEqual(put,get);
 assert.equal(new URL(put).pathname,'/'+key);
 assert.throws(()=>assinarObjetoS3Real({config:cfg,key,
  method:'DELETE',agora:data}),{codigo:'OFFSITE_REAL_CHAVE_INVALIDA'});
 assert.throws(()=>assinarObjetoS3Real({config:cfg,
  key:'staging/2026-11-18/'+uuid+'.loopmidiabak',
  method:'PUT',agora:data}),{codigo:'OFFSITE_REAL_CHAVE_INVALIDA'});
});
test('PUT GET hash e restore comprovam catálogo, todas fotos, PDFs e banners',async t=>{
 const f=fixture(t);let remoto,puts=0,gets=0;
 const buscar=async(url,opt)=>{
  assert.match(new URL(url).pathname,/^\/midia\/2026-11-18\//);
  if(opt.method==='PUT'){
   puts++;
   assert.equal(opt.headers['If-None-Match'],'*');
   const chunks=[];for await(const chunk of opt.body)chunks.push(chunk);
   remoto=Buffer.concat(chunks);
   assert.equal(remoto.includes(Buffer.from('SQLite format 3')),false);
   assert.equal(remoto.includes(Buffer.from('SKU_ANTIGO')),false);
   assert.equal(Number(opt.headers['Content-Length']),remoto.length);
   return new Response(null,{status:200});
  }
  gets++;assert.equal(opt.method,'GET');
  return new Response(remoto,{status:200,
   headers:{'content-length':String(remoto.length)}});
 };
 const r=await provarBackupMidiaOffsite(op(f,buscar));
 assert.equal(puts,1);assert.equal(gets,1);
 assert.equal(r.estado,'BACKUP_MIDIA_REAL_CIFRADO_RESTAURADO');
 assert.equal(r.copiaExternaConfirmada,true);
 assert.equal(r.restauracaoIsoladaConfirmada,true);
 assert.equal(r.integridadeSQLite,'ok');
 assert.equal(r.fotosAtuais,1);assert.equal(r.versoesFotos,1);
 assert.equal(r.pdfsAtuais,1);assert.equal(r.versoesPdfs,1);
 assert.equal(r.banners,1);assert.equal(r.semAlteracaoBancoAtivo,true);
 assert.equal(f.db.prepare('PRAGMA quick_check').get().quick_check,'ok');
});
test('download adulterado não vira restore e banco original permanece intacto',async t=>{
 const f=fixture(t);let remoto=null;
 const buscar=async(_url,opt)=>{
  if(opt.method==='PUT'){
   const chunks=[];for await(const b of opt.body)chunks.push(b);
   remoto=Buffer.concat(chunks);
   return new Response(null,{status:200});
  }
  const alterado=Buffer.from(remoto);alterado[alterado.length-25]^=0xff;
  return new Response(alterado,{status:200});
 };
 await assert.rejects(provarBackupMidiaOffsite(op(f,buscar)),
  {codigo:'BACKUP_MIDIA_HASH_OFFSITE_DIVERGENTE'});
 assert.equal(validarAcervoMidia(f.arquivo).fotosAtuais,1);
});
test('upload não confirmado e mídia corrompida bloqueiam prova',async t=>{
 const f=fixture(t);
 await assert.rejects(provarBackupMidiaOffsite(op(f,async()=>new Response(
  null,{status:403}))),{codigo:'BACKUP_MIDIA_UPLOAD_NAO_COMPROVADO'});
 f.db.exec("UPDATE akitemm_fotos_produto_versoes_lab SET sha256='alterado';");
 await assert.rejects(provarBackupMidiaOffsite(op(f,async()=>{
  throw Error('nunca chamar se snapshot corrompido');
 })),{codigo:'BACKUP_MIDIA_FOTO_CORROMPIDA'});
});
