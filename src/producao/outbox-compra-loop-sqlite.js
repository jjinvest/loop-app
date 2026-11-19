'use strict';
// Registro duravel e idempotente de compras confirmadas pelo PSP.
// A loja apenas grava o evento; o motor consome em processo separado.
// Nao cria posicao, saldo, comissao, saque ou giro por si so.
const ID=/^[A-Za-z0-9_-]{3,120}$/;
const TITULAR=/^titular-[a-f0-9-]{36}$/;
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
class OutboxCompraLoopSQLite {
 constructor({banco,agora=()=>Date.now()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     typeof agora!=='function')falha('OUTBOX_COMPRA_CONFIGURACAO_INVALIDA');
  this.db=banco;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_real_outbox_compra_confirmada(',
   'pedido_id TEXT PRIMARY KEY REFERENCES loja_real_pedidos(pedido_id) ON DELETE RESTRICT,',
   'titular_id TEXT NOT NULL REFERENCES loop_real_contas(id) ON DELETE RESTRICT,',
   'pagamento_id TEXT NOT NULL UNIQUE,',
   'valor_total_centavos INTEGER NOT NULL CHECK(valor_total_centavos>0),',
   "estado TEXT NOT NULL DEFAULT 'PENDENTE' CHECK(estado IN ('PENDENTE','PROCESSADO','REVISAO','CANCELADO')),",
   'criado_em INTEGER NOT NULL CHECK(criado_em>0),',
   'processado_em INTEGER,',
   'CHECK((estado=\'PROCESSADO\')=(processado_em IS NOT NULL)));',
   'CREATE INDEX IF NOT EXISTS idx_loop_outbox_compra_estado',
   'ON loop_real_outbox_compra_confirmada(estado,criado_em);'
  ].join(' '));
 }
 registrarConfirmacaoEmTransacao({pedidoId}={}){
  if(this.db.isTransaction!==true)falha('OUTBOX_COMPRA_TRANSACAO_OBRIGATORIA');
  if(typeof pedidoId!=='string'||!ID.test(pedidoId))
   falha('OUTBOX_COMPRA_PEDIDO_INVALIDO');
  const p=this.db.prepare([
   'SELECT pedido_id,titular_id,pagamento_id,valor_total_centavos,status',
   'FROM loja_real_pedidos WHERE pedido_id=?'
  ].join(' ')).get(pedidoId);
  if(!p||!TITULAR.test(p.titular_id)||!ID.test(p.pagamento_id||'')||
     p.status!=='APROVADO_PARA_EXPEDICAO'||
     !Number.isSafeInteger(p.valor_total_centavos)||p.valor_total_centavos<=0)
   falha('OUTBOX_COMPRA_SEM_PAGAMENTO_CONFIRMADO');
  const antigo=this.db.prepare(
   'SELECT * FROM loop_real_outbox_compra_confirmada WHERE pedido_id=?'
  ).get(pedidoId);
  if(antigo){
   if(antigo.titular_id!==p.titular_id||
      antigo.pagamento_id!==p.pagamento_id||
      antigo.valor_total_centavos!==p.valor_total_centavos)
    falha('OUTBOX_COMPRA_REPLAY_DIVERGENTE');
   return {repetido:true,estado:antigo.estado};
  }
  const ts=this.agora();
  if(!Number.isSafeInteger(ts)||ts<=0)falha('OUTBOX_COMPRA_RELOGIO_INVALIDO');
  this.db.prepare([
   'INSERT INTO loop_real_outbox_compra_confirmada(',
   'pedido_id,titular_id,pagamento_id,valor_total_centavos,criado_em)',
   'VALUES(?,?,?,?,?)'
  ].join(' ')).run(pedidoId,p.titular_id,p.pagamento_id,
   p.valor_total_centavos,ts);
  return {repetido:false,estado:'PENDENTE'};
 }
 cancelarEmTransacao({pedidoId}={}){
  if(this.db.isTransaction!==true)falha('OUTBOX_COMPRA_TRANSACAO_OBRIGATORIA');
  if(typeof pedidoId!=='string'||!ID.test(pedidoId))
   falha('OUTBOX_COMPRA_PEDIDO_INVALIDO');
  const p=this.db.prepare('SELECT status FROM loja_real_pedidos WHERE pedido_id=?')
   .get(pedidoId);
  if(!p||p.status!=='CANCELADO')
   falha('OUTBOX_COMPRA_CANCELAMENTO_NAO_COMPROVADO');
  const r=this.db.prepare(
   'SELECT estado FROM loop_real_outbox_compra_confirmada WHERE pedido_id=?'
  ).get(pedidoId);
  if(!r)return {semEvento:true};
  if(r.estado==='PROCESSADO')return {revisaoNecessaria:true};
  if(r.estado==='CANCELADO')return {repetido:true};
  this.db.prepare(
   "UPDATE loop_real_outbox_compra_confirmada SET estado='CANCELADO' WHERE pedido_id=?"
  ).run(pedidoId);
  return {cancelado:true};
 }
 // Integridade de ponta a ponta: mesma compra, mesmo titular e PSP.
 // Somente leitura. Não processa o evento, não ativa fila ou saldo.
 verificar(){
  const temEventos=!!this.db.prepare([
   "SELECT 1 FROM sqlite_master WHERE type='table'",
   "AND name='loop_real_eventos_comerciais'"
  ].join(' ')).get();
  const complemento=temEventos?[
   'LEFT JOIN loop_real_eventos_comerciais e ON e.pedido_id=o.pedido_id',
   'AND e.pagamento_id=o.pagamento_id'
  ].join(' '):'';
  const consulta=[
   'SELECT o.pedido_id,o.titular_id,o.pagamento_id,',
   'o.valor_total_centavos,o.estado,o.processado_em,',
   'p.pedido_id AS pedido_encontrado,',
   'p.titular_id AS titular_pedido,',
   'p.pagamento_id AS pagamento_pedido,',
   'p.valor_total_centavos AS total_pedido,',
   'p.status AS status_pedido',
   temEventos?',e.pedido_id AS evento_encontrado,':'',
   temEventos?'e.titular_id AS titular_evento,':'',
   temEventos?'e.estado AS estado_evento':'',
   'FROM loop_real_outbox_compra_confirmada o',
   'LEFT JOIN loja_real_pedidos p ON p.pedido_id=o.pedido_id',
   complemento
  ].filter(Boolean).join(' ');
  const linhas=this.db.prepare(consulta).all();
  let pendentes=0,processados=0,cancelados=0,
      emRevisao=0,estornosProcessadosParaRevisar=0;
  for(const r of linhas){
   if(!r.pedido_encontrado||r.titular_id!==r.titular_pedido||
      r.pagamento_id!==r.pagamento_pedido||
      r.valor_total_centavos!==r.total_pedido)
    falha('OUTBOX_COMPRA_PEDIDO_DIVERGENTE');
   if(temEventos&&(!r.evento_encontrado||
      r.titular_id!==r.titular_evento||
      (r.status_pedido==='CANCELADO')!==(r.estado_evento==='CANCELADO')))
    falha('OUTBOX_COMPRA_EVENTO_DIVERGENTE');
   if(r.estado==='PENDENTE'){
    if(r.status_pedido!=='APROVADO_PARA_EXPEDICAO')
     falha('OUTBOX_COMPRA_PENDENTE_SEM_PEDIDO');
    pendentes++;
   }else if(r.estado==='PROCESSADO'){
    processados++;
    // O processamento antigo jamais pode ser apagado automaticamente:
    // estorno exige revisão individual antes de qualquer compensação.
    if(r.status_pedido==='CANCELADO')estornosProcessadosParaRevisar++;
    else if(r.status_pedido!=='APROVADO_PARA_EXPEDICAO')
     falha('OUTBOX_COMPRA_PROCESSAMENTO_INVALIDO');
   }else if(r.estado==='CANCELADO'){
    if(r.status_pedido!=='CANCELADO')
     falha('OUTBOX_COMPRA_CANCELAMENTO_DIVERGENTE');
    cancelados++;
   }else if(r.estado==='REVISAO'){
    if(!['APROVADO_PARA_EXPEDICAO','CANCELADO']
      .includes(r.status_pedido))
     falha('OUTBOX_COMPRA_REVISAO_DIVERGENTE');
    emRevisao++;
   }else falha('OUTBOX_COMPRA_ESTADO_INVALIDO');
  }
  // Contabiliza o histórico anterior à instalação da outbox, sem
  // reaplicar pagamentos nem fabricar confirmações retroativas.
  const semOutbox=this.db.prepare([
   'SELECT COUNT(*) AS n FROM loja_real_pedidos p',
   "WHERE p.status='APROVADO_PARA_EXPEDICAO'",
   'AND NOT EXISTS(SELECT 1 FROM loop_real_outbox_compra_confirmada o',
   'WHERE o.pedido_id=p.pedido_id)'
  ].join(' ')).get().n;
  return {integridade:'OK',registros:linhas.length,pendentes,
   processados,cancelados,emRevisao,estornosProcessadosParaRevisar,
   pedidosAprovadosAnterioresSemOutbox:semOutbox,
   posicoesReaisCriadas:0,financeiroReal:false};
 }
 listarPendentes({limite=100}={}){
  if(!Number.isInteger(limite)||limite<1||limite>500)
   falha('OUTBOX_COMPRA_LIMITE_INVALIDO');
  return this.db.prepare([
   'SELECT pedido_id,titular_id,pagamento_id,valor_total_centavos,criado_em',
   'FROM loop_real_outbox_compra_confirmada',
   "WHERE estado='PENDENTE' ORDER BY criado_em,rowid LIMIT ?"
  ].join(' ')).all(limite);
 }
}
const TABELAS_OUTBOX_COMPRA=Object.freeze(['loop_real_outbox_compra_confirmada']);
module.exports={OutboxCompraLoopSQLite,TABELAS_OUTBOX_COMPRA};
