'use strict';
// Verificacao operacional de entrega + GET PSP independente, SOMENTE ASAAS SANDBOX.
// Esta rotina NAO valida o dominio HTTPS ou a origem remota do webhook sozinha.
// Separar a evidencia local da entrega registrada no painel do Asaas.
const {existsSync,statSync}=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {IntencoesCheckoutSQLite}=require('../src/domain/intencoes-checkout-sqlite');
const {PrePedidosCheckoutStagingSQLite}=require('../src/domain/prepedidos-checkout-staging-sqlite');
const {PontePrepedidoAsaasSandboxStaging}=require('../src/domain/ponte-prepedido-asaas-sandbox-staging');
const {InboxWebhookPrepedidoAsaasStaging}=require('../src/domain/inbox-webhook-prepedido-asaas-staging');
const {ReconsultaWebhookPrepedidoAsaasStaging}=require('../src/domain/reconsulta-webhook-prepedido-asaas-staging');
const {AsaasSandboxLojaV6}=require('../src/domain/asaas-sandbox-loja-v6');
const EVENTO=/^[A-Za-z0-9_&-]{5,150}$/;
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
function entradas(arquivo,eventoId){
 if(process.env.NODE_ENV==='production')throw erro('HOMOLOGACAO_VETADA_EM_PRODUCAO');
 if(typeof arquivo!=='string'||!path.isAbsolute(arquivo)||
    !arquivo.endsWith('.sqlite')||!existsSync(arquivo)||
    !statSync(arquivo).isFile())throw erro('SQLITE_STAGING_EXISTENTE_OBRIGATORIO');
 if(typeof eventoId!=='string'||!EVENTO.test(eventoId))
  throw erro('EVENTO_STAGING_INVALIDO');
}
function inspecionarEvento({arquivo,eventoId}={}){
 entradas(arquivo,eventoId);
 // Inspecao SEM qualquer escrita, token, chave ou solicitacao externa.
 const banco=new DatabaseSync(arquivo,{readOnly:true});
 try{
  banco.exec('PRAGMA query_only=ON;');
  const tabela=banco.prepare([
   "SELECT 1 AS existe FROM sqlite_master WHERE type='table'",
   "AND name='akitemm_prepedido_webhook_inbox_staging'"
  ].join(' ')).get();
  const recebido=tabela?banco.prepare([
   'SELECT 1 AS existe FROM akitemm_prepedido_webhook_inbox_staging',
   'WHERE evento_id=?'
  ].join(' ')).get(eventoId):null;
  let processamento=null;
  const tabelaReconsulta=banco.prepare([
   "SELECT 1 AS existe FROM sqlite_master WHERE type='table'",
   "AND name='akitemm_prepedido_webhook_reconsulta_staging'"
  ].join(' ')).get();
  if(recebido&&tabelaReconsulta)processamento=banco.prepare([
   'SELECT estado,codigo FROM akitemm_prepedido_webhook_reconsulta_staging',
   'WHERE evento_id=?'
  ].join(' ')).get(eventoId)||null;
  return {eventoId,recebidoLocalmente:Boolean(recebido),
   estadoReconsulta:processamento?.estado??null,
   codigoOperacional:processamento?.codigo??null,
   reconsultaPSPExecutadaNestaOperacao:false,
   entregaPeloAsaasComprovada:false,pagamentoReal:false,posicoesCriadas:0};
 }finally{banco.close();}
}
async function reconsultarEvento({
 arquivo,eventoId,tokenWebhook,apiKey,execucaoLiberada=false,provedor=null
}={}){
 entradas(arquivo,eventoId);
 if(execucaoLiberada!==true)throw erro('RECONSULTA_SANDBOX_NAO_AUTORIZADA');
 if(typeof tokenWebhook!=='string'||tokenWebhook.length<32||
    tokenWebhook.length>255||/\s/.test(tokenWebhook)||
    (apiKey!==undefined&&tokenWebhook===apiKey))
  throw erro('TOKEN_WEBHOOK_SANDBOX_SEPARADO_OBRIGATORIO');
 const provedorReal=provedor===null;
 if(provedorReal){
  if(typeof apiKey!=='string'||!apiKey.startsWith('$aact_hmlg_')||
     apiKey.length<25||/[\s\r\n]/.test(apiKey))
   throw erro('CHAVE_API_EXCLUSIVAMENTE_SANDBOX_OBRIGATORIA');
  provedor=new AsaasSandboxLojaV6({apiKey});
 }
 if(provedor?.ambiente!=='ASAAS_SANDBOX_EXCLUSIVO'||
    typeof provedor.consultarCobranca!=='function')
  throw erro('PROVEDOR_SANDBOX_OBRIGATORIO');
 const banco=new DatabaseSync(arquivo);
 try{
  banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;');
  new IntencoesCheckoutSQLite({banco});
  new PrePedidosCheckoutStagingSQLite({banco});
  const ponte=new PontePrepedidoAsaasSandboxStaging({banco});
  const inbox=new InboxWebhookPrepedidoAsaasStaging({banco,token:tokenWebhook});
  const worker=new ReconsultaWebhookPrepedidoAsaasStaging({banco,inbox,ponte});
  const aviso=inbox.consultarEvento(eventoId);
  if(!aviso)throw erro('WEBHOOK_NAO_RECEBIDO_NESTE_SQLITE');
  const titular=banco.prepare([
   'SELECT titular_id AS titularId FROM akitemm_prepedido_asaas_sandbox_staging',
   'WHERE prepedido_id=? AND pagamento_id=?'
  ].join(' ')).get(aviso.prepedidoId,aviso.pagamentoId);
  if(!titular)throw erro('PAGAMENTO_SANDBOX_NAO_VINCULADO');
  const resultado=await worker.processar({eventoId,provedor,execucaoLiberada:true});
  const ponteAtual=ponte.consultar({
   titularId:titular.titularId,prepedidoId:aviso.prepedidoId
  });
  const resposta={
   eventoId,eventoPersistidoLocalmente:true,
   estadoReconsulta:resultado.estado,codigoOperacional:resultado.codigo,
   resultadoReutilizado:resultado.repetido===true,
   consultaIndependenteAoAsaasExecutada:provedorReal&&resultado.repetido!==true,
   ultimaSituacaoSandbox:ponteAtual?.ultimaConsultaSandbox?.statusAsaas??null,
   revisaoManualObrigatoria:resultado.estado==='EXIGE_REVISAO'||
     ponteAtual?.revisaoManualObrigatoria===true,
   entregaPeloAsaasComprovada:false, // exige correlacao com log EXTERNO do Asaas
   pagamentoReal:false,pedidoComercialCriado:false,posicoesCriadas:0,
   bonusGerados:0,saquesLiberados:0
  };
  return resposta;
 }finally{banco.close();}
}
if(require.main===module){
 const arquivo=process.env.LOOP_HOMOLOGACAO_SQLITE;
 const eventoId=process.env.LOOP_HOMOLOGACAO_EVENTO_ID;
 const acao=process.env.LOOP_HOMOLOGACAO_ACAO;
 let tarefa;
 if(acao==='INSPECIONAR_WEBHOOK')
  tarefa=Promise.resolve().then(()=>inspecionarEvento({arquivo,eventoId}));
 else if(acao==='RECONSULTAR_WEBHOOK')
  tarefa=reconsultarEvento({arquivo,eventoId,
   tokenWebhook:process.env.LOOP_WEBHOOK_TUNEL_TOKEN,
   apiKey:process.env.ASAAS_SANDBOX_API_KEY,
   execucaoLiberada:process.env.LOOP_HOMOLOGACAO_RECONSULTAR==='SIM'});
 else tarefa=Promise.reject(erro('ACAO_HOMOLOGACAO_INVALIDA'));
 tarefa.then(res=>{
  process.stdout.write('EVIDENCIA_STAGING_SANDBOX='+JSON.stringify(res)+'\n');
 },e=>{
  process.stderr.write('EVIDENCIA_STAGING_FALHOU='+
   String(e.codigo||'FALHA_INTERNA')+'\n');
  process.exitCode=1;
 });
}
module.exports={inspecionarEvento,reconsultarEvento};
