'use strict';
// Consultas do OPERADOR sobre cadastros e vendas comerciais do mesmo SQLite.
// Nao escreve, nao cria pedido, nao movimenta fila, catraca ou financeiro.
function falhar(codigo){const erro=new Error(codigo);erro.codigo=codigo;throw erro;}
function criarRelatorioClientesProdutosOperador({banco}={}){
 if(typeof banco?.prepare!=='function')falhar('RELATORIO_COMERCIAL_BANCO_INVALIDO');
 const obrigatorias=['loop_real_contas','loja_real_pedidos',
  'loja_real_custos_pedido','loja_real_produtos'];
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
 const totalClientes=banco.prepare(
  'SELECT COUNT(*) AS total FROM loop_real_contas');
 const sumario=banco.prepare([
  'SELECT COUNT(DISTINCT p.pedido_id) AS pedidos,',
  'COALESCE(SUM(s.quantidade),0) AS unidades,',
  'COUNT(DISTINCT p.titular_id) AS compradores',
  linhaVenda
 ].join(' '));
 const pedidosAprovados=banco.prepare(
  "SELECT COUNT(*) AS n FROM loja_real_pedidos WHERE status='APROVADO_PARA_EXPEDICAO'");
 const pedidosSemItens=banco.prepare([
  'SELECT COUNT(*) AS n FROM loja_real_pedidos p',
  "WHERE p.status='APROVADO_PARA_EXPEDICAO'",
  'AND (p.pagamento_id IS NULL OR NOT EXISTS',
  '(SELECT 1 FROM loja_real_custos_pedido c WHERE c.pedido_id=p.pedido_id))'
 ].join(' '));
 function consistencia(){
  if(pedidosSemItens.get().n!==0)falhar('RELATORIO_COMERCIAL_PEDIDO_INCOMPLETO');
 }
 function indicadores(){
  verificar();consistencia();
  const clientes=totalClientes.get().total;
  const s=sumario.get();
  if(![clientes,s.pedidos,s.unidades,s.compradores,pedidosAprovados.get().n]
   .every(x=>Number.isSafeInteger(x)&&x>=0)||
   s.pedidos!==pedidosAprovados.get().n)
   falhar('RELATORIO_COMERCIAL_CONTAGEM_INCONSISTENTE');
  return {fonte:'SQLITE_COMERCIAL_REAL',totalClientes:clientes,
   totalProdutosVendidos:s.unidades,totalPedidosAprovados:s.pedidos,
   totalClientesCompradores:s.compradores,
   criterio:'UNIDADES_DE_PEDIDOS_COM_PAGAMENTO_APROVADO',
   contabilizaPosicoesComoProduto:false,somenteLeitura:true};
 }
 const identidade=banco.prepare('SELECT id FROM loop_real_contas WHERE nick=? COLLATE NOCASE');
 const linhasTotal=banco.prepare([
  'SELECT COUNT(*) AS totalLinhas,COALESCE(SUM(s.quantidade),0) AS unidades',
  'FROM loja_real_pedidos p',
  'JOIN loja_real_custos_pedido s ON s.pedido_id=p.pedido_id',
  'WHERE p.titular_id=? AND '+aprovados
 ].join(' '));
 const linhasLista=banco.prepare([
  'SELECT p.pedido_id AS pedidoId,p.criado_em AS criadoEm,',
  's.produto_id AS produtoId,s.sku AS sku,s.fornecedor_id AS fornecedorId,',
  's.quantidade AS quantidade,s.preco_unit_centavos AS precoUnitCentavos,',
  'pr.titulo AS titulo',
  'FROM loja_real_pedidos p',
  'JOIN loja_real_custos_pedido s ON s.pedido_id=p.pedido_id',
  'LEFT JOIN loja_real_produtos pr ON pr.produto_id=s.produto_id',
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
  const conta=identidade.get(nick);
  if(!conta)falhar('CADASTRO_NAO_LOCALIZADO');
  const t=linhasTotal.get(conta.id);
  const itens=linhasLista.all(conta.id,limite,offset);
  if(![t.totalLinhas,t.unidades].every(x=>Number.isSafeInteger(x)&&x>=0)||
   !Array.isArray(itens)||itens.length>limite||
   itens.some(x=>!Number.isSafeInteger(x.quantidade)||x.quantidade<1))
   falhar('RELATORIO_COMERCIAL_ITENS_INCONSISTENTES');
  return {fonte:'SQLITE_COMERCIAL_REAL',nick:nick.toLowerCase(),
   totalLinhas:t.totalLinhas,totalUnidades:t.unidades,
   itens,offset,limite,temMais:offset+itens.length<t.totalLinhas,
   somentePedidosAprovados:true,somenteLeitura:true};
 }
 return Object.freeze({indicadores,comprasDoCadastro});
}
module.exports={criarRelatorioClientesProdutosOperador};
