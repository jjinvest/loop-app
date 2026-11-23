'use strict';
// Consultas do OPERADOR sobre cadastros e vendas comerciais do mesmo SQLite.
// Nao escreve, nao cria pedido, nao movimenta fila, catraca ou financeiro.
function falhar(codigo){const erro=new Error(codigo);erro.codigo=codigo;throw erro;}
function criarRelatorioClientesProdutosOperador({banco}={}){
 if(typeof banco?.prepare!=='function')falhar('RELATORIO_COMERCIAL_BANCO_INVALIDO');
 const obrigatorias=['loja_real_pedidos','loja_real_custos_pedido'];
 const existente=banco.prepare(
  "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?");
 function verificar(){
  if(!obrigatorias.every(nome=>!!existente.get(nome)))
   falhar('RELATORIO_COMERCIAL_FONTE_INDISPONIVEL');
 }
 const aprovados="p.status='APROVADO_PARA_EXPEDICAO' AND p.pagamento_id IS NOT NULL";
 const linhaVenda=['FROM loja_real_custos_pedido s',
  'JOIN loja_real_pedidos p ON p.pedido_id=s.pedido_id',
  'WHERE '+aprovados].join(' ');
 const totalClientes=()=>banco.prepare(
  'SELECT COUNT(*) AS total FROM loop_real_contas');
 const sumario=()=>banco.prepare([
  'SELECT COUNT(DISTINCT p.pedido_id) AS pedidos,',
  'COALESCE(SUM(s.quantidade),0) AS unidades,',
  'COUNT(DISTINCT p.titular_id) AS compradores',
  linhaVenda
 ].join(' '));
 const pedidosAprovados=()=>banco.prepare(
  "SELECT COUNT(*) AS n FROM loja_real_pedidos WHERE status='APROVADO_PARA_EXPEDICAO'");
 const pedidosSemItens=()=>banco.prepare([
  'SELECT COUNT(*) AS n FROM loja_real_pedidos p',
  "WHERE p.status='APROVADO_PARA_EXPEDICAO'",
  'AND (p.pagamento_id IS NULL OR NOT EXISTS',
  '(SELECT 1 FROM loja_real_custos_pedido c WHERE c.pedido_id=p.pedido_id))'
 ].join(' '));
 function consistencia(){
  if(pedidosSemItens().get().n!==0)falhar('RELATORIO_COMERCIAL_PEDIDO_INCOMPLETO');
 }
 function indicadores(){
  const clientes=totalClientes().get().total;
  if(!Number.isSafeInteger(clientes)||clientes<0)
   falhar('RELATORIO_COMERCIAL_CONTAGEM_INCONSISTENTE');
  if(!obrigatorias.every(nome=>!!existente.get(nome)))
   return {fonte:'SQLITE_COMERCIAL_REAL',totalClientes:clientes,
    totalProdutosVendidos:null,totalPedidosAprovados:null,
    totalClientesCompradores:null,registroComercialDisponivel:false,
    criterio:'UNIDADES_DE_PEDIDOS_COM_PAGAMENTO_APROVADO',
    contabilizaPosicoesComoProduto:false,somenteLeitura:true};
  consistencia();
  const s=sumario().get();
  if(![clientes,s.pedidos,s.unidades,s.compradores,pedidosAprovados().get().n]
   .every(x=>Number.isSafeInteger(x)&&x>=0)||
   s.pedidos!==pedidosAprovados().get().n)
   falhar('RELATORIO_COMERCIAL_CONTAGEM_INCONSISTENTE');
  return {fonte:'SQLITE_COMERCIAL_REAL',totalClientes:clientes,
   totalProdutosVendidos:s.unidades,totalPedidosAprovados:s.pedidos,
   totalClientesCompradores:s.compradores,
   registroComercialDisponivel:true,
   criterio:'UNIDADES_DE_PEDIDOS_COM_PAGAMENTO_APROVADO',
   contabilizaPosicoesComoProduto:false,somenteLeitura:true};
 }
 const identidade=()=>banco.prepare('SELECT id FROM loop_real_contas WHERE nick=? COLLATE NOCASE');
 const linhasTotal=()=>banco.prepare([
  'SELECT COUNT(*) AS totalLinhas,COALESCE(SUM(s.quantidade),0) AS unidades',
  'FROM loja_real_pedidos p',
  'JOIN loja_real_custos_pedido s ON s.pedido_id=p.pedido_id',
  'WHERE p.titular_id=? AND '+aprovados
 ].join(' '));
 // Unidades colocadas em pedidos (exclui cancelados) versus unidades
 // efetivamente aprovadas; nunca tratar pedido pendente como venda recebida.
 const unidadesDoCadastro=()=>banco.prepare([
  'SELECT',
  "COALESCE(SUM(CASE WHEN p.status!='CANCELADO' THEN s.quantidade ELSE 0 END),0) AS compradas,",
  "COALESCE(SUM(CASE WHEN p.status='APROVADO_PARA_EXPEDICAO' AND p.pagamento_id IS NOT NULL",
  'THEN s.quantidade ELSE 0 END),0) AS aprovadas,',
  "COALESCE(SUM(CASE WHEN p.status='AGUARDANDO_PAGAMENTO'",
  'THEN s.quantidade ELSE 0 END),0) AS pendentes',
  'FROM loja_real_pedidos p',
  'JOIN loja_real_custos_pedido s ON s.pedido_id=p.pedido_id',
  'WHERE p.titular_id=?'
 ].join(' '));
 const fotoClassificacao=()=>!!existente.get('loop_real_fotos_regras_pedido');
 // A cor do produto no momento da compra foi fotografada no pedido.
 // Jamais inferir cor historica a partir da vitrine atual.
 const baseAvulsas=()=>[
  'FROM loja_real_pedidos p',
  'JOIN loja_real_custos_pedido s ON s.pedido_id=p.pedido_id',
  'JOIN loop_real_fotos_regras_pedido f',
  'ON f.pedido_id=s.pedido_id AND f.fornecedor_id=s.fornecedor_id',
  'AND f.sku=s.sku',
  "WHERE p.titular_id=? AND p.status!='CANCELADO' AND f.cor='CINZA'"
 ].join(' ');
 const totaisAvulsas=()=>banco.prepare([
  'SELECT COUNT(*) AS totalLinhas,',
  'COALESCE(SUM(s.quantidade),0) AS totalUnidades',
  baseAvulsas()
 ].join(' '));
 const linhasAvulsas=()=>banco.prepare([
  'SELECT p.pedido_id AS pedidoId,p.criado_em AS criadoEm,',
  'p.status AS statusPagamento,p.pagamento_id AS pagamentoId,',
  's.produto_id AS produtoId,s.sku AS sku,s.fornecedor_id AS fornecedorId,',
  's.quantidade AS quantidade,s.preco_unit_centavos AS precoUnitCentavos,',
  existente.get('loja_real_produtos')?'pr.titulo AS titulo':'NULL AS titulo',
  baseAvulsas().replace("WHERE p.titular_id=?",
   (existente.get('loja_real_produtos')?
    'LEFT JOIN loja_real_produtos pr ON pr.produto_id=s.produto_id ':'')+
   'WHERE p.titular_id=?'),
  'ORDER BY p.criado_em DESC,p.pedido_id DESC,s.fornecedor_id,s.sku',
  'LIMIT ? OFFSET ?'
 ].join(' '));
 const resumoUnidades=(titularId)=>{
  const r=unidadesDoCadastro().get(titularId);
  if(!r||![r.compradas,r.aprovadas,r.pendentes].every(x=>
     Number.isSafeInteger(x)&&x>=0)||r.aprovadas>r.compradas)
   falhar('RELATORIO_COMERCIAL_UNIDADES_INCONSISTENTES');
  return {totalUnidadesCompradas:r.compradas,
   totalUnidadesAprovadas:r.aprovadas,
   totalUnidadesPendentes:r.pendentes};
 };
 const resumoAvulsas=(titularId)=>{
  if(!fotoClassificacao())return {
   classificacaoAvulsasDisponivel:false,
   totalLinhasAvulsas:null,totalUnidadesAvulsas:null};
  const t=totaisAvulsas().get(titularId);
  if(!t||![t.totalLinhas,t.totalUnidades].every(x=>
    Number.isSafeInteger(x)&&x>=0))
   falhar('RELATORIO_COMERCIAL_AVULSAS_INCONSISTENTES');
  return {classificacaoAvulsasDisponivel:true,
   totalLinhasAvulsas:t.totalLinhas,totalUnidadesAvulsas:t.totalUnidades};
 };
 const linhasLista=()=>banco.prepare([
  'SELECT p.pedido_id AS pedidoId,p.criado_em AS criadoEm,',
  'p.status AS statusPagamento,p.pagamento_id AS pagamentoId,',
  // Não duplicar total do pedido em cada linha de produto, nem presumir coluna histórica.
  's.produto_id AS produtoId,s.sku AS sku,s.fornecedor_id AS fornecedorId,',
  's.quantidade AS quantidade,s.preco_unit_centavos AS precoUnitCentavos,',
  existente.get('loja_real_produtos')?'pr.titulo AS titulo':'NULL AS titulo',
  'FROM loja_real_pedidos p',
  'JOIN loja_real_custos_pedido s ON s.pedido_id=p.pedido_id',
  ...(existente.get('loja_real_produtos')?[
   'LEFT JOIN loja_real_produtos pr ON pr.produto_id=s.produto_id'
  ]:[]),
  'WHERE p.titular_id=? AND '+aprovados,
  'ORDER BY p.criado_em DESC,p.pedido_id DESC,s.fornecedor_id,s.sku',
  'LIMIT ? OFFSET ?'
 ].join(' '));
 function comprasDoCadastro({nick,offset=0,limite=30}={}){
  if(typeof nick!=='string'||!/^[a-zA-Z]{1,12}$/.test(nick)||
   !Number.isSafeInteger(offset)||offset<0||
   !Number.isSafeInteger(limite)||limite<1||limite>30)
   falhar('RELATORIO_COMERCIAL_PARAMETRO_INVALIDO');
  verificar();consistencia();
  const conta=identidade().get(nick);
  if(!conta)falhar('CADASTRO_NAO_LOCALIZADO');
  const t=linhasTotal().get(conta.id);
  const itens=linhasLista().all(conta.id,limite,offset);
  if(![t.totalLinhas,t.unidades].every(x=>Number.isSafeInteger(x)&&x>=0)||
   !Array.isArray(itens)||itens.length>limite||
   itens.some(x=>!Number.isSafeInteger(x.quantidade)||x.quantidade<1))
   falhar('RELATORIO_COMERCIAL_ITENS_INCONSISTENTES');
  return {fonte:'SQLITE_COMERCIAL_REAL',nick:nick.toLowerCase(),
   totalLinhas:t.totalLinhas,totalUnidades:t.unidades,
   ...resumoUnidades(conta.id),...resumoAvulsas(conta.id),
   // O livro registra id/status, NAO meio (PIX/cartao/boleto).
   // Nunca inferir o meio de pagamento pelo identificador do PSP.
   itens:itens.map(item=>({...item,formaPagamento:null})),
   offset,limite,temMais:offset+itens.length<t.totalLinhas,
   somentePedidosAprovados:true,somenteLeitura:true};
 }
 function comprasAvulsasDoCadastro({nick,offset=0,limite=30}={}){
  if(typeof nick!=='string'||!/^[a-zA-Z]{1,12}$/.test(nick)||
     !Number.isSafeInteger(offset)||offset<0||
     !Number.isSafeInteger(limite)||limite<1||limite>30)
   falhar('RELATORIO_COMERCIAL_PARAMETRO_INVALIDO');
  verificar();consistencia();
  const conta=identidade().get(nick);
  if(!conta)falhar('CADASTRO_NAO_LOCALIZADO');
  const resumo=resumoAvulsas(conta.id);
  if(!resumo.classificacaoAvulsasDisponivel)
   return {fonte:'SQLITE_COMERCIAL_REAL',nick:nick.toLowerCase(),
    ...resumo,itens:[],offset,limite,temMais:false,somenteLeitura:true};
  const itens=linhasAvulsas().all(conta.id,limite,offset);
  if(!Array.isArray(itens)||itens.length>limite||itens.some(x=>
    !Number.isSafeInteger(x.quantidade)||x.quantidade<1||
    !Number.isSafeInteger(x.precoUnitCentavos)||x.precoUnitCentavos<1))
   falhar('RELATORIO_COMERCIAL_AVULSAS_INCONSISTENTES');
  return {fonte:'SQLITE_COMERCIAL_REAL',nick:nick.toLowerCase(),
   ...resumo,itens:itens.map(x=>({...x,cor:'CINZA',
    // Metodo nao consta na tabela de pedidos: status e referencia sao reais.
    formaPagamento:null})),
   offset,limite,temMais:offset+itens.length<resumo.totalLinhasAvulsas,
   somenteLeitura:true,criterioAvulsa:'ITEM_CINZA_FOTOGRAFADO_NO_PEDIDO'};
 }
 return Object.freeze({indicadores,comprasDoCadastro,comprasAvulsasDoCadastro});
}
module.exports={criarRelatorioClientesProdutosOperador};
