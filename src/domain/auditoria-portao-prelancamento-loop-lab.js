'use strict';
// Portao READ-ONLY de pre-lancamento do LOOP: exige evidencias reais,
// e recusa declarar ambiente local/simulado como pronto para producao.
const {auditarIntegridadeOperacionalDemo}=require('./auditoria-integridade-operacional-demo');
const {auditarExtratoPspFicticioLoop}=require('./auditoria-extrato-psp-ficticio-loop');
const {TAXA_SAQUE_PERCENTUAL}=require('./solicitacoes-saque-demo-sqlite');
const BLOQUEIOS_REAIS=Object.freeze([
 'PROVEDOR_PSP_BANCO_NAO_CONTRATADO_OU_HOMOLOGADO',
 'LIQUIDACAO_E_EXTRATO_BANCARIO_REAIS_NAO_CONCILIADOS',
 'POLITICA_CONSUMIDOR_ESTORNOS_E_TRIBUTOS_NAO_APROVADA',
 'VALIDACAO_JURIDICA_DO_MODELO_COMERCIAL_PENDENTE',
 'CONTROLES_LGPD_SEGURANCA_OPERACIONAL_PENDENTES',
 'INFRAESTRUTURA_BACKUP_OFFSITE_E_RPO_RTO_NAO_HOMOLOGADA',
 'AUTORIZACAO_EXPLICITA_DE_PUBLICACAO_AUSENTE'
]);
function auditarPortaoPrelancamentoLoopLab({ponte,carrinhos=null,eventosExternosFicticios=null}={}){
 if(!ponte?.banco||typeof ponte._restaurar!=='function')
  throw new TypeError('Ponte de laboratorio SQLite obrigatoria');
 const db=ponte.banco;
 const checks=db.prepare('PRAGMA integrity_check').all();
 const integridadeSQLite=checks.length===1&&Object.values(checks[0])[0]==='ok';
 const chaves=db.prepare('PRAGMA foreign_key_check').all();
 const motor=auditarIntegridadeOperacionalDemo(ponte);
 const extrato=carrinhos&&Array.isArray(eventosExternosFicticios)?
  auditarExtratoPspFicticioLoop({carrinhos,eventosExternosFicticios}):null;
 const temTabela=!!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table'
  AND name='admin_conciliacao_pendencias_eventos_lab'`).get();
 const ultimos=temTabela?db.prepare(`SELECT e.pedido_id AS pedidoId,
  e.acao AS acao FROM admin_conciliacao_pendencias_eventos_lab e
  WHERE e.rowid=(SELECT MAX(v.rowid) FROM admin_conciliacao_pendencias_eventos_lab v
    WHERE v.pedido_id=e.pedido_id)`).all():[];
 const emAberto=ultimos.filter(x=>x.acao!=='ENCERRAMENTO').length;
 const riscosLocais=[];
 if(!integridadeSQLite)riscosLocais.push('INTEGRIDADE_SQLITE_DIVERGENTE');
 if(chaves.length)riscosLocais.push('CHAVES_ESTRANGEIRAS_INVALIDAS');
 if(motor.totalAlertas)riscosLocais.push('DIVERGENCIA_DE_POSICOES');
 if(!extrato)riscosLocais.push('EXTRATO_ARTIFICIAL_NAO_CONFERIDO');
 else if(extrato.situacao!=='SEM_DIVERGENCIAS_NESTA_AMOSTRA')
  riscosLocais.push('DIVERGENCIA_DE_CONCILIACAO_FICTICIA');
 if(emAberto)riscosLocais.push('PENDENCIAS_HUMANAS_NAO_ENCERRADAS');
 if(TAXA_SAQUE_PERCENTUAL!==0)riscosLocais.push('TAXA_DE_SAQUE_DIVERGENTE');
 return {
  modo:'PORTAO_AUDITORIA_PRELANCAMENTO_SOMENTE_LABORATORIO',
  integridadeSQLite,violacoesDeChave:chaves.length,
  alertasMotor:motor.totalAlertas,
  conciliacaoFicticia:extrato?.situacao||'NAO_EXECUTADA',
  pendenciasDeTriagemAbertas:emAberto,
  taxaSaqueParticipantePercentual:TAXA_SAQUE_PERCENTUAL,
  riscosLocais,consistenciaLocalDaAmostra:riscosLocais.length===0,
  bloqueiosExternosObrigatorios:[...BLOQUEIOS_REAIS],
  prontoParaProducao:false,autorizacaoFinanceira:false,
  dinheiroRealComprovado:false,publicacaoAutorizada:false,
  registroSomenteLeitura:true
 };
}
module.exports={auditarPortaoPrelancamentoLoopLab,BLOQUEIOS_REAIS};
