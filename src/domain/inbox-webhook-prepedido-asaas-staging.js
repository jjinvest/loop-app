'use strict';
// Caixa de avisos Pix Asaas Sandbox de PRE-PEDIDOS, separada da loja demo.
// Webhook = SINAL nao prova de pagamento. Nao aplica creditos ao LOOP.
// O endpoint HTTP de ensaio roda apenas em loopback, NAO na aplicacao publica.
const {createHash,timingSafeEqual}=require('node:crypto');
// Asaas pode enviar apenas ID do pagamento e tipo do evento. Campos
// adicionais sao validos somente se presentes: a verdade financeira sera
// obtida depois por GET autenticado ao PSP, nunca por este aviso.
const TIPOS=new Set(['PAYMENT_CREATED','PAYMENT_UPDATED','PAYMENT_CONFIRMED',
 'PAYMENT_RECEIVED','PAYMENT_OVERDUE','PAYMENT_DELETED','PAYMENT_RESTORED',
 'PAYMENT_REFUNDED','PAYMENT_PARTIALLY_REFUNDED','PAYMENT_REFUND_IN_PROGRESS',
 'PAYMENT_CHARGEBACK_REQUESTED','PAYMENT_CHARGEBACK_DISPUTE']);
const REF=/^LOOPLAB-[a-z0-9-]{3,70}$/;
function lerSinalWebhook(corpoBruto){
 if(!Buffer.isBuffer(corpoBruto)||corpoBruto.length<2||
    corpoBruto.length>16384)throw falha('CORPO_WEBHOOK_INVALIDO');
 let obj;
 try{obj=JSON.parse(corpoBruto.toString('utf8'));}
 catch{throw falha('CORPO_WEBHOOK_INVALIDO');}
 const pagamento=obj?.payment;
 if(!obj||typeof obj!=='object'||Array.isArray(obj)||
    !ID.test(obj.id||'')||!TIPOS.has(obj.event)||
    !pagamento||typeof pagamento!=='object'||Array.isArray(pagamento)||
    !ID.test(pagamento.id||'')||
    (pagamento.billingType!==undefined&&pagamento.billingType!=='PIX')||
    (pagamento.externalReference!==undefined&&
      !REF.test(pagamento.externalReference))||
    (pagamento.status!==undefined&&
      (typeof pagamento.status!=='string'||!/^[A-Z_]{2,40}$/.test(pagamento.status))))
  throw falha('EVENTO_ASAAS_SANDBOX_NAO_VALIDO');
 let valorInformadoCentavos=null;
 if(pagamento.value!==undefined){
  const n=pagamento.value;
  if(typeof n!=='number'||!Number.isFinite(n)||n<=0||n>1000000000)
   throw falha('EVENTO_ASAAS_SANDBOX_NAO_VALIDO');
  const centavos=Math.round(n*100);
  if(!Number.isSafeInteger(centavos)||
     Math.abs(n*100-centavos)>0.000001)
   throw falha('VALOR_WEBHOOK_INVALIDO');
  valorInformadoCentavos=centavos;
 }
 return {eventoId:obj.id,tipo:obj.event,pagamentoId:pagamento.id,
  pedidoReferencia:pagamento.externalReference??null,
  statusInformado:pagamento.status??null,
  valorInformadoCentavos};
}

