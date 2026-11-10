'use strict';
// Um fluxo de COMPRA (e nao cinco motores paralelos): catalogo -> estoque/
// frete -> cotacao cifrada -> reserva pre-cobranca -> pedido -> PSP reconsultado
// -> livro comercial/LOOP -> outbox de cada distribuidor.
// Este modulo e apenas integracao interna de ENSAIO. Nao cria Pix,
// nao realiza split, nao despacha mercadoria e nao credita dinheiro.
const ID=/^[A-Za-z0-9_-]{3,120}$/;
const TITULAR=/^titular-[a-f0-9-]{36}$/;
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
class JornadaComercialUnificadaEnsaioSQLite{
 constructor({banco,cotacoes,pedidos,preflight,outbox,integracao}={}){
  if(process.env.NODE_ENV==='production')
   falha('JORNADA_COMERCIAL_ENSAIO_PROIBIDA_PRODUCAO');
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     cotacoes?.db!==banco||pedidos?.db!==banco||preflight?.db!==banco||
     outbox?.db!==banco||integracao?.db!==banco||
     pedidos.preflightCapacidade!==preflight||
     pedidos.integradorComercialEnsaio!==integracao||
     preflight.motor!==integracao.motor||
     typeof cotacoes.simular!=='function'||
     typeof cotacoes.emitir!=='function'||
     typeof pedidos.criarPedido!=='function'||
     typeof pedidos.confirmarPagamento!=='function'||
     typeof outbox.registrarPagamentoConciliado!=='function'||
     typeof preflight.consultar!=='function')
   falha('JORNADA_COMERCIAL_EXIGE_MESMO_SQLITE_E_MOTOR');
  this.db=banco;this.cotacoes=cotacoes;this.pedidos=pedidos;
  this.preflight=preflight;this.outbox=outbox;
  this.integracao=integracao;
 }
 _ensaio(){
  if(process.env.NODE_ENV==='production')
   falha('JORNADA_COMERCIAL_ENSAIO_PROIBIDA_PRODUCAO');
 }
 simularCarrinho({itens,cepDestino}={}){
  this._ensaio();
  return this.cotacoes.simular({itens,cepDestino});
 }
 async registrarPedido({titularId,itens,cepDestino,servicosFrete,
  resumoAceito,chaveIdempotencia,enderecoEntrega}={}){
  this._ensaio();
  if(typeof titularId!=='string'||!TITULAR.test(titularId)||
     !ID.test(chaveIdempotencia||''))
   falha('JORNADA_COMERCIAL_IDENTIDADE_INVALIDA');
  const cotacao=await this.cotacoes.emitir({
   titularId,itens,cepDestino,servicosFrete,resumoAceito
  });
  const pedido=await this.pedidos.criarPedido({
   titularId,cotacaoId:cotacao.cotacaoId,
   chaveIdempotencia,enderecoEntrega
  });
  if(pedido.status!=='AGUARDANDO_PAGAMENTO'||
     !ID.test(pedido.pedidoId))
   falha('JORNADA_COMERCIAL_PEDIDO_INCONSISTENTE');
  const capacidade=this.preflight.consultar({titularId});
  // A cobranca nunca e criada neste metodo. A seguranca do checkout vem
  // da transacao de criacao de pedido, nao de um aviso no navegador.
  return {pedidoId:pedido.pedidoId,
   status:pedido.status,valorTotalCentavos:pedido.valorTotalCentavos,
   quantidadeDistribuidores:pedido.quantidadeDistribuidores,
   capacidade,checkoutReal:false,cobrancaCriada:false,
   proximaEtapa:'PROVEDOR_PSP_NAO_HOMOLOGADO',
   financeiroReal:false};
 }
 async verificarPagamentoEPrepararRemessas({pedidoId}={}){
  this._ensaio();
  if(!ID.test(pedidoId||''))
   falha('JORNADA_COMERCIAL_PEDIDO_INVALIDO');
  // Somente o servidor reconsulta o PSP. Nada recebido do navegador pode
  // definir o estado como CONFIRMADO ou escolher o pagamento de terceiro.
  const pagamento=await this.pedidos.confirmarPagamento({pedidoId});
  if(pagamento.cancelado)
   return {pedidoId,estado:'CANCELADO_PSP',remessasPreparadas:0,
    posicoesCriadas:0,financeiroReal:false};
  if(!pagamento.confirmado)
   falha('JORNADA_COMERCIAL_PSP_NAO_CONFIRMADO');
  const fornecedores=pagamento.fornecedores;
  if(!Array.isArray(fornecedores)||fornecedores.length<1||
     fornecedores.length>25||new Set(fornecedores).size!==fornecedores.length)
   falha('JORNADA_COMERCIAL_DISTRIBUIDORES_DIVERGENTES');
  // Outbox preparado sem acionar API para enviar produtos. O envio
  // exige autonomamente prova de quitacao do custo do fornecedor.
  let preparadas=0,jaPreparadas=0,pendentes=[];
  for(const fornecedorId of fornecedores){
   try{
    const r=await this.outbox.registrarPagamentoConciliado({
     pedidoId,fornecedorId
    });
    if(r.repetido)jaPreparadas++;
    else preparadas++;
   }catch(e){
    pendentes.push({fornecedorId,
     motivo:e?.codigo||'RECONCILIACAO_FORNECEDOR_PENDENTE'});
   }
  }
  return {pedidoId,estado:pendentes.length?'REVISAR_REMESSAS':'AGUARDAR_LIBERACAO_FORNECEDOR',
   pedidoAprovado:true,remessasPreparadas:preparadas,
   remessasJaPreparadas:jaPreparadas,
   pendentes,remessasEnviadas:0,
   loopPendenteReprocessamento:
    pagamento.integracaoLoopPendenteReprocessamento===true,
   novasPosicoesEnsaio:
    pagamento.integracaoInternaEnsaio?.novasPosicoes||0,
   financeiroReal:false};
 }
 async reprocessarRemessas({pedidoId}={}){
  this._ensaio();
  if(!ID.test(pedidoId||''))
   falha('JORNADA_COMERCIAL_PEDIDO_INVALIDO');
  const p=this.db.prepare(
   'SELECT status FROM loja_real_pedidos WHERE pedido_id=?'
  ).get(pedidoId);
  if(p?.status!=='APROVADO_PARA_EXPEDICAO')
   falha('JORNADA_COMERCIAL_PEDIDO_NAO_APROVADO');
  // Este metodo nao volta a cobrar: prepara apenas remessas pendentes
  // a partir dos dados originais do pedido e prova atual do PSP.
  const q=this.db.prepare([
   'SELECT fornecedor_id FROM loja_real_custos_pedido',
   'WHERE pedido_id=? GROUP BY fornecedor_id ORDER BY fornecedor_id'
  ].join(' ')).all(pedidoId);
  if(q.length<1||q.length>25)
   falha('JORNADA_COMERCIAL_SEM_DISTRIBUIDORES');
  const resposta={pedidoId,remessasPreparadas:0,remessasJaPreparadas:0,
   pendentes:[],remessasEnviadas:0,financeiroReal:false};
  for(const {fornecedor_id} of q){
   try{
    const r=await this.outbox.registrarPagamentoConciliado({
     pedidoId,fornecedorId:fornecedor_id
    });
    if(r.repetido)resposta.remessasJaPreparadas++;
    else resposta.remessasPreparadas++;
   }catch(e){
    resposta.pendentes.push({fornecedorId:fornecedor_id,
     motivo:e?.codigo||'RECONCILIACAO_FORNECEDOR_PENDENTE'});
   }
  }
  return resposta;
 }
 consultarStatus(){
  const pedidos=this.db.prepare([
   'SELECT COUNT(*) AS total,',
   "COALESCE(SUM(CASE WHEN status='APROVADO_PARA_EXPEDICAO' THEN 1 ELSE 0 END),0) AS aprovados,",
   "COALESCE(SUM(CASE WHEN status='CANCELADO' THEN 1 ELSE 0 END),0) AS cancelados,",
   "COALESCE(SUM(CASE WHEN status='AGUARDANDO_PAGAMENTO' THEN 1 ELSE 0 END),0) AS aguardando",
   'FROM loja_real_pedidos'
  ].join(' ')).get();
  const remessas=this.db.prepare([
   'SELECT COUNT(*) AS total,',
   "COALESCE(SUM(CASE WHEN estado='PENDENTE' THEN 1 ELSE 0 END),0) AS pendentes,",
   "COALESCE(SUM(CASE WHEN estado='INDETERMINADO' THEN 1 ELSE 0 END),0) AS revisar,",
   "COALESCE(SUM(CASE WHEN estado='ENVIADO' THEN 1 ELSE 0 END),0) AS enviadas",
   'FROM loja_real_outbox_fornecedor'
  ].join(' ')).get();
  return {estado:'PONTE_OPERACIONAL_ENSAIO',pedidos,
   remessas,capacidade:this.preflight.verificar(),
   dinheiroReal:false,checkoutProdutivoHabilitado:false,
   confirmacaoBancariaProdutiva:false};
 }
}
module.exports={JornadaComercialUnificadaEnsaioSQLite};
