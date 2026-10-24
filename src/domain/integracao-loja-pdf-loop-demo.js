'use strict';

// Laboratorio: adaptador entre pedidos PDF ficticios, titularidade
// predefinida e o motor LOOP. Nao aceita status "pago" do navegador.
const {STATUS_CONFIRMADO}=require('./processador-pedidos-simulados');
function falha(codigo,mensagem){
 const e=new Error(mensagem);e.codigo=codigo;return e;
}
class IntegracaoLojaPDFLoopDemo{
 constructor({pedidosPDF,pedidosIdentificados,ponte}={}){
  const banco=pedidosPDF?.banco;
  if(!banco||pedidosIdentificados?.banco!==banco||ponte?.banco!==banco||
    typeof ponte.processar!=='function'){
   throw new TypeError('Modulo PDF, pedidos identificados e LOOP precisam compartilhar SQLite');
  }
  this.pedidosPDF=pedidosPDF;
  this.pedidosIdentificados=pedidosIdentificados;
  this.ponte=ponte;
 }
 vincular({pedidoId,contaId}={}){
  const pdf=this.pedidosPDF.buscar(pedidoId);
  if(!pdf)throw falha('PDF_INEXISTENTE','Pedido PDF ficticio nao encontrado');
  const anterior=this.pedidosIdentificados.buscar(pedidoId);
  if(!anterior&&pdf.situacaoPagamentoFicticio!=='AGUARDANDO_FICTICIO'){
   throw falha('PAGAMENTO_JA_DECIDIDO','Vinculo precisa existir antes de confirmar');
  }
  const vinculo=this.pedidosIdentificados.preparar({
   pedidoId,contaId,produtoId:pdf.produtoId,
   valorCentavos:pdf.precoBrutoCentavos
  });
  return {pedidoId,contaId:vinculo.contaId,
   titularFixado:true,repetido:vinculo.repetido,semPagamentoReal:true};
 }
 consultarEstado(pedidoId){
  const pdf=this.pedidosPDF.buscar(pedidoId);
  if(!pdf)throw falha('PDF_INEXISTENTE','Pedido PDF nao encontrado');
  const v=this.pedidosIdentificados.buscar(pedidoId);
  if(!v)return {pedidoId,vinculado:false,
   situacao:'AGUARDANDO_VINCULO',posicaoCriada:false};
  if(v.produtoId!==pdf.produtoId||v.valorCentavos!==pdf.precoBrutoCentavos){
   throw falha('PEDIDO_DIVERGENTE','Referencia do produto ou preco divergiu');
  }
  const t=this.ponte.banco.prepare(
   'SELECT posicao_id AS posicaoId FROM admin_ponte_compras_demo WHERE pedido_id=?'
  ).get(pedidoId);
  const loja=this.ponte.banco.prepare(
   'SELECT pedido_id FROM admin_ponte_vendas_loja_sem_loop_demo WHERE pedido_id=? UNION ALL SELECT pedido_id FROM admin_ponte_vendas_loja_apos_reajuste_demo WHERE pedido_id=?'
  ).get(pedidoId,pedidoId);
  return {
   pedidoId,vinculado:true,contaId:v.contaId,
   situacaoPagamento:pdf.situacaoPagamentoFicticio,
   posicaoCriada:!!t,posicaoId:t?.posicaoId??null,
   lojaSemPosicao:!!loja,semPagamentoReal:true
  };
 }
 // Somente o banco de eventos PDF e a tabela imutavel de titularidade
 // alimentam o comprovante; nenhum dado do POST vira confirmacao.
 comprovanteConfirmado(pedidoId){
  const pdf=this.pedidosPDF.buscar(pedidoId);
  const vinculo=this.pedidosIdentificados.buscar(pedidoId);
  if(!pdf||!vinculo)throw falha('PEDIDO_NAO_VINCULADO','Falta pedido e titular');
  if(pdf.produtoId!==vinculo.produtoId||
    pdf.precoBrutoCentavos!==vinculo.valorCentavos){
   throw falha('PEDIDO_DIVERGENTE','Produto ou valor nao confere');
  }
  if(pdf.situacaoPagamentoFicticio!=='CONFIRMADO_FICTICIO'){
   throw falha('PAGAMENTO_NAO_CONFIRMADO','Confirmacao PDF ausente ou estornada');
  }
  const primeiro=this.pedidosPDF.historico(pedidoId)
   .find(x=>x.tipo==='CONFIRMAR_FICTICIO');
  if(!primeiro||!primeiro.registradoEm)
   throw falha('PAGAMENTO_NAO_CONFIRMADO','Evento de confirmacao nao encontrado');
  return {
   pedidoId,contaId:vinculo.contaId,
   produtoId:vinculo.produtoId,valorCentavos:vinculo.valorCentavos,
   valorElegivelLoopCentavos:pdf.valorElegivelLoopCentavos,
   intentoPagamentoId:vinculo.intentoPagamentoId,
   confirmadoEm:primeiro.registradoEm,status:STATUS_CONFIRMADO
  };
 }
 async sincronizar({pedidoId}={}){
  const pdf=this.pedidosPDF.buscar(pedidoId);
  if(!pdf)throw falha('PDF_INEXISTENTE','Pedido PDF nao encontrado');
  const vinculo=this.pedidosIdentificados.buscar(pedidoId);
  if(!vinculo)return {pedidoId,situacao:'SEM_TITULAR_PREDEFINIDO',
   posicaoCriada:false,compraRegistrada:false};
  const status=pdf.situacaoPagamentoFicticio;
  if(status==='AGUARDANDO_FICTICIO')return {
   pedidoId,situacao:'AGUARDANDO_PAGAMENTO',posicaoCriada:false,compraRegistrada:false
  };
  if(status==='ESTORNADO_FICTICIO')return {
   pedidoId,situacao:'ESTORNADO_REQUER_CONFERENCIA',
   posicaoCriada:this.consultarEstado(pedidoId).posicaoCriada,
   naoDesfazPosicaoAutomaticamente:true
  };
  const resultado=await this.ponte.processar({pedidoId});
  return {...resultado,situacao:resultado.posicaoCriada?
    'POSICAO_LOOP_CRIADA_OU_EXISTENTE':'SOMENTE_LOJA',
   integracao:'PDF_PARA_LOOP_FICTICIA',semPagamentoReal:true};
 }
}
module.exports={IntegracaoLojaPDFLoopDemo};
