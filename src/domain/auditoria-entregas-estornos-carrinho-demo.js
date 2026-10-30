'use strict';

// Diagnostico operacional cruzado APENAS de laboratorio.
// Distingue sinal de estorno/confirmacao de direito em fila, comissao e
// entrega. Nao cancela posicoes, estorna dinheiro ou chama fornecedor.
function auditarEntregasEstornosCarrinhoDemo({carrinhos}={}){
 if(!carrinhos?.banco||!carrinhos?.ponte||
    carrinhos.ponte.banco!==carrinhos.banco||
    typeof carrinhos.listar!=='function'){
  throw new TypeError('Carrinho e ponte com SQLite compartilhado obrigatorios');
 }
 const banco=carrinhos.banco;
 const buscarCompra=banco.prepare(
  'SELECT posicao_id AS posicaoId FROM admin_ponte_compras_demo WHERE pedido_id=?'
 );
 const buscarAdicionais=banco.prepare(
  'SELECT posicao_id AS posicaoId FROM admin_ponte_posicoes_adicionais_demo WHERE pedido_id=? ORDER BY ordem'
 );
 const buscarLoja=banco.prepare(`
  SELECT pedido_id FROM admin_ponte_vendas_loja_sem_loop_demo WHERE pedido_id=?
  UNION ALL SELECT pedido_id FROM admin_ponte_vendas_loja_apos_reajuste_demo WHERE pedido_id=?
 `);
 const buscarConvite=banco.prepare(
  'SELECT 1 FROM admin_ponte_convites_validados_demo WHERE pedido_id=?'
 );
 const buscarComissoes=banco.prepare(`
  SELECT COUNT(*) AS total,COALESCE(SUM(valor_centavos),0) AS valor
  FROM (
   SELECT valor_comissao_centavos AS valor_centavos FROM admin_comissoes_indicacoes_demo WHERE pedido_id=?
   UNION ALL
   SELECT valor_comissao_centavos AS valor_centavos FROM admin_comissoes_indicacoes_v2_demo WHERE pedido_id=?
  )
 `);
 const pedidos=carrinhos.listar().pedidos;
 const relatorios=[];
 const totais={
  pedidos:0,aguardandoFicticio:0,confirmadosFicticios:0,estornadosFicticios:0,
  pedidosFisicos:0,pedidosFisicosAguardandoIntegracao:0,
  estornadosComPosicao:0,estornadosComComissao:0,estornadosComConvite:0,
  confirmacoesSemConciliacao:0,pedidosComAlertas:0,
  valorBrutoEstornadoFicticioCentavos:0
 };
 const somar=(atual,valor)=>{
  if(!Number.isSafeInteger(valor)||valor<0||!Number.isSafeInteger(atual+valor))
   throw new Error('Total ficticio nao representavel');
  return atual+valor;
 };
 for(const p of pedidos){
  const compra=buscarCompra.get(p.pedidoId);
  const posicoes=compra?[compra.posicaoId,
   ...buscarAdicionais.all(p.pedidoId).map(x=>x.posicaoId)]:[];
  const vendaLoja=!!buscarLoja.get(p.pedidoId,p.pedidoId);
  const conviteRegistrado=!!buscarConvite.get(p.pedidoId);
  const comissoes=buscarComissoes.get(p.pedidoId,p.pedidoId);
  const temFisico=p.itens.some(i=>i.tipo==='FISICO');
  const temPDF=p.itens.some(i=>i.tipo==='PDF');
  const estado=p.situacaoPagamentoFicticio;
  const estornado=estado==='ESTORNADO_FICTICIO';
  const confirmado=estado==='CONFIRMADO_FICTICIO';
  const aguardando=estado==='AGUARDANDO_FICTICIO';
  if(![estornado,confirmado,aguardando].some(Boolean))
   throw new Error('Estado de pagamento de carrinho desconhecido');
  const alertas=[];
  const pendencias=[];
  if(estornado){
   totais.estornadosFicticios++;
   totais.valorBrutoEstornadoFicticioCentavos=somar(
    totais.valorBrutoEstornadoFicticioCentavos,p.totalCentavos);
   if(posicoes.length){
    totais.estornadosComPosicao++;
    alertas.push('ESTORNO_COM_POSICAO_PRESERVADA');
   }
   if(comissoes.total){
    totais.estornadosComComissao++;
    alertas.push('ESTORNO_COM_COMISSAO_JA_PROVISIONADA');
   }
   if(conviteRegistrado){
    totais.estornadosComConvite++;
    alertas.push('ESTORNO_COM_INDICACAO_VALIDADA');
   }
   if(vendaLoja)alertas.push('ESTORNO_COM_VENDA_SOMENTE_LOJA_REGISTRADA');
  }else if(confirmado){
   totais.confirmadosFicticios++;
   if(!posicoes.length&&!vendaLoja){
    totais.confirmacoesSemConciliacao++;
    alertas.push('CONFIRMACAO_SEM_CONCILIACAO_NA_PONTE');
   }
  }else totais.aguardandoFicticio++;
  if(aguardando&&(posicoes.length||vendaLoja||comissoes.total||conviteRegistrado))
   alertas.push('PEDIDO_AGUARDANDO_COM_EFEITO_NO_MOTOR');
  if(temFisico){
   totais.pedidosFisicos++;
   if(estado!=='ESTORNADO_FICTICIO'){
    totais.pedidosFisicosAguardandoIntegracao++;
    pendencias.push('ENTREGA_FISICA_SEM_VINCULO_LOGISTICO_REAL');
   }
  }
  if(alertas.length)totais.pedidosComAlertas++;
  totais.pedidos++;
  relatorios.push({
   pedidoId:p.pedidoId,situacaoPagamentoFicticio:estado,
   totalCongeladoCentavos:p.totalCentavos,
   itensFisicos:temFisico,itensPDF:temPDF,
   posicoesIds:posicoes,quantidadePosicoes:posicoes.length,
   vendaSomenteLojaRegistrada:vendaLoja,
   conviteValidado:conviteRegistrado,
   quantidadeComissoesProvisionadas:comissoes.total,
   comissoesProvisionadasCentavos:comissoes.valor,
   alertas,pendencias,
   exigeRevisaoOperacional:alertas.length>0,
   fornecedorRealAcionado:false,
   entregaFisicaRealComprovada:false,
   reembolsoRealComprovado:false,
   direitosDoConsumidorPreservadosParaAnalise:true
  });
 }
 return {
  modo:'AUDITORIA_CARRINHO_ENTREGAS_ESTORNOS_FICTICIOS',
  situacao:totais.pedidosComAlertas?'EXIGE_REVISAO':'SEM_ALERTAS_DE_CONCILIACAO',
  totais,relatorios,
  creditoDeCaixaRealGerado:false,
  reembolsoRealExecutado:false,
  nenhumDireitoCanceladoAutomaticamente:true,
  fornecedorRealNaoAcionado:true,
  entregaRealNaoComprovada:true,
  pagamentoRealNaoComprovado:true,
  reconciliacaoExternaNaoRealizada:true,
  somenteLeitura:true,
  semDadosPessoaisNoRelatorio:true
 };
}
module.exports={auditarEntregasEstornosCarrinhoDemo};
