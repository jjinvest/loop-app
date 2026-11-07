'use strict';
// Conteudo editorial de Novidades, isolado de vendas, brindes e posicoes.
// Usa o mesmo banco SQLite da vitrine e do administrador.
const MAX_IMAGEM=4*1024*1024;
const MAX_PIXELS=40000000;
const MAX_LADO=12000;
const CAMPOS=new Set(['titulo','texto','produtoId','ordem','estado']);
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function validarTexto(v,max){
 if(typeof v!=='string'||v.length>max||/[\u0000-\u001f\u007f]/.test(v))
  falha('NOVIDADE_DADOS_INVALIDOS');
 return v.trim();
}
function validar(v){
 if(!v||typeof v!=='object'||Array.isArray(v)||
    Object.keys(v).some(k=>!CAMPOS.has(k)))falha('NOVIDADE_DADOS_INVALIDOS');
 const titulo=validarTexto(v.titulo??'',100),texto=validarTexto(v.texto??'',1500);
 const produtoId=v.produtoId===null||v.produtoId===undefined||v.produtoId===''?null:v.produtoId;
 const ordem=v.ordem??0,estado=v.estado??'RASCUNHO';
 if(produtoId!==null&&(typeof produtoId!=='string'||!/^[a-z0-9-]{3,80}$/.test(produtoId))||
    !Number.isSafeInteger(ordem)||ordem<0||ordem>9999||
    !['RASCUNHO','PUBLICADA','ARQUIVADA'].includes(estado))
  falha('NOVIDADE_DADOS_INVALIDOS');
 return {titulo,texto,produtoId,ordem,estado};
}
function validarImagem(dados,mime){
 if(!Buffer.isBuffer(dados)||dados.length<12||dados.length>MAX_IMAGEM)
  falha('NOVIDADE_IMAGEM_INVALIDA');
 const png=mime==='image/png'&&dados.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'));
 const jpg=mime==='image/jpeg'&&dados.subarray(0,3).equals(Buffer.from('ffd8ff','hex'))&&
  dados.subarray(-2).equals(Buffer.from('ffd9','hex'));
 const webp=mime==='image/webp'&&dados.toString('ascii',0,4)==='RIFF'&&
  dados.toString('ascii',8,12)==='WEBP'&&dados.readUInt32LE(4)===dados.length-8;
 if(!png&&!jpg&&!webp)falha('NOVIDADE_IMAGEM_INVALIDA');
 if(!dimensoesImagem(dados,mime))falha('NOVIDADE_IMAGEM_DIMENSOES_INVALIDAS');
 return dados;
}
// Leitura de cabecalho, sem instalar pacote de processamento ou alterar original.
function dimensoesImagem(dados,mime){
 if(!Buffer.isBuffer(dados)||dados.length<24)return null;
 let largura=0,altura=0;
 if(mime==='image/png'&&dados.length>=24&&
    dados.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))&&
    dados.readUInt32BE(8)===13&&dados.toString('ascii',12,16)==='IHDR'){
  largura=dados.readUInt32BE(16);altura=dados.readUInt32BE(20);
 }else if(mime==='image/jpeg'&&dados.length>16&&
   dados[0]===0xff&&dados[1]===0xd8){
  let i=2;
  while(i+9<dados.length){
   if(dados[i]!==0xff){i++;continue;}
   while(i<dados.length&&dados[i]===0xff)i++;
   const marca=dados[i++];
   if(marca===0xd9||marca===0xda)break;
   if(marca===0x01||(marca>=0xd0&&marca<=0xd7))continue;
   if(i+2>dados.length)break;
   const tamanho=dados.readUInt16BE(i);
   if(tamanho<2||i+tamanho>dados.length)break;
   if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]
     .includes(marca)&&tamanho>=7){
    altura=dados.readUInt16BE(i+3);largura=dados.readUInt16BE(i+5);break;
   }
   i+=tamanho;
  }
 }else if(mime==='image/webp'&&dados.length>=30&&
   dados.toString('ascii',0,4)==='RIFF'&&
   dados.toString('ascii',8,12)==='WEBP'&&
   dados.readUInt32LE(4)===dados.length-8){
  const chunk=dados.toString('ascii',12,16);
  if(chunk==='VP8X'){
   largura=1+dados.readUIntLE(24,3);altura=1+dados.readUIntLE(27,3);
  }else if(chunk==='VP8L'&&dados[20]===0x2f){
   largura=1+dados[21]+((dados[22]&0x3f)<<8);
   altura=1+(dados[22]>>6)+(dados[23]<<2)+((dados[24]&0x0f)<<10);
  }else if(chunk==='VP8 '&&dados[23]===0x9d&&dados[24]===0x01&&dados[25]===0x2a){
   largura=dados.readUInt16LE(26)&0x3fff;
   altura=dados.readUInt16LE(28)&0x3fff;
  }
 }
 if(largura<1||altura<1||largura>MAX_LADO||altura>MAX_LADO||
    largura*altura>MAX_PIXELS)return null;
 return {larguraPx:largura,alturaPx:altura,
  qualidadeSugerida:Math.max(largura,altura)>=1080&&
    Math.min(largura,altura)>=675?'BOA_RESOLUCAO':'ABAIXO_DO_RECOMENDADO'};
}
class NovidadesLojaCandidatoSQLite{
 constructor({banco,agora=()=>Date.now()}={}){
  if(process.env.NODE_ENV==='production')falha('NOVIDADES_LAB_NAO_HOMOLOGADAS');
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function')
   falha('NOVIDADES_SQLITE_OBRIGATORIO');
  this.banco=banco;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_novidades_loja_lab(',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,',
   "titulo TEXT NOT NULL DEFAULT '',texto TEXT NOT NULL DEFAULT '',",
   'produto_id TEXT,ordem INTEGER NOT NULL DEFAULT 0,',
   "estado TEXT NOT NULL CHECK(estado IN ('RASCUNHO','PUBLICADA','ARQUIVADA')),",
   'mime TEXT,imagem BLOB,revisao INTEGER NOT NULL DEFAULT 1,',
   'criado_em INTEGER NOT NULL,atualizado_em INTEGER NOT NULL,',
   'CHECK((mime IS NULL AND imagem IS NULL) OR (mime IS NOT NULL AND imagem IS NOT NULL)));',
   'CREATE TABLE IF NOT EXISTS akitemm_novidades_loja_auditoria_lab(',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,novidade_id INTEGER NOT NULL,',
   'acao TEXT NOT NULL,revisao INTEGER NOT NULL,',
   'metadados_json TEXT NOT NULL,alterado_em INTEGER NOT NULL);',
   'CREATE TRIGGER IF NOT EXISTS akitemm_novidades_audit_no_update',
   'BEFORE UPDATE ON akitemm_novidades_loja_auditoria_lab',
   "BEGIN SELECT RAISE(ABORT,'historico imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS akitemm_novidades_audit_no_delete',
   'BEFORE DELETE ON akitemm_novidades_loja_auditoria_lab',
   "BEGIN SELECT RAISE(ABORT,'historico imutavel'); END;"
  ].join(' '));
 }
 _transacao(fn){
  this.banco.exec('BEGIN IMMEDIATE');
  try{const r=fn();this.banco.exec('COMMIT');return r;}
  catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 _linha(id){
  if(!Number.isSafeInteger(id)||id<1)falha('NOVIDADE_ID_INVALIDO');
  const r=this.banco.prepare('SELECT * FROM akitemm_novidades_loja_lab WHERE id=?').get(id);
  if(!r)falha('NOVIDADE_NAO_ENCONTRADA');
  return r;
 }
 _publico(r){
  const dimensoes=r.imagem?dimensoesImagem(Buffer.from(r.imagem),r.mime):null;
  return {id:r.id,titulo:r.titulo,texto:r.texto,produtoId:r.produto_id,
   ordem:r.ordem,estado:r.estado,temImagem:r.imagem!==null,
   larguraImagemPx:dimensoes?.larguraPx||null,
   alturaImagemPx:dimensoes?.alturaPx||null,
   qualidadeImagem:dimensoes?.qualidadeSugerida||
    (r.imagem?'NAO_VERIFICADA':'SEM_IMAGEM'),
   revisao:r.revisao,semBeneficioAutomatico:true};
 }
 _auditoria(r,acao){
  this.banco.prepare([
   'INSERT INTO akitemm_novidades_loja_auditoria_lab',
   '(novidade_id,acao,revisao,metadados_json,alterado_em) VALUES(?,?,?,?,?)'
  ].join(' ')).run(r.id,acao,r.revisao,JSON.stringify(this._publico(r)),this.agora());
 }
 criar(valor){
  const v=validar(valor);
  if(v.estado!=='RASCUNHO')falha('NOVIDADE_CRIACAO_EXIGE_RASCUNHO');
  return this._transacao(()=>{
   const agora=this.agora();
   const id=this.banco.prepare([
    'INSERT INTO akitemm_novidades_loja_lab',
    '(titulo,texto,produto_id,ordem,estado,criado_em,atualizado_em)',
    'VALUES(?,?,?,?,?,?,?)'
   ].join(' ')).run(v.titulo,v.texto,v.produtoId,v.ordem,v.estado,agora,agora).lastInsertRowid;
   const r=this._linha(Number(id));this._auditoria(r,'CRIAR');
   return this._publico(r);
  });
 }
 atualizar({id,revisaoEsperada,alteracoes}={}){
  if(!alteracoes||typeof alteracoes!=='object'||Array.isArray(alteracoes))
   falha('NOVIDADE_DADOS_INVALIDOS');
  return this._transacao(()=>{
   const original=this._linha(id);
   if(!Number.isSafeInteger(revisaoEsperada)||original.revisao!==revisaoEsperada)
    falha('NOVIDADE_CONFLITO_REVISAO');
   const v=validar({
    titulo:original.titulo,texto:original.texto,produtoId:original.produto_id,
    ordem:original.ordem,estado:original.estado,...alteracoes
   });
   if(v.estado==='PUBLICADA'&&!v.titulo&&!v.texto&&!original.imagem)
    falha('NOVIDADE_SEM_CONTEUDO');
   if(original.estado==='ARQUIVADA'&&v.estado!=='ARQUIVADA')
    falha('NOVIDADE_ARQUIVADA_IMUTAVEL');
   this.banco.prepare([
    'UPDATE akitemm_novidades_loja_lab SET',
    'titulo=?,texto=?,produto_id=?,ordem=?,estado=?,revisao=revisao+1,',
    'atualizado_em=? WHERE id=?'
   ].join(' ')).run(v.titulo,v.texto,v.produtoId,v.ordem,v.estado,this.agora(),id);
   const r=this._linha(id);this._auditoria(r,'ATUALIZAR');
   return this._publico(r);
  });
 }
 gravarImagem({id,revisaoEsperada,mime,dados}={}){
  validarImagem(dados,mime);
  return this._transacao(()=>{
   const anterior=this._linha(id);
   if(anterior.revisao!==revisaoEsperada)falha('NOVIDADE_CONFLITO_REVISAO');
   this.banco.prepare([
    'UPDATE akitemm_novidades_loja_lab SET',
    'imagem=?,mime=?,revisao=revisao+1,atualizado_em=? WHERE id=?'
   ].join(' ')).run(dados,mime,this.agora(),id);
   const r=this._linha(id);this._auditoria(r,'ALTERAR_IMAGEM');return this._publico(r);
  });
 }
 limparImagem({id,revisaoEsperada}={}){
  return this._transacao(()=>{
   const r=this._linha(id);
   if(r.revisao!==revisaoEsperada)falha('NOVIDADE_CONFLITO_REVISAO');
   if(r.estado==='PUBLICADA'&&!r.titulo&&!r.texto)
    falha('NOVIDADE_SEM_CONTEUDO');
   this.banco.prepare([
    'UPDATE akitemm_novidades_loja_lab SET imagem=NULL,mime=NULL,',
    'revisao=revisao+1,atualizado_em=? WHERE id=?'
   ].join(' ')).run(this.agora(),id);
   const novo=this._linha(id);this._auditoria(novo,'REMOVER_IMAGEM');return this._publico(novo);
  });
 }
 listar({publicadas=false}={}){
  const sql='SELECT * FROM akitemm_novidades_loja_lab '+
   (publicadas?"WHERE estado='PUBLICADA' ":'')+
   'ORDER BY ordem ASC,id DESC LIMIT 150';
  return this.banco.prepare(sql).all().map(r=>this._publico(r));
 }
 imagem({id,publicada=false}={}){
  const r=this._linha(id);
  if(publicada&&r.estado!=='PUBLICADA')falha('NOVIDADE_NAO_PUBLICADA');
  if(!r.imagem)falha('NOVIDADE_SEM_IMAGEM');
  return {mime:r.mime,bytes:Buffer.from(r.imagem)};
 }
}
module.exports={NovidadesLojaCandidatoSQLite,MAX_IMAGEM,dimensoesImagem};
