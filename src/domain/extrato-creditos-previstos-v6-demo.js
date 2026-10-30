'use strict';

// Fonte exclusiva: ciclos V6 concluidos do snapshot validado da ponte e seis
// compras demonstrativas confirmadas no SQLite por fonte confiavel de teste.
// Nenhum saldo sacavel, Pix, transferencia ou ajuste de reservas.
const {cofreDoEvento,centroDoLoop}=require('./destino-financeiro-centro-loop');

function extratoCentrosPrevistosV6({ponte,contas,contaId}={}){
  if(!ponte||!contas||!ponte.banco||typeof ponte._restaurar!=='function')
    throw new TypeError('Ponte e contas de teste obrigatorias');
  if(typeof contaId!=='string'||!contas.buscar(contaId))
    return null;
  const banco=ponte.banco;
  const sim=ponte._restaurar();
  const centros=sim.tabuleiro.ciclosConcluidos;
  const buscarOrigem=banco.prepare([
    'SELECT c.conta_id AS contaId,v.valor_referencia_centavos AS referencia',
    'FROM admin_ponte_compras_demo c',
    'JOIN admin_ponte_posicoes_valores_demo v ON v.pedido_id=c.pedido_id',
    'WHERE c.conta_id=? AND',
    '(c.posicao_id=? OR EXISTS (',
    'SELECT 1 FROM admin_ponte_posicoes_adicionais_demo p',
    'WHERE p.pedido_id=c.pedido_id AND p.posicao_id=?))'
  ].join(' '));
  const compraVigente=banco.prepare([
    'SELECT c.pedido_id AS pedidoId FROM admin_ponte_compras_demo c',
    'WHERE c.pedido_id=? AND c.valor_centavos>0'
  ].join(' '));
  const entradas=[];
  const eventosUsados=new Set();
  for(const ciclo of centros){
    // Historicos migrados de cinco eventos V5 nao geram credito V6.
    if(!Array.isArray(ciclo.vendas)||ciclo.vendas.length!==6)continue;
    const centro=ciclo.centro;
    if(!centro)throw new Error('Credito previsto: centro ausente');
    const vendas=ciclo.vendas;
    for(let i=0;i<6;i++){
      const v=vendas[i];
      if(!v||typeof v.vendaId!=='string'||
        !v.vendaId.startsWith('compra-demo-')||
        v.ciclo!==ciclo.ciclo||v.posicaoCentroId!==centro.id||
        v.ordem!==i+1||v.destinoCofre!==cofreDoEvento({posicaoCentro:centro,ordem:i+1}))
        throw new Error('Credito previsto: historico de eventos divergente');
      const pedido=v.vendaId.slice('compra-demo-'.length);
      if(!compraVigente.get(pedido)||
         eventosUsados.has(v.vendaId))
        throw new Error('Credito previsto: evento sem compra verificada ou duplicado');
      eventosUsados.add(v.vendaId);
    }
    if(centroDoLoop(centro)||centro.participanteId!==contaId||
      centro.statusAdesao==='PENDENTE')continue;
    const origem=buscarOrigem.all(contaId,centro.id,centro.id);
    if(origem.length!==1||!Number.isSafeInteger(origem[0].referencia)||
      origem[0].referencia<=0)
      throw new Error('Credito previsto: titular ou referencia da posicao invalida');
    const valor=origem[0].referencia;
    const parcelas=[1,3,5].map(ordem=>({
      ordem,valorPrevistoCentavos:valor,
      destino:'LOOP_CENTRO',situacao:'PREVISTO_NAO_SACAVEL'
    }));
    entradas.push({
      cicloNumero:ciclo.ciclo,posicaoCentroId:centro.id,
      concluidoEm:ciclo.concluidoEm,
      parcelas,valorPrevistoCentavos:valor*3,
      situacao:'PREVISTO_AGUARDANDO_LIQUIDACAO_CONCILIACAO_E_ANALISE_JURIDICA'
    });
  }
  const total=entradas.reduce((s,x)=>s+x.valorPrevistoCentavos,0);
  return {
    modo:'EXTRATO_FICTICIO_CICLOS_VALIDOS_V6',
    creditoPrevistoCentavos:total,
    disponivelParaSaqueCentavos:0,
    liquidadoCentavos:0,
    transferidoCentavos:0,
    quantidadeCiclos:entradas.length,
    historico:entradas,
    naoEquivaleSaldoReal:true,
    naoAutorizaSaque:true,
    origem:'CICLOS_COMPLETOS_DA_PONTE_COM_COMPRAS_CONFIRMADAS_SOMENTE_EM_TESTE'
  };
}
module.exports={extratoCentrosPrevistosV6};
