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
// A fachada do checkout real continua bloqueada, mas o comprador deve
// acompanhar seu pedido REAL persistido apos reinicio. Somente os metodos
// de leitura saem da composicao; nao expor a instancia de escrita.
function criarLeituraComercialSegura({banco,pedidos}={}){
 if(pedidos?.db!==banco||
    typeof pedidos?.listarDoTitular!=='function'||
    typeof pedidos?.contarDoTitular!=='function'||
    typeof banco?.prepare!=='function')
  falhar('LEITURA_COMERCIAL_BANCO_OU_PEDIDO_INVALIDO');
 const temOutbox=()=>!!banco.prepare([
  "SELECT 1 FROM sqlite_master WHERE type='table'",
  "AND name='loja_real_outbox_fornecedor'"
 ].join(' ')).get();
 const leituraPedidos=Object.freeze({
  listarDoTitular({titularId,limite=30,offset=0}={}){
   return pedidos.listarDoTitular({titularId,limite,offset});
  },
  contarDoTitular({titularId}={}){
   return pedidos.contarDoTitular({titularId});
  },
  consultarDoTitular({titularId,pedidoId}={}){
   return pedidos.consultarDoTitular({titularId,pedidoId});
  }
 });
 const leituraRemessas=Object.freeze({
  consultar({pedidoId,fornecedorId}={}){
   if(typeof pedidoId!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(pedidoId)||
      typeof fornecedorId!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(fornecedorId))
    falhar('LEITURA_REMESSA_IDENTIFICADOR_INVALIDO');
   if(!temOutbox())return null;
   const r=banco.prepare([
    'SELECT o.estado,o.pedido_parceiro_id FROM loja_real_outbox_fornecedor o',
    'JOIN loja_real_pedidos p ON p.pedido_id=o.pedido_id',
    'WHERE o.pedido_id=? AND o.fornecedor_id=?'
   ].join(' ')).get(pedidoId,fornecedorId);
   if(r&&!['PENDENTE','INDETERMINADO','ENVIADO'].includes(r.estado))
    falhar('LEITURA_REMESSA_ESTADO_INCONSISTENTE');
   return r?{estado:r.estado,pedidoParceiroId:r.pedido_parceiro_id}:null;
  }
 });
 return Object.freeze({leituraPedidos,leituraRemessas,
  novaCompra:false,novoPagamento:false,envioFornecedor:false,
  financeiroReal:false});
}
function criarLeituraCatalogoSeguro({banco,catalogo}={}){
 if(typeof banco?.prepare!=='function'||catalogo?.db!==banco||
    typeof catalogo.listarVitrinePreparacao!=='function')
  falhar('LEITURA_CATALOGO_BANCO_DIVERGENTE');
 return Object.freeze({
  banco,
  listarVitrinePreparacao({limite=50}={}){
   return catalogo.listarVitrinePreparacao({limite});
  }
 });
}
function montarComercialSemHomologacao({
 banco,chavePedidos,auditoria,manutencao,catalogoLeitura=null
}={}){
 if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
    !Buffer.isBuffer(chavePedidos)||chavePedidos.length!==32||
    auditoria?.db!==banco||manutencao?.db!==banco||
    typeof auditoria?.verificar!=='function'||
    typeof manutencao?.garantirOperacaoDisponivel!=='function')
  falhar('COMERCIAL_SEGURO_CONFIGURACAO_INVALIDA');

 if(catalogoLeitura!==null&&(
    catalogoLeitura.db!==banco||
    typeof catalogoLeitura.listarVitrinePreparacao!=='function'))
  falhar('COMERCIAL_CATALOGO_NAO_COMPARTILHADO');
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
 const leitura=criarLeituraComercialSegura({banco,pedidos:pedidosInternos});
 const leituraCatalogo=catalogoLeitura===null?null:
  criarLeituraCatalogoSeguro({banco,catalogo:catalogoLeitura});
 return Object.freeze({
  classificacaoLoop,eventosComerciais,...leitura,leituraCatalogo,
  pedidosComerciaisPublicos:false,
  checkoutHabilitado:false,pspHomologado:false,
  ativacaoPosicoesHabilitada:false
 });
}
module.exports={montarComercialSemHomologacao,exigirChaveParaHistoricoComercial,
 criarLeituraComercialSegura,criarLeituraCatalogoSeguro};
