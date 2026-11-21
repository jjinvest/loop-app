'use strict';
// Arquivo histórico relacional, APPEND-ONLY, dos centros já concluídos.
// Espelho sem autoridade: o snapshot validado do motor continua soberano.
// Nenhuma compra, crédito, pagamento, posição ou giro é criado aqui.
const {createHash}=require('node:crypto');
const TABELAS_HISTORICO=Object.freeze([
 'loop_real_ciclos_historico_meta',
 'loop_real_ciclos_historico',
 'loop_real_ciclos_historico_eventos'
]);
const ZERO='0'.repeat(64),SHA=/^[0-9a-f]{64}$/;
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
function assinatura(prev,json){
 return createHash('sha256').update('LOOP_CICLOS_HISTORICO_V1\0')
  .update(prev).update('\0').update(json).digest('hex');
}
function ciclos(sim){
 const cs=sim?.tabuleiro?.ciclosConcluidos;
 if(!Array.isArray(cs))falha('HISTORICO_CICLOS_FONTE_INVALIDA');
 return cs;
}
function dados(c,i){
 if(!c||c.ciclo!==i+1||!Number.isSafeInteger(c.centro?.id)||
    c.centro.id<=0||typeof c.centro?.participanteId!=='string'||
    ![5,6].includes(c.vendas?.length))
  falha('HISTORICO_CICLOS_CONTEUDO_INVALIDO');
 for(let j=0;j<c.vendas.length;j++){
  const v=c.vendas[j];
  if(!v||v.ciclo!==c.ciclo||v.ordem!==j+1||
     v.posicaoCentroId!==c.centro.id||
     typeof v.vendaId!=='string'||!v.vendaId)
   falha('HISTORICO_CICLOS_EVENTOS_INVALIDOS');
 }
 return JSON.stringify(c);
}
function presenca(banco){
 const tem=TABELAS_HISTORICO.filter(t=>banco.prepare(
  "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
 ).get(t));
 if(tem.length&&tem.length!==TABELAS_HISTORICO.length)
  falha('HISTORICO_CICLOS_ESQUEMA_PARCIAL');
 return tem.length===TABELAS_HISTORICO.length;
}
function doBanco(banco){
 const row=banco.prepare(
  'SELECT snapshot FROM loop_real_motor_estado WHERE id=1'
 ).get();
 const s=row?.snapshot?JSON.parse(row.snapshot):null;
 return {tabuleiro:{ciclosConcluidos:s?.tabuleiro?.ciclosConcluidos||[]}};
}
class HistoricoCiclosRelacionalSQLite{
 constructor({banco}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function')
   falha('HISTORICO_CICLOS_BANCO_INVALIDO');
  this.db=banco;
  presenca(banco); // Se apenas uma parte existe, falhar sem "reparar".
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_real_ciclos_historico_meta(',
   'id INTEGER PRIMARY KEY CHECK(id=1),',
   'versao INTEGER NOT NULL CHECK(versao=1),',
   'total_ciclos INTEGER NOT NULL CHECK(total_ciclos>=0),',
   'ultimo_hash TEXT NOT NULL);',
   'CREATE TABLE IF NOT EXISTS loop_real_ciclos_historico(',
   'ciclo INTEGER PRIMARY KEY CHECK(ciclo>0),',
   'centro_posicao_id INTEGER NOT NULL CHECK(centro_posicao_id>0),',
   'centro_titular_id TEXT NOT NULL,',
   'quantidade_eventos INTEGER NOT NULL CHECK(quantidade_eventos IN (5,6)),',
   'dados_json TEXT NOT NULL,',
   'hash_anterior TEXT NOT NULL,sha256 TEXT NOT NULL);',
   'CREATE INDEX IF NOT EXISTS idx_loop_ciclos_por_centro',
   'ON loop_real_ciclos_historico(centro_titular_id,ciclo);',
   'CREATE TABLE IF NOT EXISTS loop_real_ciclos_historico_eventos(',
   'ciclo INTEGER NOT NULL REFERENCES loop_real_ciclos_historico(ciclo)',
   'ON DELETE RESTRICT,',
   'ordem INTEGER NOT NULL CHECK(ordem BETWEEN 1 AND 6),',
   'venda_id TEXT NOT NULL UNIQUE,',
   'destino_previsto TEXT NOT NULL,',
   'PRIMARY KEY(ciclo,ordem));',
   'CREATE INDEX IF NOT EXISTS idx_loop_ciclos_eventos_ordem',
   'ON loop_real_ciclos_historico_eventos(ciclo,ordem);',
   // O histórico preserva eventos e ciclos: não podem ser alterados
   // nem removidos depois do commit, nem mesmo por outra rota.
   'CREATE TRIGGER IF NOT EXISTS loop_ciclos_imutavel_update',
   'BEFORE UPDATE ON loop_real_ciclos_historico',
   "BEGIN SELECT RAISE(ABORT,'ciclo imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS loop_ciclos_imutavel_delete',
   'BEFORE DELETE ON loop_real_ciclos_historico',
   "BEGIN SELECT RAISE(ABORT,'ciclo imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS loop_ciclos_eventos_imutavel_update',
   'BEFORE UPDATE ON loop_real_ciclos_historico_eventos',
   "BEGIN SELECT RAISE(ABORT,'evento de ciclo imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS loop_ciclos_eventos_imutavel_delete',
   'BEFORE DELETE ON loop_real_ciclos_historico_eventos',
   "BEGIN SELECT RAISE(ABORT,'evento de ciclo imutavel'); END;"
  ].join(' '));
 }
 _meta(){return this.db.prepare(
  'SELECT versao,total_ciclos,ultimo_hash',
  + ' FROM loop_real_ciclos_historico_meta WHERE id=1'
 ).get();}
 _ultimo(){return this.db.prepare(
  'SELECT ciclo,dados_json,sha256 FROM loop_real_ciclos_historico',
  + ' ORDER BY ciclo DESC LIMIT 1'
 ).get();}
 inicializarEmTransacao({sim}={}){
  if(!this.db.isTransaction)falha('HISTORICO_CICLOS_TRANSACAO_OBRIGATORIA');
  if(this._meta()){
   this.conferir({sim}); // primeira abertura: auditar cadeia inteira
   return;
  }
  if(this._ultimo()||this.db.prepare(
   'SELECT 1 FROM loop_real_ciclos_historico_eventos LIMIT 1'
  ).get())
   falha('HISTORICO_CICLOS_SEM_META');
  this.db.prepare([
   'INSERT INTO loop_real_ciclos_historico_meta',
   '(id,versao,total_ciclos,ultimo_hash) VALUES(1,1,0,?)'
  ].join(' ')).run(ZERO);
  this.sincronizarEmTransacao({sim});
 }
 sincronizarEmTransacao({sim}={}){
  if(!this.db.isTransaction)falha('HISTORICO_CICLOS_TRANSACAO_OBRIGATORIA');
  const cs=ciclos(sim),meta=this._meta(),ultimo=this._ultimo();
  if(!meta||meta.versao!==1||!SHA.test(meta.ultimo_hash)||
     meta.total_ciclos>cs.length||
     (meta.total_ciclos===0&&(meta.ultimo_hash!==ZERO||ultimo))||
     (meta.total_ciclos>0&&
      (!ultimo||ultimo.ciclo!==meta.total_ciclos||
       ultimo.sha256!==meta.ultimo_hash||
       ultimo.dados_json!==dados(cs[meta.total_ciclos-1],meta.total_ciclos-1))))
   falha('HISTORICO_CICLOS_ESTADO_DIVERGENTE');
  let anterior=meta.ultimo_hash;
  const salvar=this.db.prepare([
   'INSERT INTO loop_real_ciclos_historico',
   '(ciclo,centro_posicao_id,centro_titular_id,quantidade_eventos,',
   'dados_json,hash_anterior,sha256) VALUES(?,?,?,?,?,?,?)'
  ].join(' '));
  const evento=this.db.prepare([
   'INSERT INTO loop_real_ciclos_historico_eventos',
   '(ciclo,ordem,venda_id,destino_previsto) VALUES(?,?,?,?)'
  ].join(' '));
  for(let i=meta.total_ciclos;i<cs.length;i++){
   const c=cs[i],json=dados(c,i),sha=assinatura(anterior,json);
   salvar.run(i+1,c.centro.id,c.centro.participanteId,
    c.vendas.length,json,anterior,sha);
   for(let j=0;j<c.vendas.length;j++)
    evento.run(i+1,j+1,c.vendas[j].vendaId,c.vendas[j].destinoPrevisto);
   anterior=sha;
  }
  if(cs.length!==meta.total_ciclos){
   const r=this.db.prepare([
    'UPDATE loop_real_ciclos_historico_meta',
    'SET total_ciclos=?,ultimo_hash=?',
    'WHERE id=1 AND total_ciclos=? AND ultimo_hash=?'
   ].join(' ')).run(cs.length,anterior,meta.total_ciclos,meta.ultimo_hash);
   if(r.changes!==1)falha('HISTORICO_CICLOS_REVISAO_CONCORRENTE');
  }
  return {totalCiclos:cs.length};
 }
 conferirRapido({sim}={}){
  const cs=ciclos(sim),meta=this._meta(),ultimo=this._ultimo();
  if(!meta||meta.versao!==1||meta.total_ciclos!==cs.length||
     !SHA.test(meta.ultimo_hash)||
     (cs.length===0&&(meta.ultimo_hash!==ZERO||ultimo))||
     (cs.length>0&&(!ultimo||ultimo.ciclo!==cs.length||
      ultimo.sha256!==meta.ultimo_hash||
      ultimo.dados_json!==dados(cs[cs.length-1],cs.length-1))))
   falha('HISTORICO_CICLOS_ESTADO_DIVERGENTE');
  return {integridade:'OK',totalCiclos:cs.length,financeiroReal:false};
 }
 conferir({sim=doBanco(this.db)}={}){
  const cs=ciclos(sim),meta=this._meta();
  if(!meta||meta.versao!==1||meta.total_ciclos!==cs.length)
   falha('HISTORICO_CICLOS_ESTADO_DIVERGENTE');
  let anterior=ZERO,contagem=0,eventos=0;
  const rows=this.db.prepare([
   'SELECT ciclo,centro_posicao_id,centro_titular_id,quantidade_eventos,',
   'dados_json,hash_anterior,sha256',
   'FROM loop_real_ciclos_historico ORDER BY ciclo'
  ].join(' ')).iterate();
  const eventosRows=this.db.prepare([
   'SELECT ciclo,ordem,venda_id,destino_previsto',
   'FROM loop_real_ciclos_historico_eventos ORDER BY ciclo,ordem'
  ].join(' ')).iterate();
  const cursor=eventosRows[Symbol.iterator]();
  for(const row of rows){
   const i=contagem++,c=cs[i];
   if(!c||row.ciclo!==i+1||
      row.dados_json!==dados(c,i)||
      row.centro_posicao_id!==c.centro.id||
      row.centro_titular_id!==c.centro.participanteId||
      row.quantidade_eventos!==c.vendas.length||
      row.hash_anterior!==anterior||
      row.sha256!==assinatura(anterior,row.dados_json))
    falha('HISTORICO_CICLOS_DIVERGENTE');
   for(let j=0;j<c.vendas.length;j++){
    const ev=cursor.next();
    if(ev.done||ev.value.ciclo!==i+1||ev.value.ordem!==j+1||
       ev.value.venda_id!==c.vendas[j].vendaId||
       ev.value.destino_previsto!==c.vendas[j].destinoPrevisto)
     falha('HISTORICO_CICLOS_EVENTOS_DIVERGENTES');
    eventos++;
   }
   anterior=row.sha256;
  }
  if(!cursor.next().done||contagem!==cs.length||
     meta.ultimo_hash!==anterior)
   falha('HISTORICO_CICLOS_DIVERGENTE');
  return {integridade:'OK',totalCiclos:contagem,totalEventos:eventos,
   somenteLeitura:true,financeiroReal:false};
 }
 consultarPagina({inicio=1,limite=20}={}){
  if(!Number.isSafeInteger(inicio)||inicio<1||
     !Number.isSafeInteger(limite)||limite<1||limite>50)
   falha('HISTORICO_CICLOS_PAGINACAO_INVALIDA');
  return {fonte:'HISTORICO_RELACIONAL_SOMENTE_LEITURA',
   ciclos:this.db.prepare([
    'SELECT ciclo,centro_posicao_id AS posicaoCentroId,',
    'quantidade_eventos AS eventos,sha256',
    'FROM loop_real_ciclos_historico WHERE ciclo>=?',
    'ORDER BY ciclo LIMIT ?'
   ].join(' ')).all(inicio,limite),
   financeiroReal:false};
 }
 static referenciaExistente(banco){
  if(!presenca(banco))return null;
  const h=Object.create(HistoricoCiclosRelacionalSQLite.prototype);
  h.db=banco;
  return h;
 }
 static verificarExistente({banco}={}){
  const h=HistoricoCiclosRelacionalSQLite.referenciaExistente(banco);
  if(!h)return {legado:true};
  return h.conferir();
 }
}
module.exports={HistoricoCiclosRelacionalSQLite,TABELAS_HISTORICO};
