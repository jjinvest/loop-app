'use strict';
// Conferencia PSP + bancos do MESMO banco de dados (modo ensaio).
// Os dois lados sao declaracoes SANDBOX, nao recibos bancarios reais.
// O relatorio NUNCA autoriza emitir cobranca, repassar valor ou quitar Pix.
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
const ID=/^[A-Za-z0-9_-]{1,120}$/;
function avaliarConvergenciaUnificadaEnsaio({tesouraria}={}){
 if(process.env.NODE_ENV==='production')
  falha('CONVERGENCIA_ENSAIO_PROIBIDA_EM_PRODUCAO');
 if(typeof tesouraria?.verificar!=='function'||
    typeof tesouraria.db?.prepare!=='function'||
    typeof tesouraria.conciliacaoBancaria?.analisar!=='function'||
    typeof tesouraria.observacoesPsp?.consultarCompromisso!=='function')
  falha('CONVERGENCIA_ENSAIO_MODULOS_INCOMPLETOS');
 const integridade=tesouraria.verificar();
 if(integridade.integridade!=='OK')
  falha('CONVERGENCIA_ENSAIO_LIVRO_INCONSISTENTE');
 const bancos=tesouraria.conciliacaoBancaria.analisar();
 const db=tesouraria.db;
 const contagem=new Map();
 let alertas=0,amostras=[],recebimentos=0,saques=0,
  pspSandboxSinalizouRecebimento=0,pixSandboxSinalizouConclusao=0;
 const avisar=(codigo,operacao)=>{
  alertas++;contagem.set(codigo,(contagem.get(codigo)||0)+1);
  if(amostras.length<30)amostras.push({codigo,operacao});
 };
 const consultar=(tipo,referencia)=>{
  if(typeof referencia!=='string'||!ID.test(referencia))return null;
  return tesouraria.observacoesPsp.consultarCompromisso({tipo,referencia});
 };
 const pagamento=db.prepare([
  'SELECT pagamento_id FROM loja_real_pedidos WHERE pedido_id=?'
 ].join(' '));
 for(const r of db.prepare([
  'SELECT pedido_id,psp FROM loop_lab_tesouraria_recebimentos'
 ].join(' ')).iterate()){
  recebimentos++;
  const id=pagamento.get(r.pedido_id)?.pagamento_id;
  const obs=consultar('COBRANCA',id);
  if(!obs||obs.totalObservacoes===0){
   avisar('RECEBIMENTO_SEM_OBSERVACAO_PSP',r.pedido_id);continue;
  }
  // Observador atual e exclusivamente Asaas SANDBOX. Celcoin
  // OAuth+GET de participantes NAO valida pagamento nem liquidação.
  if(r.psp!=='ASAAS'){
   avisar('PSP_ORIGEM_NAO_CORRESPONDE_A_OBSERVACAO',r.pedido_id);
   continue;
  }
  if(obs.revisaoManualObrigatoria){
   avisar('PSP_COM_HISTORICO_INCONSISTENTE',r.pedido_id);continue;
  }
  if(obs.ultimaObservacao!=='PSP_SANDBOX_SINALIZOU_RECEBIMENTO'){
   avisar('PSP_SEM_SINAL_DE_RECEBIMENTO',r.pedido_id);continue;
  }
  pspSandboxSinalizouRecebimento++;
 }
 for(const r of db.prepare([
  'SELECT saque_id,executor,estado,tentativa_id',
  'FROM loop_lab_tesouraria_saques'
 ].join(' ')).iterate()){
  saques++;
  if(r.estado!=='PAGO'){
   avisar('SAQUE_FICTICIO_NAO_CONCLUIDO',r.saque_id);continue;
  }
  const obs=consultar('PIX',r.tentativa_id);
  if(!obs||obs.totalObservacoes===0){
   avisar('SAQUE_SEM_OBSERVACAO_PSP',r.saque_id);continue;
  }
  if(r.executor!=='ASAAS'){
   avisar('EXECUTOR_PIX_NAO_CORRESPONDE_A_OBSERVACAO',r.saque_id);
   continue;
  }
  if(obs.revisaoManualObrigatoria){
   avisar('PIX_COM_HISTORICO_INCONSISTENTE',r.saque_id);continue;
  }
  if(obs.ultimaObservacao!=='CONFIRMACAO_SOMENTE_SANDBOX'){
   avisar('PIX_SEM_SINAL_DE_CONCLUSAO',r.saque_id);continue;
  }
  pixSandboxSinalizouConclusao++;
 }
 return Object.freeze({
  modo:'CONVERGENCIA_DECLARADA_PSP_E_MULTIBANCOS_ENSAIO',
  integridadeInterna:'OK',
  recebimentosFicticios:recebimentos,
  saquesFicticios:saques,
  pspSandboxSinalizouRecebimento,
  pixSandboxSinalizouConclusao,
  divergenciasPspPix:alertas,
  divergenciasPorCodigo:Object.fromEntries(contagem),
  amostraDivergencias:amostras,
  movimentosBancariosEsperados:bancos.movimentosBancariosEsperados,
  movimentosBancariosDeclaradosConcordantes:
   bancos.movimentosComDeclaracoesConcordantes,
  divergenciasBanco:bancos.totalDivergencias,
  semFalhasDeclaradas:recebimentos>0&&alertas===0&&
   bancos.todasDeclaracoesCoincidem,
  fontesPspAutenticadasEmProducao:false,
  extratosBancariosExternosAutenticados:false,
  conciliacaoRealCertificada:false,
  posicoesReaisLiberadas:false,
  transferenciasReaisExecutadas:false,
  saquesReaisLiberados:false,
  financeiroReal:false
 });
}
module.exports={avaliarConvergenciaUnificadaEnsaio};
