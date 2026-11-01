'use strict';
// GATE MARCO ZERO: observabilidade local + bloqueios explicitos de lancamento.
// Nunca assumir sucesso de CI, homologacao remota, infra ou parecer juridico.
const TABLES=['akitemm_sandbox_cobrancas','akitemm_sandbox_consultas',
 'admin_ponte_compras_demo','admin_contas_participantes_demo'];
// A fila de callbacks é opcional no laboratório, porém sua ausência não é sucesso.
const CALLBACK_TABLES=['akitemm_asaas_sandbox_avisos','akitemm_asaas_callback_fila_lab'];
const EXTERNOS=Object.freeze([
 {id:'CI_HEAD_ATUAL',descricao:'CI integral e navegador no codigo que sera publicado'},
 {id:'ASAAS_REMOTO',descricao:'Checkout e callbacks recebidos do Asaas em ambiente remoto homologado'},
 {id:'BANCO_E_SAQUES',descricao:'Conferência independente de recebimentos, cofres e saques bancarios'},
 {id:'PRODUCAO_E_SEGURANCA',descricao:'Servidor publico, backups testados, monitoramento e revisao de seguranca'},
 {id:'ESCRITORIO_VISUAL',descricao:'Checkout visual final do proprietario em celular e computador'},
 {id:'JURIDICO',descricao:'Parecer juridico independente sobre modelo, contratos, publicidade e dados pessoais'}
]);
function consultarMarcoZeroLab({banco}={}){
 if(!banco||typeof banco.prepare!=='function')
  throw new TypeError('SQLite do laboratorio obrigatorio');
 const presentes=new Set(banco.prepare(
  "SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name));
 const faltando=TABLES.filter(t=>!presentes.has(t));
 const quick=banco.prepare('PRAGMA quick_check').all();
 const sqliteOk=quick.length>0&&quick.every(x=>Object.values(x)[0]==='ok');
 const referenciasQuebradas=banco.prepare('PRAGMA foreign_key_check').all().length;
 let cobrancas=null;
 if(presentes.has('akitemm_sandbox_cobrancas')){
  cobrancas=banco.prepare(`SELECT COUNT(*) AS total,
   COALESCE(SUM(CASE WHEN status='CRIACAO_INDETERMINADA_SANDBOX' THEN 1 ELSE 0 END),0) AS criacoesIndeterminadas,
   COALESCE(SUM(CASE WHEN status='REVERSAO_INFORMADA_SANDBOX' THEN 1 ELSE 0 END),0) AS reversoes,
   COALESCE(SUM(CASE WHEN status NOT IN ('PENDENTE_SANDBOX','RECEBIMENTO_INFORMADO_SANDBOX',
    'REVERSAO_INFORMADA_SANDBOX','CRIACAO_INDETERMINADA_SANDBOX') THEN 1 ELSE 0 END),0) AS estadosDesconhecidos
   FROM akitemm_sandbox_cobrancas`).get();
 }
 let reconsultasNaoConfirmadas=null;
 if(presentes.has('akitemm_sandbox_cobrancas')&&presentes.has('akitemm_sandbox_consultas')){
  reconsultasNaoConfirmadas=banco.prepare(`SELECT COUNT(*) AS n
   FROM akitemm_sandbox_cobrancas c WHERE c.status='RECEBIMENTO_INFORMADO_SANDBOX'
    AND COALESCE((SELECT h.status_asaas FROM akitemm_sandbox_consultas h
      WHERE h.pedido_id=c.pedido_id ORDER BY h.id DESC LIMIT 1),'')<>'RECEIVED'`).get().n;
 }
 // Contar anomalias do inbox/fila somente por leitura SQL. Não reservar jobs,
 // não processar callbacks nem acionar o PSP em consulta administrativa.
 const callbacksDisponiveis=CALLBACK_TABLES.every(t=>presentes.has(t));
 let filaCallbacks=null;
 if(callbacksDisponiveis){
  const estados=banco.prepare(`SELECT
   COUNT(*) AS total,
   COALESCE(SUM(CASE WHEN estado='EXIGE_REVISAO' THEN 1 ELSE 0 END),0) AS exigemRevisao,
   COALESCE(SUM(CASE WHEN estado='PENDENTE' THEN 1 ELSE 0 END),0) AS pendentes,
   COALESCE(SUM(CASE WHEN estado='PROCESSANDO' THEN 1 ELSE 0 END),0) AS processando,
   COALESCE(SUM(CASE WHEN estado='PROCESSANDO' AND
    COALESCE(lease_ate,0)<=? THEN 1 ELSE 0 END),0) AS leasesExpirados
   FROM akitemm_asaas_callback_fila_lab`).get(Date.now());
  const avisosSemJob=banco.prepare(`SELECT COUNT(*) AS n
   FROM akitemm_asaas_sandbox_avisos a WHERE NOT EXISTS(
    SELECT 1 FROM akitemm_asaas_callback_fila_lab f
    WHERE f.evento_id=a.evento_id)`).get().n;
  filaCallbacks={...estados,avisosSemJob};
 }
 const alertasCallbacks=filaCallbacks===null?null:
  filaCallbacks.exigemRevisao+filaCallbacks.leasesExpirados;
 const criticosCobrancas=cobrancas===null||reconsultasNaoConfirmadas===null?null:
  cobrancas.criacoesIndeterminadas+cobrancas.reversoes+
  cobrancas.estadosDesconhecidos+reconsultasNaoConfirmadas;
 const criticos=criticosCobrancas===null?null:
  criticosCobrancas+(alertasCallbacks??0);
 const tecnicos=[
  {id:'INTEGRIDADE_SQLITE',descricao:'Integridade SQLite e chaves estrangeiras',
   estado:sqliteOk&&referenciasQuebradas===0?'OK_LABORATORIO':'ALERTA',
   detalhe:sqliteOk?'Chaves estrangeiras invalidas: '+referenciasQuebradas:'PRAGMA quick_check nao aprovado'},
  {id:'FONTES_SQLITE',descricao:'Livros locais do pagamento, posicoes e clientes',
   estado:faltando.length===0?'OK_LABORATORIO':'FONTE_AUSENTE',
   detalhe:faltando.length===0?'Fontes presentes':'Faltam '+faltando.length+' fontes'},
  {id:'COBRANCAS_SANDBOX',descricao:'Anomalias de cobrancas Sandbox registradas',
   estado:criticosCobrancas===null?'FONTE_AUSENTE':criticosCobrancas>0?'ALERTA':
    cobrancas.total===0?'SEM_OPERACOES':'SEM_ALERTAS_LOCAIS',
   detalhe:criticosCobrancas===null?'Historico nao disponivel':
    'Cobrancas: '+cobrancas.total+'; alertas por criterio: '+criticosCobrancas},
  {id:'CALLBACKS_SANDBOX',descricao:'Fila persistente e avisos de callbacks Sandbox',
   estado:filaCallbacks===null?'FONTE_AUSENTE':alertasCallbacks>0?'ALERTA':
    filaCallbacks.pendentes+filaCallbacks.processando+filaCallbacks.avisosSemJob>0?
     'FILA_PENDENTE':filaCallbacks.total===0?'SEM_OPERACOES':'SEM_ALERTAS_LOCAIS',
   detalhe:filaCallbacks===null?'Inbox ou fila SQLite nao configurada':
    'Revisao: '+filaCallbacks.exigemRevisao+
    '; leases expirados: '+filaCallbacks.leasesExpirados+
    '; avisos sem job: '+filaCallbacks.avisosSemJob+
    '; pendentes: '+filaCallbacks.pendentes}
 ];
 const externos=EXTERNOS.map(x=>({...x,estado:'NAO_COMPROVADO_NESTA_FONTE'}));
 return {
  modo:'MARCO_ZERO_GATE_SQLITE_LAB',ambiente:'LABORATORIO_LOCAL',
  estado:'NAO_LIBERADO_PARA_DIVULGACAO',marcoZeroLiberado:false,
  aptoParaReceberClientesReais:false,aptoParaPagamentosReais:false,
  homologacaoRemotaAsaasComprovada:false,conciliacaoBancariaComprovada:false,
  parecerJuridicoComprovado:false,semMovimentacaoFinanceiraReal:true,
  somenteLeitura:true,percentualAutomatico:null,
  tecnicos,externos,resumo:{
   alertasLocaisPorCriterio:criticos,referenciasQuebradas,
   alertasCallbacks,callbacksSemJob:filaCallbacks?.avisosSemJob??null,
   callbacksPendentes:filaCallbacks?.pendentes??null,
   callbacksLeasesExpirados:filaCallbacks?.leasesExpirados??null,
   callbacksExigemRevisao:filaCallbacks?.exigemRevisao??null,
   tabelasAusentes:faltando.length,
   bloqueiosExternosNaoComprovados:externos.length
  },
  aviso:'Indicadores locais nao substituem CI, PSP remoto, auditoria financeira, infraestrutura ou parecer juridico.'
 };
}
module.exports={consultarMarcoZeroLab};
