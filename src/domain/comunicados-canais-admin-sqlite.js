'use strict';
// Comunicados editoriais persistentes, separados por origem. Não são ordens,
// pagamentos ou mensagens privadas e jamais abrem acesso de administrador.
const CANAIS=new Set(['AKITEMM','LOOP']);
const FORMATOS=new Set(['RECADO','BANNER']);
const ESTADOS=new Set(['RASCUNHO','PUBLICADO','ARQUIVADO']);
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function texto(v,max,{obrigatorio=true}={}){
 if(typeof v!=='string'||v.length>max||(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)))
  erro('COMUNICADO_DADOS_INVALIDOS');
 const t=v.trim();
 if(obrigatorio&&!t)erro('COMUNICADO_DADOS_INVALIDOS');
 return t;
}
class ComunicadosCanaisAdminSQLite{
 constructor({banco}={}){
  if(typeof banco?.exec!=='function'||typeof banco?.prepare!=='function')
   throw TypeError('COMUNICADOS_BANCO_OBRIGATORIO');
  this.banco=banco;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_comunicados_canais_lab(',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,',
   "canal TEXT NOT NULL CHECK(canal IN ('AKITEMM','LOOP')),",
   "formato TEXT NOT NULL CHECK(formato IN ('RECADO','BANNER')),",
   'titulo TEXT NOT NULL,corpo TEXT NOT NULL,',
   "estado TEXT NOT NULL CHECK(estado IN ('RASCUNHO','PUBLICADO','ARQUIVADO')),",
   'revisao INTEGER NOT NULL CHECK(revisao>0),',
   'criado_em TEXT NOT NULL,atualizado_em TEXT NOT NULL);',
   'CREATE INDEX IF NOT EXISTS idx_comunicados_canal_estado_lab',
   'ON akitemm_comunicados_canais_lab(canal,estado,id);',
   'CREATE TABLE IF NOT EXISTS akitemm_comunicados_auditoria_lab(',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,comunicado_id INTEGER NOT NULL,',
   'acao TEXT NOT NULL,revisao INTEGER NOT NULL,canal TEXT NOT NULL,',
   'registrado_em TEXT NOT NULL);'
  ].join(' '));
 }
 _validar(v){
  if(!v||typeof v!=='object'||Array.isArray(v)||
   Object.keys(v).sort().join('|')!=='canal|corpo|estado|formato|titulo')
   erro('COMUNICADO_DADOS_INVALIDOS');
  const canal=v.canal,formato=v.formato,estado=v.estado;
  if(!CANAIS.has(canal)||!FORMATOS.has(formato)||!ESTADOS.has(estado))
   erro('COMUNICADO_DADOS_INVALIDOS');
  return {canal,formato,estado,titulo:texto(v.titulo,120),
   corpo:texto(v.corpo,1500)};
 }
 _linha(row){
  return row?{id:row.id,canal:row.canal,formato:row.formato,
   titulo:row.titulo,corpo:row.corpo,estado:row.estado,
   revisao:row.revisao,criadoEm:row.criado_em,atualizadoEm:row.atualizado_em}:null;
 }
 listar({canal=null,publicados=false}={}){
  if(canal!==null&&!CANAIS.has(canal))erro('CANAL_INVALIDO');
  const filtros=[],args=[];
  if(canal){filtros.push('canal=?');args.push(canal);}
  if(publicados)filtros.push("estado='PUBLICADO'");
  const where=filtros.length?' WHERE '+filtros.join(' AND '):'';
  const rows=this.banco.prepare(
   'SELECT * FROM akitemm_comunicados_canais_lab'+where+
   ' ORDER BY id DESC LIMIT 100').all(...args);
  return rows.map(x=>this._linha(x));
 }
 criar(dados){
  const v=this._validar(dados);
  if(v.estado!=='RASCUNHO')erro('COMUNICADO_CRIACAO_EXIGE_RASCUNHO');
  const agora=new Date().toISOString();
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const r=this.banco.prepare([
    'INSERT INTO akitemm_comunicados_canais_lab',
    '(canal,formato,titulo,corpo,estado,revisao,criado_em,atualizado_em)',
    'VALUES(?,?,?,?,?,1,?,?)'
   ].join(' ')).run(v.canal,v.formato,v.titulo,v.corpo,v.estado,agora,agora);
   this.banco.prepare([
    'INSERT INTO akitemm_comunicados_auditoria_lab',
    '(comunicado_id,acao,revisao,canal,registrado_em) VALUES(?,?,?,?,?)'
   ].join(' ')).run(Number(r.lastInsertRowid),'CRIAR',1,v.canal,agora);
   this.banco.exec('COMMIT');
   return this.consultar(Number(r.lastInsertRowid));
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 consultar(id){
  if(!Number.isSafeInteger(id)||id<1)erro('COMUNICADO_ID_INVALIDO');
  const row=this.banco.prepare('SELECT * FROM akitemm_comunicados_canais_lab WHERE id=?').get(id);
  if(!row)erro('COMUNICADO_NAO_ENCONTRADO');
  return this._linha(row);
 }
 atualizar({id,revisaoEsperada,dados}={}){
  if(!Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<1)
   erro('COMUNICADO_REVISAO_INVALIDA');
  const v=this._validar(dados);
  const agora=new Date().toISOString();
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const atual=this.consultar(id);
   if(atual.revisao!==revisaoEsperada)erro('COMUNICADO_CONFLITO_REVISAO');
   // Nunca mudar o destino de um recado já criado: canais são segregados.
   if(v.canal!==atual.canal)erro('COMUNICADO_CANAL_IMUTAVEL');
   const revisao=atual.revisao+1;
   this.banco.prepare([
    'UPDATE akitemm_comunicados_canais_lab SET formato=?,titulo=?,corpo=?,estado=?,',
    'revisao=?,atualizado_em=? WHERE id=?'
   ].join(' ')).run(v.formato,v.titulo,v.corpo,v.estado,revisao,agora,id);
   this.banco.prepare([
    'INSERT INTO akitemm_comunicados_auditoria_lab',
    '(comunicado_id,acao,revisao,canal,registrado_em) VALUES(?,?,?,?,?)'
   ].join(' ')).run(id,'ATUALIZAR',revisao,v.canal,agora);
   this.banco.exec('COMMIT');
   return this.consultar(id);
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
}
module.exports={ComunicadosCanaisAdminSQLite};