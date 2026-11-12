'use strict';
// Avaliacoes e anexos do cliente no mesmo SQLite da conta, pedidos e PSP.
// O formulario aprovado da loja continua unico. Somente comprador de item
// fisico com GET PSP conferido E entrega marcada pelo Admin pode avaliar.
// Nenhuma entrega de LAB constitui comprovacao logistica real.
const {validar}=require('./akitemm-midia-avaliacoes-demo');
const PRODUTO=/^[a-z0-9-]{3,80}$/;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
class AvaliacoesCompraCandidatoSQLite{
 constructor({banco,prePedidos,consultarPedido}={}){
  if(typeof banco?.exec!=='function'||typeof banco?.prepare!=='function'||
     typeof prePedidos?.consultar!=='function'||
     typeof consultarPedido!=='function')
   throw new TypeError('Mesmo SQLite de pedidos e PSP obrigatorio');
  this.banco=banco;this.prePedidos=prePedidos;this.consultarPedido=consultarPedido;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_aval_entregas_candidato_lab(',
   'prepedido_id TEXT PRIMARY KEY REFERENCES akitemm_checkout_prepedidos_staging(prepedido_id),',
   'titular_id TEXT NOT NULL,confirmada_em TEXT NOT NULL);',
   'CREATE TABLE IF NOT EXISTS akitemm_avaliacoes_candidato_lab(',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,',
   'prepedido_id TEXT NOT NULL REFERENCES akitemm_checkout_prepedidos_staging(prepedido_id),',
   'titular_id TEXT NOT NULL,produto_id TEXT NOT NULL,',
   'nota INTEGER NOT NULL CHECK(nota BETWEEN 1 AND 5),',
   'comentario TEXT NOT NULL CHECK(length(comentario) BETWEEN 10 AND 1000),',
   "status TEXT NOT NULL CHECK(status IN ('PENDENTE','APROVADA','REJEITADA')),",
   'criada_em TEXT NOT NULL,moderada_em TEXT,',
   'UNIQUE(prepedido_id,produto_id));',
   'CREATE INDEX IF NOT EXISTS idx_aval_candidato_produto_lab',
   'ON akitemm_avaliacoes_candidato_lab(produto_id,status);',
   'CREATE TABLE IF NOT EXISTS akitemm_aval_midias_candidato_lab(',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,',
   'avaliacao_id INTEGER NOT NULL REFERENCES akitemm_avaliacoes_candidato_lab(id),',
   "tipo TEXT NOT NULL CHECK(tipo IN ('FOTO','VIDEO')),",
   'ordem INTEGER NOT NULL CHECK(ordem BETWEEN 1 AND 3),',
   'mime TEXT NOT NULL,conteudo BLOB NOT NULL,',
   'bytes INTEGER NOT NULL,duracao_segundos REAL,',
   'criada_em TEXT NOT NULL,',
   'UNIQUE(avaliacao_id,tipo,ordem));',
   'CREATE TRIGGER IF NOT EXISTS aval_entrega_candidato_no_update_lab',
   'BEFORE UPDATE ON akitemm_aval_entregas_candidato_lab',
   "BEGIN SELECT RAISE(ABORT,'entrega laboratorio imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS aval_entrega_candidato_no_delete_lab',
   'BEFORE DELETE ON akitemm_aval_entregas_candidato_lab',
   "BEGIN SELECT RAISE(ABORT,'entrega laboratorio imutavel'); END;"
  ].join(' '));
 }
 _pedido(prepedidoId,titularId=null){
  if(typeof prepedidoId!=='string'||!/^hom-[0-9a-f-]{36}$/.test(prepedidoId))
   falha('PEDIDO_NAO_ENCONTRADO');
  const r=this.banco.prepare([
   'SELECT titular_id AS titularId,fotografia_json AS snapshot',
   'FROM akitemm_checkout_prepedidos_staging WHERE prepedido_id=?'
  ].join(' ')).get(prepedidoId);
  if(!r||(titularId!==null&&r.titularId!==titularId))
   falha('PEDIDO_NAO_ENCONTRADO');
  let itens;
  try{itens=JSON.parse(r.snapshot);}catch{falha('PEDIDO_INTEGRO_OBRIGATORIO');}
  if(!Array.isArray(itens))falha('PEDIDO_INTEGRO_OBRIGATORIO');
  return {titularId:r.titularId,itens};
 }
 _psp(prepedidoId,titularId){
  const r=this.consultarPedido({banco:this.banco,prepedidoId,titularId});
  if(!r?.conferenciaPSPConcluida||r.exigeRevisaoManual)
   falha('PAGAMENTO_NAO_CONFERIDO');
 }
 entregarEnsaio(prepedidoId){
  const p=this._pedido(prepedidoId);
  if(!p.itens.some(x=>x.tipo==='FISICO'))
   falha('PEDIDO_SEM_PRODUTO_FISICO');
  this._psp(prepedidoId,p.titularId);
  const r=this.banco.prepare([
   'INSERT OR IGNORE INTO akitemm_aval_entregas_candidato_lab',
   '(prepedido_id,titular_id,confirmada_em) VALUES(?,?,?)'
  ].join(' ')).run(prepedidoId,p.titularId,new Date().toISOString());
  return {prepedidoId,entregaFicticia:true,repetido:r.changes===0,
   nenhumaEntregaRealComprovada:true};
 }
 _elegiveis(titularId){
  const entregas=this.banco.prepare([
   'SELECT prepedido_id AS id FROM akitemm_aval_entregas_candidato_lab',
   'WHERE titular_id=? ORDER BY confirmada_em DESC LIMIT 150'
  ].join(' ')).all(titularId);
  const saida=[];
  for(const e of entregas){
   const p=this._pedido(e.id,titularId);
   try{this._psp(e.id,titularId);}catch{continue;}
   for(const item of p.itens){
    if(item.tipo!=='FISICO')continue;
    const a=this.banco.prepare([
     'SELECT id,status FROM akitemm_avaliacoes_candidato_lab',
     'WHERE prepedido_id=? AND produto_id=?'
    ].join(' ')).get(e.id,item.produtoId);
    saida.push({pedidoId:e.id,produtoId:item.produtoId,nome:item.nome,
     statusAvaliacao:a?.status??null,midias:a?this.listarMidias(a.id):[]});
   }
  }
  return saida;
 }
 itensAvaliaveis(titularId){return {itens:this._elegiveis(titularId),laboratorio:true};}
 criar({titularId,pedidoId,produtoId,nota,comentario}={}){
  if(typeof titularId!=='string'||typeof pedidoId!=='string'||
     typeof produtoId!=='string'||!PRODUTO.test(produtoId)||
     !Number.isInteger(nota)||nota<1||nota>5||
     typeof comentario!=='string'||comentario.trim().length<10||
     comentario.length>1000||/[\u0000-\u0008\u000b-\u001f]/.test(comentario))
   falha('AVALIACAO_INVALIDA');
  const p=this._pedido(pedidoId,titularId);
  if(!p.itens.some(x=>x.produtoId===produtoId&&x.tipo==='FISICO'))
   falha('PRODUTO_NAO_COMPRADO');
  const entrega=this.banco.prepare([
   'SELECT 1 FROM akitemm_aval_entregas_candidato_lab',
   'WHERE prepedido_id=? AND titular_id=?'
  ].join(' ')).get(pedidoId,titularId);
  if(!entrega)falha('AVALIACAO_SEM_ENTREGA_CONFIRMADA');
  this._psp(pedidoId,titularId);
  try{
   this.banco.prepare([
    'INSERT INTO akitemm_avaliacoes_candidato_lab',
    '(prepedido_id,titular_id,produto_id,nota,comentario,status,criada_em)',
    "VALUES(?,?,?,?,?,'PENDENTE',?)"
   ].join(' ')).run(pedidoId,titularId,produtoId,nota,
    comentario.trim(),new Date().toISOString());
  }catch(e){if(e.code?.includes('SQLITE_CONSTRAINT'))falha('AVALIACAO_JA_REGISTRADA');throw e;}
  return {pedidoId,produtoId,status:'PENDENTE',aguardandoModeracao:true,
   semEntregaReal:true};
 }
 _registro(titularId,pedidoId,produtoId){
  const r=this.banco.prepare([
   'SELECT id,status FROM akitemm_avaliacoes_candidato_lab',
   'WHERE titular_id=? AND prepedido_id=? AND produto_id=?'
  ].join(' ')).get(titularId,pedidoId,produtoId);
  if(!r)falha('AVALIACAO_NAO_ENCONTRADA');
  if(r.status!=='PENDENTE')falha('AVALIACAO_JA_MODERADA');
  this._pedido(pedidoId,titularId);
  this._psp(pedidoId,titularId);
  return r;
 }
 anexar({titularId,pedidoId,produtoId,tipo,mime,bytes}={}){
  if(!['FOTO','VIDEO'].includes(tipo))falha('TIPO_MIDIA_NAO_PERMITIDO');
  const limpos=validar({tipo,mime,dados:bytes});
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const a=this._registro(titularId,pedidoId,produtoId);
   const existentes=this.banco.prepare([
    'SELECT COUNT(*) AS n FROM akitemm_aval_midias_candidato_lab',
    'WHERE avaliacao_id=? AND tipo=?'
   ].join(' ')).get(a.id,tipo).n;
   if(existentes>=(tipo==='FOTO'?3:1))falha('LIMITE_MIDIAS_ATINGIDO');
   const r=this.banco.prepare([
    'INSERT INTO akitemm_aval_midias_candidato_lab',
    '(avaliacao_id,tipo,ordem,mime,conteudo,bytes,duracao_segundos,criada_em)',
    'VALUES(?,?,?,?,?,?,?,?)'
   ].join(' ')).run(a.id,tipo,existentes+1,limpos.mime,limpos.dados,
    limpos.dados.length,limpos.duracaoSegundos,new Date().toISOString());
   this.banco.exec('COMMIT');
   return {id:Number(r.lastInsertRowid),tipo,ordem:existentes+1,pendente:true};
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 listarMidias(avaliacaoId){
  return this.banco.prepare([
   'SELECT id,tipo,ordem,mime,bytes,duracao_segundos AS duracaoSegundos',
   'FROM akitemm_aval_midias_candidato_lab',
   'WHERE avaliacao_id=? ORDER BY tipo,ordem'
  ].join(' ')).all(avaliacaoId).map(m=>({...m,
   url:'/staging/vitrine/loja/avaliacoes/midias/'+m.id}));
 }
 abrirMidia({id,titularId=null,admin=false}={}){
  if(!Number.isSafeInteger(id)||id<1)falha('MIDIA_NAO_ENCONTRADA');
  const r=this.banco.prepare([
   'SELECT m.mime,m.conteudo,a.status,a.titular_id AS titularId',
   'FROM akitemm_aval_midias_candidato_lab m JOIN akitemm_avaliacoes_candidato_lab a',
   'ON a.id=m.avaliacao_id WHERE m.id=?'
  ].join(' ')).get(id);
  if(!r||(!admin&&r.status!=='APROVADA'&&r.titularId!==titularId))
   falha('MIDIA_NAO_ENCONTRADA');
  return {mime:r.mime,bytes:Buffer.from(r.conteudo)};
 }
 publicadas(produtoId){
  if(typeof produtoId!=='string'||!PRODUTO.test(produtoId))falha('PRODUTO_INVALIDO');
  const reviews=this.banco.prepare([
   'SELECT id,nota,comentario,criada_em AS criadaEm',
   'FROM akitemm_avaliacoes_candidato_lab',
   "WHERE produto_id=? AND status='APROVADA' ORDER BY id DESC LIMIT 50"
  ].join(' ')).all(produtoId);
  return {avaliacoes:reviews.map(({id,...r})=>({...r,
   midias:this.listarMidias(id)})),laboratorio:true};
 }
 pendentesAdmin(){
  const reviews=this.banco.prepare([
   'SELECT id,prepedido_id AS pedidoId,produto_id AS produtoId',
   ',nota,comentario,criada_em AS criadaEm',
   'FROM akitemm_avaliacoes_candidato_lab',
   "WHERE status='PENDENTE' ORDER BY id DESC LIMIT 100"
  ].join(' ')).all();
  return {pendentes:reviews.map(x=>({...x,midias:this.listarMidias(x.id)})),
   laboratorio:true};
 }
 moderar({id,status}={}){
  if(!Number.isSafeInteger(id)||id<1||
     !['APROVADA','REJEITADA'].includes(status))
   falha('MODERACAO_INVALIDA');
  const r=this.banco.prepare([
   'UPDATE akitemm_avaliacoes_candidato_lab',
   'SET status=?,moderada_em=?',
   "WHERE id=? AND status='PENDENTE'"
  ].join(' ')).run(status,new Date().toISOString(),id);
  if(!r.changes)falha('AVALIACAO_NAO_PENDENTE');
  return {id,status,moderada:true};
 }
}
module.exports={AvaliacoesCompraCandidatoSQLite};