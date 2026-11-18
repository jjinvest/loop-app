'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {randomBytes,createHash}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {criarCatalogoMercadoriasReal}=
 require('../src/producao/catalogo-mercadorias-real');
const {validarAcervoMidia,criarBackupMidiaReal,restaurarBackupMidiaReal,
 provarBackupMidiaOffsite}=require('../src/producao/backup-midia-offsite');
const FOTO=Buffer.from(
 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DAAMIM/4EAAB/uBfsL2WiLAAAAAElFTkSuQmCC',
 'base64');
const CONFIG={endpoint:'https://s3.example.invalid/',bucket:'acervo-real-privado',
 accessKeyId:'CHAVE_SOMENTE_TESTE',secretAccessKey:'SEGREDO_APENAS_DE_TESTE_EXTERNO',
 region:'auto'};
const ID='fedcba98-7654-4321-8abc-abcdef123456';
function fixture(t){
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'akitemm-midia-offsite-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const origem=path.join(pasta,'catalogo-produtos.sqlite');
 const cat=criarCatalogoMercadoriasReal({
  arquivo:origem,tokenRaiz:'a'.repeat(64),
  buscarProdutoCompartilhado:id=>id==='SKU_ANTIGO'?
   {produtoId:id,ativo:true,tipo:'FISICO'}:null
 });
 return {pasta,origem,cat,chave:randomBytes(32)};
}
const sha=buf=>createHash('sha256').update(buf).digest('hex');
test('backup cifrado e restore local preservam histórico de fotos antigas e não modificam a origem',async t=>{
 const f=fixture(t);
 const item={id:'camiseta-azul',nome:'Camiseta Azul',tipo:'FISICO',
  estado:'RASCUNHO',descricao:'Produto com imagem persistida',
  precoCentavos:25000,entrega:'ESTOQUE_PROPRIO',fotos:[],
  detalhes:[],videoApresentacaoUrl:null};
 f.cat.repo.salvar({produto:item,revisaoEsperada:0});
 assert.equal((await f.cat.fotos.salvar({produtoId:'SKU_ANTIGO',posicao:2,
  bytes:FOTO,mime:'image/png',revisaoEsperada:0})).versao,1);
 assert.equal((await f.cat.fotos.salvar({produtoId:'camiseta-azul',posicao:1,
  bytes:FOTO,mime:'image/png',revisaoEsperada:0})).versao,1);
 f.cat.fechar();
 const antes=sha(fs.readFileSync(f.origem));
 const aud=validarAcervoMidia(f.origem);
 assert.equal(aud.produtosMidia,1);
 assert.equal(aud.fotosAtuais,2);
 const backup=path.join(f.pasta,'protegido.loopmidiabak');
 const gerado=await criarBackupMidiaReal({origem:f.origem,destino:backup,
  chaveBackup:f.chave});
 assert.equal(gerado.fotosHistoricas,2);
 assert.ok(gerado.bytes>120);
 assert.notEqual(sha(fs.readFileSync(backup)),antes);
 assert.equal(fs.readFileSync(backup).includes(FOTO),false);
 assert.equal(fs.statSync(backup).mode&0o777,0o600);
 const restaurado=path.join(f.pasta,'recuperado.sqlite');
 const prova=await restaurarBackupMidiaReal({
  origem:backup,destino:restaurado,chaveBackup:f.chave
 });
 assert.equal(prova.fotosAtuais,2);
 assert.equal(prova.destinoAtivoPreservado,true);
 assert.equal(sha(fs.readFileSync(f.origem)),antes);
 assert.equal((await assert.rejects(restaurarBackupMidiaReal({
  origem:backup,destino:restaurado,chaveBackup:f.chave
 }),/BACKUP_MIDIA_DESTINO_EXISTENTE/))??true,true);
 const b=new DatabaseSync(restaurado,{readOnly:true});
 try{
  assert.equal(b.prepare('SELECT COUNT(*) AS n FROM akitemm_fotos_produto_atuais_lab')
   .get().n,2);
  assert.equal(b.prepare('SELECT COUNT(*) AS n FROM catalogo_produtos')
   .get().n,1);
 }finally{b.close();}
});
test('backup ativo conserva banners do acervo e recusa banner inválido',async t=>{
 const f=fixture(t),db=f.cat.repo.banco;
 db.exec([
  'CREATE TABLE admin_akitemm_banner_arquivos_v1(',
  'id TEXT PRIMARY KEY,mime TEXT NOT NULL,imagem BLOB NOT NULL);'
 ].join(' '));
 db.prepare('INSERT INTO admin_akitemm_banner_arquivos_v1(id,mime,imagem) VALUES(?,?,?)')
  .run('banner-principal','image/png',Buffer.alloc(100,17));
 f.cat.fechar();
 const antes=validarAcervoMidia(f.origem);
 assert.equal(antes.bannersAtuais,1);
 const copia=path.join(f.pasta,'banner.loopmidiabak');
 await criarBackupMidiaReal({
  origem:f.origem,destino:copia,chaveBackup:f.chave
 });
 const recuperado=path.join(f.pasta,'banners-recuperados.sqlite');
 const prova=await restaurarBackupMidiaReal({
  origem:copia,destino:recuperado,chaveBackup:f.chave
 });
 assert.equal(prova.bannersAtuais,1);
 const b=new DatabaseSync(recuperado,{readOnly:true});
 try{
  assert.equal(b.prepare('SELECT length(imagem) AS bytes FROM admin_akitemm_banner_arquivos_v1').get().bytes,100);
 }finally{b.close();}
 const aberto=new DatabaseSync(f.origem);
 try{
  aberto.exec("UPDATE admin_akitemm_banner_arquivos_v1 SET imagem=X'01'");
 }finally{aberto.close();}
 assert.throws(()=>validarAcervoMidia(f.origem),/BACKUP_MIDIA_BANNER_INVALIDO/);
});

