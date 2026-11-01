'use strict';
// GATE MARCO ZERO: observabilidade local + bloqueios explicitos de lancamento.
// Nunca assumir sucesso de CI, homologacao remota, infra ou parecer juridico.
const TABLES=['akitemm_sandbox_cobrancas','akitemm_sandbox_consultas',
 'admin_ponte_compras_demo','admin_contas_participantes_demo'];
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
 const criticos=cobrancas===null||reconsultasNaoConfirmadas===null?null:
  cobrancas.criacoesIndeterminadas+cobrancas.reversoes+
  cobrancas.estadosDesconhecidos+reconsultasNaoConfirmadas;
 const tecnicos=[
  {id:'INTEGRIDADE_SQLITE',descricao:'Integridade SQLite e chaves estrangeiras',
   estado:sqliteOk&&referenciasQuebradas===0?'OK_LABORATORIO':'ALERTA',
   detalhe:sqliteOk?'Chaves estrangeiras invalidas: '+referenciasQuebradas:'PRAGMA quick_check nao aprovado'},
  {id:'FONTES_SQLITE',descricao:'Livros locais do pagamento, posicoes e clientes',
   estado:faltando.length===0?'OK_LABORATORIO':'FONTE_AUSENTE',
   detalhe:faltando.length===0?'Fontes presentes':'Faltam '+faltando.length+' fontes'},
  {id:'COBRANCAS_SANDBOX',descricao:'Anomalias de cobrancas Sandbox registradas',
   estado:criticos===null?'FONTE_AUSENTE':criticos>0?'ALERTA':
    cobrancas.total===0?'SEM_OPERACOES':'SEM_ALERTAS_LOCAIS',
   detalhe:criticos===null?'Historico nao disponivel':
    'Cobrancas: '+cobrancas.total+'; alertas por criterio: '+criticos}
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
   tabelasAusentes:faltando.length,
   bloqueiosExternosNaoComprovados:externos.length
  },
  aviso:'Indicadores locais nao substituem CI, PSP remoto, auditoria financeira, infraestrutura ou parecer juridico.'
 };
}
module.exports={consultarMarcoZeroLab};
