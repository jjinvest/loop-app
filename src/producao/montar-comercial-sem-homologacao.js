'use strict';
// Monta a ponte do pedido para o histórico comercial, sem autorizar PSP,
// cotações externas, checkout, transferências, posições ou giro do LOOP.
// Só expõe leitura pelo serviço definitivo; toda chamada comercial externa
// permanece bloqueada até a homologação dos provedores.
const {PedidosComerciaisSQLite}=require('./pedidos-comerciais-sqlite');
const {ClassificacaoComercialLoopSQLite}=
 require('./classificacao-comercial-loop-sqlite');
const {EventosComerciaisLoopSQLite}=
 require('./eventos-comerciais-loop-sqlite');

function falhar(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function exigirChaveParaHistoricoComercial({banco,chavePedidos=null}={}){
 if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function')
  falhar('COMERCIAL_SEGURO_BANCO_INVALIDO');
 if(chavePedidos!==null){
  if(!Buffer.isBuffer(chavePedidos)||chavePedidos.length!==32)
   falhar('COMERCIAL_SEGURO_CHAVE_INVALIDA');
  return {historicoComercialAutorizado:true};
 }
 for(const nome of [
  'loja_real_pedidos','loja_real_cotacoes',
  'loja_real_outbox_fornecedor','loop_real_eventos_comerciais',
  'loop_real_fotos_regras_pedido'
 ]){
  if(!banco.prepare(
   "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
  ).get(nome))continue;
  if(banco.prepare('SELECT 1 FROM '+nome+' LIMIT 1').get())
   falhar('COMERCIAL_SEGURO_CHAVE_PEDIDOS_AUSENTE_COM_DADOS');
 }
 return {historicoComercialAutorizado:false};
}
function montarComercialSemHomologacao({
 banco,chavePedidos,auditoria,manutencao
}={}){
 if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
    !Buffer.isBuffer(chavePedidos)||chavePedidos.length!==32||
    auditoria?.db!==banco||manutencao?.db!==banco||
    typeof auditoria?.verificar!=='function'||
    typeof manutencao?.garantirOperacaoDisponivel!=='function')
  falhar('COMERCIAL_SEGURO_CONFIGURACAO_INVALIDA');

 // Banco e esquema único. Primeira construção cria apenas as tabelas.
 const bloqueio={
  banco,chavePedidos,manutencao,
  consultarCotacaoConfiavel:async()=>falhar('FORNECEDOR_NAO_HOMOLOGADO'),
  consultarPagamentoPsp:async()=>falhar('PSP_NAO_HOMOLOGADO')
 };
 new PedidosComerciaisSQLite(bloqueio);
 const classificacaoLoop=new ClassificacaoComercialLoopSQLite({
  banco,auditoria,manutencao
 });
 const eventosComerciais=new EventosComerciaisLoopSQLite({
  banco,classificacaoLoop
 });
 // A composição de pedidos e eventos usa a MESMA transação SQLite.
 // Não devolver a instância de escrita para nenhuma rota pública.
 const pedidosInternos=new PedidosComerciaisSQLite({
  ...bloqueio,classificacaoLoop,eventosComerciais
 });
 if(pedidosInternos.db!==banco||eventosComerciais.db!==banco||
    classificacaoLoop.db!==banco)
  falhar('COMERCIAL_SEGURO_BANCOS_DIVERGENTES');
 const regras=classificacaoLoop.verificar(),eventos=eventosComerciais.verificar();
 if(regras.integridade!=='OK'||eventos.integridade!=='OK'||
    eventos.pedidosAprovadosSemEvento!==0)
  falhar('COMERCIAL_SEGURO_AUDITORIA_DIVERGENTE');
 auditoria.verificar();
 return Object.freeze({
  classificacaoLoop,eventosComerciais,
  pedidosComerciaisPublicos:false,
  checkoutHabilitado:false,pspHomologado:false,
  ativacaoPosicoesHabilitada:false
 });
}
module.exports={montarComercialSemHomologacao,exigirChaveParaHistoricoComercial};
