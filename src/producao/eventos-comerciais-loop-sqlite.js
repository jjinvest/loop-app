'use strict';
// Ponte atômica do pedido confirmado pela reconsulta PSP -> evento comercial.
// O EVENTO NÃO cria posição, ciclo, comissão, saldo ou giro da catraca.
// A apuração comercial/financeira externa continua obrigatória antes de ativar
// qualquer posição real. Nunca expor os métodos de gravação via HTTP.
const TABELA_EVENTOS_COMERCIAIS='loop_real_eventos_comerciais';
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
const idOk=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(x);
class EventosComerciaisLoopSQLite{
 constructor({banco,agora=()=>Date.now()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     typeof agora!=='function'||!banco.prepare([
      "SELECT 1 FROM sqlite_master WHERE type='table'",
      "AND name='loop_real_contas'"
     ].join(' ')).get()||!banco.prepare([
      "SELECT 1 FROM sqlite_master WHERE type='table'",
      "AND name='loja_real_pedidos'"
     ].join(' ')).get())
   falha('EVENTOS_COMERCIAIS_REQUEREM_BANCO_UNICO');
  this.db=banco;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_real_eventos_comerciais(',
   'pedido_id TEXT PRIMARY KEY REFERENCES loja_real_pedidos(pedido_id)',
   'ON DELETE RESTRICT,',
   'titular_id TEXT NOT NULL REFERENCES loop_real_contas(id) ON DELETE RESTRICT,',
   'pagamento_id TEXT NOT NULL UNIQUE,',
   'valor_total_centavos INTEGER NOT NULL CHECK(valor_total_centavos>0),',
   'frete_centavos INTEGER NOT NULL CHECK(frete_centavos>=0),',
   'valor_produtos_centavos INTEGER NOT NULL CHECK(valor_produtos_centavos>0),',
   'estado TEXT NOT NULL CHECK(estado IN',
   "('AGUARDANDO_CONCILIACAO','CANCELADO')),",
   'registrado_em INTEGER NOT NULL CHECK(registrado_em>0),',
   'cancelado_em INTEGER,',
   "CHECK((estado='CANCELADO')=(cancelado_em IS NOT NULL)));",
   'CREATE TRIGGER IF NOT EXISTS loop_eventos_comerciais_sem_delete',
   'BEFORE DELETE ON loop_real_eventos_comerciais BEGIN',
   "SELECT RAISE(ABORT,'evento comercial imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS loop_eventos_comerciais_guard_update',
   'BEFORE UPDATE ON loop_real_eventos_comerciais',
   'WHEN OLD.estado!=\'AGUARDANDO_CONCILIACAO\' OR',
   "NEW.estado!='CANCELADO' OR",
   'NEW.pedido_id!=OLD.pedido_id OR',
   'NEW.titular_id!=OLD.titular_id OR',
   'NEW.pagamento_id!=OLD.pagamento_id OR',
   'NEW.valor_total_centavos!=OLD.valor_total_centavos OR',
   'NEW.frete_centavos!=OLD.frete_centavos OR',
   'NEW.valor_produtos_centavos!=OLD.valor_produtos_centavos OR',
   'NEW.registrado_em!=OLD.registrado_em OR',
   'NEW.cancelado_em IS NULL',
   "BEGIN SELECT RAISE(ABORT,'evento comercial imutavel'); END;"
  ].join(' '));
 }
 _dentroDaTransacao(){
  // O chamador é obrigatoriamente PedidosComerciaisSQLite.confirmarPagamento,
  // depois de BEGIN IMMEDIATE, no mesmo DatabaseSync.
  if(this.db.isTransaction===false)
   falha('EVENTO_COMERCIAL_REQUER_COMMIT_ATOMICO');
 }
 _linhaPedido(id){
  const p=this.db.prepare([
   'SELECT pedido_id,titular_id,pagamento_id,status,',
   'valor_total_centavos,frete_centavos',
   'FROM loja_real_pedidos WHERE pedido_id=?'
  ].join(' ')).get(id);
  if(!p)falha('EVENTO_COMERCIAL_PEDIDO_INEXISTENTE');
  return p;
 }
 _preco(pedido){
  const c=this.db.prepare([
   'SELECT COUNT(*) AS linhas,',
   'COALESCE(SUM(preco_unit_centavos*quantidade),0) AS produtos',
   'FROM loja_real_custos_pedido WHERE pedido_id=?'
  ].join(' ')).get(pedido.pedido_id);
  if(c.linhas<1||!Number.isSafeInteger(c.produtos)||
     !Number.isSafeInteger(pedido.valor_total_centavos)||
     !Number.isSafeInteger(pedido.frete_centavos)||
     c.produtos<=0||pedido.frete_centavos<0||
     c.produtos+pedido.frete_centavos!==pedido.valor_total_centavos)
   falha('EVENTO_COMERCIAL_TOTAL_DIVERGENTE');
  return c.produtos;
 }
 registrarPagamentoConciliadoEmTransacao({pedidoId,pagamentoId}={}){
  this._dentroDaTransacao();
  if(!idOk(pedidoId)||!idOk(pagamentoId))
   falha('EVENTO_COMERCIAL_REFERENCIA_INVALIDA');
  const p=this._linhaPedido(pedidoId),produtos=this._preco(p);
  if(p.status!=='APROVADO_PARA_EXPEDICAO'||p.pagamento_id!==pagamentoId)
   falha('EVENTO_COMERCIAL_PAGAMENTO_NAO_APROVADO');
  const anterior=this.db.prepare(
   'SELECT * FROM loop_real_eventos_comerciais WHERE pedido_id=?'
  ).get(pedidoId);
  if(anterior){
   if(anterior.pagamento_id!==pagamentoId||
      anterior.titular_id!==p.titular_id||
      anterior.valor_total_centavos!==p.valor_total_centavos||
      anterior.frete_centavos!==p.frete_centavos||
      anterior.valor_produtos_centavos!==produtos)
    falha('EVENTO_COMERCIAL_REPLAY_DIVERGENTE');
   if(anterior.estado==='CANCELADO')falha('EVENTO_COMERCIAL_CANCELADO');
   return {registrado:false,repetido:true,
    estado:anterior.estado,ativacaoLoop:false};
  }
  const ts=this.agora();
  if(!Number.isSafeInteger(ts)||ts<1)falha('RELOGIO_COMERCIAL_INVALIDO');
  this.db.prepare([
   'INSERT INTO loop_real_eventos_comerciais(',
   'pedido_id,titular_id,pagamento_id,valor_total_centavos,',
   'frete_centavos,valor_produtos_centavos,estado,registrado_em)',
   "VALUES(?,?,?,?,?,?,'AGUARDANDO_CONCILIACAO',?)"
  ].join(' ')).run(pedidoId,p.titular_id,pagamentoId,
   p.valor_total_centavos,p.frete_centavos,produtos,ts);
  return {registrado:true,repetido:false,
   estado:'AGUARDANDO_CONCILIACAO',ativacaoLoop:false};
 }
 registrarCancelamentoEmTransacao({pedidoId}={}){
  this._dentroDaTransacao();
  if(!idOk(pedidoId))falha('EVENTO_COMERCIAL_REFERENCIA_INVALIDA');
  const p=this._linhaPedido(pedidoId);
  if(p.status!=='CANCELADO')falha('EVENTO_COMERCIAL_CANCELAMENTO_NAO_COMPROVADO');
  const e=this.db.prepare(
   'SELECT estado FROM loop_real_eventos_comerciais WHERE pedido_id=?'
  ).get(pedidoId);
  if(!e)return {registrado:false,existiaEvento:false,ativacaoLoop:false};
  if(e.estado==='CANCELADO')
   return {registrado:false,existiaEvento:true,ativacaoLoop:false};
  const ts=this.agora();
  if(!Number.isSafeInteger(ts)||ts<1)falha('RELOGIO_COMERCIAL_INVALIDO');
  this.db.prepare([
   "UPDATE loop_real_eventos_comerciais SET estado='CANCELADO',",
   'cancelado_em=? WHERE pedido_id=?',
   "AND estado='AGUARDANDO_CONCILIACAO'"
  ].join(' ')).run(ts,pedidoId);
  return {registrado:true,existiaEvento:true,ativacaoLoop:false};
 }
 verificar(){
  let total=0,pendentes=0,cancelados=0;
  const cursor=this.db.prepare([
   'SELECT e.pedido_id,e.titular_id,e.pagamento_id,',
   'e.valor_total_centavos,e.frete_centavos,',
   'e.valor_produtos_centavos,e.estado,e.cancelado_em,',
   'p.titular_id AS titular_pedido,p.pagamento_id AS pagamento_pedido,',
   'p.valor_total_centavos AS total_pedido,p.frete_centavos AS frete_pedido,',
   'p.status AS estado_pedido',
   'FROM loop_real_eventos_comerciais e',
   'JOIN loja_real_pedidos p ON p.pedido_id=e.pedido_id'
  ].join(' ')).iterate();
  for(const e of cursor){
   total++;
   if(e.titular_id!==e.titular_pedido||
      e.pagamento_id!==e.pagamento_pedido||
      e.valor_total_centavos!==e.total_pedido||
      e.frete_centavos!==e.frete_pedido||
      e.valor_produtos_centavos!==this._preco({
       pedido_id:e.pedido_id,valor_total_centavos:e.total_pedido,
       frete_centavos:e.frete_pedido
      }))
    falha('EVENTO_COMERCIAL_PEDIDO_DIVERGENTE');
   if(e.estado==='AGUARDANDO_CONCILIACAO'){
    pendentes++;
    if(e.estado_pedido!=='APROVADO_PARA_EXPEDICAO'||
       e.cancelado_em!==null)
     falha('EVENTO_COMERCIAL_PENDENTE_SEM_PEDIDO');
   }else if(e.estado==='CANCELADO'){
    cancelados++;
    if(e.estado_pedido!=='CANCELADO'||e.cancelado_em===null)
     falha('EVENTO_COMERCIAL_CANCELAMENTO_DIVERGENTE');
   }else falha('EVENTO_COMERCIAL_ESTADO_INVALIDO');
  }
  const semEvento=this.db.prepare([
   'SELECT COUNT(*) AS n FROM loja_real_pedidos p',
   "WHERE p.status='APROVADO_PARA_EXPEDICAO'",
   'AND NOT EXISTS(SELECT 1 FROM loop_real_eventos_comerciais e',
   'WHERE e.pedido_id=p.pedido_id)'
  ].join(' ')).get().n;
  return {integridade:'OK',eventos:total,pendentes,cancelados,
   pedidosAprovadosSemEvento:semEvento,
   direitosReaisCriados:0,girosAcionados:0,financeiroReal:false};
 }
 consultarTitular({titularId,limite=30}={}){
  if(typeof titularId!=='string'||!/^titular-[a-f0-9-]{36}$/.test(titularId)||
     !Number.isSafeInteger(limite)||limite<1||limite>50)
   falha('EVENTO_COMERCIAL_TITULAR_INVALIDO');
  const rs=this.db.prepare([
   'SELECT pedido_id,estado,registrado_em',
   'FROM loop_real_eventos_comerciais WHERE titular_id=?',
   'ORDER BY registrado_em DESC,pedido_id DESC LIMIT ?'
  ].join(' ')).all(titularId,limite);
  return {eventos:rs.map(e=>({pedidoId:e.pedido_id,estado:e.estado,
   registradoEm:e.registrado_em})),direitosReaisCriados:0,
   financeiroReal:false};
 }
}
module.exports={EventosComerciaisLoopSQLite,TABELA_EVENTOS_COMERCIAIS};
