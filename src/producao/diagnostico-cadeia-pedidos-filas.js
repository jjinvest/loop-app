'use strict';
// Diagnóstico SOMENTE LEITURA do fluxo já existente no SQLite da aplicação real.
// Não promove pedidos, não cria posições, não atribui ganhos e não liga a catraca.
// Os números abaixo descrevem registros internos, NÃO pagamentos bancários.
const ETAPAS=Object.freeze([
 'loja_real_pedidos',
 'loop_real_eventos_comerciais',
 'loop_real_outbox_compra_confirmada',
 'loop_real_motor_compras',
 'loop_real_filas_projecao_posicoes'
]);
function diagnosticarCadeiaPedidosFilas({banco,motorLoop}={}){
 if(typeof banco?.prepare!=='function'||motorLoop?.banco!==banco)
  throw Error('CADEIA_COMERCIAL_BANCO_DIVERGENTE');
 const existentes=new Set(banco.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name IN ("+
  ETAPAS.map(()=>'?').join(',')+")"
 ).all(...ETAPAS).map(x=>x.name));
 const tem=n=>existentes.has(n);
 const contar=(sql)=>banco.prepare(sql).get().n;
 const pedidos=tem(ETAPAS[0])?{
  aguardandoPagamento:contar(
   "SELECT COUNT(*) n FROM loja_real_pedidos WHERE status='AGUARDANDO_PAGAMENTO'"),
  aprovados:contar(
   "SELECT COUNT(*) n FROM loja_real_pedidos WHERE status='APROVADO_PARA_EXPEDICAO'"),
  cancelados:contar(
   "SELECT COUNT(*) n FROM loja_real_pedidos WHERE status='CANCELADO'")
 }:null;
 const eventos=tem(ETAPAS[1])?{
  aguardandoConciliacao:contar(
   "SELECT COUNT(*) n FROM loop_real_eventos_comerciais WHERE estado='AGUARDANDO_CONCILIACAO'"),
  cancelados:contar(
   "SELECT COUNT(*) n FROM loop_real_eventos_comerciais WHERE estado='CANCELADO'")
 }:null;
 const outbox=tem(ETAPAS[2])?{
  pendentes:contar(
   "SELECT COUNT(*) n FROM loop_real_outbox_compra_confirmada WHERE estado='PENDENTE'"),
  processados:contar(
   "SELECT COUNT(*) n FROM loop_real_outbox_compra_confirmada WHERE estado='PROCESSADO'"),
  emRevisao:contar(
   "SELECT COUNT(*) n FROM loop_real_outbox_compra_confirmada WHERE estado='REVISAO'"),
  cancelados:contar(
   "SELECT COUNT(*) n FROM loop_real_outbox_compra_confirmada WHERE estado='CANCELADO'")
 }:null;
 const posicoesMotor=tem(ETAPAS[3])?contar(
  'SELECT COUNT(*) n FROM loop_real_motor_compras'):null;
 const filas=tem(ETAPAS[4])?{
  A:contar("SELECT COUNT(*) n FROM loop_real_filas_projecao_posicoes WHERE local='A'"),
  B:contar("SELECT COUNT(*) n FROM loop_real_filas_projecao_posicoes WHERE local='B'"),
  noTabuleiro:contar(
   "SELECT COUNT(*) n FROM loop_real_filas_projecao_posicoes WHERE local NOT IN ('A','B')")
 }:null;
 const pendencias={
  aprovadosSemEvento:tem(ETAPAS[0])&&tem(ETAPAS[1])?contar([
   'SELECT COUNT(*) n FROM loja_real_pedidos p',
   "WHERE p.status='APROVADO_PARA_EXPEDICAO'",
   'AND NOT EXISTS(SELECT 1 FROM loop_real_eventos_comerciais e',
   'WHERE e.pedido_id=p.pedido_id)'
  ].join(' ')):null,
  aprovadosSemOutbox:tem(ETAPAS[0])&&tem(ETAPAS[2])?contar([
   'SELECT COUNT(*) n FROM loja_real_pedidos p',
   "WHERE p.status='APROVADO_PARA_EXPEDICAO'",
   'AND NOT EXISTS(SELECT 1 FROM loop_real_outbox_compra_confirmada o',
   'WHERE o.pedido_id=p.pedido_id)'
  ].join(' ')):null,
  eventosSemOutbox:tem(ETAPAS[1])&&tem(ETAPAS[2])?contar([
   'SELECT COUNT(*) n FROM loop_real_eventos_comerciais e',
   "WHERE e.estado='AGUARDANDO_CONCILIACAO'",
   'AND NOT EXISTS(SELECT 1 FROM loop_real_outbox_compra_confirmada o',
   'WHERE o.pedido_id=e.pedido_id)'
  ].join(' ')):null,
  // Vínculo entre pedidos e motor NÃO é prova de liquidação financeira.
  pedidosComPosicaoNoMotor:tem(ETAPAS[0])&&tem(ETAPAS[3])?contar([
   'SELECT COUNT(DISTINCT m.pedido_id) n FROM loop_real_motor_compras m',
   'JOIN loja_real_pedidos p ON p.pedido_id=m.pedido_id'
  ].join(' ')):null
 };
 return {
  fonte:'SQLITE_UNICO_IDENTIDADE_LOJA_LOOP',
  somenteLeitura:true,semDadosPessoais:true,financeiroReal:false,
  podeAtivarPosicoes:false,podeCreditar:false,podeGirar:false,
  statusEstrutural:ETAPAS.every(tem)?'ETAPAS_PRESENTES':'ETAPAS_PARCIAIS',
  etapasIndisponiveis:ETAPAS.filter(n=>!tem(n)),
  pedidos,eventos,outbox,posicoesMotor,filas,pendencias,
  bloqueioProdutivo:'LIQUIDACAO_SPLIT_E_RESERVA_PSP_AINDA_NAO_HOMOLOGADOS',
  observacao:'Pedido aprovado, evento registrado e outbox pendente nao autorizam posicao nem pagamento sem comprovacao externa.'
 };
}
module.exports={diagnosticarCadeiaPedidosFilas};
