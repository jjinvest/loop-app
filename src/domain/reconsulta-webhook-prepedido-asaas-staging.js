'use strict';
// Webhook informa um evento, mas nunca confirma recebimento por si.
// Operador invoca reconsulta independente ao Asaas Sandbox, sem acionar LOOP.
// Worker de ENSAIO sem cron, sem listener, sem producao.
const {PontePrepedidoAsaasSandboxStaging}=
 require('./ponte-prepedido-asaas-sandbox-staging');
const EVENTO=/^[A-Za-z0-9_&-]{5,150}$/;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
const REVERSO=new Set(['PAYMENT_REFUNDED','PAYMENT_PARTIALLY_REFUNDED',
 'PAYMENT_REFUND_IN_PROGRESS','PAYMENT_CHARGEBACK_REQUESTED',
 'PAYMENT_CHARGEBACK_DISPUTE','PAYMENT_DELETED']);
class ReconsultaWebhookPrepedidoAsaasStaging{
 constructor({banco,inbox,ponte,agora=()=>new Date().toISOString()}={}){
  if(process.env.NODE_ENV==='production')
   throw falha('RECONSULTA_STAGING_PROIBIDA_EM_PRODUCAO');
  if(typeof banco?.prepare!=='function'||inbox?.banco!==banco||
     !(ponte instanceof PontePrepedidoAsaasSandboxStaging)||ponte.banco!==banco)
   throw new TypeError('Worker exige mesma inbox e ponte SQLite de staging');
  this.banco=banco;this.inbox=inbox;this.ponte=ponte;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_prepedido_webhook_reconsulta_staging(',
   'evento_id TEXT PRIMARY KEY REFERENCES',
   'akitemm_prepedido_webhook_inbox_staging(evento_id) ON DELETE RESTRICT,',
   "estado TEXT NOT NULL CHECK(estado IN ('PROCESSANDO','CONCLUIDO','EXIGE_REVISAO')),",
   'codigo TEXT NOT NULL,iniciado_em TEXT NOT NULL,finalizado_em TEXT);',
   'CREATE TRIGGER IF NOT EXISTS prepedido_webhook_reconsulta_no_delete',
   'BEFORE DELETE ON akitemm_prepedido_webhook_reconsulta_staging',
   "BEGIN SELECT RAISE(ABORT,'historico de reconsulta imutavel'); END;"
  ].join(' '));
 }
 consultar(eventoId){
  if(typeof eventoId!=='string'||!EVENTO.test(eventoId))
   throw falha('EVENTO_INVALIDO');
  return this.banco.prepare([
   'SELECT estado,codigo,iniciado_em AS iniciadoEm,',
   'finalizado_em AS finalizadoEm FROM',
   'akitemm_prepedido_webhook_reconsulta_staging WHERE evento_id=?'
  ].join(' ')).get(eventoId)||null;
 }
 async processar({eventoId,provedor,execucaoLiberada=false}={}){
  if(process.env.NODE_ENV==='production')
   throw falha('RECONSULTA_STAGING_PROIBIDA_EM_PRODUCAO');
  if(execucaoLiberada!==true)throw falha('RECONSULTA_NAO_AUTORIZADA');
  if(provedor?.ambiente!=='ASAAS_SANDBOX_EXCLUSIVO'||
     typeof provedor.consultarCobranca!=='function')
   throw falha('PROVEDOR_SANDBOX_OBRIGATORIO');
  if(typeof eventoId!=='string'||!EVENTO.test(eventoId))
   throw falha('EVENTO_INVALIDO');
  const aviso=this.inbox.consultarEvento(eventoId);
  if(!aviso)throw falha('EVENTO_NAO_ENCONTRADO');
  const b=this.banco;
  b.exec('BEGIN IMMEDIATE');
  let titularId;
  try{
   const anterior=this.consultar(eventoId);
   if(anterior){
    b.exec('COMMIT');
    return {repetido:true,eventoId,estado:anterior.estado,
     codigo:anterior.codigo,pagamentoReal:false,posicoesCriadas:0};
   }
   const fonte=b.prepare([
    'SELECT titular_id,pagamento_id,valor_centavos FROM',
    'akitemm_prepedido_asaas_sandbox_staging WHERE prepedido_id=?'
   ].join(' ')).get(aviso.prepedidoId);
   if(!fonte||fonte.pagamento_id!==aviso.pagamentoId||
     fonte.valor_centavos!==aviso.valorAvisadoCentavos)
    throw falha('VINCULO_SANDBOX_DIVERGENTE');
   titularId=fonte.titular_id;
   b.prepare([
    'INSERT INTO akitemm_prepedido_webhook_reconsulta_staging',
    "(evento_id,estado,codigo,iniciado_em) VALUES(?,'PROCESSANDO','RECONSULTA',?)"
   ].join(' ')).run(eventoId,this.agora());
   b.exec('COMMIT');
  }catch(e){b.exec('ROLLBACK');throw e;}
  // Fora da transacao: consulta independente do provedor. Uma perda de
  // resposta apos essa linha exige verificacao manual, nao creditos.
  let situacao,codigo;
  try{
   const estado=await this.ponte.conferir({
    titularId,prepedidoId:aviso.prepedidoId,provedor
   });
   const status=estado.ultimaConsultaSandbox?.statusAsaas;
   const reversaoAvisada=REVERSO.has(aviso.tipo);
   const reversaoRemota=estado.estado==='REVERSAO_INFORMADA_SANDBOX';
   const recebidoAvisado=aviso.tipo==='PAYMENT_RECEIVED';
   const recebidoRemoto=status==='RECEIVED'&&
     estado.estado==='RECEBIMENTO_INFORMADO_SANDBOX';
   const divergente=(reversaoAvisada&&!reversaoRemota)||
    (recebidoAvisado&&!recebidoRemoto)||
    estado.revisaoManualObrigatoria===true;
   situacao=divergente?'EXIGE_REVISAO':'CONCLUIDO';
   codigo=divergente?'PSP_DIVERGENTE_OU_REVISAO':'PSP_RECONSULTADO';
  }catch(_e){
   // Nao persistir mensagens de rede nem segredos; resultado somente
   // operacional, nao confiar no texto retornado pelo provedor.
   situacao='EXIGE_REVISAO';codigo='RECONSULTA_INCONCLUSIVA';
  }
  b.exec('BEGIN IMMEDIATE');
  try{
   b.prepare([
    'UPDATE akitemm_prepedido_webhook_reconsulta_staging',
    'SET estado=?,codigo=?,finalizado_em=?',
    "WHERE evento_id=? AND estado='PROCESSANDO'"
   ].join(' ')).run(situacao,codigo,this.agora(),eventoId);
   b.exec('COMMIT');
  }catch(e){b.exec('ROLLBACK');throw e;}
  return {repetido:false,eventoId,estado:situacao,codigo,
   pagamentoReal:false,posicoesCriadas:0,bonusGerados:0,
   saqueRealAutorizado:false};
 }
}
module.exports={ReconsultaWebhookPrepedidoAsaasStaging};
