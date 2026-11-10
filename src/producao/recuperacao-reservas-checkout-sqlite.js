'use strict';
// Recuperacao de reservas antigas do checkout sem criar "cancelamento pelo
// relogio". Vencimento so torna a compra candidata a RECONSULTA PSP;
// somente resposta confirmada da fonte PSP do pedido permite liberar vagas.
// Nao cria cobranca, pix, posicoes ou expedicao.
const ID=/^[A-Za-z0-9_-]{3,120}$/;
const TABELAS_RECUPERACAO=Object.freeze([
 'loop_real_checkout_reconsultas_pendentes'
]);
const RESULTADOS=new Set([
 'PSP_PENDENTE','ERRO_PSP','CANCELADA_COM_PROVA',
 'CONFIRMADA_E_CONSUMIDA','CONFIRMADA_POSICAO_PENDENTE',
 'RESERVA_EM_REVISAO'
]);
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
class RecuperacaoReservasCheckoutSQLite{
 constructor({banco,preflight,pedidos=null,agora=()=>Date.now(),
  idadeMinimaMs=15*60*1000,intervaloMinimoMs=60*1000}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     preflight?.db!==banco||
     typeof preflight.verificar!=='function'||
     typeof agora!=='function'||
     !Number.isSafeInteger(idadeMinimaMs)||idadeMinimaMs<60000||
     idadeMinimaMs>30*24*3600*1000||
     !Number.isSafeInteger(intervaloMinimoMs)||intervaloMinimoMs<60000||
     intervaloMinimoMs>24*3600*1000||
     (pedidos!==null&&(pedidos.db!==banco||
       pedidos.preflightCapacidade!==preflight||
       typeof pedidos.confirmarPagamento!=='function')))
   falha('RECUPERACAO_RESERVAS_DEPENDENCIAS_DIVERGENTES');
  this.db=banco;this.preflight=preflight;this.pedidos=pedidos;
  this.agora=agora;this.idadeMinimaMs=idadeMinimaMs;
  this.intervaloMinimoMs=intervaloMinimoMs;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_real_checkout_reconsultas_pendentes(',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,',
   'pedido_id TEXT NOT NULL REFERENCES loja_real_pedidos(pedido_id)',
   'ON DELETE RESTRICT,',
   'resultado TEXT NOT NULL CHECK(resultado IN (',
   "'PSP_PENDENTE','ERRO_PSP','CANCELADA_COM_PROVA',",
   "'CONFIRMADA_E_CONSUMIDA','CONFIRMADA_POSICAO_PENDENTE',",
   "'RESERVA_EM_REVISAO')),",
   'registrado_em INTEGER NOT NULL CHECK(registrado_em>0));',
   'CREATE INDEX IF NOT EXISTS idx_checkout_reconsultas_pedido',
   'ON loop_real_checkout_reconsultas_pendentes(pedido_id,registrado_em);',
   'CREATE TRIGGER IF NOT EXISTS loop_checkout_reconsultas_imutavel_u',
   'BEFORE UPDATE ON loop_real_checkout_reconsultas_pendentes BEGIN',
   "SELECT RAISE(ABORT,'RECONSULTA_PSP_IMUTAVEL'); END;",
   'CREATE TRIGGER IF NOT EXISTS loop_checkout_reconsultas_imutavel_d',
   'BEFORE DELETE ON loop_real_checkout_reconsultas_pendentes BEGIN',
   "SELECT RAISE(ABORT,'RECONSULTA_PSP_IMUTAVEL'); END;"
  ].join(' '));
 }
 _ts(){
  const ts=this.agora();
  if(!Number.isSafeInteger(ts)||ts<=this.idadeMinimaMs)
   falha('RECUPERACAO_RESERVAS_RELOGIO_INVALIDO');
  return ts;
 }
 _vencidas(limite=100){
  if(!Number.isSafeInteger(limite)||limite<1||limite>500)
   falha('RECUPERACAO_RESERVAS_LIMITE_INVALIDO');
  const agora=this._ts();
  return this.db.prepare([
   'SELECT r.pedido_id AS pedidoId,r.titular_id AS titularId,',
   'r.quantidade,r.criado_em AS criadoEm,p.status AS statusPedido,',
   '(SELECT MAX(q.registrado_em) FROM loop_real_checkout_reconsultas_pendentes q',
   'WHERE q.pedido_id=r.pedido_id) AS ultimaReconsulta',
   'FROM loop_real_checkout_reservas_posicoes r',
   'JOIN loja_real_pedidos p ON p.pedido_id=r.pedido_id',
   "WHERE r.estado='RESERVADA' AND r.criado_em<=?",
   "AND p.status IN ('AGUARDANDO_PAGAMENTO','APROVADO_PARA_EXPEDICAO')",
   'ORDER BY r.criado_em ASC,r.pedido_id ASC LIMIT ?'
  ].join(' ')).all(agora-this.idadeMinimaMs,limite);
 }
 consultar({limite=100}={}){
  const vencidas=this._vencidas(limite);
  const total=this.db.prepare([
   'SELECT COUNT(*) AS pedidos,COALESCE(SUM(quantidade),0) AS posicoes',
   'FROM loop_real_checkout_reservas_posicoes',
   "WHERE estado='RESERVADA'"
  ].join(' ')).get();
  const agora=this._ts();
  const aptas=vencidas.filter(x=>x.ultimaReconsulta===null||
   x.ultimaReconsulta<=agora-this.intervaloMinimoMs);
  return {
   reservasEmAberto:total.pedidos,
   reservasConfirmadasSemPosicao:vencidas.filter(x=>
    x.statusPedido==='APROVADO_PARA_EXPEDICAO').length,
   posicoesReservadas:total.posicoes,
   reservasVencidasNaPagina:vencidas.length,
   elegiveisParaReconsulta:aptas.length,
   intervaloMinimoReconsultaMs:this.intervaloMinimoMs,
   proximaAcao:this.pedidos&&process.env.NODE_ENV!=='production'?
    'RECONSULTAR_PSP':'AGUARDAR_PSP_HOMOLOGADO',
   liberacaoPorTempo:false,checkoutReal:false,financeiroReal:false
  };
 }
 async reconsultarVencidas({limite=20,autorizadoEnsaio=false}={}){
  if(process.env.NODE_ENV==='production'||!this.pedidos||
     autorizadoEnsaio!==true)
   falha('RECUPERACAO_PSP_NAO_HOMOLOGADO');
  if(!Number.isSafeInteger(limite)||limite<1||limite>50)
   falha('RECUPERACAO_RESERVAS_LIMITE_INVALIDO');
  let reconsultadas=0,liberadas=0,consumidas=0,
   pendentes=0,erros=0,aguardamPosicao=0,ignoradasPorIntervalo=0;
  const agora=this._ts();
  for(const pedido of this._vencidas(500)){
   if(reconsultadas>=limite)break;
   if(pedido.ultimaReconsulta!==null&&
      pedido.ultimaReconsulta>agora-this.intervaloMinimoMs){
    ignoradasPorIntervalo++;continue;
   }
   reconsultadas++;
   let resultado='ERRO_PSP';
   try{
    const verificado=await this.pedidos.confirmarPagamento({
     pedidoId:pedido.pedidoId
    });
    const reserva=this.db.prepare([
     'SELECT estado FROM loop_real_checkout_reservas_posicoes',
     'WHERE pedido_id=?'
    ].join(' ')).get(pedido.pedidoId);
    const status=this.db.prepare(
     'SELECT status FROM loja_real_pedidos WHERE pedido_id=?'
    ).get(pedido.pedidoId)?.status;
    if(verificado.cancelado===true&&
       reserva?.estado==='CANCELADA'&&status==='CANCELADO'){
     resultado='CANCELADA_COM_PROVA';liberadas++;
    }else if(verificado.confirmado===true&&
       reserva?.estado==='CONSUMIDA'&&status==='APROVADO_PARA_EXPEDICAO'){
     resultado='CONFIRMADA_E_CONSUMIDA';consumidas++;
    }else if(verificado.confirmado===true&&
       reserva?.estado==='RESERVADA'&&status==='APROVADO_PARA_EXPEDICAO'){
     resultado='CONFIRMADA_POSICAO_PENDENTE';aguardamPosicao++;
    }else{
     resultado='RESERVA_EM_REVISAO';erros++;
    }
   }catch(e){
    if(e?.codigo==='PAGAMENTO_PSP_NAO_CONCILIADO'){
     resultado='PSP_PENDENTE';pendentes++;
    }else{
     resultado='ERRO_PSP';erros++;
    }
   }
   // A reconciliação e registrada mesmo que a tentativa tenha falhado:
   // uma reexecucao nao pode apagar os erros nem inventar comprovantes.
   this.db.exec('BEGIN IMMEDIATE');
   try{
    this.db.prepare([
     'INSERT INTO loop_real_checkout_reconsultas_pendentes',
     '(pedido_id,resultado,registrado_em) VALUES(?,?,?)'
    ].join(' ')).run(pedido.pedidoId,resultado,agora);
    this.db.exec('COMMIT');
   }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  return {reconsultadas,liberadas,consumidas,pendentes,erros,
   aguardamPosicao,ignoradasPorIntervalo,enviosFornecedor:0,
   liberacoesPeloRelogio:0,financeiroReal:false};
 }
 verificar(){
  let total=0;
  for(const x of this.db.prepare([
   'SELECT r.pedido_id,r.resultado,r.registrado_em,p.status,',
   'v.estado AS estado_reserva FROM loop_real_checkout_reconsultas_pendentes r',
   'JOIN loja_real_pedidos p ON p.pedido_id=r.pedido_id',
   'LEFT JOIN loop_real_checkout_reservas_posicoes v',
   'ON v.pedido_id=r.pedido_id ORDER BY r.id'
  ].join(' ')).iterate()){
   total++;
   if(!ID.test(x.pedido_id)||!RESULTADOS.has(x.resultado)||
      !Number.isSafeInteger(x.registrado_em)||x.registrado_em<1||
      !x.estado_reserva)
    falha('RECUPERACAO_RESERVAS_LIVRO_DIVERGENTE');
   // O estado pode avançar desde a observação, mas nunca regredir
   // de cancelado ou consumido para reservado.
   if(x.resultado==='CANCELADA_COM_PROVA'&&
      (x.estado_reserva!=='CANCELADA'||x.status!=='CANCELADO'))
    falha('RECUPERACAO_CANCELAMENTO_DIVERGENTE');
   if(x.resultado==='CONFIRMADA_E_CONSUMIDA'&&
      x.estado_reserva!=='CONSUMIDA')
    falha('RECUPERACAO_PROMOCAO_DIVERGENTE');
  }
  return {integridade:'OK',reconsultas:total,liberacoesSemPSP:0};
 }
}
module.exports={RecuperacaoReservasCheckoutSQLite,TABELAS_RECUPERACAO};
