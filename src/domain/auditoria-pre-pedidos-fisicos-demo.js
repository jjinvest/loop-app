'use strict';

// Auditoria somente de LEITURA de pre-pedidos e eventos de pagamento
// FICTICIOS. Nao e conciliacao bancaria, autorizacao de fornecedor,
// repasse, criacao de posicao nem prova de recebimento.
const {TIPOS}=require('./pagamentos-pre-pedidos-fisicos-demo-sqlite');
function adicionar(total,valor){
 const proximo=total+valor;
 if(!Number.isSafeInteger(proximo))throw new RangeError('Total ficticio excede o limite seguro');
 return proximo;
}
function auditarPrePedidosFisicosDemo({planejamento,pagamentos}={}){
 if(!planejamento?.banco||planejamento.banco!==pagamentos?.banco){
  throw new TypeError('Planejamento e pagamentos precisam da mesma base SQLite');
 }
 const pedidos=planejamento.listarPrePedidos().pedidos;
 const eventos=planejamento.banco.prepare(`
  SELECT sequencia,evento_id AS eventoId,pedido_id AS pedidoId,
   pagamento_intento_teste_id AS pagamentoIntentoTesteId,
   tipo,valor_centavos AS valorCentavos,registrado_em AS registradoEm
  FROM admin_pre_pedidos_pagamentos_eventos_demo ORDER BY sequencia
 `).all();
 const porPedido=new Map(pedidos.map(p=>[p.pedidoId,[]]));
 const orfaos=[];
 for(const evento of eventos){
  if(porPedido.has(evento.pedidoId))porPedido.get(evento.pedidoId).push(evento);
  else orfaos.push({pedidoId:evento.pedidoId,eventoId:evento.eventoId,
   problema:'EVENTO_SEM_PRE_PEDIDO'});
 }
 const totais={
  quantidadePrePedidos:pedidos.length,quantidadeEventosFicticios:eventos.length,
  aguardando:0,confirmados:0,estornados:0,divergentes:0,
  valorTotalPrePedidosCentavos:0,valorAguardandoCentavos:0,
  valorConfirmadoFicticioCentavos:0,valorEstornadoFicticioCentavos:0,
  valorDivergenteCentavos:0
 };
 const fornecedores=new Map();
 const conferencias=pedidos.map(pedido=>{
  const grupo=porPedido.get(pedido.pedidoId);
  const problemas=[];
  const valoresConferem=grupo.every(e=>e.valorCentavos===pedido.precoCatalogoCentavos);
  const referenciasConferem=grupo.every(e=>
   e.pagamentoIntentoTesteId===pedido.pagamentoIntentoTesteId);
  if(!valoresConferem)problemas.push('VALOR_DIVERGENTE_DO_SNAPSHOT');
  if(!referenciasConferem)problemas.push('INTENCAO_DE_TESTE_DIVERGENTE');
  if(grupo.length>2)problemas.push('QUANTIDADE_DE_EVENTOS_INVALIDA');
  if(grupo.length>=1&&grupo[0].tipo!==TIPOS.CONFIRMAR){
   problemas.push('PRIMEIRO_EVENTO_NAO_E_CONFIRMACAO');
  }
  if(grupo.length===2&&grupo[1].tipo!==TIPOS.ESTORNAR){
   problemas.push('SEGUNDO_EVENTO_NAO_E_ESTORNO');
  }
  let estado;
  if(problemas.length)estado='DIVERGENTE_NO_TESTE';
  else if(grupo.length===0)estado='AGUARDANDO_FICTICIO';
  else if(grupo.length===1)estado='CONFIRMADO_FICTICIO';
  else estado='ESTORNADO_FICTICIO';
  const campo=estado==='AGUARDANDO_FICTICIO'?'valorAguardandoCentavos':
   estado==='CONFIRMADO_FICTICIO'?'valorConfirmadoFicticioCentavos':
   estado==='ESTORNADO_FICTICIO'?'valorEstornadoFicticioCentavos':
   'valorDivergenteCentavos';
  const contador=estado==='AGUARDANDO_FICTICIO'?'aguardando':
   estado==='CONFIRMADO_FICTICIO'?'confirmados':
   estado==='ESTORNADO_FICTICIO'?'estornados':'divergentes';
  totais[contador]++;
  totais[campo]=adicionar(totais[campo],pedido.precoCatalogoCentavos);
  totais.valorTotalPrePedidosCentavos=adicionar(
   totais.valorTotalPrePedidosCentavos,pedido.precoCatalogoCentavos);
  // Os fornecedores sao identificados pelo snapshot da compra, nunca
  // pelo vinculo atualmente cadastrado para um produto.
  let fornecedor=fornecedores.get(pedido.fornecedorId);
  if(!fornecedor){
   fornecedor={
    fornecedorId:pedido.fornecedorId,prePedidos:0,aguardando:0,
    confirmados:0,estornados:0,divergentes:0,
    valorPrePedidosFicticiosCentavos:0,
    custoFornecedorTesteTotalCentavos:0,
    valorConfirmadoFicticioCentavos:0,
    custoTesteConfirmadoCentavos:0,
    valorEstornadoFicticioCentavos:0,
    fornecedorLiberado:false,repasseEfetuado:false,obrigacaoRealConstituida:false
   };
   fornecedores.set(pedido.fornecedorId,fornecedor);
  }
  fornecedor.prePedidos++;
  fornecedor[contador]++;
  fornecedor.valorPrePedidosFicticiosCentavos=adicionar(
   fornecedor.valorPrePedidosFicticiosCentavos,pedido.precoCatalogoCentavos);
  fornecedor.custoFornecedorTesteTotalCentavos=adicionar(
   fornecedor.custoFornecedorTesteTotalCentavos,pedido.custoFornecedorTesteCentavos);
  if(estado==='CONFIRMADO_FICTICIO'){
   fornecedor.valorConfirmadoFicticioCentavos=adicionar(
    fornecedor.valorConfirmadoFicticioCentavos,pedido.precoCatalogoCentavos);
   fornecedor.custoTesteConfirmadoCentavos=adicionar(
    fornecedor.custoTesteConfirmadoCentavos,pedido.custoFornecedorTesteCentavos);
  }
  if(estado==='ESTORNADO_FICTICIO'){
   fornecedor.valorEstornadoFicticioCentavos=adicionar(
    fornecedor.valorEstornadoFicticioCentavos,pedido.precoCatalogoCentavos);
  }
  return {
   pedidoId:pedido.pedidoId,pagamentoIntentoTesteId:pedido.pagamentoIntentoTesteId,
   produtoId:pedido.produtoId,fornecedorIdSnapshot:pedido.fornecedorId,
   precoSnapshotCentavos:pedido.precoCatalogoCentavos,
   eventosRegistrados:grupo.length,estado,problemas,
   fornecedorBloqueado:true,filaMovimentada:false,cofresReaisMovimentados:false
  };
 });
 return {
  modo:'AUDITORIA_PRE_PEDIDOS_FISICOS_SOMENTE_LABORATORIO',
  integridade:totais.divergentes===0&&orfaos.length===0?
   'CONFERIDO_NO_TESTE':'DIVERGENCIAS_ENCONTRADAS',
  totais,conferencias,eventosOrfaos:orfaos,
  resumoPorFornecedor:[...fornecedores.values()].sort((a,b)=>a.fornecedorId.localeCompare(b.fornecedorId)),
  repassesReaisAFornecedores:0,
  conciliacaoBancariaReal:false,confirmacaoPSPReal:false,
  autorizacaoFornecedor:false,liberacaoLogistica:false,
  distribuicaoCofres:false,geracaoDePosicoes:false,
  movimentacaoCatraca:false,operacaoSomenteLeitura:true
 };
}
module.exports={auditarPrePedidosFisicosDemo};
