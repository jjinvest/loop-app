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
 constructor({banco,inbox,ponte,agora=()=>new Date().toISOString(),
  agoraMs=()=>Date.now()}={}){
  if(process.env.NODE_ENV==='production')
   throw falha('RECONSULTA_STAGING_PROIBIDA_EM_PRODUCAO');
  if(typeof banco?.prepare!=='function'||inbox?.banco!==banco||
     !(ponte instanceof PontePrepedidoAsaasSandboxStaging)||ponte.banco!==banco)
   throw new TypeError('Worker exige mesma inbox e ponte SQLite de staging');
  if(typeof agoraMs!=='function')throw new TypeError('Relogio de recuperacao obrigatorio');
  this.banco=banco;this.inbox=inbox;this.ponte=ponte;this.agora=agora;
  this.agoraMs=agoraMs;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS akitemm_prepedido_webhook_reconsulta_staging(',
   'evento_id TEXT PRIMARY KEY REFERENCES',
   'akitemm_prepedido_webhook_inbox_staging(evento_id) ON DELETE RESTRICT,',
   "estado TEXT NOT NULL CHECK(estado IN ('PROCESSANDO','CONCLUIDO','EXIGE_REVISAO')),",
   'codigo TEXT NOT NULL,iniciado_em TEXT NOT NULL,finalizado_em TEXT);',
   'CREATE TRIGGER IF NOT EXISTS prepedido_webhook_reconsulta_no_delete',
   'BEFORE DELETE ON akitemm_prepedido_webhook_reconsulta_staging',
   "BEGIN SELECT RAISE(ABORT,'historico de reconsulta imutavel'); END;",
   'CREATE TABLE IF NOT EXISTS akitemm_prepedido_webhook_recuperacoes_staging(',
   'evento_id TEXT PRIMARY KEY REFERENCES',
   'akitemm_prepedido_webhook_reconsulta_staging(evento_id) ON DELETE RESTRICT,',
   'codigo TEXT NOT NULL,registrado_em TEXT NOT NULL);',
   'CREATE TRIGGER IF NOT EXISTS prepedido_webhook_recuperacao_no_update',
   'BEFORE UPDATE ON akitemm_prepedido_webhook_recuperacoes_staging',
   "BEGIN SELECT RAISE(ABORT,'auditoria recuperacao imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS prepedido_webhook_recuperacao_no_delete',
   'BEFORE DELETE ON akitemm_prepedido_webhook_recuperacoes_staging',
   "BEGIN SELECT RAISE(ABORT,'auditoria recuperacao imutavel'); END;"
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
 // Recuperacao conservadora de callbacks que ficaram PROCESSANDO apos
 // queda. Exige intervencao explicita, janela de seguranca e nao executa
 // GET/POST remoto. O operador revalida o PSP em fluxo independente.
 recuperarTravados({execucaoLiberada=false,idadeMinimaMs=60000,limite=50}={}){
  if(process.env.NODE_ENV==='production')
   throw falha('RECONSULTA_STAGING_PROIBIDA_EM_PRODUCAO');
  if(execucaoLiberada!==true)throw falha('RECUPERACAO_NAO_AUTORIZADA');
  if(!Number.isSafeInteger(idadeMinimaMs)||idadeMinimaMs<60000||
     idadeMinimaMs>7*86400000||!Number.isSafeInteger(limite)||
     limite<1||limite>100)
   throw falha('LIMITE_RECUPERACAO_INVALIDO');
  const instante=this.agoraMs();
  if(!Number.isSafeInteger(instante)||instante<0)
   throw falha('RELOGIO_RECUPERACAO_INVALIDO');
  const banco=this.banco;
  banco.exec('BEGIN IMMEDIATE');
  try{
   const candidatos=banco.prepare([
    'SELECT evento_id,iniciado_em,codigo FROM',
    'akitemm_prepedido_webhook_reconsulta_staging',
    "WHERE estado='PROCESSANDO' ORDER BY iniciado_em,evento_id LIMIT ?"
   ].join(' ')).all(limite);
   const recuperados=[],reinterrompidos=[];
   for(const item of candidatos){
    const inicio=Date.parse(item.iniciado_em);
    if(!Number.isFinite(inicio)||inicio>instante||
       instante-inicio<idadeMinimaMs)continue;
    // Segunda queda no mesmo evento nunca inicia terceira consulta
    // automaticamente. Requer revisao independente pelo operador.
    const anterior=banco.prepare([
     'SELECT 1 AS existe FROM akitemm_prepedido_webhook_recuperacoes_staging',
     'WHERE evento_id=?'
    ].join(' ')).get(item.evento_id);
    const reinterrupcao=Boolean(anterior)||item.codigo==='RECONSULTA_RETOMADA';
    const codigo=reinterrupcao?
     'RETOMADA_REINTERROMPIDA_EXIGE_REVISAO':
     'PROCESSAMENTO_INTERROMPIDO_REVISAR';
    const mudou=banco.prepare([
     'UPDATE akitemm_prepedido_webhook_reconsulta_staging',
     "SET estado='EXIGE_REVISAO',codigo=?,",
     "finalizado_em=? WHERE evento_id=? AND estado='PROCESSANDO'"
    ].join(' ')).run(codigo,this.agora(),item.evento_id).changes;
    if(!mudou)continue;
    if(reinterrupcao){
     reinterrompidos.push(item.evento_id);
     continue;
    }
    banco.prepare([
     'INSERT INTO akitemm_prepedido_webhook_recuperacoes_staging',
     '(evento_id,codigo,registrado_em) VALUES(?,?,?)'
    ].join(' ')).run(item.evento_id,codigo,this.agora());
    recuperados.push(item.evento_id);
   }
   banco.exec('COMMIT');
   return {recuperados:recuperados.length,eventos:recuperados,
    reinterrompidos:reinterrompidos.length,
    reenvioWebhook:false,novaCobranca:false,
    reconsultaRemotaExecutada:false,exigeRevisaoManual:true,
    pagamentoReal:false,posicoesCriadas:0};
  }catch(e){banco.exec('ROLLBACK');throw e;}
 }
 // Fila de revisao visivel ao operador. Apenas registros operacionais
 // sem payload do PSP, nomes, CPF, senhas nem consultas remotas.
 pendencias({limite=50}={}){
  if(!Number.isSafeInteger(limite)||limite<1||limite>100)
   throw falha('LIMITE_RECUPERACAO_INVALIDO');
  return this.banco.prepare([
   'SELECT a.evento_id AS eventoId,',
   "COALESCE(r.estado,'PENDENTE') AS estado,",
   "COALESCE(r.codigo,'SEM_RECONSULTA') AS codigo",
   'FROM akitemm_prepedido_webhook_inbox_staging a',
   'LEFT JOIN akitemm_prepedido_webhook_reconsulta_staging r',
   'ON r.evento_id=a.evento_id',
   "WHERE r.estado IS NULL OR r.estado IN ('PROCESSANDO','EXIGE_REVISAO')",
   'ORDER BY a.recebido_em,a.evento_id LIMIT ?'
  ].join(' ')).all(limite).map(row=>({...row}));
 }
 // Paginacao por cursor estável de recebimento/ID, não por OFFSET.
 // O cursor identifica um evento da inbox, sem revelar dados do PSP;
 // itens já concluídos não reaparecem mesmo quando a fila muda.
 paginarPendencias({limite=50,apos=null}={}){
  if(process.env.NODE_ENV==='production')
   throw falha('RECONSULTA_STAGING_PROIBIDA_EM_PRODUCAO');
  if(!Number.isSafeInteger(limite)||limite<1||limite>100||
     (apos!==null&&(typeof apos!=='string'||!EVENTO.test(apos))))
   throw falha('CURSOR_PENDENCIAS_INVALIDO');
  let cursor=null;
  if(apos!==null){
   cursor=this.banco.prepare([
    'SELECT recebido_em AS recebidoEm FROM',
    'akitemm_prepedido_webhook_inbox_staging WHERE evento_id=?'
   ].join(' ')).get(apos);
   if(!cursor)throw falha('CURSOR_PENDENCIAS_INVALIDO');
  }
  const filtroCursor=cursor
   ?'AND (a.recebido_em>? OR (a.recebido_em=? AND a.evento_id>?))'
   :'';
  const argumentos=cursor
   ?[cursor.recebidoEm,cursor.recebidoEm,apos,limite+1]
   :[limite+1];
  const linhas=this.banco.prepare([
   'SELECT a.evento_id AS eventoId,',
   "COALESCE(r.estado,'PENDENTE') AS estado,",
   "COALESCE(r.codigo,'SEM_RECONSULTA') AS codigo",
   'FROM akitemm_prepedido_webhook_inbox_staging a',
   'LEFT JOIN akitemm_prepedido_webhook_reconsulta_staging r',
   'ON r.evento_id=a.evento_id',
   "WHERE (r.estado IS NULL OR r.estado IN ('PROCESSANDO','EXIGE_REVISAO'))",
   filtroCursor,
   'ORDER BY a.recebido_em,a.evento_id LIMIT ?'
  ].filter(Boolean).join(' ')).all(...argumentos).map(item=>({...item}));
  const haMais=linhas.length>limite;
  const pendencias=linhas.slice(0,limite);
  return {pendencias,haMais,
   proximoCursor:haMais?pendencias[pendencias.length-1].eventoId:null};
 }
 // Contagem completa, independente do limite de 50 itens da lista. Evita
 // ocultar um acúmulo de callbacks em caso de incidente operacional.
 // Apenas estados e contagens: nenhum dado do comprador ou do PSP.
 resumoPendencias(){
  if(process.env.NODE_ENV==='production')
   throw falha('RECONSULTA_STAGING_PROIBIDA_EM_PRODUCAO');
  const linhas=this.banco.prepare([
   "SELECT COALESCE(r.estado,'PENDENTE') AS estado,COUNT(*) AS n",
   'FROM akitemm_prepedido_webhook_inbox_staging a',
   'LEFT JOIN akitemm_prepedido_webhook_reconsulta_staging r',
   'ON r.evento_id=a.evento_id',
   "WHERE r.estado IS NULL OR r.estado IN ('PROCESSANDO','EXIGE_REVISAO')",
   "GROUP BY COALESCE(r.estado,'PENDENTE')"
  ].join(' ')).all();
  const resumo={pendentes:0,processando:0,exigeRevisao:0,total:0};
  for(const linha of linhas){
   const n=Number(linha.n);
   if(linha.estado==='PENDENTE')resumo.pendentes=n;
   else if(linha.estado==='PROCESSANDO')resumo.processando=n;
   else if(linha.estado==='EXIGE_REVISAO')resumo.exigeRevisao=n;
   resumo.total+=n;
  }
  return resumo;
 }

 async processar({eventoId,provedor,execucaoLiberada=false,
  retomadaSegura=false}={}){
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
  let titularId,retomada=false;
  try{
   const anterior=this.consultar(eventoId);
   // Retomar apenas a interrupcao recuperada com checkpoint persistido.
   // Erros PSP e reversoes que exigem revisao nao sao reprocessados
   // automaticamente, mesmo que o agendador tente novamente.
   retomada=retomadaSegura===true&&
    anterior?.estado==='EXIGE_REVISAO'&&
    anterior.codigo==='PROCESSAMENTO_INTERROMPIDO_REVISAR';
   if(anterior&&!retomada){
    b.exec('COMMIT');
    return {repetido:true,eventoId,estado:anterior.estado,
     codigo:anterior.codigo,pagamentoReal:false,posicoesCriadas:0};
   }
   const fonte=b.prepare([
    'SELECT titular_id,pagamento_id,valor_centavos FROM',
    'akitemm_prepedido_asaas_sandbox_staging WHERE prepedido_id=?'
   ].join(' ')).get(aviso.prepedidoId);
   // Valor 0 indica que o webhook nao informou centavos. O vinculo
   // foi conferido pelo pagamento_id no recebimento; PSP reconsulta valor.
   if(!fonte||fonte.pagamento_id!==aviso.pagamentoId||
     (aviso.valorAvisadoCentavos!==0&&
      fonte.valor_centavos!==aviso.valorAvisadoCentavos))
    throw falha('VINCULO_SANDBOX_DIVERGENTE');
   titularId=fonte.titular_id;
   if(retomada){
    // BEGIN IMMEDIATE confere exclusividade entre workers e instancias.
    const checkpoint=b.prepare([
     'SELECT 1 AS valido FROM akitemm_prepedido_webhook_recuperacoes_staging',
     "WHERE evento_id=? AND codigo='PROCESSAMENTO_INTERROMPIDO_REVISAR'"
    ].join(' ')).get(eventoId);
    if(!checkpoint)throw falha('RETOMADA_SEM_CHECKPOINT_DURAVEL');
    const alteradas=b.prepare([
     'UPDATE akitemm_prepedido_webhook_reconsulta_staging',
     "SET estado='PROCESSANDO',codigo='RECONSULTA_RETOMADA',",
     'iniciado_em=?,finalizado_em=NULL',
     "WHERE evento_id=? AND estado='EXIGE_REVISAO'",
     "AND codigo='PROCESSAMENTO_INTERROMPIDO_REVISAR'"
    ].join(' ')).run(this.agora(),eventoId).changes;
    if(alteradas!==1)throw falha('RETOMADA_EXCLUSIVA_NAO_OBTIDA');
   }else{
    b.prepare([
     'INSERT INTO akitemm_prepedido_webhook_reconsulta_staging',
     "(evento_id,estado,codigo,iniciado_em) VALUES(?,'PROCESSANDO','RECONSULTA',?)"
    ].join(' ')).run(eventoId,this.agora());
   }
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
   const atualizado=b.prepare([
    'UPDATE akitemm_prepedido_webhook_reconsulta_staging',
    'SET estado=?,codigo=?,finalizado_em=?',
    "WHERE evento_id=? AND estado='PROCESSANDO'"
   ].join(' ')).run(situacao,codigo,this.agora(),eventoId).changes;
   if(!atualizado){
    const recuperado=this.consultar(eventoId);
    b.exec('COMMIT');
    return {repetido:true,eventoId,estado:recuperado?.estado??'EXIGE_REVISAO',
     codigo:recuperado?.codigo??'PROCESSAMENTO_INTERROMPIDO_REVISAR',
     revisaoManualObrigatoria:true,pagamentoReal:false,
     posicoesCriadas:0,bonusGerados:0,saqueRealAutorizado:false};
   }
   b.exec('COMMIT');
  }catch(e){b.exec('ROLLBACK');throw e;}
  return {repetido:false,eventoId,estado:situacao,codigo,
   retomadaDeInterrupcao:retomada,
   pagamentoReal:false,posicoesCriadas:0,bonusGerados:0,
   saqueRealAutorizado:false};
 }
}
module.exports={ReconsultaWebhookPrepedidoAsaasStaging};
