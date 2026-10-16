'use strict';

// Unifica pedidos reais do MOTOR FICTICIO e pedidos pendentes do carrinho,
// sem consultar outras contas. Nunca confirma pagamento ou altera posicoes.
const ESTADOS=Object.freeze({
 AGUARDANDO:'AGUARDANDO_CONFIRMACAO',
 AZUL:'AGUARDANDO_ATIVACAO',
 VERMELHO:'POSICAO_ATIVADA',
 DOURADO:'POSICAO_DOURADA_LOOP',
 SIMPLES:'COMPRA_SEM_POSICAO',
 ESTORNO:'ESTORNO_EM_CONFERENCIA',
 CONFERIR:'SINCRONIZACAO_PENDENTE'
});
function montarHistoricoLojaDemo({visao,carrinhos}={}){
 if(!visao||!Array.isArray(visao.compras)||
   !Array.isArray(visao.comprasLojaSemLoop)||!Array.isArray(carrinhos))
  throw new TypeError('Historico pessoal e carrinhos validos obrigatorios');
 const pessoais=new Map(visao.posicoes.map(p=>[p.posicaoId,p]));
 const douradas=new Set([
  visao.mapaCores.tabuleiro.centro,
  ...visao.mapaCores.tabuleiro.vagas
 ].filter(p=>p?.cor==='DOURADO').map(p=>p.posicaoId));
 const porId=new Map();
 function estadoPosicao(posicaoId){
  const pessoal=pessoais.get(posicaoId);
  if(pessoal?.statusAdesao==='PENDENTE')return ESTADOS.AZUL;
  if(pessoal)return ESTADOS.VERMELHO;
  if(douradas.has(posicaoId))return ESTADOS.DOURADO;
  return ESTADOS.CONFERIR;
 }
 function salvar(registro){
  if(porId.has(registro.pedidoId))
   throw new Error('Pedido aparece duplicado no historico individual');
  porId.set(registro.pedidoId,registro);
 }
 const legados=new Map();
 for(const pedido of visao.compras){
  legados.set(pedido.pedidoId,{
   pedidoId:pedido.pedidoId,valorCentavos:pedido.valorCentavos,
   posicaoId:pedido.posicaoId,
   posicaoIds:pedido.posicaoIds||[pedido.posicaoId],
   estado:(pedido.posicaoIds||[pedido.posicaoId]).map(estadoPosicao).find(x=>x===ESTADOS.AZUL)
    ||(pedido.posicaoIds||[pedido.posicaoId]).map(estadoPosicao).find(x=>x===ESTADOS.VERMELHO)
    ||estadoPosicao(pedido.posicaoId),
   confirmadoEm:pedido.confirmadoEm
  });
 }
 for(const pedido of visao.comprasLojaSemLoop){
  if(legados.has(pedido.pedidoId))
   throw new Error('Pedido possui duas classificacoes da ponte');
  legados.set(pedido.pedidoId,{
   pedidoId:pedido.pedidoId,valorCentavos:pedido.valorCentavos,
   posicaoId:null,estado:ESTADOS.SIMPLES,
   confirmadoEm:pedido.confirmadoEm
  });
 }
 for(const p of carrinhos){
  if(typeof p.pedidoId!=='string'||!Array.isArray(p.itens)||
   !Number.isSafeInteger(p.totalCentavos)||p.totalCentavos<=0)
   throw new TypeError('Pedido de loja invalido');
  const confirmacao=legados.get(p.pedidoId);
  if(confirmacao&&confirmacao.valorCentavos!==p.totalCentavos)
   throw new Error('Total de loja e ponte divergente');
  let estado=ESTADOS.AGUARDANDO;
  if(p.situacaoPagamentoFicticio==='ESTORNADO_FICTICIO')estado=ESTADOS.ESTORNO;
  else if(confirmacao)estado=confirmacao.estado;
  else if(p.situacaoPagamentoFicticio==='CONFIRMADO_FICTICIO')
   estado=ESTADOS.CONFERIR;
  salvar({
   pedidoId:p.pedidoId,origem:'CARRINHO',
   valorCentavos:p.totalCentavos,
   itens:p.itens.map(i=>({
    nome:i.nome,quantidade:i.quantidade,subtotalCentavos:i.subtotalCentavos
   })),
   estado,posicaoId:confirmacao?.posicaoId??null,
   posicaoIds:confirmacao?.posicaoIds??[],
   registradoEm:p.criadoEm
  });
  legados.delete(p.pedidoId);
 }
 for(const p of legados.values())salvar({
  pedidoId:p.pedidoId,origem:'COMPRA_INDIVIDUAL',
  valorCentavos:p.valorCentavos,itens:[],
  estado:p.estado,posicaoId:p.posicaoId,
  posicaoIds:p.posicaoIds??[],registradoEm:p.confirmadoEm
 });
 const pedidos=[...porId.values()].sort((a,b)=>
  String(b.registradoEm).localeCompare(String(a.registradoEm))||
  a.pedidoId.localeCompare(b.pedidoId));
 const contagens={
  total:pedidos.length,
  aguardandoConfirmacao:pedidos.filter(p=>p.estado===ESTADOS.AGUARDANDO).length,
  aguardandoAtivacao:pedidos.filter(p=>p.estado===ESTADOS.AZUL).length,
  comPosicaoAtivada:pedidos.filter(p=>p.estado===ESTADOS.VERMELHO).length,
  posicoesDouradas:pedidos.filter(p=>p.estado===ESTADOS.DOURADO).length,
  somenteLoja:pedidos.filter(p=>p.estado===ESTADOS.SIMPLES).length,
  emConferencia:pedidos.filter(p=>[ESTADOS.CONFERIR,ESTADOS.ESTORNO].includes(p.estado)).length
 };
 return {pedidos,contagens,pagamentosReais:false,somenteDoTitular:true};
}
module.exports={montarHistoricoLojaDemo,ESTADOS};
