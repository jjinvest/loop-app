'use strict';
// Video MP4 de apresentacao de ate 30 segundos, no MESMO SQLite do catalogo.
// Publicacao/leitura dependem do produto publicado; nunca acesso a arquivo
// pelo caminho fornecido pelo usuario. Retem versoes imutaveis para auditoria.
const {createHash}=require('node:crypto');
const LIMITE_VIDEO=20*1024*1024,MAX_DURACAO=30;
const ID=/^[a-z0-9-]{3,80}$/;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function* caixas(b,comeco=0,fim=b.length){
 let at=comeco;
 while(at+8<=fim){
  let tamanho=b.readUInt32BE(at),cabecalho=8;
  const tipo=b.toString('latin1',at+4,at+8);
  if(tamanho===1){
   if(at+16>fim)falha('VIDEO_MP4_INVALIDO');
   const grande=b.readBigUInt64BE(at+8);
   if(grande>BigInt(Number.MAX_SAFE_INTEGER))falha('VIDEO_MP4_INVALIDO');
   tamanho=Number(grande);cabecalho=16;
  }else if(tamanho===0)tamanho=fim-at;
  if(tamanho<cabecalho||at+tamanho>fim)falha('VIDEO_MP4_INVALIDO');
  yield {tipo,ini:at+cabecalho,fim:at+tamanho};
  at+=tamanho;
 }
 if(at!==fim)falha('VIDEO_MP4_INVALIDO');
}
function duracaoMp4(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<128||bytes.length>LIMITE_VIDEO)
  falha('VIDEO_TAMANHO_INVALIDO');
 const raiz=[...caixas(bytes)];
 if(raiz[0]?.tipo!=='ftyp'||!raiz.some(x=>x.tipo==='mdat'))
  falha('VIDEO_MP4_INVALIDO');
 const moov=raiz.find(x=>x.tipo==='moov');
 if(!moov)falha('VIDEO_MP4_INVALIDO');
 const filhos=[...caixas(bytes,moov.ini,moov.fim)];
 const mvhd=filhos.find(x=>x.tipo==='mvhd');
 if(!mvhd)falha('VIDEO_DURACAO_NAO_COMPROVADA');
 const versao=bytes[mvhd.ini];
 let escala,duracao;
 if(versao===0){
  if(mvhd.ini+20>mvhd.fim)falha('VIDEO_DURACAO_NAO_COMPROVADA');
  escala=BigInt(bytes.readUInt32BE(mvhd.ini+12));
  duracao=BigInt(bytes.readUInt32BE(mvhd.ini+16));
 }else if(versao===1){
  if(mvhd.ini+32>mvhd.fim)falha('VIDEO_DURACAO_NAO_COMPROVADA');
  escala=BigInt(bytes.readUInt32BE(mvhd.ini+20));
  duracao=bytes.readBigUInt64BE(mvhd.ini+24);
 }else falha('VIDEO_DURACAO_NAO_COMPROVADA');
 if(escala===0n||duracao===0n||duracao===0xffffffffffffffffn||
    duracao===0xffffffffn)
  falha('VIDEO_DURACAO_NAO_COMPROVADA');
 if(duracao>30n*escala)falha('VIDEO_ACIMA_30_SEGUNDOS');
 // Recusar arquivos so de audio: validar trilha de video declarada no MP4.
 let trilhaVideo=false;
 for(const trak of filhos.filter(x=>x.tipo==='trak')){
  const mdia=[...caixas(bytes,trak.ini,trak.fim)].find(x=>x.tipo==='mdia');
  if(!mdia)continue;
  for(const h of caixas(bytes,mdia.ini,mdia.fim)){
   if(h.tipo==='hdlr'&&h.ini+12<=h.fim&&
      bytes.toString('latin1',h.ini+8,h.ini+12)==='vide')
    trilhaVideo=true;
  }
 }
 if(!trilhaVideo)falha('VIDEO_SEM_TRILHA_VISUAL');
 return Number(duracao*1000n/escala);
}
class VideoProdutoCandidatoSQLite{
 constructor({banco,catalogo}={}){
  if(typeof banco?.exec!=='function'||typeof catalogo?.buscar!=='function')
   throw new TypeError('SQLite/catalogo obrigatorios');
  this.banco=banco;this.catalogo=catalogo;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_video_produto_versoes_lab(',
   'produto_id TEXT NOT NULL,versao INTEGER NOT NULL CHECK(versao>0),',
   'sha256 TEXT NOT NULL,bytes INTEGER NOT NULL CHECK(bytes<=20971520),',
   'duracao_ms INTEGER NOT NULL CHECK(duracao_ms>0 AND duracao_ms<=30000),',
   'conteudo BLOB NOT NULL,criado_em TEXT NOT NULL,',
   'PRIMARY KEY(produto_id,versao));',
   'CREATE TABLE IF NOT EXISTS akitemm_video_produto_atual_lab(',
   'produto_id TEXT PRIMARY KEY,versao INTEGER NOT NULL,',
   'FOREIGN KEY(produto_id,versao) REFERENCES akitemm_video_produto_versoes_lab(produto_id,versao));',
   'CREATE TRIGGER IF NOT EXISTS video_versoes_imutaveis_update_lab',
   'BEFORE UPDATE ON akitemm_video_produto_versoes_lab',
   "BEGIN SELECT RAISE(ABORT,'video historico imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS video_versoes_imutaveis_delete_lab',
   'BEFORE DELETE ON akitemm_video_produto_versoes_lab',
   "BEGIN SELECT RAISE(ABORT,'video historico imutavel'); END;"
  ].join(' '));
 }
 _validar(id){if(typeof id!=='string'||!ID.test(id))falha('VIDEO_PRODUTO_INVALIDO');}
 estado(id){
  this._validar(id);
  const x=this.banco.prepare([
   'SELECT a.versao,v.sha256,v.bytes,v.duracao_ms AS duracaoMs,',
   'v.criado_em AS criadoEm FROM akitemm_video_produto_atual_lab a',
   'JOIN akitemm_video_produto_versoes_lab v',
   'ON v.produto_id=a.produto_id AND v.versao=a.versao',
   'WHERE a.produto_id=?'
  ].join(' ')).get(id);
  return {produtoId:id,arquivoAnexado:!!x,versao:x?.versao??0,
   bytes:x?.bytes??0,duracaoMs:x?.duracaoMs??0,
   sha256:x?.sha256??null,criadoEm:x?.criadoEm??null,
   somenteLaboratorio:true};
 }
 async salvar({produtoId,bytes,revisaoEsperada}={}){
  this._validar(produtoId);
  if(!Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<0)
   falha('VIDEO_REVISAO_INVALIDA');
  const duracaoMs=duracaoMp4(bytes);
  const p=await this.catalogo.buscar(produtoId);
  if(!p)falha('VIDEO_PRODUTO_NAO_ENCONTRADO');
  const sha=createHash('sha256').update(bytes).digest('hex');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const atual=this.estado(produtoId);
   if(atual.versao!==revisaoEsperada)falha('VIDEO_CONFLITO_REVISAO');
   if(atual.sha256===sha){
    this.banco.exec('COMMIT');return {...atual,repetido:true};
   }
   const versao=atual.versao+1;
   this.banco.prepare([
    'INSERT INTO akitemm_video_produto_versoes_lab',
    '(produto_id,versao,sha256,bytes,duracao_ms,conteudo,criado_em)',
    'VALUES(?,?,?,?,?,?,?)'
   ].join(' ')).run(produtoId,versao,sha,bytes.length,duracaoMs,bytes,new Date().toISOString());
   this.banco.prepare([
    'INSERT INTO akitemm_video_produto_atual_lab(produto_id,versao)',
    'VALUES(?,?) ON CONFLICT(produto_id) DO UPDATE SET versao=excluded.versao'
   ].join(' ')).run(produtoId,versao);
   this.banco.exec('COMMIT');return {...this.estado(produtoId),repetido:false};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 abrir(id){
  this._validar(id);
  const a=this.estado(id);
  if(!a.arquivoAnexado)falha('VIDEO_NAO_ENCONTRADO');
  const row=this.banco.prepare([
   'SELECT v.conteudo,v.sha256 FROM akitemm_video_produto_versoes_lab v',
   'WHERE v.produto_id=? AND v.versao=?'
  ].join(' ')).get(id,a.versao);
  const conteudo=Buffer.from(row.conteudo);
  if(conteudo.length!==a.bytes||
     createHash('sha256').update(conteudo).digest('hex')!==row.sha256)
   falha('VIDEO_INTEGRIDADE_INVALIDA');
  return {conteudo,versao:a.versao,duracaoMs:a.duracaoMs};
 }
}
module.exports={VideoProdutoCandidatoSQLite,duracaoMp4,LIMITE_VIDEO,MAX_DURACAO};