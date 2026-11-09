'use strict';
// Contrato interno dos modulos de pagamento. NAO tem cliente HTTP,
// credenciais, saldo bancario, Pix executavel ou credencial de homologacao.
// Trocar nomes no PLANO nunca transfere saldos nem substitui uma liquidacao.
function erro(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
const PAPEIS=Object.freeze([
 'CAPTACAO','DISTRIBUICAO','CUSTODIA_LOOP',
 'CUSTODIA_LOJA','CUSTODIA_COFRES','EXECUTOR_SAQUE'
]);
const METODOS=Object.freeze({
 CAPTACAO:Object.freeze([
  'criarCobranca','consultarCobranca','consultarLiquidacao','consultarEstorno'
 ]),
 DISTRIBUICAO:Object.freeze([
  'consultarSaldo','enviarRepasse','consultarRepasse'
 ]),
 CUSTODIA_LOOP:Object.freeze([
  'consultarSaldo','consultarExtrato','consultarTransferencia'
 ]),
 CUSTODIA_LOJA:Object.freeze([
  'consultarSaldo','consultarExtrato','consultarTransferencia'
 ]),
 CUSTODIA_COFRES:Object.freeze([
  'consultarSaldo','consultarExtrato','consultarTransferencia'
 ]),
 EXECUTOR_SAQUE:Object.freeze([
  'consultarSaldo','enviarPix','consultarPix','consultarEstornoPix'
 ])
});
const ROTAS_INICIAIS=Object.freeze({
 // PSP recebedor e distribuidor AINDA NAO escolhidos.
 CAPTACAO:null,DISTRIBUICAO:null,
 CUSTODIA_LOOP:'INTER',CUSTODIA_LOJA:'MERCADO_PAGO',
 CUSTODIA_COFRES:null,EXECUTOR_SAQUE:null
});
const CANDIDATOS=Object.freeze({
 CAPTACAO:Object.freeze(['CELCOIN','ASAAS']),
 DISTRIBUICAO:Object.freeze(['CELCOIN','ASAAS']),
 CUSTODIA_LOOP:Object.freeze(['INTER']),
 CUSTODIA_LOJA:Object.freeze(['MERCADO_PAGO']),
 CUSTODIA_COFRES:Object.freeze([]),
 EXECUTOR_SAQUE:Object.freeze(['ASAAS'])
});
const ID=/^[A-Z][A-Z0-9_]{1,63}$/;
const VALIDO=id=>id===null||typeof id==='string'&&ID.test(id);
function criarPlanoFinanceiro({rotas=ROTAS_INICIAIS,revisao=1}={}){
 if(!rotas||typeof rotas!=='object'||Array.isArray(rotas)||
  Object.keys(rotas).length!==PAPEIS.length||
  PAPEIS.some(p=>!Object.hasOwn(rotas,p)||!VALIDO(rotas[p]))||
  !Number.isSafeInteger(revisao)||revisao<1)
  erro('PORTAS_FINANCEIRAS_PLANO_INVALIDO');
 // Somente projecao, nunca um estado operacional de provedores.
 return Object.freeze({
  estado:'PLANEJAMENTO_SEM_HOMOLOGACAO',
  revisao,rotas:Object.freeze({...rotas}),
  dinheiroRealLiberado:false,saquesHabilitados:false,
  redistribuicaoAutomaticaHabilitada:false
 });
}
function validarPlanoFinanceiro(plano){
 if(!plano||plano.estado!=='PLANEJAMENTO_SEM_HOMOLOGACAO'||
    plano.dinheiroRealLiberado!==false||
    plano.saquesHabilitados!==false||
    plano.redistribuicaoAutomaticaHabilitada!==false)
  erro('PORTAS_FINANCEIRAS_PLANO_NAO_HOMOLOGADO');
 const r=criarPlanoFinanceiro({rotas:plano.rotas,revisao:plano.revisao});
 return r;
}
function descreverContratosFinanceiros(){
 return Object.freeze({
  papeis:PAPEIS,
  metodos:METODOS,
  candidatos:CANDIDATOS,
  provedorRecebedorContratado:false,
  provedorPagadorContratado:false,
  bancosConectados:false,
  pixRealLiberado:false
 });
}
function verificarPortaCandidata({papel,provedor,adaptador}={}){
 if(!PAPEIS.includes(papel)||!VALIDO(provedor)||provedor===null||
  !adaptador||typeof adaptador!=='object'||Array.isArray(adaptador))
  erro('PORTAS_FINANCEIRAS_ADAPTADOR_INVALIDO');
 const faltantes=METODOS[papel].filter(x=>typeof adaptador[x]!=='function');
 return Object.freeze({
  papel,provedor,
  metodosObrigatorios:Object.freeze([...METODOS[papel]]),
  metodosFaltantes:Object.freeze(faltantes),
  contratoDeCodigoCompativel:faltantes.length===0,
  autenticacaoComprovada:false,
  contratoComercialComprovado:false,
  aptoProducao:false
 });
}
function planejarTrocaFinanceira({
 plano,papel,provedorDestino,operacoesEmAberto=0,
 operacoesIndeterminadas=0,motivo='MUDANCA_PLANEJADA'
}={}){
 const p=validarPlanoFinanceiro(plano);
 if(!PAPEIS.includes(papel)||!VALIDO(provedorDestino)||
  provedorDestino===null||!Number.isSafeInteger(operacoesEmAberto)||
  operacoesEmAberto<0||!Number.isSafeInteger(operacoesIndeterminadas)||
  operacoesIndeterminadas<0||typeof motivo!=='string'||
  !/^[A-Z][A-Z0-9_]{2,79}$/.test(motivo)||
  p.revisao>=Number.MAX_SAFE_INTEGER)
  erro('PORTAS_FINANCEIRAS_TROCA_INVALIDA');
 if(provedorDestino===p.rotas[papel])
  erro('PORTAS_FINANCEIRAS_TROCA_SEM_MUDANCA');
 const bloqueada=operacoesEmAberto>0||operacoesIndeterminadas>0;
 const proposto=criarPlanoFinanceiro({
  rotas:{...p.rotas,[papel]:provedorDestino},
  revisao:p.revisao+1
 });
 return Object.freeze({
  papel,origem:p.rotas[papel],destino:provedorDestino,motivo,
  revisaoAnterior:p.revisao,revisaoProposta:proposto.revisao,
  proposto,estado:bloqueada?'BLOQUEADA_POR_PENDENCIAS':'AGUARDA_HOMOLOGACAO',
  operacoesEmAberto,operacoesIndeterminadas,
  necessitaContratoEChavesIndependentes:true,
  exigeConciliacaoDaOrigem:true,
  exigeSaldoComprovadoNoDestino:true,
  migrateSaldoAutomaticamente:false,
  operacaoFinanceiraRealExecutada:false,
  aplicadoNoBanco:false
 });
}
function planejarSaqueModular({plano}={}){
 const p=validarPlanoFinanceiro(plano);
 const origem=p.rotas.CUSTODIA_LOOP,executor=p.rotas.EXECUTOR_SAQUE;
 return Object.freeze({
  origemDoSaldo:origem,executorPix:executor,
  caminho:!origem||!executor?'AGUARDA_ESCOLHA_DAS_CONTAS':
   origem===executor?'PIX_DA_PROPRIA_CUSTODIA_SOB_CONTRATO':
   'ABASTECER_EXECUTOR_COM_SALDO_REAL_E_CONCILIAR',
  prefundingNecessario:!!origem&&!!executor&&origem!==executor,
  saldoComprovado:false,
  contratoPixHomologado:false,
  pagamentoRealExecutado:false,
  saqueLiberado:false,
  transferenciaAutomaticaHabilitada:false
 });
}
function avaliarContingenciaDeSaque({estadoOperacao,
 executorAlternativoHomologado=false}={}){
 if(!['SOLICITADO','RESERVADO','ENVIADO',
    'INDETERMINADO','CONFIRMADO','CANCELADO'].includes(estadoOperacao)||
    typeof executorAlternativoHomologado!=='boolean')
  erro('PORTAS_FINANCEIRAS_ESTADO_INDETERMINADO');
 const exigeConciliacao=['ENVIADO','INDETERMINADO','CONFIRMADO']
  .includes(estadoOperacao);
 return Object.freeze({
  estadoOperacao,exigeConciliacao,
  podeReenviarNaOutraApi:false,
  executorAlternativoHomologado,
  exigeNovaAutorizacaoParaTroca:true,
  motivo:exigeConciliacao?
   'NAO_REENVIAR_ATE_APURAR_ORIGEM':
   'PAGAMENTO_REAL_PERMANECE_BLOQUEADO'
 });
}
function bloquearOperacaoReal(){
 erro('PORTAS_FINANCEIRAS_OPERACAO_REAL_NAO_HOMOLOGADA');
}
module.exports={PAPEIS,METODOS,ROTAS_INICIAIS,CANDIDATOS,
 criarPlanoFinanceiro,validarPlanoFinanceiro,descreverContratosFinanceiros,
 verificarPortaCandidata,planejarTrocaFinanceira,planejarSaqueModular,
 avaliarContingenciaDeSaque,bloquearOperacaoReal};
