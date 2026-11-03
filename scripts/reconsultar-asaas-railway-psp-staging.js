'use strict';
// Operacao UNICA e opcional de reconsulta do PSP em staging Railway.
// Nenhuma cobranca e criada: exclusivamente GET da cobranca Sandbox ja existente.
// Chave Asaas chega cifrada RSA-OAEP de um GitHub Actions com segredo, e fica
// somente em memoria neste processo. Nao monta rota publica.
const fs=require('node:fs');
const path=require('node:path');
const {privateDecrypt,createPrivateKey,constants}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {IntencoesCheckoutSQLite}=require('../src/domain/intencoes-checkout-sqlite');
const {PrePedidosCheckoutStagingSQLite}=require('../src/domain/prepedidos-checkout-staging-sqlite');
const {PontePrepedidoAsaasSandboxStaging}=require('../src/domain/ponte-prepedido-asaas-sandbox-staging');
const {InboxWebhookPrepedidoAsaasStaging}=require('../src/domain/inbox-webhook-prepedido-asaas-staging');
const {ReconsultaWebhookPrepedidoAsaasStaging}=require('../src/domain/reconsulta-webhook-prepedido-asaas-staging');
const {AsaasSandboxLojaV6}=require('../src/domain/asaas-sandbox-loja-v6');
function falhar(codigo){const err=new Error(codigo);err.codigo=codigo;throw err;}
function somenteBase64(s,max){
 if(typeof s!=='string'||s.length<300||s.length>max||
    !/^[a-zA-Z0-9+/]+={0,2}$/.test(s))falhar('ENVELOPE_CIFRADO_INVALIDO');
 return Buffer.from(s,'base64');
}
function decifrarChave({chavePrivadaB64,cifraB64}={}){
 const privada=somenteBase64(chavePrivadaB64,8000);
 const cifra=somenteBase64(cifraB64,2500);
 let texto;
 try{
  const chave=createPrivateKey({key:privada,format:'der',type:'pkcs8'});
  texto=privateDecrypt({key:chave,padding:constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash:'sha256'},cifra);
 }catch{falhar('DECIFRAGEM_RECUSADA');}
 finally{privada.fill(0);cifra.fill(0);}
 const apiKey=texto.toString('utf8');
 texto.fill(0);
 if(!apiKey.startsWith('$aact_hmlg_')||apiKey.length<25||
    apiKey.length>600||/\s/.test(apiKey))
  falhar('CHAVE_NAO_PERTENCE_AO_SANDBOX');
 return apiKey;
}
function arquivoPersistente(env){
 const volume=env.RAILWAY_VOLUME_MOUNT_PATH;
 const arquivo=env.LOOP_RAILWAY_STAGING_SQLITE;
 if(typeof volume!=='string'||typeof arquivo!=='string'||
    !path.isAbsolute(volume)||!path.isAbsolute(arquivo)||
    !arquivo.endsWith('.sqlite')||!fs.existsSync(volume)||!fs.existsSync(arquivo)||
    fs.lstatSync(arquivo).isSymbolicLink()||!fs.statSync(arquivo).isFile())
  falhar('VOLUME_SQLITE_NAO_CONFERIDO');
 const relativo=path.relative(fs.realpathSync(volume),fs.realpathSync(arquivo));
 if(!relativo||relativo==='..'||relativo.startsWith('..'+path.sep)||
    path.isAbsolute(relativo))falhar('SQLITE_FORA_DO_VOLUME');
 return arquivo;
}
async function reconsultar({ambiente=process.env,provedor=null}={}){
 if(process.env.NODE_ENV==='production'||ambiente.NODE_ENV!=='staging'||
    ambiente.LOOP_RAILWAY_STAGING_AUTORIZADO!=='SIM'||
    ambiente.LOOP_RAILWAY_RECONSULTA_AUTORIZADA!=='SIM')
  falhar('STAGING_RECONSULTA_NAO_AUTORIZADA');
 const arquivo=arquivoPersistente(ambiente);
 const banco=new DatabaseSync(arquivo);
 try{
  banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;');
  new IntencoesCheckoutSQLite({banco});
  new PrePedidosCheckoutStagingSQLite({banco});
  const ponte=new PontePrepedidoAsaasSandboxStaging({banco});
  const inbox=new InboxWebhookPrepedidoAsaasStaging({
    banco,token:ambiente.LOOP_RAILWAY_WEBHOOK_TOKEN
  });
  const linhas=banco.prepare([
    'SELECT prepedido_id,titular_id,cliente_asaas_id,valor_centavos,',
    'external_ref,pagamento_id,estado',
    'FROM akitemm_prepedido_asaas_sandbox_staging'
  ].join(' ')).all();
  if(linhas.length!==1)falhar('QUANTIDADE_PREPEDIDOS_INCORRETA');
  const p=linhas[0];
  if(p.valor_centavos!==25000||
     p.pagamento_id!==ambiente.LOOP_RAILWAY_PAGAMENTO_ESPERADO_ID||
     p.prepedido_id!==ambiente.LOOP_RAILWAY_PREPEDIDO_ESPERADO_ID||
     p.cliente_asaas_id!==ambiente.LOOP_RAILWAY_CLIENTE_ESPERADO_ID||
     p.external_ref!=='LOOPLAB-'+p.prepedido_id)
   falhar('CONTRATO_PAGAMENTO_SANDBOX_DIVERGENTE');
  const eventos=banco.prepare([
    'SELECT evento_id,tipo,pagamento_id FROM',
    'akitemm_prepedido_webhook_inbox_staging',
    'WHERE prepedido_id=? ORDER BY recebido_em,evento_id'
  ].join(' ')).all(p.prepedido_id);
  const criados=eventos.filter(e=>e.tipo==='PAYMENT_CREATED');
  const recebidos=eventos.filter(e=>e.tipo==='PAYMENT_RECEIVED');
  if(criados.length!==1||recebidos.length!==1||
     eventos.some(e=>e.pagamento_id!==p.pagamento_id))
   falhar('WEBHOOKS_PERSISTIDOS_DIVERGENTES');
  // Provedor injetado existe SOMENTE para testes de codigo, nao pela CLI.
  if(!provedor){
   const apiKey=decifrarChave({
    chavePrivadaB64:ambiente.LOOP_RAILWAY_RSA_PRIVATE_B64,
    cifraB64:ambiente.LOOP_RAILWAY_ASAAS_CIPHERTEXT_B64
   });
   if(apiKey===ambiente.LOOP_RAILWAY_WEBHOOK_TOKEN)
    falhar('API_KEY_E_TOKEN_WEBHOOK_IGUAIS');
   provedor=new AsaasSandboxLojaV6({apiKey});
  }
  const worker=new ReconsultaWebhookPrepedidoAsaasStaging({banco,inbox,ponte});
  const resultado=await worker.processar({
   eventoId:recebidos[0].evento_id,provedor,execucaoLiberada:true
  });
  const estado=ponte.consultar({
   titularId:p.titular_id,prepedidoId:p.prepedido_id
  });
  const sucesso=resultado.estado==='CONCLUIDO'&&
    resultado.codigo==='PSP_RECONSULTADO'&&
    estado?.estado==='RECEBIMENTO_INFORMADO_SANDBOX'&&
    estado?.ultimaConsultaSandbox?.statusAsaas==='RECEIVED';
  if(!sucesso)falhar('RECONSULTA_PSP_NAO_HOMOLOGADA');
  return {ok:true,estadoReconsulta:resultado.estado,
   estadoPagamentoSandbox:estado.estado,statusPSP:'RECEIVED',
   eventoReceivedUnico:true,consultaReutilizada:resultado.repetido===true,
   prepedidos:linhas.length,eventosPersistidos:eventos.length,
   pagamentoReal:false,saquesReais:0,posicoesReais:0,bonusReais:0};
 }finally{banco.close();}
}
if(require.main===module){
 reconsultar().then(r=>process.stdout.write(
  'LOOP_RAILWAY_PSP_RECONSULTA='+JSON.stringify(r)+'\n'),
 e=>{process.stderr.write('LOOP_RAILWAY_PSP_BLOQUEADO='+
    (e.codigo||'ERRO_OPERACIONAL')+'\n');process.exitCode=1;});
}
module.exports={decifrarChave,reconsultar};
