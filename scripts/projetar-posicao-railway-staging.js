'use strict';
// Projeta EXATAMENTE 1 posicao ficticia apos RECEIVED ja reconsultado no
// MESMO SQLite do receptor HTTPS de staging. Nenhum motor real e acionado.
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {IntencoesCheckoutSQLite}=require('../src/domain/intencoes-checkout-sqlite');
const {PrePedidosCheckoutStagingSQLite}=require('../src/domain/prepedidos-checkout-staging-sqlite');
const {PontePrepedidoAsaasSandboxStaging}=require('../src/domain/ponte-prepedido-asaas-sandbox-staging');
const {PosicoesPendentesCheckoutSandboxStaging}=
 require('../src/domain/posicoes-pendentes-checkout-sandbox-staging');
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function validarArquivo(env){
 const volume=env.RAILWAY_VOLUME_MOUNT_PATH,arquivo=env.LOOP_RAILWAY_STAGING_SQLITE;
 if(typeof volume!=='string'||typeof arquivo!=='string'||
    !path.isAbsolute(volume)||!path.isAbsolute(arquivo)||
    !arquivo.endsWith('.sqlite')||!fs.existsSync(volume)||!fs.existsSync(arquivo)||
    fs.lstatSync(arquivo).isSymbolicLink()||!fs.statSync(arquivo).isFile()||
    !fs.statSync(volume).isDirectory())falha('SQLITE_STAGING_FORA_DE_VOLUME');
 const rel=path.relative(fs.realpathSync(volume),fs.realpathSync(arquivo));
 if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))
  falha('SQLITE_STAGING_FORA_DE_VOLUME');
 return arquivo;
}
function projetar({ambiente=process.env}={}){
 if(process.env.NODE_ENV==='production'||ambiente.NODE_ENV!=='staging'||
    ambiente.LOOP_RAILWAY_STAGING_AUTORIZADO!=='SIM'||
    ambiente.LOOP_RAILWAY_PROJECAO_AUTORIZADA!=='SIM')
  falha('PROJECAO_RAILWAY_NAO_AUTORIZADA');
 const banco=new DatabaseSync(validarArquivo(ambiente));
 try{
  banco.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;');
  new IntencoesCheckoutSQLite({banco});
  new PrePedidosCheckoutStagingSQLite({banco});
  const ponte=new PontePrepedidoAsaasSandboxStaging({banco});
  const projecao=new PosicoesPendentesCheckoutSandboxStaging({banco,ponte});
  const cobrancas=banco.prepare([
   'SELECT a.prepedido_id,a.titular_id,a.pagamento_id,',
   'a.valor_centavos,a.estado,p.total_centavos',
   'FROM akitemm_prepedido_asaas_sandbox_staging a',
   'JOIN akitemm_checkout_prepedidos_staging p ON p.prepedido_id=a.prepedido_id'
  ].join(' ')).all();
  if(cobrancas.length!==1)falha('QUANTIDADE_COBRANCAS_DIVERGENTE');
  const p=cobrancas[0];
  if(p.prepedido_id!==ambiente.LOOP_RAILWAY_PREPEDIDO_ESPERADO_ID||
     p.pagamento_id!==ambiente.LOOP_RAILWAY_PAGAMENTO_ESPERADO_ID||
     p.valor_centavos!==25000||p.total_centavos!==25000||
     p.estado!=='RECEBIMENTO_INFORMADO_SANDBOX')
   falha('RECEBIMENTO_SANDBOX_NAO_CONCILIADO');
  const eventos=banco.prepare([
   'SELECT a.evento_id,a.tipo,a.pagamento_id,',
   'r.estado AS status_reconsulta,r.codigo',
   'FROM akitemm_prepedido_webhook_inbox_staging a',
   'LEFT JOIN akitemm_prepedido_webhook_reconsulta_staging r',
   'ON r.evento_id=a.evento_id',
   'WHERE a.prepedido_id=? ORDER BY a.recebido_em,a.evento_id'
  ].join(' ')).all(p.prepedido_id);
  const recebidos=eventos.filter(e=>e.tipo==='PAYMENT_RECEIVED'&&
     e.pagamento_id===p.pagamento_id&&e.status_reconsulta==='CONCLUIDO'&&
     e.codigo==='PSP_RECONSULTADO');
  if(recebidos.length!==1||eventos.some(e=>e.pagamento_id!==p.pagamento_id))
   falha('WEBHOOK_NAO_RECONSULTADO_DE_FORMA_UNICA');
  // A classe verifica novamente status PSP, titular e valor dentro da transacao.
  const r=projecao.projetar({titularId:p.titular_id,
   prepedidoId:p.prepedido_id,eventoId:recebidos[0].evento_id,
   execucaoLiberada:true});
  const count=banco.prepare([
   'SELECT COUNT(*) AS n FROM akitemm_prepedido_posicoes_pendentes_sandbox_staging'
  ].join(' ')).get().n;
  if(count!==1||r.pendente?.quantidadePosicoesPendentesSimuladas!==1||
     r.pendente?.posicoesReaisCriadas!==0||
     r.pendente?.permissaoConfirmarCPF!==false||
     r.pendente?.estado!=='PENDENTE_DE_CONFIRMACAO_CLIENTE_SANDBOX')
   falha('POSICAO_FICTICIA_DIVERGENTE');
  if(banco.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||
     banco.prepare('PRAGMA foreign_key_check').all().length)
   falha('INTEGRIDADE_SQLITE_INVALIDA');
  return {estado:'UMA_POSICAO_PENDENTE_APENAS_SANDBOX',
   idempotencia:r.repetido?'REPLAY_SEM_NOVA_POSICAO':'CRIACAO_UNICA',
   posicoesPendentesSimuladas:count,posicoesReais:0,cpfConfirmavel:false,
   pagamentosReais:0,bonusReais:0,saquesReais:0,girosReais:0,
   eventoReconsultado:true,sqliteIntegro:true};
 }finally{banco.close();}
}
if(require.main===module){
 try{process.stdout.write('LOOP_RAILWAY_POSICAO_SIMULADA='+
  JSON.stringify(projetar())+'\n');}
 catch(e){process.stderr.write('LOOP_RAILWAY_POSICAO_BLOQUEADA='+
  (e.codigo||'FALHA_INTERNA')+'\n');process.exitCode=1;}
}
module.exports={projetar};
