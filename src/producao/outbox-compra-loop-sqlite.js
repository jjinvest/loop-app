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
 listarPendentes({limite=100}={}){
  if(!Number.isInteger(limite)||limite<1||limite>500)
   falha('OUTBOX_COMPRA_LIMITE_INVALIDO');
  return this.db.prepare([
   'SELECT pedido_id,titular_id,pagamento_id,valor_total_centavos,criado_em',
   'FROM loop_real_outbox_compra_confirmada',
   "WHERE estado='PENDENTE' ORDER BY criado_em,pedido_id LIMIT ?"
  ].join(' ')).all(limite);
 }
}
module.exports={OutboxCompraLoopSQLite};