const ID=/^[A-Za-z0-9_&-]{5,150}$/;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
function conferirToken(esperado,recebido){
 if(typeof esperado!=='string'||esperado.length<32||esperado.length>255||
  /\s/.test(esperado))throw falha('TOKEN_SANDBOX_NAO_CONFIGURADO');
 if(typeof recebido!=='string'||recebido.length>255)
  throw falha('TOKEN_WEBHOOK_INVALIDO');
 const a=Buffer.from(esperado),b=Buffer.from(recebido);
 if(a.length!==b.length||!timingSafeEqual(a,b))
  throw falha('TOKEN_WEBHOOK_INVALIDO');
}
class InboxWebhookPrepedidoAsaasStaging{
 constructor({banco,token,agora=()=>new Date().toISOString()}={}){
  if(process.env.NODE_ENV==='production')
   throw falha('WEBHOOK_STAGING_PROIBIDO_EM_PRODUCAO');
  if(typeof banco?.exec!=='function'||typeof banco?.prepare!=='function')
   throw new TypeError('SQLite de staging obrigatorio');
  conferirToken(token,token);
  if(!banco.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='akitemm_prepedido_asaas_sandbox_staging'").get())
   throw new TypeError('PontePrepedidoAsaasSandboxStaging precisa existir primeiro');
  this.banco=banco;this.token=token;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_prepedido_webhook_inbox_staging(',
   'evento_id TEXT PRIMARY KEY NOT NULL,',
   'prepedido_id TEXT NOT NULL REFERENCES',
   'akitemm_prepedido_asaas_sandbox_staging(prepedido_id) ON DELETE RESTRICT,',
   'pagamento_id TEXT NOT NULL,tipo TEXT NOT NULL,',
   'status_avisado TEXT NOT NULL,valor_avisado_centavos INTEGER NOT NULL,',
   'hash_semantico TEXT NOT NULL,recebido_em TEXT NOT NULL);',
   'CREATE INDEX IF NOT EXISTS idx_prepedido_webhook_inbox_staging',
   'ON akitemm_prepedido_webhook_inbox_staging(prepedido_id,recebido_em);',
   'CREATE TRIGGER IF NOT EXISTS prepedido_webhook_no_update',
   'BEFORE UPDATE ON akitemm_prepedido_webhook_inbox_staging',
   "BEGIN SELECT RAISE(ABORT,'webhook imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS prepedido_webhook_no_delete',
   'BEFORE DELETE ON akitemm_prepedido_webhook_inbox_staging',
   "BEGIN SELECT RAISE(ABORT,'webhook imutavel'); END;"
  ].join(' '));
 }
 registrar({cabecalhoToken,corpoBruto}={}){
  if(process.env.NODE_ENV==='production')
   throw falha('WEBHOOK_STAGING_PROIBIDO_EM_PRODUCAO');
  // Conferir segredo ANTES de analisar ou armazenar payload de terceiros.
  conferirToken(this.token,cabecalhoToken);
  const aviso=lerSinalWebhook(corpoBruto);
  const hash=createHash('sha256').update(JSON.stringify(aviso)).digest('hex');
  const b=this.banco;b.exec('BEGIN IMMEDIATE');
  try{
   const antigo=b.prepare(
    'SELECT hash_semantico FROM akitemm_prepedido_webhook_inbox_staging WHERE evento_id=?'
   ).get(aviso.eventoId);
   if(antigo){
    if(antigo.hash_semantico!==hash)
     throw falha('EVENTO_REUTILIZADO_DIVERGENTE');
    b.exec('COMMIT');
    return {registrado:false,repetido:true,pendenteReconsulta:true,
     posicoesCriadas:0,pagamentoReal:false};
   }
   // Nunca gravar evento de pagamento de outro pedido, nem aceitar
   // ID de pagamento, referencia e valor afirmados so no corpo.
   // Vincular um aviso parcial SOMENTE por pagamento Asaas ja associado
   // a um prepedido. Se referencia/valor vierem, comparar obrigatoriamente.
   const cobranca=b.prepare([
    'SELECT prepedido_id,valor_centavos,pagamento_id,external_ref FROM',
    'akitemm_prepedido_asaas_sandbox_staging WHERE pagamento_id=?'
   ].join(' ')).get(aviso.pagamentoId);
   if(!cobranca)throw falha('REFERENCIA_DESCONHECIDA');
   if(!cobranca.pagamento_id||cobranca.pagamento_id!==aviso.pagamentoId||
      (aviso.pedidoReferencia!==null&&
       cobranca.external_ref!==aviso.pedidoReferencia)||
      (aviso.valorInformadoCentavos!==null&&
       cobranca.valor_centavos!==aviso.valorInformadoCentavos))
    throw falha('WEBHOOK_PAGAMENTO_DIVERGENTE');
   const data=this.agora();
   if(typeof data!=='string'||!Number.isFinite(Date.parse(data)))
    throw falha('RELOGIO_INVALIDO');
   b.prepare([
    'INSERT INTO akitemm_prepedido_webhook_inbox_staging',
    '(evento_id,prepedido_id,pagamento_id,tipo,status_avisado,',
    'valor_avisado_centavos,hash_semantico,recebido_em)',
    'VALUES(?,?,?,?,?,?,?,?)'
   ].join(' ')).run(aviso.eventoId,cobranca.prepedido_id,aviso.pagamentoId,
    aviso.tipo,aviso.statusInformado??'NAO_INFORMADO',
    aviso.valorInformadoCentavos??0,hash,data);
   b.exec('COMMIT');
   return {registrado:true,repetido:false,pendenteReconsulta:true,
    posicoesCriadas:0,pagamentoReal:false};
  }catch(e){b.exec('ROLLBACK');throw e;}
 }
 consultarEvento(eventoId){
  if(typeof eventoId!=='string'||!ID.test(eventoId))
   throw falha('EVENTO_INVALIDO');
  return this.banco.prepare([
   'SELECT evento_id AS eventoId,prepedido_id AS prepedidoId,',
   'pagamento_id AS pagamentoId,tipo,status_avisado AS statusAvisado,',
   'valor_avisado_centavos AS valorAvisadoCentavos,recebido_em AS recebidoEm',
   'FROM akitemm_prepedido_webhook_inbox_staging WHERE evento_id=?'
  ].join(' ')).get(eventoId)||null;
 }
}
module.exports={InboxWebhookPrepedidoAsaasStaging};
