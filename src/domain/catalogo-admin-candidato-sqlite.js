'use strict';
// Catálogo editável de HOMOLOGAÇÃO. Compartilha o mesmo SQLite do checkout e
// preserva fotografias dos pedidos. Não altera a loja comercial.
const {createHash}=require('node:crypto');
const {validarProduto,TIPOS_ENTREGA}=require('./catalogo');
const ID=/^[a-z0-9-]{3,80}$/;
const KEY=/^[a-zA-Z0-9-]{12,80}$/;
const CAMPOS=new Set(['id','nome','tipo','estado','descricao','precoCentavos','entrega','fotos','videoApresentacaoUrl','detalhes']);
const EDITAVEIS=new Set(['nome','descricao','precoCentavos','estado']);
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function forma(x,permitidos){
 if(!x||typeof x!=='object'||Array.isArray(x)||
    Object.keys(x).some(k=>!permitidos.has(k)))erro('CAMPOS_PRODUTO_INVALIDOS');
}
function seguro(p){
 try{return validarProduto(p);}
 catch(_e){erro('PRODUTO_INVALIDO');}
}
function copia(x){
 return {...x,fotos:[...x.fotos],detalhes:[...x.detalhes]};
}
class CatalogoAdminCandidatoSQLite{
 constructor({banco,repositorioBase}={}){
  if(process.env.NODE_ENV==='production')erro('CATALOGO_ADMIN_NAO_HOMOLOGADO');
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     typeof repositorioBase?.buscar!=='function'||
     typeof repositorioBase?.listar!=='function')
   erro('CATALOGO_FONTE_OBRIGATORIA');
  this.db=banco;this.base=repositorioBase;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_catalogo_admin_candidato(',
   'id TEXT PRIMARY KEY,produto_json TEXT NOT NULL,',
   'revisao INTEGER NOT NULL CHECK(revisao>=1),',
   'chave_criacao TEXT UNIQUE,hash_criacao TEXT,',
   'atualizado_em INTEGER NOT NULL);',
   'CREATE TABLE IF NOT EXISTS akitemm_catalogo_admin_historico(',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,produto_id TEXT NOT NULL',
   'REFERENCES akitemm_catalogo_admin_candidato(id),',
   'revisao INTEGER NOT NULL,acao TEXT NOT NULL,',
   'antes_json TEXT, depois_json TEXT NOT NULL,criado_em INTEGER NOT NULL,',
   'UNIQUE(produto_id,revisao));',
   'CREATE TRIGGER IF NOT EXISTS catalogo_admin_hist_nao_atualizar',
   'BEFORE UPDATE ON akitemm_catalogo_admin_historico',
   "BEGIN SELECT RAISE(ABORT,'historico imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS catalogo_admin_hist_nao_apagar',
   'BEFORE DELETE ON akitemm_catalogo_admin_historico',
   "BEGIN SELECT RAISE(ABORT,'historico imutavel'); END;"
  ].join(' '));
 }
 transacao(fn){
  this.db.exec('BEGIN IMMEDIATE');
  try{const resultado=fn();this.db.exec('COMMIT');return resultado;}
  catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 registroLocal(id){
  return this.db.prepare('SELECT * FROM akitemm_catalogo_admin_candidato WHERE id=?').get(id);
 }
 produtoLocal(row){
  if(!row)return null;
  try{return seguro(JSON.parse(row.produto_json));}
  catch{erro('CATALOGO_PERSISTIDO_INTEGRO_OBRIGATORIO');}
 }
 async buscar(id){
  if(typeof id!=='string'||!ID.test(id))return null;
  const row=this.registroLocal(id);
  if(row)return copia(this.produtoLocal(row));
  const produto=await this.base.buscar(id);
  return produto?copia(seguro(produto)):null;
 }
 async buscarRegistro(id){
  if(typeof id!=='string'||!ID.test(id))erro('ID_PRODUTO_INVALIDO');
  const row=this.registroLocal(id);
  if(row)return {produto:copia(this.produtoLocal(row)),revisao:row.revisao,
   atualizadoEm:row.atualizado_em,origem:'SQLITE_HOMOLOGACAO'};
  const produto=await this.base.buscar(id);
  return produto?{produto:copia(seguro(produto)),revisao:0,
   atualizadoEm:null,origem:'CATALOGO_BASE'}:null;
 }
 async listar(){
  const origem=await this.base.listar();
  if(!Array.isArray(origem))erro('CATALOGO_FONTE_INDISPONIVEL');
  const mapa=new Map();
  for(const p of origem){
   const validado=seguro(p);
   if(mapa.has(validado.id))erro('PRODUTO_BASE_DUPLICADO');
   mapa.set(validado.id,copia(validado));
  }
  for(const row of this.db.prepare('SELECT * FROM akitemm_catalogo_admin_candidato').all())
   mapa.set(row.id,copia(this.produtoLocal(row)));
  return [...mapa.values()].sort((a,b)=>a.id.localeCompare(b.id));
 }
 async listarRegistros({pagina=0,limite=25}={}){
  if(!Number.isSafeInteger(pagina)||pagina<0||pagina>10000||
     !Number.isSafeInteger(limite)||limite<1||limite>50)
   erro('PAGINACAO_INVALIDA');
  const produtos=await this.listar();
  const recorte=produtos.slice(pagina*limite,(pagina+1)*limite);
  const registros=await Promise.all(recorte.map(p=>this.buscarRegistro(p.id)));
  return {registros,total:produtos.length,pagina,limite,
   haMais:(pagina+1)*limite<produtos.length,
   laboratorio:true,compraReal:false};
 }
 async publicos(){
  const produtos=await this.listar();
  return {produtos:produtos.filter(p=>p.estado==='PUBLICADO').map(p=>({
   id:p.id,nome:p.nome,tipo:p.tipo,precoCentavos:p.precoCentavos,
   descricao:p.descricao,quantidadeMaxima:50
  })),laboratorio:true,compraReal:false};
 }
 async criar({produto,chaveIdempotencia}={}){
  forma(produto,CAMPOS);
  if(typeof chaveIdempotencia!=='string'||!KEY.test(chaveIdempotencia))
   erro('IDEMPOTENCIA_OBRIGATORIA');
  const validado=seguro(produto);
  const hash=createHash('sha256').update(JSON.stringify(validado)).digest('hex');
  // A fonte base é somente leitura. Nunca substituir produto preexistente por
  // cadastro novo, mesmo quando o produto já recebeu cotação.
  const base=await this.base.buscar(validado.id);
  return this.transacao(()=>{
   const repeticao=this.db.prepare(
    'SELECT id,hash_criacao AS hash FROM akitemm_catalogo_admin_candidato WHERE chave_criacao=?'
   ).get(chaveIdempotencia);
   if(repeticao){
    if(repeticao.hash!==hash||repeticao.id!==validado.id)
     erro('CONFLITO_IDEMPOTENCIA');
    return {...this.registroLocalPublico(repeticao.id),repetida:true};
   }
   if(base||this.registroLocal(validado.id))erro('PRODUTO_JA_EXISTE');
   const now=Date.now();
   this.db.prepare([
    'INSERT INTO akitemm_catalogo_admin_candidato',
    '(id,produto_json,revisao,chave_criacao,hash_criacao,atualizado_em)',
    'VALUES(?,?,1,?,?,?)'
   ].join(' ')).run(validado.id,JSON.stringify(validado),
    chaveIdempotencia,hash,now);
   this.db.prepare([
    'INSERT INTO akitemm_catalogo_admin_historico',
    '(produto_id,revisao,acao,antes_json,depois_json,criado_em)',
    "VALUES(?,1,'CRIADO',NULL,?,?)"
   ].join(' ')).run(validado.id,JSON.stringify(validado),now);
   return {...this.registroLocalPublico(validado.id),repetida:false};
  });
 }
 registroLocalPublico(id){
  const row=this.registroLocal(id);
  return {produto:copia(this.produtoLocal(row)),revisao:row.revisao,
   atualizadoEm:row.atualizado_em,origem:'SQLITE_HOMOLOGACAO'};
 }
 async alterar({id,revisaoEsperada,alteracoes}={}){
  if(typeof id!=='string'||!ID.test(id))erro('ID_PRODUTO_INVALIDO');
  if(!Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<0)
   erro('REVISAO_INVALIDA');
  forma(alteracoes,EDITAVEIS);
  if(Object.keys(alteracoes).length===0)erro('ALTERACOES_OBRIGATORIAS');
  const base=await this.base.buscar(id);
  return this.transacao(()=>{
   const row=this.registroLocal(id);
   if(!row&&!base)erro('PRODUTO_NAO_ENCONTRADO');
   const revisao=row?.revisao||0;
   if(revisao!==revisaoEsperada)erro('CONFLITO_REVISAO');
   const anterior=row?this.produtoLocal(row):seguro(base);
   const depois=seguro({...anterior,...alteracoes,id});
   const now=Date.now(),proxima=revisao+1;
   if(row){
    this.db.prepare([
     'UPDATE akitemm_catalogo_admin_candidato',
     'SET produto_json=?,revisao=?,atualizado_em=? WHERE id=?'
    ].join(' ')).run(JSON.stringify(depois),proxima,now,id);
   }else{
    this.db.prepare([
     'INSERT INTO akitemm_catalogo_admin_candidato',
     '(id,produto_json,revisao,chave_criacao,hash_criacao,atualizado_em)',
     'VALUES(?,?,1,NULL,NULL,?)'
    ].join(' ')).run(id,JSON.stringify(depois),now);
   }
   this.db.prepare([
    'INSERT INTO akitemm_catalogo_admin_historico',
    '(produto_id,revisao,acao,antes_json,depois_json,criado_em)',
    "VALUES(?,?,'ATUALIZADO',?,?,?)"
   ].join(' ')).run(id,proxima,JSON.stringify(anterior),JSON.stringify(depois),now);
   return this.registroLocalPublico(id);
  });
 }
 historico(id){
  if(typeof id!=='string'||!ID.test(id))erro('ID_PRODUTO_INVALIDO');
  const row=this.registroLocal(id);
  if(!row)return [];
  return this.db.prepare([
   'SELECT revisao,acao,antes_json AS antesJson,',
   'depois_json AS depoisJson,criado_em AS criadoEm',
   'FROM akitemm_catalogo_admin_historico WHERE produto_id=?',
   'ORDER BY revisao DESC LIMIT 100'
  ].join(' ')).all(id).map(x=>({
   revisao:x.revisao,acao:x.acao,criadoEm:x.criadoEm,
   antes:x.antesJson?JSON.parse(x.antesJson):null,
   depois:JSON.parse(x.depoisJson)
  }));
 }
 contarPersistidos(){
  return this.db.prepare('SELECT COUNT(*) AS n FROM akitemm_catalogo_admin_candidato').get().n;
 }
}
module.exports={CatalogoAdminCandidatoSQLite};
