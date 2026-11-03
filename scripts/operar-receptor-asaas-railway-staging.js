'use strict';
// Operacoes opt-in somente no receptor de HOMOLOGACAO Railway.
// Nunca criar dinheiro real, usar Asaas API ou alterar o motor comercial.
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID,privateDecrypt,createPrivateKey,constants}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {RepositorioCatalogoMemoria}=require('../src/domain/repositorio-catalogo-memoria');
const {cotarCheckoutPublico}=require('../src/domain/cotacao-checkout-publico');
const {IntencoesCheckoutSQLite}=require('../src/domain/intencoes-checkout-sqlite');
const {PrePedidosCheckoutStagingSQLite}=require('../src/domain/prepedidos-checkout-staging-sqlite');
const {PontePrepedidoAsaasSandboxStaging}=require('../src/domain/ponte-prepedido-asaas-sandbox-staging');
const {InboxWebhookPrepedidoAsaasStaging}=require('../src/domain/inbox-webhook-prepedido-asaas-staging');
const {AsaasSandboxLojaV6}=require('../src/domain/asaas-sandbox-loja-v6');
const {ReconsultaWebhookPrepedidoAsaasStaging}=require('../src/domain/reconsulta-webhook-prepedido-asaas-staging');
function erro(m){throw Error('RAILWAY_SANDBOX_OPERACAO_'+m);}
const GET={INSPECIONAR:true};
const WRITE={PREPARAR:true,MARCAR_ENVIO:true,VINCULAR:true,RECONCILIAR:true,RECONSULTAR:true};
function decifrarChaveSandbox(privadaB64,cifraB64){
 if(typeof privadaB64!=='string'||typeof cifraB64!=='string'||
    privadaB64.length<1500||privadaB64.length>5000||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(privadaB64)||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(cifraB64)||
    cifraB64.length<300||cifraB64.length>1500)
  erro('CREDENCIAL_CIFRADA_INVALIDA');
 let bytes;
 try{
  const chave=createPrivateKey({key:Buffer.from(privadaB64,'base64'),
    format:'der',type:'pkcs8'});
  bytes=privateDecrypt({key:chave,padding:constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash:'sha256'},Buffer.from(cifraB64,'base64'));
 }catch{erro('NAO_FOI_POSSIVEL_DECIFRAR');}
 const texto=bytes.toString('utf8');bytes.fill(0);
 if(!texto.startsWith('$aact_hmlg_')||texto.length<25||texto.length>200||
    /\s/.test(texto))erro('CHAVE_NAO_E_SOMENTE_SANDBOX');
 return texto;
}
async function executar({ambiente=process.env}={}){
 const acao=ambiente.LOOP_RAILWAY_OPERACAO_ACAO||'INSPECIONAR';
 if(ambiente.NODE_ENV!=='staging'||process.env.NODE_ENV==='production'||
    ambiente.LOOP_RAILWAY_STAGING_AUTORIZADO!=='SIM'||
    ambiente.LOOP_RAILWAY_OPERACAO_AUTORIZADA!=='SIM'||(!GET[acao]&&!WRITE[acao]))
  erro('NAO_AUTORIZADA');
 if(WRITE[acao]&&ambiente.LOOP_RAILWAY_OPERACAO_ESCRITA!=='SIM')
  erro('ESCRITA_BLOQUEADA');
 const dir=ambiente.RAILWAY_VOLUME_MOUNT_PATH;
 const file=ambiente.LOOP_RAILWAY_STAGING_SQLITE;
 if(!dir||!path.isAbsolute(dir)||!file||!path.isAbsolute(file)||
    !file.endsWith('.sqlite')||!fs.existsSync(file)||
    fs.lstatSync(file).isSymbolicLink()||!fs.statSync(file).isFile()||
    !fs.statSync(dir).isDirectory())erro('VOLUME_INVALIDO');
 const base=fs.realpathSync(dir),real=fs.realpathSync(file);
 const rel=path.relative(base,real);
 if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))
  erro('SQLITE_FORA_VOLUME');
 const banco=new DatabaseSync(file);
 try{
  banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;');
  new IntencoesCheckoutSQLite({banco});
  const pre=new PrePedidosCheckoutStagingSQLite({banco});
  const ponte=new PontePrepedidoAsaasSandboxStaging({banco});
  const token=ambiente.LOOP_RAILWAY_WEBHOOK_TOKEN;
  const inbox=new InboxWebhookPrepedidoAsaasStaging({banco,token});
  const q=()=>banco.prepare('SELECT prepedido_id,titular_id,cliente_asaas_id,valor_centavos,external_ref,pagamento_id,estado FROM akitemm_prepedido_asaas_sandbox_staging ORDER BY criado_em LIMIT 2').all();
  let linhas=q(),feito='SOMENTE_LEITURA';
  if(acao==='PREPARAR'){
   const cliente=ambiente.ASAAS_SANDBOX_CLIENTE_TESTE_ID;
   if(typeof cliente!=='string'||!/^cus_[A-Za-z0-9_-]{5,90}$/.test(cliente))
    erro('CLIENTE_ID_INVALIDO');
   if(linhas.length>1||linhas.some(x=>x.cliente_asaas_id!==cliente||x.valor_centavos!==25000))
    erro('PEDIDO_EXISTENTE_DIVERGENTE');
   if(!linhas.length){
    const existentes=banco.prepare('SELECT COUNT(*) n FROM akitemm_checkout_prepedidos_staging').get().n;
    const rascunhos=banco.prepare('SELECT COUNT(*) n FROM akitemm_checkout_intencoes_preparacao').get().n;
    if(existentes!==0||rascunhos!==0)erro('BASE_NAO_VAZIA');
    const titularId='titular-hom-'+randomUUID();
    const catalogo=new RepositorioCatalogoMemoria({produtos:[{
      id:'pdf-homologacao-webhook-250',nome:'PDF Ficticio de Homologacao',
      tipo:'PDF',estado:'PUBLICADO',descricao:'Ensaio sem venda real.',
      precoCentavos:25000,entrega:'DOWNLOAD_APOS_CONFIRMACAO',
      fotos:[],detalhes:[],videoApresentacaoUrl:null
    }]});
    const entrada={itens:[{produtoId:'pdf-homologacao-webhook-250',quantidade:1}]};
    const cotacao=await cotarCheckoutPublico({repositorio:catalogo,entrada});
    if(cotacao.totalCentavos!==25000)erro('PRECO_DIVERGENTE');
    const ras=new IntencoesCheckoutSQLite({banco}).criar({
      titularId,chaveIdempotencia:'railway-test-'+randomUUID(),entrada,cotacao
    });
    const p=await pre.preparar({titularId,
      rascunhoId:ras.intencao.pedidoId,repositorioCatalogo:catalogo});
    ponte.preparar({titularId,prepedidoId:p.prepedido.prepedidoId,clienteAsaasId:cliente});
    feito='PREPEDIDO_FICTICIO_PREPARADO';
   }else feito='PREPEDIDO_EXISTENTE_PRESERVADO';
  }
  linhas=q();
  if(linhas.length>1)erro('MAIS_DE_UM_PEDIDO');
  if(['MARCAR_ENVIO','VINCULAR','RECONCILIAR'].includes(acao)&&linhas.length!==1)
   erro('PREPEDIDO_INEXISTENTE');
  const row=linhas[0]||null;
  if(acao==='MARCAR_ENVIO'){
    if(row.valor_centavos!==25000)erro('VALOR_INCORRETO');
    if(row.estado==='PREPARADA'&&row.pagamento_id===null){
      banco.exec('BEGIN IMMEDIATE');
      try{
       const mud=banco.prepare("UPDATE akitemm_prepedido_asaas_sandbox_staging SET estado='CRIACAO_INDETERMINADA',atualizado_em=? WHERE prepedido_id=? AND estado='PREPARADA' AND pagamento_id IS NULL").run(new Date().toISOString(),row.prepedido_id);
       if(mud.changes!==1)erro('CONCORRENCIA');
       banco.exec('COMMIT');
      }catch(e){banco.exec('ROLLBACK');throw e;}
      feito='ENVIO_EXTERN0_RESERVADO_SEM_POST';
    }else if(row.estado==='CRIACAO_INDETERMINADA')feito='RESERVA_JA_EXISTE_NAO_REPETIR_POST';
    else erro('ENVIO_NAO_PERMITIDO');
  }
  if(acao==='VINCULAR'){
    const pagamento=ambiente.LOOP_RAILWAY_PAGAMENTO_SANDBOX_ID;
    if(typeof pagamento!=='string'||!/^pay_[A-Za-z0-9_-]{5,90}$/.test(pagamento))
      erro('PAGAMENTO_ID_INVALIDO');
    if(row.valor_centavos!==25000)erro('VALOR_INCORRETO');
    if(row.pagamento_id===pagamento)feito='PAGAMENTO_JA_VINCULADO';
    else if(row.estado==='CRIACAO_INDETERMINADA'&&!row.pagamento_id){
     // O operador deve confirmar por GET independente no Asaas (workflow separado)
     // antes de injetar o ID aqui. Este comando NAO atribui status RECEIVED.
     banco.exec('BEGIN IMMEDIATE');
     try{
      const mud=banco.prepare("UPDATE akitemm_prepedido_asaas_sandbox_staging SET pagamento_id=?,estado='PENDENTE_SANDBOX',atualizado_em=? WHERE prepedido_id=? AND estado='CRIACAO_INDETERMINADA' AND pagamento_id IS NULL").run(pagamento,new Date().toISOString(),row.prepedido_id);
      if(mud.changes!==1)erro('CONCORRENCIA');
      banco.exec('COMMIT');
     }catch(e){banco.exec('ROLLBACK');throw e;}
     feito='PAGAMENTO_PENDENTE_VINCULADO_SEM_CREDITO';
    }else erro('PAGAMENTO_VINCULO_DIVERGENTE');
  }
  if(acao==='RECONSULTAR'){
   if(row.pagamento_id===null||row.estado!=='PENDENTE_SANDBOX')
    erro('PAGAMENTO_NAO_VINCULADO');
   const evento=banco.prepare([
     'SELECT evento_id FROM akitemm_prepedido_webhook_inbox_staging',
     "WHERE prepedido_id=? AND pagamento_id=? AND tipo='PAYMENT_RECEIVED'",
     'ORDER BY recebido_em,evento_id LIMIT 2'
   ].join(' ')).all(row.prepedido_id,row.pagamento_id);
   if(evento.length!==1)erro('EVENTO_RECEIVED_INEXISTENTE_OU_DUPLICADO');
   const apiKey=decifrarChaveSandbox(ambiente.LOOP_RAILWAY_PSP_PRIVATE_KEY_B64,
     ambiente.LOOP_RAILWAY_PSP_CIPHERTEXT_B64);
   const worker=new ReconsultaWebhookPrepedidoAsaasStaging({banco,inbox,ponte});
   const provedor=new AsaasSandboxLojaV6({apiKey});
   const resultado=await worker.processar({eventoId:evento[0].evento_id,
     provedor,execucaoLiberada:true});
   const situacao=ponte.consultar({titularId:row.titular_id,
     prepedidoId:row.prepedido_id});
   if(resultado.estado!=='CONCLUIDO'||resultado.codigo!=='PSP_RECONSULTADO'||
      situacao?.ultimaConsultaSandbox?.statusAsaas!=='RECEIVED'||
      situacao.estado!=='RECEBIMENTO_INFORMADO_SANDBOX')
    erro('PSP_DIVERGENTE_REVISAR');
   feito='PSP_GET_SANDBOX_REAL_OK_RECEIVED_EVENTO_CONCLUIDO_SEM_CREDITO';
  }
  if(acao==='RECONCILIAR'||acao==='VINCULAR'){
    const r=inbox.reconciliarAntecipados({execucaoLiberada:true,limite:50});
    feito+=';ANTECIPADOS_VINCULADOS='+r.vinculados+
      ';DIVERGENTES='+r.divergentes+';AGUARDANDO='+r.aguardandoVinculo;
  }
  const a=q()[0]||null;
  const tipos=banco.prepare('SELECT tipo,COUNT(*) total FROM akitemm_prepedido_webhook_inbox_staging GROUP BY tipo').all();
  const antecipados=banco.prepare('SELECT COUNT(*) n FROM akitemm_prepedido_webhook_antecipados_staging').get().n;
  const consultas=banco.prepare('SELECT status_asaas,estado_local FROM akitemm_prepedido_asaas_consultas_staging ORDER BY id DESC LIMIT 1').get()||null;
  const houveWorker=banco.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='akitemm_prepedido_webhook_reconsulta_staging'").get();
  const processados=houveWorker?banco.prepare('SELECT estado,COUNT(*) n FROM akitemm_prepedido_webhook_reconsulta_staging GROUP BY estado').all():[];
  const out={acao,feito,pedidos:q().length,
   prepedidoId:a?.prepedido_id||null,titularId:a?.titular_id||null,
   clienteAsaasId:a?.cliente_asaas_id||null,externalReference:a?.external_ref||null,
   valorCentavos:a?.valor_centavos||null,pagamentoSandboxId:a?.pagamento_id||null,
   estado:a?.estado||null,tipos,antecipados,ultimaConsultaPSP:consultas?.status_asaas||null,processados,
   pagamentosReais:0,posicoesReaisCriadas:0,saquesReais:0};
  return out;
 }finally{banco.close();}
}
if(require.main===module){
 executar().then(x=>process.stdout.write('LOOP_RAILWAY_OPERACAO='+JSON.stringify(x)+'\n'),
 e=>{process.stderr.write('LOOP_RAILWAY_OPERACAO_BLOQUEADA='+
   String(e.message||'FALHA')+'\n');process.exitCode=1;});
}
module.exports={executar,decifrarChaveSandbox};