test('restauração com chave errada ou arquivo alterado nunca promove dados',async t=>{
 const f=fixture(t);f.cat.fechar();
 const bk=path.join(f.pasta,'origem.loopmidiabak');
 await criarBackupMidiaReal({origem:f.origem,destino:bk,chaveBackup:f.chave});
 const destino=path.join(f.pasta,'nunca.sqlite');
 await assert.rejects(restaurarBackupMidiaReal({
  origem:bk,destino,chaveBackup:randomBytes(32)
 }),/BACKUP_MIDIA_RESTAURACAO_FALHOU/);
 assert.equal(fs.existsSync(destino),false);
 const dados=fs.readFileSync(bk);dados[60]^=1;
 const alterado=path.join(f.pasta,'alterado.loopmidiabak');
 fs.writeFileSync(alterado,dados);
 await assert.rejects(restaurarBackupMidiaReal({
  origem:alterado,destino,chaveBackup:f.chave
 }),/BACKUP_MIDIA_RESTAURACAO_FALHOU/);
 assert.equal(fs.existsSync(destino),false);
});
test('prova offsite completa requer PUT GET hash e restauração íntegros',async t=>{
 const f=fixture(t);f.cat.fechar();
 const objetos=new Map();
 const buscar=async(url,options)=>{
  const key=new URL(url).pathname;
  if(options.method==='PUT'){
   assert.equal(options.headers['If-None-Match'],'*');
   const partes=[];
   for await(const bloco of options.body)partes.push(bloco);
   objetos.set(key,Buffer.concat(partes));
   return new Response(null,{status:201});
  }
  if(options.method==='GET'){
   const bytes=objetos.get(key);
   assert.ok(bytes);
   return new Response(bytes,{status:200,headers:{
    'Content-Length':String(bytes.length)}});
  }
  throw Error('MÉTODO_INESPERADO');
 };
 const x=await provarBackupMidiaOffsite({
  fonteSqlite:f.origem,chaveBackup:f.chave,config:CONFIG,buscar,
  agora:()=>new Date('2026-11-18T11:00:00.000Z'),id:()=>ID
 });
 assert.equal(x.estado,'OFFSITE_MIDIA_CIFRADA_BAIXADA_RESTAURADA');
 assert.equal(x.copiaExternaConfirmada,true);
 assert.equal(x.restauracaoIsoladaConfirmada,true);
 assert.equal(x.integridadeSQLite,'ok');
 assert.equal(x.checkoutRealHabilitado,false);
 assert.equal(x.manifesto.chaveObjeto,
  'midia/2026-11-18/'+ID+'.loopmidiabak');
 assert.equal(objetos.size,1);
});
test('sem GET confiável não declarar backup da mídia comprovado',async t=>{
 const f=fixture(t);f.cat.fechar();
 const buscar=async(_url,options)=>options.method==='PUT'?
  new Response(null,{status:201}):
  new Response('sem cópia',{status:404});
 await assert.rejects(provarBackupMidiaOffsite({
  fonteSqlite:f.origem,chaveBackup:f.chave,config:CONFIG,buscar,
  agora:()=>new Date('2026-11-18T11:00:00.000Z'),id:()=>ID
 }),/OFFSITE_MIDIA_DOWNLOAD_FALHOU/);
});
test('hash de imagem histórico adulterado bloqueia backup mesmo com SQLite íntegro',t=>{
 const f=fixture(t);
 f.cat.fechar();
 const banco=new DatabaseSync(f.origem);
 try{
  banco.exec('DROP TRIGGER fotos_produto_versoes_no_update_lab');
  banco.prepare('INSERT INTO akitemm_fotos_produto_versoes_lab '+
   '(produto_id,posicao,versao,sha256,mime,bytes,conteudo,criado_em) '+
   'VALUES(?,?,?,?,?,?,?,?)').run(
   'SKU_ANTIGO',1,1,'hash-invalidado','image/png',FOTO.length,FOTO,
   new Date().toISOString());
 }finally{banco.close();}
 assert.throws(()=>validarAcervoMidia(f.origem),
  /BACKUP_MIDIA_HASH_DIVERGENTE/);
});
