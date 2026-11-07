'use strict';
// Conteudo editorial de Novidades, isolado de vendas, brindes e posicoes.
// Usa o mesmo banco SQLite da vitrine e do administrador.
const MAX_IMAGEM=2*1024*1024;
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
 return dados;
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
  return {id:r.id,titulo:r.titulo,texto:r.texto,produtoId:r.produto_id,
   ordem:r.ordem,estado:r.estado,temImagem:r.imagem!==null,
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
module.exports={NovidadesLojaCandidatoSQLite,MAX_IMAGEM};
