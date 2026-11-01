'use strict';
// Fonte interna para a ponte: somente dados persistidos e reconsultados no Asaas.
// Nunca receber status, titular ou valor de um webhook/cliente HTTP.
const {STATUS_CONFIRMADO}=require('./processador-pedidos-simulados');
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
class ComprovanteAsaasSandboxPonteLab{
 constructor({cobrancas,titularidade}={}){
  if(typeof cobrancas?.consultar!=='function'||
     typeof titularidade?.buscar!=='function')
   throw new TypeError('Cobrancas e titularidade locais obrigatorias');
  this.cobrancas=cobrancas;this.titularidade=titularidade;
 }
 async consultar(pedidoId){
  const cobranca=this.cobrancas.consultar(pedidoId);
  const titular=this.titularidade.buscar(pedidoId);
  if(!cobranca?.encontrado||cobranca.status!=='RECEBIMENTO_INFORMADO_SANDBOX'||
     !cobranca.pagamentoId||!titular?.contaId||
     titular.valorCentavos!==cobranca.valorCentavos||
     !['PDF','CARRINHO'].includes(cobranca.origem))
   throw falha('COMPROVANTE_ASAAS_SANDBOX_INELEGIVEL');
  const criado=Date.parse(cobranca.criadoEm),fixado=Date.parse(titular.criadoEm);
  if(!Number.isFinite(criado)||!Number.isFinite(fixado)||fixado>criado)
   throw falha('TITULAR_NAO_FIXADO_ANTES_COBRANCA');
  if(typeof titular.produtoId!=='string'||!titular.produtoId||!titular.intentoPagamentoId)
   throw falha('PEDIDO_IDENTIFICADO_INCOMPLETO');
  if(cobranca.pedidoId!==pedidoId||cobranca.valorCentavos<1)
   throw falha('COBRANCA_SANDBOX_INELEGIVEL');
  const produtoId=titular.produtoId;
  const temHistorico=typeof this.cobrancas.historico==='function';
  const consultas=temHistorico?this.cobrancas.historico(pedidoId)?.conferencias:null;
  // O registro historico e fonte independente da ultima reconsulta do PSP.
  // Recebimento manual ou resposta antiga nao pode criar posicao no LOOP.
  if(temHistorico&&(!Array.isArray(consultas)||!consultas.length||
      consultas[consultas.length-1]?.statusAsaas!=='RECEIVED'||
      consultas[consultas.length-1]?.estadoLoja!=='RECEBIMENTO_INFORMADO_SANDBOX'))
   throw falha('ULTIMA_RECONSULTA_NAO_CONFIRMOU_PIX');
  const primeiroRecebimento=Array.isArray(consultas)?
   consultas.find(x=>x.estadoLoja==='RECEBIMENTO_INFORMADO_SANDBOX'&&
    x.statusAsaas==='RECEIVED'):null;
  const confirmadoEm=primeiroRecebimento?.consultadoEm||cobranca.atualizadoEm;
  if(typeof cobranca.atualizadoEm!=='string'||!Number.isFinite(Date.parse(cobranca.atualizadoEm))||
     Date.parse(cobranca.atualizadoEm)<criado)
   throw falha('CONFIRMACAO_SEM_HORARIO_CONFIAVEL');
  if(!Number.isFinite(Date.parse(confirmadoEm))||Date.parse(confirmadoEm)<criado)
   throw falha('CONFIRMACAO_SEM_HORARIO_CONFIAVEL');
  let valorElegivelLoopCentavos=cobranca.valorCentavos;
  let quantidadePosicoesEsperada=1;
  // O PSP confirma o TOTAL; somente a fotografia comercial determina
  // quanto e elegivel. Nunca consultar a regra atual do catalogo.
  if(cobranca.origem==='CARRINHO'&&produtoId==='carrinho-loop-demo'){
   const banco=this.cobrancas.banco;
   const itens=banco.prepare(`SELECT i.subtotal_centavos AS total,
    e.subtotal_elegivel_centavos AS elegivel
    FROM admin_carrinho_loop_itens_demo i
    LEFT JOIN admin_carrinho_item_elegibilidade_demo e
     ON e.pedido_id=i.pedido_id AND e.ordem=i.ordem
    WHERE i.pedido_id=?`).all(pedidoId);
   if(!itens.length||itens.some(i=>!Number.isSafeInteger(i.elegivel)||i.elegivel<0||i.elegivel>i.total)||
      itens.reduce((s,i)=>s+i.total,0)!==cobranca.valorCentavos)
    throw falha('SNAPSHOT_ELEGIBILIDADE_CARRINHO_INVALIDO');
   valorElegivelLoopCentavos=itens.reduce((s,i)=>s+i.elegivel,0);
   const pacote=banco.prepare(`SELECT MAX(k.posicoes_por_pedido) quantidade
    FROM admin_carrinho_item_pacote_posicoes_demo k
    JOIN admin_carrinho_loop_itens_demo i ON i.pedido_id=k.pedido_id AND i.ordem=k.ordem
    JOIN admin_carrinho_item_elegibilidade_demo e ON e.pedido_id=i.pedido_id AND e.ordem=i.ordem
    JOIN admin_carrinho_item_quantidade_minima_demo q ON q.pedido_id=i.pedido_id AND q.ordem=i.ordem
    WHERE k.pedido_id=? AND e.elegivel_loop=1 AND e.subtotal_elegivel_centavos>0
     AND i.quantidade>=q.quantidade_minima`).get(pedidoId);
   quantidadePosicoesEsperada=pacote.quantidade??1;
  }
  return Object.freeze({pedidoId,contaId:titular.contaId,produtoId,
   valorElegivelLoopCentavos,quantidadePosicoesEsperada,
   valorCentavos:cobranca.valorCentavos,status:STATUS_CONFIRMADO,
   confirmadoEm,intentoPagamentoId:titular.intentoPagamentoId});
 }
}
module.exports={ComprovanteAsaasSandboxPonteLab};
