'use strict';
// Diagnóstico consolidado do limite entre pré-adesão e motor definitivo.
// NENHUM resultado desta classe confere direito ou altera uma posição.
const {LIMITE_POSICOES_ATIVAS}=require('./capacidade-posicoes-loop');
const ID=/^hom-[a-f0-9-]{36}$/;
const TITULAR=/^titular-[a-f0-9-]{36}$/;
const BLOQUEIOS_FINAIS=Object.freeze([
 'IDENTIDADE_EXTERNA_NAO_HOMOLOGADA',
 'PAGAMENTO_COMERCIAL_NAO_CONCILIADO',
 'CAPACIDADE_REAL_DEZ_POR_TITULAR_NAO_CONFIRMADA',
 'LIMITE_REAL_DUAS_POSICOES_TABULEIRO_NAO_CONFIRMADO',
 'REGRAS_MOTOR_E_FINANCEIRO_NAO_HOMOLOGADAS',
 'AUTORIZACAO_OPERACIONAL_DEFINITIVA_AUSENTE'
]);
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
class DiagnosticoAtivacaoCandidato{
 constructor({banco,preAdesao,cpf=null,contas=null,provedorIdentidade=null}={}){
  if(process.env.NODE_ENV==='production')erro('DIAGNOSTICO_NAO_HOMOLOGADO');
  if(typeof banco?.prepare!=='function'||
    preAdesao?.db!==banco||typeof preAdesao?.avaliar!=='function'||
    (cpf!==null&&(cpf?.banco!==banco||typeof cpf.consultar!=='function'))||
    (contas!==null&&(contas?.banco!==banco||typeof contas.perfil!=='function')))
   erro('FONTES_DIAGNOSTICO_INCOMPATIVEIS');
  if(provedorIdentidade!==null&&(
    provedorIdentidade?.ambiente!=='VERIFICACAO_IDENTIDADE_SANDBOX'||
    typeof provedorIdentidade?.consultarStatus!=='function'))
   erro('PROVEDOR_IDENTIDADE_NAO_HOMOLOGADO');
  this.banco=banco;this.preAdesao=preAdesao;this.cpf=cpf;this.contas=contas;
  this.provedorIdentidade=provedorIdentidade;
 }
 avaliar({prepedidoId,titularId=null}={}){
  if(process.env.NODE_ENV==='production')erro('DIAGNOSTICO_NAO_HOMOLOGADO');
  if(typeof prepedidoId!=='string'||!ID.test(prepedidoId)||
    (titularId!==null&&(typeof titularId!=='string'||!TITULAR.test(titularId))))
   erro('IDENTIFICACAO_PEDIDO_INVALIDA');
  const pre=this.preAdesao.avaliar({prepedidoId,titularId});
  if(!pre)return null;
  // Defesa em profundidade: nunca aceitar um diagnóstico para pedido/titular
  // distinto do consultado, mesmo que uma futura fonte SQLite falhe no filtro.
  if(pre.prepedidoId!==prepedidoId||
    typeof pre.titularId!=='string'||!TITULAR.test(pre.titularId)||
    (titularId!==null&&pre.titularId!==titularId)||
    !Array.isArray(pre.motivos)||
    pre.motivos.some(m=>typeof m!=='string'||!m||m.length>128))
   erro('FONTE_DIAGNOSTICO_INCONSISTENTE');
  // Usa a MESMA conta persistida do checkout e do Escritório; nunca
  // considera "email enviado" equivalente a posse efetivamente provada.
  const perfil=this.contas?this.contas.perfil(pre.titularId):null;
  if(this.contas&&(!perfil||perfil.titularId!==pre.titularId||
    typeof perfil.emailVerificado!=='boolean'))
   erro('FONTE_DIAGNOSTICO_INCONSISTENTE');
  const emailConfirmado=perfil?.emailVerificado===true;
  const bloqueios=new Set(pre.motivos);
  if(this.contas&&!emailConfirmado)
   bloqueios.add('EMAIL_DA_CONTA_NAO_VERIFICADO');
  if(!pre.ensaioRegistrado)bloqueios.add('PRE_ADESAO_AINDA_NAO_PERSISTIDA');
  else if(pre.estado!=='PRE_ADESAO_FICTICIA_PERSISTIDA')
   bloqueios.add('PRE_ADESAO_HISTORICA_EXIGE_REVISAO');
  // Um provedor de teste jamais comprova a identidade externa comercial.
  // Nenhum status do navegador nem da credencial de operador altera esta regra.
  BLOQUEIOS_FINAIS.forEach(codigo=>bloqueios.add(codigo));
  const confirmadoEnsaio=pre.ensaioRegistrado&&
    pre.estado==='PRE_ADESAO_FICTICIA_PERSISTIDA';
  return {
   prepedidoId,
   modo:'DIAGNOSTICO_DE_GATE_SEM_ATIVACAO',
   estado:'BLOQUEADA_PARA_ATIVACAO_DEFINITIVA',
   resumo:{
    preAdesaoDeEnsaioPersistida:pre.ensaioRegistrado,
    emailDaContaVerificadoNoEnsaio:emailConfirmado,
    emailDaContaConferidoNoSQLite:Boolean(this.contas),
    preAdesaoDeEnsaioSemRevisao:confirmadoEnsaio,
    cpfFicticioDeclarado:pre.cpfDeclaradoNoEnsaio===true,
    termosEnsaioConferidos:pre.cpfDeclaradoNoEnsaio===true&&
      !pre.motivos.includes('TERMOS_DO_ENSAIO_DIVERGENTES')&&
      !pre.motivos.includes('EVIDENCIA_HISTORICA_DIVERGENTE'),
    fotografiaOfertaPresente:pre.fotografiaHistoricaConferida===true,
    pspSandboxSemRevisao:!pre.motivos.includes(
      'RECEBIMENTO_PSP_INDEPENDENTE_NAO_VIGENTE')&&
      !pre.motivos.includes('PSP_SANDBOX_NAO_CONFIGURADO'),
    provedorKycTesteConfigurado:!!this.provedorIdentidade,
    identidadeExternaRealConfirmada:false,
    pagamentoComercialConfirmado:false,
    capacidadeMotorRealVerificada:false,
    limitePorTitular:LIMITE_POSICOES_ATIVAS,
    limiteTabuleiroPorTitular:2,
    operacaoFinanceiraHabilitada:false
   },
   bloqueios:[...bloqueios],
   permitidoAtivar:false,
   permitidoMoverFila:false,
   permitidoGirar:false,
   permitidoPagar:false,
   proximaAcao:'HOMOLOGACAO_EXTERNA_IDENTIDADE_PAGAMENTO_REGRAS_CAPACIDADE_E_OPERADOR',
   origem:'PRE_ADESAO_PSP_E_FOTOGRAFIA_MESMO_SQLITE'
  };
 }
}
module.exports={DiagnosticoAtivacaoCandidato,BLOQUEIOS_FINAIS};
