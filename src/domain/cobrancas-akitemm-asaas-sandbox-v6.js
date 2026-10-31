'use strict';

// AKITEMM / LOOP: cobrancas da loja no ambiente externo de testes ASAAS SANDBOX.
// Nao altera a fila, os cofres, os saques, as entregas nem o pagamento real.
const PEDIDO=/^[a-z0-9][a-z0-9-]{2,69}$/;
const CLIENTE=/^[A-Za-z0-9_-]{5,90}$/;
const CONFIRMADOS=new Set(['RECEIVED','RECEIVED_IN_CASH']);
const REVERTIDOS=new Set(['REFUNDED','PARTIALLY_REFUNDED','CHARGEBACK_REQUESTED',
 'CHARGEBACK_DISPUTE','REFUND_IN_PROGRESS','DELETED']);
const PENDENTES=new Set(['PENDING','CONFIRMED','OVERDUE']);
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
class CobrancasAkitemmAsaasSandboxSQLite{
 constructor({banco,provedor,agora=()=>new Date().toISOString()}={}){
  if(!banco||provedor?.ambiente!=='ASAAS_SANDBOX_EXCLUSIVO'||
   typeof provedor.criarCobrancaPix!=='function'||
   typeof provedor.consultarCobranca!=='function')
   throw new TypeError('SQLite e adaptador Asaas sandbox obrigatorios');
  this.banco=banco;this.provedor=provedor;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_sandbox_cobrancas (',
   'pedido_id TEXT PRIMARY KEY,origem TEXT NOT NULL CHECK(origem IN (\'PDF\',\'CARRINHO\')),',
   'valor_centavos INTEGER NOT NULL CHECK(valor_centavos>0),',
   'cliente_asaas_id TEXT NOT NULL,pagamento_id TEXT UNIQUE,',
   'status TEXT NOT NULL,criado_em TEXT NOT NULL,atualizado_em TEXT NOT NULL);',
   'CREATE TABLE IF NOT EXISTS akitemm_sandbox_consultas (',
   'id INTEGER PRIMARY KEY AUTOINCREMENT,',
   'pedido_id TEXT NOT NULL REFERENCES akitemm_sandbox_cobrancas(pedido_id),',
   'pagamento_id TEXT NOT NULL,status_asaas TEXT NOT NULL,',
   'status_local TEXT NOT NULL,consultado_em TEXT NOT NULL);',
   'CREATE TRIGGER IF NOT EXISTS akitemm_sandbox_consultas_immut_u',
   "BEFORE UPDATE ON akitemm_sandbox_consultas BEGIN SELECT RAISE(ABORT,'consulta imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS akitemm_sandbox_consultas_immut_d',
   "BEFORE DELETE ON akitemm_sandbox_consultas BEGIN SELECT RAISE(ABORT,'consulta imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS akitemm_sandbox_cobrancas_no_delete',
   "BEFORE DELETE ON akitemm_sandbox_cobrancas BEGIN SELECT RAISE(ABORT,'cobranca sandbox imutavel'); END;"
  ].join('\n'));
 }
 _valorPedido(origem,pedidoId){
  if(!['PDF','CARRINHO'].includes(origem)||typeof pedidoId!=='string'||
   !PEDIDO.test(pedidoId))throw falha('PEDIDO_INVALIDO');
  const tabela=origem==='PDF'?'admin_pdf_demo_pedidos':'admin_carrinho_loop_demo';
  const campo=origem==='PDF'?'preco_centavos':'total_centavos';
  const row=this.banco.prepare('SELECT '+campo+' AS valor FROM '+tabela+
   ' WHERE pedido_id=?').get(pedidoId);
  if(!row||!Number.isSafeInteger(row.valor)||row.valor<1)
   throw falha('PEDIDO_AKITEMM_INEXISTENTE');
  return row.valor;
 }
 _registro(pedidoId){
  return this.banco.prepare([
   'SELECT pedido_id AS pedidoId,origem,valor_centavos AS valorCentavos,',
   'cliente_asaas_id AS clienteAsaasId,pagamento_id AS pagamentoId,',
   'status,criado_em AS criadoEm,atualizado_em AS atualizadoEm',
   'FROM akitemm_sandbox_cobrancas WHERE pedido_id=?'
  ].join(' ')).get(pedidoId)||null;
 }
 consultar(pedidoId){
  if(typeof pedidoId!=='string'||!PEDIDO.test(pedidoId))throw falha('PEDIDO_INVALIDO');
  const r=this._registro(pedidoId);
  return {loja:'AKITEMM',projeto:'LOOP',ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
   encontrado:Boolean(r),...(r||{}),dinheiroRealRecebidoCentavos:0,
   valorTransferidoParaLoopCentavos:0,creditoFilaCriado:0,
   pixRealExecutado:false,saqueRealDisponivelCentavos:0};
 }
 // Parecer de elegibilidade somente leitura. Nao ativa posicoes nem libera dinheiro.
 auditarElegibilidadeLoop(pedidoId){
  const registro=this.consultar(pedidoId);
  if(!registro.encontrado)throw falha('COBRANCA_NAO_ENCONTRADA');
  const motivos=[];
  if(registro.status!=='RECEBIMENTO_INFORMADO_SANDBOX')
   motivos.push('PAGAMENTO_NAO_CONFIRMADO_OU_REVERSAO');
  if(registro.valorCentavos<25000)
   motivos.push('VALOR_INFERIOR_A_250_REAIS');
  if(registro.status==='CRIACAO_INDETERMINADA_SANDBOX')
   motivos.push('CRIACAO_REMOTA_INDETERMINADA');
  return {pedidoId,ambiente:'ASAAS_SANDBOX_EXCLUSIVO',
   elegivelParaSimulacao:motivos.length===0,
   motivos,valorCentavos:registro.valorCentavos,
   confirmacaoSandbox:registro.status==='RECEBIMENTO_INFORMADO_SANDBOX',
   posicoesCriadas:0,ativacaoAutomatica:false,
   titularValidado:false,catracaAutorizada:false,
   proximaEtapa:'VINCULAR_TITULAR_E_VALIDAR_CATRACA_EM_TESTE_ISOLADO',
   aviso:'Parecer de laboratorio; falta vinculo seguro ao titular e autorizacao da catraca.'};
 }
 // Auditoria consolidada por pedidos distintos, sem mutar o motor ou autorizar pagamentos.
 auditarLoteLoop(pedidoIds){
  if(!Array.isArray(pedidoIds)||pedidoIds.length>1000)
   throw falha('LOTE_AUDITORIA_INVALIDO');
  const ids=new Set();
  const itens=[];
  for(const pedidoId of pedidoIds){
   if(typeof pedidoId!=='string'||!PEDIDO.test(pedidoId)||ids.has(pedidoId))
    throw falha('LOTE_AUDITORIA_INVALIDO');
   ids.add(pedidoId);
   itens.push(this.auditarElegibilidadeLoop(pedidoId));
  }
  return {ambiente:'ASAAS_SANDBOX_EXCLUSIVO',pedidos:itens.length,
   aptosSomenteParaSimulacao:itens.filter(x=>x.elegivelParaSimulacao).length,
   bloqueados:itens.filter(x=>!x.elegivelParaSimulacao).length,
   valorAptoCentavos:itens.filter(x=>x.elegivelParaSimulacao)
    .reduce((s,x)=>s+x.valorCentavos,0),
   posicoesCriadas:0,dinheiroRealMovimentadoCentavos:0,
   itens};
 }
 async criar({pedidoId,origem,clienteAsaasId}={}){
  const valorCentavos=this._valorPedido(origem,pedidoId);
  if(typeof clienteAsaasId!=='string'||!CLIENTE.test(clienteAsaasId))
   throw falha('CLIENTE_ASAAS_SANDBOX_INVALIDO');
  const b=this.banco;
  // Reserva o pedido ANTES de sair para a rede. Timeouts nao podem criar
  // cobranças repetidas: reconciliar manualmente por externalReference.
  b.exec('BEGIN IMMEDIATE');
  try{
   const antigo=this._registro(pedidoId);
   if(antigo){
    if(antigo.origem!==origem||antigo.valorCentavos!==valorCentavos||
     antigo.clienteAsaasId!==clienteAsaasId)throw falha('CONFLITO_COBRANCA');
    b.exec('COMMIT');
    return {...this.consultar(pedidoId),repetida:true};
   }
   const data=this.agora();
   b.prepare([
    'INSERT INTO akitemm_sandbox_cobrancas',
    '(pedido_id,origem,valor_centavos,cliente_asaas_id,',
    'pagamento_id,status,criado_em,atualizado_em)',
    "VALUES(?,?,?,?,NULL,'CRIACAO_INDETERMINADA_SANDBOX',?,?)"
   ].join(' ')).run(pedidoId,origem,valorCentavos,clienteAsaasId,data,data);
   b.exec('COMMIT');
  }catch(e){b.exec('ROLLBACK');throw e;}
  // NENHUMA transacao SQLite aberta durante a rede.
  const remoto=await this.provedor.criarCobrancaPix({clienteAsaasId,valorCentavos,pedidoId});
  if(!remoto?.pagamentoId||remoto.valorCentavos!==valorCentavos||
    remoto.ambiente!=='ASAAS_SANDBOX_EXCLUSIVO')
   throw falha('RESPOSTA_SANDBOX_DIVERGENTE');
  b.exec('BEGIN IMMEDIATE');
  try{
   const atual=this._registro(pedidoId);
   if(atual.pagamentoId&&atual.pagamentoId!==remoto.pagamentoId)
    throw falha('COBRANCA_REMOTA_DUPLICADA');
   b.prepare('UPDATE akitemm_sandbox_cobrancas SET pagamento_id=?,status=?,atualizado_em=? WHERE pedido_id=?')
    .run(remoto.pagamentoId,'PENDENTE_SANDBOX',this.agora(),pedidoId);
   b.exec('COMMIT');
   return {...this.consultar(pedidoId),repetida:false};
  }catch(e){b.exec('ROLLBACK');throw e;}
 }
 async conferir(pedidoId){
  if(typeof pedidoId!=='string'||!PEDIDO.test(pedidoId))throw falha('PEDIDO_INVALIDO');
  const antes=this._registro(pedidoId);
  if(!antes)throw falha('COBRANCA_NAO_ENCONTRADA');
  if(!antes.pagamentoId)throw falha('CRIACAO_INDETERMINADA_VERIFICAR_ASAAS');
  const remoto=await this.provedor.consultarCobranca(antes.pagamentoId);
  if(remoto.pagamentoId!==antes.pagamentoId||
     remoto.valorCentavos!==antes.valorCentavos||
     remoto.externalReference!=='LOOPLAB-'+pedidoId||
     remoto.billingType!=='PIX'||
     (remoto.clienteAsaasId!==null&&remoto.clienteAsaasId!==undefined&&
      remoto.clienteAsaasId!==antes.clienteAsaasId))
   throw falha('DADOS_PAGAMENTO_SANDBOX_DIVERGENTES');
  const estado=REVERTIDOS.has(remoto.status)?'REVERSAO_INFORMADA_SANDBOX':
   CONFIRMADOS.has(remoto.status)?'RECEBIMENTO_INFORMADO_SANDBOX':
   PENDENTES.has(remoto.status)?'PENDENTE_SANDBOX':'STATUS_DESCONHECIDO_SANDBOX';
  const b=this.banco;b.exec('BEGIN IMMEDIATE');
  try{
   const atual=this._registro(pedidoId);
   if(atual.pagamentoId!==remoto.pagamentoId)throw falha('CONFLITO_COBRANCA');
   // Nunca regredir recebimento informado para pendente/desconhecido:
   // respostas remotas antigas nao podem apagar historico mais avancado.
   // Reversao informada e terminal neste laboratorio e demanda conciliacao.
   const final=atual.status==='REVERSAO_INFORMADA_SANDBOX' ||
    (atual.status==='RECEBIMENTO_INFORMADO_SANDBOX'&&
     ['PENDENTE_SANDBOX','STATUS_DESCONHECIDO_SANDBOX'].includes(estado))?
    atual.status:estado;
   b.prepare('UPDATE akitemm_sandbox_cobrancas SET status=?,atualizado_em=? WHERE pedido_id=?')
    .run(final,this.agora(),pedidoId);
   b.prepare([
    'INSERT INTO akitemm_sandbox_consultas',
    '(pedido_id,pagamento_id,status_asaas,status_local,consultado_em)',
    'VALUES(?,?,?,?,?)'
   ].join(' ')).run(pedidoId,antes.pagamentoId,remoto.status,final,this.agora());
   b.exec('COMMIT');
  }catch(e){b.exec('ROLLBACK');throw e;}
  return {...this.consultar(pedidoId),
   aviso:'Recebimento informado por SANDBOX; nao e saldo bancario liquidado.'};
 }
 historico(pedidoId){
  if(typeof pedidoId!=='string'||!PEDIDO.test(pedidoId))throw falha('PEDIDO_INVALIDO');
  return {cobranca:this.consultar(pedidoId),
   conferencias:this.banco.prepare([
    'SELECT pagamento_id AS pagamentoId,status_asaas AS statusAsaas,',
    'status_local AS estadoLoja,consultado_em AS consultadoEm',
    'FROM akitemm_sandbox_consultas WHERE pedido_id=? ORDER BY id'
   ].join(' ')).all(pedidoId)};
 }
}
module.exports={CobrancasAkitemmAsaasSandboxSQLite};
