'use strict';
// Controle operacional exclusivamente de laboratório. Não cria benefício, dinheiro ou posição.
const {randomUUID,createHash}=require('node:crypto');
const dept=new Set(['CLIENTES','PEDIDOS','PRODUTOS','ENTREGAS','INDICACOES','POSICOES','FILAS','TABULEIRO','COFRES','SAQUES','SEGURANCA','OUTROS']);
const prioridade=new Set(['NORMAL','ALTA','CRITICA']);
const situacao=new Set(['ABERTA','EM_ANDAMENTO','CONCLUIDA','CANCELADA']);
function fail(code){const e=new Error(code);e.codigo=code;throw e;}
function fields(x,allowed){if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!allowed.includes(k)))fail('CAMPOS_INVALIDOS');}
function str(x,min,max){if(typeof x!=='string'||x.trim().length<min||x.trim().length>max||/[\u0000-\u001f]/.test(x))fail('TEXTO_INVALIDO');return x.trim();}
class MissoesOperacionaisCandidatoSQLite{
 constructor({banco}={}){
  if(process.env.NODE_ENV==='production')fail('ADMIN_NAO_HOMOLOGADO');
  if(typeof banco?.prepare!=='function')fail('BANCO_OBRIGATORIO');
  this.db=banco;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_admin_missoes_staging(',
   'id TEXT PRIMARY KEY,chave TEXT UNIQUE NOT NULL,entrada_hash TEXT NOT NULL,',
   'departamento TEXT NOT NULL,prioridade TEXT NOT NULL,titulo TEXT NOT NULL,',
   'descricao TEXT NOT NULL,prepedido_id TEXT,mensagem_cliente TEXT,',
   'situacao TEXT NOT NULL,revisao INTEGER NOT NULL CHECK(revisao>0),',
   'nota TEXT,criado_em INTEGER NOT NULL,atualizado_em INTEGER NOT NULL);',
   'CREATE INDEX IF NOT EXISTS idx_admin_missoes_pedido ON',
   'akitemm_admin_missoes_staging(prepedido_id);',
   'CREATE TABLE IF NOT EXISTS akitemm_admin_missoes_historico(',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,missao_id TEXT NOT NULL',
   'REFERENCES akitemm_admin_missoes_staging(id),',
   'revisao INTEGER NOT NULL,acao TEXT NOT NULL,nota TEXT NOT NULL,',
   'criado_em INTEGER NOT NULL,UNIQUE(missao_id,revisao));'
  ].join(' '));
 }
 transaction(fn){
  this.db.exec('BEGIN IMMEDIATE');
  try{const val=fn();this.db.exec('COMMIT');return val;}
  catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 get(id){
  return this.db.prepare([
   'SELECT id,departamento,prioridade,titulo,descricao,',
   'prepedido_id AS prepedidoId,mensagem_cliente AS mensagemCliente,',
   'situacao,revisao,nota,criado_em AS criadoEm,atualizado_em AS atualizadoEm',
   'FROM akitemm_admin_missoes_staging WHERE id=?'
  ].join(' ')).get(id);
 }
 criar(x,key){
  fields(x,['departamento','prioridade','titulo','descricao','prepedidoId','mensagemCliente']);
  if(typeof key!=='string'||!/^[a-zA-Z0-9-]{12,80}$/.test(key))fail('IDEMPOTENCIA_OBRIGATORIA');
  if(!dept.has(x.departamento)||!prioridade.has(x.prioridade))fail('CLASSIFICACAO_INVALIDA');
  const d={departamento:x.departamento,prioridade:x.prioridade,
   titulo:str(x.titulo,5,100),descricao:str(x.descricao,10,1200),
   prepedidoId:x.prepedidoId||null,
   mensagemCliente:x.mensagemCliente?str(x.mensagemCliente,8,320):null};
  if(d.mensagemCliente&&!d.prepedidoId)fail('COMUNICADO_EXIGE_PEDIDO');
  const hash=createHash('sha256').update(JSON.stringify(d)).digest('hex');
  return this.transaction(()=>{
   const old=this.db.prepare('SELECT id,entrada_hash AS hash FROM akitemm_admin_missoes_staging WHERE chave=?').get(key);
   if(old){if(old.hash!==hash)fail('CONFLITO_IDEMPOTENCIA');return {...this.get(old.id),repetida:true};}
   if(d.prepedidoId){
    if(!/^hom-[a-f0-9-]{36}$/.test(d.prepedidoId))fail('PEDIDO_INVALIDO');
    if(!this.db.prepare('SELECT 1 FROM akitemm_checkout_prepedidos_staging WHERE prepedido_id=?').get(d.prepedidoId))fail('PEDIDO_INEXISTENTE');
   }
   const id='missao-'+randomUUID(),now=Date.now();
   this.db.prepare([
    'INSERT INTO akitemm_admin_missoes_staging',
    '(id,chave,entrada_hash,departamento,prioridade,titulo,descricao,',
    'prepedido_id,mensagem_cliente,situacao,revisao,nota,criado_em,atualizado_em)',
    "VALUES(?,?,?,?,?,?,?,?,?,'ABERTA',1,NULL,?,?)"
   ].join(' ')).run(id,key,hash,d.departamento,d.prioridade,d.titulo,d.descricao,
    d.prepedidoId,d.mensagemCliente,now,now);
   this.db.prepare('INSERT INTO akitemm_admin_missoes_historico(missao_id,revisao,acao,nota,criado_em) VALUES(?,1,?,?,?)')
    .run(id,'CRIADA','Missão registrada',now);
   return {...this.get(id),repetida:false};
  });
 }
 atualizar(id,x){
  if(!/^missao-[a-f0-9-]{36}$/.test(id))fail('MISSAO_INVALIDA');
  fields(x,['revisaoEsperada','situacao','nota','mensagemCliente']);
  if(!Number.isSafeInteger(x.revisaoEsperada)||x.revisaoEsperada<1||!situacao.has(x.situacao))fail('ESTADO_INVALIDO');
  const nota=str(x.nota,8,400);
  return this.transaction(()=>{
   const old=this.get(id);
   if(!old)fail('MISSAO_INEXISTENTE');
   if(old.revisao!==x.revisaoEsperada)fail('CONFLITO_REVISAO');
   const validas={ABERTA:['EM_ANDAMENTO','CANCELADA'],EM_ANDAMENTO:['CONCLUIDA','CANCELADA'],CONCLUIDA:[],CANCELADA:[]};
   if(!validas[old.situacao].includes(x.situacao))fail('TRANSICAO_PROIBIDA');
   const mensagem=Object.hasOwn(x,'mensagemCliente')?
    (x.mensagemCliente?str(x.mensagemCliente,8,320):null):old.mensagemCliente;
   if(mensagem&&!old.prepedidoId)fail('COMUNICADO_EXIGE_PEDIDO');
   const now=Date.now(),rev=old.revisao+1;
   this.db.prepare([
    'UPDATE akitemm_admin_missoes_staging SET situacao=?,nota=?,',
    'mensagem_cliente=?,revisao=?,atualizado_em=? WHERE id=?'
   ].join(' ')).run(x.situacao,nota,mensagem,rev,now,id);
   this.db.prepare('INSERT INTO akitemm_admin_missoes_historico(missao_id,revisao,acao,nota,criado_em) VALUES(?,?,?,?,?)')
    .run(id,rev,x.situacao,nota,now);
   return this.get(id);
  });
 }
 listar(){
  const ids=this.db.prepare('SELECT id FROM akitemm_admin_missoes_staging ORDER BY atualizado_em DESC,id DESC LIMIT 50').all();
  const total=this.db.prepare('SELECT COUNT(*) AS n FROM akitemm_admin_missoes_staging').get().n;
  return {missoes:ids.map(x=>this.get(x.id)),total,paginacaoNecessaria:total>50,laboratorio:true,financeiroReal:false};
 }
 historico(id){
  if(!/^missao-[a-f0-9-]{36}$/.test(id))fail('MISSAO_INVALIDA');
  if(!this.get(id))fail('MISSAO_INEXISTENTE');
  return this.db.prepare('SELECT revisao,acao,nota,criado_em AS criadoEm FROM akitemm_admin_missoes_historico WHERE missao_id=? ORDER BY revisao DESC LIMIT 100').all(id);
 }
 comunicados(titularId){
  if(!/^titular-[a-f0-9-]{36}$/.test(titularId))fail('TITULAR_INVALIDO');
  return this.db.prepare([
   'SELECT m.prepedido_id AS prepedidoId,m.mensagem_cliente AS mensagem,',
   'm.atualizado_em AS atualizadoEm FROM akitemm_admin_missoes_staging m',
   'JOIN akitemm_checkout_prepedidos_staging p ON p.prepedido_id=m.prepedido_id',
   'WHERE p.titular_id=? AND m.mensagem_cliente IS NOT NULL',
   "AND m.situacao!='CANCELADA' ORDER BY m.atualizado_em DESC LIMIT 50"
  ].join(' ')).all(titularId);
 }
}
module.exports={MissoesOperacionaisCandidatoSQLite};
