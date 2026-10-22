'use strict';
// Inbox interna Asaas SANDBOX. Nao liga endpoint HTTP, pagamento, posicoes ou saques.
const {createHash,timingSafeEqual}=require('node:crypto');
const ID=/^[A-Za-z0-9_&-]{5,150}$/;
const REF=/^LOOPLAB-[a-z0-9-]{3,70}$/;
const TIPOS=new Set(['PAYMENT_CREATED','PAYMENT_UPDATED','PAYMENT_CONFIRMED',
 'PAYMENT_RECEIVED','PAYMENT_OVERDUE','PAYMENT_DELETED','PAYMENT_RESTORED',
 'PAYMENT_REFUNDED','PAYMENT_PARTIALLY_REFUNDED','PAYMENT_REFUND_IN_PROGRESS',
 'PAYMENT_CHARGEBACK_REQUESTED','PAYMENT_CHARGEBACK_DISPUTE']);
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
function verificarToken(esperado,recebido){
 if(typeof esperado!=='string'||esperado.length<32||esperado.length>255||
    /\s/.test(esperado))throw falha('TOKEN_SANDBOX_NAO_CONFIGURADO');
 if(typeof recebido!=='string'||recebido.length>255)
  throw falha('TOKEN_WEBHOOK_INVALIDO');
 const a=Buffer.from(esperado),b=Buffer.from(recebido);
 if(a.length!==b.length||!timingSafeEqual(a,b))
  throw falha('TOKEN_WEBHOOK_INVALIDO');
}
function lerEvento(corpoBruto){
 if(!Buffer.isBuffer(corpoBruto)||corpoBruto.length<2||corpoBruto.length>16384)
  throw falha('CORPO_WEBHOOK_INVALIDO');
 let obj;
 try{obj=JSON.parse(corpoBruto.toString('utf8'));}
 catch{throw falha('CORPO_WEBHOOK_INVALIDO');}
 const p=obj?.payment;
 if(!obj||typeof obj!=='object'||Array.isArray(obj)||
    !ID.test(obj.id)||!TIPOS.has(obj.event)||!p||
    typeof p!=='object'||Array.isArray(p)||!ID.test(p.id)||
    p.billingType!=='PIX'||!REF.test(p.externalReference)||
    typeof p.status!=='string'||!/^[A-Z_]{2,40}$/.test(p.status)||
    typeof p.value!=='number'||!Number.isFinite(p.value)||
    p.value<=0||p.value>1000000000)
  throw falha('EVENTO_ASAAS_SANDBOX_NAO_VALIDO');
 const centavos=Math.round(p.value*100);
 if(!Number.isSafeInteger(centavos)||
    Math.abs(p.value*100-centavos)>0.000001)
  throw falha('VALOR_WEBHOOK_INVALIDO');
 return {eventoId:obj.id,tipo:obj.event,pagamentoId:p.id,
  pedidoReferencia:p.externalReference,statusInformado:p.status,
  valorInformadoCentavos:centavos};
}
class CaixaAvisosAsaasSandboxSQLite{
 constructor({banco,authToken,agora=()=>new Date().toISOString()}={}){
  if(!banco||typeof banco.prepare!=='function'||typeof banco.exec!=='function')
   throw new TypeError('SQLite necessario');
  verificarToken(authToken,authToken);
  this.banco=banco;this.authToken=authToken;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_asaas_sandbox_avisos (',
   'evento_id TEXT PRIMARY KEY,tipo TEXT NOT NULL,pagamento_id TEXT NOT NULL,',
   'pedido_referencia TEXT NOT NULL,status_informado TEXT NOT NULL,',
   'valor_informado_centavos INTEGER NOT NULL,assinatura_semantica TEXT NOT NULL,',
   'recebido_em TEXT NOT NULL);',
   'CREATE TRIGGER IF NOT EXISTS asaas_avisos_immut_update BEFORE UPDATE',
   "ON akitemm_asaas_sandbox_avisos BEGIN SELECT RAISE(ABORT,'imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS asaas_avisos_immut_delete BEFORE DELETE',
   "ON akitemm_asaas_sandbox_avisos BEGIN SELECT RAISE(ABORT,'imutavel'); END;"
  ].join(' '));
 }
 registrar({cabecalhoToken,corpoBruto}={}){
  verificarToken(this.authToken,cabecalhoToken);
  const aviso=lerEvento(corpoBruto);
  const hash=createHash('sha256').update(JSON.stringify(aviso)).digest('hex');
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const anterior=this.banco.prepare(
    'SELECT assinatura_semantica AS hash FROM akitemm_asaas_sandbox_avisos WHERE evento_id=?'
   ).get(aviso.eventoId);
   if(anterior&&anterior.hash!==hash)
    throw falha('ID_EVENTO_REUTILIZADO_COM_DADOS_DIVERGENTES');
   if(!anterior)this.banco.prepare([
    'INSERT INTO akitemm_asaas_sandbox_avisos',
    '(evento_id,tipo,pagamento_id,pedido_referencia,status_informado,',
    'valor_informado_centavos,assinatura_semantica,recebido_em)',
    'VALUES(?,?,?,?,?,?,?,?)'
   ].join(' ')).run(aviso.eventoId,aviso.tipo,aviso.pagamentoId,
    aviso.pedidoReferencia,aviso.statusInformado,aviso.valorInformadoCentavos,
    hash,this.agora());
   this.banco.exec('COMMIT');
   return Object.freeze({eventoId:aviso.eventoId,pagamentoId:aviso.pagamentoId,
    registrado:!anterior,repetido:Boolean(anterior),
    etapa:'RECONSULTA_E_CONCILIACAO_PENDENTES',apenasSinalSandbox:true,
    liquidacaoRealConfirmada:false,autorizacaoDePosicao:false,
    autorizacaoDeSaque:false,pixRealHabilitado:false});
  }catch(e){this.banco.exec('ROLLBACK');throw e;}
 }
 listar(){
  return this.banco.prepare([
   'SELECT evento_id AS eventoId,tipo,pagamento_id AS pagamentoId,',
   'pedido_referencia AS pedidoReferencia,status_informado AS statusInformado,',
   'valor_informado_centavos AS valorInformadoCentavos,',
   'recebido_em AS recebidoEm FROM akitemm_asaas_sandbox_avisos ORDER BY rowid'
  ].join(' ')).all();
 }
}
module.exports={CaixaAvisosAsaasSandboxSQLite,lerEvento};