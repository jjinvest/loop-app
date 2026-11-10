'use strict';
// Preflight comercial: reserva a capacidade das posicoes no MESMO commit
// da criacao do pedido, antes de QUALQUER cobranca. Nao cria direitos,
// posicoes, pagamentos ou saques. Nao impede venda CINZA sem posicoes.
const MAXIMO=10;
const TABELAS_PREFLIGHT=Object.freeze([
 'loop_real_checkout_reservas_posicoes',
 'loop_real_checkout_reservas_historico'
]);
const ID=/^[A-Za-z0-9_-]{3,120}$/;
const TITULAR=/^titular-[a-f0-9-]{36}$/;
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
class PreflightCapacidadeCheckoutSQLite{
 constructor({banco,motor,classificacaoLoop,agora=()=>Date.now()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     motor?.banco!==banco||classificacaoLoop?.db!==banco||
     typeof classificacaoLoop.avaliarPedido!=='function'||
     typeof motor.consultar!=='function'||typeof agora!=='function')
   falha('CHECKOUT_CAPACIDADE_MOTOR_NAO_COMPARTILHADO');
  this.db=banco;this.motor=motor;this.classificacao=classificacaoLoop;
  this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_real_checkout_reservas_posicoes(',
   'pedido_id TEXT PRIMARY KEY REFERENCES loja_real_pedidos(pedido_id)',
   'ON DELETE RESTRICT,',
   'titular_id TEXT NOT NULL REFERENCES loop_real_contas(id) ON DELETE RESTRICT,',
   'quantidade INTEGER NOT NULL CHECK(quantidade BETWEEN 1 AND 10),',
   "estado TEXT NOT NULL CHECK(estado IN ('RESERVADA','CONSUMIDA','CANCELADA')),",
   'criado_em INTEGER NOT NULL CHECK(criado_em>0),',
   'atualizado_em INTEGER NOT NULL CHECK(atualizado_em>0));',
   'CREATE INDEX IF NOT EXISTS idx_checkout_reservas_titular',
   'ON loop_real_checkout_reservas_posicoes(titular_id,estado);',
   'CREATE TABLE IF NOT EXISTS loop_real_checkout_reservas_historico(',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,',
   'pedido_id TEXT NOT NULL REFERENCES loop_real_checkout_reservas_posicoes(pedido_id)',
   'ON DELETE RESTRICT,',
   "acao TEXT NOT NULL CHECK(acao IN ('RESERVAR','CONSUMIR','CANCELAR','ESTORNO')),",
   'quantidade INTEGER NOT NULL CHECK(quantidade BETWEEN 1 AND 10),',
   'registrado_em INTEGER NOT NULL CHECK(registrado_em>0),',
   'UNIQUE(pedido_id,acao));',
   'CREATE TRIGGER IF NOT EXISTS loop_checkout_reservas_historico_sem_alterar',
   'BEFORE UPDATE ON loop_real_checkout_reservas_historico',
   "BEGIN SELECT RAISE(ABORT,'HISTORICO_RESERVAS_IMUTAVEL'); END;",
   'CREATE TRIGGER IF NOT EXISTS loop_checkout_reservas_historico_sem_apagar',
   'BEFORE DELETE ON loop_real_checkout_reservas_historico',
   "BEGIN SELECT RAISE(ABORT,'HISTORICO_RESERVAS_IMUTAVEL'); END;"
  ].join(' '));
 }
 _timestamp(){
  const ts=this.agora();
  if(!Number.isSafeInteger(ts)||ts<=0)falha('CHECKOUT_CAPACIDADE_RELOGIO_INVALIDO');
  return ts;
 }
 _ativos(titularId){
  const p=this.motor.consultar({titularId}).minhasPosicoes;
  if(!Array.isArray(p))falha('CHECKOUT_CAPACIDADE_MOTOR_DIVERGENTE');
  return p.length;
 }
 _pendentes(titularId){
  return this.db.prepare([
   'SELECT COALESCE(SUM(quantidade),0) AS n',
   'FROM loop_real_checkout_reservas_posicoes',
   "WHERE titular_id=? AND estado='RESERVADA'"
  ].join(' ')).get(titularId).n;
 }
 consultar({titularId}={}){
  if(typeof titularId!=='string'||!TITULAR.test(titularId))
   falha('CHECKOUT_CAPACIDADE_TITULAR_INVALIDO');
  const ativas=this._ativos(titularId);
  const reservadas=this._pendentes(titularId);
  if(!Number.isSafeInteger(ativas)||!Number.isSafeInteger(reservadas)||
     ativas<0||reservadas<0||ativas+reservadas>MAXIMO)
   falha('CHECKOUT_CAPACIDADE_LIVROS_DIVERGENTES');
  return {maximo:MAXIMO,ativas,reservadas,
   disponiveis:MAXIMO-ativas-reservadas,
   comprasReaisHabilitadas:false,
   naoConstituiPagamento:true};
 }
 _plano({pedidoId}){
  const c=this.classificacao.avaliarPedido({pedidoId});
  if(c.pedidoId!==pedidoId||
     !Number.isSafeInteger(c.totalPosicoesMistasPrevistas)||
     c.totalPosicoesMistasPrevistas<0||
     c.posicoesReaisCriadas!==0||c.financeiroReal!==false)
   falha('CHECKOUT_CAPACIDADE_CLASSIFICACAO_DIVERGENTE');
  return c.totalPosicoesMistasPrevistas;
 }
 reservarPedidoEmTransacao({pedidoId,titularId}={}){
  if(this.db.isTransaction!==true)
   falha('CHECKOUT_CAPACIDADE_TRANSACAO_OBRIGATORIA');
  if(!ID.test(pedidoId||'')||!TITULAR.test(titularId||''))
   falha('CHECKOUT_CAPACIDADE_PEDIDO_INVALIDO');
  const pedido=this.db.prepare([
   'SELECT titular_id,status FROM loja_real_pedidos WHERE pedido_id=?'
  ].join(' ')).get(pedidoId);
  if(!pedido||pedido.titular_id!==titularId||
     pedido.status!=='AGUARDANDO_PAGAMENTO')
   falha('CHECKOUT_CAPACIDADE_PEDIDO_NAO_PRE_COBRANCA');
  const qtd=this._plano({pedidoId});
  if(qtd>MAXIMO)falha('CHECKOUT_CARRINHO_EXCEDE_DEZ_POSICOES');
  const antiga=this.db.prepare(
   'SELECT quantidade,estado,titular_id FROM loop_real_checkout_reservas_posicoes WHERE pedido_id=?'
  ).get(pedidoId);
  if(antiga){
   if(antiga.quantidade!==qtd||antiga.titular_id!==titularId)
    falha('CHECKOUT_CAPACIDADE_REPLAY_DIVERGENTE');
   return {repetida:true,quantidade:qtd,estado:antiga.estado};
  }
  if(qtd===0)return {quantidade:0,qualificaLoop:false,estado:'SEM_POSICOES'};
  const cap=this.consultar({titularId});
  if(qtd>cap.disponiveis)
   falha('CHECKOUT_CAPACIDADE_INSUFICIENTE_ANTES_COBRANCA');
  const ts=this._timestamp();
  this.db.prepare([
   'INSERT INTO loop_real_checkout_reservas_posicoes',
   '(pedido_id,titular_id,quantidade,estado,criado_em,atualizado_em)',
   "VALUES(?,?,?,'RESERVADA',?,?)"
  ].join(' ')).run(pedidoId,titularId,qtd,ts,ts);
  this.db.prepare([
   'INSERT INTO loop_real_checkout_reservas_historico',
   "(pedido_id,acao,quantidade,registrado_em) VALUES(?,'RESERVAR',?,?)"
  ].join(' ')).run(pedidoId,qtd,ts);
  return {quantidade:qtd,qualificaLoop:true,estado:'RESERVADA'};
 }
 static _existe(db){
  return !!db.prepare([
   "SELECT 1 FROM sqlite_master WHERE type='table'",
   "AND name='loop_real_checkout_reservas_posicoes'"
  ].join(' ')).get();
 }
 static consumirEmTransacao(db,{pedidoId,quantidade}={}){
  if(!db?.isTransaction)falha('CHECKOUT_CAPACIDADE_TRANSACAO_OBRIGATORIA');
  if(!ID.test(pedidoId||'')||!Number.isSafeInteger(quantidade)||
     quantidade<1||quantidade>MAXIMO)
   falha('CHECKOUT_CAPACIDADE_CONSUMO_INVALIDO');
  if(!this._existe(db))return {semReservaAnterior:true};
  const r=db.prepare(
   'SELECT quantidade,estado FROM loop_real_checkout_reservas_posicoes WHERE pedido_id=?'
  ).get(pedidoId);
  if(!r)return {semReservaAnterior:true}; // pedido antigo pre-reserva
  if(r.quantidade!==quantidade||r.estado==='CANCELADA')
   falha('CHECKOUT_CAPACIDADE_CONSUMO_DIVERGENTE');
  if(r.estado==='CONSUMIDA')return {repetido:true};
  const ts=Date.now();
  db.prepare([
   "UPDATE loop_real_checkout_reservas_posicoes SET estado='CONSUMIDA',",
   'atualizado_em=? WHERE pedido_id=?'
  ].join(' ')).run(ts,pedidoId);
  db.prepare([
   'INSERT INTO loop_real_checkout_reservas_historico',
   "(pedido_id,acao,quantidade,registrado_em) VALUES(?,'CONSUMIR',?,?)"
  ].join(' ')).run(pedidoId,quantidade,ts);
  return {consumida:true,quantidade};
 }
 static cancelarEmTransacao(db,{pedidoId}={}){
  if(!db?.isTransaction)falha('CHECKOUT_CAPACIDADE_TRANSACAO_OBRIGATORIA');
  if(!ID.test(pedidoId||''))falha('CHECKOUT_CAPACIDADE_CANCELAMENTO_INVALIDO');
  if(!this._existe(db))return {semReservaAnterior:true};
  const r=db.prepare(
   'SELECT estado,quantidade FROM loop_real_checkout_reservas_posicoes WHERE pedido_id=?'
  ).get(pedidoId);
  if(!r)return {semReservaAnterior:true};
  if(r.estado==='CANCELADA')return {repetido:true};
  const ts=Date.now();
  if(r.estado==='RESERVADA'){
   db.prepare([
    "UPDATE loop_real_checkout_reservas_posicoes SET estado='CANCELADA',",
    'atualizado_em=? WHERE pedido_id=?'
   ].join(' ')).run(ts,pedidoId);
  }
  // Consumida = a posicao ja existe e requer estorno financeiro individual.
  const acao=r.estado==='RESERVADA'?'CANCELAR':'ESTORNO';
  db.prepare([
   'INSERT OR IGNORE INTO loop_real_checkout_reservas_historico',
   '(pedido_id,acao,quantidade,registrado_em) VALUES(?,?,?,?)'
  ].join(' ')).run(pedidoId,acao,r.quantidade,ts);
  return {liberada:r.estado==='RESERVADA',
   revisarPosicao:r.estado==='CONSUMIDA'};
 }
 verificar(){
  const rows=this.db.prepare([
   'SELECT r.*,p.titular_id AS titular_pedido,p.status AS estado_pedido',
   'FROM loop_real_checkout_reservas_posicoes r',
   'JOIN loja_real_pedidos p ON p.pedido_id=r.pedido_id'
  ].join(' ')).all();
  let reservadas=0,consumidas=0,canceladas=0;
  for(const r of rows){
   if(r.titular_id!==r.titular_pedido||r.quantidade!==this._plano({
     pedidoId:r.pedido_id
   }))falha('CHECKOUT_CAPACIDADE_AUDITORIA_DIVERGENTE');
   const hist=this.db.prepare([
    'SELECT acao,quantidade FROM loop_real_checkout_reservas_historico',
    'WHERE pedido_id=?'
   ].join(' ')).all(r.pedido_id);
   const ações=new Set(hist.map(h=>h.acao));
   if(hist.some(h=>h.quantidade!==r.quantidade)||
      !ações.has('RESERVAR')||ações.size!==hist.length)
    falha('CHECKOUT_CAPACIDADE_HISTORICO_DIVERGENTE');
   if(r.estado==='RESERVADA'){
    reservadas+=r.quantidade;
    if(r.estado_pedido==='CANCELADO'||ações.has('CANCELAR')||
       ações.has('CONSUMIR')||ações.has('ESTORNO'))
     falha('CHECKOUT_CAPACIDADE_RESERVA_CANCELADA');
   }else if(r.estado==='CONSUMIDA'){
    consumidas+=r.quantidade;
    if(!ações.has('CONSUMIR')||ações.has('CANCELAR'))
     falha('CHECKOUT_CAPACIDADE_CONSUMO_SEM_PROVA');
   }else{
    canceladas+=r.quantidade;
    if(r.estado_pedido!=='CANCELADO'||!ações.has('CANCELAR')||
       ações.has('CONSUMIR'))
     falha('CHECKOUT_CAPACIDADE_CANCELAMENTO_DIVERGENTE');
   }
  }
  return {integridade:'OK',reservas:rows.length,
   posicoesReservadas:reservadas,posicoesConsumidas:consumidas,
   posicoesCanceladas:canceladas,financeiroReal:false};
 }
}
module.exports={PreflightCapacidadeCheckoutSQLite,TABELAS_PREFLIGHT};
