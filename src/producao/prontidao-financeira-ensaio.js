'use strict';
// Auditoria pré-homologação do fluxo financeiro simulado. NÃO autoriza
// operação real, mesmo que todo dado injetado diga que está validado.
// Bancos reais exigem contratos, certificados e consulta autenticada real.
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
const EXTERNOS=Object.freeze([
 'CNPJ_EMPRESA_ATIVO_E_KYC_VALIDADO',
 'CONTRATO_PSP_RECEBEDOR_E_PRODUTO_SPLIT_APROVADOS',
 'CONTRATO_EXECUTOR_PIX_OUT_APROVADO',
 'CONTRATO_CONTA_INTER_E_REPASSES_APROVADOS',
 'CONTRATO_CONTA_MERCADO_PAGO_E_EXTRATOS_APROVADOS',
 'CONTRATO_TERCEIRO_BANCO_E_COFRES_APROVADOS',
 'CREDENCIAIS_E_CERTIFICADOS_SEGREGADOS',
 'VINCULO_TITULARIDADE_CONFIRMADO_POR_CADA_INSTITUICAO',
 'EXTRATOS_REAIS_AUTENTICADOS_E_CONCILIADOS',
 'PROVA_RECEBIMENTO_PSP_E_SPLIT_EFETIVO',
 'PROVA_PREFUNDING_CONTA_DO_EXECUTOR',
 'PROVA_PIX_OUT_REAL_E_REVERSOES',
 'HOMOLOGACAO_TECNICA_REGULATORIA_E_COMERCIAL',
 'AUTORIZACAO_GO_LIVE_ADMIN_COM_AUDITORIA'
]);
function avaliarProntidaoFinanceiraEnsaio({tesouraria}={}){
 if(process.env.NODE_ENV==='production')
  falha('PRONTIDAO_ENSAIO_PROIBIDA_PRODUCAO');
 if(!tesouraria||
    typeof tesouraria.verificar!=='function'||
    typeof tesouraria.plano!=='function'||
    typeof tesouraria.contasExternas?.diagnosticarExtratosDeclarados!=='function'||
    typeof tesouraria.correspondenciasExtrato?.diagnosticar!=='function'||
    typeof tesouraria.conciliacaoBancaria?.analisar!=='function'||
    typeof tesouraria.observacoesPsp?.verificar!=='function'||
    typeof tesouraria.extratosAsaasInbox?.verificar!=='function'||
    typeof tesouraria.diagnosticarConvergenciaExternaEnsaio!=='function')
  falha('PRONTIDAO_ENSAIO_MODULOS_INCOMPLETOS');
 const local=tesouraria.verificar(),plano=tesouraria.plano();
 if(local.integridade!=='OK'||plano.estado!=='PLANEJAMENTO_SEM_HOMOLOGACAO')
  falha('PRONTIDAO_ENSAIO_ESTADO_INCONSISTENTE');
 const psp=tesouraria.observacoesPsp.verificar();
 const extratos=tesouraria.extratosAsaasInbox.verificar();
 const contas=tesouraria.contasExternas.diagnosticarExtratosDeclarados();
 const corr=tesouraria.correspondenciasExtrato.diagnosticar();
 const bancos=tesouraria.conciliacaoBancaria.analisar();
 const financeiro=tesouraria.diagnosticarConvergenciaExternaEnsaio();
 const avisos=[];
 const avisar=(c,cond)=>{if(cond)avisos.push(c);};
 avisar('RECEBIMENTOS_SEM_ENSAIO',local.recebimentos===0);
 avisar('SEM_OBSERVACOES_PSP_SANDBOX',psp.observacoes===0);
 avisar('SEM_EXTRATOS_PSP_SANDBOX',extratos.registros===0);
 avisar('CONTA_SEM_DECLARACAO_DE_TITULAR',
  Object.values(contas.alertas).some(n=>n>0));
 avisar('REFERENCIAS_EXTRATO_SEM_CORRELACAO',
  corr.correspondencias===0&&extratos.registros>0);
 avisar('EXTRATO_BANCARIO_DIVERGENTE',
  bancos.totalDivergencias>0);
 avisar('CONFERENCIA_PSP_PIX_DIVERGENTE',
  financeiro.divergenciasPspPix>0);
 avisar('BANCO_ALOCADO_SEM_IDENTIDADE_DECLARADA',
  contas.contasNecessariasPeloLivro>contas.contasDeclaradas);
 // O teste pode não ter gerado sequer uma operação. Não declarar "verde"
 // sem cobertura substantiva dos cenários de recebimento e saída.
 avisar('SEM_PROVA_DE_SAQUE_ENSAIADO',local.saques===0);
 avisar('SEM_CORRESPONDENCIAS_COM_TRANSACOES_EXTRATO',
  extratos.registros>0&&corr.correspondencias===0);
 const planoCompleto=!!(plano.rotas.CAPTACAO&&
  plano.rotas.DISTRIBUICAO&&plano.rotas.CUSTODIA_LOOP&&
  plano.rotas.CUSTODIA_LOJA&&plano.rotas.CUSTODIA_COFRES&&
  plano.rotas.EXECUTOR_SAQUE);
 avisar('PAPEIS_FINANCEIROS_AINDA_NAO_PREENCHIDOS',!planoCompleto);
 return Object.freeze({
  modo:'AUDITORIA_DE_ENSAIO_SEM_HOMOLOGACAO',
  integridadeLocal:local.integridade,
  planoRevisao:plano.revisao,
  recebimentosFicticios:local.recebimentos,
  saquesFicticios:local.saques,
  registrosExtratoPsp:extratos.registros,
  contasCandidatasDeclaradas:contas.contasDeclaradas,
  referenciasCruzadasExtrato:corr.correspondencias,
  alertasLocais:Object.freeze([...new Set(avisos)]),
  requisitosExternosPendentes:EXTERNOS,
  condicoesParaTesteLocalVerificadas:avisos.length===0,
  provaExternaAutenticada:false,
  autorizacaoParaDinheiroReal:false,
  pagamentosReaisLiberados:false,
  recebimentosReaisLiberados:false,
  prontoParaMarcoZeroComClientes:false,
  servicoNaoExecutaDeploy:true,
  fase:'AGUARDANDO_HOMOLOGACAO_EXTERNA'
 });
}
module.exports={avaliarProntidaoFinanceiraEnsaio,EXTERNOS};
